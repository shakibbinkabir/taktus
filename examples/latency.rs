// How late does the ear place a click? Clicks at known times, read back.
use taktus::{beat_of, Ear};
fn main() {
    let rate = 48_000.0;
    for bpm in [60.0, 72.0, 90.0, 100.0, 120.0, 128.0, 140.0, 174.0, 190.0] {
        for first in [0.20, 0.31, 0.47] {
            let period = 60.0 / bpm;
            let seconds = 16.0;
            let mut seed = 12345u32;
            let mut ear = Ear::new(rate as u32);
            let onsets: Vec<f32> = (0..(seconds * rate) as usize)
                .filter_map(|i| {
                    let t = i as f64 / rate;
                    seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
                    let noise = ((seed >> 8) as f32 / (1u32 << 24) as f32 - 0.5) * 0.02;
                    let since = (t - first).rem_euclid(period);
                    let thump = if t >= first && since < 0.06 {
                        ((since * 2.0 * std::f64::consts::PI * 90.0).sin() * (1.0 - since / 0.06)) as f32 * 0.8
                    } else {
                        0.0
                    };
                    ear.hear(noise + thump)
                })
                .collect();
            let heard = onsets.len() as f64 / 100.0;
            let b = beat_of(&onsets).unwrap();
            let last = first + ((seconds - first) / period).floor() * period;
            let off = (b.ago - (seconds - last) + period / 2.0).rem_euclid(period) - period / 2.0;
            print!(
                "{bpm:>5} bpm first {first}: read {:.2}, beat placed {:+.0} ms late (heard {heard:.2}s) | ",
                b.bpm(),
                -off * 1000.0
            );
        }
        println!();
    }
}
