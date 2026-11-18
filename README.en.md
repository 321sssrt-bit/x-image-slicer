# <img src="extension/icons/icon-128.png" width="36" height="36" align="top" alt="X Image Slicer icon" /> X Image Slicer

> **Stop slicing panoramas in Photoshop, exporting 20 files, fighting scrambled upload order, and hitting X's 5MB file limit.**  
> A 100% client-side Chrome / Edge extension built for X (Twitter) horizontal multi-image carousels: split up to **500MP** panoramas via **Equal or Free Split** into **2–20 seamless slices**, preview **X carousel crop warnings**, and auto-fill them directly into the post composer.

[![CI](https://github.com/321sssrt-bit/x-image-slicer/actions/workflows/ci.yml/badge.svg)](https://github.com/321sssrt-bit/x-image-slicer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome%20%2F%20Edge-Manifest%20V3-success)](extension/manifest.json)

[🇨🇳 简体中文 (README.zh-CN.md)](README.zh-CN.md) | **English** | [Main README](README.md) | [Privacy Policy](PRIVACY.md)

<p align="center">
  <img src="docs/demo.gif" width="820" alt="X Image Slicer Demo: 60MP 1x5 centered composition and 1x20 sunset cloud-sea carousel" />
</p>

---

## 🔥 Why X Image Slicer?

| Pain Point | Traditional Workflow (PS / Web Splitters) | **X Image Slicer** |
| :--- | :--- | :--- |
| **Workflow** | Open external app → slice → export ZIP → unzip → select files on X | **Native composer button**: pick a file or **slice an already-attached image in-place** |
| **Split Flexibility** | Rigid equal slices cut wide subjects in half | **Equal + Free Split modes**: click or keyboard-**merge / unmerge** dividers, re-slice losslessly from original, remembers last mode |
| **X Carousel Cropping** | Discover too late that wide slices get side-cropped in X's carousel | **X Web Carousel Crop Hints**: highlights cropped edges & percentage per slice, with one-click **Fix to Uncropped** in Free Split |
| **60MP–500MP Raw Photos** | Downscales whole image first (losing detail) or fails X's 5MB per-image limit | **500MP Engine**: slices in original coordinates first, then optimizes **per slice (≤4096px & ≤4.5MB)** |
| **Upload Ordering** | Selecting 8–20 files manually often scrambles order or drops a slice | **Auto-injects left-to-right** (reading-order aware for X's 4-photo 2×2 grid) with upload & order verification |
| **Right-Edge Pixel Loss** | Naive integer division drops trailing pixels at the right edge | **Cumulative pixel boundary math** (`≤1px` remainder distribution) covers **100% of full width** |
| **Privacy & Control** | Web tools upload your photos or ask for account tokens | **100% local in browser memory**, preserves draft text/hashtags, **never auto-clicks Post** |

---

## ✨ Key Features

- 🧩 **Zero-Context-Switch & In-Composer Slicing**: Lives right inside the X post composer toolbar. Pick a local photo or **directly split and replace a single image already pasted/dragged into the composer**, while shielding X page keyboard shortcuts inside the modal.
- ✂️ **Equal + Free Split Modes (Merge & Unmerge)**: Switch between Equal (`2–20` slices) and **Free Split**; click or use the keyboard on any divider to **merge adjacent slices, unmerge along original dividers, or clear merges**—always re-slicing from original coordinates—with local memory for your last-used mode.
- 📐 **X Web Carousel Crop Hints & One-Click Fix**: Models X web's actual multi-image carousel sizing in both Equal and Free Split previews, marking side-cropped regions and approximate crop percentage—plus a one-click **"调整为不裁边" (Fix to Uncropped)** button in Free Split.
- 🚀 **500MP Large-Image Engine (Slice First, Optimize Per-Slice)**: Handles medium-format 100MP–400MP pixel-shift photos effortlessly (`8958×6710` 60MP photo sliced in **0.8s**). Slices in original coordinates before optimizing each slice to `≤4096px` and `≤4.5MB`—preferring lossless PNG (preserving transparency) or `0.90` high-grade JPEG.
- 🎯 **5 / 8 / 20 Golden Presets & True-Aspect Preview**: Opens at `8` slices by default with one-click **5 / 8 / 20** presets (adjustable from `2` to `20`), showing true geometric aspect ratio, pixel dimensions, and byte size per slice.
- 📝 **Draft Protection & Smart Upload Verification**: Preserves existing text, emojis, `#hashtags`, and `@mentions`; ignores unrelated character-counter progress rings, verifies X's 4-photo 2×2 grid in reading order, auto-closes the modal once all slices are ready, and writes verification status back to the composer.
- 🔒 **100% Client-Side & Manual Publishing**: Runs entirely in local memory with zero network requests and zero telemetry (storing only your last-used split mode locally); never clicks Post/Publish on your behalf.

---

## 🎬 Live Demos: Golden Presets in Action

| `1×5` Centered Subject (`60.1MP` City Dusk) | `1×20` Full-Limit Scroll (`34.4MP` Cloud Sea) |
| :---: | :---: |
| <img src="docs/slice-5.gif" width="440" alt="1x5 City Dusk Slicing Demo" /> | <img src="docs/slice-20.gif" width="440" alt="1x20 Sunset Cloud Sea Slicing Demo" /> |
| **Default 8 → 1-Click 5 Slices**: Places the glowing landmark tower dead-center in Slice #3 | **Fills X's 20-Image Limit**: Seamless scroll from deep twilight indigo to golden sunset |

### 💡 Quick Reference: Recommended Slice Counts

| Preset | Layout | Best For & Visual Effect |
| :---: | :---: | :--- |
| **5 Slices** | `1×5` | **Architecture & Centered Subjects**: Odd slice count puts your hero subject right in the center slice (#3) with generous card width. |
| **8 Slices** (Default) | `1×8` | **Panoramas & Wide Photography**: Balanced card width and smooth carousel pacing. |
| **20 Slices** (Max) | `1×20` | **Ultra-Wide Scrolls & 500MP Art**: Maxes out X's 20-image per-post limit for an immersive cinematic scroll. |

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
npm test      # Run all 31 Playwright E2E test cases
npm run pack  # Build clean release bundle dist/x-image-slicer-v0.1.1.zip
```

---

## 📄 License & Disclaimer

- Open-source under the [MIT License](LICENSE). See [PRIVACY.md](PRIVACY.md) for privacy details.
- Independent third-party project, not affiliated with or endorsed by X Corp.
