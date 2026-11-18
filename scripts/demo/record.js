'use strict';

// 在真实 x.com 上自动演示「切图 → 填入 → 发帖 → 查看轮播」全流程并录制，输出 MP4 + GIF。
// 前置：node scripts/demo/import-safari-cookies.js（演示 profile 已登录）
// 用法：FFMPEG=/path/to/ffmpeg node scripts/demo/record.js <5张演示图> <20张演示图> [--publish] [--only=slice-5|slice-20]
//   不带 --publish：空跑，发帖请求在网络层被拦截，录到点「发帖」前为止
//   带 --publish：真实发出帖子，并录制发出后的轮播
// 输出：dist/demo/{slice-5,slice-20,demo}.{mp4,gif}
// 全程 1× 实时录制，不加速、不剪辑；画面里的计时器从点「切图」到帖子发出。

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const EXTENSION_DIR = path.join(ROOT, 'extension');
const PROFILE_DIR = process.env.X_SLICER_DEMO_PROFILE || path.join(os.homedir(), '.x-image-slicer-demo-profile');
const OUT_DIR = path.join(ROOT, 'dist/demo');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/159.0.0.0 Safari/537.36';
const VIEWPORT = { width: 1000, height: 780 };
const SCALE = 2;
const FPS = 30;
const GIF_WIDTH = 720; // README 用：720px / 10fps / 128 色，5 张片段约 5MB
const GIF_FPS = 10;

const args = process.argv.slice(2);
const PUBLISH = args.includes('--publish');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice('--only='.length);
const [img5, img20] = args.filter((a) => !a.startsWith('--'));

const SCENES = [
  // 5 张：默认 8 → 切到 5，橙色楼落在中间那片
  { name: 'slice-5', image: img5 && path.resolve(img5), text: '城市黄昏 🌆', preset: 5 },
  // 20 张：发帖框缩略图会裁成方块，先在弹窗预览条里滑完 20 片
  { name: 'slice-20', image: img20 && path.resolve(img20), text: '云海日落 🌅', preset: 20, scrollPreview: true }
];

// 演示用：假光标 + 点击波纹 + 计时器（Playwright 截屏不含系统光标）
const OVERLAY_SCRIPT = `
(() => {
  const install = () => {
    if (document.getElementById('__demo_cursor')) return;
    const root = document.documentElement;
    const c = document.createElement('div');
    c.id = '__demo_cursor';
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l16 10.5-7 1.2 4.3 7.8-3 1.6-4.3-7.9L4 20z" fill="#0f1419" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '-40px', top: '-40px', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-3px,-2px)' });
    root.appendChild(c);
    window.addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    window.addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      Object.assign(r.style, { position: 'fixed', left: e.clientX - 18 + 'px', top: e.clientY - 18 + 'px', width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(29,155,240,.35)', zIndex: 2147483646, pointerEvents: 'none', transition: 'transform .45s ease-out, opacity .45s ease-out' });
      root.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(1.8)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 500);
    }, true);

    const hud = document.createElement('div');
    hud.id = '__demo_hud';
    Object.assign(hud.style, { position: 'fixed', right: '16px', bottom: '16px', zIndex: 2147483645, pointerEvents: 'none', display: 'none', gap: '8px', alignItems: 'center', font: '600 15px/1 -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif' });
    const pill = 'padding:9px 14px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.18);';
    hud.innerHTML = '<span style="' + pill + 'background:#fff;color:#0f1419">1× 实时录制</span>'
      + '<span data-clock style="' + pill + 'background:rgba(15,20,25,.88);color:#fff;font-variant-numeric:tabular-nums">⏱ 0.0 s</span>';
    root.appendChild(hud);
    let start = 0, end = 0;
    const tick = () => {
      if (start) hud.querySelector('[data-clock]').textContent = '⏱ ' + (((end || Date.now()) - start) / 1000).toFixed(1) + ' s' + (end ? ' 已发出' : '');
      requestAnimationFrame(tick);
    };
    tick();
    window.__demoHud = {
      start(t) { start = t; hud.style.display = 'flex'; },
      stop(t) { end = t; }
    };

    // 发帖后首次查看自己的帖子，X 会弹「推广这个帖子」：出现即点「以后再说」
    new MutationObserver(() => {
      for (const b of document.querySelectorAll('#layers button, #layers [role="button"]')) {
        if (b.textContent.trim() === '以后再说') b.click();
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.documentElement) install(); else document.addEventListener('DOMContentLoaded', install);
})();
`;

