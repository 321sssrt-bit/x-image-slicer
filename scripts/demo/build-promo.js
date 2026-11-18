'use strict';

/**
 * 将已录制的 1000×780 真实帧（dist/demo/frames/{slice-5,slice-20}）与桌面高清原片
 * 经过 Studio 级 Canvas 合成与重编排，输出：
 *   1. dist/demo/slice-5.gif & docs/slice-5.gif（1×5 黄金居中构图 + 实帖轮播，无白屏闪烁、帖子居中、带卖点胶囊）
 *   2. dist/demo/slice-20.gif & docs/slice-20.gif（1×20 满额长卷 + 实帖轮播，剔除 12 秒枯燥上传等待、帖子居中）
 *   3. dist/demo/demo.gif & docs/demo.gif（README 顶部主 GIF：约 13 秒浓缩 5 张居中构图 + 20 张云海长卷双高潮）
 *   4. dist/demo/twitter-promo-15s.mp4 & docs/twitter-promo-15s.mp4（Twitter/X 专用 15.0 秒 1920×1080 30fps 宣传片）
 * 用法：node scripts/demo/build-promo.js <5张演示原图> <20张演示原图>（与 record.js 用的同两张原图）
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(ROOT, 'dist/demo');
const DOCS_DIR = path.join(ROOT, 'docs');
const WORK_DIR = path.join(OUT_DIR, '_studio_build');

const FFMPEG =
  process.env.FFMPEG ||
  '/private/tmp/claude-501/-Users-zebro-x-image-slicer/5eab7d62-c8d9-4ea8-ac9d-f06a2e2bb271/scratchpad/tools/node_modules/ffmpeg-static/ffmpeg';

function ffmpeg(args) {
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
}

function toGif(mp4, gif, { width = 800, fps = 12, maxColors = 192 } = {}) {
  const filters = `fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${maxColors}:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`;
  ffmpeg(['-i', mp4, '-filter_complex', filters, '-loop', '0', gif]);
}

function sampleRange(scene, start, end, targetFrames, extra = {}) {
  const out = [];
  for (let i = 0; i < targetFrames; i++) {
    const ratio = targetFrames <= 1 ? 0 : i / (targetFrames - 1);
    const idx = Math.min(end, Math.max(start, Math.round(start + (end - start) * ratio)));
    out.push({
      scene,
      idx,
      file: path.join(OUT_DIR, 'frames', scene, `f${String(idx).padStart(5, '0')}.jpg`),
      progress: ratio,
      ...extra
    });
  }
  return out;
}

// 1. slice-5 精选分镜（24fps，总长约 10.5 秒 = 252 帧）
function buildSlice5Timeline() {
  return [
    ...sampleRange('slice-5', 10, 88, 32, {
      mode: 'composer',
      stepTag: 'STEP 1 · 原生入口',
      badge: '发帖框内直接点「切图」，无需离开 X 页面',
      sub: '支持新建帖子框与弹窗 · 框内已有单图也可一键原地切分替换'
    }),
    ...sampleRange('slice-5', 89, 200, 40, {
      mode: 'modal',
      stepTag: 'STEP 2 · 亿级像素直出',
      badge: '拖入 6010 万像素原片 (8958×6710) · 0.8s 本地等分 8 张',
      sub: '最高支持 5 亿像素 (500MP) · 先在原图坐标无损切分，再按单片独立优化'
    }),
    ...sampleRange('slice-5', 201, 325, 48, {
      mode: 'modal',
      stepTag: 'STEP 3 · 黄金档位构图',
      badge: '一键切到「5 张」档位 —— 橙色地标大楼精准落入第 3 片 C 位',
      sub: '单片自动控制在 ≤4096px & ≤4.5MB · 告别 X 5MB 拒传与暴力二压',
      highlightSlice5Center: true
    }),
    ...sampleRange('slice-5', 370, 470, 38, {
      mode: 'composer',
      stepTag: 'STEP 4 · 自动按序填入',
      badge: '自动按左→右顺序注入发帖框 · 原有文案与 Emoji 毫发无损',
      sub: '智能排除字数环干扰 · 核验全部就绪后自动关窗，保留手动发帖控制权'
    }),
    ...sampleRange('slice-5', 785, 950, 94, {
      mode: 'post-5',
      stepTag: 'RESULT · 真实帖子 1×5 轮播',
      badge: '发布后实拍：5 张切片无缝衔接，橙色大楼稳居画面中央',
      sub: '累计像素边界算法确保 100% 覆盖原图全宽，最右侧 0 像素丢失'
    })
  ];
}

// 2. slice-20 精选分镜（24fps，总长约 11.5 秒 = 276 帧）
function buildSlice20Timeline() {
  return [
    ...sampleRange('slice-20', 20, 312, 62, {
      mode: 'modal',
      stepTag: 'STEP 1 · 打满 20 图上限',
      badge: '3440 万像素云海长卷 (9651×3566) · 一键切满 1×20 张无损 PNG',
      sub: '告别 PS 手动切 20 张图与导出导入 · 未超尺寸预算时保留原像素与 PNG 无损'
    }),
    ...sampleRange('slice-20', 313, 462, 62, {
      mode: 'modal',
      stepTag: 'STEP 2 · 真实比例预览',
      badge: '1×20 真实几何比例预览条 · 标注每片精确像素与体积',
      sub: '9651px 全宽余数均匀分配 (482~483×3566px) · 绝不拉伸变形或丢尾部像素'
    }),
    ...sampleRange('slice-20', 520, 610, 34, {
      mode: 'composer',
      stepTag: 'STEP 3 · 20 图一次注入',
      badge: '20 张切片一键按序填入发帖框 · 自动完成上传与顺序核验',
      sub: '无需手动挑选 20 个文件，杜绝多图上传乱序或漏传'
    }),
    ...sampleRange('slice-20', 1100, 1466, 118, {
      mode: 'post-20',
      stepTag: 'RESULT · 1×20 云海日落长卷',
      badge: '真实 X 帖子实拍：从深邃暮色蓝紫一路滑向熔金日落！',
      sub: '打满 X 单帖 20 图轮播上限 · 每一帧接缝严丝合缝'
    })
  ];
}

// 3. README 顶部主 GIF（24fps，约 13.0 秒 = 312 帧）
function buildHeroGifTimeline() {
  return [
    ...sampleRange('slice-5', 35, 95, 22, {
      mode: 'composer',
      stepTag: '01 · 发帖框原生入口',
      badge: '在 X 发帖框直接点「切图」· 支持本地选图或框内单图原地切分',
      sub: '100% 浏览器本地内存运行 · 零外部服务器 · 完整保护已有草稿文案'
    }),
    ...sampleRange('slice-5', 135, 325, 56, {
      mode: 'modal',
      stepTag: '02 · 60MP 8→5 黄金居中',
      badge: '6010万像素原片直出 · 默认 8 张切 5 张，橙色大楼精准落入 C 位',
      sub: '支持最高 5 亿像素 · 单片自动优化至 ≤4096px / ≤4.5MB，告别 5MB 报错',
      highlightSlice5Center: true
    }),
    ...sampleRange('slice-5', 385, 455, 22, {
      mode: 'composer',
      stepTag: '03 · 自动按序填入 & 核验',
      badge: '一键填入发帖框并核验顺序 · 满传自动关窗，交还手动发布权',
      sub: '已就绪：5 张切片按左→右顺序排列，原有文案与 Emoji 完好保留'
    }),
    ...sampleRange('slice-5', 790, 950, 62, {
      mode: 'post-5',
      stepTag: '04 · 1×5 城市黄昏实帖轮播',
      badge: '真实 X 帖子效果：1×5 宽幅轮播，C 位橙色地标大楼一滑即现',
      sub: '累计像素边界等分算法 · 全宽无损覆盖不丢边'
    }),
    ...sampleRange('slice-20', 180, 455, 58, {
      mode: 'modal',
      stepTag: '05 · 一键打满 20 图上限',
      badge: '切换「20 张」档位：3440万像素云海长卷 (9651×3566) 无损切分',
      sub: '支持 2～20 张任意调节 · 内置 5 / 8 / 20 黄金推荐档位'
    }),
    ...sampleRange('slice-20', 1110, 1466, 92, {
      mode: 'post-20',
      stepTag: '06 · 1×20 云海日落沉浸长卷',
      badge: '打满 X 单帖 20 图上限：从深邃蓝紫一路滑向熔金晚霞！',
      sub: 'X Image Slicer · 专为 X 横向多图轮播打造的开源利器'
    })
  ];
}

// 4. Twitter 专用 15.0 秒宣传大片（30fps，严格 450 帧 = 15.00 秒）
function buildTwitter15sTimeline() {
  const frames = [];
  for (let i = 0; i < 66; i++) {
    frames.push({
      act: 1,
      actProgress: i / 65,
      globalProgress: i / 449
    });
  }
  const act2Source = [
    ...sampleRange('slice-5', 45, 92, 24, { subPhase: 'entry', mode: 'composer' }),
    ...sampleRange('slice-5', 140, 212, 30, { subPhase: 'slice8', mode: 'modal' }),
    ...sampleRange('slice-5', 245, 322, 46, { subPhase: 'slice5', mode: 'modal', highlightSlice5Center: true }),
    ...sampleRange('slice-5', 390, 455, 26, { subPhase: 'filled', mode: 'composer' })
  ];
  act2Source.forEach((item, idx) => {
    frames.push({
      act: 2,
      actProgress: idx / (act2Source.length - 1),
      globalProgress: frames.length / 449,
      ...item
    });
  });

  const act3Source = [
    ...sampleRange('slice-5', 790, 950, 56, { subPhase: 'post5', mode: 'post-5' }),
    ...sampleRange('slice-20', 185, 455, 58, { subPhase: 'modal20', mode: 'modal' })
  ];
  act3Source.forEach((item, idx) => {
    frames.push({
      act: 3,
      actProgress: idx / (act3Source.length - 1),
      globalProgress: frames.length / 449,
      ...item
    });
  });

  const act4Source = sampleRange('slice-20', 1110, 1466, 96, { subPhase: 'post20', mode: 'post-20' });
  act4Source.forEach((item, idx) => {
    frames.push({
      act: 4,
      actProgress: idx / (act4Source.length - 1),
      globalProgress: frames.length / 449,
      ...item
    });
  });

  for (let i = 0; i < 48; i++) {
    frames.push({
      act: 5,
      actProgress: i / 47,
      globalProgress: frames.length / 449,
      scene: 'slice-20',
      idx: 1455,
      file: path.join(OUT_DIR, 'frames/slice-20/f01455.jpg'),
      mode: 'outro'
    });
  }
  return frames;
}

const STUDIO_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0b0f17; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; }
</style>
</head>
<body>
<canvas id="stage"></canvas>
<script>
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const imgCache = new Map();

function loadImage(src) {
  if (!src) return Promise.resolve(null);
  if (imgCache.has(src)) return Promise.resolve(imgCache.get(src));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (imgCache.size > 18) {
        const firstKey = imgCache.keys().next().value;
        if (!firstKey.includes('static_')) imgCache.delete(firstKey);
      }
      imgCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error('Failed to load ' + src));
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/**
 * 将原始 1000×780 帧渲染到指定矩形区域 (dx, dy, dw, dh)
 */
