//! Makes what a file is shown by before it is opened: a picture's smaller
//! sizes and placeholder, a recording's length and waveform, a document's
//! first page. Pictures are decoded here; sound goes through ffmpeg, PDFs
//! through poppler, and office files through LibreOffice when one is named.

use std::io::{BufWriter, Cursor};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use image::codecs::avif::AvifEncoder;
use image::codecs::gif::GifDecoder;
use image::codecs::jpeg::{JpegDecoder, JpegEncoder};
use image::codecs::png::{PngDecoder, PngEncoder};
use image::codecs::webp::WebPDecoder;
use image::imageops::FilterType;
use image::metadata::Orientation;
use image::{AnimationDecoder, DynamicImage, ExtendedColorType, ImageDecoder, ImageEncoder, ImageError, Limits};
use serde::Serialize;
use tokio::io::AsyncReadExt;
use tokio::process::Command;

use crate::api::Replaced;
use crate::transcode::{Tools, TranscodeError, collect_tail, output, run};

/// Where the document tools are, and what this machine can do with them.
#[derive(Debug, Clone)]
pub struct Previews {
  pub pdftoppm: PathBuf,
  pub pdfinfo: PathBuf,
  /// Whether pdftoppm ran when the service started, so PDFs can be drawn.
  pub pdf: bool,
  /// LibreOffice, which turns office files into PDFs; none turns none.
  pub office: Option<PathBuf>,
}

#[derive(Debug, thiserror::Error)]
pub enum PreviewError {
  #[error("{0}")]
  Unreadable(String),
  #[error("{0} is not a kind of file previews are made of")]
  Unknown(String),
  #[error(transparent)]
  Tool(#[from] TranscodeError),
  #[error("the preview could not be written: {0}")]
  Write(#[from] std::io::Error),
}

impl PreviewError {
  /// Whether the machine is at fault and not the file: a tool that is not
  /// there or a disk that cannot be written.
  #[must_use]
  pub fn is_the_machines(&self) -> bool {
    match self {
      Self::Unreadable(_) | Self::Unknown(_) => false,
      Self::Tool(error) => error.is_the_machines(),
      Self::Write(_) => true,
    }
  }
}

/// One smaller size of a picture or page, as written under the output prefix.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Size {
  pub name: String,
  pub width: u32,
  pub height: u32,
  pub media_type: &'static str,
  pub bytes: u64,
}

/// The PDF an office file became.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Document {
  pub name: &'static str,
  pub bytes: u64,
}

/// What a preview job reports; what does not apply to the file is left out.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
  #[serde(skip_serializing_if = "Option::is_none")]
  pub width: Option<u32>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub height: Option<u32>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub duration_ms: Option<u64>,
  /// A ThumbHash of the picture, shown blurred while the picture loads.
  #[serde(skip_serializing_if = "Option::is_none")]
  pub placeholder: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub sizes: Option<Vec<Size>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub waveform: Option<Vec<u8>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub pages: Option<u32>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub document: Option<Document>,
  /// What the upload became when a picture was put upright in its place.
  #[serde(skip_serializing_if = "Option::is_none")]
  pub source: Option<Replaced>,
  /// What everything written under the output prefix weighs.
  pub bytes: u64,
}

/// A preview, and the upright picture that is to take the upload's place.
#[derive(Debug)]
pub struct Made {
  pub preview: Preview,
  pub upright: Option<PathBuf>,
}

/// The widths a picture is made smaller to, each only when it is narrower
/// than the picture: a size larger than the original shows nothing more.
const LADDER: [u32; 5] = [320, 640, 1024, 1600, 2400];
/// The widths a document's first page is shown at, which is never large.
const PAGE_LADDER: [u32; 3] = [320, 640, 1024];
const WEBP_QUALITY: f32 = 80.0;
const AVIF_QUALITY: u8 = 60;
/// From 1, slowest, to 10. At 8 the whole ladder of a 12 MP photo takes
/// about two and a half seconds on four cores; 6 takes half as long again
/// for files a percent smaller, and 10 makes files three times the size.
const AVIF_SPEED: u8 = 8;
/// The longest side a picture may have, and the memory its decode may take.
/// A file claiming more is a decompression bomb, and is the file's fault.
const LONGEST_SIDE: u32 = 20_000;
const MOST_MEMORY: u64 = 512 * 1024 * 1024;
/// How long pdftoppm or pdfinfo may take over one document.
const RENDERING: Duration = Duration::from_secs(60);
/// How long LibreOffice may take to turn an office file into a PDF.
const CONVERTING: Duration = Duration::from_secs(120);
/// The waveform's bars, and the rate its sound is decoded at.
const BARS: usize = 100;
const SAMPLE_RATE: u64 = 8000;
/// Samples whose peak is kept as one, 10 ms: an hour's recording is then
/// held as 360,000 peaks rather than 29 million samples.
const BLOCK: usize = 80;

