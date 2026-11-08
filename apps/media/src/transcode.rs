//! Runs ffprobe and ffmpeg over one source and leaves a folder of streams:
//! the HLS renditions and master playlist, a poster, and thumbnail sheets
//! with the track that points into them.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::process::Command;

use crate::plan::{self, Encode, Encoder, Manifest, ProbeError};

#[derive(Debug, thiserror::Error)]
pub enum TranscodeError {
  #[error("{tool} could not start: {source}")]
  Start { tool: &'static str, source: std::io::Error },
  #[error("{tool} failed: {stderr}")]
  Failed { tool: &'static str, stderr: String },
  #[error(transparent)]
  Probe(#[from] ProbeError),
  #[error("the output could not be written: {0}")]
  Write(#[from] std::io::Error),
}

impl TranscodeError {
  /// Whether the machine is at fault and not the file: a tool that is not
  /// there or a disk that cannot be written fails every video alike, so
  /// none should be given up on for it.
  #[must_use]
  pub fn is_the_machines(&self) -> bool {
    match self {
      Self::Start { .. } | Self::Write(_) => true,
      Self::Failed { stderr, .. } => stderr.contains("No space left on device"),
      Self::Probe(_) => false,
    }
  }
}

/// Where the tools are, which encoder to drive, and what this ffmpeg can do.
#[derive(Debug, Clone)]
pub struct Tools {
  pub ffmpeg: PathBuf,
  pub ffprobe: PathBuf,
  pub encoder: Encoder,
  /// Whether this ffmpeg has the filters that bring an HDR picture down.
  pub tone_map: bool,
}

/// Proves the tools are there and that the encoder encodes, by encoding a
/// few black pictures, and learns what this ffmpeg can do. A machine set
/// up wrongly then says so as it starts, where it would otherwise fail
/// every video it was handed.
pub async fn check(tools: &mut Tools) -> Result<(), TranscodeError> {
  run(&tools.ffprobe, "ffprobe", &["-version".to_string()]).await?;
  let encoder = match tools.encoder {
    Encoder::Cpu => "libx264",
    Encoder::Nvidia => "h264_nvenc",
  };
  let trial = [
    "-hide_banner",
    "-nostdin",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=256x144:r=30:d=0.2",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=48000:cl=stereo:d=0.2",
    "-c:v",
    encoder,
    "-c:a",
    "aac",
    "-f",
    "null",
    "-",
  ]
  .map(String::from);
  run(&tools.ffmpeg, "ffmpeg", &trial).await?;
  let filters = Command::new(&tools.ffmpeg)
    .args(["-hide_banner", "-filters"])
    .stdin(Stdio::null())
    .output()
    .await
    .map_err(|source| TranscodeError::Start { tool: "ffmpeg", source })?;
  let filters = String::from_utf8_lossy(&filters.stdout);
  let has = |name: &str| filters.lines().any(|line| line.split_whitespace().nth(1) == Some(name));
  tools.tone_map = has("zscale") && has("tonemap");
  Ok(())
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
  let gain = if probed.has_audio {
    loudness(tools, source).await
  } else {
    None
  };

  let args = plan::hls_args(&Encode {
    source,
    out,
    probe: &probed,
    renditions: &renditions,
    encoder: tools.encoder,
    tone_map: tools.tone_map,
    gain,
  });
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

  // The ladder runs from the smallest size to the largest.
  if let (Some(smallest), Some(largest)) = (renditions.first(), renditions.last()) {
    let stream = |rendition: &plan::Rendition| out.join(&rendition.name).join("index.m3u8");
    run(
      &tools.ffmpeg,
      "ffmpeg",
      &plan::poster_args(&stream(largest), out, &probed),
    )
    .await?;
    run(&tools.ffmpeg, "ffmpeg", &plan::thumbnail_args(&stream(smallest), out)).await?;
  }
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

async fn ffprobe(tools: &Tools, source: &Path, args: &[&str]) -> Result<Vec<u8>, TranscodeError> {
  let output = Command::new(&tools.ffprobe)
    .args(args)
    .arg(source)
    .stdin(Stdio::null())
    .kill_on_drop(true)
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
  Ok(output.stdout)
}

async fn probe(tools: &Tools, source: &Path) -> Result<plan::Probe, TranscodeError> {
  let json = ffprobe(
    tools,
    source,
    &["-v", "error", "-print_format", "json", "-show_streams", "-show_format"],
  )
  .await?;
  match plan::probe(&json, None) {
    // A recording made in a browser states no length: MediaRecorder writes
    // the file as it goes and never returns to say how long it came to.
    Err(ProbeError::NoDuration) => {
      let packets = ffprobe(
        tools,
        source,
        &[
          "-v",
          "error",
          "-select_streams",
          "v:0",
          "-show_entries",
          "packet=pts_time,duration_time",
          "-of",
          "csv=p=0",
        ],
      )
      .await?;
      Ok(plan::probe(
        &json,
        plan::packets_end(&String::from_utf8_lossy(&packets)),
      )?)
    },
    probed => Ok(probed?),
  }
}

/// What to turn the sound by. A source whose loudness cannot be measured
/// plays as it is.
async fn loudness(tools: &Tools, source: &Path) -> Option<plan::Gain> {
  let output = Command::new(&tools.ffmpeg)
    .args(plan::loudness_args(source))
    .stdin(Stdio::null())
    .kill_on_drop(true)
    .output()
    .await
    .ok()?;
  plan::gain(&String::from_utf8_lossy(&output.stderr))
}

pub(crate) async fn run(program: &Path, tool: &'static str, args: &[String]) -> Result<(), TranscodeError> {
  output(program, tool, args, None).await.map(drop)
}

/// Runs a tool and gives back what it wrote. One still running after
/// `within` is killed and the file blamed: a document that keeps a tool
/// busy that long will do so on every machine.
pub(crate) async fn output(
  program: &Path,
  tool: &'static str,
  args: &[String],
  within: Option<Duration>,
) -> Result<Vec<u8>, TranscodeError> {
  let running = Command::new(program)
    .args(args)
    .stdin(Stdio::null())
    .kill_on_drop(true)
    .output();
  let output = match within {
    Some(within) => tokio::time::timeout(within, running)
      .await
      .map_err(|_| TranscodeError::Failed {
        tool,
        stderr: format!("{tool} was stopped after {} seconds", within.as_secs()),
      })?,
    None => running.await,
  }
  .map_err(|source| TranscodeError::Start { tool, source })?;
  if output.status.success() {
    Ok(output.stdout)
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

pub(crate) fn collect_tail(stderr: tokio::process::ChildStderr) -> tokio::task::JoinHandle<String> {
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
    let mut tools = Tools {
      ffmpeg: "ffmpeg".into(),
      ffprobe: "ffprobe".into(),
      encoder: Encoder::Cpu,
      tone_map: false,
    };
    check(&mut tools).await?;
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