function drawCleanedSourceFrame(ctx, img, mode, dx, dy, dw, dh, opts = {}) {
  const IW = img.width;  // 1000
  const IH = img.height; // 780

  ctx.save();
  roundRect(ctx, dx, dy, dw, dh, opts.radius ?? 20);
  ctx.clip();

  if (mode === 'post-5' || mode === 'post-20') {
    // 柔和浅色工作室底色
    const grad = ctx.createLinearGradient(dx, dy, dx, dy + dh);
    grad.addColorStop(0, '#eef2f6');
    grad.addColorStop(1, '#dde5ef');
    ctx.fillStyle = grad;
    ctx.fillRect(dx, dy, dw, dh);

    // 居中帖子卡片尺寸（保持轮播真实比例，左右留出优雅呼吸边距）
    const cardW = Math.round(dw * 0.72);
    const cardH = Math.round(dh * 0.93);
    const cardX = Math.round(dx + (dw - cardW) / 2);
    const cardY = Math.round(dy + (dh - cardH) / 2);

    // 卡片阴影与白底
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.18)';
    ctx.shadowBlur = 36;
    ctx.shadowOffsetY = 12;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, cardX, cardY, cardW, cardH, 20);
    ctx.fill();
    ctx.restore();

    // 卡片内容裁剪
    ctx.save();
    roundRect(ctx, cardX, cardY, cardW, cardH, 20);
    ctx.clip();

    // 顶部干净帖子头部 (高 11.5%)
    const headerH = Math.round(cardH * 0.115);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cardX, cardY, cardW, headerH);

    // 从 1000×780 原图裁剪纯轮播区域：x=84..662 (宽 578)，y=94..778 (高 684)
    // 完全避开左侧导航栏(0..82)与右侧空白及旧HUD(665..1000)！
    const sx = 84, sy = 94, sw = 578, sh = 684;
    const padX = Math.round(cardW * 0.026);
    const bodyY = cardY + headerH + 6;
    const bodyH = cardH - headerH - 18;
    ctx.drawImage(img, sx, sy, sw, sh, cardX + padX, bodyY, cardW - padX * 2, bodyH);

    // 顶部精致导航与文案栏
    ctx.fillStyle = '#0f1419';
    ctx.font = '700 ' + Math.round(headerH * 0.36) + 'px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.textBaseline = 'middle';
    const titleText = mode === 'post-5' ? '←  城市黄昏 🌆' : '←  云海日落 🌅';
    ctx.fillText(titleText, cardX + padX + 4, cardY + headerH * 0.52);

    // 右侧认证标签胶囊
    const pillText = mode === 'post-5' ? 'X 真实帖子 · 1×5 等分轮播' : 'X 真实帖子 · 1×20 满额长卷轮播';
    ctx.font = '600 ' + Math.round(headerH * 0.25) + 'px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    const pw = ctx.measureText(pillText).width + 26;
    const ph = Math.round(headerH * 0.50);
    const px = cardX + cardW - pw - padX;
    const py = Math.round(cardY + (headerH - ph) / 2);
    ctx.fillStyle = mode === 'post-5' ? '#eff6ff' : '#fff7ed';
    roundRect(ctx, px, py, pw, ph, ph / 2);
    ctx.fill();
    ctx.strokeStyle = mode === 'post-5' ? '#bfdbfe' : '#fed7aa';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = mode === 'post-5' ? '#1d4ed8' : '#c2410c';
    ctx.fillText(pillText, px + 13, py + ph * 0.53);

    // 底部分割线
    ctx.fillStyle = '#eff3f4';
    ctx.fillRect(cardX, cardY + headerH - 1, cardW, 1.5);
    ctx.restore();

    // 卡片外边框
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.08)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, cardX, cardY, cardW, cardH, 20);
    ctx.stroke();
  } else {
    // composer 或 modal 模式：按真实 1000×780 满画幅完整绘制，保留右下角真实计时器证明 0.8s 极速切分
    ctx.drawImage(img, 0, 0, IW, IH, dx, dy, dw, dh);

    // 8->5 居中构图高亮：在 1000×780 坐标系中，slice-03.jpg 卡片位于 x=284..378, y=420..643
    if (opts.highlightSlice5Center) {
      const sx = dx + (284 / IW) * dw;
      const sy = dy + (420 / IH) * dh;
      const sw = (94 / IW) * dw;
      const sh = (223 / IH) * dh;

      ctx.save();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = Math.max(3, dw * 0.0035);
      ctx.shadowColor = 'rgba(245, 158, 11, 0.55)';
      ctx.shadowBlur = 16;
      roundRect(ctx, sx - 3, sy - 3, sw + 6, sh + 6, 12);
      ctx.stroke();

      // C 位角标悬浮在卡片顶部边缘，不遮挡上方说明文字
      const tagW = Math.round(sw * 1.34);
      const tagH = Math.round(dh * 0.033);
      const tagX = sx + sw / 2 - tagW / 2;
      const tagY = sy - Math.round(tagH * 0.55);
      ctx.fillStyle = '#f59e0b';
      roundRect(ctx, tagX, tagY, tagW, tagH, tagH / 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 ' + Math.round(tagH * 0.58) + 'px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★ 第3片 C位居中', sx + sw / 2, tagY + tagH * 0.52);
      ctx.restore();
    }
  }

  ctx.restore();
}

