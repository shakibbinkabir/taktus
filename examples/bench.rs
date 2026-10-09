// What the engine costs: time per second of sound heard, time per reading,
// what following a whole song adds up to, and the memory it holds.
//   cargo run --release --example bench
use std::time::Instant;
use taktus::{beat_of, beats_of, tempo_of, Beat, Ear, Follower, RATE};

/// Three and a half minutes of a drum loop over noise, at `rate`.
fn song(rate: u32, seconds: f64, bpm: f64) -> Vec<f32> {
    let (period, mut seed) = (60.0 / bpm, 99u32);
    (0..(seconds * rate as f64) as usize)
        .map(|i| {
            let t = i as f64 / rate as f64;
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            let noise = ((seed >> 8) as f32 / (1u32 << 24) as f32 - 0.5) * 0.05;
            let since = t.rem_euclid(period);
            let kick = if since < 0.08 {
                ((since * 2.0 * std::f64::consts::PI * 70.0).sin() * (1.0 - since / 0.08)) as f32 * 0.7
            } else {
                0.0
            };
            let hat = if (t + period / 2.0).rem_euclid(period) < 0.02 { noise * 8.0 } else { 0.0 };
            noise + kick + hat
        })
        .collect()
}

fn main() {
    println!("memory held: the ear {} bytes, the follower {} bytes plus up to {} bytes of onsets while it listens; a reading {} bytes",
        std::mem::size_of::<Ear>(), std::mem::size_of::<Follower>(), 16 * RATE * 4, std::mem::size_of::<Beat>());
    for rate in [44_100u32, 48_000] {
        let sound = song(rate, 210.0, 122.0);
        // The ear alone, on all of it.
        let mut ear = Ear::new(rate);
        let t = Instant::now();
        let onsets: Vec<f32> = sound.iter().filter_map(|s| ear.hear(*s)).collect();
        let ear_time = t.elapsed().as_secs_f64();
        println!(
            "{rate} Hz: the ear takes {:.0} microseconds per second of sound ({:.3}% of one core while listening)",
            ear_time * 1e6 / 210.0,
            ear_time / 210.0 * 100.0
        );
        if rate == 48_000 {
            for seconds in [8usize, 12, 16, 30] {
                let t = Instant::now();
                let mut n = 0;
                for from in (0..onsets.len() - seconds * RATE).step_by(97).take(200) {
                    std::hint::black_box(beat_of(&onsets[from..from + seconds * RATE]));
                    n += 1;
                }
                println!(
                    "   a reading of {seconds:>2} s of onsets takes {:.0} microseconds",
                    t.elapsed().as_secs_f64() * 1e6 / n as f64
                );
            }
            // A 30-second excerpt already heard: its tempo, then every beat.
            let (t, mut n) = (Instant::now(), 0);
            for from in (0..onsets.len() - 30 * RATE).step_by(397).take(40) {
                let excerpt = &onsets[from..from + 30 * RATE];
                std::hint::black_box(tempo_of(excerpt).map(|beat| beats_of(excerpt, beat.period)));
                n += 1;
            }
            println!(
                "   the tempo and every beat of 30 s of onsets take {:.0} microseconds",
                t.elapsed().as_secs_f64() * 1e6 / n as f64
            );
        }
        // Following the song as an app would: the sound is only heard when the follower wants it.
        let mut follower = Follower::default();
        let mut ear = Ear::new(rate);
        let (mut spent, mut heard, mut first, mut last) = (0.0, Vec::new(), None, 0.0);
        for (i, chunk) in sound.chunks(rate as usize / 10).enumerate() {
            let now = (i + 1) as f64 * 0.1;
            let t = Instant::now();
            if follower.listens(now) {
                heard.clear();
                heard.extend(chunk.iter().filter_map(|s| ear.hear(*s)));
                if follower.hear(&heard, now) {
                    if let Some((period, _)) = follower.beat() {
                        first.get_or_insert(now);
                        last = 60.0 / period;
                    }
                }
            } else {
                ear = Ear::new(rate);
            }
            spent += t.elapsed().as_secs_f64();
        }
        println!("   following 210 s of it: listened {:.0} s ({:.0}%), {:.1} ms of work in all = {:.4}% of one core; beat found after {:.1} s, ends at {last:.2} bpm (it is 122)",
            follower.listened, follower.listened / 210.0 * 100.0, spent * 1e3, spent / 210.0 * 100.0, first.unwrap_or(0.0));
    }
}
