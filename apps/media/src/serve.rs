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
use object_store::{GetOptions, GetRange, ObjectStore, ObjectStoreExt};
use tower_http::cors::{Any, CorsLayer};

use crate::metrics::Metrics;
use crate::seal;

#[derive(Clone)]
pub struct Streams {
  pub store: Arc<dyn ObjectStore>,
  pub key: [u8; 32],
  pub metrics: Arc<Metrics>,
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

/// The service's counts, for a listener of their own: they say how busy a
/// school is, which is nobody's business on the address browsers reach.
pub fn metrics_router(metrics: Arc<Metrics>) -> Router {
  Router::new()
    .route(
      "/metrics",
      get(|State(metrics): State<Arc<Metrics>>| async move {
        (
          [(header::CONTENT_TYPE, "text/plain; version=0.0.4; charset=utf-8")],
          metrics.render(),
        )
      }),
    )
    .with_state(metrics)
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

/// Whether any byte of a file `size` long lies in `range`.
fn satisfiable(range: &GetRange, size: u64) -> bool {
  match range {
    GetRange::Bounded(range) => range.start < size,
    GetRange::Offset(start) => *start < size,
    GetRange::Suffix(_) => size > 0,
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
  let response = answer(&streams, &token, &path, &method, &headers).await;
  let bytes = response
    .headers()
    .get(header::CONTENT_LENGTH)
    .filter(|_| method != Method::HEAD)
    .and_then(|length| length.to_str().ok()?.parse().ok())
    .unwrap_or(0);
  streams.metrics.answered(response.status().as_u16(), bytes);
  response
}

async fn answer(streams: &Streams, token: &str, path: &str, method: &Method, headers: &HeaderMap) -> Response {
  let at = now();
  let Some(grant) = seal::open(&streams.key, token, at) else {
    return StatusCode::NOT_FOUND.into_response();
  };
  if !is_stream_folder(&grant.prefix) || !is_inside(path) {
    return StatusCode::NOT_FOUND.into_response();
  }
  let key = Key::from(format!("{}/{path}", grant.prefix));
  let range = range_of(headers);
  let options = GetOptions {
    range: range.clone(),
    head: method == Method::HEAD,
    ..GetOptions::default()
  };
  let found = match streams.store.get_opts(&key, options).await {
    Ok(found) => found,
    Err(object_store::Error::NotFound { .. }) => return StatusCode::NOT_FOUND.into_response(),
    Err(error) => {
      // A store says a range past a file's end in its own way, so the file
      // is asked what it weighs before the store is blamed.
      if let Some(range) = &range
        && let Ok(meta) = streams.store.head(&key).await
        && !satisfiable(range, meta.size)
      {
        let mut response = StatusCode::RANGE_NOT_SATISFIABLE.into_response();
        if let Ok(value) = HeaderValue::from_str(&format!("bytes */{}", meta.size)) {
          response.headers_mut().insert(header::CONTENT_RANGE, value);
        }
        return response;
      }
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
  headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type(path)));
  headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
  headers.insert(header::X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
  headers.insert(header::REFERRER_POLICY, HeaderValue::from_static("no-referrer"));
  headers.insert("cross-origin-resource-policy", HeaderValue::from_static("cross-origin"));
  // A finished video never changes, so a browser keeps what it fetched for
  // as long as the link it fetched it by opens anything.
  if let Ok(value) = HeaderValue::from_str(&format!(
    "private, max-age={}, immutable",
    grant.expires.saturating_sub(at)
  )) {
    headers.insert(header::CACHE_CONTROL, value);
  }
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

  fn link(prefix: &str, expires: u64) -> String {
    seal::seal_with(
      &[3; 32],
      &seal::Grant {
        prefix: prefix.into(),
        expires,
      },
      [5; 12],
    )
  }

  async fn ask(streams: &Streams, token: &str, path: &str, range: Option<&str>) -> Response {
    let mut headers = HeaderMap::new();
    if let Some(range) = range.and_then(|range| HeaderValue::from_str(range).ok()) {
      headers.insert(header::RANGE, range);
    }
    stream(
      State(streams.clone()),
      Path((token.to_string(), path.to_string())),
      Method::GET,
      headers,
    )
    .await
  }

  const FOLDER: &str = "t/0b8f6a52-1c7e-4f4e-9a3a-2f6f1d2b9c11/v/5d1e7c2a-8b3f-4a6e-9c1d-7e2f3a4b5c6d";

  #[tokio::test]
  async fn a_link_plays_its_folder_until_it_expires_and_is_kept_no_longer() -> anyhow::Result<()> {
    let store = Arc::new(object_store::memory::InMemory::new());
    store
      .put(
        &Key::from(format!("{FOLDER}/360p/seg_0000.m4s")),
        vec![1_u8; 1000].into(),
      )
      .await?;
    let streams = Streams {
      store,
      key: [3; 32],
      metrics: Arc::new(Metrics::default()),
    };
    let header_of = |response: &Response, name: header::HeaderName| {
      response
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
    };

    let whole = ask(&streams, &link(FOLDER, now() + 600), "360p/seg_0000.m4s", None).await;
    assert_eq!(whole.status(), StatusCode::OK);
    assert_eq!(header_of(&whole, header::CONTENT_LENGTH).as_deref(), Some("1000"));
    // Kept for as long as the link opens anything, give or take the second this took.
    let kept = header_of(&whole, header::CACHE_CONTROL).unwrap_or_default();
    assert!(
      ["private, max-age=600, immutable", "private, max-age=599, immutable"].contains(&kept.as_str()),
      "{kept}"
    );

    let part = ask(
      &streams,
      &link(FOLDER, now() + 600),
      "360p/seg_0000.m4s",
      Some("bytes=100-199"),
    )
    .await;
    assert_eq!(part.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(
      header_of(&part, header::CONTENT_RANGE).as_deref(),
      Some("bytes 100-199/1000")
    );

    let beyond = ask(
      &streams,
      &link(FOLDER, now() + 600),
      "360p/seg_0000.m4s",
      Some("bytes=5000-"),
    )
    .await;
    assert_eq!(beyond.status(), StatusCode::RANGE_NOT_SATISFIABLE);
    assert_eq!(
      header_of(&beyond, header::CONTENT_RANGE).as_deref(),
      Some("bytes */1000")
    );

    let expired = ask(&streams, &link(FOLDER, now() - 1), "360p/seg_0000.m4s", None).await;
    assert_eq!(expired.status(), StatusCode::NOT_FOUND);
    let missing = ask(&streams, &link(FOLDER, now() + 600), "360p/seg_0009.m4s", None).await;
    assert_eq!(missing.status(), StatusCode::NOT_FOUND);

    let counted = streams.metrics.render();
    for line in [
      "farida_media_stream_responses_total{status=\"200\"} 1",
      "farida_media_stream_responses_total{status=\"206\"} 1",
      "farida_media_stream_responses_total{status=\"416\"} 1",
      "farida_media_stream_responses_total{status=\"404\"} 2",
      "farida_media_stream_bytes_total 1100",
    ] {
      assert!(
        counted.lines().any(|found| found == line),
        "{line} is missing from:\n{counted}"
      );
    }
    Ok(())
  }
}
