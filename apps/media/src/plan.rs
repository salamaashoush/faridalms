//! What a video becomes, decided before any work starts: which sizes to
//! stream at, the ffmpeg arguments that make them, and the thumbnail track
//! a player scrubs with. Nothing here runs a process, so all of it is
//! tested on its own.

use std::fmt::Write as _;
use std::path::Path;

use serde::{Deserialize, Serialize};

/// Segment length in seconds. Six keeps a seek close and the number of
/// requests low.
pub const SEGMENT_SECONDS: u32 = 6;
/// Keyframes every two seconds in every rendition, so a player can switch
/// sizes at any segment boundary.
const KEYFRAME_SECONDS: u32 = 2;
/// One thumbnail every five seconds, ten across and ten down per sheet.
pub const THUMB_EVERY: u32 = 5;
pub const THUMB_WIDTH: u32 = 160;
pub const THUMB_HEIGHT: u32 = 90;
const THUMB_COLUMNS: u32 = 10;
const THUMB_ROWS: u32 = 10;

/// What ffprobe says about a source.
#[derive(Debug, Clone, PartialEq)]
pub struct Probe {
  pub duration: f64,
  /// The picture as it is shown, after any rotation the file asks for.
  pub width: u32,
  pub height: u32,
  pub has_audio: bool,
}

#[derive(Deserialize)]
struct FfprobeOutput {
  #[serde(default)]
  streams: Vec<FfprobeStream>,
  format: Option<FfprobeFormat>,
}

#[derive(Deserialize)]
struct FfprobeStream {
  codec_type: String,
  width: Option<u32>,
  height: Option<u32>,
  #[serde(default)]
  side_data_list: Vec<SideData>,
  #[serde(default)]
  tags: Tags,
}

#[derive(Deserialize, Default)]
struct Tags {
  rotate: Option<String>,
}

#[derive(Deserialize)]
struct SideData {
  rotation: Option<f64>,
}

#[derive(Deserialize)]
struct FfprobeFormat {
  duration: Option<String>,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ProbeError {
  #[error("ffprobe's answer could not be read")]
  Unreadable,
  #[error("the file has no picture")]
  NoVideo,
  #[error("the file has no length")]
  NoDuration,
}

/// Reads `ffprobe -print_format json -show_streams -show_format`.
pub fn probe(json: &[u8]) -> Result<Probe, ProbeError> {
  let output: FfprobeOutput = serde_json::from_slice(json).map_err(|_| ProbeError::Unreadable)?;
  let video = output
    .streams
    .iter()
    .find(|stream| stream.codec_type == "video")
    .ok_or(ProbeError::NoVideo)?;
  let (width, height) = match (video.width, video.height) {
    (Some(width), Some(height)) if width > 0 && height > 0 => (width, height),
    _ => return Err(ProbeError::NoVideo),
  };
  let rotation = video
    .side_data_list
    .iter()
    .find_map(|side| side.rotation)
    .or_else(|| video.tags.rotate.as_deref().and_then(|value| value.parse().ok()))
    .unwrap_or(0.0);
  // A phone held upright records sideways and asks for a quarter turn.
  let turned = (rotation.abs() - 90.0).abs() < 1.0 || (rotation.abs() - 270.0).abs() < 1.0;
  let duration = output
    .format
    .and_then(|format| format.duration)
    .and_then(|value| value.parse::<f64>().ok())
    .filter(|seconds| seconds.is_finite() && *seconds > 0.0)
    .ok_or(ProbeError::NoDuration)?;
  Ok(Probe {
    duration,
    width: if turned { height } else { width },
    height: if turned { width } else { height },
    has_audio: output.streams.iter().any(|stream| stream.codec_type == "audio"),
  })
}

/// One size a video streams at.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Rendition {
  pub name: String,
  pub height: u32,
  /// Video bits per second.
  pub bandwidth: u32,
}

/// Heights and bitrates, close to what YouTube and Apple's authoring
/// guidelines use for the same sizes.
const LADDER: [(u32, u32); 4] = [(360, 800_000), (540, 1_600_000), (720, 2_800_000), (1080, 5_000_000)];

