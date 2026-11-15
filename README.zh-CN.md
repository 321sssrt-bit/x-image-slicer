# <img src="extension/icons/icon-128.png" width="36" height="36" align="top" alt="X Image Slicer icon" /> X Image Slicer (X 切图助手)

> 专为 X (Twitter) 横向多图轮播设计的轻量、纯本地 Chrome / Edge 浏览器扩展。一键将长图/大图切为 2～20 张等分切片并直接填入发帖框。

[![CI](https://github.com/321sssrt-bit/x-image-slicer/actions/workflows/ci.yml/badge.svg)](https://github.com/321sssrt-bit/x-image-slicer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome%20%2F%20Edge-Manifest%20V3-success)](extension/manifest.json)

**简体中文** | [English](README.en.md) | [主文档 (README.md)](README.md) | [隐私声明](PRIVACY.md)

---

## ✨ 核心特性

- ⚡ **1×N 左右等分（2～20 张）**：每次打开默认 8 张，内置 **5 / 8 / 20** 推荐档位一键切换；采用累计像素边界算法，全宽无损覆盖不丢边。
- 🖼️ **支持发帖框内直接切分**：发帖框内已添加的单张图片可直接一键切分替换，无需重新从本地电脑找图。
- 🚀 **5 亿像素大图本地优化**：支持最高 500MP（含 4 亿像素高解析大图），本地自动控制单片长边 ≤4096px、体积 ≤4.5MB，优先保留 PNG 无损与透明通道。
- 📝 **草稿保护与多框隔离**：完整保护发帖框已写好的文字/Emoji/#话题，多发帖框同时打开互不串扰。
- 🔒 **100% 纯本地与手动发布**：切图全程在本地内存运行，零网络请求、零持久化，严格保留手动点击发布的最终边界。

---

## 💡 推荐张数速查

| 预设档位 | 布局 | 推荐场景与视觉效果 |
| :---: | :---: | :--- |
| **5 张** | `1×5` | **标准横构图**：单片宽度充裕，滑动节奏轻快，适合常规摄影与宽屏壁纸。 |
| **8 张**（默认） | `1×8` | **全景与长图**：每次打开默认档位，X 轮播连续滑动体验最佳。 |
| **20 张**（上限） | `1×20` | **极致长卷 / 500MP 大图**：打满 X 单帖 20 图上限，呈现沉浸式横向长卷。 |

---

## 🚀 快速安装（Chrome / Edge）

1. 前往 [Releases](https://github.com/321sssrt-bit/x-image-slicer/releases) 下载最新 `x-image-slicer-v*.zip` 并解压到本地文件夹（开发者也可直接 `git clone` 本仓库）。
2. 浏览器打开扩展管理页面（`chrome://extensions` 或 `edge://extensions`），开启右上角 **「开发者模式」**。
3. 点击 **「加载已解压的扩展程序」**，选择解压后的文件夹（或源码仓库中的 [`extension`](extension) 目录）。
4. 打开 [x.com](https://x.com)，在新建帖子发帖框工具栏点击 **「切图」** 即可。

---

## 🧪 开发、测试与打包

环境要求：Node.js ≥ 18。

```bash
npm install
npx playwright install chromium
npm test      # 运行全部 24 项 Playwright 端到端测试
npm run pack  # 生成干净的发版包 dist/x-image-slicer-v0.1.0.zip
```

---

## 📄 开源许可证与免责声明

- 本项目基于 [MIT License](LICENSE) 开源，隐私说明见 [PRIVACY.md](PRIVACY.md)。
- 本项目为独立第三方开源工具，与 X Corp. 无隶属或官方关联。
