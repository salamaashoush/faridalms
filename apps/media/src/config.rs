//! Settings from the environment. Storage is named exactly as the API names
//! it, so one set of variables serves both and they always read the same
//! bytes.

use std::env;
use std::path::PathBuf;

use anyhow::{Context, Result, bail};
use base64::Engine;
use base64::engine::general_purpose::STANDARD;

use crate::captions::Speech;
use crate::plan::Encoder;
use crate::transcode::Tools;

#[derive(Debug, Clone)]
pub enum Storage {
  Disk {
    root: PathBuf,
  },
  S3 {
    bucket: String,
    region: String,
    /// The bucket's own address when `virtual_hosted`, the service's otherwise.
    endpoint: Option<String>,
    virtual_hosted: bool,
    access_key_id: String,
    secret_access_key: String,
  },
}

#[derive(Debug, Clone)]
pub struct Config {
  pub host: String,
  pub port: u16,
  pub cell_secret: Vec<u8>,
  /// The API this service asks for work; none serves streams and encodes nothing.
  pub api_url: Option<String>,
  pub storage: Storage,
  /// Encodes at once; each takes several cores.
  pub jobs: usize,
  pub tools: Tools,
  /// Speech recognition for drafting captions; none drafts none.
  pub speech: Option<Speech>,
  /// Where sources and encodes wait while they are worked on.
  pub work_dir: PathBuf,
  /// Where the service's counts are served, for the machine's own monitor
  /// and never on the address browsers reach; none serves none.
  pub metrics: Option<String>,
}

fn var(name: &str) -> Option<String> {
  env::var(name).ok().filter(|value| !value.is_empty())
}

fn required(name: &str) -> Result<String> {
  var(name).with_context(|| format!("{name} must be set"))
}

/// The endpoint with the bucket as the first label of its host, which is how
/// the store's client is given a bucket reached in the virtual-hosted style.
fn bucket_endpoint(endpoint: &str, bucket: &str) -> Result<String> {
  let mut url = reqwest::Url::parse(endpoint).with_context(|| format!("S3_ENDPOINT {endpoint} must be a URL"))?;
  let host = url
    .host_str()
    .with_context(|| format!("S3_ENDPOINT {endpoint} must name a host"))?
    .to_string();
  url.set_host(Some(&format!("{bucket}.{host}")))?;
  Ok(url.as_str().trim_end_matches('/').to_string())
}

impl Config {
  pub fn from_env() -> Result<Self> {
    let cell_secret = STANDARD
      .decode(required("CELL_SECRET")?)
      .context("CELL_SECRET must be base64")?;
    if cell_secret.len() != 32 {
      bail!("CELL_SECRET must be 32 bytes");
    }
    let storage = match var("FILE_STORAGE").as_deref() {
      None | Some("disk") => Storage::Disk {
        root: var("FILE_STORAGE_DIR").unwrap_or_else(|| ".data/files".into()).into(),
      },
      Some("s3") => {
        let bucket = required("FILE_BUCKET")?;
        // Named and read as the API reads it, so both reach the bucket alike.
        let virtual_hosted = match var("S3_ADDRESSING_STYLE").as_deref() {
          None | Some("path") => false,
          Some("virtual") => true,
          Some(other) => bail!("S3_ADDRESSING_STYLE must be path or virtual, not {other}"),
        };
        let endpoint = match var("S3_ENDPOINT") {
          Some(endpoint) if virtual_hosted => Some(bucket_endpoint(&endpoint, &bucket)?),
          endpoint => endpoint,
        };
        Storage::S3 {
          bucket,
          region: var("S3_REGION").unwrap_or_else(|| "auto".into()),
          endpoint,
          virtual_hosted,
          access_key_id: required("S3_ACCESS_KEY_ID")?,
          secret_access_key: required("S3_SECRET_ACCESS_KEY")?,
        }
      },
      Some(other) => bail!("FILE_STORAGE must be disk or s3, not {other}"),
    };
    let encoder = match var("MEDIA_ENCODER") {
      None => Encoder::Cpu,
      Some(value) => {
        Encoder::parse(&value).with_context(|| format!("MEDIA_ENCODER {value} is not libx264 or h264_nvenc"))?
      },
    };
    Ok(Self {
      host: var("MEDIA_HOST").unwrap_or_else(|| "127.0.0.1".into()),
      port: var("MEDIA_PORT")
        .map_or(Ok(3104), |value| value.parse())
        .context("MEDIA_PORT must be a port")?,
      cell_secret,
      api_url: var("MEDIA_API_URL").map(|url| url.trim_end_matches('/').to_string()),
      storage,
      jobs: var("MEDIA_JOBS")
        .map_or(Ok(1), |value| value.parse())
        .context("MEDIA_JOBS must be a number")?,
      tools: Tools {
        ffmpeg: var("MEDIA_FFMPEG").unwrap_or_else(|| "ffmpeg".into()).into(),
        ffprobe: var("MEDIA_FFPROBE").unwrap_or_else(|| "ffprobe".into()).into(),
        encoder,
        tone_map: false,
      },
      speech: match var("MEDIA_WHISPER_MODEL") {
        None => None,
        Some(model) => Some(Speech {
          whisper: var("MEDIA_WHISPER").unwrap_or_else(|| "whisper-cli".into()).into(),
          model: model.into(),
          vad_model: var("MEDIA_WHISPER_VAD_MODEL").map(PathBuf::from),
          threads: var("MEDIA_WHISPER_THREADS")
            .map_or(Ok(4), |value| value.parse())
            .context("MEDIA_WHISPER_THREADS must be a number")?,
        }),
      },
      work_dir: var("MEDIA_WORK_DIR").map_or_else(env::temp_dir, PathBuf::from),
      metrics: match var("MEDIA_METRICS_PORT") {
        None => None,
        Some(port) => Some(format!(
          "{}:{}",
          var("MEDIA_METRICS_HOST").unwrap_or_else(|| "127.0.0.1".into()),
          port.parse::<u16>().context("MEDIA_METRICS_PORT must be a port")?
        )),
      },
    })
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn a_virtual_hosted_bucket_is_the_first_label_of_the_host() -> Result<()> {
    assert_eq!(
      bucket_endpoint("https://hel1.your-objectstorage.com", "faridalms-files")?,
      "https://faridalms-files.hel1.your-objectstorage.com"
    );
    assert_eq!(
      bucket_endpoint("http://minio:9000/", "faridalms-files")?,
      "http://faridalms-files.minio:9000"
    );
    assert!(bucket_endpoint("not a url", "faridalms-files").is_err());
    Ok(())
  }
}
