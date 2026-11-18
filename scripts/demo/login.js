'use strict';

// 打开一个带扩展的独立浏览器窗口，让你手动登录 X。
// 登录状态保存在仓库外的 PROFILE_DIR，之后的录制脚本复用它。
// 用法：node scripts/demo/login.js

const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const EXTENSION_DIR = path.resolve(__dirname, '../../extension');
const PROFILE_DIR = process.env.X_SLICER_DEMO_PROFILE || path.join(os.homedir(), '.x-image-slicer-demo-profile');
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

(async () => {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: null,
    // X 会拒绝带自动化标记的浏览器登录
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      `--disable-extensions-except=${EXTENSION_DIR}`,
      `--load-extension=${EXTENSION_DIR}`,
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,900'
    ]
  });

  const page = context.pages()[0] || (await context.newPage());
  await page.goto('https://x.com/login');
  console.log(`请在弹出的浏览器窗口里登录 X（${LOGIN_TIMEOUT_MS / 60000} 分钟内）。`);

  try {
    await page.waitForSelector('[data-testid="SideNav_AccountSwitcher_Button"]', { timeout: LOGIN_TIMEOUT_MS });
    console.log(`登录成功，状态已保存到 ${PROFILE_DIR}`);
    await page.waitForTimeout(3000); // 让 cookie 落盘
  } catch {
    console.log('超时或窗口被关闭，未检测到登录。');
    process.exitCode = 1;
  }
  await context.close().catch(() => {});
})();
