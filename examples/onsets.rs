// The ear's output for every 16-bit WAV under a folder, one file of little-endian
// f32 per recording: for trying ways of reading a beat without hearing it all again.
//   cargo run --release --example onsets -- <folder of WAVs> <folder to write>
use taktus::Ear;

#[path = "wav/mod.rs"]
mod wav;

fn main() {
    let (from, to) = (std::env::args().nth(1).expect("WAVs"), std::env::args().nth(2).expect("output folder"));
    std::fs::create_dir_all(&to).unwrap();
    let mut paths = Vec::new();
    wav::walk(std::path::Path::new(&from), &mut paths);
    let (mut sound, mut spent) = (0.0, std::time::Duration::ZERO);
    for path in &paths {
        let Some((rate, samples)) = std::fs::read(path).ok().and_then(|bytes| wav::read(&bytes)) else { continue };
        let mut ear = Ear::new(rate);
        let before = std::time::Instant::now();
        let onsets: Vec<f32> = samples.iter().filter_map(|s| ear.hear(*s)).collect();
        spent += before.elapsed();
        sound += samples.len() as f64 / rate as f64;
        let out: Vec<u8> = onsets.iter().flat_map(|v| v.to_le_bytes()).collect();
        std::fs::write(format!("{to}/{}.f32", path.file_stem().unwrap().to_string_lossy()), out).unwrap();
    }
    eprintln!(
        "{} recordings, {sound:.0} s of sound heard in {:.2} s: {:.1} microseconds per second of sound",
        paths.len(),
        spent.as_secs_f64(),
        spent.as_secs_f64() * 1e6 / sound
    );
}