// 发帖弹窗阶段：隐藏背后的时间线和侧栏，只留发帖框（html.demo-clean 时生效）
const CLEAN_CSS = `
  html.demo-clean header[role="banner"], html.demo-clean main[role="main"] { visibility: hidden !important; }
  html.demo-clean body, html.demo-clean #react-root { background: #f7f9f9 !important; }
  [data-testid="sidebarColumn"], [data-testid="GrokDrawer"], [data-testid="chat-drawer-root"] { visibility: hidden !important; }
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hud = (page, fn, arg) => page.evaluate(([f, a]) => window.__demoHud?.[f](a), [fn, arg]).catch(() => {});

function createRecorder(page) {
  const frames = [];
  const waits = [];
  let cdp;
  return {
    async start(dir) {
      fs.mkdirSync(dir, { recursive: true });
      cdp = await page.context().newCDPSession(page);
      cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
        const file = path.join(dir, `f${String(frames.length).padStart(5, '0')}.jpg`);
        fs.writeFileSync(file, Buffer.from(data, 'base64'));
        frames.push({ file, t: metadata.timestamp, recv: Date.now() / 1000 });
        await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      });
      await cdp.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 92,
        maxWidth: VIEWPORT.width * SCALE,
        maxHeight: VIEWPORT.height * SCALE
      });
    },
    // 等待段：只记录真实耗时，成片不加速
    async waitFor(promise, label) {
      const start = Date.now() / 1000;
      await promise;
      const end = Date.now() / 1000;
      waits.push([start, end]);
      console.log(`  ${label}：真实 ${(end - start).toFixed(1)}s`);
    },
    async stop() {
      await cdp.send('Page.stopScreencast').catch(() => {});
      return { frames, waits };
    }
  };
}

// 把可变帧率的截屏帧按真实时间拼成 concat 列表
function writeConcatList({ frames }, listFile, tailSeconds) {
  // 截屏约 60fps，不能按 1/FPS 取下限，否则时长翻倍
  const scaled = (t0, t1) => Math.max(t1 - t0, 0.001);
  const lines = [];
  frames.forEach((f, i) => {
    const next = frames[i + 1];
    lines.push(`file '${f.file}'`, `duration ${(next ? scaled(f.t, next.t) : tailSeconds).toFixed(4)}`);
  });
  lines.push(`file '${frames[frames.length - 1].file}'`);
  fs.writeFileSync(listFile, lines.join('\n'));
}

function ffmpeg(ffArgs) {
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', ...ffArgs], { stdio: 'inherit' });
}

function toGif(mp4, gif) {
  const filters = `fps=${GIF_FPS},scale=${GIF_WIDTH}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
  ffmpeg(['-i', mp4, '-filter_complex', filters, '-loop', '0', gif]);
}

// 按真人速度移动鼠标：缓出曲线，距离越远步数越多，约 0.15～0.3 秒
const mousePos = new WeakMap();
async function humanMove(page, x, y) {
  const [x0, y0] = mousePos.get(page) || [VIEWPORT.width / 2, VIEWPORT.height / 2];
  const n = Math.max(6, Math.min(16, Math.round(Math.hypot(x - x0, y - y0) / 45)));
  for (let i = 1; i <= n; i++) {
    const k = 1 - Math.pow(1 - i / n, 3);
    await page.mouse.move(x0 + (x - x0) * k, y0 + (y - y0) * k);
    await sleep(14);
  }
  mousePos.set(page, [x, y]);
}

async function moveAndClick(page, locator, { pauseBefore = 60 } = {}) {
  await locator.waitFor({ state: 'visible' });
  const box = await locator.boundingBox();
  await humanMove(page, box.x + box.width / 2, box.y + box.height / 2);
  await sleep(pauseBefore);
  await page.mouse.down();
  await sleep(50);
  await page.mouse.up();
}

