#!/usr/bin/env python3
"""Creates a silent WAV for every planned sound that has no file yet. Never overwrites."""
import wave
from pathlib import Path

SOUNDS = Path(__file__).resolve().parent.parent / "assets" / "sounds"
names = ["jungle_level_complete", "jungle_monkey_happy", "jungle_monkey_curious",
         "jungle_ambience_loop", "jungle_toucan_squawk", "jungle_button_tap",
         "voice_plus", "voice_equals", "voice_great_job", "voice_try_again",
         *[f"voice_{n}" for n in range(21)]]
for name in names:
    path = SOUNDS / f"{name}.wav"
    if path.exists():
        continue
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(22050)
        w.writeframes(b"\0\0" * 1102)  # 0.05s of silence: decodes everywhere, unlike a 0-byte file
    print("placeholder", path.name)