/// Learns whether this machine can draw PDFs, and proves LibreOffice runs
/// when one is named: named and missing is a machine set up wrongly, which
/// should say so as it starts.
pub async fn check(previews: &mut Previews) -> Result<(), TranscodeError> {
  previews.pdf = run(&previews.pdftoppm, "pdftoppm", &["-v".to_string()]).await.is_ok();
  if let Some(converter) = &previews.office {
    output(converter, "libreoffice", &["--version".to_string()], Some(CONVERTING)).await?;
  }
  Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Format {
  Jpeg,
  Png,
  Webp,
  Gif,
}

fn picture_format(media_type: &str) -> Option<Format> {
  match media_type {
    "image/jpeg" => Some(Format::Jpeg),
    "image/png" => Some(Format::Png),
    "image/webp" => Some(Format::Webp),
    "image/gif" => Some(Format::Gif),
    _ => None,
  }
}

/// The extension LibreOffice reads an office file's kind from, taken from
/// its media type so nothing the uploader named reaches the command line.
fn office_extension(media_type: &str) -> Option<&'static str> {
  match media_type {
    "application/msword" => Some("doc"),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => Some("docx"),
    "application/vnd.ms-powerpoint" => Some("ppt"),
    "application/vnd.openxmlformats-officedocument.presentationml.presentation" => Some("pptx"),
    "application/vnd.ms-excel" => Some("xls"),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" => Some("xlsx"),
    "application/vnd.oasis.opendocument.text" => Some("odt"),
    "application/vnd.oasis.opendocument.presentation" => Some("odp"),
    "application/vnd.oasis.opendocument.spreadsheet" => Some("ods"),
    _ => None,
  }
}

/// Makes the preview of `source`, a file of `media_type`, working in
/// `work` and writing what goes to the store under `out`.
pub async fn make(
  previews: &Previews,
  tools: &Tools,
  media_type: &str,
  source: &Path,
  work: &Path,
  out: &Path,
  rewrite: bool,
) -> Result<Made, PreviewError> {
  tokio::fs::create_dir_all(out).await?;
  if let Some(format) = picture_format(media_type) {
    let bytes = tokio::fs::read(source).await?;
    let (out, upright) = (out.to_path_buf(), work.join("upright"));
    return blocking(move || picture(&bytes, format, rewrite, &out, &upright)).await;
  }
  let preview = if media_type.starts_with("audio/") {
    sound(tools, source).await?
  } else if media_type == "application/pdf" {
    document(previews, source, work, out).await?
  } else if let Some(extension) = office_extension(media_type) {
    office(previews, extension, source, work, out).await?
  } else {
    return Err(PreviewError::Unknown(media_type.to_string()));
  };
  Ok(Made { preview, upright: None })
}

/// Runs picture work off the async threads: a large photo keeps a core
/// busy for seconds.
async fn blocking<T: Send + 'static>(
  work: impl FnOnce() -> Result<T, PreviewError> + Send + 'static,
) -> Result<T, PreviewError> {
  tokio::task::spawn_blocking(work)
    .await
    .map_err(|error| PreviewError::Unreadable(format!("the picture could not be read: {error}")))?
}

fn unreadable(error: &ImageError) -> PreviewError {
  PreviewError::Unreadable(format!("the picture could not be read: {error}"))
}

fn picture(bytes: &[u8], format: Format, rewrite: bool, out: &Path, upright: &Path) -> Result<Made, PreviewError> {
  let decoded = decode(bytes, format)?;
  let image = &decoded.image;
  // Sizes of an animation would hold it still; it is shown as it is.
  let sizes = if decoded.animated {
    Vec::new()
  } else {
    let widths: Vec<u32> = LADDER.into_iter().filter(|width| *width < image.width()).collect();
    smaller(image, &widths, "", true, out)?
  };
  let upright = if rewrite && !decoded.animated && decoded.orientation != Orientation::NoTransforms {
    encode_upright(image, format, is_lossless_webp(bytes), upright)?
  } else {
    None
  };
  Ok(Made {
    preview: Preview {
      width: Some(image.width()),
      height: Some(image.height()),
      placeholder: Some(placeholder(image)),
      sizes: Some(sizes),
      ..Preview::default()
    },
    upright,
  })
}

/// A picture as it is meant to be seen, the way its metadata says is up.
struct Decoded {
  image: DynamicImage,
  orientation: Orientation,
  /// More than one frame: an animated GIF or WebP, of which `image` is the first.
  animated: bool,
}

fn decode(bytes: &[u8], format: Format) -> Result<Decoded, PreviewError> {
  let reader = Cursor::new(bytes);
  match format {
    Format::Jpeg => upright(JpegDecoder::new(reader).map_err(|error| unreadable(&error))?, false),
    Format::Png => upright(PngDecoder::new(reader).map_err(|error| unreadable(&error))?, false),
    Format::Webp => {
      let decoder = WebPDecoder::new(reader).map_err(|error| unreadable(&error))?;
      let animated = decoder.has_animation();
      upright(decoder, animated)
    },
    Format::Gif => {
      let mut decoder = GifDecoder::new(reader).map_err(|error| unreadable(&error))?;
      limit(&mut decoder)?;
      let mut frames = decoder.into_frames();
      let first = frames
        .next()
        .ok_or_else(|| PreviewError::Unreadable("the picture has no frames".into()))?
        .map_err(|error| unreadable(&error))?;
      Ok(Decoded {
        image: DynamicImage::ImageRgba8(first.into_buffer()),
        orientation: Orientation::NoTransforms,
        animated: frames.next().is_some(),
      })
    },
  }
}

fn upright(mut decoder: impl ImageDecoder, animated: bool) -> Result<Decoded, PreviewError> {
  limit(&mut decoder)?;
  // Metadata that cannot be read says nothing of which way is up.
  let orientation = decoder.orientation().unwrap_or(Orientation::NoTransforms);
  let mut image = DynamicImage::from_decoder(decoder).map_err(|error| unreadable(&error))?;
  image.apply_orientation(orientation);
  Ok(Decoded {
    image,
    orientation,
    animated,
  })
}

