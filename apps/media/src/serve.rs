//! The streams, behind sealed links. A link names one video's folder and
//! an expiry; every playlist, segment and picture under that folder is
//! served to whoever holds it, and nothing else. No cookie is read or set,
//! and any origin may read, since players fetch across origins.

use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::Router;
use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use object_store::path::Path as Key;
use object_store::{GetOptions, GetRange, ObjectStore};
use tower_http::cors::{Any, CorsLayer};

use crate::seal;

#[derive(Clone)]
pub struct Streams {
  pub store: Arc<dyn ObjectStore>,
  pub key: [u8; 32],
}

pub fn router(streams: Streams) -> Router {
  Router::new()
    .route("/health", get(|| async { "ok" }))
    .route("/v/{token}/{*path}", get(stream).head(stream))
    .layer(
      CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::HEAD])
        .allow_headers([header::RANGE])
        .expose_headers([header::CONTENT_RANGE, header::CONTENT_LENGTH, header::ACCEPT_RANGES]),
    )
    .with_state(streams)
}

/// The only folders a link may name: one video's streams in one school.
fn is_stream_folder(prefix: &str) -> bool {
  let parts: Vec<&str> = prefix.split('/').collect();
  let uuid = |part: &str| part.len() == 36 && part.bytes().all(|byte| byte.is_ascii_hexdigit() || byte == b'-');
  matches!(parts.as_slice(), ["t", school, "v", video] if uuid(school) && uuid(video))
}

/// A file inside the folder: plain names, at most two levels down.
fn is_inside(path: &str) -> bool {
  let parts: Vec<&str> = path.split('/').collect();
  parts.len() <= 3
    && parts.iter().all(|part| {
      !part.is_empty()
        && !part.starts_with('.')
        && part
          .bytes()
          .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    })
}

fn content_type(path: &str) -> &'static str {
  match path.rsplit('.').next() {
    Some("m3u8") => "application/vnd.apple.mpegurl",
    Some("m4s") => "video/iso.segment",
    Some("mp4") => "video/mp4",
    Some("jpg") => "image/jpeg",
    Some("vtt") => "text/vtt; charset=utf-8",
    _ => "application/octet-stream",
  }
}

/// `bytes=a-b`, `bytes=a-` or `bytes=-n`; anything else plays the whole file.
fn range_of(headers: &HeaderMap) -> Option<GetRange> {
  let value = headers.get(header::RANGE)?.to_str().ok()?.strip_prefix("bytes=")?;
  let (start, end) = value.split_once('-')?;
  match (start.parse::<u64>().ok(), end.parse::<u64>().ok()) {
    (Some(start), Some(end)) if end >= start => Some(GetRange::Bounded(start..end + 1)),
    (Some(start), None) if end.is_empty() => Some(GetRange::Offset(start)),
    (None, Some(suffix)) if start.is_empty() && suffix > 0 => Some(GetRange::Suffix(suffix)),
    _ => None,
  }
}

fn now() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map_or(0, |since| since.as_secs())
}

async fn stream(
  State(streams): State<Streams>,
  Path((token, path)): Path<(String, String)>,
  method: Method,
  headers: HeaderMap,
) -> Response {
  let Some(grant) = seal::open(&streams.key, &token, now()) else {
    return StatusCode::NOT_FOUND.into_response();
  };
  if !is_stream_folder(&grant.prefix) || !is_inside(&path) {
    return StatusCode::NOT_FOUND.into_response();
  }
  let key = Key::from(format!("{}/{path}", grant.prefix));
  let range = range_of(&headers);
  let options = GetOptions {
    range: range.clone(),
    head: method == Method::HEAD,
    ..GetOptions::default()
  };
  let found = match streams.store.get_opts(&key, options).await {
    Ok(found) => found,
    Err(object_store::Error::NotFound { .. }) => return StatusCode::NOT_FOUND.into_response(),
    Err(error) => {
      tracing::warn!(%error, "a stream could not be read");
      return StatusCode::BAD_GATEWAY.into_response();
    },
  };
  let size = found.meta.size;
  let served = found.range.clone();
  let body = if method == Method::HEAD {
    Body::empty()
  } else {
    Body::from_stream(found.into_stream())
  };
  let mut response = Response::new(body);
  let headers = response.headers_mut();
  headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type(&path)));
  headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
  headers.insert(header::X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
  headers.insert(header::REFERRER_POLICY, HeaderValue::from_static("no-referrer"));
  headers.insert("cross-origin-resource-policy", HeaderValue::from_static("cross-origin"));
  // A finished video never changes; its link is what expires.
  headers.insert(
    header::CACHE_CONTROL,
    HeaderValue::from_static("private, max-age=3600, immutable"),
  );
  if let Ok(length) = HeaderValue::from_str(&(served.end - served.start).to_string()) {
    headers.insert(header::CONTENT_LENGTH, length);
  }
  if range.is_some() {
    if let Ok(value) = HeaderValue::from_str(&format!(
      "bytes {}-{}/{size}",
      served.start,
      served.end.saturating_sub(1)
    )) {
      headers.insert(header::CONTENT_RANGE, value);
    }
    *response.status_mut() = StatusCode::PARTIAL_CONTENT;
  }
  response
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn a_link_names_one_videos_folder_and_files_inside_it() {
    assert!(is_stream_folder(
      "t/0b8f6a52-1c7e-4f4e-9a3a-2f6f1d2b9c11/v/5d1e7c2a-8b3f-4a6e-9c1d-7e2f3a4b5c6d"
    ));
    assert!(!is_stream_folder(
      "t/0b8f6a52-1c7e-4f4e-9a3a-2f6f1d2b9c11/f/5d1e7c2a-8b3f-4a6e-9c1d-7e2f3a4b5c6d"
    ));
    assert!(!is_stream_folder("t/../v/x"));
    assert!(is_inside("master.m3u8"));
    assert!(is_inside("720p/seg_0001.m4s"));
    assert!(is_inside("thumbs/sheet_001.jpg"));
    assert!(!is_inside("../f/other"));
    assert!(!is_inside("720p/../../secret"));
    assert!(!is_inside(".hidden"));
    assert!(!is_inside("a/b/c/d"));
  }

  #[test]
  fn reads_the_ranges_players_ask_for() {
    let with = |value: &str| {
      let mut headers = HeaderMap::new();
      headers.insert(
        header::RANGE,
        HeaderValue::from_str(value).unwrap_or_else(|_| HeaderValue::from_static("")),
      );
      range_of(&headers)
    };
    assert_eq!(with("bytes=0-99"), Some(GetRange::Bounded(0..100)));
    assert_eq!(with("bytes=100-"), Some(GetRange::Offset(100)));
    assert_eq!(with("bytes=-500"), Some(GetRange::Suffix(500)));
    assert_eq!(with("bytes=9-3"), None);
    assert_eq!(with("items=0-1"), None);
  }
}
