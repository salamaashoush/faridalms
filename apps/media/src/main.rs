//! Farida's media service: turns a school's uploaded video into adaptive
//! streams and serves them behind sealed links. The API decides what is
//! encoded and who may watch; this service does the heavy lifting.

mod api;
mod captions;
mod config;
mod metrics;
mod plan;
mod preview;
mod seal;
mod serve;
mod storage;
mod transcode;
mod worker;

use std::sync::Arc;

use anyhow::{Context, Result};
use tokio_util::sync::CancellationToken;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<()> {
  tracing_subscriber::fmt()
    .json()
    .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
    .init();
  let mut config = config::Config::from_env()?;
  let store = storage::open(&config.storage)?;
  let metrics = Arc::new(metrics::Metrics::default());
  let stop = CancellationToken::new();

  // A service that encodes proves it can before it asks for any video: one
  // without its tools would fail every video it was handed.
  if config.api_url.is_some() {
    transcode::check(&mut config.tools)
      .await
      .context("this machine cannot encode video")?;
    if !config.tools.tone_map {
      tracing::warn!("this ffmpeg has no zscale or tonemap filter: HDR video will look washed out");
    }
    if let Some(speech) = &config.speech {
      captions::check(speech)
        .await
        .context("this machine cannot draft captions")?;
    }
    preview::check(&mut config.previews)
      .await
      .context("this machine cannot convert office files")?;
    if !config.previews.pdf {
      tracing::warn!("pdftoppm does not run: PDFs and office files get no first page");
    }
  }
  let config = Arc::new(config);

  let mut lanes = Vec::new();
  if let Some(url) = &config.api_url {
    let worker = worker::Worker {
      config: Arc::clone(&config),
      store: Arc::clone(&store),
      api: api::Api::new(url.clone(), seal::worker_token(&config.cell_secret))?,
      metrics: Arc::clone(&metrics),
      stop: stop.clone(),
    };
    lanes.push(tokio::spawn(worker::run(worker.clone(), worker::Lane::Previews)));
    lanes.push(tokio::spawn(worker::run(worker, worker::Lane::Everything)));
  } else {
    tracing::info!("MEDIA_API_URL is not set: serving streams, encoding nothing");
  }

  if let Some(address) = &config.metrics {
    let listener = tokio::net::TcpListener::bind(address)
      .await
      .with_context(|| format!("{address} could not be bound"))?;
    tracing::info!(%address, "metrics listening");
    let (app, stop) = (serve::metrics_router(Arc::clone(&metrics)), stop.clone());
    tokio::spawn(async move {
      let _ = axum::serve(listener, app)
        .with_graceful_shutdown(stop.cancelled_owned())
        .await;
    });
  }

  let app = serve::router(serve::Streams {
    store,
    key: seal::playback_key(&config.cell_secret),
    metrics,
  });
  let address = format!("{}:{}", config.host, config.port);
  let listener = tokio::net::TcpListener::bind(&address)
    .await
    .with_context(|| format!("{address} could not be bound"))?;
  tracing::info!(%address, "media service listening");
  tokio::spawn({
    let stop = stop.clone();
    async move {
      shutdown().await;
      stop.cancel();
    }
  });
  axum::serve(listener, app)
    .with_graceful_shutdown(stop.cancelled_owned())
    .await?;
  // Jobs under way hand themselves back to the API before the service goes.
  for lane in lanes {
    let _ = lane.await;
  }
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