fn limit(decoder: &mut impl ImageDecoder) -> Result<(), PreviewError> {
  let mut limits = Limits::default();
  limits.max_image_width = Some(LONGEST_SIDE);
  limits.max_image_height = Some(LONGEST_SIDE);
  limits.max_alloc = Some(MOST_MEMORY);
  decoder.set_limits(limits).map_err(|error| unreadable(&error))?;
  // Not every decoder holds itself to the memory limit.
  if decoder.total_bytes() > MOST_MEMORY {
    return Err(PreviewError::Unreadable("the picture is too large to be read".into()));
  }
  Ok(())
}

/// Whether a WebP is stored without loss, which its upright copy keeps.
fn is_lossless_webp(bytes: &[u8]) -> bool {
  let mut at = 12_usize;
  while let Some(header) = bytes.get(at..at.saturating_add(8)) {
    match &header[..4] {
      b"VP8L" => return true,
      b"VP8 " => return false,
      _ => {},
    }
    let size = u32::from_le_bytes([header[4], header[5], header[6], header[7]]) as usize;
    at = at.saturating_add(8).saturating_add(size).saturating_add(size % 2);
  }
  false
}

/// A ThumbHash of the picture scaled to fit 100 pixels square, as base64.
fn placeholder(image: &DynamicImage) -> String {
  let small = image.thumbnail(100, 100).to_rgba8();
  let hash = thumbhash::rgba_to_thumb_hash(small.width() as usize, small.height() as usize, small.as_raw());
  STANDARD.encode(hash)
}

/// Writes the picture at each of `widths`, each made from the one larger
/// than it, as WebP and when `avif` also as AVIF, named `{prefix}w{width}`.
fn smaller(
  image: &DynamicImage,
  widths: &[u32],
  prefix: &str,
  avif: bool,
  out: &Path,
) -> Result<Vec<Size>, PreviewError> {
  let alpha = image.color().has_alpha();
  let mut from = if alpha {
    DynamicImage::ImageRgba8(image.to_rgba8())
  } else {
    DynamicImage::ImageRgb8(image.to_rgb8())
  };
  let mut sizes = Vec::new();
  for &width in widths.iter().rev() {
    let height = scaled(image.height(), width, image.width());
    let size = if (width, height) == (from.width(), from.height()) {
      from
    } else {
      from.resize_exact(width, height, FilterType::Lanczos3)
    };
    let name = format!("{prefix}w{width}.webp");
    let bytes = write(&out.join(&name), &webp(&size, false, WEBP_QUALITY)?)?;
    sizes.push(Size {
      name,
      width,
      height,
      media_type: "image/webp",
      bytes,
    });
    if avif {
      let name = format!("{prefix}w{width}.avif");
      let mut encoded = Vec::new();
      let color = if alpha {
        ExtendedColorType::Rgba8
      } else {
        ExtendedColorType::Rgb8
      };
      AvifEncoder::new_with_speed_quality(&mut encoded, AVIF_SPEED, AVIF_QUALITY)
        .write_image(size.as_bytes(), width, height, color)
        .map_err(|error| PreviewError::Unreadable(format!("the picture could not be encoded: {error}")))?;
      let bytes = write(&out.join(&name), &encoded)?;
      sizes.push(Size {
        name,
        width,
        height,
        media_type: "image/avif",
        bytes,
      });
    }
    from = size;
  }
  sizes.sort_by_key(|size| size.width);
  Ok(sizes)
}

/// `height` scaled as `width` is to `of`, never less than a pixel.
fn scaled(height: u32, width: u32, of: u32) -> u32 {
  let height = (u64::from(height) * u64::from(width) + u64::from(of) / 2) / u64::from(of.max(1));
  u32::try_from(height).unwrap_or(u32::MAX).max(1)
}

fn write(path: &Path, bytes: &[u8]) -> Result<u64, PreviewError> {
  std::fs::write(path, bytes)?;
  Ok(bytes.len() as u64)
}

/// `image`, 8 bits a channel with or without alpha, as WebP.
fn webp(image: &DynamicImage, lossless: bool, quality: f32) -> Result<Vec<u8>, PreviewError> {
  let layout = if image.color().has_alpha() {
    webp::PixelLayout::Rgba
  } else {
    webp::PixelLayout::Rgb
  };
  let encoded = webp::Encoder::new(image.as_bytes(), layout, image.width(), image.height())
    .encode_simple(lossless, quality)
    .map_err(|error| PreviewError::Unreadable(format!("the picture could not be encoded: {error:?}")))?;
  Ok(encoded.to_vec())
}

/// Writes the upright picture in its own format and with no metadata to
/// `to`, so it can take the place of an upload whose metadata turned it.
fn encode_upright(
  image: &DynamicImage,
  format: Format,
  lossless: bool,
  to: &Path,
) -> Result<Option<PathBuf>, PreviewError> {
  let encode_error = |error: ImageError| PreviewError::Unreadable(format!("the picture could not be encoded: {error}"));
  match format {
    Format::Jpeg => {
      let file = BufWriter::new(std::fs::File::create(to)?);
      let flat = if image.color().has_color() {
        DynamicImage::ImageRgb8(image.to_rgb8())
      } else {
        DynamicImage::ImageLuma8(image.to_luma8())
      };
      flat
        .write_with_encoder(JpegEncoder::new_with_quality(file, 90))
        .map_err(encode_error)?;
    },
    Format::Png => {
      let file = BufWriter::new(std::fs::File::create(to)?);
      image.write_with_encoder(PngEncoder::new(file)).map_err(encode_error)?;
    },
    Format::Webp => {
      let flat = if image.color().has_alpha() {
        DynamicImage::ImageRgba8(image.to_rgba8())
      } else {
        DynamicImage::ImageRgb8(image.to_rgb8())
      };
      write(to, &webp(&flat, lossless, 90.0)?)?;
    },
    // A GIF holds no orientation to put right.
    Format::Gif => return Ok(None),
  }
  Ok(Some(to.to_path_buf()))
}

