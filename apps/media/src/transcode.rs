//! Runs ffprobe and ffmpeg over one source and leaves a folder of streams:
//! the HLS renditions and master playlist, a poster, and thumbnail sheets
//! with the track that points into them.

use std::path::{Path, PathBuf};
use std::process::Stdio;

use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::process::Command;

use crate::plan::{self, Encoder, Manifest};

#[derive(Debug, thiserror::Error)]
pub enum TranscodeError {
  #[error("{tool} could not start: {source}")]
  Start { tool: &'static str, source: std::io::Error },
  #[error("{tool} failed: {stderr}")]
  Failed { tool: &'static str, stderr: String },
  #[error(transparent)]
  Probe(#[from] plan::ProbeError),
  #[error("the output could not be written: {0}")]
  Write(#[from] std::io::Error),
}

/// Where the tools are, and which encoder to drive.
#[derive(Debug, Clone)]
pub struct Tools {
  pub ffmpeg: PathBuf,
  pub ffprobe: PathBuf,
  pub encoder: Encoder,
}

/// Cuts `source` down to the seconds from `start` to `end`, written to `to`.
pub async fn cut(tools: &Tools, source: &Path, to: &Path, start: f64, end: f64) -> Result<(), TranscodeError> {
  run(&tools.ffmpeg, "ffmpeg", &plan::cut_args(source, to, start, end)).await
}

/// Turns `source` into streams under `out`, telling `progress` how far the
/// encode has got, from 0 to 1.
pub async fn transcode(
  tools: &Tools,
  source: &Path,
  out: &Path,
  mut progress: impl FnMut(f64) + Send,
) -> Result<Manifest, TranscodeError> {
  let probed = probe(tools, source).await?;
  let renditions = plan::ladder(&probed);
  tokio::fs::create_dir_all(out.join("thumbs")).await?;

  let args = plan::hls_args(source, out, &probed, &renditions, tools.encoder);
  let mut child = Command::new(&tools.ffmpeg)
    .args(&args)
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .kill_on_drop(true)
    .spawn()
    .map_err(|source| TranscodeError::Start { tool: "ffmpeg", source })?;
  let stderr = child.stderr.take().map(collect_tail);
  if let Some(stdout) = child.stdout.take() {
    let mut lines = BufReader::new(stdout).lines();
    while let Ok(Some(line)) = lines.next_line().await {
      if let Some(done) = line
        .strip_prefix("out_time_us=")
        .and_then(|value| value.parse::<f64>().ok())
      {
        progress((done / 1_000_000.0 / probed.duration).clamp(0.0, 1.0));
      }
    }
  }
  let status = child.wait().await?;
  let tail = match stderr {
    Some(task) => task.await.unwrap_or_default(),
    None => String::new(),
  };
  if !status.success() {
    return Err(TranscodeError::Failed {
      tool: "ffmpeg",
      stderr: tail,
    });
  }

  run(&tools.ffmpeg, "ffmpeg", &plan::poster_args(source, out, &probed)).await?;
  run(&tools.ffmpeg, "ffmpeg", &plan::thumbnail_args(source, out)).await?;
  tokio::fs::write(
    out.join("thumbs").join("thumbs.vtt"),
    plan::thumbnail_track(probed.duration),
  )
  .await?;
  progress(1.0);

  Ok(Manifest {
    duration_seconds: probed.duration,
    width: probed.width,
    height: probed.height,
    renditions,
    audio: probed.has_audio,
    master: "master.m3u8".into(),
    poster: "poster.jpg".into(),
    thumbnails: "thumbs/thumbs.vtt".into(),
  })
}

async fn probe(tools: &Tools, source: &Path) -> Result<plan::Probe, TranscodeError> {
  let output = Command::new(&tools.ffprobe)
    .args(["-v", "error", "-print_format", "json", "-show_streams", "-show_format"])
    .arg(source)
    .stdin(Stdio::null())
    .output()
    .await
    .map_err(|source| TranscodeError::Start {
      tool: "ffprobe",
      source,
    })?;
  if !output.status.success() {
    return Err(TranscodeError::Failed {
      tool: "ffprobe",
      stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    });
  }
  Ok(plan::probe(&output.stdout)?)
}

pub(crate) async fn run(program: &Path, tool: &'static str, args: &[String]) -> Result<(), TranscodeError> {
  let output = Command::new(program)
    .args(args)
    .stdin(Stdio::null())
    .output()
    .await
    .map_err(|source| TranscodeError::Start { tool, source })?;
  if output.status.success() {
    Ok(())
  } else {
    Err(TranscodeError::Failed {
      tool,
      stderr: tail_of(&String::from_utf8_lossy(&output.stderr)),
    })
  }
}

/// ffmpeg explains a failure in its last lines; the rest is its banner.
fn tail_of(text: &str) -> String {
  let lines: Vec<&str> = text.lines().collect();
  lines[lines.len().saturating_sub(12)..].join("\n")
}

fn collect_tail(stderr: tokio::process::ChildStderr) -> tokio::task::JoinHandle<String> {
  tokio::spawn(async move {
    let mut text = String::new();
    let _ = BufReader::new(stderr).read_to_string(&mut text).await;
    tail_of(&text)
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  /// An eight-second 720p clip with a tone, made by ffmpeg itself.
  async fn clip(dir: &Path) -> PathBuf {
    let path = dir.join("source.mp4");
    let made = Command::new("ffmpeg")
      .args([
        "-hide_banner",
        "-nostdin",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=1280x720:rate=30",
      ])
      .args([
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440",
        "-t",
        "8",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
      ])
      .args(["-c:a", "aac"])
      .arg(&path)
      .output()
      .await;
    assert!(
      made.is_ok_and(|output| output.status.success()),
      "ffmpeg must be installed to run this test"
    );
    path
  }

  #[tokio::test]
  async fn turns_a_clip_into_adaptive_streams() -> anyhow::Result<()> {
    let dir = tempfile::tempdir()?;
    let source = clip(dir.path()).await;
    let out = dir.path().join("out");
    let tools = Tools {
      ffmpeg: "ffmpeg".into(),
      ffprobe: "ffprobe".into(),
      encoder: Encoder::Cpu,
    };
    let mut reported = Vec::new();
    let manifest = transcode(&tools, &source, &out, |progress| reported.push(progress)).await?;

    let names: Vec<&str> = manifest
      .renditions
      .iter()
      .map(|rendition| rendition.name.as_str())
      .collect();
    assert_eq!(names, ["360p", "540p", "720p"]);
    assert!(manifest.audio);
    assert!((manifest.duration_seconds - 8.0).abs() < 0.5);
    assert_eq!(reported.last().copied(), Some(1.0));

    let master = tokio::fs::read_to_string(out.join("master.m3u8")).await?;
    assert!(master.contains("#EXT-X-MEDIA:TYPE=AUDIO"));
    assert!(master.contains("720p/index.m3u8"));
    // Every file a playlist names is there to be fetched.
    for folder in ["audio", "360p", "540p", "720p"] {
      let playlist = tokio::fs::read_to_string(out.join(folder).join("index.m3u8")).await?;
      let listed: Vec<&str> = playlist
        .lines()
        .filter_map(|line| {
          line
            .strip_prefix("#EXT-X-MAP:URI=\"")
            .and_then(|rest| rest.split('"').next())
            .or_else(|| (!line.starts_with('#') && !line.is_empty()).then_some(line))
        })
        .collect();
      assert!(listed.len() >= 3, "{folder} names too few files");
      for file in listed {
        assert!(out.join(folder).join(file).is_file(), "{folder}/{file} was not made");
      }
    }
    for path in ["poster.jpg", "thumbs/sheet_001.jpg"] {
      assert!(out.join(path).is_file(), "{path} was not made");
    }
    let track = tokio::fs::read_to_string(out.join("thumbs/thumbs.vtt")).await?;
    assert!(track.starts_with("WEBVTT") && track.contains("sheet_001.jpg#xywh=160,0,160,90"));
    Ok(())
  }
}