// 在 container 里找到横向可滚动的元素，鼠标悬停其上用滚轮在约 steps 帧内滑到尾
async function scrollHorizontally(page, container, steps = 90) {
  const target = await container.evaluateHandle((el) => {
    const all = [el, ...el.querySelectorAll('*'), ...(el.shadowRoot ? el.shadowRoot.querySelectorAll('*') : [])];
    return all.reduce((best, n) => (n.scrollWidth - n.clientWidth > (best ? best.scrollWidth - best.clientWidth : 2) ? n : best), null);
  });
  const el = target.asElement();
  if (!el) {
    // 不是原生滚动容器：退而点「下一张」箭头
    const next = container.locator('[aria-label*="下一"], [aria-label*="Next" i]').first();
    for (let i = 0; i < 25 && (await next.isVisible().catch(() => false)); i++) {
      await moveAndClick(page, next, { pauseBefore: 120 });
      await sleep(350);
    }
    return;
  }
  await el.scrollIntoViewIfNeeded();
  const box = await el.boundingBox();
  await humanMove(page, box.x + box.width / 2, box.y + box.height / 2);
  await sleep(80);
  const scrollable = await el.evaluate((n) => n.scrollWidth - n.clientWidth);
  const delta = Math.ceil(scrollable / steps);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(delta, 0);
    await sleep(16);
  }
}

// 帖子页：等图片加载、关掉首次出现的「推广这个帖子」弹窗，然后滑动轮播
async function showPost(page, rec, scene) {
  await page.evaluate(() => document.documentElement.classList.remove('demo-clean'));
  const tweet = page.locator('article[data-testid="tweet"]').first();
  await rec.waitFor(tweet.locator('[data-testid="tweetPhoto"] img').first().waitFor({ timeout: 30000 }), '打开帖子');
  await sleep(700);
  // 轮播是 scroll-snap mandatory，滚轮小步滚动会被吸回原位，所以点「下一步」箭头
  const next = tweet.getByRole('button', { name: '下一步' });
  const list = tweet.locator('[data-testid="ScrollSnap-List"]').first();
  // 等平滑滚动停稳后再判断是否到底，否则会在动画中途误判、多点一次
  const atEnd = () =>
    list
      .evaluate(
        (n) =>
          new Promise((resolve) => {
            let last = -1;
            const check = () => {
              if (n.scrollLeft === last) {
                // 吸附点不一定等于最大 scrollLeft，以「最后一张已完整露出」为准
                const lastItem = n.lastElementChild;
                const fullyShown = lastItem && lastItem.getBoundingClientRect().right <= n.getBoundingClientRect().right + 4;
                return resolve(fullyShown || n.scrollLeft >= n.scrollWidth - n.clientWidth - 4);
              }
              last = n.scrollLeft;
              setTimeout(check, 120);
            };
            check();
          }),
        null,
        { timeout: 5000 }
      )
      .catch(() => true);
  // 滑到底后箭头会淡出，再点就会点到图片打开大图，所以每次点之前先确认没到底
  for (let i = 0; i < scene.preset && !(await atEnd()) && (await next.isVisible().catch(() => false)); i++) {
    await moveAndClick(page, next, { pauseBefore: 30 });
    await sleep(scene.preset >= 20 ? 260 : 450);
  }
  await sleep(1800);
}

