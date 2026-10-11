//! Drafts a recording's captions from what it says: ffmpeg takes its sound
//! as whisper.cpp wants it, and whisper.cpp writes the cues as WebVTT.

use std::path::{Path, PathBuf};
use std::process::Stdio;

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::transcode::{TranscodeError, run};

/// Where speech recognition is, the model it listens with, and how many
/// cores it may take.
#[derive(Debug, Clone)]
pub struct Speech {
  pub whisper: PathBuf,
  pub model: PathBuf,
  /// The model that tells speech from silence. Whisper writes words over
  /// a long pause or a stretch of music unless it is kept from hearing them.
  pub vad_model: Option<PathBuf>,
  pub threads: usize,
}

/// Proves speech recognition is there to run and its models to read, as
/// the service starts.
pub async fn check(speech: &Speech) -> Result<(), TranscodeError> {
  run(&speech.whisper, "whisper", &["--help".to_string()]).await?;
  for model in std::iter::once(&speech.model).chain(&speech.vad_model) {
    tokio::fs::metadata(model)
      .await
      .map_err(|source| TranscodeError::Start {
        tool: "whisper",
        source: std::io::Error::new(source.kind(), format!("{}: {source}", model.display())),
      })?;
  }
  Ok(())
}

/// A caption line runs no longer than this many characters, broken between
/// words, so it reads at a glance.
const LINE_CHARS: &str = "64";

/// Whether `language` is one the API asks for, so nothing else reaches the
/// command line: the languages the captions editor offers.
fn spoken(language: &str) -> bool {
  matches!(
    language,
    "ar" | "de" | "en" | "es" | "fr" | "hi" | "it" | "pt" | "ru" | "tr" | "ur" | "zh"
  )
}

/// Drafts captions for `source` in `language`, working in `work`, telling
/// `progress` how far it has got, from 0 to 1.
pub async fn draft(
  ffmpeg: &Path,
  speech: &Speech,
  source: &Path,
  work: &Path,
  language: &str,
  mut progress: impl FnMut(f64) + Send,
) -> Result<String, TranscodeError> {
  if !spoken(language) {
    return Err(TranscodeError::Failed {
      tool: "whisper",
      stderr: format!("{language} is not a language captions are drafted in"),
    });
  }
  let sound = work.join("speech.wav");
  let mut extract: Vec<String> = ["-hide_banner", "-nostdin", "-y", "-i"].map(String::from).to_vec();
  extract.push(source.to_string_lossy().into_owned());
  extract.extend(["-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le"].map(String::from));
  extract.push(sound.to_string_lossy().into_owned());
  run(ffmpeg, "ffmpeg", &extract).await?;

  let base = work.join("captions");
  let mut whisper = Command::new(&speech.whisper);
  if let Some(vad_model) = &speech.vad_model {
    whisper.arg("--vad").arg("--vad-model").arg(vad_model);
  }
  let mut child = whisper
    .arg("--model")
    .arg(&speech.model)
    .arg("--file")
    .arg(&sound)
    .args(["--language", language, "--threads"])
    .arg(speech.threads.max(1).to_string())
    .args([
      "--max-len",
      LINE_CHARS,
      "--split-on-word",
      "--output-vtt",
      "--print-progress",
    ])
    .arg("--output-file")
    .arg(&base)
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::piped())
    .kill_on_drop(true)
    .spawn()
    .map_err(|source| TranscodeError::Start {
      tool: "whisper",
      source,
    })?;
  let mut tail: Vec<String> = Vec::new();
  if let Some(stderr) = child.stderr.take() {
    let mut lines = BufReader::new(stderr).lines();
    while let Ok(Some(line)) = lines.next_line().await {
      if let Some(percent) = percent_of(&line) {
        progress(percent / 100.0);
      }
      tail.push(line);
      if tail.len() > 12 {
        tail.remove(0);
      }
    }
  }
  if !child.wait().await?.success() {
    return Err(TranscodeError::Failed {
      tool: "whisper",
      stderr: tail.join("\n"),
    });
  }
  let vtt = tokio::fs::read_to_string(base.with_extension("vtt")).await?;
  progress(1.0);
  Ok(vtt)
}

/// whisper.cpp says how far it has got as "progress = 45%".
fn percent_of(line: &str) -> Option<f64> {
  let (_, after) = line.split_once("progress =")?;
  after.trim().trim_end_matches('%').trim().parse().ok()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn reads_how_far_whisper_has_got() {
    assert_eq!(
      percent_of("whisper_print_progress_callback: progress =  45%"),
      Some(45.0)
    );
    assert_eq!(percent_of("whisper_full: computing"), None);
  }

  #[test]
  fn drafts_only_in_the_languages_asked_for() {
    assert!(spoken("ar"));
    assert!(spoken("en"));
    assert!(spoken("fr"));
    assert!(!spoken("-ml"));
    assert!(!spoken("auto"));
  }
}
