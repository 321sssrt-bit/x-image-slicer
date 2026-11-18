'use strict';

// 把 Safari 里 x.com 的登录 cookie 导入演示浏览器 profile，并验证是否已登录。
// 需要运行它的终端/应用拥有「完全磁盘访问权限」。cookie 值只写入 profile，不打印。
// 用法：node scripts/demo/import-safari-cookies.js

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const SAFARI_COOKIES = path.join(
  os.homedir(),
  'Library/Containers/com.apple.Safari/Data/Library/Cookies/Cookies.binarycookies'
);
const EXTENSION_DIR = path.resolve(__dirname, '../../extension');
const PROFILE_DIR = process.env.X_SLICER_DEMO_PROFILE || path.join(os.homedir(), '.x-image-slicer-demo-profile');
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/159.0.0.0 Safari/537.36';
const MAC_EPOCH_OFFSET = 978307200; // 2001-01-01 相对 1970-01-01 的秒数

function readCString(buf, start) {
  const end = buf.indexOf(0, start);
  return buf.toString('utf8', start, end);
}

// Safari Cookies.binarycookies 格式解析
function parseBinaryCookies(buf) {
  if (buf.toString('ascii', 0, 4) !== 'cook') throw new Error('不是 binarycookies 文件');
  const pageCount = buf.readUInt32BE(4);
  const pageSizes = [];
  for (let i = 0; i < pageCount; i++) pageSizes.push(buf.readUInt32BE(8 + i * 4));

  const cookies = [];
  let pageStart = 8 + pageCount * 4;
  for (const size of pageSizes) {
    const page = buf.subarray(pageStart, pageStart + size);
    const count = page.readUInt32LE(4);
    for (let i = 0; i < count; i++) {
      const off = page.readUInt32LE(8 + i * 4);
      const c = page.subarray(off, off + page.readUInt32LE(off));
      const flags = c.readUInt32LE(8);
      cookies.push({
        domain: readCString(c, c.readUInt32LE(16)),
        name: readCString(c, c.readUInt32LE(20)),
        path: readCString(c, c.readUInt32LE(24)),
        value: readCString(c, c.readUInt32LE(28)),
        expires: Math.round(c.readDoubleLE(40) + MAC_EPOCH_OFFSET),
        secure: Boolean(flags & 1),
        httpOnly: Boolean(flags & 4)
      });
    }
    pageStart += size;
  }
  return cookies;
}

(async () => {
  const all = parseBinaryCookies(fs.readFileSync(SAFARI_COOKIES));
  const now = Date.now() / 1000;
  const xCookies = all
    .filter((c) => /(^|\.)x\.com$/.test(c.domain) && c.expires > now)
    .map((c) => ({ ...c, sameSite: 'Lax' }));

  const names = xCookies.map((c) => c.name);
  if (!names.includes('auth_token')) {
    console.log('Safari 里没有找到 x.com 的 auth_token，请先在 Safari 登录 X。');
    process.exit(1);
  }
  console.log(`找到 ${xCookies.length} 个 x.com cookie：${names.join(', ')}`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chromium', // headless shell 不支持扩展，且 cookie 存储与完整版不通用
    headless: true,
    userAgent: CHROME_UA, // 默认 UA 含 HeadlessChrome，会被 x.com 拦截
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      `--disable-extensions-except=${EXTENSION_DIR}`,
      `--load-extension=${EXTENSION_DIR}`,
      '--disable-blink-features=AutomationControlled'
    ]
  });
  await context.addCookies(xCookies);

  const page = await context.newPage();
  await page.goto('https://x.com/home');
  try {
    await page.waitForSelector('[data-testid="SideNav_AccountSwitcher_Button"]', { timeout: 30000 });
    console.log(`已登录，状态保存在 ${PROFILE_DIR}`);
  } catch {
    console.log(`导入了 cookie 但未检测到登录，当前页面：${page.url()}`);
    process.exitCode = 1;
  }
  await context.close();
})();