/// Every size up to the source's own, and never larger: a 480p phone clip
/// streams at 360p and 480p, not at an upscaled 720p.
#[must_use]
pub fn ladder(probe: &Probe) -> Vec<Rendition> {
  let source = probe.height - probe.height % 2;
  let mut rungs: Vec<Rendition> = LADDER
    .iter()
    .filter(|(height, _)| *height <= source)
    .map(|&(height, bandwidth)| Rendition {
      name: format!("{height}p"),
      height,
      bandwidth,
    })
    .collect();
  let top = rungs.last().map_or(0, |rung| rung.height);
  if source > top && (rungs.is_empty() || source < 1080) {
    // The source's own size, between two rungs or below the smallest.
    let bandwidth = LADDER
      .iter()
      .find(|(height, _)| *height >= source)
      .map_or(5_000_000, |&(_, rate)| rate);
    rungs.push(Rendition {
      name: format!("{source}p"),
      height: source,
      bandwidth,
    });
  }
  rungs
}

/// The encoder, chosen by the machine the service runs on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Encoder {
  /// x264 on the CPU: everywhere, and the reference for quality.
  Cpu,
  /// NVIDIA's encoder, many times faster where a GPU is present.
  Nvidia,
}

impl Encoder {
  #[must_use]
  pub fn parse(value: &str) -> Option<Self> {
    match value {
      "libx264" | "cpu" => Some(Self::Cpu),
      "h264_nvenc" | "nvidia" => Some(Self::Nvidia),
      _ => None,
    }
  }
}

/// The ffmpeg arguments that turn `source` into HLS under `out`: every
/// rendition with keyframes aligned across them, fMP4 segments, one shared
/// audio rendition that also serves listeners on a weak connection, and a
/// master playlist naming them all. Progress goes to stdout.
#[must_use]
pub fn hls_args(source: &Path, out: &Path, probe: &Probe, renditions: &[Rendition], encoder: Encoder) -> Vec<String> {
  let mut args: Vec<String> = [
    "-hide_banner",
    "-nostdin",
    "-y",
    "-nostats",
    "-progress",
    "pipe:1",
    "-i",
  ]
  .map(String::from)
  .to_vec();
  args.push(source.display().to_string());

  let count = renditions.len();
  let mut graph = format!("[0:v]split={count}");
  for index in 0..count {
    let _ = write!(graph, "[s{index}]");
  }
  for (index, rendition) in renditions.iter().enumerate() {
    let _ = write!(
      graph,
      ";[s{index}]scale=-2:{},format=yuv420p[v{index}]",
      rendition.height
    );
  }
  args.extend(["-filter_complex".into(), graph]);

  let mut streams = Vec::new();
  if probe.has_audio {
    args.extend(["-map", "0:a:0", "-c:a", "aac", "-b:a", "128k", "-ac", "2"].map(String::from));
    streams.push("a:0,agroup:audio,name:audio".to_string());
  }
  for (index, rendition) in renditions.iter().enumerate() {
    let kbps = rendition.bandwidth / 1000;
    args.extend(["-map".into(), format!("[v{index}]")]);
    match encoder {
      Encoder::Cpu => args.extend([
        format!("-c:v:{index}"),
        "libx264".into(),
        format!("-preset:v:{index}"),
        "veryfast".into(),
        format!("-profile:v:{index}"),
        "main".into(),
      ]),
      Encoder::Nvidia => args.extend([
        format!("-c:v:{index}"),
        "h264_nvenc".into(),
        format!("-preset:v:{index}"),
        "p4".into(),
        format!("-profile:v:{index}"),
        "main".into(),
      ]),
    }
    args.extend([
      format!("-b:v:{index}"),
      format!("{kbps}k"),
      format!("-maxrate:v:{index}"),
      format!("{}k", kbps * 107 / 100),
      format!("-bufsize:v:{index}"),
      format!("{}k", kbps * 3 / 2),
    ]);
    streams.push(if probe.has_audio {
      format!("v:{index},agroup:audio,name:{}", rendition.name)
    } else {
      format!("v:{index},name:{}", rendition.name)
    });
  }
  args.extend([
    "-force_key_frames".into(),
    format!("expr:gte(t,n_forced*{KEYFRAME_SECONDS})"),
    "-sc_threshold".into(),
    "0".into(),
    "-f".into(),
    "hls".into(),
    "-hls_time".into(),
    SEGMENT_SECONDS.to_string(),
    "-hls_playlist_type".into(),
    "vod".into(),
    "-hls_segment_type".into(),
    "fmp4".into(),
    "-hls_flags".into(),
    "independent_segments".into(),
    "-hls_fmp4_init_filename".into(),
    "init.mp4".into(),
    "-hls_segment_filename".into(),
    out.join("%v").join("seg_%04d.m4s").display().to_string(),
    "-master_pl_name".into(),
    "master.m3u8".into(),
    "-var_stream_map".into(),
    streams.join(" "),
    out.join("%v").join("index.m3u8").display().to_string(),
  ]);
  args
}

