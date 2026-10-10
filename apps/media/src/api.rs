//! The API's side of a job. The API owns every job's state; this service
//! asks it for work, says how far an encode has got, and reports how it
//! ended. It holds no database login of its own.

use anyhow::{Context, Result, bail};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::plan::Manifest;

/// What a job asks for: a video's streams, or a recording's captions drafted.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Kind {
  Streams,
  Captions,
}

/// The part of a recording its maker kept, in seconds from its start.
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Trim {
  pub start_seconds: f64,
  pub end_seconds: f64,
}

/// What a recording weighs and hashes to once it has been cut and put back
/// in place of its upload, for the API's record of it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Replaced {
  pub size_bytes: u64,
  pub sha256: String,
}

/// A recording to work on: where its upload is, and for streams where they go.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
  pub id: String,
  pub kind: Kind,
  pub source_key: String,
  pub output_prefix: String,
  /// The language a recording's captions are drafted in.
  #[serde(default)]
  pub language: Option<String>,
  /// The part to keep, when its maker cut the recording's ends off.
  #[serde(default)]
  pub trim: Option<Trim>,
}

impl Job {
  fn path(&self, report: &str) -> String {
    let folder = match self.kind {
      Kind::Streams => "jobs",
      Kind::Captions => "captions",
    };
    format!("/v1/media/{folder}/{}/{report}", self.id)
  }
}

#[derive(Clone)]
pub struct Api {
  client: reqwest::Client,
  base: String,
  token: String,
}

impl Api {
  pub fn new(base: String, token: String) -> Result<Self> {
    Ok(Self {
      client: reqwest::Client::builder().user_agent("farida-media").build()?,
      base,
      token,
    })
  }

  async fn post(&self, path: &str, body: &impl Serialize) -> Result<reqwest::Response> {
    self
      .client
      .post(format!("{}{path}", self.base))
      .bearer_auth(&self.token)
      .json(body)
      .send()
      .await
      .with_context(|| format!("the API did not answer {path}"))
  }

  /// The next job waiting, or none; captions only when this service can draft them.
  pub async fn claim(&self, captions: bool) -> Result<Option<Job>> {
    let response = self.post("/v1/media/claim", &json!({ "captions": captions })).await?;
    match response.status() {
      StatusCode::NO_CONTENT => Ok(None),
      StatusCode::OK => Ok(Some(response.json().await?)),
      status => bail!("the API refused a claim: {status}"),
    }
  }

  pub async fn progress(&self, job: &Job, progress: f64) -> Result<()> {
    self
      .post(&job.path("progress"), &json!({ "progress": progress }))
      .await?;
    Ok(())
  }

  /// Reports a video's streams, and what its upload became when it was cut.
  pub async fn done(&self, job: &Job, manifest: &Manifest, replaced: Option<&Replaced>) -> Result<()> {
    let response = self
      .post(&job.path("done"), &json!({ "manifest": manifest, "source": replaced }))
      .await?;
    if !response.status().is_success() {
      bail!("the API refused a finished job: {}", response.status());
    }
    Ok(())
  }

  pub async fn drafted(&self, job: &Job, vtt: &str) -> Result<()> {
    let response = self.post(&job.path("done"), &json!({ "vtt": vtt })).await?;
    if !response.status().is_success() {
      bail!("the API refused drafted captions: {}", response.status());
    }
    Ok(())
  }

  pub async fn failed(&self, job: &Job, error: &str) -> Result<()> {
    self.post(&job.path("failed"), &json!({ "error": error })).await?;
    Ok(())
  }
}
