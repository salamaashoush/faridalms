//! The API's side of a job. The API owns every job's state; this service
//! asks it for work, says how far an encode has got, and reports how it
//! ended. It holds no database login of its own.

use std::time::Duration;

use anyhow::{Context, Result, bail};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::plan::Manifest;
use crate::preview::Preview;

/// What a job asks for: a video's streams, a recording's captions drafted,
/// or the sizes and summary a file is shown by before it is opened.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Kind {
  Streams,
  Captions,
  Previews,
}

/// The work a worker asks for. Each job kind the API holds is handed out
/// only to a worker that says it can do it, so an older worker that says
/// nothing of previews is never given one.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Claim {
  pub captions: bool,
  /// Whether video encodes may be handed out, which a lane kept for quick
  /// work turns down.
  pub streams: bool,
  pub previews: CanPreview,
}

/// Which documents this worker can make previews of; pictures and sound
/// it always can.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct CanPreview {
  pub pdf: bool,
  pub office: bool,
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
  /// What the API took the file to be, which decides what its preview is.
  #[serde(default)]
  pub media_type: Option<String>,
  /// Whether a picture held on its side by its metadata is put upright in
  /// place of its upload.
  #[serde(default)]
  pub rewrite: bool,
}

impl Job {
  fn path(&self, report: &str) -> String {
    let folder = match self.kind {
      Kind::Streams => "jobs",
      Kind::Captions => "captions",
      Kind::Previews => "previews",
    };
    format!("/v1/media/{folder}/{}/{report}", self.id)
  }
}

/// Whether the API still counts a job as this worker's. It stops doing so
/// when the video is gone, or was handed to another worker.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Lease {
  Kept,
  Lost,
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
      // Every call is a small question with a small answer. Without a limit
      // an API that accepts a connection and then says nothing would hold
      // the worker at that question for good.
      client: reqwest::Client::builder()
        .user_agent("farida-media")
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(30))
        .build()?,
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

  /// The next job waiting of a kind `claim` takes, or none.
  pub async fn claim(&self, claim: &Claim) -> Result<Option<Job>> {
    let response = self.post("/v1/media/claim", claim).await?;
    match response.status() {
      StatusCode::NO_CONTENT => Ok(None),
      StatusCode::OK => Ok(Some(response.json().await?)),
      status => bail!("the API refused a claim: {status}"),
    }
  }

  /// Says how far a job has got, which keeps it this worker's a while longer.
  pub async fn progress(&self, job: &Job, progress: f64) -> Result<Lease> {
    let response = self
      .post(&job.path("progress"), &json!({ "progress": progress }))
      .await?;
    Ok(if response.status() == StatusCode::CONFLICT {
      Lease::Lost
    } else {
      Lease::Kept
    })
  }

  /// Reports a video's streams and what they weigh in the store, and what
  /// its upload became when it was cut.
  pub async fn done(&self, job: &Job, manifest: &Manifest, replaced: Option<&Replaced>, bytes: u64) -> Result<()> {
    let response = self
      .post(
        &job.path("done"),
        &json!({ "manifest": manifest, "source": replaced, "bytes": bytes }),
      )
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

  pub async fn previewed(&self, job: &Job, preview: &Preview) -> Result<()> {
    let response = self.post(&job.path("done"), preview).await?;
    if !response.status().is_success() {
      bail!("the API refused a finished preview: {}", response.status());
    }
    Ok(())
  }

  /// Reports a job this file cannot get through; the API tries it again a
  /// few times and then gives it up.
  pub async fn failed(&self, job: &Job, error: &str) -> Result<()> {
    let response = self.post(&job.path("failed"), &json!({ "error": error })).await?;
    if response.status().is_server_error() {
      bail!("the API could not take a failed job: {}", response.status());
    }
    Ok(())
  }

  /// Hands a job back unspent, for any worker to take: this one is
  /// stopping, or its machine is at fault and not the file.
  pub async fn release(&self, job: &Job, reason: &str) -> Result<()> {
    let response = self.post(&job.path("release"), &json!({ "reason": reason })).await?;
    if response.status().is_server_error() {
      bail!("the API could not take a job back: {}", response.status());
    }
    Ok(())
  }
}
