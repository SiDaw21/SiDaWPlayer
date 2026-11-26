"""Generate short, royalty-free demo tracks for the player prototype."""
from __future__ import annotations

import math
import os
import random

import numpy as np

SR = 22050
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "audio")
os.makedirs(OUT, exist_ok=True)


def note(name: str) -> float:
    names = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    octave = int(name[-1])
    return 440.0 * 2 ** ((names[name[:-1]] + 12 * (octave - 4) - 9) / 12)


def env(n: int, attack: float, release: float, curve: float = 1.0) -> np.ndarray:
    a = max(1, int(attack * SR))
    r = max(1, int(release * SR))
    e = np.ones(n)
    if a < n:
        e[:a] = np.linspace(0, 1, a) ** curve
    if r < n and a + r <= n:
        e[-r:] = np.linspace(1, 0, r) ** curve
    return e


def tone(freq: float, dur: float, shape: str = "sine", detune: float = 0.0) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    if shape == "pad":
        f = freq * (1 + detune)
        wave = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2 * t) + 0.12 * np.sin(2 * np.pi * f * 3 * t)
        e = env(n, 0.45, 0.9)
        return (wave / 1.47) * e
    if shape == "pluck":
        f = freq * (1 + detune)
        wave = np.sin(2 * np.pi * f * t) + 0.28 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-3 * t)
        e = env(n, 0.008, 0.55, 2.2)
        return wave * e
    if shape == "bass":
        f = freq * (1 + detune)
        wave = np.sin(2 * np.pi * f * t) + 0.18 * np.sin(2 * np.pi * f * 2 * t)
        e = env(n, 0.01, 0.3, 1.5)
        return wave * e
    wave = np.sin(2 * np.pi * freq * t)
    return wave * env(n, 0.01, 0.12)


def kick(dur: float = 0.34) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 120 * np.exp(-t * 24) + 45
    phase = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(phase) * np.exp(-t * 11) * env(n, 0.002, 0.05)


def snare(rng: np.random.Generator, dur: float = 0.22) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    body = np.sin(2 * np.pi * 185 * t) * 0.5
    hp = noise - np.concatenate([[0], noise[:-1]])
    return (hp * 0.6 + body) * np.exp(-t * 18) * env(n, 0.001, 0.03)


def hat(rng: np.random.Generator, dur: float = 0.09) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    hp = noise - np.concatenate([[0], noise[:-1]])
    return hp * np.exp(-t * 70) * env(n, 0.001, 0.01)


def add(buf: np.ndarray, sound: np.ndarray, at: float) -> None:
    i = int(at * SR)
    if i >= len(buf):
        return
    if i < 0:
        sound = sound[-i:]
        i = 0
    j = min(len(buf), i + len(sound))
    buf[i:j] += sound[: j - i]


def reverb(x: np.ndarray, mix: float = 0.18) -> np.ndarray:
    out = x.copy()
    for delay, gain in ((0.081, 0.42), (0.173, 0.28), (0.311, 0.17)):
        d = int(delay * SR)
        tail = np.zeros_like(x)
        tail[d:] = x[:-d] * gain
        out += tail * mix
    return out


