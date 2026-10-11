//! Asks the API for videos to encode and encodes them, a few at a time.
//! While a job is worked on the API hears of it every few seconds, whatever
//! the work is doing, so the job stays this worker's; a job the API takes
//! away is dropped, and one this worker cannot finish through no fault of
//! the file is handed back unspent.

use std::sync::Arc;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::time::{Duration, Instant};

use object_store::ObjectStore;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;
use tokio_util::sync::CancellationToken;

use crate::api::{Api, Job, Kind, Lease, Replaced};
use crate::config::Config;
use crate::metrics::{End, Metrics};
use crate::plan::Manifest;
use crate::transcode::TranscodeError;
use crate::{captions, storage, transcode};

/// How long to wait before asking again when there was nothing to do.
const IDLE: Duration = Duration::from_secs(5);
/// The longest wait between asks once there has been nothing for a while.
/// Each ask costs the API a look at every school of the cell, so a quiet
/// service asks less often; the first video after a quiet spell starts
/// within this long, and plays as it was uploaded until then.
const LONGEST_IDLE: Duration = Duration::from_secs(30);
/// How often the API hears of a job under way. Its lease on the job runs
/// for minutes, so a few of these may be lost.
const PULSE: Duration = Duration::from_secs(5);
/// The longest wait before more work is asked for after the machine failed
/// a job: long enough that a broken machine goes through the queue slowly.
const LONGEST_WAIT: Duration = Duration::from_secs(60);
/// How long jobs under way get to hand themselves back when the service stops.
const LAST_WORDS: Duration = Duration::from_secs(10);
/// Times a job's end is told to an API that does not answer.
const TELLINGS: u32 = 3;
/// The share of a video's progress that is encoding; the rest is its
/// streams going to the store.
const ENCODING: f64 = 0.9;

#[derive(Clone)]
pub struct Worker {
  pub config: Arc<Config>,
  pub store: Arc<dyn ObjectStore>,
  pub api: Api,
  pub metrics: Arc<Metrics>,
  /// Cancelled when the service is stopping.
  pub stop: CancellationToken,
}

/// The wait after `failures` jobs in a row the machine could not do.
fn wait_after(failures: u32) -> Duration {
  if failures == 0 {
    return Duration::ZERO;
  }
  IDLE
    .saturating_mul(2_u32.saturating_pow(failures - 1))
    .min(LONGEST_WAIT)
}

/// The wait after `empty` asks in a row that found nothing.
fn idle_after(empty: u32) -> Duration {
  IDLE
    .saturating_mul(2_u32.saturating_pow(empty.saturating_sub(1)))
    .min(LONGEST_IDLE)
}

pub async fn run(worker: Worker) {
  let slots = Arc::new(Semaphore::new(worker.config.jobs.max(1)));
  let failures = Arc::new(AtomicU32::new(0));
  let mut jobs = JoinSet::new();
  let mut empty = 0_u32;
  loop {
    while jobs.try_join_next().is_some() {}
    let slot = tokio::select! {
      () = worker.stop.cancelled() => break,
      slot = Arc::clone(&slots).acquire_owned() => slot,
    };
    let Ok(slot) = slot else { break };
    // Read once a job has ended and freed the slot, so its failure counts.
    let wait = wait_after(failures.load(Ordering::Relaxed));
    let claimed = tokio::select! {
      () = worker.stop.cancelled() => break,
      claimed = async {
        tokio::time::sleep(wait).await;
        worker.api.claim(worker.config.speech.is_some()).await
      } => claimed,
    };
    match claimed {
      Ok(Some(job)) => {
        empty = 0;
        let (worker, failures) = (worker.clone(), Arc::clone(&failures));
        jobs.spawn(async move {
          match work(&worker, &job).await {
            End::Released if !worker.stop.is_cancelled() => failures.fetch_add(1, Ordering::Relaxed),
            End::Done | End::Failed => failures.swap(0, Ordering::Relaxed),
            End::Released | End::Lost => 0,
          };
          drop(slot);
        });
      },
      Ok(None) => {
        drop(slot);
        empty = empty.saturating_add(1);
        idle(&worker.stop, idle_after(empty)).await;
      },
      Err(error) => {
        drop(slot);
        tracing::warn!(%error, "asking the API for work failed");
        idle(&worker.stop, IDLE).await;
      },
    }
  }
  // Each job under way has seen the stop and is handing itself back.
  let _ = tokio::time::timeout(LAST_WORDS, async { while jobs.join_next().await.is_some() {} }).await;
}

