// The tempo of a recording, and where its beats fall.
//   cargo run --release --example tempo -- song.wav [more.wav ...]
// The files are 16-bit PCM WAV; `ffmpeg -i song.mp3 song.wav` makes one.
use taktus::{beats_of, tempo_of, Ear};

#[path = "wav/mod.rs"]
mod wav;

fn main() {
    let paths: Vec<String> = std::env::args().skip(1).collect();
    if paths.is_empty() {
        eprintln!("usage: tempo <file.wav> [more.wav ...]");
        std::process::exit(2);
    }
    for path in paths {
        let Some((rate, sound)) = std::fs::read(&path).ok().and_then(|bytes| wav::read(&bytes)) else {
            eprintln!("{path}: not a 16-bit PCM WAV that can be read");
            continue;
        };

        // Sound to onsets, onsets to a tempo, the tempo to every beat.
        let mut ear = Ear::new(rate);
        let onsets: Vec<f32> = sound.iter().filter_map(|sample| ear.hear(*sample)).collect();
        let Some(beat) = tempo_of(&onsets) else {
            println!("{path}: no beat found in {:.1} s of sound", sound.len() as f64 / rate as f64);
            continue;
        };
        let beats = beats_of(&onsets, beat.period);

        println!("{path}: {:.1} beats a minute (sure {:.2}, catch {:.2})", beat.bpm(), beat.sure, beat.catch);
        let first: Vec<String> = beats.iter().take(8).map(|b| format!("{b:.2}")).collect();
        println!("  {} beats, in seconds: {}{}", beats.len(), first.join(" "), if beats.len() > 8 { " …" } else { "" });
    }
}
