//! The school's file store, as the API keeps it: a folder on disk or an S3
//! bucket. Sources are read from where the API stored the upload, and the
//! streams written beside them.

use std::fmt::Write as _;
use std::path::Path;
use std::sync::Arc;

use anyhow::{Context, Result};
use futures::StreamExt;
use object_store::aws::AmazonS3Builder;
use object_store::local::LocalFileSystem;
use object_store::path::Path as Key;
use object_store::{ObjectStore, ObjectStoreExt, WriteMultipart};
use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;

use crate::api::Replaced;
use crate::config::Storage;

pub fn open(storage: &Storage) -> Result<Arc<dyn ObjectStore>> {
  Ok(match storage {
    Storage::Disk { root } => {
      std::fs::create_dir_all(root).with_context(|| format!("the store {} could not be made", root.display()))?;
      Arc::new(LocalFileSystem::new_with_prefix(root)?)
    },
    Storage::S3 {
      bucket,
      region,
      endpoint,
      access_key_id,
      secret_access_key,
    } => {
      let mut builder = AmazonS3Builder::new()
        .with_bucket_name(bucket)
        .with_region(region)
        .with_access_key_id(access_key_id)
        .with_secret_access_key(secret_access_key);
      if let Some(endpoint) = endpoint {
        builder = builder
          .with_endpoint(endpoint)
          .with_allow_http(endpoint.starts_with("http://"));
      }
      Arc::new(builder.build()?)
    },
  })
}

/// Copies an object to a local file, a chunk at a time.
pub async fn download(store: &dyn ObjectStore, key: &str, to: &Path) -> Result<()> {
  let mut stream = store.get(&Key::from(key)).await?.into_stream();
  let mut file = tokio::fs::File::create(to).await?;
  while let Some(chunk) = stream.next().await {
    file.write_all(&chunk?).await?;
  }
  file.flush().await?;
  Ok(())
}

/// Puts a local file in the store in place of the object at `key`, and says
/// what it weighs and hashes to.
pub async fn replace(store: &dyn ObjectStore, from: &Path, key: &str) -> Result<Replaced> {
  let mut upload = WriteMultipart::new(store.put_multipart(&Key::from(key)).await?);
  let mut file = tokio::fs::File::open(from).await?;
  let mut buffer = vec![0_u8; 1024 * 1024];
  let mut hasher = Sha256::new();
  let mut size_bytes = 0_u64;
  loop {
    let read = tokio::io::AsyncReadExt::read(&mut file, &mut buffer).await?;
    if read == 0 {
      break;
    }
    hasher.update(&buffer[..read]);
    size_bytes += read as u64;
    upload.write(&buffer[..read]);
  }
  upload.finish().await?;
  let sha256 = hasher
    .finalize()
    .iter()
    .fold(String::with_capacity(64), |mut hex, byte| {
      let _ = write!(hex, "{byte:02x}");
      hex
    });
  Ok(Replaced { size_bytes, sha256 })
}

/// A file smaller than this goes up in one request. S3 takes no part of a
/// multipart upload smaller, and opening and closing one costs two more
/// requests, which is most of the work for a six-second segment.
const WHOLE: u64 = 5 * 1024 * 1024;
/// Files on their way to the store at once.
const AT_ONCE: usize = 8;

async fn put_file(store: &dyn ObjectStore, path: &Path, key: Key) -> Result<u64> {
  let size = tokio::fs::metadata(path).await?.len();
  if size < WHOLE {
    store.put(&key, tokio::fs::read(path).await?.into()).await?;
    return Ok(size);
  }
  let mut upload = WriteMultipart::new(store.put_multipart(&key).await?);
  let mut file = tokio::fs::File::open(path).await?;
  let mut buffer = vec![0_u8; 1024 * 1024];
  loop {
    let read = tokio::io::AsyncReadExt::read(&mut file, &mut buffer).await?;
    if read == 0 {
      break;
    }
    upload.write(&buffer[..read]);
  }
  upload.finish().await?;
  Ok(size)
}