async fn idle(stop: &CancellationToken, wait: Duration) {
  tokio::select! {
    () = stop.cancelled() => {},
    () = tokio::time::sleep(wait) => {},
  }
}

/// What a job made.
enum Made {
  Streams {
    manifest: Manifest,
    replaced: Option<Replaced>,
    bytes: u64,
  },
  Captions(String),
}

/// How far a job has got, from 0 to 1, shared with what tells the API.
#[derive(Default)]
struct Progress(AtomicU64);

impl Progress {
  fn set(&self, progress: f64) {
    self.0.store(progress.to_bits(), Ordering::Relaxed);
  }

  fn get(&self) -> f64 {
    f64::from_bits(self.0.load(Ordering::Relaxed))
  }
}

/// Tells the API how far a job has got for as long as it runs, and
/// cancels `lost` when the API says the job is no longer this worker's.
async fn pulse(api: Api, job: Job, progress: Arc<Progress>, lost: CancellationToken) {
  loop {
    tokio::time::sleep(PULSE).await;
    if matches!(api.progress(&job, progress.get()).await, Ok(Lease::Lost)) {
      lost.cancel();
      return;
    }
  }
}

/// Whether the machine is at fault and not the file: the store or the disk
/// could not be read or written, or a tool is not there to run. Such a
/// failure says nothing about the video, which is handed back unspent.
fn is_the_machines(error: &anyhow::Error) -> bool {
  error.chain().any(|cause| {
    cause
      .downcast_ref::<TranscodeError>()
      .is_some_and(TranscodeError::is_the_machines)
      || cause
        .downcast_ref::<object_store::Error>()
        .is_some_and(|error| !matches!(error, object_store::Error::NotFound { .. }))
      || cause.downcast_ref::<std::io::Error>().is_some()
  })
}

/// Tells the API how a job ended, a few times over if it does not answer:
/// an end the API never hears of is work done again once the lease runs out.
async fn tell<F, Fut>(job: &Job, what: &str, call: F)
where
  F: Fn() -> Fut,
  Fut: Future<Output = anyhow::Result<()>>,
{
  for telling in 1..=TELLINGS {
    match call().await {
      Ok(()) => return,
      Err(error) if telling == TELLINGS => tracing::warn!(job = %job.id, %error, "{what} could not be reported"),
      Err(_) => tokio::time::sleep(Duration::from_secs(2)).await,
    }
  }
}

async fn work(worker: &Worker, job: &Job) -> End {
  let started = Instant::now();
  let kind = match job.kind {
    Kind::Streams => "streams",
    Kind::Captions => "captions",
  };
  tracing::info!(job = %job.id, kind, "working");
  worker.metrics.started();
  let progress = Arc::new(Progress::default());
  let lost = CancellationToken::new();
  let pulse = tokio::spawn(pulse(
    worker.api.clone(),
    job.clone(),
    Arc::clone(&progress),
    lost.clone(),
  ));
  let made = tokio::select! {
    biased;
    () = worker.stop.cancelled() => None,
    () = lost.cancelled() => None,
    made = async {
      match job.kind {
        Kind::Streams => encode(worker, job, &progress).await,
        Kind::Captions => draft(worker, job, &progress).await,
      }
    } => Some(made),
  };
  pulse.abort();

  let api = &worker.api;
  let end = match made {
    Some(Ok(Made::Streams {
      manifest,
      replaced,
      bytes,
    })) => {
      worker.metrics.stored(bytes);
      tell(job, "the finished job", || {
        api.done(job, &manifest, replaced.as_ref(), bytes)
      })
      .await;
      End::Done
    },
    Some(Ok(Made::Captions(vtt))) => {
      tell(job, "the drafted captions", || api.drafted(job, &vtt)).await;
      End::Done
    },
    Some(Err(error)) => {
      let reason = format!("{error:#}");
      if is_the_machines(&error) {
        tracing::error!(job = %job.id, kind, error = %reason, "this machine could not do the job, which is handed back");
        tell(job, "the job handed back", || api.release(job, &reason)).await;
        End::Released
      } else {
        tracing::warn!(job = %job.id, kind, error = %reason, "the job failed");
        tell(job, "the failed job", || api.failed(job, &reason)).await;
        End::Failed
      }
    },
    None if lost.is_cancelled() => {
      tracing::info!(job = %job.id, kind, "the API took the job away");
      End::Lost
    },
    None => {
      tell(job, "the job handed back", || {
        api.release(job, "the media service is stopping")
      })
      .await;
      End::Released
    },
  };
  let took = started.elapsed();
  worker.metrics.ended(job.kind, end, took);
  if end == End::Done {
    tracing::info!(job = %job.id, kind, seconds = took.as_secs(), "done");
  }
  end
}

