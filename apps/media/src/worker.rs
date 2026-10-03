//! Asks the API for videos to encode and encodes them, a few at a time.

use std::sync::Arc;
use std::time::{Duration, Instant};

use object_store::ObjectStore;
use tokio::sync::Semaphore;

use crate::api::{Api, Job};
use crate::config::Config;
use crate::{storage, transcode};

/// How long to wait before asking again when there was nothing to do.
const IDLE: Duration = Duration::from_secs(5);
/// Progress goes to the API at most this often.
const REPORT_EVERY: Duration = Duration::from_secs(5);

pub async fn run(config: Arc<Config>, store: Arc<dyn ObjectStore>, api: Api) {
  let slots = Arc::new(Semaphore::new(config.jobs.max(1)));
  loop {
    let Ok(slot) = Arc::clone(&slots).acquire_owned().await else {
      return;
    };
    match api.claim().await {
      Ok(Some(job)) => {
        let (config, store, api) = (Arc::clone(&config), Arc::clone(&store), api.clone());
        tokio::spawn(async move {
          encode(&config, store.as_ref(), &api, &job).await;
          drop(slot);
        });
      },
      Ok(None) => {
        drop(slot);
        tokio::time::sleep(IDLE).await;
      },
      Err(error) => {
        drop(slot);
        tracing::warn!(%error, "asking the API for work failed");
        tokio::time::sleep(IDLE).await;
      },
    }
  }
}

async fn encode(config: &Config, store: &dyn ObjectStore, api: &Api, job: &Job) {
  let started = Instant::now();
  tracing::info!(job = %job.id, "encoding");
  let outcome = attempt(config, store, api, job).await;
  let report = match &outcome {
    Ok(manifest) => api.done(job, manifest).await,
    Err(error) => api.failed(job, &format!("{error:#}")).await,
  };
  match (outcome, report) {
    (Ok(_), Ok(())) => tracing::info!(job = %job.id, seconds = started.elapsed().as_secs(), "encoded"),
    (Err(error), _) => tracing::warn!(job = %job.id, error = %format!("{error:#}"), "encoding failed"),
    (Ok(_), Err(error)) => tracing::warn!(job = %job.id, %error, "the finished job could not be reported"),
  }
}

async fn attempt(
  config: &Config,
  store: &dyn ObjectStore,
  api: &Api,
  job: &Job,
) -> anyhow::Result<crate::plan::Manifest> {
  let work = tempfile::Builder::new()
    .prefix("farida-media-")
    .tempdir_in(&config.work_dir)?;
  let source = work.path().join("source");
  let out = work.path().join("out");
  storage::download(store, &job.source_key, &source).await?;

  let progress_api = api.clone();
  let progress_job = job.clone();
  let mut last = Instant::now();
  let manifest = transcode::transcode(&config.tools, &source, &out, move |progress| {
    if last.elapsed() >= REPORT_EVERY {
      last = Instant::now();
      let (api, job) = (progress_api.clone(), progress_job.clone());
      tokio::spawn(async move {
        let _ = api.progress(&job, progress).await;
      });
    }
  })
  .await?;
  storage::upload_dir(store, &out, &job.output_prefix).await?;
  Ok(manifest)
}
