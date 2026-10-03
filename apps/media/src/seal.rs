//! Sealed playback links. The API seals what a link lets its holder read, a
//! video's folder of streams and an expiry, encrypted as well as signed:
//! a link travels in logs and history, and must say nothing and be
//! impossible to forge. This service only opens them. The format is the
//! files host's: base64url of a 12-byte nonce, the AES-256-GCM ciphertext of
//! a JSON array, and its 16-byte tag.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use hmac::{Hmac, Mac};
use sha2::Sha256;

const NONCE: usize = 12;
const TAG: usize = 16;

/// A key derived from the cell secret for one use, so no other use of the
/// secret can open what this one seals.
#[must_use]
pub fn derive(secret: &[u8], label: &str) -> [u8; 32] {
  let mut mac = <Hmac<Sha256> as hmac::KeyInit>::new_from_slice(secret)
    .unwrap_or_else(|_| unreachable!("HMAC takes keys of any length"));
  mac.update(label.as_bytes());
  mac.finalize().into_bytes().into()
}

/// The playback key: what the API seals video links with.
#[must_use]
pub fn playback_key(secret: &[u8]) -> [u8; 32] {
  derive(secret, "media-link-v1")
}

/// The bearer token this service shows the API when it asks for work.
#[must_use]
pub fn worker_token(secret: &[u8]) -> String {
  URL_SAFE_NO_PAD.encode(derive(secret, "media-worker-v1"))
}

/// What a playback link lets its holder read: one video's folder, until a time.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Grant {
  pub prefix: String,
  /// Seconds since the epoch.
  pub expires: u64,
}

/// Opens a link, or nothing when it was tampered with, sealed with another
/// key, or has expired.
#[must_use]
pub fn open(key: &[u8; 32], token: &str, now: u64) -> Option<Grant> {
  let sealed = URL_SAFE_NO_PAD.decode(token).ok()?;
  if sealed.len() < NONCE + TAG + 2 {
    return None;
  }
  let (nonce, body) = sealed.split_at(NONCE);
  let cipher = Aes256Gcm::new_from_slice(key).ok()?;
  let nonce = Nonce::try_from(nonce).ok()?;
  let plain = cipher.decrypt(&nonce, body).ok()?;
  let (prefix, expires): (String, u64) = serde_json::from_slice(&plain).ok()?;
  (expires >= now).then_some(Grant { prefix, expires })
}

/// Seals a grant with the given nonce. The API seals with a fresh random
/// nonce; this exists to check the two agree.
#[cfg(test)]
#[must_use]
pub fn seal_with(key: &[u8; 32], grant: &Grant, nonce: [u8; NONCE]) -> String {
  let cipher = Aes256Gcm::new_from_slice(key).unwrap_or_else(|_| unreachable!("the key is 32 bytes"));
  let plain = serde_json::to_vec(&(&grant.prefix, grant.expires))
    .unwrap_or_else(|_| unreachable!("a string and a number serialise"));
  let body = cipher
    .encrypt(&Nonce::from(nonce), plain.as_slice())
    .unwrap_or_else(|_| unreachable!("encryption cannot fail for in-memory input"));
  let mut sealed = Vec::with_capacity(NONCE + body.len());
  sealed.extend_from_slice(&nonce);
  sealed.extend_from_slice(&body);
  URL_SAFE_NO_PAD.encode(sealed)
}

#[cfg(test)]
mod tests {
  use super::*;

  const SECRET: [u8; 32] = [7; 32];

  fn grant() -> Grant {
    Grant {
      prefix: "t/0b8f6a52-1c7e-4f4e-9a3a-2f6f1d2b9c11/v/5d1e7c2a-8b3f-4a6e-9c1d-7e2f3a4b5c6d".into(),
      expires: 2_000_000_000,
    }
  }

  #[test]
  fn opens_what_it_sealed_until_it_expires() {
    let key = playback_key(&SECRET);
    let token = seal_with(&key, &grant(), [1; 12]);
    assert_eq!(open(&key, &token, 1_900_000_000), Some(grant()));
    assert_eq!(open(&key, &token, 2_000_000_001), None);
  }

  #[test]
  fn refuses_another_key_and_any_change() {
    let key = playback_key(&SECRET);
    let token = seal_with(&key, &grant(), [1; 12]);
    assert_eq!(open(&derive(&SECRET, "files-link-v1"), &token, 0), None);
    let mut bytes = URL_SAFE_NO_PAD.decode(&token).unwrap_or_default();
    if let Some(last) = bytes.last_mut() {
      *last ^= 1;
    }
    assert_eq!(open(&key, &URL_SAFE_NO_PAD.encode(bytes), 0), None);
    assert_eq!(open(&key, "not-a-token", 0), None);
  }

  /// Sealed by Node's crypto, as the API seals, with the same secret and
  /// nonce, so the two sides cannot drift apart unnoticed.
  #[test]
  fn opens_a_link_the_api_sealed() {
    let key = playback_key(&SECRET);
    assert_eq!(open(&key, API_SEALED, 0), Some(grant()));
    assert_eq!(seal_with(&key, &grant(), [1; 12]), API_SEALED);
  }

  const API_SEALED: &str = "AQEBAQEBAQEBAQEBoYyEAA6s1wT49KcV5Zv4vHnUomNiSnKGL7-H6_vc59ZrulqtJJslsGM7ivMauU4nKlF3j1HV29hr46bfLKmS7A17mJ20_9Oa7ZeGRsHywSFOBkJWGkOze66Y1yEhKrd1Ksy6PsnYSl9c2NvU";
}