/**
 * 渲染 README GIF 帧 (画幅 1000 × 820：上方 86px 卖点横幅 + 下方 722px 画面)
 */
window.renderGifFrame = async function(spec) {
  const W = 1000, H = 820;
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  const img = await loadImage(spec.file);
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, W, H);

  const barGrad = ctx.createLinearGradient(0, 0, W, 86);
  barGrad.addColorStop(0, '#0f172a');
  barGrad.addColorStop(0.5, '#1e293b');
  barGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = barGrad;
  ctx.fillRect(0, 0, W, 86);

  // 步骤胶囊
  ctx.font = '700 13px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  const stepW = ctx.measureText(spec.stepTag).width + 22;
  ctx.fillStyle = '#1d9bf0';
  roundRect(ctx, 20, 15, stepW, 26, 13);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(spec.stepTag, 31, 28.5);

  // 主卖点大字
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 18.5px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  ctx.fillText(spec.badge, 20 + stepW + 12, 28.5);

  // 副卖点说明
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 13.5px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  ctx.fillText(spec.sub, 22, 62);

  // 右上角品牌角标
  const brand = 'X Image Slicer · 纯本地';
  ctx.font = '600 12.5px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  const bw = ctx.measureText(brand).width + 20;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  roundRect(ctx, W - bw - 18, 15, bw, 26, 13);
  ctx.fill();
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(brand, W - bw - 8, 28.5);

  drawCleanedSourceFrame(ctx, img, spec.mode, 12, 86, 976, 722, {
    radius: 14,
    highlightSlice5Center: spec.highlightSlice5Center
  });
};

