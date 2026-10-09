//! The engine as a WebAssembly module with nothing to import, for `index.js`.
//!
//! Numbers cross the border as they are; arrays cross through three buffers
//! this module owns. JavaScript writes samples or onsets where `input` says,
//! and reads onsets where `out_f32` says and beats or the numbers of a reading
//! where `out_f64` says. Ears and followers stay on this side, known to the
//! other by a number. There is no `unsafe` here: nothing is ever read through
//! a pointer JavaScript gave.

use std::cell::RefCell;
use taktus::{Beat, Ear, Follower, LEAD, RATE};

#[derive(Default)]
struct State {
    ears: Vec<Option<Ear>>,
    followers: Vec<Option<Follower>>,
    input: Vec<f32>,
    out_f32: Vec<f32>,
    out_f64: Vec<f64>,
}

thread_local!(static STATE: RefCell<State> = RefCell::default());

fn state<T>(f: impl FnOnce(&mut State) -> T) -> T {
    STATE.with(|s| f(&mut s.borrow_mut()))
}

/// A place for `thing` in `kept`, a freed one first; its number.
fn keep<T>(kept: &mut Vec<Option<T>>, thing: T) -> u32 {
    let at = kept.iter().position(Option::is_none).unwrap_or_else(|| {
        kept.push(None);
        kept.len() - 1
    });
    kept[at] = Some(thing);
    at as u32
}

/// The first `len` values JavaScript wrote, or all there are.
fn given(input: &[f32], len: usize) -> &[f32] {
    &input[..len.min(input.len())]
}

/// A reading's four numbers, where JavaScript reads them. 1 if there is one.
fn tell(out: &mut Vec<f64>, reading: Option<Beat>) -> u32 {
    out.clear();
    if let Some(b) = reading {
        out.extend([b.period, b.sure, b.catch, b.ago]);
    }
    reading.is_some() as u32
}

#[no_mangle]
pub extern "C" fn rate() -> u32 {
    RATE as u32
}

#[no_mangle]
pub extern "C" fn lead() -> f64 {
    LEAD
}

/// Room for `len` values; where to write them.
#[no_mangle]
pub extern "C" fn input(len: usize) -> *mut f32 {
    state(|s| {
        s.input.resize(len, 0.0);
        s.input.as_mut_ptr()
    })
}

#[no_mangle]
pub extern "C" fn out_f32() -> *const f32 {
    state(|s| s.out_f32.as_ptr())
}

#[no_mangle]
pub extern "C" fn out_f64() -> *const f64 {
    state(|s| s.out_f64.as_ptr())
}

#[no_mangle]
pub extern "C" fn ear_new(rate: u32) -> u32 {
    state(|s| keep(&mut s.ears, Ear::new(rate)))
}

/// The same ear, as new: for sound that starts again after a gap.
#[no_mangle]
pub extern "C" fn ear_reset(ear: u32, rate: u32) {
    state(|s| {
        if let Some(Some(e)) = s.ears.get_mut(ear as usize) {
            *e = Ear::new(rate);
        }
    })
}

#[no_mangle]
pub extern "C" fn ear_free(ear: u32) {
    state(|s| {
        if let Some(e) = s.ears.get_mut(ear as usize) {
            *e = None;
        }
    })
}

/// The first `len` samples written are heard; how many onsets came of them.
#[no_mangle]
pub extern "C" fn ear_hear(ear: u32, len: usize) -> usize {
    state(|s| {
        s.out_f32.clear();
        if let Some(Some(e)) = s.ears.get_mut(ear as usize) {
            s.out_f32.extend(given(&s.input, len).iter().filter_map(|sample| e.hear(*sample)));
        }
        s.out_f32.len()
    })
}

#[no_mangle]
pub extern "C" fn beat_of(len: usize) -> u32 {
    state(|s| tell(&mut s.out_f64, taktus::beat_of(given(&s.input, len))))
}

#[no_mangle]
pub extern "C" fn tempo_of(len: usize) -> u32 {
    state(|s| tell(&mut s.out_f64, taktus::tempo_of(given(&s.input, len))))
}

/// Every beat of the first `len` onsets written; how many.
#[no_mangle]
pub extern "C" fn beats_of(len: usize, period: f64) -> usize {
    state(|s| {
        s.out_f64 = taktus::beats_of(given(&s.input, len), period);
        s.out_f64.len()
    })
}

/// How much beats `period` apart catch, and how long ago the last fell.
#[no_mangle]
pub extern "C" fn beats_at(len: usize, period: f64) {
    state(|s| {
        let (catch, ago) = taktus::beats_at(given(&s.input, len), period);
        s.out_f64.clear();
        s.out_f64.extend([catch, ago]);
    })
}

#[no_mangle]
pub extern "C" fn follower_new(attentive: u32) -> u32 {
    state(|s| {
        let mut follower = Follower::default();
        follower.attentive = attentive != 0;
        keep(&mut s.followers, follower)
    })
}

#[no_mangle]
pub extern "C" fn follower_free(follower: u32) {
    state(|s| {
        if let Some(f) = s.followers.get_mut(follower as usize) {
            *f = None;
        }
    })
}

/// What `f` makes of the follower, or `none` if there is no such follower.
fn with<T>(follower: u32, none: T, f: impl FnOnce(&mut Follower, &mut State) -> T) -> T {
    state(|s| match s.followers.get_mut(follower as usize).and_then(Option::take) {
        Some(mut it) => {
            let made = f(&mut it, s);
            s.followers[follower as usize] = Some(it);
            made
        }
        None => none,
    })
}

#[no_mangle]
pub extern "C" fn follower_listens(follower: u32, now: f64) -> u32 {
    with(follower, 0, |f, _| f.listens(now) as u32)
}

/// Seconds until the sound is wanted again; negative while listening.
#[no_mangle]
pub extern "C" fn follower_sleeps(follower: u32, now: f64) -> f64 {
    with(follower, -1.0, |f, _| f.sleeps(now).unwrap_or(-1.0))
}

/// The first `len` onsets written are heard; 1 if the beat changed.
#[no_mangle]
pub extern "C" fn follower_hear(follower: u32, len: usize, now: f64) -> u32 {
    with(follower, 0, |f, s| f.hear(given(&s.input, len), now) as u32)
}

/// The beat's period and the time of one, where JavaScript reads them. 1 if there is one.
#[no_mangle]
pub extern "C" fn follower_beat(follower: u32) -> u32 {
    with(follower, 0, |f, s| {
        s.out_f64.clear();
        s.out_f64.extend(f.beat().into_iter().flat_map(|(period, at)| [period, at]));
        f.beat().is_some() as u32
    })
}

#[no_mangle]
pub extern "C" fn follower_moved(follower: u32) {
    with(follower, (), |f, _| f.moved())
}

#[no_mangle]
pub extern "C" fn follower_listened(follower: u32) -> f64 {
    with(follower, 0.0, |f, _| f.listened)
}