/// A recording's length and waveform.
async fn sound(tools: &Tools, source: &Path) -> Result<Preview, PreviewError> {
  let probed = output(
    &tools.ffprobe,
    "ffprobe",
    &[
      "-v".to_string(),
      "error".to_string(),
      "-show_entries".to_string(),
      "format=duration".to_string(),
      "-of".to_string(),
      "default=noprint_wrappers=1:nokey=1".to_string(),
      source.to_string_lossy().into_owned(),
    ],
    None,
  )
  .await?;
  let (waveform, samples) = waveform(&tools.ffmpeg, source).await?;
  // A recording made in a browser states no length; its decode says it.
  let duration_ms = String::from_utf8_lossy(&probed)
    .trim()
    .parse::<f64>()
    .ok()
    .and_then(|seconds| Duration::try_from_secs_f64(seconds).ok())
    .and_then(|length| u64::try_from(length.as_millis()).ok())
    .unwrap_or(samples * 1000 / SAMPLE_RATE);
  Ok(Preview {
    duration_ms: Some(duration_ms),
    waveform: Some(waveform),
    ..Preview::default()
  })
}

/// Decodes `source` to one channel of 16-bit samples and gives back the
/// waveform and how many samples there were, a block at a time so a long
/// recording is never held whole.
async fn waveform(ffmpeg: &Path, source: &Path) -> Result<(Vec<u8>, u64), TranscodeError> {
  let mut child = Command::new(ffmpeg)
    .args(["-hide_banner", "-nostdin", "-v", "error", "-i"])
    .arg(source)
    .args(["-vn", "-ac", "1", "-ar", &SAMPLE_RATE.to_string(), "-f", "s16le", "-"])
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .kill_on_drop(true)
    .spawn()
    .map_err(|source| TranscodeError::Start { tool: "ffmpeg", source })?;
  let stderr = child.stderr.take().map(collect_tail);
  let mut peaks = Peaks::default();
  if let Some(mut stdout) = child.stdout.take() {
    let mut buffer = vec![0_u8; 64 * 1024];
    loop {
      let read = stdout.read(&mut buffer).await?;
      if read == 0 {
        break;
      }
      peaks.feed(&buffer[..read]);
    }
  }
  let status = child.wait().await?;
  if !status.success() {
    return Err(TranscodeError::Failed {
      tool: "ffmpeg",
      stderr: match stderr {
        Some(task) => task.await.unwrap_or_default(),
        None => String::new(),
      },
    });
  }
  Ok(peaks.finish())
}

/// The loudest sample of each block of a stream of little-endian 16-bit
/// samples, which may arrive split anywhere.
#[derive(Debug, Default)]
struct Peaks {
  blocks: Vec<u16>,
  loudest: u16,
  in_block: usize,
  samples: u64,
  /// The first byte of a sample whose second has not arrived.
  half: Option<u8>,
}

impl Peaks {
  fn feed(&mut self, mut bytes: &[u8]) {
    if let Some(low) = self.half.take() {
      let Some((&high, rest)) = bytes.split_first() else {
        self.half = Some(low);
        return;
      };
      self.sample(i16::from_le_bytes([low, high]));
      bytes = rest;
    }
    let (pairs, rest) = bytes.as_chunks::<2>();
    for pair in pairs {
      self.sample(i16::from_le_bytes(*pair));
    }
    self.half = rest.first().copied();
  }

  fn sample(&mut self, sample: i16) {
    self.loudest = self.loudest.max(sample.unsigned_abs());
    self.in_block += 1;
    self.samples += 1;
    if self.in_block == BLOCK {
      self.blocks.push(self.loudest);
      self.loudest = 0;
      self.in_block = 0;
    }
  }

  /// The peak of each of `BARS` equal spans, from 0 to 100 where 100 is the
  /// loudest span, and how many samples there were.
  fn finish(mut self) -> (Vec<u8>, u64) {
    if self.in_block > 0 {
      self.blocks.push(self.loudest);
    }
    let count = self.blocks.len();
    let spans: Vec<u16> = (0..BARS)
      .map(|bar| {
        if count == 0 {
          return 0;
        }
        let start = bar * count / BARS;
        let end = ((bar + 1) * count / BARS).max(start + 1);
        self.blocks[start..end].iter().copied().max().unwrap_or(0)
      })
      .collect();
    let loudest = u32::from(spans.iter().copied().max().unwrap_or(0));
    let bars = spans
      .into_iter()
      .map(|span| {
        // Silence has no loudest span, and is drawn flat.
        (u32::from(span) * 100 + loudest / 2)
          .checked_div(loudest)
          .map_or(0, |bar| u8::try_from(bar).unwrap_or(100))
      })
      .collect();
    (bars, self.samples)
  }
}

/// A PDF's first page drawn and made smaller, and how many pages it has.
async fn document(previews: &Previews, pdf: &Path, work: &Path, out: &Path) -> Result<Preview, PreviewError> {
  let base = work.join("page1");
  let path = |path: &Path| path.to_string_lossy().into_owned();
  let mut args: Vec<String> = ["-f", "1", "-l", "1", "-singlefile", "-png", "-scale-to", "1600"]
    .map(String::from)
    .to_vec();
  args.extend([path(pdf), path(&base)]);
  output(&previews.pdftoppm, "pdftoppm", &args, Some(RENDERING)).await?;
  let page = tokio::fs::read(base.with_extension("png")).await?;
  let pages = output(&previews.pdfinfo, "pdfinfo", &[path(pdf)], Some(RENDERING))
    .await
    .ok()
    .and_then(|info| pages_of(&String::from_utf8_lossy(&info)));
  let out = out.to_path_buf();
  let mut preview = blocking(move || first_page(&page, &out)).await?;
  preview.pages = pages;
  Ok(preview)
}

