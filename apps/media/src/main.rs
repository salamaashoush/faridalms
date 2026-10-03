//! Farida's media service: turns a school's uploaded video into adaptive
//! streams and serves them behind sealed links. The API decides what is
//! encoded and who may watch; this service does the heavy lifting.

mod api;
mod captions;
mod config;
mod plan;
mod seal;
mod serve;
mod storage;
mod transcode;
mod worker;

use std::sync::Arc;

use anyhow::{Context, Result};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<()> {
  tracing_subscriber::fmt()
    .json()
    .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
    .init();
  let config = Arc::new(config::Config::from_env()?);
  let store = storage::open(&config.storage)?;

  if let Some(url) = &config.api_url {
    let api = api::Api::new(url.clone(), seal::worker_token(&config.cell_secret))?;
    tokio::spawn(worker::run(Arc::clone(&config), Arc::clone(&store), api));
  } else {
    tracing::info!("MEDIA_API_URL is not set: serving streams, encoding nothing");
  }

  let app = serve::router(serve::Streams {
    store,
    key: seal::playback_key(&config.cell_secret),
  });
  let address = format!("{}:{}", config.host, config.port);
  let listener = tokio::net::TcpListener::bind(&address)
    .await
    .with_context(|| format!("{address} could not be bound"))?;
  tracing::info!(%address, "media service listening");
  axum::serve(listener, app).with_graceful_shutdown(shutdown()).await?;
  Ok(())
}

async fn shutdown() {
  let interrupt = tokio::signal::ctrl_c();
  #[cfg(unix)]
  let terminate = async {
    if let Ok(mut signal) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
      signal.recv().await;
    }
  };
  #[cfg(not(unix))]
  let terminate = std::future::pending::<()>();
  tokio::select! {
    _ = interrupt => {},
    () = terminate => {},
  }
}