def build(title: str, seed: int, bpm: int, progression: list[list[str]], melody: list[str], vibe: str) -> None:
    rng = np.random.default_rng(seed)
    beat = 60 / bpm
    bar = beat * 4
    loop = bar * len(progression)
    repeats = 4
    duration = loop * repeats
    n = int(duration * SR)
    left = np.zeros(n)
    right = np.zeros(n)

    for repeat in range(repeats):
        offset = repeat * loop
        for bi, chord in enumerate(progression):
            t0 = offset + bi * bar
            for ni, note_name in enumerate(chord):
                f = note(note_name)
                pan = 0.25 * math.sin(ni * 2.1 + bi)
                s = tone(f, bar * 1.08, "pad", detune=(ni % 2) * 0.0021)
                add(left, s * (0.72 - pan * 0.5), t0 + rng.uniform(0, 0.03))
                add(right, s * (0.72 + pan * 0.5), t0 + rng.uniform(0, 0.03))

            root = chord[0]
            for k in range(4):
                bt = t0 + k * beat
                if k in (0, 2) or vibe == "drive":
                    b = tone(note(root[:-1] + str(int(root[-1]) - 1)), beat * 0.85, "bass")
                    add(left, b * 0.62, bt)
                    add(right, b * 0.62, bt)
                if vibe != "soft":
                    add(left, kick() * 0.55, bt)
                    add(right, kick() * 0.55, bt)
                if k in (1, 3):
                    s = snare(rng)
                    add(left, s * 0.28, bt)
                    add(right, s * 0.28, bt)
                for h in range(2):
                    ht = bt + h * beat / 2
                    hb = hat(rng)
                    gain = 0.08 if h == 0 else 0.055
                    add(left, hb * gain, ht)
                    add(right, hb * gain * 1.1, ht + 0.006)

            # Melody: eighth notes with rests, different phrasing on the repeat.
            for step in range(8):
                idx = (bi * 3 + step + repeat * 5) % len(melody)
                if step in (2, 5) and repeat == 0:
                    continue
                if rng.random() < 0.14:
                    continue
                m = tone(note(melody[idx]), beat * 0.58, "pluck", detune=rng.uniform(-0.003, 0.003))
                gain = 0.32 if step % 4 != 0 else 0.42
                mt = t0 + step * beat / 2 + rng.uniform(-0.008, 0.008)
                add(left, m * gain * 0.9, mt)
                add(right, m * gain * 1.1, mt + 0.012)

    left = reverb(left)
    right = reverb(right)
    fade = int(1.2 * SR)
    left[:fade] *= np.linspace(0, 1, fade)
    right[:fade] *= np.linspace(0, 1, fade)
    left[-fade:] *= np.linspace(1, 0, fade)
    right[-fade:] *= np.linspace(1, 0, fade)
    stereo = np.stack([left, right], axis=1)
    peak = np.max(np.abs(stereo))
    stereo = stereo / peak * 0.88
    pcm = (stereo * 32767).astype("<i2")
    path = os.path.join(OUT, f"{title}.wav")
    pcm.tofile(path)
    print(f"{path}: {duration:.1f}s, {os.path.getsize(path) / 1e6:.1f} MB")


build(
    "morning-light", 7, 82,
    [["C4", "E4", "G4", "B4"], ["A3", "C4", "E4", "G4"], ["F3", "A3", "C4", "E4"], ["G3", "B3", "D4", "F4"]],
    ["C5", "E5", "G5", "B5", "A5", "G5", "E5", "D5", "C5", "G4", "A4", "B4"],
    "soft",
)
build(
    "neon-rain", 21, 94,
    [["D4", "F4", "A4", "C5"], ["A3", "C4", "E4", "G4"], ["B3", "D4", "F#4", "A4"], ["G3", "B3", "D4", "F4"]],
    ["A4", "C5", "D5", "F5", "E5", "D5", "C5", "A4", "F4", "G4", "A4", "C5"],
    "drive",
)
build(
    "midnight-city", 42, 72,
    [["F3", "A3", "C4", "E4"], ["C4", "E4", "G4", "B4"], ["D4", "F4", "A4", "C5"], ["A3", "C4", "E4", "G4"]],
    ["F4", "A4", "C5", "E5", "D5", "C5", "A4", "G4", "F4", "E4", "C4", "A4"],
    "soft",
)
build(
    "warm-wind", 99, 104,
    [["G3", "B3", "D4", "F#4"], ["E3", "G3", "B3", "D4"], ["A3", "C4", "E4", "G4"], ["D4", "F#4", "A4", "C5"]],
    ["D5", "F#5", "A5", "G5", "E5", "D5", "B4", "A4", "G4", "A4", "B4", "D5"],
    "drive",
)