/// A frame a tenth of the way in, as the poster: past any black lead-in.
#[must_use]
pub fn poster_args(source: &Path, out: &Path, probe: &Probe) -> Vec<String> {
  let at = format!("{:.2}", probe.duration / 10.0);
  [
    "-hide_banner",
    "-nostdin",
    "-y",
    "-ss",
    &at,
    "-i",
    &source.display().to_string(),
    "-frames:v",
    "1",
    "-vf",
    "scale=-2:min(720\\,ih)",
    "-q:v",
    "3",
    &out.join("poster.jpg").display().to_string(),
  ]
  .map(String::from)
  .to_vec()
}

/// Sheets of thumbnails, one every few seconds, letterboxed to one size.
#[must_use]
pub fn thumbnail_args(source: &Path, out: &Path) -> Vec<String> {
  let filter = format!(
    "fps=1/{THUMB_EVERY},scale={THUMB_WIDTH}:{THUMB_HEIGHT}:force_original_aspect_ratio=decrease,\
     pad={THUMB_WIDTH}:{THUMB_HEIGHT}:(ow-iw)/2:(oh-ih)/2,tile={THUMB_COLUMNS}x{THUMB_ROWS}"
  );
  [
    "-hide_banner",
    "-nostdin",
    "-y",
    "-i",
    &source.display().to_string(),
    "-vf",
    &filter,
    "-q:v",
    "5",
    &out.join("thumbs").join("sheet_%03d.jpg").display().to_string(),
  ]
  .map(String::from)
  .to_vec()
}

fn timestamp(seconds: u32) -> String {
  format!("{:02}:{:02}:{:02}.000", seconds / 3600, seconds / 60 % 60, seconds % 60)
}

/// The WebVTT track pointing each stretch of the video at its thumbnail on
/// the sheets, as players read them.
#[must_use]
pub fn thumbnail_track(duration: f64) -> String {
  let mut track = String::from("WEBVTT\n");
  let per_sheet = THUMB_COLUMNS * THUMB_ROWS;
  let mut start = 0_u32;
  let mut index = 0_u32;
  while f64::from(start) < duration {
    let end = start + THUMB_EVERY;
    let sheet = index / per_sheet + 1;
    let cell = index % per_sheet;
    let x = cell % THUMB_COLUMNS * THUMB_WIDTH;
    let y = cell / THUMB_COLUMNS * THUMB_HEIGHT;
    let _ = write!(
      track,
      "\n{} --> {}\nsheet_{sheet:03}.jpg#xywh={x},{y},{THUMB_WIDTH},{THUMB_HEIGHT}\n",
      timestamp(start),
      timestamp(end)
    );
    start = end;
    index += 1;
  }
  track
}

