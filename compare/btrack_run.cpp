// BTrack over a list of 16-bit WAV files (paths on stdin): for each, the beats it
// reports, the tempo from their spacing, and the tempo it holds at the end.
// BTrack is built for 44.1 kHz; sound at half that is doubled by interpolation.
#include "BTrack.h"
#include <algorithm>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

static bool readWav(const std::string& path, std::vector<double>& mono, int& rate) {
    std::ifstream f(path, std::ios::binary);
    if (!f) return false;
    std::vector<char> b((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
    if (b.size() < 12 || std::memcmp(&b[0], "RIFF", 4) || std::memcmp(&b[8], "WAVE", 4)) return false;
    size_t at = 12; int channels = 0, bits = 0; rate = 0;
    while (at + 8 <= b.size()) {
        uint32_t size; std::memcpy(&size, &b[at + 4], 4);
        if (!std::memcmp(&b[at], "fmt ", 4)) {
            uint16_t ch, bi; uint32_t sr;
            std::memcpy(&ch, &b[at + 10], 2); std::memcpy(&sr, &b[at + 12], 4); std::memcpy(&bi, &b[at + 22], 2);
            channels = ch; rate = sr; bits = bi;
        } else if (!std::memcmp(&b[at], "data", 4)) {
            if (bits != 16 || channels < 1) return false;
            size_t n = std::min<size_t>(size, b.size() - at - 8) / (2 * channels);
            mono.resize(n);
            for (size_t i = 0; i < n; i++) {
                double s = 0;
                for (int c = 0; c < channels; c++) { int16_t v; std::memcpy(&v, &b[at + 8 + (i * channels + c) * 2], 2); s += v; }
                mono[i] = s / (32768.0 * channels);
            }
            return true;
        }
        at += 8 + size + (size & 1);
    }
    return false;
}

int main() {
    std::string path;
    while (std::getline(std::cin, path)) {
        if (!path.empty() && path.back() == '\r') path.pop_back();
        std::vector<double> x; int rate = 0;
        std::string name = path.substr(path.find_last_of('/') + 1);
        if (!readWav(path, x, rate)) { std::printf("{\"file\": \"%s\", \"bpm\": 0.0, \"beats\": null, \"secs\": 0.0, \"dur\": 0.0, \"error\": \"unreadable\"}\n", name.c_str()); continue; }
        double dur = (double)x.size() / rate;
        while (rate < 40000) {                      // 22.05 kHz -> 44.1 kHz
            std::vector<double> y(x.size() * 2);
            for (size_t i = 0; i < x.size(); i++) { y[2 * i] = x[i]; y[2 * i + 1] = 0.5 * (x[i] + (i + 1 < x.size() ? x[i + 1] : x[i])); }
            x.swap(y); rate *= 2;
        }
        const int hop = 512, frame = 1024;
        auto t0 = std::chrono::steady_clock::now();
        BTrack b(hop, frame);
        std::vector<double> buf(frame, 0.0), beats;
        long n = 0;
        for (size_t at = 0; at + hop <= x.size(); at += hop, n++) {
            std::copy(buf.begin() + hop, buf.end(), buf.begin());
            std::copy(x.begin() + at, x.begin() + at + hop, buf.begin() + (frame - hop));
            b.processAudioFrame(buf.data());
            if (b.beatDueInCurrentFrame()) beats.push_back(BTrack::getBeatTimeInSeconds(n, hop, rate));
        }
        double own = b.getCurrentTempoEstimate();
        double secs = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
        double bpm = 0;
        if (beats.size() > 2) {
            std::vector<double> gaps;
            for (size_t i = 1; i < beats.size(); i++) gaps.push_back(beats[i] - beats[i - 1]);
            std::nth_element(gaps.begin(), gaps.begin() + gaps.size() / 2, gaps.end());
            bpm = 60.0 / gaps[gaps.size() / 2];
        }
        std::printf("{\"file\": \"%s\", \"bpm\": %.3f, \"bpm_own\": %.3f, \"secs\": %.4f, \"dur\": %.2f, \"beats\": [", name.c_str(), bpm, own, secs, dur);
        for (size_t i = 0; i < beats.size(); i++) std::printf("%s%.4f", i ? ", " : "", beats[i]);
        std::printf("]}\n"); std::fflush(stdout);
    }
    return 0;
}