async function recordScene(context, scene) {
  const page = await context.newPage();
  await page.addInitScript(OVERLAY_SCRIPT);
  await page.goto('https://x.com/compose/post');
  const dialog = page
    .locator('[role="dialog"][aria-modal="true"]')
    .filter({ has: page.locator('[data-x-slicer-entry="true"]') });
  await dialog.waitFor({ timeout: 30000 });
  await page.addStyleTag({ content: CLEAN_CSS });
  await page.evaluate(() => document.documentElement.classList.add('demo-clean'));
  await page.mouse.move(VIEWPORT.width * 0.62, VIEWPORT.height * 0.75);
  mousePos.set(page, [VIEWPORT.width * 0.62, VIEWPORT.height * 0.75]);
  await sleep(1500);

  const frameDir = path.join(OUT_DIR, 'frames', scene.name);
  fs.rmSync(frameDir, { recursive: true, force: true });
  const rec = createRecorder(page);
  await rec.start(frameDir);
  await sleep(500);

  // 1. 写文案
  await moveAndClick(page, dialog.locator('[data-testid="tweetTextarea_0"]'));
  await sleep(120);
  await page.keyboard.type(scene.text, { delay: 45 });
  await sleep(250);

  // 2. 点「切图」，计时开始
  await moveAndClick(page, dialog.locator('[data-x-slicer-entry="true"]'));
  await hud(page, 'start', Date.now());
  const modal = page.locator('.dialog[role="dialog"]').filter({ has: page.locator('#xslicer-file-input') });
  await modal.waitFor();
  await sleep(250);

  // 3. 选图（文件选择框由脚本代填）
  const chooserPromise = page.waitForEvent('filechooser');
  await moveAndClick(page, modal.locator('label[for="xslicer-file-input"]'));
  const chooser = await chooserPromise;
  await chooser.setFiles(scene.image);
  const submit = modal.locator('[data-action="submit"]');
  const submitReady = modal.locator('[data-action="submit"]:not([disabled])');
  await rec.waitFor(submitReady.waitFor({ timeout: 180000 }), '本地切图（8 张）');
  await sleep(700); // 看一眼默认 8 张预览

  // 4. 切到目标档位
  await moveAndClick(page, modal.locator(`[data-action="preset-count"][data-count="${scene.preset}"]`));
  await rec.waitFor(
    modal
      .locator('.slice-badge', { hasText: `1×${scene.preset}` })
      .waitFor({ timeout: 30000 })
      .then(() => submitReady.waitFor({ timeout: 180000 })),
    `重新切分（${scene.preset} 张）`
  );
  await sleep(scene.scrollPreview ? 300 : 900);
  if (scene.scrollPreview) {
    await scrollHorizontally(page, modal.locator('.preview-strip'), 30);
    await sleep(400);
  }

  // 5. 填入发帖框（真实 X 上成功后弹窗自动关闭，发帖框里显示「已就绪」）
  await moveAndClick(page, submit);
  const filledInModal = modal.locator('[data-action="submit"]', { hasText: '已填入' });
  await rec.waitFor(
    Promise.race([
      filledInModal.waitFor({ timeout: 180000 }),
      modal.waitFor({ state: 'detached', timeout: 180000 })
    ]),
    '填入发帖框'
  );
  if (await filledInModal.isVisible().catch(() => false)) {
    await sleep(300);
    await moveAndClick(page, modal.locator('[data-action="cancel"]'));
  }

  // 6. 等 X 把切片上传完（发帖按钮可点）
  const postBtn = dialog.locator('[data-testid="tweetButton"]');
  await rec.waitFor(
    page.waitForFunction(
      () => {
        const b = document.querySelector('[role="dialog"] [data-testid="tweetButton"]');
        return b && b.getAttribute('aria-disabled') !== 'true' && !b.disabled;
      },
      null,
      { timeout: 300000, polling: 200 }
    ),
    'X 上传切片'
  );
  await sleep(500);

  let postUrl = null;
  if (PUBLISH) {
    // 7. 发帖 → 点提示里的「查看」→ 在帖子里滑动轮播
    const postClickedAt = Date.now();
    await moveAndClick(page, postBtn);
    // 以发帖框真正关闭为准（发送中扩展会移除「切图」按钮，不能拿它判断）
    await rec.waitFor(
      page.waitForFunction(() => !document.querySelector('[role="dialog"] [data-testid="tweetTextarea_0"]'), null, {
        timeout: 300000,
        polling: 100
      }),
      '发帖'
    );
    await hud(page, 'stop', Date.now());
    const viewLink = page.locator('[data-testid="toast"] a[href*="/status/"]');
    const href = await viewLink
      .waitFor({ timeout: 8000 })
      .then(() => viewLink.getAttribute('href'))
      .catch(() => null);
    if (href) {
      postUrl = new URL(href, 'https://x.com').href;
      console.log(`  已发出：${postUrl}`);
      await sleep(250);
      await moveAndClick(page, viewLink);
    } else {
      // 没等到「查看」提示：去个人主页找刚发的这条
      // 只认发布时间晚于点击「发帖」的那条（同文案的旧帖不能算），找不到就刷新重试
      const profile = await page.locator('[data-testid="AppTabBar_Profile_Link"]').getAttribute('href');
      let href2 = null;
      for (let attempt = 0; attempt < 6 && !href2; attempt++) {
        await page.goto(new URL(profile, 'https://x.com').href);
        await page.locator('article[data-testid="tweet"]').first().waitFor({ timeout: 30000 });
        await sleep(1500);
        href2 = await page.evaluate(
          ({ text, since }) => {
            for (const a of document.querySelectorAll('article[data-testid="tweet"]')) {
              const time = a.querySelector('time');
              const link = time && time.closest('a[href*="/status/"]');
              if (link && a.innerText.includes(text) && Date.parse(time.getAttribute('datetime')) >= since - 5000) {
                return link.getAttribute('href');
              }
            }
            return null;
          },
          { text: scene.text, since: postClickedAt }
        );
      }
      if (!href2) throw new Error('发帖后在主页找不到新帖');
      postUrl = new URL(href2, 'https://x.com').href;
      console.log(`  已发出（从主页找到）：${postUrl}`);
      await page.goto(postUrl);
    }
    await page.waitForURL(/\/status\//);
    await showPost(page, rec, scene);
  } else {
    const b = await postBtn.boundingBox();
    await humanMove(page, b.x + b.width / 2, b.y + b.height / 2);
    await hud(page, 'stop', Date.now());
    await sleep(2000);
  }

  const result = await rec.stop();
  await page.close(); // 空跑时直接关页面：草稿不保存、不发布
  return { ...result, postUrl };
}

async function main() {
  if (!img5 || !img20) {
    console.error('用法：node scripts/demo/record.js <5张演示图> <20张演示图> [--publish]');
    process.exit(1);
  }
  for (const s of SCENES) if (!fs.existsSync(s.image)) throw new Error(`找不到图片：${s.image}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(PUBLISH ? '模式：真实发帖' : '模式：空跑（拦截发帖请求）');

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chromium',
    headless: process.env.HEADED !== '1',
    userAgent: CHROME_UA,
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      `--disable-extensions-except=${EXTENSION_DIR}`,
      `--load-extension=${EXTENSION_DIR}`,
      '--disable-blink-features=AutomationControlled'
    ]
  });
  if (!PUBLISH) {
    await context.route(/\/graphql\/[^/]+\/Create\w*Tweet/, (route) => route.abort());
  }

  const mp4s = [];
  const posted = [];
  try {
    for (const scene of SCENES.filter((s) => !ONLY || s.name === ONLY)) {
      console.log(`录制 ${scene.name} ...`);
      const result = await recordScene(context, scene);
      if (result.postUrl) posted.push(result.postUrl);
      fs.writeFileSync(path.join(OUT_DIR, `${scene.name}.frames.json`), JSON.stringify(result));
      const list = path.join(OUT_DIR, `${scene.name}.txt`);
      writeConcatList(result, list, 0.5);
      const mp4 = path.join(OUT_DIR, `${scene.name}.mp4`);
      ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-vf', `fps=${FPS},format=yuv420p`, '-c:v', 'libx264', '-crf', '18', '-movflags', '+faststart', mp4]);
      toGif(mp4, path.join(OUT_DIR, `${scene.name}.gif`));
      mp4s.push(mp4);
    }
  } finally {
    await context.close();
    if (posted.length) fs.appendFileSync(path.join(OUT_DIR, 'posted.txt'), posted.join('\n') + '\n');
  }

  const joinList = path.join(OUT_DIR, 'join.txt');
  const allMp4s = SCENES.map((s) => path.join(OUT_DIR, `${s.name}.mp4`)).filter((f) => fs.existsSync(f));
  fs.writeFileSync(joinList, allMp4s.map((f) => `file '${f}'`).join('\n'));
  const demo = path.join(OUT_DIR, 'demo.mp4');
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', joinList, '-c', 'copy', demo]);
  toGif(demo, path.join(OUT_DIR, 'demo.gif'));
  console.log(`完成：${OUT_DIR}`);
  if (posted.length) console.log(`已发出的帖子：\n${posted.join('\n')}`);
}

if (require.main === module) {
  main();
} else {
  module.exports = { SCENES, OVERLAY_SCRIPT, CLEAN_CSS, VIEWPORT, SCALE, FPS, CHROME_UA, EXTENSION_DIR, PROFILE_DIR, OUT_DIR, hud, createRecorder, writeConcatList, ffmpeg, toGif, showPost };
}
