//! What a video becomes, decided before any work starts: which sizes to
//! stream at, the ffmpeg arguments that make them, how loud it plays, and
//! the thumbnail track a player scrubs with. Nothing here runs a process,
//! so all of it is tested on its own.

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
/// Pictures a second, at most. The ladder's bitrates are sized for thirty;
/// sixty at the same rates would show each picture worse.
const MAX_FPS: u32 = 30;
/// x264's constant quality, lower being better. Each size is encoded to
/// this quality and never above its rate on the ladder. A teacher talking
/// to a camera measures as good as at the ladder's full rate (VMAF 94 at
/// 720p) for half the bits; a busy picture still gets the whole rate.
const CRF: u32 = 21;
/// NVENC's constant quality on its own scale, which measures no worse
/// than x264 at `CRF` for about the same bits.
const NVENC_CQ: u32 = 28;
/// How loud every video plays, in LUFS: what phones and laptops are
/// mastered for, so a quiet recording needs no reaching for the volume.
pub const LOUDNESS: f64 = -16.0;
/// The highest peak left after the sound is turned up, in decibels.
const PEAK: f64 = -1.5;
/// A recording quieter than this is taken to hold no speech to bring up.
const SILENT: f64 = -50.0;
/// The most the sound is turned up or down.
const MAX_GAIN: f64 = 20.0;

