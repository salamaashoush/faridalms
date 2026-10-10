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

/// Copies every file under `from` to the store under `prefix`. The master
/// playlist goes last, so a player never finds one whose renditions are
/// still arriving.
pub async fn upload_dir(store: &dyn ObjectStore, from: &Path, prefix: &str) -> Result<()> {
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
  files.sort_by_key(|path| path.file_name().is_some_and(|name| name == "master.m3u8"));
  for path in files {
    let relative = path.strip_prefix(from)?.to_string_lossy().replace('\\', "/");
    let key = Key::from(format!("{prefix}/{relative}"));
    let mut upload = WriteMultipart::new(store.put_multipart(&key).await?);
    let mut file = tokio::fs::File::open(&path).await?;
    let mut buffer = vec![0_u8; 1024 * 1024];
    loop {
      let read = tokio::io::AsyncReadExt::read(&mut file, &mut buffer).await?;
      if read == 0 {
        break;
      }
      upload.write(&buffer[..read]);
    }
    upload.finish().await?;
  }
  Ok(())
}
