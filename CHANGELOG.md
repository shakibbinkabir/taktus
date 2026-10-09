# Changelog

What changed for those who use the library. Versions follow [semantic versioning](https://semver.org); while the version begins with 0, a change of the middle number may break code that uses it.

## 0.1.0

The first release.

- `Ear`: mono sound in, sample by sample; onsets out, a hundred a second.
- `beat_of`, `tempo_of`: the beat of a few seconds of onsets, or of a whole recording, with how far to trust it.
- `beats_of`: every beat of a stretch already heard.
- `beats_at`: where the beats of a tempo known from elsewhere fall.
- `Follower`: a song followed as it plays, listening only when it is worth it.
- For JavaScript, on npm: the same engine as one WebAssembly module, with TypeScript types.
- Measured on Ballroom, GTZAN, Giantsteps, Hainsworth and SMC, and against ten other libraries on the same files; the README has the tables, and `compare/` what produced them.