/// What the API keeps about a streamed video.
/// Cuts a recording down to the part its maker kept, as an MP4 every
/// browser plays. The cut is made on the decoded pictures, not at the
/// nearest keyframe, so it falls where the maker put it.
#[must_use]
pub fn cut_args(source: &Path, to: &Path, start: f64, end: f64) -> Vec<String> {
  let mut args: Vec<String> = ["-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-i"]
    .map(String::from)
    .to_vec();
  args.push(source.display().to_string());
  args.extend(
    [
      "-ss".to_string(),
      format!("{:.3}", start.max(0.0)),
      "-t".to_string(),
      format!("{:.3}", (end - start).max(0.0)),
    ]
    .into_iter()
    .chain(
      [
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        "-f",
        "mp4",
      ]
      .map(String::from),
    ),
  );
  args.push(to.display().to_string());
  args
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
  pub duration_seconds: f64,
  pub width: u32,
  pub height: u32,
  pub renditions: Vec<Rendition>,
  pub audio: bool,
  pub master: String,
  pub poster: String,
  pub thumbnails: String,
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn a_cut_keeps_the_seconds_between_its_ends() {
    let args = cut_args(Path::new("in.webm"), Path::new("cut.mp4"), 2.5, 61.0);
    let at = |flag: &str| {
      args
        .iter()
        .position(|arg| arg == flag)
        .and_then(|index| args.get(index + 1))
        .map(String::as_str)
    };
    assert_eq!(at("-i"), Some("in.webm"));
    assert_eq!(at("-ss"), Some("2.500"));
    assert_eq!(at("-t"), Some("58.500"));
    // The cut follows the input, so it is made on decoded pictures.
    assert!(args.iter().position(|arg| arg == "-ss") > args.iter().position(|arg| arg == "-i"));
    assert_eq!(args.last().map(String::as_str), Some("cut.mp4"));
    // Ends given the wrong way round cut nothing rather than fail oddly.
    let backwards = cut_args(Path::new("in"), Path::new("out"), 9.0, 3.0);
    assert_eq!(
      backwards
        .iter()
        .position(|arg| arg == "-t")
        .and_then(|index| backwards.get(index + 1))
        .map(String::as_str),
      Some("0.000")
    );
  }

  fn probed(height: u32, audio: bool) -> Probe {
    Probe {
      duration: 61.5,
      width: height * 16 / 9,
      height,
      has_audio: audio,
    }
  }

  #[test]
  fn reads_a_phone_clip_held_upright() {
    let json = br#"{"streams":[{"codec_type":"video","width":1920,"height":1080,
      "side_data_list":[{"rotation":-90}]},{"codec_type":"audio"}],
      "format":{"duration":"12.480000"}}"#;
    assert_eq!(
      probe(json),
      Ok(Probe {
        duration: 12.48,
        width: 1080,
        height: 1920,
        has_audio: true
      })
    );
  }

  #[test]
  fn refuses_a_file_without_a_picture_or_a_length() {
    assert_eq!(
      probe(br#"{"streams":[{"codec_type":"audio"}],"format":{"duration":"3"}}"#),
      Err(ProbeError::NoVideo)
    );
    assert_eq!(
      probe(br#"{"streams":[{"codec_type":"video","width":640,"height":360}],"format":{}}"#),
      Err(ProbeError::NoDuration)
    );
    assert_eq!(probe(b"nonsense"), Err(ProbeError::Unreadable));
  }

  #[test]
  fn never_streams_larger_than_the_source() {
    let names = |height| {
      ladder(&probed(height, true))
        .into_iter()
        .map(|rung| rung.name)
        .collect::<Vec<_>>()
    };
    assert_eq!(names(2160), ["360p", "540p", "720p", "1080p"]);
    assert_eq!(names(1080), ["360p", "540p", "720p", "1080p"]);
    assert_eq!(names(720), ["360p", "540p", "720p"]);
    assert_eq!(names(480), ["360p", "480p"]);
    assert_eq!(names(240), ["240p"]);
  }

  #[test]
  fn maps_one_audio_rendition_beside_every_picture_size() {
    let probe = probed(720, true);
    let args = hls_args(
      Path::new("in.mp4"),
      Path::new("/out"),
      &probe,
      &ladder(&probe),
      Encoder::Cpu,
    );
    let map = args
      .iter()
      .position(|arg| arg == "-var_stream_map")
      .map(|at| &args[at + 1]);
    assert_eq!(
      map.map(String::as_str),
      Some(
        "a:0,agroup:audio,name:audio v:0,agroup:audio,name:360p v:1,agroup:audio,name:540p v:2,agroup:audio,name:720p"
      )
    );
    assert!(
      args
        .iter()
        .any(|arg| arg.contains(";[s0]scale=-2:360,format=yuv420p[v0]"))
    );
  }

  #[test]
  fn a_silent_video_has_no_audio_group() {
    let probe = probed(360, false);
    let args = hls_args(
      Path::new("in.mp4"),
      Path::new("/out"),
      &probe,
      &ladder(&probe),
      Encoder::Cpu,
    );
    assert!(!args.iter().any(|arg| arg == "0:a:0"));
    assert!(args.iter().any(|arg| arg == "v:0,name:360p"));
  }

  #[test]
  fn points_each_stretch_at_its_thumbnail() {
    let track = thumbnail_track(12.0);
    assert_eq!(
      track,
      "WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nsheet_001.jpg#xywh=0,0,160,90\n\
       \n00:00:05.000 --> 00:00:10.000\nsheet_001.jpg#xywh=160,0,160,90\n\
       \n00:00:10.000 --> 00:00:15.000\nsheet_001.jpg#xywh=320,0,160,90\n"
    );
    let long = thumbnail_track(f64::from(THUMB_EVERY * 101));
    assert!(long.contains("sheet_002.jpg#xywh=0,0,160,90"));
  }
}
