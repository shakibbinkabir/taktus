// Reading 16-bit PCM WAV files, for the examples. The crate itself takes
// samples, wherever they come from.

use std::path::{Path, PathBuf};

/// Samples a second, and the sound as mono samples between -1 and 1, of a
/// 16-bit PCM WAV, whatever other chunks it carries.
pub fn read(bytes: &[u8]) -> Option<(u32, Vec<f32>)> {
    if bytes.get(..4)? != b"RIFF" || bytes.get(8..12)? != b"WAVE" {
        return None;
    }
    let (mut at, mut rate, mut channels, mut bits) = (12usize, 0u32, 0usize, 0u16);
    while let Some(head) = bytes.get(at..at + 8) {
        let size = u32::from_le_bytes(head[4..].try_into().ok()?) as usize;
        let body = &bytes[at + 8..(at + 8).saturating_add(size).min(bytes.len())];
        match &head[..4] {
            b"fmt " => {
                channels = u16::from_le_bytes(body.get(2..4)?.try_into().ok()?) as usize;
                rate = u32::from_le_bytes(body.get(4..8)?.try_into().ok()?);
                bits = u16::from_le_bytes(body.get(14..16)?.try_into().ok()?);
            }
            b"data" if bits == 16 && channels > 0 => {
                let mono = body
                    .chunks_exact(2 * channels)
                    .map(|frame| {
                        let sum: f32 = frame.as_chunks::<2>().0.iter().map(|b| i16::from_le_bytes(*b) as f32).sum();
                        sum / (32768.0 * channels as f32)
                    })
                    .collect();
                return Some((rate, mono));
            }
            _ => {}
        }
        at = (at + 8).saturating_add(size).saturating_add(size & 1);
    }
    None
}

/// Every WAV under `dir`, into `out`.
#[allow(dead_code)]
pub fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
    for entry in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk(&path, out);
        } else if path.extension().is_some_and(|x| x.eq_ignore_ascii_case("wav")) {
            out.push(path);
        }
    }
}
