//! Counts of what the service has done, in the text Prometheus reads. They
//! are kept in memory and start again with the service, as counters do.

use std::fmt::Write as _;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use crate::api::Kind;

/// How a job ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum End {
  Done,
  /// The file could not be got through.
  Failed,
  /// Handed back unspent: the service was stopping, or its machine was at fault.
  Released,
  /// The API took it away while it was being worked on.
  Lost,
}

const KINDS: [(Kind, &str); 3] = [
  (Kind::Streams, "streams"),
  (Kind::Captions, "captions"),
  (Kind::Previews, "previews"),
];
const ENDS: [(End, &str); 4] = [
  (End::Done, "done"),
  (End::Failed, "failed"),
  (End::Released, "released"),
  (End::Lost, "lost"),
];
/// The answers a request for a stream gets.
const STATUSES: [u16; 5] = [200, 206, 404, 416, 502];

#[derive(Debug, Default)]
pub struct Metrics {
  jobs: [[AtomicU64; ENDS.len()]; KINDS.len()],
  job_millis: [AtomicU64; KINDS.len()],
  running: AtomicU64,
  answers: [AtomicU64; STATUSES.len()],
  served_bytes: AtomicU64,
  stored_bytes: AtomicU64,
}

fn kind_at(kind: Kind) -> usize {
  KINDS.iter().position(|(known, _)| *known == kind).unwrap_or(0)
}

impl Metrics {
  pub fn started(&self) {
    self.running.fetch_add(1, Ordering::Relaxed);
  }

  pub fn ended(&self, kind: Kind, end: End, took: Duration) {
    self.running.fetch_sub(1, Ordering::Relaxed);
    let at = ENDS.iter().position(|(known, _)| *known == end).unwrap_or(0);
    self.jobs[kind_at(kind)][at].fetch_add(1, Ordering::Relaxed);
    self.job_millis[kind_at(kind)].fetch_add(u64::try_from(took.as_millis()).unwrap_or(u64::MAX), Ordering::Relaxed);
  }

  /// Streams and previews written to the store.
  pub fn stored(&self, bytes: u64) {
    self.stored_bytes.fetch_add(bytes, Ordering::Relaxed);
  }

  /// A request for a stream answered with `status`, and `bytes` of body.
  pub fn answered(&self, status: u16, bytes: u64) {
    if let Some(at) = STATUSES.iter().position(|known| *known == status) {
      self.answers[at].fetch_add(1, Ordering::Relaxed);
    }
    self.served_bytes.fetch_add(bytes, Ordering::Relaxed);
  }

  #[must_use]
  pub fn render(&self) -> String {
    let mut text = String::new();
    let read = |counter: &AtomicU64| counter.load(Ordering::Relaxed);
    text.push_str("# HELP farida_media_jobs_total Jobs ended, by kind and by how they ended.\n");
    text.push_str("# TYPE farida_media_jobs_total counter\n");
    for (kind, (_, kind_name)) in KINDS.iter().enumerate() {
      for (end, (_, end_name)) in ENDS.iter().enumerate() {
        let _ = writeln!(
          text,
          "farida_media_jobs_total{{kind=\"{kind_name}\",outcome=\"{end_name}\"}} {}",
          read(&self.jobs[kind][end])
        );
      }
    }
    text.push_str("# HELP farida_media_job_seconds_total Seconds spent on jobs that ended.\n");
    text.push_str("# TYPE farida_media_job_seconds_total counter\n");
    for (kind, (_, kind_name)) in KINDS.iter().enumerate() {
      let millis = read(&self.job_millis[kind]);
      let _ = writeln!(
        text,
        "farida_media_job_seconds_total{{kind=\"{kind_name}\"}} {}.{:03}",
        millis / 1000,
        millis % 1000
      );
    }
    text.push_str("# HELP farida_media_jobs_running Jobs being worked on now.\n");
    text.push_str("# TYPE farida_media_jobs_running gauge\n");
    let _ = writeln!(text, "farida_media_jobs_running {}", read(&self.running));
    text.push_str("# HELP farida_media_stored_bytes_total Bytes of streams and previews written to the store.\n");
    text.push_str("# TYPE farida_media_stored_bytes_total counter\n");
    let _ = writeln!(text, "farida_media_stored_bytes_total {}", read(&self.stored_bytes));
    text.push_str("# HELP farida_media_stream_responses_total Requests for a stream answered, by status.\n");
    text.push_str("# TYPE farida_media_stream_responses_total counter\n");
    for (at, status) in STATUSES.iter().enumerate() {
      let _ = writeln!(
        text,
        "farida_media_stream_responses_total{{status=\"{status}\"}} {}",
        read(&self.answers[at])
      );
    }
    text.push_str("# HELP farida_media_stream_bytes_total Bytes of streams sent in answers.\n");
    text.push_str("# TYPE farida_media_stream_bytes_total counter\n");
    let _ = writeln!(text, "farida_media_stream_bytes_total {}", read(&self.served_bytes));
    text
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn counts_what_was_done_as_prometheus_reads_it() {
    let metrics = Metrics::default();
    metrics.started();
    metrics.started();
    metrics.ended(Kind::Streams, End::Done, Duration::from_millis(12_500));
    metrics.started();
    metrics.ended(Kind::Previews, End::Released, Duration::from_millis(40));
    metrics.stored(4096);
    metrics.answered(206, 1000);
    metrics.answered(206, 24);
    metrics.answered(404, 0);
    let text = metrics.render();
    for line in [
      "farida_media_jobs_total{kind=\"streams\",outcome=\"done\"} 1",
      "farida_media_jobs_total{kind=\"captions\",outcome=\"failed\"} 0",
      "farida_media_job_seconds_total{kind=\"streams\"} 12.500",
      "farida_media_jobs_total{kind=\"previews\",outcome=\"released\"} 1",
      "farida_media_job_seconds_total{kind=\"previews\"} 0.040",
      "farida_media_jobs_running 1",
      "farida_media_stored_bytes_total 4096",
      "farida_media_stream_responses_total{status=\"206\"} 2",
      "farida_media_stream_responses_total{status=\"404\"} 1",
      "farida_media_stream_bytes_total 1024",
    ] {
      assert!(
        text.lines().any(|found| found == line),
        "{line} is missing from:\n{text}"
      );
    }
    // Every sample belongs to a metric that says what it is.
    for sample in text.lines().filter(|line| !line.starts_with('#')) {
      let name = sample.split(['{', ' ']).next().unwrap_or_default();
      assert!(text.contains(&format!("# TYPE {name} ")), "{name} has no type");
    }
  }
}