fn first_page(png: &[u8], out: &Path) -> Result<Preview, PreviewError> {
  let image = decode(png, Format::Png)?.image;
  let mut widths: Vec<u32> = PAGE_LADDER.into_iter().filter(|width| *width < image.width()).collect();
  if widths.is_empty() {
    widths.push(image.width());
  }
  Ok(Preview {
    width: Some(image.width()),
    height: Some(image.height()),
    placeholder: Some(placeholder(&image)),
    sizes: Some(smaller(&image, &widths, "page1-", false, out)?),
    ..Preview::default()
  })
}

/// pdfinfo says how many pages there are as "Pages:          12".
fn pages_of(info: &str) -> Option<u32> {
  info
    .lines()
    .find_map(|line| line.strip_prefix("Pages:"))
    .and_then(|pages| pages.trim().parse().ok())
}

/// An office file turned into a PDF, kept as `document.pdf`, with its first
/// page drawn when this machine can draw PDFs.
async fn office(
  previews: &Previews,
  extension: &str,
  source: &Path,
  work: &Path,
  out: &Path,
) -> Result<Preview, PreviewError> {
  let Some(converter) = &previews.office else {
    return Err(PreviewError::Tool(TranscodeError::Start {
      tool: "libreoffice",
      source: std::io::Error::new(std::io::ErrorKind::NotFound, "MEDIA_OFFICE_CONVERTER is not set"),
    }));
  };
  let work = tokio::fs::canonicalize(work).await?;
  let named = work.join(format!("source.{extension}"));
  tokio::fs::copy(source, &named).await?;
  let outdir = work.join("converted");
  tokio::fs::create_dir_all(&outdir).await?;
  // A profile of its own, so conversions at once never share one and
  // nothing of one file is left for the next.
  let profile = reqwest::Url::from_directory_path(work.join("profile")).map_err(|()| {
    PreviewError::Write(std::io::Error::other(format!(
      "{} is not a path LibreOffice can be given",
      work.display()
    )))
  })?;
  let mut args: Vec<String> = ["--headless", "--norestore", "--nolockcheck"]
    .map(String::from)
    .to_vec();
  args.push(format!("-env:UserInstallation={profile}"));
  args.extend(["--convert-to", "pdf", "--outdir"].map(String::from));
  args.push(outdir.to_string_lossy().into_owned());
  args.push(named.to_string_lossy().into_owned());
  output(converter, "libreoffice", &args, Some(CONVERTING)).await?;

  let pdf = outdir.join("source.pdf");
  // LibreOffice says nothing and makes nothing of a file it cannot read.
  if !tokio::fs::try_exists(&pdf).await? {
    return Err(PreviewError::Tool(TranscodeError::Failed {
      tool: "libreoffice",
      stderr: "the file could not be turned into a PDF".into(),
    }));
  }
  let kept = out.join("document.pdf");
  let bytes = tokio::fs::copy(&pdf, &kept).await?;
  let mut preview = if previews.pdf {
    document(previews, &kept, &work, out).await?
  } else {
    Preview::default()
  };
  preview.document = Some(Document {
    name: "document.pdf",
    bytes,
  });
  Ok(preview)
}

#[cfg(test)]
mod tests {
  use std::fmt::Write as _;

  use anyhow::{Context, Result};
  use image::codecs::gif::GifEncoder;
  use image::{Frame, ImageFormat, Rgb, RgbImage, Rgba, RgbaImage};

  use super::*;
  use crate::plan::Encoder;

  fn tools() -> Tools {
    Tools {
      ffmpeg: "ffmpeg".into(),
      ffprobe: "ffprobe".into(),
      encoder: Encoder::Cpu,
      tone_map: false,
    }
  }

  fn previews() -> Previews {
    Previews {
      pdftoppm: "pdftoppm".into(),
      pdfinfo: "pdfinfo".into(),
      pdf: false,
      office: None,
    }
  }

  /// Makes the preview of `bytes` as a file of `media_type`.
  async fn preview_of(
    dir: &Path,
    previews: &Previews,
    media_type: &str,
    bytes: &[u8],
    rewrite: bool,
  ) -> Result<Made, PreviewError> {
    let source = dir.join("source");
    tokio::fs::write(&source, bytes).await?;
    make(previews, &tools(), media_type, &source, dir, &dir.join("out"), rewrite).await
  }

  fn names(preview: &Preview) -> Vec<&str> {
    preview.sizes.iter().flatten().map(|size| size.name.as_str()).collect()
  }

  fn encoded(image: &DynamicImage, format: ImageFormat) -> Result<Vec<u8>> {
    let mut bytes = Cursor::new(Vec::new());
    image.write_to(&mut bytes, format)?;
    Ok(bytes.into_inner())
  }

  /// A JPEG whose metadata says to turn it a quarter clockwise to see it
  /// upright, as a phone held upright writes one: Orientation 6 in an
  /// EXIF segment straight after the start of the image.
  fn turned_jpeg(width: u32, height: u32) -> Result<Vec<u8>> {
    // Red above, blue below, as the camera's sensor saw it.
    let sideways = RgbImage::from_fn(width, height, |_, y| {
      if y < height / 2 {
        Rgb([220, 20, 20])
      } else {
        Rgb([20, 20, 220])
      }
    });
    let jpeg = encoded(&DynamicImage::ImageRgb8(sideways), ImageFormat::Jpeg)?;
    let tiff: [u8; 26] = [
      b'M', b'M', 0, 42, 0, 0, 0, 8, // big-endian, first directory at 8
      0, 1, // one entry
      0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, // Orientation, a SHORT: 6
      0, 0, 0, 0, // no next directory
    ];
    let mut segment = vec![0xFF, 0xE1];
    segment.extend(u16::try_from(2 + 6 + tiff.len())?.to_be_bytes());
    segment.extend(b"Exif\0\0");
    segment.extend(tiff);
    Ok([&jpeg[..2], &segment, &jpeg[2..]].concat())
  }

