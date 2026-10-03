//! The API's side of a job. The API owns every job's state; this service
//! asks it for work, says how far an encode has got, and reports how it
//! ended. It holds no database login of its own.

use anyhow::{Context, Result, bail};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::plan::Manifest;

/// A video to encode: where its upload is, and where its streams go.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
  pub id: String,
  pub source_key: String,
  pub output_prefix: String,
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

  /// The next job waiting, or none.
  pub async fn claim(&self) -> Result<Option<Job>> {
    let response = self.post("/v1/media/claim", &json!({})).await?;
    match response.status() {
      StatusCode::NO_CONTENT => Ok(None),
      StatusCode::OK => Ok(Some(response.json().await?)),
      status => bail!("the API refused a claim: {status}"),
    }
  }

  pub async fn progress(&self, job: &Job, progress: f64) -> Result<()> {
    self
      .post(
        &format!("/v1/media/jobs/{}/progress", job.id),
        &json!({ "progress": progress }),
      )
      .await?;
    Ok(())
  }

  pub async fn done(&self, job: &Job, manifest: &Manifest) -> Result<()> {
    let response = self
      .post(
        &format!("/v1/media/jobs/{}/done", job.id),
        &json!({ "manifest": manifest }),
      )
      .await?;
    if !response.status().is_success() {
      bail!("the API refused a finished job: {}", response.status());
    }
    Ok(())
  }

  pub async fn failed(&self, job: &Job, error: &str) -> Result<()> {
    self
      .post(&format!("/v1/media/jobs/{}/failed", job.id), &json!({ "error": error }))
      .await?;
    Ok(())
  }
}