/// What ffprobe says about a source.
#[derive(Debug, Clone, PartialEq)]
pub struct Probe {
  pub duration: f64,
  /// The picture as it is shown, after any rotation the file asks for.
  pub width: u32,
  pub height: u32,
  pub has_audio: bool,
  /// Pictures a second on average; none when the file does not say, as a
  /// browser's recording does not.
  pub fps: Option<f64>,
  /// Whether the picture is HDR, as a phone records it, and looks washed
  /// out on an ordinary screen unless it is brought down.
  pub hdr: bool,
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
  avg_frame_rate: Option<String>,
  color_transfer: Option<String>,
  duration: Option<String>,
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

fn seconds(value: Option<&String>) -> Option<f64> {
  value
    .and_then(|value| value.parse::<f64>().ok())
    .filter(|seconds| seconds.is_finite() && *seconds > 0.0)
}

/// `30000/1001` as ffprobe writes a rate; `0/0` is a rate it does not know.
fn rate(value: &str) -> Option<f64> {
  let (above, below) = value.split_once('/')?;
  let rate = above.parse::<f64>().ok()? / below.parse::<f64>().ok()?;
  (rate.is_finite() && rate > 0.0).then_some(rate)
}

/// Where the last picture ends, from `ffprobe -show_entries
/// packet=pts_time,duration_time -of csv=p=0`: the length of a file that
/// does not state one.
#[must_use]
pub fn packets_end(csv: &str) -> Option<f64> {
  csv
    .lines()
    .filter_map(|line| {
      let mut fields = line.split(',');
      let at = fields.next()?.trim().parse::<f64>().ok()?;
      let lasts = fields
        .next()
        .and_then(|value| value.trim().parse::<f64>().ok())
        .unwrap_or(0.0);
      Some(at + lasts)
    })
    .filter(|end| end.is_finite() && *end > 0.0)
    .reduce(f64::max)
}

/// Reads `ffprobe -print_format json -show_streams -show_format`. A
/// recording made in a browser states no length anywhere; `measured` is
/// the length found by reading it through, once that has been done.
pub fn probe(json: &[u8], measured: Option<f64>) -> Result<Probe, ProbeError> {
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
  let duration = seconds(output.format.as_ref().and_then(|format| format.duration.as_ref()))
    .or_else(|| seconds(video.duration.as_ref()))
    .or(measured.filter(|seconds| seconds.is_finite() && *seconds > 0.0))
    .ok_or(ProbeError::NoDuration)?;
  Ok(Probe {
    duration,
    width: if turned { height } else { width },
    height: if turned { width } else { height },
    has_audio: output.streams.iter().any(|stream| stream.codec_type == "audio"),
    fps: video.avg_frame_rate.as_deref().and_then(rate),
    hdr: matches!(video.color_transfer.as_deref(), Some("smpte2084" | "arib-std-b67")),
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

/// One encode: a source, where its streams go, and what is done to it on
/// the way.
#[derive(Debug, Clone, Copy)]
pub struct Encode<'a> {
  pub source: &'a Path,
  pub out: &'a Path,
  pub probe: &'a Probe,
  pub renditions: &'a [Rendition],
  pub encoder: Encoder,
  /// Whether this ffmpeg can bring an HDR picture down to what every
  /// screen shows.
  pub tone_map: bool,
  /// What the sound is turned up or down by, when it is.
  pub gain: Option<Gain>,
}

/// Brings an HDR picture down to the range and colours every screen shows:
/// to linear light, to BT.709's colours, the highlights rolled off, and
/// back to eight bits. Mobius leaves everything under the highlights as it
/// was; the filmic curves darken the whole picture, and measured no closer
/// to the scene than doing nothing.
const TONE_MAP: &str = "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=mobius:desat=0,\
                        zscale=t=bt709:m=bt709:r=tv,format=yuv420p";

/// What is done to every picture before it is resized, ending in a comma,
/// or nothing. `top` is the tallest size wanted, so a 4K HDR picture is
/// brought down in size before the costly work on its colours.
fn prepared(probe: &Probe, tone_map: bool, top: u32) -> String {
  let mut chain = String::new();
  // A browser's recording has no steady rate, and a phone may record sixty.
  if probe.fps.is_none_or(|fps| fps > f64::from(MAX_FPS) + 0.5) {
    let _ = write!(chain, "fps={MAX_FPS},");
  }
  if probe.hdr && tone_map {
    if top > 0 && probe.height > top {
      let _ = write!(chain, "scale=-2:{top},");
    }
    let _ = write!(chain, "{TONE_MAP},");
  }
  chain
}

/// How one size's pictures are encoded: to a constant quality, and never
/// above `kbps`.
fn picture_args(encoder: Encoder, index: usize, kbps: u32) -> Vec<String> {
  let mut args = match encoder {
    Encoder::Cpu => vec![
      format!("-c:v:{index}"),
      "libx264".into(),
      format!("-preset:v:{index}"),
      "veryfast".into(),
      format!("-profile:v:{index}"),
      "main".into(),
      format!("-crf:v:{index}"),
      CRF.to_string(),
      // x264 starts a keyframe at a change of scene, which falls at a
      // different picture in each size.
      format!("-sc_threshold:v:{index}"),
      "0".into(),
    ],
    Encoder::Nvidia => vec![
      format!("-c:v:{index}"),
      "h264_nvenc".into(),
      format!("-preset:v:{index}"),
      "p4".into(),
      format!("-profile:v:{index}"),
      "main".into(),
      format!("-rc:v:{index}"),
      "vbr".into(),
      format!("-cq:v:{index}"),
      NVENC_CQ.to_string(),
      format!("-b:v:{index}"),
      "0".into(),
      // NVENC makes a forced keyframe an ordinary I-frame unless told
      // otherwise, and a segment can only start at an IDR.
      format!("-forced-idr:v:{index}"),
      "1".into(),
    ],
  };
  args.extend([
    format!("-maxrate:v:{index}"),
    format!("{kbps}k"),
    format!("-bufsize:v:{index}"),
    format!("{}k", kbps * 2),
  ]);
  args
}

/// The ffmpeg arguments that turn a source into HLS: every rendition with
/// keyframes aligned across them, fMP4 segments, one shared audio rendition
/// that also serves listeners on a weak connection, and a master playlist
/// naming them all. Progress goes to stdout.
#[must_use]
pub fn hls_args(encode: &Encode<'_>) -> Vec<String> {
  let Encode {
    source,
    out,
    probe,
    renditions,
    encoder,
    tone_map,
    gain,
  } = *encode;
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
  let top = renditions.iter().map(|rendition| rendition.height).max().unwrap_or(0);
  let mut graph = format!("[0:v]{}split={count}", prepared(probe, tone_map, top));
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
    if let Some(gain) = gain {
      args.extend(["-filter:a".into(), gain.filter()]);
    }
    streams.push("a:0,agroup:audio,name:audio".to_string());
  }
  for (index, rendition) in renditions.iter().enumerate() {
    args.extend(["-map".into(), format!("[v{index}]")]);
    args.extend(picture_args(encoder, index, rendition.bandwidth / 1000));
    streams.push(if probe.has_audio {
      format!("v:{index},agroup:audio,name:{}", rendition.name)
    } else {
      format!("v:{index},name:{}", rendition.name)
    });
  }
  args.extend([
    "-force_key_frames".into(),
    format!("expr:gte(t,n_forced*{KEYFRAME_SECONDS})"),
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
/// It is taken from `stream`, the largest size just made, whose colours
/// are already what every screen shows.
#[must_use]
pub fn poster_args(stream: &Path, out: &Path, probe: &Probe) -> Vec<String> {
  let at = format!("{:.2}", probe.duration / 10.0);
  [
    "-hide_banner",
    "-nostdin",
    "-y",
    "-ss",
    &at,
    "-i",
    &stream.display().to_string(),
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
/// They are read from `stream`, the smallest size just made: reading the
/// upload again took a third as long as encoding it, and beside the
/// streams in one command ffmpeg says how far it has got only as often as
/// a sheet fills.
#[must_use]
pub fn thumbnail_args(stream: &Path, out: &Path) -> Vec<String> {
  let filter = format!(
    "fps=1/{THUMB_EVERY},scale={THUMB_WIDTH}:{THUMB_HEIGHT}:force_original_aspect_ratio=decrease,\
     pad={THUMB_WIDTH}:{THUMB_HEIGHT}:(ow-iw)/2:(oh-ih)/2,tile={THUMB_COLUMNS}x{THUMB_ROWS}"
  );
  [
    "-hide_banner",
    "-nostdin",
    "-y",
    "-i",
    &stream.display().to_string(),
    "-vf",
    &filter,
    "-q:v",
    "5",
    &out.join("thumbs").join("sheet_%03d.jpg").display().to_string(),
  ]
  .map(String::from)
  .to_vec()
}

/// What the sound is turned up or down by so that every video plays about
/// as loud: decibels, and whether its peaks would then pass the ceiling and
/// are held under it.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Gain {
  pub decibels: f64,
  pub limited: bool,
}

impl Gain {
  fn filter(self) -> String {
    if self.limited {
      // The limiter's own levelling would undo the loudness just set.
      format!(
        "volume={:.2}dB,alimiter=limit={:.4}:level=false",
        self.decibels,
        10_f64.powf(PEAK / 20.0)
      )
    } else {
      format!("volume={:.2}dB", self.decibels)
    }
  }
}

/// Measures how loud a source is, sound only. The measurement comes at the
/// end of what ffmpeg says, for `gain` to read.
#[must_use]
pub fn loudness_args(source: &Path) -> Vec<String> {
  [
    "-hide_banner",
    "-nostdin",
    "-i",
    &source.display().to_string(),
    "-vn",
    "-map",
    "0:a:0",
    "-af",
    "loudnorm=print_format=json",
    "-f",
    "null",
    "-",
  ]
  .map(String::from)
  .to_vec()
}

#[derive(Deserialize)]
struct Measured {
  input_i: String,
  input_tp: String,
}

/// What to turn the sound by, from what `loudness_args` measured: nothing
/// for silence, for a source that is already about right, or when the
/// measurement cannot be read.
#[must_use]
pub fn gain(report: &str) -> Option<Gain> {
  let json = report.get(report.rfind('{')?..=report.rfind('}')?)?;
  let measured: Measured = serde_json::from_str(json).ok()?;
  let loud: f64 = measured.input_i.parse().ok()?;
  let peak: f64 = measured.input_tp.parse().ok()?;
  if !loud.is_finite() || !peak.is_finite() || loud < SILENT {
    return None;
  }
  let decibels = (LOUDNESS - loud).clamp(-MAX_GAIN, MAX_GAIN);
  (decibels.abs() >= 0.5).then_some(Gain {
    decibels,
    limited: peak + decibels > PEAK,
  })
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
      fps: Some(30.0),
      hdr: false,
    }
  }

  fn encode<'a>(probe: &'a Probe, renditions: &'a [Rendition], encoder: Encoder) -> Encode<'a> {
    Encode {
      source: Path::new("in.mp4"),
      out: Path::new("/out"),
      probe,
      renditions,
      encoder,
      tone_map: true,
      gain: None,
    }
  }

  fn after<'a>(args: &'a [String], flag: &str) -> Option<&'a str> {
    args
      .iter()
      .position(|arg| arg == flag)
      .and_then(|index| args.get(index + 1))
      .map(String::as_str)
  }

  #[test]
  fn reads_a_phone_clip_held_upright() {
    let json = br#"{"streams":[{"codec_type":"video","width":1920,"height":1080,
      "avg_frame_rate":"30000/1001","side_data_list":[{"rotation":-90}]},{"codec_type":"audio"}],
      "format":{"duration":"12.480000"}}"#;
    assert_eq!(
      probe(json, None),
      Ok(Probe {
        duration: 12.48,
        width: 1080,
        height: 1920,
        has_audio: true,
        fps: Some(30000.0 / 1001.0),
        hdr: false,
      })
    );
  }

  #[test]
  fn refuses_a_file_without_a_picture_or_a_length() {
    assert_eq!(
      probe(
        br#"{"streams":[{"codec_type":"audio"}],"format":{"duration":"3"}}"#,
        None
      ),
      Err(ProbeError::NoVideo)
    );
    assert_eq!(
      probe(
        br#"{"streams":[{"codec_type":"video","width":640,"height":360}],"format":{}}"#,
        None
      ),
      Err(ProbeError::NoDuration)
    );
    assert_eq!(probe(b"nonsense", None), Err(ProbeError::Unreadable));
  }

  /// A browser's recording states no length and no steady rate.
  #[test]
  fn takes_the_length_of_a_browsers_recording_from_its_pictures() {
    let json = br#"{"streams":[{"codec_type":"video","width":1280,"height":720,
      "avg_frame_rate":"0/0","duration":"N/A"}],"format":{"format_name":"matroska,webm"}}"#;
    assert_eq!(probe(json, None), Err(ProbeError::NoDuration));
    let read = probe(
      json,
      packets_end("0.000000,0.033000\n4.966000,0.033000\n4.933000,0.033000\n"),
    );
    assert!(read.as_ref().is_ok_and(|probe| (probe.duration - 4.999).abs() < 1e-9));
    assert_eq!(read.map(|probe| probe.fps), Ok(None));
    // Packets without a length of their own still end somewhere.
    assert_eq!(packets_end("0.000000,N/A\n2.500000,N/A\n"), Some(2.5));
    assert_eq!(packets_end(""), None);
  }

  #[test]
  fn knows_an_hdr_picture_by_how_its_light_is_written() {
    let with = |transfer: &str| {
      probe(
        format!(
          r#"{{"streams":[{{"codec_type":"video","width":3840,"height":2160,"color_transfer":"{transfer}"}}],
            "format":{{"duration":"9"}}}}"#
        )
        .as_bytes(),
        None,
      )
      .map(|probe| probe.hdr)
    };
    assert_eq!(with("arib-std-b67"), Ok(true));
    assert_eq!(with("smpte2084"), Ok(true));
    assert_eq!(with("bt709"), Ok(false));
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
    let renditions = ladder(&probe);
    let args = hls_args(&encode(&probe, &renditions, Encoder::Cpu));
    assert_eq!(
      after(&args, "-var_stream_map"),
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
    let renditions = ladder(&probe);
    let args = hls_args(&encode(&probe, &renditions, Encoder::Cpu));
    assert!(!args.iter().any(|arg| arg == "0:a:0"));
    assert!(args.iter().any(|arg| arg == "v:0,name:360p"));
  }

  #[test]
  fn each_size_is_held_to_a_quality_and_under_its_rate() {
    let probe = probed(720, true);
    let renditions = ladder(&probe);
    let cpu = hls_args(&encode(&probe, &renditions, Encoder::Cpu));
    assert_eq!(after(&cpu, "-crf:v:2"), Some("21"));
    assert_eq!(after(&cpu, "-maxrate:v:2"), Some("2800k"));
    assert_eq!(after(&cpu, "-bufsize:v:2"), Some("5600k"));
    assert_eq!(after(&cpu, "-sc_threshold:v:0"), Some("0"));
    // A rate to aim at would spend it on a still slide too.
    assert!(!cpu.iter().any(|arg| arg.starts_with("-b:v")));
  }

  /// Without this NVENC answers a forced keyframe with a plain I-frame, and
  /// the six-second segments come out at its own 250 pictures.
  #[test]
  fn nvenc_starts_every_forced_keyframe_as_an_idr() {
    let probe = probed(720, true);
    let renditions = ladder(&probe);
    let args = hls_args(&encode(&probe, &renditions, Encoder::Nvidia));
    for index in 0..renditions.len() {
      assert_eq!(after(&args, &format!("-forced-idr:v:{index}")), Some("1"));
      assert_eq!(after(&args, &format!("-c:v:{index}")), Some("h264_nvenc"));
    }
    assert_eq!(after(&args, "-force_key_frames"), Some("expr:gte(t,n_forced*2)"));
  }

  #[test]
  fn the_poster_and_thumbnails_are_read_from_the_streams_just_made() {
    let poster = poster_args(Path::new("/out/720p/index.m3u8"), Path::new("/out"), &probed(720, true));
    assert_eq!(after(&poster, "-i"), Some("/out/720p/index.m3u8"));
    assert_eq!(after(&poster, "-ss"), Some("6.15"));
    assert_eq!(poster.last().map(String::as_str), Some("/out/poster.jpg"));
    let thumbs = thumbnail_args(Path::new("/out/360p/index.m3u8"), Path::new("/out"));
    assert_eq!(after(&thumbs, "-i"), Some("/out/360p/index.m3u8"));
    assert_eq!(
      after(&thumbs, "-vf"),
      Some("fps=1/5,scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2,tile=10x10")
    );
    assert_eq!(thumbs.last().map(String::as_str), Some("/out/thumbs/sheet_%03d.jpg"));
  }

  #[test]
  fn a_recording_without_a_steady_rate_and_a_fast_one_play_at_thirty() {
    let graph_of = |fps: Option<f64>| {
      let probe = Probe {
        fps,
        ..probed(360, true)
      };
      let renditions = ladder(&probe);
      after(&hls_args(&encode(&probe, &renditions, Encoder::Cpu)), "-filter_complex").map(str::to_owned)
    };
    assert!(graph_of(None).is_some_and(|graph| graph.starts_with("[0:v]fps=30,split=")));
    assert!(graph_of(Some(60.0)).is_some_and(|graph| graph.starts_with("[0:v]fps=30,split=")));
    assert!(graph_of(Some(29.97)).is_some_and(|graph| graph.starts_with("[0:v]split=")));
    assert!(graph_of(Some(25.0)).is_some_and(|graph| graph.starts_with("[0:v]split=")));
  }

  #[test]
  fn an_hdr_picture_is_brought_down_once_at_the_largest_size_wanted() {
    let probe = Probe {
      hdr: true,
      ..probed(2160, true)
    };
    let renditions = ladder(&probe);
    let args = hls_args(&encode(&probe, &renditions, Encoder::Cpu));
    let graph = after(&args, "-filter_complex").unwrap_or_default();
    assert!(graph.starts_with("[0:v]scale=-2:1080,zscale=t=linear:npl=100,"));
    assert!(graph.contains("tonemap=tonemap=mobius:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p,split=4"));

    // An ffmpeg that cannot do it encodes the picture as it is.
    let plain = hls_args(&Encode {
      tone_map: false,
      ..encode(&probe, &renditions, Encoder::Cpu)
    });
    assert!(after(&plain, "-filter_complex").is_some_and(|graph| graph.starts_with("[0:v]split=4")));
  }

  fn measured(loud: &str, peak: &str) -> String {
    format!(
      "[Parsed_loudnorm_0 @ 0x55d0] \n{{\n\t\"input_i\" : \"{loud}\",\n\t\"input_tp\" : \"{peak}\",\n\
       \t\"input_lra\" : \"4.10\",\n\t\"target_offset\" : \"0.20\"\n}}\n"
    )
  }

  #[test]
  fn turns_a_quiet_recording_up_to_the_loudness_every_video_plays_at() {
    assert_eq!(
      gain(&measured("-27.50", "-14.00")),
      Some(Gain {
        decibels: 11.5,
        limited: false
      })
    );
    // Turned up this far its peaks would clip, so they are held under the ceiling.
    let peaky = gain(&measured("-30.00", "-3.00"));
    assert_eq!(
      peaky,
      Some(Gain {
        decibels: 14.0,
        limited: true
      })
    );
    assert_eq!(
      peaky.map(Gain::filter).as_deref(),
      Some("volume=14.00dB,alimiter=limit=0.8414:level=false")
    );
    assert_eq!(
      gain(&measured("-9.00", "-0.20")),
      Some(Gain {
        decibels: -7.0,
        limited: false
      })
    );
  }

  #[test]
  fn leaves_silence_and_sound_that_is_already_right_alone() {
    assert_eq!(gain(&measured("-16.30", "-2.00")), None);
    assert_eq!(gain(&measured("-70.00", "-60.00")), None);
    assert_eq!(gain(&measured("-inf", "-inf")), None);
    assert_eq!(gain("Output file #0 does not contain any stream"), None);
    // Never by more than the most, however faint the speech.
    assert_eq!(
      gain(&measured("-45.00", "-30.00")).map(|gain| gain.decibels),
      Some(20.0)
    );
  }

  #[test]
  fn a_gain_goes_on_the_sound_and_nowhere_when_there_is_none() {
    let probe = probed(360, true);
    let renditions = ladder(&probe);
    let turned = Encode {
      gain: Some(Gain {
        decibels: 6.2,
        limited: false,
      }),
      ..encode(&probe, &renditions, Encoder::Cpu)
    };
    assert_eq!(after(&hls_args(&turned), "-filter:a"), Some("volume=6.20dB"));
    assert_eq!(
      after(&hls_args(&encode(&probe, &renditions, Encoder::Cpu)), "-filter:a"),
      None
    );
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
