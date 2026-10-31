#!/usr/bin/env python3
"""Cuts the continuous 'new jungle music.wav' into one seamless loop per level.

Each loop is 16 bars on the track's phrase grid. Loops overlap and start later for each
level, so the music keeps progressing. The last beat crossfades into the loop's start."""
import wave
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "music" / "new jungle music.wav"
OUT = ROOT / "assets" / "music" / "levels"
BPM, FIRST_DOWNBEAT = 112.0, 2.028
LOOP_BARS = 16
START_BARS = [2, 6, 10, 18, 22, 26, 34, 38, 42, 50, 54, 58, 62]

OUT.mkdir(exist_ok=True)
with wave.open(str(SOURCE)) as w:
    rate, frames = w.getframerate(), w.getnframes()
    audio = np.frombuffer(w.readframes(frames), np.int16).astype(float).reshape(-1, 2)

beat = 60 / BPM
fade = int(round(beat * rate))
for level, bar in enumerate(START_BARS, 1):
    start = int(round((FIRST_DOWNBEAT + bar * 4 * beat) * rate))
    length = int(round(LOOP_BARS * 4 * beat * rate))
    loop = audio[start:start + length].copy()
    tail = audio[start + length:start + length + fade]
    ramp = np.linspace(0, 1, fade)[:, None]
    loop[:fade] = loop[:fade] * ramp + tail * (1 - ramp)   # the tail fades out over the loop's start
    with wave.open(str(OUT / f"music_level_{level:02d}.wav"), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(np.clip(loop, -32768, 32767).astype(np.int16).tobytes())
