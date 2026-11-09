#!/usr/bin/env python3
"""Склеивает userscript из исходников, чтобы на iPhone ставился один файл."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parts = [
    ROOT / "userscript" / "header.js",
    ROOT / "src" / "engine.js",
    ROOT / "src" / "userscript-boot.js",
]
text = "\n".join(path.read_text(encoding="utf-8").rstrip() + "\n" for path in parts)
out = ROOT / "userscript" / "fast-video.user.js"
out.write_text(text, encoding="utf-8")
print(out)
