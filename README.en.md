# <img src="extension/icons/icon-128.png" width="36" height="36" align="top" alt="X Image Slicer icon" /> X Image Slicer

> A lightweight, 100% client-side Chrome / Edge browser extension built for X (formerly Twitter) horizontal multi-image carousels. Slice large panoramas into 2–20 equal slices (`1×N`) and fill directly into the post composer.

[![CI](https://github.com/321sssrt-bit/x-image-slicer/actions/workflows/ci.yml/badge.svg)](https://github.com/321sssrt-bit/x-image-slicer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome%20%2F%20Edge-Manifest%20V3-success)](extension/manifest.json)

[🇨🇳 简体中文 (README.zh-CN.md)](README.zh-CN.md) | **English** | [Main README](README.md) | [Privacy Policy](PRIVACY.md)

---

## ✨ Key Features

- ⚡ **1×N Horizontal Slicing (2–20 Slices)**: Opens at 8 slices by default with one-click **5 / 8 / 20** quick presets; cumulative pixel boundary math ensures 100% full-width coverage without dropped trailing pixels.
- 🖼️ **In-Composer Single Image Slicing**: Directly split and replace a single image already attached in the post composer without re-selecting files from disk.
- 🚀 **500MP Large Image Auto-Optimization**: Supports up to 500MP static bitmaps (including 400MP pixel-shift images); automatically manages dimensions (long edge ≤4096px) and file size (≤4.5MB per slice) while preserving PNG lossless quality and alpha channel.
- 📝 **Draft Protection & Composer Isolation**: Strictly preserves existing text, emojis, hashtags, and mentions; supports multiple composers without cross-contamination.
- 🔒 **100% Client-Side & Manual Publishing**: Decodes and slices entirely in local browser memory with zero network uploads; never automatically clicks Post/Publish.

---

## 💡 Quick Reference: Recommended Slice Counts

| Preset | Layout | Best For & Visual Effect |
| :---: | :---: | :--- |
| **5 Slices** | `1×5` | **Standard Wide Photos**: Ample width per slice with quick swiping, ideal for standard landscape shots and wallpapers. |
| **8 Slices** (Default) | `1×8` | **Panoramas & Wide Art**: Balanced pacing with smooth carousel rhythm on X. |
| **20 Slices** (Max) | `1×20` | **Ultra-Wide Scrolls & 500MP**: Fills the full 20-image per-post limit for an immersive panoramic experience. |

---

## 🚀 Quick Install (Chrome / Edge)

1. Download the latest `x-image-slicer-v*.zip` from [Releases](https://github.com/321sssrt-bit/x-image-slicer/releases) and extract it (or `git clone` this repository).
2. Navigate to your browser extensions page (`chrome://extensions` or `edge://extensions`) and enable **Developer mode**.
3. Click **Load unpacked** and select the extracted folder (or the [`extension`](extension) directory if cloned from source).
4. Visit [x.com](https://x.com) and click **"切图"** in the composer toolbar.

---

## 🧪 Development, Testing & Packaging

Prerequisites: Node.js ≥ 18.

```bash
npm install
npx playwright install chromium
npm test      # Run all 24 Playwright E2E test cases
npm run pack  # Build clean release bundle dist/x-image-slicer-v0.1.0.zip
```

---

## 📄 License & Disclaimer

- Open-source under the [MIT License](LICENSE). See [PRIVACY.md](PRIVACY.md) for privacy details.
- Independent third-party project, not affiliated with or endorsed by X Corp.