  fn rgb_at(image: &DynamicImage, x: u32, y: u32) -> [u8; 3] {
    let Rgba([red, green, blue, _]) = *image.to_rgba8().get_pixel(x, y);
    [red, green, blue]
  }

  #[tokio::test]
  async fn a_photo_its_metadata_turns_is_put_upright_in_place_of_its_upload() -> Result<()> {
    let dir = tempfile::tempdir()?;
    let made = preview_of(dir.path(), &previews(), "image/jpeg", &turned_jpeg(800, 500)?, true).await?;
    let preview = &made.preview;
    assert_eq!((preview.width, preview.height), (Some(500), Some(800)));
    // Only the sizes narrower than the picture, each as WebP and AVIF.
    assert_eq!(names(preview), ["w320.webp", "w320.avif"]);
    for size in preview.sizes.iter().flatten() {
      assert_eq!((size.width, size.height), (320, 512));
      let written = std::fs::read(dir.path().join("out").join(&size.name))?;
      assert_eq!(written.len() as u64, size.bytes);
    }
    let small =
      image::load_from_memory_with_format(&std::fs::read(dir.path().join("out/w320.webp"))?, ImageFormat::WebP)?;
    assert_eq!((small.width(), small.height()), (320, 512));

    let upright = made.upright.context("the turned photo was not put upright")?;
    let bytes = std::fs::read(&upright)?;
    let mut decoder = JpegDecoder::new(Cursor::new(&bytes))?;
    assert_eq!(decoder.exif_metadata()?, None);
    assert_eq!(decoder.orientation()?, Orientation::NoTransforms);
    let upright = DynamicImage::from_decoder(decoder)?;
    assert_eq!((upright.width(), upright.height()), (500, 800));
    // A quarter turn clockwise puts what was above on the right.
    let [red, _, blue] = rgb_at(&upright, 450, 400);
    assert!(red > 150 && blue < 100, "the right is not red");
    let [red, _, blue] = rgb_at(&upright, 50, 400);
    assert!(blue > 150 && red < 100, "the left is not blue");

    let kept = preview_of(dir.path(), &previews(), "image/jpeg", &turned_jpeg(800, 500)?, false).await?;
    assert!(kept.upright.is_none());
    assert_eq!((kept.preview.width, kept.preview.height), (Some(500), Some(800)));
    Ok(())
  }

  #[tokio::test]
  async fn a_transparent_picture_stays_transparent_in_its_sizes() -> Result<()> {
    let dir = tempfile::tempdir()?;
    let half_clear = RgbaImage::from_fn(400, 300, |x, _| {
      if x < 200 {
        Rgba([0, 0, 0, 0])
      } else {
        Rgba([30, 160, 60, 255])
      }
    });
    let png = encoded(&DynamicImage::ImageRgba8(half_clear), ImageFormat::Png)?;
    let made = preview_of(dir.path(), &previews(), "image/png", &png, true).await?;
    assert!(
      made.upright.is_none(),
      "a picture its metadata does not turn was rewritten"
    );
    assert_eq!(names(&made.preview), ["w320.webp", "w320.avif"]);
    let webp =
      image::load_from_memory_with_format(&std::fs::read(dir.path().join("out/w320.webp"))?, ImageFormat::WebP)?;
    assert!(webp.color().has_alpha());
    let webp = webp.to_rgba8();
    assert!(webp.get_pixel(20, 100)[3] < 16, "the clear half is not clear");
    assert!(webp.get_pixel(300, 100)[3] > 240, "the solid half is not solid");
    Ok(())
  }

  #[tokio::test]
  async fn a_small_picture_has_no_sizes_and_a_placeholder_that_decodes() -> Result<()> {
    let dir = tempfile::tempdir()?;
    let picture = RgbImage::from_fn(300, 150, |x, y| {
      Rgb([u8::try_from(x % 256).unwrap_or(0), 90, u8::try_from(y).unwrap_or(0)])
    });
    let png = encoded(&DynamicImage::ImageRgb8(picture), ImageFormat::Png)?;
    let made = preview_of(dir.path(), &previews(), "image/png", &png, true).await?;
    assert_eq!(made.preview.sizes, Some(Vec::new()));
    assert_eq!(std::fs::read_dir(dir.path().join("out"))?.count(), 0);
    let placeholder = STANDARD.decode(made.preview.placeholder.context("no placeholder")?)?;
    let (width, height, rgba) =
      thumbhash::thumb_hash_to_rgba(&placeholder).map_err(|()| anyhow::anyhow!("the placeholder does not decode"))?;
    assert_eq!(rgba.len(), width * height * 4);
    // Wide as the picture is wide.
    assert!(width > height, "{width}x{height}");
    Ok(())
  }