async fn draft(worker: &Worker, job: &Job, progress: &Progress) -> anyhow::Result<Made> {
  let Some(speech) = &worker.config.speech else {
    anyhow::bail!("this service has no speech model");
  };
  let work = tempfile::Builder::new()
    .prefix("farida-captions-")
    .tempdir_in(&worker.config.work_dir)?;
  let source = work.path().join("source");
  storage::download(worker.store.as_ref(), &job.source_key, &source).await?;
  let vtt = captions::draft(
    &worker.config.tools.ffmpeg,
    speech,
    &source,
    work.path(),
    job.language.as_deref().unwrap_or("en"),
    |done| progress.set(done),
  )
  .await?;
  Ok(Made::Captions(vtt))
}

async fn encode(worker: &Worker, job: &Job, progress: &Progress) -> anyhow::Result<Made> {
  let (config, store) = (&worker.config, worker.store.as_ref());
  let work = tempfile::Builder::new()
    .prefix("farida-media-")
    .tempdir_in(&config.work_dir)?;
  let upload = work.path().join("source");
  let out = work.path().join("out");
  storage::download(store, &job.source_key, &upload).await?;
  // A recording its maker cut is cut first, and the streams made from what
  // is left; the cut then takes the upload's place, so what was cut away
  // is kept nowhere.
  let source = match job.trim {
    Some(trim) => {
      let cut = work.path().join("cut.mp4");
      transcode::cut(&config.tools, &upload, &cut, trim.start_seconds, trim.end_seconds).await?;
      cut
    },
    None => upload,
  };

  let manifest = transcode::transcode(&config.tools, &source, &out, |done| progress.set(done * ENCODING)).await?;
  let bytes = storage::upload_dir(store, &out, &job.output_prefix, |sent| {
    progress.set(ENCODING + sent * (1.0 - ENCODING));
  })
  .await?;
  let replaced = match job.trim {
    Some(_) => Some(storage::replace(store, &source, &job.source_key).await?),
    None => None,
  };
  Ok(Made::Streams {
    manifest,
    replaced,
    bytes,
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn a_failing_machine_asks_for_work_ever_more_slowly() {
    assert_eq!(wait_after(0), Duration::ZERO);
    assert_eq!(wait_after(1), Duration::from_secs(5));
    assert_eq!(wait_after(2), Duration::from_secs(10));
    assert_eq!(wait_after(4), Duration::from_secs(40));
    assert_eq!(wait_after(5), LONGEST_WAIT);
    assert_eq!(wait_after(u32::MAX), LONGEST_WAIT);
  }

  #[test]
  fn a_quiet_service_asks_less_often() {
    assert_eq!(idle_after(1), Duration::from_secs(5));
    assert_eq!(idle_after(2), Duration::from_secs(10));
    assert_eq!(idle_after(3), Duration::from_secs(20));
    assert_eq!(idle_after(4), LONGEST_IDLE);
    assert_eq!(idle_after(u32::MAX), LONGEST_IDLE);
  }

  #[test]
  fn tells_the_machines_fault_from_the_files() {
    let missing_tool = anyhow::Error::from(TranscodeError::Start {
      tool: "ffmpeg",
      source: std::io::Error::from(std::io::ErrorKind::NotFound),
    });
    assert!(is_the_machines(&missing_tool));
    let full_disk = anyhow::Error::from(TranscodeError::Failed {
      tool: "ffmpeg",
      stderr: "av_interleaved_write_frame(): No space left on device".into(),
    });
    assert!(is_the_machines(&full_disk));
    let store_down = anyhow::Error::from(object_store::Error::NotImplemented {
      operation: "get".into(),
      implementer: "test".into(),
    })
    .context("the upload could not be fetched");
    assert!(is_the_machines(&store_down));

    let broken_file = anyhow::Error::from(TranscodeError::Failed {
      tool: "ffprobe",
      stderr: "moov atom not found".into(),
    });
    assert!(!is_the_machines(&broken_file));
    let no_picture = anyhow::Error::from(TranscodeError::Probe(crate::plan::ProbeError::NoVideo));
    assert!(!is_the_machines(&no_picture));
    let gone = anyhow::Error::from(object_store::Error::NotFound {
      path: "t/a/f/b".into(),
      source: "gone".into(),
    });
    assert!(!is_the_machines(&gone));
  }
}
