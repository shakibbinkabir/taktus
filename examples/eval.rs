// What the engine makes of recordings: every 16-bit mono WAV in a folder is read
// in windows all along it, and followed as an app would follow a song. One JSON
// line per file, for a script to judge against known tempi.
//   cargo run --release --example eval -- <folder> [seconds to use]
use taktus::{beat_of, beats_of, tempo_of, Ear, Follower, RATE};

#[path = "wav/mod.rs"]
mod wav;

fn main() {
    let folder = std::env::args().nth(1).expect("a folder of WAVs");
    let most: f64 = std::env::args().nth(2).and_then(|s| s.parse().ok()).unwrap_or(f64::MAX);
    let mut paths = Vec::new();
    wav::walk(std::path::Path::new(&folder), &mut paths);
    paths.sort();
    for path in paths {
        let Some((rate, sound)) = std::fs::read(&path).ok().and_then(|bytes| wav::read(&bytes)) else {
            eprintln!("{}: not a 16-bit PCM WAV", path.display());
            continue;
        };
        let sound = &sound[..sound.len().min((most * rate as f64) as usize)];
        let mut ear = Ear::new(rate);
        let onsets: Vec<f32> = sound.iter().filter_map(|s| ear.hear(*s)).collect();
        // The whole of it (window 0), then windows all along it.
        let mut windows = Vec::new();
        let whole = tempo_of(&onsets);
        match whole {
            Some(b) => windows.push(format!("[0,{:.2},{:.4},{:.3}]", b.bpm(), b.sure, b.catch)),
            None => windows.push("[0,0,0,0]".to_string()),
        }
        for seconds in [8usize, 12, 16] {
            let n = seconds * RATE;
            let mut from = 0;
            while from + n <= onsets.len() {
                match beat_of(&onsets[from..from + n]) {
                    Some(b) => windows.push(format!("[{seconds},{:.2},{:.4},{:.3}]", b.bpm(), b.sure, b.catch)),
                    None => windows.push(format!("[{seconds},0,0,0]")),
                }
                from += 2 * RATE;
            }
        }
        let mut follower = Follower::default();
        // BEAT_ATTENTIVE=1: the follower never rests.
        follower.attentive = std::env::var("BEAT_ATTENTIVE").is_ok();
        let mut ear = Ear::new(rate);
        let mut events = Vec::new();
        let mut heard = Vec::new();
        for (i, chunk) in sound.chunks(rate as usize / 10).enumerate() {
            let now = (i + 1) as f64 * 0.1;
            heard.clear();
            heard.extend(chunk.iter().filter_map(|s| ear.hear(*s)));
            if follower.listens(now) && follower.hear(&heard, now) {
                // When it was said, the tempo, and the time of one of its beats.
                match follower.beat() {
                    Some((period, beat)) => events.push(format!("[{now:.1},{:.3},{beat:.4}]", 60.0 / period)),
                    None => events.push(format!("[{now:.1},0,0]")),
                }
            }
        }
        let beats: Vec<String> =
            whole.map_or(Vec::new(), |b| beats_of(&onsets, b.period)).iter().map(|b| format!("{b:.3}")).collect();
        println!(
            "BEAT {{\"file\":{:?},\"seconds\":{:.1},\"listened\":{:.1},\"windows\":[{}],\"events\":[{}],\"beats\":[{}]}}",
            path.file_name().unwrap().to_string_lossy(),
            sound.len() as f64 / rate as f64,
            follower.listened,
            windows.join(","),
            events.join(","),
            beats.join(",")
        );
    }
}