  #[tokio::test]
  async fn an_animation_is_measured_but_never_made_smaller() -> Result<()> {
    let dir = tempfile::tempdir()?;
    let mut gif = Vec::new();
    {
      let mut encoder = GifEncoder::new(&mut gif);
      encoder.encode_frames([
        Frame::new(RgbaImage::from_pixel(600, 400, Rgba([200, 0, 0, 255]))),
        Frame::new(RgbaImage::from_pixel(600, 400, Rgba([0, 0, 200, 255]))),
      ])?;
    }
    let made = preview_of(dir.path(), &previews(), "image/gif", &gif, true).await?;
    assert_eq!((made.preview.width, made.preview.height), (Some(600), Some(400)));
    assert_eq!(made.preview.sizes, Some(Vec::new()));
    assert!(made.preview.placeholder.is_some());
    assert!(made.upright.is_none());
    Ok(())
  }

  #[tokio::test]
  async fn a_file_that_is_not_what_it_claims_is_the_files_fault() -> Result<()> {
    let dir = tempfile::tempdir()?;
    let broken = preview_of(dir.path(), &previews(), "image/png", b"not a picture at all", true).await;
    assert!(matches!(&broken, Err(PreviewError::Unreadable(_))), "{broken:?}");
    let unknown = preview_of(dir.path(), &previews(), "text/plain", b"words", true).await;
    assert!(matches!(&unknown, Err(PreviewError::Unknown(_))), "{unknown:?}");
    // A converter that is not set up is this machine's to answer for.
    let odt = "application/vnd.oasis.opendocument.text";
    let no_office = preview_of(dir.path(), &previews(), odt, b"PK", true).await;
    assert!(no_office.is_err_and(|error| error.is_the_machines()));
    Ok(())
  }

  /// A recording of `filter`, made by ffmpeg itself.
  async fn recording(dir: &Path, filter: &str, seconds: &str) -> Result<Vec<u8>> {
    let path = dir.join("made.wav");
    let made = Command::new("ffmpeg")
      .args([
        "-hide_banner",
        "-nostdin",
        "-y",
        "-f",
        "lavfi",
        "-i",
        filter,
        "-t",
        seconds,
      ])
      .arg(&path)
      .output()
      .await;
    assert!(
      made.is_ok_and(|output| output.status.success()),
      "ffmpeg must be installed to run this test"
    );
    Ok(std::fs::read(path)?)
  }

  #[tokio::test]
  async fn a_recording_has_a_length_and_a_waveform() -> Result<()> {
    let dir = tempfile::tempdir()?;
    let tone = recording(dir.path(), "sine=frequency=440:sample_rate=44100", "3").await?;
    let made = preview_of(dir.path(), &previews(), "audio/wav", &tone, true).await?;
    let duration = made.preview.duration_ms.context("no length")?;
    assert!(duration.abs_diff(3000) < 50, "{duration} ms");
    let waveform = made.preview.waveform.context("no waveform")?;
    assert_eq!(waveform.len(), BARS);
    assert_eq!(waveform.iter().max(), Some(&100));
    // A steady tone is loud all the way through.
    assert!(waveform.iter().all(|bar| *bar > 80), "{waveform:?}");
    assert_eq!(made.preview.sizes, None);

    let silence = recording(dir.path(), "anullsrc=r=44100:cl=mono", "2").await?;
    let made = preview_of(dir.path(), &previews(), "audio/wav", &silence, true).await?;
    assert_eq!(made.preview.waveform, Some(vec![0; BARS]));
    assert!(
      made
        .preview
        .duration_ms
        .is_some_and(|duration| duration.abs_diff(2000) < 50)
    );
    Ok(())
  }

  #[test]
  fn samples_split_anywhere_read_the_same() {
    let samples: Vec<i16> = (0..2000_i32)
      .map(|at| i16::try_from(((at * 37) % 2001 - 1000) * 30).unwrap_or(0))
      .collect();
    let bytes: Vec<u8> = samples.iter().flat_map(|sample| sample.to_le_bytes()).collect();
    let mut whole = Peaks::default();
    whole.feed(&bytes);
    let mut split = Peaks::default();
    for piece in bytes.chunks(3) {
      split.feed(piece);
    }
    let (whole, count) = whole.finish();
    assert_eq!(count, 2000);
    assert_eq!(split.finish(), (whole.clone(), 2000));
    assert_eq!(whole.iter().max(), Some(&100));
    // Fewer blocks than bars still fills every bar.
    let mut short = Peaks::default();
    short.feed(&i16::MIN.to_le_bytes());
    assert_eq!(short.finish(), (vec![100; BARS], 1));
    assert_eq!(Peaks::default().finish(), (vec![0; BARS], 0));
  }

  #[test]
  fn tells_a_lossless_webp_from_a_lossy_one() -> Result<()> {
    let picture = DynamicImage::ImageRgb8(RgbImage::from_pixel(8, 8, Rgb([1, 2, 3])));
    assert!(is_lossless_webp(&webp(&picture, true, 75.0)?));
    assert!(!is_lossless_webp(&webp(&picture, false, 80.0)?));
    assert!(!is_lossless_webp(b"RIFF"));
    Ok(())
  }

  /// A PDF of `pages` letter-sized pages, each with a blue box on it.
  fn pdf(pages: usize) -> Vec<u8> {
    let content = "0 0 1 rg 72 72 300 400 re f";
    let kids: Vec<String> = (0..pages).map(|page| format!("{} 0 R", 4 + page)).collect();
    let mut objects = vec![
      "<< /Type /Catalog /Pages 2 0 R >>".to_string(),
      format!("<< /Type /Pages /Kids [{}] /Count {pages} >>", kids.join(" ")),
      format!("<< /Length {} >>\nstream\n{content}\nendstream", content.len()),
    ];
    objects.extend(
      (0..pages).map(|_| "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 3 0 R >>".to_string()),
    );
    let mut pdf = String::from("%PDF-1.4\n");
    let mut offsets = Vec::new();
    for (at, object) in objects.iter().enumerate() {
      offsets.push(pdf.len());
      let _ = write!(pdf, "{} 0 obj\n{object}\nendobj\n", at + 1);
    }
    let xref = pdf.len();
    let _ = write!(pdf, "xref\n0 {}\n0000000000 65535 f \n", objects.len() + 1);
    for offset in offsets {
      let _ = writeln!(pdf, "{offset:010} 00000 n ");
    }
    let _ = write!(
      pdf,
      "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n",
      objects.len() + 1
    );
    pdf.into_bytes()
  }