/// Copies every file under `from` to the store under `prefix`, several at a
/// time, telling `progress` how far it has got, from 0 to 1, and says what
/// they weigh together. The master playlist goes last, so a player never
/// finds one whose renditions are still arriving.
pub async fn upload_dir(
  store: &dyn ObjectStore,
  from: &Path,
  prefix: &str,
  mut progress: impl FnMut(f64),
) -> Result<u64> {
  let mut files = Vec::new();
  let mut pending = vec![from.to_path_buf()];
  while let Some(dir) = pending.pop() {
    let mut entries = tokio::fs::read_dir(&dir).await?;
    while let Some(entry) = entries.next_entry().await? {
      let path = entry.path();
      if entry.file_type().await?.is_dir() {
        pending.push(path);
      } else {
        files.push(path);
      }
    }
  }
  let key_of = |path: &Path| -> Result<Key> {
    let relative = path.strip_prefix(from)?.to_string_lossy().replace('\\', "/");
    Ok(Key::from(format!("{prefix}/{relative}")))
  };
  let (masters, rest): (Vec<_>, Vec<_>) = files
    .into_iter()
    .partition(|path| path.file_name().is_some_and(|name| name == "master.m3u8"));
  let total = u32::try_from(masters.len() + rest.len()).unwrap_or(u32::MAX);
  let mut bytes = 0_u64;
  let mut sent = 0_u32;
  let mut uploads = futures::stream::iter(rest)
    .map(|path| async move { put_file(store, &path, key_of(&path)?).await })
    .buffer_unordered(AT_ONCE);
  while let Some(size) = uploads.next().await {
    bytes += size?;
    sent += 1;
    progress(f64::from(sent) / f64::from(total));
  }
  drop(uploads);
  for path in masters {
    bytes += put_file(store, &path, key_of(&path)?).await?;
  }
  progress(1.0);
  Ok(bytes)
}

#[cfg(test)]
mod tests {
  use object_store::memory::InMemory;

  use super::*;

  #[tokio::test]
  async fn a_folder_goes_up_whole_and_says_what_it_weighs() -> Result<()> {
    let dir = tempfile::tempdir()?;
    tokio::fs::create_dir_all(dir.path().join("360p")).await?;
    tokio::fs::write(dir.path().join("master.m3u8"), b"#EXTM3U\n").await?;
    tokio::fs::write(dir.path().join("360p/index.m3u8"), b"#EXTM3U\n#EXT-X-ENDLIST\n").await?;
    tokio::fs::write(dir.path().join("360p/seg_0000.m4s"), vec![7_u8; 300_000]).await?;
    // Larger than one request takes.
    let large = usize::try_from(WHOLE)? + 1024;
    tokio::fs::write(dir.path().join("360p/seg_0001.m4s"), vec![9_u8; large]).await?;

    let store = InMemory::new();
    let mut reported = Vec::new();
    let bytes = upload_dir(&store, dir.path(), "t/a/v/b", |sent| reported.push(sent)).await?;

    assert_eq!(bytes, 8 + 23 + 300_000 + u64::try_from(large)?);
    assert_eq!(reported.last().copied(), Some(1.0));
    assert!(reported.windows(2).all(|pair| pair[0] <= pair[1]));
    for (key, size) in [
      ("t/a/v/b/master.m3u8", 8),
      ("t/a/v/b/360p/index.m3u8", 23),
      ("t/a/v/b/360p/seg_0000.m4s", 300_000),
      ("t/a/v/b/360p/seg_0001.m4s", large),
    ] {
      let found = store.get(&Key::from(key)).await?.bytes().await?;
      assert_eq!(found.len(), size, "{key}");
    }
    let whole = store
      .get(&Key::from("t/a/v/b/360p/seg_0001.m4s"))
      .await?
      .bytes()
      .await?;
    assert!(whole.iter().all(|byte| *byte == 9));
    Ok(())
  }
}