/**
 * 渲染 Twitter 15s 宣传视频帧 (1920 × 1080 Full HD 16:9)
 */
window.renderPromoFrame = async function(spec, assets) {
  const W = 1920, H = 1080;
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#070b14');
  bg.addColorStop(0.55, '#0f172a');
  bg.addColorStop(1, '#171324');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow1 = ctx.createRadialGradient(380, 260, 20, 380, 260, 520);
  glow1.addColorStop(0, 'rgba(29, 155, 240, 0.18)');
  glow1.addColorStop(1, 'rgba(29, 155, 240, 0)');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, W, H);

  const glow2 = ctx.createRadialGradient(1520, 780, 20, 1520, 780, 560);
  glow2.addColorStop(0, 'rgba(245, 158, 11, 0.15)');
  glow2.addColorStop(1, 'rgba(245, 158, 11, 0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  const iconImg = await loadImage(assets.icon);

  // === ACT 1: 0.0s - 2.2s 震撼开场钩子 ===
  if (spec.act === 1) {
    const img5 = await loadImage(assets.img5);
    const img20 = await loadImage(assets.img20);
    const p = spec.actProgress;

    ctx.save();
    const painText = '还在用 PS 算像素切图 → 导出 20 个文件 → 被 X 5MB 限制拒传？';
    ctx.font = '600 22px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    const pw = ctx.measureText(painText).width + 44;
    ctx.fillStyle = 'rgba(239, 68, 68, 0.14)';
    roundRect(ctx, (W - pw) / 2, 54, pw, 46, 23);
    ctx.fill();
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#fca5a5';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(painText, W / 2, 77);

    if (iconImg) {
      ctx.drawImage(iconImg, W / 2 - 420, 126, 56, 56);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 54px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.fillText('X Image Slicer · 切图助手', W / 2 + 32, 156);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '700 30px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.fillText('在 X 发帖框内，3 秒将亿级像素长图切为 2～20 张无缝轮播', W / 2, 220);
    ctx.restore();

    const splitProgress = Math.max(0, Math.min(1, (p - 0.15) / 0.65));
    const gap5 = Math.round(splitProgress * 12);
    const gap20 = Math.round(splitProgress * 5);

    const leftX = 90, leftY = 280, leftW = 830, leftH = 680;
    ctx.fillStyle = 'rgba(30, 41, 59, 0.65)';
    roundRect(ctx, leftX, leftY, leftW, leftH, 24);
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 24px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.fillText('🌆 6010 万像素原片 (8958×6710)  →  1×5 黄金居中构图', leftX + 28, leftY + 42);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 17px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.fillText('默认 8 张一键切 5 张 · 橙色地标大楼精准落入第 3 片 C 位', leftX + 28, leftY + 76);

    if (img5) {
      const areaX = leftX + 28, areaY = leftY + 104, areaW = leftW - 56, areaH = leftH - 132;
      const totalGap = gap5 * 4;
      const sliceW = (areaW - totalGap) / 5;
      for (let s = 0; s < 5; s++) {
        const sx = (img5.width / 5) * s;
        const sw = img5.width / 5;
        const dx = areaX + s * (sliceW + gap5);
        ctx.save();
        roundRect(ctx, dx, areaY, sliceW, areaH, 12);
        ctx.clip();
        ctx.drawImage(img5, sx, img5.height * 0.12, sw, img5.height * 0.78, dx, areaY, sliceW, areaH);
        ctx.restore();
        if (s === 2 && splitProgress > 0.3) {
          ctx.save();
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 3.5;
          roundRect(ctx, dx - 2, areaY - 2, sliceW + 4, areaH + 4, 13);
          ctx.stroke();
          ctx.fillStyle = '#f59e0b';
          roundRect(ctx, dx + sliceW / 2 - 58, areaY + 14, 116, 30, 15);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = '700 15px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('★ C位居中 #3', dx + sliceW / 2, areaY + 29);
          ctx.restore();
        }
      }
    }

    const rightX = 1000, rightY = 280, rightW = 830, rightH = 680;
    ctx.fillStyle = 'rgba(30, 41, 59, 0.65)';
    roundRect(ctx, rightX, rightY, rightW, rightH, 24);
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 24px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.fillText('🌅 3440 万像素云海 (9651×3566)  →  1×20 满额长卷', rightX + 28, rightY + 42);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 17px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.fillText('打满 X 单帖 20 图新上限 · 累计像素边界 0 丢边 · 无损 PNG 级画质', rightX + 28, rightY + 76);

    if (img20) {
      const areaX = rightX + 28, areaY = rightY + 104, areaW = rightW - 56, areaH = rightH - 132;
      const totalGap = gap20 * 19;
      const sliceW = (areaW - totalGap) / 20;
      for (let s = 0; s < 20; s++) {
        const sx = (img20.width / 20) * s;
        const sw = img20.width / 20;
        const dx = areaX + s * (sliceW + gap20);
        ctx.save();
        roundRect(ctx, dx, areaY, sliceW, areaH, 6);
        ctx.clip();
        ctx.drawImage(img20, sx, 0, sw, img20.height, dx, areaY, sliceW, areaH);
        ctx.restore();
      }
    }
    return;
  }

  // === ACT 5: 13.4s - 15.0s 品牌终极收尾卡 (Outro & 4大卖点 Bento) ===
  if (spec.act === 5) {
    const post5Img = await loadImage(assets.post5Final);
    const post20Img = await loadImage(assets.post20Final);

    ctx.save();
    if (iconImg) ctx.drawImage(iconImg, 100, 74, 72, 72);
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 52px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('X Image Slicer (X 切图助手)', 192, 98);
    ctx.fillStyle = '#38bdf8';
    ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.fillText('专为 X 横向多图轮播设计的纯本地 Chrome / Edge 开源扩展', 192, 140);

    const cta = 'GitHub 开源免费 · Manifest V3 · 零网络上传';
    ctx.font = '700 20px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    const cw = ctx.measureText(cta).width + 44;
    ctx.fillStyle = '#1d9bf0';
    roundRect(ctx, W - cw - 100, 82, cw, 54, 27);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(cta, W - cw - 78, 109);
    ctx.restore();

    const cards = [
      {
        icon: '🧩',
        title: '发帖框原生入口 & 框内单图直接切',
        line1: '无缝嵌入 X 发帖框工具栏；不仅能选本地原图，发帖框内已粘贴的单张图',
        line2: '也能一键原地切分替换，原有文案、Emoji 与 #话题 100% 完整保留。',
        tag: '零跳出工作流'
      },
      {
        icon: '🚀',
        title: '5 亿像素直出引擎 · 先切分再单片优化',
        line1: '最高支持 500MP（含 4 亿像素中画幅原片）。先在原图坐标零丢边切分，',
        line2: '再按单片独立控制在 ≤4096px、≤4.5MB 内，优先无损 PNG / 0.90 JPEG。',
        tag: '告别 5MB 报错与二压糊图'
      },
      {
        icon: '🎯',
        title: '5 / 8 / 20 黄金三档 · 累计像素零丢边',
        line1: '默认 8 张开箱即用，支持 2～20 张任意微调。5 张适合地标主体居中构图，',
        line2: '20 张打满 X 单帖多图新上限，真实几何比例预览绝不虚假拉伸。',
        tag: '余数均匀分配 0 丢边'
      },
      {
        icon: '🔒',
        title: '自动按序填入 + 智能核验 + 100% 纯本地',
        line1: '0.8s 极速切分，自动按左→右顺序注入发帖框，剔除字数环干扰，满传自动关窗。',
        line2: '全程在浏览器本地内存运行，零外部服务器、绝不越权自动点击发布。',
        tag: 'MIT 开源 · 隐私安全'
      }
    ];

    cards.forEach((c, i) => {
      const cy = 204 + i * 194;
      ctx.fillStyle = 'rgba(30, 41, 59, 0.78)';
      roundRect(ctx, 100, cy, 880, 176, 20);
      ctx.fill();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.font = '36px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(c.icon, 128, cy + 50);

      ctx.fillStyle = '#ffffff';
      ctx.font = '700 25px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.fillText(c.title, 182, cy + 44);

      ctx.font = '600 15px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      const tw = ctx.measureText(c.tag).width + 24;
      ctx.fillStyle = 'rgba(29, 155, 240, 0.2)';
      roundRect(ctx, 100 + 880 - tw - 22, cy + 22, tw, 30, 15);
      ctx.fill();
      ctx.fillStyle = '#7dd3fc';
      ctx.fillText(c.tag, 100 + 880 - tw - 10, cy + 41);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '400 18px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.fillText(c.line1, 130, cy + 96);
      ctx.fillText(c.line2, 130, cy + 128);
    });

    if (post5Img) {
      drawCleanedSourceFrame(ctx, post5Img, 'post-5', 1020, 204, 800, 368, { radius: 20 });
    }
    if (post20Img) {
      drawCleanedSourceFrame(ctx, post20Img, 'post-20', 1020, 594, 800, 368, { radius: 20 });
    }
    return;
  }

  // === ACT 2, 3, 4: 左栏大字卖点导视 (540px) + 右侧高清实操舞台 (1232×968) ===
  const frameImg = await loadImage(spec.file);

  const actMeta = {
    2: {
      step: 'HIGHLIGHT 01 / 亿级像素 & 黄金居中构图',
      title1: '6010万像素原片直出',
      title2: '8→5 一键C位居中',
      accent: '#f59e0b',
      bullets: [
        ['⚡ 发帖框原生入口', '点「切图」即开，也支持框内已有单图', '一键原地切分替换，无需跳出页面'],
        ['📐 最高 5 亿像素本地引擎', '8958×6710 原片直接拖入，0.8 秒完成', '原图坐标无损切分，不预先缩图毁细节'],
        ['🎯 5 / 8 / 20 黄金三档', '默认 8 张 → 点 5 张，橙色地标大楼', '瞬间精准落入第 3 片正中央 C 位'],
        ['🛡️ 单片独立控体积 ≤4.5MB', '自动控制在 ≤4096px & 4.5MB 内，', '彻底告别 X 5MB 拒传，保留草稿文案']
      ]
    },
    3: {
      step: 'HIGHLIGHT 02 / 实帖 1×5 轮播 & 20图满额切分',
      title1: '从 5 张建筑宽幅',
      title2: '到 20 张满额长卷',
      accent: '#38bdf8',
      bullets: [
        ['🌆 1×5 城市黄昏实帖轮播', '单片宽度充裕、滑动节奏轻快，', '发光橙色地标大楼稳居画面中央'],
        ['🌅 一键打满 X 20 图新上限', '3440 万像素云海 (9651×3566)', '一键切为 20 张无损 PNG 长卷切片'],
        ['📏 累计像素边界 0 丢边', '余数均匀分配 (482~483×3566px)，', '100% 覆盖全宽，最右侧绝不丢 1 像素'],
        ['🔍 真实几何比例预览条', '按实际上传文件比例展示每片尺寸与体积，', '绝不通过虚假拉伸掩盖真实画幅']
      ]
    },
    4: {
      step: 'HIGHLIGHT 03 / 真实 X 帖子 1×20 丝滑轮播',
      title1: '20 张云海日落长卷',
      title2: '一滑到底 · 沉浸拉满',
      accent: '#fb923c',
      bullets: [
        ['✨ 暮色蓝紫 → 熔金晚霞', '20 张切片在真实 X 轮播中严丝合缝，', '呈现影院级超宽横轴画卷体验'],
        ['📋 自动按序注入 + 顺序核验', '告别手动选 20 个文件怕乱序，', '全部上传就绪后自动关窗并回写状态'],
        ['🔒 100% 纯本地内存运行', '零外部服务器、零持久化存储，', '严格保留用户手动点击发布的最终边界'],
        ['💎 开源免费 (MIT License)', '支持 Chrome / Edge (Manifest V3)，', '通过 24 项 Playwright 端到端测试']
      ]
    }
  }[spec.act];

  ctx.save();
  if (iconImg) ctx.drawImage(iconImg, 68, 66, 44, 44);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '700 22px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('X Image Slicer · 切图助手', 124, 88);

  ctx.font = '700 15px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  const sw = ctx.measureText(actMeta.step).width + 28;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  roundRect(ctx, 68, 138, sw, 34, 17);
  ctx.fill();
  ctx.fillStyle = actMeta.accent;
  ctx.fillText(actMeta.step, 82, 155);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 44px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  ctx.fillText(actMeta.title1, 68, 218);
  ctx.fillStyle = actMeta.accent;
  ctx.fillText(actMeta.title2, 68, 274);

  actMeta.bullets.forEach(([bTitle, d1, d2], idx) => {
    const by = 334 + idx * 162;
    const isActive = Math.floor(spec.actProgress * actMeta.bullets.length) === idx;
    ctx.fillStyle = isActive ? 'rgba(30, 41, 59, 0.92)' : 'rgba(15, 23, 42, 0.65)';
    roundRect(ctx, 68, by, 528, 144, 18);
    ctx.fill();
    ctx.strokeStyle = isActive ? actMeta.accent : 'rgba(148, 163, 184, 0.18)';
    ctx.lineWidth = isActive ? 2.2 : 1.2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 22px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.fillText(bTitle, 92, by + 40);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '400 17px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.fillText(d1, 92, by + 82);
    if (d2) ctx.fillText(d2, 92, by + 110);
  });
  ctx.restore();

  const winX = 632, winY = 56, winW = 1232, winH = 968;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = '#1e293b';
  roundRect(ctx, winX, winY, winW, winH, 22);
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, winX, winY, winW, winH, 22);
  ctx.clip();
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(winX, winY, winW, 48);
  [['#ef4444', 26], ['#f59e0b', 48], ['#22c55e', 70]].forEach(([col, ox]) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(winX + ox, winY + 24, 6.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 15px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const urlLabel = spec.mode.startsWith('post')
    ? 'x.com · 真实已发布帖子多图轮播实拍 (1× 实时)'
    : 'x.com/compose/post · X Image Slicer 扩展实操 (1× 实时)';
  ctx.fillText(urlLabel, winX + winW / 2, winY + 24);
  ctx.restore();

  drawCleanedSourceFrame(ctx, frameImg, spec.mode, winX + 6, winY + 48, winW - 12, winH - 54, {
    radius: 16,
    highlightSlice5Center: spec.highlightSlice5Center
  });

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, H - 6, W, 6);
  ctx.fillStyle = actMeta.accent;
  ctx.fillRect(0, H - 6, Math.round(W * spec.globalProgress), 6);
};
</script>
</body>
</html>`;

async function renderSequence(page, frames, outSubDir, renderFnName, extraAssets = {}) {
  const dir = path.join(WORK_DIR, outSubDir);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const specForBrowser = {
      ...f,
      file: f.file ? 'file://' + f.file : null
    };
    await page.evaluate(
      ([fn, spec, assets]) => window[fn](spec, assets),
      [renderFnName, specForBrowser, extraAssets]
    );
    const outPath = path.join(dir, `f${String(i).padStart(5, '0')}.jpg`);
    await page.locator('#stage').screenshot({ path: outPath, type: 'jpeg', quality: 92 });
  }
  return dir;
}

async function main() {
  const [img5, img20] = process.argv.slice(2);
  if (!img5 || !img20) {
    console.error('用法：node scripts/demo/build-promo.js <5张演示原图> <20张演示原图>');
    process.exit(1);
  }
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  const htmlPath = path.join(WORK_DIR, 'studio.html');
  fs.writeFileSync(htmlPath, STUDIO_HTML);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto('file://' + htmlPath);

  const staticAssets = {
    icon: 'file://' + path.join(ROOT, 'extension/icons/icon-128.png'),
    img5: 'file://' + path.resolve(img5),
    img20: 'file://' + path.resolve(img20),
    post5Final: 'file://' + path.join(OUT_DIR, 'frames/slice-5/f00945.jpg'),
    post20Final: 'file://' + path.join(OUT_DIR, 'frames/slice-20/f01455.jpg')
  };

  console.log('1/4 渲染 slice-5 增强版序列 (24fps)...');
  const slice5Timeline = buildSlice5Timeline();
  const slice5Dir = await renderSequence(page, slice5Timeline, 'slice-5', 'renderGifFrame');
  const slice5Mp4 = path.join(OUT_DIR, 'slice-5.mp4');
  ffmpeg([
    '-framerate', '24',
    '-i', path.join(slice5Dir, 'f%05d.jpg'),
    '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    slice5Mp4
  ]);
  toGif(slice5Mp4, path.join(OUT_DIR, 'slice-5.gif'), { width: 780, fps: 12 });
  fs.copyFileSync(path.join(OUT_DIR, 'slice-5.gif'), path.join(DOCS_DIR, 'slice-5.gif'));

  console.log('2/4 渲染 slice-20 增强版序列 (24fps)...');
  const slice20Timeline = buildSlice20Timeline();
  const slice20Dir = await renderSequence(page, slice20Timeline, 'slice-20', 'renderGifFrame');
  const slice20Mp4 = path.join(OUT_DIR, 'slice-20.mp4');
  ffmpeg([
    '-framerate', '24',
    '-i', path.join(slice20Dir, 'f%05d.jpg'),
    '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    slice20Mp4
  ]);
  toGif(slice20Mp4, path.join(OUT_DIR, 'slice-20.gif'), { width: 780, fps: 12 });
  fs.copyFileSync(path.join(OUT_DIR, 'slice-20.gif'), path.join(DOCS_DIR, 'slice-20.gif'));

  console.log('3/4 渲染 README 主 GIF demo.gif (24fps)...');
  const heroTimeline = buildHeroGifTimeline();
  const heroDir = await renderSequence(page, heroTimeline, 'hero-gif', 'renderGifFrame');
  const demoMp4 = path.join(OUT_DIR, 'demo.mp4');
  ffmpeg([
    '-framerate', '24',
    '-i', path.join(heroDir, 'f%05d.jpg'),
    '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    demoMp4
  ]);
  toGif(demoMp4, path.join(OUT_DIR, 'demo.gif'), { width: 780, fps: 11, maxColors: 176 });
  fs.copyFileSync(path.join(OUT_DIR, 'demo.gif'), path.join(DOCS_DIR, 'demo.gif'));

  console.log('4/4 渲染 Twitter 专用 15.0 秒 1080p 宣传片 (30fps, 450 frames)...');
  const promoTimeline = buildTwitter15sTimeline();
  const promoDir = await renderSequence(page, promoTimeline, 'twitter-promo-15s', 'renderPromoFrame', staticAssets);
  const promoMp4 = path.join(OUT_DIR, 'twitter-promo-15s.mp4');
  ffmpeg([
    '-framerate', '30',
    '-i', path.join(promoDir, 'f%05d.jpg'),
    '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.1', '-crf', '17',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    promoMp4
  ]);
  fs.copyFileSync(promoMp4, path.join(DOCS_DIR, 'twitter-promo-15s.mp4'));

  await browser.close();
  console.log('全部完成！');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