  async fn checked(mut previews: Previews) -> Result<Previews> {
    check(&mut previews).await?;
    assert!(previews.pdf, "poppler's pdftoppm must be installed to run this test");
    Ok(previews)
  }

  fn first_page_drawn(dir: &Path, preview: &Preview) {
    // A letter page drawn 1600 pixels tall.
    assert_eq!(preview.height, Some(1600));
    assert!(preview.width.is_some_and(|width| (1230..=1240).contains(&width)));
    assert!(preview.placeholder.is_some());
    assert_eq!(
      names(preview),
      ["page1-w320.webp", "page1-w640.webp", "page1-w1024.webp"]
    );
    for name in names(preview) {
      assert!(dir.join("out").join(name).is_file(), "{name} was not written");
    }
    assert_eq!(preview.pages, Some(2));
  }

  #[tokio::test]
  async fn a_pdf_is_shown_by_its_first_page() -> Result<()> {
    let dir = tempfile::tempdir()?;
    let previews = checked(previews()).await?;
    let made = preview_of(dir.path(), &previews, "application/pdf", &pdf(2), true).await?;
    first_page_drawn(dir.path(), &made.preview);
    assert!(made.upright.is_none() && made.preview.document.is_none());
    Ok(())
  }

  #[cfg(unix)]
  #[tokio::test]
  async fn an_office_file_becomes_a_pdf_shown_by_its_first_page() -> Result<()> {
    use std::os::unix::fs::PermissionsExt;

    let dir = tempfile::tempdir()?;
    let tools = tempfile::tempdir()?;
    let document = pdf(2);
    let made_pdf = tools.path().join("made.pdf");
    std::fs::write(&made_pdf, &document)?;
    let heard = tools.path().join("args");
    // Stands in for LibreOffice: writes the PDF it would have made, named
    // after the file it was given, into the folder it was told.
    let converter = tools.path().join("soffice");
    std::fs::write(
      &converter,
      format!(
        "#!/bin/sh\n\
         if [ \"$1\" = --version ]; then echo 'LibreOffice stand-in'; exit 0; fi\n\
         printf '%s\\n' \"$@\" > '{heard}'\n\
         while [ \"$1\" != --outdir ]; do shift; done\n\
         cp '{made}' \"$2/$(basename \"$3\" | sed 's/[.][^.]*$//').pdf\"\n",
        heard = heard.display(),
        made = made_pdf.display(),
      ),
    )?;
    std::fs::set_permissions(&converter, std::fs::Permissions::from_mode(0o755))?;
    let previews = checked(Previews {
      office: Some(converter),
      ..previews()
    })
    .await?;

    let docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    let made = preview_of(dir.path(), &previews, docx, b"PK\x03\x04 a document", true).await?;
    assert_eq!(
      made.preview.document,
      Some(Document {
        name: "document.pdf",
        bytes: document.len() as u64,
      })
    );
    assert_eq!(std::fs::read(dir.path().join("out/document.pdf"))?, document);
    first_page_drawn(dir.path(), &made.preview);

    let heard = std::fs::read_to_string(heard)?;
    let heard: Vec<&str> = heard.lines().collect();
    assert_eq!(heard[..3], ["--headless", "--norestore", "--nolockcheck"]);
    assert!(heard[3].starts_with("-env:UserInstallation=file:///") && heard[3].ends_with("/profile/"));
    assert_eq!(heard[4..7], ["--convert-to", "pdf", "--outdir"]);
    assert!(heard[8].ends_with("/source.docx"), "{}", heard[8]);
    Ok(())
  }

  #[test]
  fn reads_how_many_pages_pdfinfo_counts() {
    assert_eq!(
      pages_of("Producer:        stand-in\nPages:           12\nEncrypted:       no\n"),
      Some(12)
    );
    assert_eq!(pages_of("Producer:        stand-in\n"), None);
  }

  #[test]
  fn reports_only_what_applies() -> Result<()> {
    let sound = Preview {
      duration_ms: Some(1500),
      waveform: Some(vec![0, 100]),
      ..Preview::default()
    };
    assert_eq!(
      serde_json::to_value(&sound)?,
      serde_json::json!({ "durationMs": 1500, "waveform": [0, 100], "bytes": 0 })
    );
    let office = Preview {
      sizes: Some(vec![Size {
        name: "page1-w320.webp".into(),
        width: 320,
        height: 414,
        media_type: "image/webp",
        bytes: 9,
      }]),
      document: Some(Document {
        name: "document.pdf",
        bytes: 12,
      }),
      source: Some(Replaced {
        size_bytes: 3,
        sha256: "ab".into(),
      }),
      bytes: 21,
      ..Preview::default()
    };
    assert_eq!(
      serde_json::to_value(&office)?,
      serde_json::json!({
        "sizes": [{ "name": "page1-w320.webp", "width": 320, "height": 414, "mediaType": "image/webp", "bytes": 9 }],
        "document": { "name": "document.pdf", "bytes": 12 },
        "source": { "sizeBytes": 3, "sha256": "ab" },
        "bytes": 21,
      })
    );
    Ok(())
  }
}
