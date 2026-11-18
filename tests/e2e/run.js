'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const {
  createPatternPng,
  createSemiTransparentPng,
  createSemiTransparentGammaPng,
  extractPngChunks,
  createSolidPng,
  createColorBandsPng,
  createMarginPosterPng,
  createSmoothLandscapeGradientPng,
  createCroppedCollisionThreeSlicePng,
  reassembleAndVerifyPngSlices,
  injectExifOrientation,
  createAnimatedGifBuffer,
  createStaticGifWithCommentBuffer,
  createSvgBuffer,
  createCorruptPngBuffer,
  createDeclaredHugePngBuffer,
  createZeroDimPngBuffer,
  createLongMetadataApngBuffer,
  createFastFineLineRgbPng,
  createFastTexturedRgbPng,
  createSemiTransparentNoisyPng,
  createOs2BmpBuffer,
  createRgbPngWithManyChunksBeforeTrns,
  parseLocalSamplePath
} = require('../helpers/test-images');

const ROOT_DIR = path.resolve(__dirname, '../..');
const EXTENSION_DIR = path.join(ROOT_DIR, 'extension');
const FIXTURE_HTML_PATH = path.join(ROOT_DIR, 'tests/fixtures/mock-x.html');
const FIXTURE_JS_PATH = path.join(ROOT_DIR, 'tests/fixtures/mock-x.js');

const TEST_URL = 'https://x.com/home';
const CROSS_ORIGIN_MOCK_URLS = new Set(
  Array.from({ length: 20 }, (_, idx) => `https://pbs.twimg.com/media/mock-slice-${idx}.png`)
);

function writeTempFile(tmpDir, name, buffer) {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

async function openMockXPage(context) {
  const page = await context.newPage();
  await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#inline-composer button[data-x-slicer-entry="true"]');
  return page;
}

async function createExtensionContext(userDataDir, isCrossOriginMockAllowed) {
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: process.env.X_SLICER_CHANNEL || 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${EXTENSION_DIR}`,
      `--load-extension=${EXTENSION_DIR}`,
      '--no-sandbox'
    ]
  });

  const fixtureHtml = fs.readFileSync(FIXTURE_HTML_PATH, 'utf8');
  const fixtureJs = fs.readFileSync(FIXTURE_JS_PATH, 'utf8');
  const crossOriginPng = createSolidPng(32, 64, [20, 120, 220, 255]);

  await context.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() === 'GET' && url === 'https://x.com/home') {
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixtureHtml });
      return;
    }
    if (req.method() === 'GET' && url === 'https://x.com/mock-x.js') {
      await route.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: fixtureJs });
      return;
    }
    if (req.method() === 'GET' && isCrossOriginMockAllowed() && CROSS_ORIGIN_MOCK_URLS.has(url)) {
      // Intentionally omit Access-Control-Allow-Origin so canvas readback is cross-origin tainted
      await route.fulfill({ status: 200, contentType: 'image/png', body: crossOriginPng });
      return;
    }
    await route.abort();
  });

  return context;
}

async function getModalLocators(page) {
  const host = page.locator('#x-slicer-modal-host');
  await host.waitFor({ state: 'attached' });
  return {
    host,
    dialog: host.locator('[role="dialog"]'),
    sourceBanner: host.locator('.source-banner'),
    fileInput: host.locator('#xslicer-file-input'),
    sliceCountInput: host.locator('#xslicer-slice-count'),
    decreaseBtn: host.locator('[data-action="decrease-count"]'),
    increaseBtn: host.locator('[data-action="increase-count"]'),
    presetBtns: host.locator('[data-action="preset-count"]'),
    presetBtn: (n) => host.locator(`[data-action="preset-count"][data-count="${n}"]`),
    sliceBadge: host.locator('.slice-badge'),
    splitModeBtn: (mode) => host.locator(`[data-action="split-mode"][data-split-mode="${mode}"]`),
    clearMergesBtn: host.getByRole('button', { name: '清除合并' }),
    status: host.locator('.status'),
    summary: host.locator('.summary'),
    cards: host.locator('.slice-card'),
    downloadRetainedBtn: host.locator('[data-action="download-retained-source"]'),
    submitBtn: host.locator('[data-action="submit"]'),
    cancelBtn: host.locator('[data-action="cancel"]'),
    closeBtn: host.locator('[data-action="close"]')
  };
}

async function waitForComposerFeedback(page, composerSelector, expectedTone, expectedSubstringOrRegex, timeout = 15000) {
  const regexSource = expectedSubstringOrRegex instanceof RegExp ? expectedSubstringOrRegex.source : null;
  const regexFlags = expectedSubstringOrRegex instanceof RegExp ? expectedSubstringOrRegex.flags : '';
  const substr = typeof expectedSubstringOrRegex === 'string' ? expectedSubstringOrRegex : null;

  await page.waitForFunction(
    ({ sel, tone, rxSource, rxFlags, sub }) => {
      if (document.querySelector('#x-slicer-modal-host')) return false;
      const host = document.querySelector(`${sel} [data-x-slicer-feedback="true"]`);
      const box = host?.shadowRoot?.querySelector('.feedback');
      if (!box) return false;
      if (tone && box.getAttribute('data-tone') !== tone) return false;
      const text = box.querySelector('.feedback-text')?.textContent || '';
      if (rxSource) {
        return new RegExp(rxSource, rxFlags).test(text);
      }
      if (sub) {
        return text.includes(sub);
      }
      return text.length > 0;
    },
    { sel: composerSelector, tone: expectedTone, rxSource: regexSource, rxFlags: regexFlags, sub: substr },
    { timeout }
  );

  return page.evaluate((sel) => {
    const host = document.querySelector(`${sel} [data-x-slicer-feedback="true"]`);
    const box = host?.shadowRoot?.querySelector('.feedback');
    return {
      hostCount: document.querySelectorAll(`${sel} [data-x-slicer-feedback="true"]`).length,
      tone: box?.getAttribute('data-tone') || null,
      role: box?.getAttribute('role') || null,
      ariaLive: box?.getAttribute('aria-live') || null,
      badge: box?.querySelector('.feedback-badge')?.textContent || '',
      text: box?.querySelector('.feedback-text')?.textContent || ''
    };
  }, composerSelector);
}

// Evaluates an expression inside the extension's content-script isolated world (test setup only).
async function evaluateInExtensionWorld(page, expression) {
  const client = await page.context().newCDPSession(page);
  try {
    const contexts = [];
    client.on('Runtime.executionContextCreated', ({ context }) => contexts.push(context));
    await client.send('Runtime.enable');
    const extensionContext = contexts.find(
      (c) => c.auxData?.type === 'isolated' && String(c.origin).startsWith('chrome-extension://')
    );
    assert.ok(extensionContext, 'Extension content-script isolated world not found');
    const { result, exceptionDetails } = await client.send('Runtime.evaluate', {
      expression,
      contextId: extensionContext.id,
      awaitPromise: true,
      returnByValue: true
    });
    assert.ok(!exceptionDetails, `Extension world evaluation failed: ${exceptionDetails?.text}`);
    return result.value;
  } finally {
    await client.detach();
  }
}

// Waits until the slicer preview shows exactly `count` slice cards from a finished generation
async function waitForSlicePreview(page, count, timeout = 30000) {
  await page.waitForFunction(
    (n) => {
      const sr = document.querySelector('#x-slicer-modal-host')?.shadowRoot;
      return (
        sr?.querySelectorAll('.slice-card').length === n &&
        sr.querySelector('.status')?.getAttribute('data-tone') === 'success'
      );
    },
    count,
    { timeout }
  );
}

async function readPreviewPngs(modal) {
  const all = await modal.cards.evaluateAll(async (cards) =>
    Promise.all(
      cards.map(async (c) => Array.from(new Uint8Array(await (await fetch(c.querySelector('img').src)).arrayBuffer())))
    )
  );
  return all.map((bytes) => Buffer.from(bytes));
}

async function auditPageStorage(page) {
  return page.evaluate(async () => {
    const dbs = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];
    return { localLen: localStorage.length, sessionLen: sessionStorage.length, dbCount: dbs.length };
  });
}

async function runTests() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'x-slicer-test-'));
  const userDataDir = path.join(tmpDir, 'profile');
  fs.mkdirSync(userDataDir, { recursive: true });

  const results = [];
  let allowCrossOriginMockUrls = false;
  const context = await createExtensionContext(userDataDir, () => allowCrossOriginMockUrls);

  const unexpectedRequests = [];
  const allRemoteRequests = [];
  context.on('request', (req) => {
    const url = req.url();
    const method = req.method();
    const isLocalScheme =
      url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('chrome-extension://');
    if (!isLocalScheme) {
      allRemoteRequests.push(`${method} ${url}`);
    }
    const isAllowedGet =
      method === 'GET' &&
      (url === 'https://x.com/home' ||
        url === 'https://x.com/mock-x.js' ||
        (allowCrossOriginMockUrls && CROSS_ORIGIN_MOCK_URLS.has(url)));
    if (!isAllowedGet && !isLocalScheme) {
      unexpectedRequests.push(`${method} ${url}`);
    }
  });

  const testFilter = process.env.XSLICER_TEST_FILTER || '';

  async function runCase(name, fn) {
    if (testFilter && !name.includes(testFilter)) {
      return;
    }
    const startedAt = Date.now();
    process.stdout.write(`Running: ${name} ... `);
    const page = await openMockXPage(context);
    try {
      await fn(page);
      results.push({ name, ok: true });
      console.log(`PASS (${Date.now() - startedAt} ms)`);
    } catch (err) {
      results.push({ name, ok: false, error: err });
      console.log(`FAIL (${Date.now() - startedAt} ms)`);
      console.error(err);
    } finally {
      await page.close();
    }
  }

  try {
    // 1. Default 8 slices, non-divisible width, pixel-exact reassembly & real blob preview + reply/quote exclusion
    await runCase('01_default_8_non_divisible_pixel_exact_and_real_preview', async (page) => {
      const { buffer, width, height, rgba } = createPatternPng(197, 80);
      const imgPath = writeTempFile(tmpDir, 'pattern-197x80.png', buffer);

      assert.equal(
        await page.locator('#reply-composer button[data-x-slicer-entry="true"]').count(),
        0,
        'Multilingual reply composer should not receive 切图 entry button'
      );
      assert.equal(
        await page.locator('#quote-composer button[data-x-slicer-entry="true"]').count(),
        0,
        'Quote post composer should not receive 切图 entry button'
      );

      // Verify entry button sits inside ScrollSnap-List and not after Post button
      const inToolbarList = await page.locator(
        '#inline-composer [data-testid="ScrollSnap-List"] button[data-x-slicer-entry="true"]'
      ).count();
      assert.equal(inToolbarList, 1);

      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      const modal = await getModalLocators(page);

      await assert.doesNotReject(() => modal.dialog.waitFor({ state: 'visible' }));
      const titleText = await modal.dialog.locator('.title').textContent();
      assert.match(titleText, /默认 8 张/);

      const preSelectReqCount = allRemoteRequests.length;
      await modal.fileInput.setInputFiles(imgPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      assert.equal(
        allRemoteRequests.length,
        preSelectReqCount,
        'Selecting and previewing an image locally must produce zero network requests'
      );

      assert.equal(await modal.cards.count(), 8);
      const summaryText = await modal.summary.textContent();
      assert.ok(summaryText.includes('197 × 80'), `Summary missing source size: ${summaryText}`);

      const previewInfo = await modal.cards.evaluateAll(async (cards) => {
        const out = [];
        for (const card of cards) {
          const img = card.querySelector('img');
          const frame = card.querySelector('.slice-frame');
          const rect = frame.getBoundingClientRect();
          const blobBuf = await (await fetch(img.src)).arrayBuffer();
          out.push({
            name: card.getAttribute('data-slice-name'),
            src: img.src,
            complete: img.complete,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            frameWidth: rect.width,
            frameHeight: rect.height,
            metaText: card.querySelector('.slice-meta').textContent,
            blobBytes: Array.from(new Uint8Array(blobBuf))
          });
        }
        return out;
      });

      for (let i = 0; i < 8; i++) {
        const p = previewInfo[i];
        assert.equal(p.name, `slice-0${i + 1}.png`);
        assert.ok(p.src.startsWith('blob:https://x.com/'), `Preview src should be local blob URL, got ${p.src}`);
        assert.ok(p.complete && p.naturalWidth > 0 && p.naturalHeight === 80);
        const naturalRatio = p.naturalWidth / p.naturalHeight;
        const frameRatio = p.frameWidth / p.frameHeight;
        assert.ok(
          Math.abs(naturalRatio - frameRatio) < 0.08,
          `Preview frame ratio ${frameRatio.toFixed(3)} stretched from natural ${naturalRatio.toFixed(3)}`
        );
        assert.ok(p.metaText.includes(`${p.naturalWidth}×80`), `Missing slice size in meta: ${p.metaText}`);
      }

      // Click submit -> auto-closes modal & shows result on #inline-composer + restores focus
      await modal.submitBtn.click();
      const fb01 = await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布/);
      assert.equal(fb01.role, 'status');
      assert.equal(
        await page.evaluate(
          () => document.activeElement === document.querySelector('#inline-composer button[data-x-slicer-entry="true"]')
        ),
        true,
        'Auto-close after completion must restore keyboard focus to launcher button on original composer'
      );

      const mockState = await page.evaluate(() => window.__mockX.getState());
      assert.equal(mockState.publishClicks.length, 0, 'Must never click publish button');
      assert.equal(mockState.submissions.length, 1);
      assert.equal(mockState.submissions[0].composerId, 'inline');
      assert.equal(mockState.submissions[0].count, 8);

      // Verify preview blob bytes are byte-for-byte identical to submitted Files
      for (let i = 0; i < 8; i++) {
        const submittedFile = mockState.submissions[0].files[i];
        assert.deepEqual(
          previewInfo[i].blobBytes,
          submittedFile.bytes,
          `Preview blob bytes must match submitted file ${submittedFile.name}`
        );
        const expectedSizeLabel =
          submittedFile.size < 1024 ? `${submittedFile.size} B` : `${(submittedFile.size / 1024).toFixed(1)} KB`;
        assert.ok(previewInfo[i].metaText.includes(expectedSizeLabel));
      }

      const sliceBuffers = mockState.submissions[0].files.map((f) => Buffer.from(f.bytes));
      const reassembled = reassembleAndVerifyPngSlices(sliceBuffers, rgba, width, height);
      assert.equal(reassembled.totalWidth, 197);
      assert.equal(reassembled.height, 80);
    });

    // 2. Semi-transparent RGBA pixel-exact preservation (with and without gAMA) + EXIF Orientation 6
    await runCase('02_semitransparent_pixel_exact_and_exif_orientation_6', async (page) => {
      // 2a. Semi-transparent PNG including [100, 50, 200, 1]
      const semi = createSemiTransparentPng(43, 12);
      const semiPath = writeTempFile(tmpDir, 'semi-43x12.png', semi.buffer);

      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      let modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(semiPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.submitBtn.click();

      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布/);

      const semiState = await page.evaluate(() => window.__mockX.getState());
      const semiSlices = semiState.submissions[0].files.map((f) => Buffer.from(f.bytes));
      reassembleAndVerifyPngSlices(semiSlices, semi.rgba, semi.width, semi.height);

      // 2b. Semi-transparent PNG with gAMA chunk (must preserve gAMA & exact RGBA without distortion)
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
      });
      const semiGamma = createSemiTransparentGammaPng(43, 12);
      const semiGammaPath = writeTempFile(tmpDir, 'semi-gamma-43x12.png', semiGamma.buffer);

      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(semiGammaPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.submitBtn.click();

      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布/);

      const semiGammaState = await page.evaluate(() => window.__mockX.getState());
      const semiGammaSlices = semiGammaState.submissions[1].files.map((f) => Buffer.from(f.bytes));
      reassembleAndVerifyPngSlices(semiGammaSlices, semiGamma.rgba, semiGamma.width, semiGamma.height);

      for (let i = 0; i < semiGammaSlices.length; i++) {
        const chunks = extractPngChunks(semiGammaSlices[i]);
        for (const [chunkType, expectedPayload] of Object.entries(semiGamma.expectedChunks)) {
          const found = chunks.find((c) => c.type === chunkType);
          assert.ok(found, `Slice ${i + 1} missing expected PNG color chunk ${chunkType}`);
          assert.deepEqual(
            found.data,
            expectedPayload,
            `Slice ${i + 1} PNG chunk ${chunkType} payload mismatch`
          );
        }
      }

      // 2c. EXIF Orientation 6
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
      });
      const dataUrl = await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 160;
        c.height = 80;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ff3300';
        ctx.fillRect(0, 0, 80, 80);
        ctx.fillStyle = '#0066ff';
        ctx.fillRect(80, 0, 80, 80);
        return c.toDataURL('image/jpeg', 0.92);
      });
      const rawJpeg = Buffer.from(dataUrl.split(',')[1], 'base64');
      const exifJpeg = injectExifOrientation(rawJpeg, 6);
      const exifPath = writeTempFile(tmpDir, 'exif6.jpg', exifJpeg);

      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(exifPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });

      const summaryText = await modal.summary.textContent();
      assert.ok(summaryText.includes('80 × 160'), `Expected rotated display dimensions 80 × 160, got: ${summaryText}`);

      const sliceInfo = await modal.cards.evaluateAll((cards) =>
        cards.map((c) => {
          const img = c.querySelector('img');
          const cv = document.createElement('canvas');
          cv.width = img.naturalWidth;
          cv.height = img.naturalHeight;
          const ctx = cv.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const top = Array.from(ctx.getImageData(Math.floor(cv.width / 2), 10, 1, 1).data);
          const bottom = Array.from(ctx.getImageData(Math.floor(cv.width / 2), cv.height - 10, 1, 1).data);
          return { w: img.naturalWidth, h: img.naturalHeight, top, bottom };
        })
      );
      for (const s of sliceInfo) {
        assert.equal(s.w, 10);
        assert.equal(s.h, 160);
        assert.ok(s.top[0] > 180 && s.top[2] < 80, `Expected red top after EXIF 6 rotation, got ${s.top}`);
        assert.ok(s.bottom[2] > 180 && s.bottom[0] < 80, `Expected blue bottom after EXIF 6 rotation, got ${s.bottom}`);
      }
    });

    // 3. Invalid inputs, long-metadata APNG, static GIF with 300KB comment pass, 0-dim header, exact 4096 pass vs 4097 fail, 4.5MB fail, empty cancel, re-selection
    await runCase('03_invalid_apng_static_gif_zerodim_budget_exact_boundaries_and_reselect', async (page) => {
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      const modal = await getModalLocators(page);

      const cases = [
        { file: writeTempFile(tmpDir, 'anim.gif', createAnimatedGifBuffer()), expectMsg: /动态 GIF|GIF 动画/ },
        { file: writeTempFile(tmpDir, 'long-apng.png', createLongMetadataApngBuffer(320 * 1024)), expectMsg: /APNG|动态/ },
        { file: writeTempFile(tmpDir, 'fake.png', createSvgBuffer()), expectMsg: /SVG/ },
        { file: writeTempFile(tmpDir, 'corrupt.png', createCorruptPngBuffer()), expectMsg: /损坏|无法解码/ },
        { file: writeTempFile(tmpDir, 'zerodim.png', createZeroDimPngBuffer()), expectMsg: /尺寸无效/ },
        { file: writeTempFile(tmpDir, 'huge.png', createDeclaredHugePngBuffer(25000, 20001)), expectMsg: /500,000,000/ },
        { file: writeTempFile(tmpDir, 'huge-w.png', createDeclaredHugePngBuffer(25001, 20000)), expectMsg: /500,000,000/ },
        { file: writeTempFile(tmpDir, 'thin.png', createSolidPng(7, 50)), expectMsg: /小于 8 像素/ }
      ];

      for (const tc of cases) {
        await modal.fileInput.setInputFiles(tc.file);
        await page.waitForFunction(() => {
          const st = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status');
          return st?.getAttribute('data-tone') === 'error';
        });
        const statusText = await modal.status.textContent();
        assert.match(statusText, tc.expectMsg, `Unexpected error text for ${tc.file}: ${statusText}`);
        assert.equal(await modal.submitBtn.isDisabled(), true);
      }

      // Static 1-frame GIF with 300KB comment extension MUST pass and slice into 8 images!
      const staticGifPath = writeTempFile(
        tmpDir,
        'static-comment.gif',
        createStaticGifWithCommentBuffer(300 * 1024)
      );
      await modal.fileInput.setInputFiles(staticGifPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      assert.equal(await modal.submitBtn.isDisabled(), false);

      // Empty cancel selection -> must clear preview, disable submit, and reset neutral status
      await modal.fileInput.setInputFiles([]);
      await page.waitForFunction(() => {
        const st = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status');
        return st?.getAttribute('data-tone') === 'neutral';
      });
      assert.equal(await modal.cards.count(), 0);
      assert.equal(await modal.submitBtn.isDisabled(), true);

      // Exact 4096 height boundary MUST pass
      const exact4096Path = writeTempFile(tmpDir, 'exact-4096.png', createSolidPng(64, 4096));
      await modal.fileInput.setInputFiles(exact4096Path);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      assert.equal(await modal.submitBtn.isDisabled(), false);

      // Re-select a different valid image -> must replace preview and submit ONLY latest image
      const latestPattern = createPatternPng(160, 80);
      const latestPath = writeTempFile(tmpDir, 'latest-160x80.png', latestPattern.buffer);
      await modal.fileInput.setInputFiles(latestPath);
      await page.waitForFunction(() => {
        const sum = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.summary');
        return sum && sum.textContent.includes('160 × 80');
      });

      await modal.submitBtn.click();
      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布/);

      const state = await page.evaluate(() => window.__mockX.getState());
      const sliceBufs = state.submissions[0].files.map((f) => Buffer.from(f.bytes));
      reassembleAndVerifyPngSlices(sliceBufs, latestPattern.rgba, 160, 80);
    });

    // 4. Keyboard Space/Enter launch, forward Tab & reverse Shift+Tab wrap, boundary stepper focus retention, Escape focus restoration, and upload trapping
    await runCase('04_keyboard_tab_trap_escape_isolation_and_focus_restoration', async (page) => {
      const entryBtn = page.locator('#inline-composer button[data-x-slicer-entry="true"]');
      // Launch via Space key and immediately test Shift+Tab / Tab wrapping inside Shadow DOM
      await entryBtn.focus();
      await page.keyboard.press('Space');
      let modal = await getModalLocators(page);

      // Move focus to first focusable (closeBtn) and verify Shift+Tab wraps to last enabled focusable (cancelBtn)
      await modal.closeBtn.focus();
      await page.keyboard.press('Shift+Tab');
      const wrappedToLast = await page.evaluate(() => {
        const sr = document.querySelector('#x-slicer-modal-host')?.shadowRoot;
        return sr?.activeElement?.getAttribute('data-action');
      });
      assert.equal(wrappedToLast, 'cancel', 'Shift+Tab from first element must wrap to last element (cancelBtn)');

      // Forward Tab from last enabled focusable (cancelBtn) must wrap to first element (closeBtn)
      await page.keyboard.press('Tab');
      const wrappedToFirst = await page.evaluate(() => {
        const sr = document.querySelector('#x-slicer-modal-host')?.shadowRoot;
        return sr?.activeElement?.getAttribute('data-action');
      });
      assert.equal(wrappedToFirst, 'close', 'Tab from last element must wrap to first element (closeBtn)');

      // Stepper buttons hitting min (2) / max (20) via keyboard MUST keep focus inside Shadow DOM (never drop to document.body)
      await modal.sliceCountInput.fill('3');
      await modal.decreaseBtn.focus();
      await page.keyboard.press('Enter');
      const atMinFocus = await page.evaluate(() => {
        const sr = document.querySelector('#x-slicer-modal-host')?.shadowRoot;
        return {
          docActiveIsBody: document.activeElement === document.body,
          shadowActiveId: sr?.activeElement?.id || null,
          countVal: sr?.querySelector('#xslicer-slice-count')?.value,
          decDisabled: sr?.querySelector('[data-action="decrease-count"]')?.disabled
        };
      });
      assert.equal(atMinFocus.countVal, '2');
      assert.equal(atMinFocus.decDisabled, true);
      assert.ok(atMinFocus.shadowActiveId, 'Focus must stay inside Shadow DOM when decreaseBtn hits min boundary');

      await modal.sliceCountInput.fill('19');
      await modal.increaseBtn.focus();
      await page.keyboard.press('Space');
      const atMaxFocus = await page.evaluate(() => {
        const sr = document.querySelector('#x-slicer-modal-host')?.shadowRoot;
        return {
          shadowActiveId: sr?.activeElement?.id || null,
          countVal: sr?.querySelector('#xslicer-slice-count')?.value,
          incDisabled: sr?.querySelector('[data-action="increase-count"]')?.disabled
        };
      });
      assert.equal(atMaxFocus.countVal, '20');
      assert.equal(atMaxFocus.incDisabled, true);
      assert.ok(atMaxFocus.shadowActiveId, 'Focus must stay inside Shadow DOM when increaseBtn hits max boundary');

      // Reset to 8, close via Escape, and verify Enter launch + Escape focus restoration
      await modal.sliceCountInput.fill('8');
      await page.keyboard.press('Escape');
      await modal.host.waitFor({ state: 'detached' });

      await entryBtn.focus();
      await page.keyboard.press('Enter');
      modal = await getModalLocators(page);

      const validPath = writeTempFile(tmpDir, 'cancel-check.png', createPatternPng(160, 80).buffer);
      await modal.fileInput.setInputFiles(validPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });

      // With submitBtn now enabled, verify forward Tab from submitBtn wraps to closeBtn and Shift+Tab wraps back to submitBtn
      await modal.submitBtn.focus();
      await page.keyboard.press('Tab');
      assert.equal(
        await page.evaluate(() => document.querySelector('#x-slicer-modal-host')?.shadowRoot?.activeElement?.getAttribute('data-action')),
        'close'
      );
      await page.keyboard.press('Shift+Tab');
      assert.equal(
        await page.evaluate(() => document.querySelector('#x-slicer-modal-host')?.shadowRoot?.activeElement?.getAttribute('data-action')),
        'submit'
      );

      // Press Escape to cancel -> must NOT propagate to document listener, and focus returns to entry button
      await page.keyboard.press('Escape');
      await modal.host.waitFor({ state: 'detached' });

      const afterCancel = await page.evaluate(() => ({
        focusedIsEntry:
          document.activeElement === document.querySelector('#inline-composer button[data-x-slicer-entry="true"]'),
        pageEscapes: window.__mockX.getState().pageEscapeEvents
      }));
      assert.equal(afterCancel.focusedIsEntry, true, 'Focus should return to launcher button on close');
      assert.equal(afterCancel.pageEscapes, 0, 'Escape must not leak to underlying page');

      // Re-open and test Tab & Escape DURING active upload
      await page.evaluate(() =>
        window.__mockX.setUploadMode('async', { asyncStepMs: 80, asyncCompleteMs: 500 })
      );
      await entryBtn.click();
      const modal2 = await getModalLocators(page);
      await modal2.fileInput.setInputFiles(validPath);
      await modal2.cards.nth(7).waitFor({ state: 'visible' });
      await modal2.submitBtn.click();

      await page.waitForTimeout(180);
      await page.keyboard.press('Tab');
      await page.keyboard.press('Escape');

      const midUploadFocus = await page.evaluate(() => {
        const host = document.querySelector('#x-slicer-modal-host');
        return {
          hasShadowFocus: Boolean(host?.shadowRoot?.activeElement),
          pageEscapes: window.__mockX.getState().pageEscapeEvents,
          modalStillOpen: Boolean(host)
        };
      });
      assert.equal(midUploadFocus.hasShadowFocus, true, 'Focus must remain inside modal during upload Tab');
      assert.equal(midUploadFocus.pageEscapes, 0, 'Escape during upload must not propagate to page');
      assert.equal(midUploadFocus.modalStillOpen, true, 'Escape during upload must not close modal');

      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布/);
      assert.equal(
        await page.evaluate(
          () => document.activeElement === document.querySelector('#inline-composer button[data-x-slicer-entry="true"]')
        ),
        true,
        'Focus should return to launcher button after async upload auto-close'
      );
    });

    // 5. Multi-composer target isolation & individual sub-node replacement (textbox / fileInput / tweetButton / root)
    await runCase('05_multi_composer_isolation_and_target_node_replacement', async (page) => {
      await page.evaluate(() => window.__mockX.showModalComposer());
      await page.waitForSelector('#modal-composer button[data-x-slicer-entry="true"]');

      const validPath = writeTempFile(tmpDir, 'modal-target.png', createPatternPng(160, 80).buffer);

      // 5a. Launch from #modal-composer and complete normally -> auto-closes & feedback appears ONLY on #modal-composer
      await page.locator('#modal-composer button[data-x-slicer-entry="true"]').click();
      let modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(validPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.submitBtn.click();

      await waitForComposerFeedback(page, '#modal-composer', 'success', /已填入 8 张切片，等待发布/);

      const mockState = await page.evaluate(() => window.__mockX.getState());
      assert.equal(mockState.submissions.length, 1);
      assert.equal(mockState.submissions[0].composerId, 'modal');
      assert.equal(await page.locator('#inline-composer [data-testid="attachmentItem"]').count(), 0);
      assert.equal(await page.locator('#inline-composer [data-x-slicer-feedback="true"]').count(), 0);
      assert.equal(
        await page.evaluate(
          () => document.activeElement === document.querySelector('#modal-composer button[data-x-slicer-entry="true"]')
        ),
        true
      );

      // 5b. Replace textbox inside intact #modal-composer BEFORE submit -> preview guard must lock it!
      await page.evaluate(() => {
        document.querySelector('#modal-composer [data-testid="attachments"]').innerHTML = '';
      });
      await page.locator('#modal-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(validPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await page.evaluate(() => window.__mockX.replaceTextbox('modal'));
      await page.waitForFunction(() => {
        const st = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status');
        return st?.getAttribute('data-tone') === 'error';
      });
      assert.equal(await modal.submitBtn.isDisabled(), true);
      assert.match(await modal.status.textContent(), /结构变化|无法唯一识别|停止/);
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // 5c. Replace fileInput BEFORE submit -> preview guard must lock it!
      await page.locator('#modal-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(validPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await page.evaluate(() => window.__mockX.replaceFileInput('modal'));
      await page.waitForFunction(() => {
        const st = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status');
        return st?.getAttribute('data-tone') === 'error';
      });
      assert.equal(await modal.submitBtn.isDisabled(), true);
      assert.match(await modal.status.textContent(), /结构变化|无法唯一识别|停止/);
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // 5d. Replace tweetButton BEFORE submit -> preview guard must lock it!
      await page.locator('#modal-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(validPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await page.evaluate(() => window.__mockX.replaceTweetButton('modal'));
      await page.waitForFunction(() => {
        const st = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status');
        return st?.getAttribute('data-tone') === 'error';
      });
      assert.equal(await modal.submitBtn.isDisabled(), true);
      assert.match(await modal.status.textContent(), /结构变化|无法唯一识别|停止/);
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // 5e. Remove root DURING async upload -> must stop immediately & never touch #inline-composer
      await page.evaluate(() => window.__mockX.setUploadMode('async', { asyncStepMs: 120, asyncCompleteMs: 500 }));
      await page.locator('#modal-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(validPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.submitBtn.click();
      await page.waitForTimeout(200);
      await page.evaluate(() => window.__mockX.removeComposer('modal'));

      await page.waitForFunction(() => {
        const st = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status');
        return st?.getAttribute('data-tone') === 'error';
      });
      assert.match(await modal.status.textContent(), /已关闭|已失效|停止/);
      assert.equal(await page.locator('#inline-composer [data-testid="attachmentItem"]').count(), 0);

      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // Deterministic await verifyAttachmentOrder() gate on extension isolated world via CDP
      const cdp = await page.context().newCDPSession(page);
      const isolatedContextIds = new Set();
      cdp.on('Runtime.executionContextCreated', (evt) => {
        if (evt.context?.id && evt.context.auxData && evt.context.auxData.isDefault === false) {
          isolatedContextIds.add(evt.context.id);
        }
      });
      await cdp.send('Runtime.enable');
      assert.ok(isolatedContextIds.size > 0, 'Expected extension isolated execution context');

      async function evalInIsolated(expression) {
        for (const contextId of isolatedContextIds) {
          await cdp.send('Runtime.evaluate', { contextId, expression });
        }
      }

      const wideBandsPath = writeTempFile(tmpDir, 'wide-bands-800x80.png', createColorBandsPng(100, 80, 8, 255));

      // 5f0. Positive control for real-x-square-thumbs with CDP gate: auto-closes WITHOUT waiting for order check, then updates to success on release!
      await page.evaluate(() => {
        window.__mockX.setUploadMode('real-x-square-thumbs');
        delete document.documentElement.dataset.xslicerBitmapAwait;
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(wideBandsPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });

      await evalInIsolated(`(() => {
        if (!globalThis.__origCreateImageBitmap) {
          globalThis.__origCreateImageBitmap = globalThis.createImageBitmap.bind(globalThis);
        }
        let release;
        const gate = new Promise((r) => { release = r; });
        globalThis.__releaseBitmapGate = () => {
          release();
          globalThis.createImageBitmap = globalThis.__origCreateImageBitmap;
        };
        globalThis.createImageBitmap = (...args) => {
          document.documentElement.dataset.xslicerBitmapAwait = '1';
          return gate.then(() => globalThis.__origCreateImageBitmap(...args));
        };
      })()`);

      await modal.submitBtn.click();
      await page.waitForFunction(() => document.documentElement.dataset.xslicerBitmapAwait === '1');
      // Even while verifyAttachmentOrder is suspended on the gate, modal MUST already have auto-closed & composer shows unconfirmed state!
      const fbPending5f0 = await waitForComposerFeedback(page, '#inline-composer', 'warning', /上传完成，共 8 张，请检查顺序后再发布/);
      assert.equal(fbPending5f0.role, 'status');
      await evalInIsolated('globalThis.__releaseBitmapGate && globalThis.__releaseBitmapGate()');

      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布/);

      // 5f. Mutate attachment src DURING await verifyAttachmentOrder() -> unchangedSlots must block stale ok:true & update feedback post-close
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.setUploadMode('real-x-square-thumbs');
        delete document.documentElement.dataset.xslicerBitmapAwait;
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(wideBandsPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });

      await evalInIsolated(`(() => {
        let release;
        const gate = new Promise((r) => { release = r; });
        globalThis.__releaseBitmapGate = () => {
          release();
          globalThis.createImageBitmap = globalThis.__origCreateImageBitmap;
        };
        globalThis.createImageBitmap = (...args) => {
          document.documentElement.dataset.xslicerBitmapAwait = '1';
          return gate.then(() => globalThis.__origCreateImageBitmap(...args));
        };
      })()`);

      await modal.submitBtn.click();
      await page.waitForFunction(() => document.documentElement.dataset.xslicerBitmapAwait === '1');
      await page.evaluate(() => window.__mockX.mutateLastAttachmentSrc('inline'));
      await evalInIsolated('globalThis.__releaseBitmapGate && globalThis.__releaseBitmapGate()');

      const fb5f = await waitForComposerFeedback(page, '#inline-composer', 'error', /差异过大|无法确认内容匹配/);
      assert.ok(!fb5f.text.includes('上传失败'), `Completed upload content/order issue must not say 上传失败: ${fb5f.text}`);

      // 5g. Remove target composer DURING await verifyAttachmentOrder() -> must clean up feedback and never transfer to another composer!
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        delete document.documentElement.dataset.xslicerBitmapAwait;
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(wideBandsPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });

      await evalInIsolated(`(() => {
        let release;
        const gate = new Promise((r) => { release = r; });
        globalThis.__releaseBitmapGate = () => {
          release();
          globalThis.createImageBitmap = globalThis.__origCreateImageBitmap;
        };
        globalThis.createImageBitmap = (...args) => {
          document.documentElement.dataset.xslicerBitmapAwait = '1';
          return gate.then(() => globalThis.__origCreateImageBitmap(...args));
        };
      })()`);

      await modal.submitBtn.click();
      await page.waitForFunction(() => document.documentElement.dataset.xslicerBitmapAwait === '1');
      await page.evaluate(() => window.__mockX.removeComposer('inline'));
      await evalInIsolated('globalThis.__releaseBitmapGate && globalThis.__releaseBitmapGate()');

      await page.waitForTimeout(200);
      assert.equal(await page.locator('[data-x-slicer-feedback="true"]').count(), 0, 'Target removal must never transfer feedback to another composer');
      await cdp.detach();
    });

    // 6. Existing draft preservation (Ticket 03) + media/GIF/video/poll conflict blocking (at open and before submit)
    await runCase('06_existing_draft_preservation_and_conflict_blocking', async (page) => {
      // Blank composer WITH toolbar createPoll button must NOT be blocked!
      assert.equal(
        await page.locator('#inline-composer [data-testid="toolBar"] [data-testid="createPoll"]').count(),
        1
      );

      const validPath = writeTempFile(tmpDir, 'draft-preserve.png', createPatternPng(160, 80).buffer);
      const richText = '保留我的草稿文案 🎉\n第二行测试 #切图测试 @xuser';

      await page.evaluate((t) => window.__mockX.setComposerText('inline', t), richText);
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      let modal = await getModalLocators(page);
      assert.equal(await modal.fileInput.isDisabled(), false, 'Existing text must NOT block slicer in Ticket 03');
      await modal.fileInput.setInputFiles(validPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.submitBtn.click();

      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布（已保留原有文案）/);
      assert.equal(
        await page.locator('#inline-composer [data-testid="tweetTextarea_0"]').textContent(),
        richText,
        'Existing multi-line/emoji/hashtag/mention text must be preserved verbatim without feedback entering textbox'
      );
      assert.equal(await page.locator('#inline-composer [data-testid="attachmentItem"]').count(), 8);

      // Existing image attachment MUST still be blocked without modifying attachments or text
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.addExistingAttachment('inline');
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      assert.equal(await modal.status.getAttribute('data-tone'), 'error');
      assert.match(await modal.status.textContent(), /已有媒体附件/);
      assert.equal(await page.locator('#inline-composer [data-testid="attachmentItem"]').count(), 1);
      assert.equal(
        await page.locator('#inline-composer [data-testid="tweetTextarea_0"]').textContent(),
        richText
      );
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // Existing GIF MUST be blocked
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.addExistingGif('inline');
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      assert.equal(await modal.status.getAttribute('data-tone'), 'error');
      assert.match(await modal.status.textContent(), /已有媒体附件/);
      assert.equal(await page.locator('#inline-composer [data-testid="gifPreview"]').count(), 1);
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // Existing Video MUST be blocked
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.addExistingVideo('inline');
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      assert.equal(await modal.status.getAttribute('data-tone'), 'error');
      assert.match(await modal.status.textContent(), /已有媒体附件/);
      assert.equal(await page.locator('#inline-composer video').count(), 1);
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // Existing Poll MUST be blocked
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.addPoll('inline');
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      assert.equal(await modal.status.getAttribute('data-tone'), 'error');
      assert.match(await modal.status.textContent(), /投票/);
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // Adding media OR poll DURING preview (before submit) MUST block submission and keep existing conflict intact
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="pollOptions"]')?.remove();
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(validPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });

      await page.evaluate(() => window.__mockX.addExistingAttachment('inline'));
      await modal.submitBtn.click();
      assert.equal(await modal.status.getAttribute('data-tone'), 'error');
      assert.match(await modal.status.textContent(), /已有媒体附件/);
      assert.equal(await page.locator('#inline-composer [data-testid="attachmentItem"]').count(), 1);
      assert.equal((await page.evaluate(() => window.__mockX.getState())).submissions.length, 1);

      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.addPoll('inline');
      });
      await modal.submitBtn.click();
      assert.equal(await modal.status.getAttribute('data-tone'), 'error');
      assert.match(await modal.status.textContent(), /投票/);
      assert.equal((await page.evaluate(() => window.__mockX.getState())).submissions.length, 1);
      assert.equal((await page.evaluate(() => window.__mockX.getState())).publishClicks.length, 0);
    });

    // 7. Real-X role="group" carousel, role="status" spinner, sibling progressbar, aria-disabled tweetButton, >4.5s staggered upload & dup guard
    await runCase('07_real_x_carousel_status_spinner_sibling_bar_staggered_and_dup_guard', async (page) => {
      const validPath = writeTempFile(tmpDir, 'async-8.png', createPatternPng(160, 80).buffer);

      // 7a. Real X role="group" carousel (no attachmentItem, immediate blobs while tweetButton aria-disabled)
      await page.evaluate(() => window.__mockX.setUploadMode('real-x-carousel'));
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      let modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(validPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.submitBtn.click();
      assert.equal(await modal.submitBtn.isDisabled(), true);
      await modal.submitBtn.click({ force: true });

      // At 200ms, 8 blob imgs are already rendered, but tweetButton is aria-disabled -> must NOT report complete!
      await page.waitForTimeout(200);
      assert.equal(await modal.status.getAttribute('data-tone'), 'busy');

      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布/);
      assert.equal((await page.evaluate(() => window.__mockX.getState())).submissions.length, 1);

      // 7b. [role="status"] without data-upload-status -> must NOT report ready early
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.setUploadMode('status-spinner-only');
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(validPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.submitBtn.click();

      await page.waitForTimeout(300);
      assert.equal(await modal.status.getAttribute('data-tone'), 'busy');

      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布/);

      // 7c. Sibling [role="progressbar"] outside attachments container -> must NOT report ready even past fullSettleMs until removed!
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.setUploadMode('sibling-progressbar');
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(validPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.submitBtn.click();

      await page.waitForTimeout(700);
      assert.equal(
        await modal.status.getAttribute('data-tone'),
        'busy',
        'Sibling progressbar outside attachments must block completion past 350ms settle window'
      );

      await page.evaluate(() => window.__mockX.clearSiblingProgressbar('inline'));
      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布/);

      // 7d. Staggered partial upload with aria-disabled="true" past 4.5s (5.2s) -> must NOT fail partialSettleMs!
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.setUploadMode('staggered-with-disabled-button');
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(validPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.submitBtn.click();

      await page.waitForTimeout(4700);
      assert.equal(
        await modal.status.getAttribute('data-tone'),
        'busy',
        '4/8 ready with disabled postBtn must stay busy past 4.5s'
      );

      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布/);

      // 7e. Slow staggered upload (1600ms step, 10ms per-item): must NOT fail prematurely at 1.2s!
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.setUploadMode('async', { asyncStepMs: 1600, asyncCompleteMs: 10 });
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(validPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.submitBtn.click();

      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布/, 20000);
      assert.equal((await page.evaluate(() => window.__mockX.getState())).publishClicks.length, 0);
    });

    // 8. Truncation (4/8), partial error, extra unknown item/mediaPreview, global toast rejection, wrong channel, scramble, cross-origin & solid unconfirmed
    await runCase('08_truncation_errors_extra_toast_channel_scramble_and_unconfirmed', async (page) => {
      const validPath = writeTempFile(tmpDir, 'failure-modes.png', createPatternPng(160, 80).buffer);

      // 8a. Truncate to 4
      await page.evaluate(() => window.__mockX.setUploadMode('truncate-4'));
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      let modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(validPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.submitBtn.click();

      await page.waitForFunction(
        () => document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status')?.getAttribute('data-tone') === 'error',
        null,
        { timeout: 10000 }
      );
      assert.match(await modal.status.textContent(), /4 \/ 8/);
      assert.equal(await page.locator('#inline-composer [data-testid="attachmentItem"]').count(), 4);
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // 8b. Partial error (5 ready, 3 error) -> must fail cleanly without deleting/retrying
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.setUploadMode('partial-error');
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(validPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.submitBtn.click();

      await page.waitForFunction(
        () => document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status')?.getAttribute('data-tone') === 'error',
        null,
        { timeout: 10000 }
      );
      assert.match(await modal.status.textContent(), /上传错误.*5 \/ 8/);
      assert.equal(await page.locator('#inline-composer [data-testid="attachmentItem"]').count(), 8);
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // 8c. Extra unknown slots (attachmentItem+processing, attachmentItem+mediaPreview, carousel+imageless mediaPreview, nested role=group+imageless mediaPreview)
      const colorBandsPath8c = writeTempFile(
        tmpDir,
        'color-bands-8c.png',
        createColorBandsPng(100, 80, 8, 255)
      );
      for (const extraMode of [
        'extra-unknown-item',
        'extra-unknown-media-preview',
        'extra-imageless-media-preview',
        'nested-group-imageless-preview'
      ]) {
        await page.evaluate((mode) => {
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          window.__mockX.setUploadMode(mode);
        }, extraMode);
        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(
          extraMode === 'nested-group-imageless-preview' ? colorBandsPath8c : validPath
        );
        await modal.cards.nth(7).waitFor({ state: 'visible' });
        await modal.submitBtn.click();

        await page.waitForFunction(
          () => document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status')?.getAttribute('data-tone') === 'error',
          null,
          { timeout: 30000 }
        );
        assert.match(
          await modal.status.textContent(),
          /数量异常|未完成/,
          `Mode ${extraMode} must fail with extra attachment error`
        );
        await modal.cancelBtn.click();
        await modal.host.waitFor({ state: 'detached' });
      }

      // 8d. Global toast rejection
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.setUploadMode('global-toast-reject');
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(validPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.submitBtn.click();

      await page.waitForFunction(
        () => document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status')?.getAttribute('data-tone') === 'error',
        null,
        { timeout: 10000 }
      );
      assert.match(await modal.status.textContent(), /无法上传更多媒体文件/);
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // 8d2. Platform container uploadError rejection (reject-all)
      await page.evaluate(() => {
        document.getElementById('toast-layer').innerHTML = '';
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.setUploadMode('reject-all');
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(validPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.submitBtn.click();

      await page.waitForFunction(
        () => document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status')?.getAttribute('data-tone') === 'error',
        null,
        { timeout: 10000 }
      );
      assert.match(await modal.status.textContent(), /平台拒绝接收媒体附件/);
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // 8e. Named & anonymous order scramble -> upload completed, modal auto-closes, explicit order mismatch on composer banner (never "上传失败" or "顺序待确认")
      for (const scrambleMode of ['scramble-order', 'scramble-order-anonymous']) {
        await page.evaluate((mode) => {
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          window.__mockX.setUploadMode(mode);
        }, scrambleMode);
        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(validPath);
        await modal.cards.nth(7).waitFor({ state: 'visible' });
        await modal.submitBtn.click();

        const fbScramble = await waitForComposerFeedback(page, '#inline-composer', 'error', /上传已完成.*切片顺序错误/);
        assert.match(fbScramble.text, /手动检查/);
        assert.equal(fbScramble.role, 'alert');
        assert.ok(!fbScramble.text.includes('上传失败'), `Order mismatch must not claim 上传失败: ${fbScramble.text}`);
        assert.ok(!fbScramble.text.includes('未完成：未完成：'), `Duplicate prefix in: ${fbScramble.text}`);
      }

      // 8f. Wrong color channel anonymous attachments (red=0 in slices vs red=255 in DOM) -> auto-closes & reports content/order mismatch!
      const bandsPath = writeTempFile(tmpDir, 'color-bands-r0.png', createColorBandsPng(10, 40, 8, 0));
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.setUploadMode('wrong-channel-anonymous');
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(bandsPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.submitBtn.click();

      const fbWrongChannel = await waitForComposerFeedback(page, '#inline-composer', 'error', /差异过大|无法确认内容匹配/);
      assert.ok(!fbWrongChannel.text.includes('上传失败'), `Completed upload mismatch must not say 上传失败: ${fbWrongChannel.text}`);
      assert.ok(!fbWrongChannel.text.includes('未完成：未完成：'), `Duplicate prefix in: ${fbWrongChannel.text}`);

      // 8g. Cross-origin tainted anonymous attachments -> upload completes, auto-closes & displays order-unconfirmed prompt on composer!
      allowCrossOriginMockUrls = true;
      try {
        await page.evaluate(() => {
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          window.__mockX.setUploadMode('cross-origin-anonymous');
        });
        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(validPath);
        await modal.cards.nth(7).waitFor({ state: 'visible' });
        await modal.submitBtn.click();

        const fbCross = await waitForComposerFeedback(page, '#inline-composer', 'warning', /上传完成，共 8 张，请检查顺序后再发布/);
        assert.equal(fbCross.role, 'status');
        assert.ok(!fbCross.text.includes('未完成：未完成：'), `Duplicate prefix in: ${fbCross.text}`);
      } finally {
        allowCrossOriginMockUrls = false;
      }

      // 8h. Solid-color anonymous attachments -> indistinguishable slices: upload completes, auto-closes & shows order-unconfirmed warning!
      const solidPath = writeTempFile(tmpDir, 'solid-80x40.png', createSolidPng(80, 40, [120, 120, 120, 255]));
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.setUploadMode('real-x-carousel');
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(solidPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.submitBtn.click();

      const fbSolid = await waitForComposerFeedback(page, '#inline-composer', 'warning', /上传完成，共 8 张，请检查顺序后再发布/);
      assert.equal(fbSolid.role, 'status');
      assert.equal((await page.evaluate(() => window.__mockX.getState())).publishClicks.length, 0);
    });

    // 9. Variable slice count (2, 8, 20, coprime 3) with non-divisible width, pixel-exact reassembly, blob URL revocation, 20-slice anonymous order check, and no cross-session memory
    await runCase('09_variable_count_2_8_20_pixel_exact_blob_revoke_and_no_memory', async (page) => {
      const { buffer, width, height, rgba } = createPatternPng(197, 80);
      const imgPath = writeTempFile(tmpDir, 'pattern-197x80-var.png', buffer);

      // 9a. Default is 8 regardless of ultra-wide or tall aspect ratios
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      let modal = await getModalLocators(page);
      assert.equal(await modal.sliceCountInput.inputValue(), '8');
      assert.equal(await modal.sliceBadge.textContent(), '左右等分 1×8');

      const ultraWidePath = writeTempFile(tmpDir, 'ultrawide-800x40.png', createSolidPng(800, 40));
      await modal.fileInput.setInputFiles(ultraWidePath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      assert.equal(await modal.cards.count(), 8);
      assert.equal(await modal.sliceCountInput.inputValue(), '8', 'Must not auto-change count for aspect ratio');

      // Switch to main pattern image (197x80) at default 8
      await modal.fileInput.setInputFiles(imgPath);
      await page.waitForFunction(() => {
        const sum = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.summary');
        return sum && sum.textContent.includes('197 × 80') && sum.textContent.includes('8 张');
      });
      assert.equal(await modal.cards.count(), 8);
      const urls8 = await modal.cards.evaluateAll((cards) => cards.map((c) => c.querySelector('img').src));
      for (const u of urls8) {
        const ok = await page.evaluate(async (url) => (await fetch(url)).ok, u);
        assert.equal(ok, true, `Active blob URL should be fetchable: ${u}`);
      }

      // 9b. Change 8 -> 2: old 8 blob URLs MUST be revoked, 2 slices reassemble pixel-exact with widths [98, 99]
      await modal.sliceCountInput.fill('2');
      await page.waitForFunction(() => {
        const host = document.querySelector('#x-slicer-modal-host');
        const cards = host?.shadowRoot?.querySelectorAll('.slice-card');
        const st = host?.shadowRoot?.querySelector('.status');
        return cards?.length === 2 && st?.getAttribute('data-tone') === 'success';
      });
      assert.equal(await modal.sliceBadge.textContent(), '左右等分 1×2');
      assert.equal(await modal.decreaseBtn.isDisabled(), true, 'Decrease button disabled at min 2');
      assert.equal(await modal.increaseBtn.isDisabled(), false);

      for (const oldUrl of urls8) {
        const stillAlive = await page.evaluate(async (url) => {
          try {
            await fetch(url);
            return true;
          } catch {
            return false;
          }
        }, oldUrl);
        assert.equal(stillAlive, false, `Old 8-slice blob URL must be revoked: ${oldUrl}`);
      }

      const preview2 = await modal.cards.evaluateAll(async (cards) => {
        const out = [];
        for (const c of cards) {
          const img = c.querySelector('img');
          const buf = await (await fetch(img.src)).arrayBuffer();
          out.push({
            name: c.getAttribute('data-slice-name'),
            w: img.naturalWidth,
            h: img.naturalHeight,
            bytes: Array.from(new Uint8Array(buf))
          });
        }
        return out;
      });
      assert.deepEqual(
        preview2.map((p) => p.name),
        ['slice-01.png', 'slice-02.png']
      );
      assert.deepEqual(
        preview2.map((p) => p.w),
        [98, 99]
      );
      reassembleAndVerifyPngSlices(
        preview2.map((p) => Buffer.from(p.bytes)),
        rgba,
        width,
        height
      );

      // 9c. Change 2 -> 3 (coprime to 2 and 8 -> proves reslicing from original image!)
      const urls2 = await modal.cards.evaluateAll((cards) => cards.map((c) => c.querySelector('img').src));
      await modal.sliceCountInput.fill('3');
      await page.waitForFunction(() => {
        const host = document.querySelector('#x-slicer-modal-host');
        const cards = host?.shadowRoot?.querySelectorAll('.slice-card');
        const st = host?.shadowRoot?.querySelector('.status');
        return cards?.length === 3 && st?.getAttribute('data-tone') === 'success';
      });
      for (const oldUrl of urls2) {
        const stillAlive = await page.evaluate(async (url) => {
          try {
            await fetch(url);
            return true;
          } catch {
            return false;
          }
        }, oldUrl);
        assert.equal(stillAlive, false, 'Old 2-slice blob URL must be revoked');
      }
      const preview3 = await modal.cards.evaluateAll(async (cards) => {
        const out = [];
        for (const c of cards) {
          const buf = await (await fetch(c.querySelector('img').src)).arrayBuffer();
          out.push({ w: c.querySelector('img').naturalWidth, bytes: Array.from(new Uint8Array(buf)) });
        }
        return out;
      });
      assert.deepEqual(
        preview3.map((p) => p.w),
        [65, 66, 66]
      );
      reassembleAndVerifyPngSlices(
        preview3.map((p) => Buffer.from(p.bytes)),
        rgba,
        width,
        height
      );

      // 9d. Change 3 -> 20 and submit all 20 slices (slice-01.png .. slice-20.png)
      await modal.sliceCountInput.fill('20');
      await page.waitForFunction(() => {
        const host = document.querySelector('#x-slicer-modal-host');
        const cards = host?.shadowRoot?.querySelectorAll('.slice-card');
        const st = host?.shadowRoot?.querySelector('.status');
        return cards?.length === 20 && st?.getAttribute('data-tone') === 'success';
      });
      assert.equal(await modal.sliceBadge.textContent(), '左右等分 1×20');
      assert.equal(await modal.increaseBtn.isDisabled(), true, 'Increase button disabled at max 20');
      assert.equal(await modal.decreaseBtn.isDisabled(), false);

      const preview20 = await modal.cards.evaluateAll(async (cards) => {
        const out = [];
        for (const c of cards) {
          const img = c.querySelector('img');
          const frame = c.querySelector('.slice-frame').getBoundingClientRect();
          const buf = await (await fetch(img.src)).arrayBuffer();
          out.push({
            name: c.getAttribute('data-slice-name'),
            w: img.naturalWidth,
            h: img.naturalHeight,
            frameW: frame.width,
            frameH: frame.height,
            metaText: c.querySelector('.slice-meta').textContent,
            bytes: Array.from(new Uint8Array(buf))
          });
        }
        return out;
      });
      assert.equal(preview20.length, 20);
      for (let i = 0; i < 20; i++) {
        const p = preview20[i];
        assert.equal(p.name, `slice-${String(i + 1).padStart(2, '0')}.png`);
        assert.equal(p.h, 80);
        assert.ok(p.metaText.includes(`${p.w}×80`));
        const natRatio = p.w / p.h;
        const frmRatio = p.frameW / p.frameH;
        assert.ok(Math.abs(natRatio - frmRatio) < 0.12);
      }

      await modal.submitBtn.click();
      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 20 张切片，等待发布/);

      const state20 = await page.evaluate(() => window.__mockX.getState());
      assert.equal(state20.publishClicks.length, 0);
      assert.equal(state20.submissions.length, 1);
      assert.equal(state20.submissions[0].count, 20);
      for (let i = 0; i < 20; i++) {
        assert.equal(state20.submissions[0].files[i].name, `slice-${String(i + 1).padStart(2, '0')}.png`);
        assert.deepEqual(preview20[i].bytes, state20.submissions[0].files[i].bytes);
      }
      reassembleAndVerifyPngSlices(
        state20.submissions[0].files.map((f) => Buffer.from(f.bytes)),
        rgba,
        width,
        height
      );

      // 9e. Reopen resets back to 8 (no cross-session memory), even across page reload
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      assert.equal(await modal.sliceCountInput.inputValue(), '8');
      await modal.closeBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#inline-composer button[data-x-slicer-entry="true"]');

      // 9f. 20-slice anonymous real-X square-thumbs pixel order verification
      const bands20Path = writeTempFile(tmpDir, 'bands-20.png', createColorBandsPng(20, 80, 20, 255));
      await page.evaluate(() => window.__mockX.setUploadMode('real-x-square-thumbs'));
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      assert.equal(await modal.sliceCountInput.inputValue(), '8');
      await modal.sliceCountInput.fill('20');
      await modal.fileInput.setInputFiles(bands20Path);
      await modal.cards.nth(19).waitFor({ state: 'visible' });
      await modal.submitBtn.click();
      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 20 张切片，等待发布/);
    });

    // 10. Strict invalid slice count validation (prevents submitting stale valid 8-slice preview or zero-width slices)
    await runCase('10_invalid_slice_counts_block_submit_and_zero_width_guard', async (page) => {
      const { buffer } = createPatternPng(197, 80);
      const imgPath = writeTempFile(tmpDir, 'pattern-invalid-count.png', buffer);
      const narrowPath = writeTempFile(tmpDir, 'narrow-10x50.png', createPatternPng(10, 50).buffer);

      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      const modal = await getModalLocators(page);

      // Invalid count BEFORE selecting a file must prevent slicing upon file selection
      await modal.sliceCountInput.fill('21');
      assert.equal(await modal.status.getAttribute('data-tone'), 'error');
      assert.equal(await modal.sliceCountInput.getAttribute('aria-invalid'), 'true');
      await modal.fileInput.setInputFiles(imgPath);
      await page.waitForTimeout(80);
      assert.equal(await modal.cards.count(), 0);
      assert.equal(await modal.submitBtn.isDisabled(), true);

      // Fix count to 8 -> valid 8-slice preview appears and submitBtn enables
      await modal.sliceCountInput.fill('8');
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      assert.equal(await modal.submitBtn.isDisabled(), false);

      // Now enter invalid values AFTER a valid 8-slice preview exists -> must clear preview and block submit!
      const invalidInputs = ['1', '0', '-5', '21', '8.5', '1e1', 'abc', ''];
      for (const badVal of invalidInputs) {
        await modal.sliceCountInput.fill(badVal);
        await page.waitForFunction(() => {
          const st = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status');
          return st?.getAttribute('data-tone') === 'error';
        });
        assert.equal(await modal.cards.count(), 0, `Invalid "${badVal}" must clear stale preview`);
        assert.equal(await modal.submitBtn.isDisabled(), true, `Invalid "${badVal}" must disable submit`);
        assert.equal(await modal.sliceCountInput.getAttribute('aria-invalid'), 'true');
      }

      // Restore valid count 8 with narrow 10x50 image -> succeeds with 8 slices
      await modal.sliceCountInput.fill('8');
      await modal.fileInput.setInputFiles(narrowPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      assert.equal(await modal.submitBtn.isDisabled(), false);

      // Change count to 12 (> width 10, would create zero-width slices) -> must error and block submit!
      await modal.sliceCountInput.fill('12');
      await page.waitForFunction(() => {
        const st = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status');
        return st?.getAttribute('data-tone') === 'error';
      });
      assert.match(await modal.status.textContent(), /小于 12 像素/);
      assert.equal(await modal.sliceCountInput.getAttribute('aria-invalid'), 'true');
      assert.equal(await modal.sliceBadge.textContent(), '超出原图宽度');
      assert.equal(await modal.cards.count(), 0);
      assert.equal(await modal.submitBtn.isDisabled(), true);

      // Recover by changing count back to 5 (<= width 10) without re-selecting file!
      await modal.sliceCountInput.fill('5');
      await modal.cards.nth(4).waitFor({ state: 'visible' });
      assert.equal(await modal.sliceCountInput.getAttribute('aria-invalid'), 'false');
      assert.equal(await modal.sliceBadge.textContent(), '左右等分 1×5');
      assert.equal(await modal.cards.count(), 5);
      assert.equal(await modal.submitBtn.isDisabled(), false);

      const state = await page.evaluate(() => window.__mockX.getState());
      assert.equal(state.submissions.length, 0);
    });

    // 11. Re-slice from original preserves PNG chunks/semi-transparency & keyboard/stepper controls
    await runCase('11_reslice_preserves_png_chunks_and_keyboard_stepper', async (page) => {
      const semiGamma = createSemiTransparentGammaPng(160, 40);
      const semiPath = writeTempFile(tmpDir, 'semi-gamma-160x40.png', semiGamma.buffer);

      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      const modal = await getModalLocators(page);

      // Keyboard ArrowUp / ArrowDown & stepper buttons
      await modal.sliceCountInput.focus();
      await page.keyboard.press('ArrowUp');
      assert.equal(await modal.sliceCountInput.inputValue(), '9');
      assert.equal(await modal.sliceCountInput.getAttribute('aria-valuenow'), '9');
      await page.keyboard.press('ArrowDown');
      assert.equal(await modal.sliceCountInput.inputValue(), '8');
      await modal.increaseBtn.click();
      assert.equal(await modal.sliceCountInput.inputValue(), '9');
      assert.equal(await modal.presetBtn(8).getAttribute('aria-pressed'), 'false');
      await modal.decreaseBtn.click();
      assert.equal(await modal.sliceCountInput.inputValue(), '8');
      assert.equal(await modal.presetBtn(8).getAttribute('aria-pressed'), 'true');
      assert.equal(await modal.presetBtn(5).getAttribute('aria-pressed'), 'false');
      assert.equal(await modal.presetBtn(20).getAttribute('aria-pressed'), 'false');

      // Test recommended preset buttons (5 / 8 / 20)
      await modal.presetBtn(5).click();
      assert.equal(await modal.sliceCountInput.inputValue(), '5');
      assert.equal(await modal.presetBtn(5).getAttribute('aria-pressed'), 'true');
      assert.equal(await modal.presetBtn(8).getAttribute('aria-pressed'), 'false');
      await modal.presetBtn(20).click();
      assert.equal(await modal.sliceCountInput.inputValue(), '20');
      assert.equal(await modal.presetBtn(20).getAttribute('aria-pressed'), 'true');
      await modal.presetBtn(8).click();
      assert.equal(await modal.sliceCountInput.inputValue(), '8');
      assert.equal(await modal.presetBtn(8).getAttribute('aria-pressed'), 'true');

      // Ensure keystrokes inside sliceCountInput did not leak Escape or Arrow events
      await modal.fileInput.setInputFiles(semiPath);
      await modal.cards.nth(7).waitFor({ state: 'visible' });

      // Change 8 -> 15 -> 2 and submit 2
      await modal.sliceCountInput.fill('15');
      await modal.cards.nth(14).waitFor({ state: 'visible' });
      await modal.sliceCountInput.fill('2');
      await page.waitForFunction(() => {
        const host = document.querySelector('#x-slicer-modal-host');
        return (
          host?.shadowRoot?.querySelectorAll('.slice-card').length === 2 &&
          host?.shadowRoot?.querySelector('.status')?.getAttribute('data-tone') === 'success'
        );
      });

      await modal.submitBtn.click();
      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 2 张切片，等待发布/);

      const state = await page.evaluate(() => window.__mockX.getState());
      assert.equal(state.pageEscapeEvents, 0);
      assert.equal(state.pageArrowEvents, 0);
      const finalSlices = state.submissions[0].files.map((f) => Buffer.from(f.bytes));
      reassembleAndVerifyPngSlices(finalSlices, semiGamma.rgba, semiGamma.width, semiGamma.height);
      for (const sliceBuf of finalSlices) {
        const chunks = extractPngChunks(sliceBuf);
        for (const [chunkType, expectedPayload] of Object.entries(semiGamma.expectedChunks)) {
          const found = chunks.find((c) => c.type === chunkType);
          assert.ok(found, `Missing PNG chunk ${chunkType} after re-slicing`);
          assert.deepEqual(found.data, expectedPayload);
        }
      }
    });

    // 12. Race condition protection: rapid count switch (8 -> 20 -> 5), stale error isolation, reselect race, cancel mid-flight, and submit parameter lock
    await runCase('12_race_conditions_and_submit_parameter_lock', async (page) => {
      const pat197 = createPatternPng(197, 80);
      const patPath = writeTempFile(tmpDir, 'race-197x80.png', pat197.buffer);
      const solidOtherPath = writeTempFile(tmpDir, 'race-other-160x80.png', createSolidPng(160, 80, [250, 10, 10, 255]));

      const cdp = await page.context().newCDPSession(page);
      const isolatedContextIds = new Set();
      cdp.on('Runtime.executionContextCreated', (evt) => {
        if (evt.context?.id && evt.context.auxData && evt.context.auxData.isDefault === false) {
          isolatedContextIds.add(evt.context.id);
        }
      });
      await cdp.send('Runtime.enable');
      assert.ok(isolatedContextIds.size > 0);

      async function getExtensionContextId() {
        for (const contextId of isolatedContextIds) {
          const res = await cdp.send('Runtime.evaluate', {
            contextId,
            expression: 'Boolean(globalThis.XSlicer)',
            returnByValue: true
          });
          if (res?.result?.value === true) return contextId;
        }
        throw new Error('Extension isolated context with XSlicer not found');
      }

      const extContextId = await getExtensionContextId();

      async function evalInIsolated(expression) {
        const res = await cdp.send('Runtime.evaluate', {
          contextId: extContextId,
          expression,
          returnByValue: true
        });
        if (res.exceptionDetails) {
          throw new Error(`CDP eval error: ${res.exceptionDetails.text}`);
        }
        return res?.result?.value;
      }

      async function waitForGateCount(expected) {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          const len = await evalInIsolated('globalThis.__raceGates.length');
          if (len >= expected) return len;
          await page.waitForTimeout(20);
        }
        throw new Error(`Timed out waiting for __raceGates.length >= ${expected}`);
      }

      try {
        // 12a. Gate first createImageBitmap call (task 8): rapid switch 8 -> 20 -> 5 serializes cleanly, skips cancelled 20, and only 5 lands
        await evalInIsolated(`(() => {
          globalThis.__origBitmapRace = globalThis.createImageBitmap.bind(globalThis);
          globalThis.__raceGates = [];
          globalThis.__raceCallCount = 0;
          globalThis.createImageBitmap = (...args) => {
            if (args[0] instanceof File) {
              const idx = ++globalThis.__raceCallCount;
              if (idx === 1) {
                let resolveGate, rejectGate;
                const p = new Promise((res, rej) => { resolveGate = res; rejectGate = rej; });
                globalThis.__raceGates.push({ idx, resolveGate, rejectGate });
                return p.then(() => globalThis.__origBitmapRace(...args));
              }
            }
            return globalThis.__origBitmapRace(...args);
          };
        })()`);

        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        let modal = await getModalLocators(page);

        // Start task 1 (8) and wait until it is blocked inside createImageBitmap
        await modal.fileInput.setInputFiles(patPath);
        await waitForGateCount(1);
        assert.equal(await modal.status.getAttribute('data-tone'), 'busy');
        assert.equal(await modal.submitBtn.isDisabled(), true);

        // Rapidly switch 8 -> 20 -> 5 while 8 is mid-flight -> serialized queue prevents overlapping decode
        await modal.sliceCountInput.fill('20');
        assert.equal(await modal.submitBtn.isDisabled(), true);
        await page.waitForTimeout(30);
        await modal.sliceCountInput.fill('5');
        await page.waitForTimeout(30);
        assert.equal(await evalInIsolated('globalThis.__raceCallCount'), 1);

        // Release stale task 8 -> late bitmap closes, cancelled 20 skipped, task 5 completes
        await evalInIsolated('for (const g of globalThis.__raceGates) g.resolveGate();');
        await page.waitForFunction(() => {
          const host = document.querySelector('#x-slicer-modal-host');
          return (
            host?.shadowRoot?.querySelectorAll('.slice-card').length === 5 &&
            host?.shadowRoot?.querySelector('.status')?.getAttribute('data-tone') === 'success'
          );
        });
        assert.equal(await evalInIsolated('globalThis.__raceCallCount'), 2);
        await evalInIsolated('globalThis.createImageBitmap = globalThis.__origBitmapRace;');

        // Final preview and submission MUST still be 5!
        assert.equal(await modal.cards.count(), 5);
        assert.match(await modal.summary.textContent(), /5 张 PNG 切片/);
        await modal.submitBtn.click();
        await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 5 张切片，等待发布/);
        const state12a = await page.evaluate(() => window.__mockX.getState());
        assert.equal(state12a.submissions.length, 1);
        assert.equal(state12a.submissions[0].count, 5);
        reassembleAndVerifyPngSlices(
          state12a.submissions[0].files.map((f) => Buffer.from(f.bytes)),
          pat197.rgba,
          pat197.width,
          pat197.height
        );

        // 12b. Superseded task rejects with error -> stale error must NOT surface or block newer task 4!
        await page.evaluate(() => {
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        });
        await evalInIsolated(`(() => {
          globalThis.__raceGates = [];
          globalThis.__raceCallCount = 0;
          globalThis.createImageBitmap = (...args) => {
            const idx = ++globalThis.__raceCallCount;
            if (idx === 1) {
              let resolveGate, rejectGate;
              const p = new Promise((res, rej) => { resolveGate = res; rejectGate = rej; });
              globalThis.__raceGates.push({ idx, resolveGate, rejectGate });
              return p.then(() => globalThis.__origBitmapRace(...args));
            }
            return globalThis.__origBitmapRace(...args);
          };
        })()`);

        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(patPath); // Task 1 (8) blocked
        await waitForGateCount(1);
        await modal.sliceCountInput.fill('4'); // Task 2 (4) queued behind stale 8
        await page.waitForTimeout(30);

        await evalInIsolated(`(() => {
          globalThis.__raceGates[0].rejectGate(new Error('stale failure'));
          globalThis.createImageBitmap = globalThis.__origBitmapRace;
        })()`);
        await modal.cards.nth(3).waitFor({ state: 'visible' });
        await page.waitForTimeout(100);
        assert.equal(await modal.status.getAttribute('data-tone'), 'success');
        assert.equal(await modal.cards.count(), 4);

        // 12c. Rapid file re-selection while first file is mid-flight -> only latest file survives
        await evalInIsolated(`(() => {
          globalThis.__raceGates = [];
          globalThis.__raceCallCount = 0;
          globalThis.createImageBitmap = (...args) => {
            const idx = ++globalThis.__raceCallCount;
            if (idx === 1) {
              let resolveGate, rejectGate;
              const p = new Promise((res, rej) => { resolveGate = res; rejectGate = rej; });
              globalThis.__raceGates.push({ idx, resolveGate, rejectGate });
              return p.then(() => globalThis.__origBitmapRace(...args));
            }
            return globalThis.__origBitmapRace(...args);
          };
        })()`);
        await modal.fileInput.setInputFiles(solidOtherPath); // 160x80 blocked
        await waitForGateCount(1);
        await modal.fileInput.setInputFiles(patPath); // 197x80 queued behind stale 160x80
        await page.waitForTimeout(30);
        assert.equal(await evalInIsolated('globalThis.__raceCallCount'), 1);

        await evalInIsolated(`(() => {
          globalThis.__raceGates[0].resolveGate();
          globalThis.createImageBitmap = globalThis.__origBitmapRace;
        })()`);
        await page.waitForFunction(() => {
          const sum = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.summary');
          return sum && sum.textContent.includes('197 × 80');
        });
        await page.waitForTimeout(100);
        assert.match(await modal.summary.textContent(), /197 × 80/);
        assert.equal(await modal.cards.count(), 4);

        await modal.cancelBtn.click();
        await modal.host.waitFor({ state: 'detached' });

        // 12d. Cancel mid-flight & verify controls locked during async submission
        await evalInIsolated(`(() => {
          globalThis.__raceGates = [];
          globalThis.createImageBitmap = (...args) => {
            let resolveGate, rejectGate;
            const p = new Promise((res, rej) => { resolveGate = res; rejectGate = rej; });
            globalThis.__raceGates.push({ resolveGate, rejectGate });
            return p.then(() => globalThis.__origBitmapRace(...args));
          };
        })()`);
        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(patPath);
        await waitForGateCount(1);
        await modal.cancelBtn.click();
        await modal.host.waitFor({ state: 'detached' });

        await evalInIsolated(`(() => {
          for (const g of globalThis.__raceGates) g.resolveGate();
          globalThis.createImageBitmap = globalThis.__origBitmapRace;
        })()`);
        await page.waitForTimeout(80);
        assert.equal(await page.locator('#x-slicer-modal-host').count(), 0);

        // Verify slice count controls are locked during async submission
        await page.evaluate(() => window.__mockX.setUploadMode('async', { asyncStepMs: 80, asyncCompleteMs: 300 }));
        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.sliceCountInput.fill('3');
        await modal.fileInput.setInputFiles(patPath);
        await modal.cards.nth(2).waitFor({ state: 'visible' });
        await modal.submitBtn.click();
        assert.equal(await modal.sliceCountInput.isDisabled(), true);
        assert.equal(await modal.decreaseBtn.isDisabled(), true);
        assert.equal(await modal.increaseBtn.isDisabled(), true);
        assert.equal(await modal.fileInput.isDisabled(), true);
        assert.equal(await modal.submitBtn.isDisabled(), true);
        await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 3 张切片，等待发布/, 10000);
        assert.equal((await page.evaluate(() => window.__mockX.getState())).submissions[1].count, 3);
      } finally {
        await cdp.detach();
      }
    });

    // 13. 20-slice failure reporting: truncate-4, truncate-19, partial-error, and scramble-order
    await runCase('13_twenty_slices_truncation_partial_error_and_scramble', async (page) => {
      const bands20Path = writeTempFile(tmpDir, 'fail-bands-20.png', createColorBandsPng(20, 40, 20, 255));

      for (const tc of [
        { mode: 'truncate-4', expectRegex: /4 \/ 20/, expectCount: 4, postClose: false },
        { mode: 'truncate-19', expectRegex: /19 \/ 20/, expectCount: 19, postClose: false },
        { mode: 'partial-error', expectRegex: /上传错误.*5 \/ 20/, expectCount: 20, postClose: false },
        { mode: 'scramble-order', expectRegex: /上传已完成.*切片顺序错误/, expectCount: 20, postClose: true },
        { mode: 'scramble-order-anonymous', expectRegex: /上传已完成.*切片顺序错误/, expectCount: 20, postClose: true }
      ]) {
        await page.evaluate((mode) => {
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          window.__mockX.setUploadMode(mode);
        }, tc.mode);

        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        const modal = await getModalLocators(page);
        await modal.sliceCountInput.fill('20');
        await modal.fileInput.setInputFiles(bands20Path);
        await modal.cards.nth(19).waitFor({ state: 'visible' });
        await modal.submitBtn.click();

        if (tc.postClose) {
          const fb = await waitForComposerFeedback(page, '#inline-composer', 'error', tc.expectRegex, 15000);
          assert.equal(fb.role, 'alert');
          assert.ok(!fb.text.includes('上传失败'), `Must not say 上传失败: ${fb.text}`);
        } else {
          await page.waitForFunction(
            () => document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status')?.getAttribute('data-tone') === 'error',
            null,
            { timeout: 15000 }
          );
          const statusText = await modal.status.textContent();
          assert.match(statusText, tc.expectRegex, `Mode ${tc.mode} unexpected status: ${statusText}`);
          await modal.cancelBtn.click();
          await modal.host.waitFor({ state: 'detached' });
        }

        assert.equal(await page.locator('#inline-composer [data-testid="attachmentItem"]').count(), tc.expectCount);
        assert.equal((await page.evaluate(() => window.__mockX.getState())).publishClicks.length, 0);
      }
    });

    // 14. Multi-row 20-slice wrapping, CSS order tamper, toast node reuse, realistic margin/gradient 20-slice & 3-slice collage
    await runCase('14_layout_toast_and_realistic_20_slice_regressions', async (page) => {
      const marginPosterPath = writeTempFile(tmpDir, 'margin-poster-1600x600.png', createMarginPosterPng(1600, 600, 1));
      const landscapePath = writeTempFile(tmpDir, 'landscape-grad-1600x900.png', createSmoothLandscapeGradientPng(1600, 900));
      const smallHeight25x4Path = writeTempFile(tmpDir, 'small-25x4.png', createPatternPng(25, 4).buffer);
      const bands20Path = writeTempFile(tmpDir, 'bands-20-multi.png', createColorBandsPng(20, 40, 20, 255));
      const pat3Path = writeTempFile(tmpDir, 'collage-3-300x120.png', createPatternPng(300, 120).buffer);

      // 14a. Multi-row 20-slice wrapped layout (4 rows x 5) in anonymous real-x-carousel -> must PASS
      await page.evaluate(() => {
        window.__mockX.setLayoutMode('wrap-grid');
        window.__mockX.setUploadMode('real-x-carousel');
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      let modal = await getModalLocators(page);
      await modal.sliceCountInput.fill('20');
      await modal.fileInput.setInputFiles(bands20Path);
      await modal.cards.nth(19).waitFor({ state: 'visible' });
      await modal.submitBtn.click();
      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 20 张切片，等待发布/);

      // 14b. Pre-existing CSS row-reverse -> auto-closes and reports visual order mismatch on composer feedback
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.setLayoutMode('row-reverse');
        window.__mockX.setUploadMode('real-x-carousel');
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.sliceCountInput.fill('20');
      await modal.fileInput.setInputFiles(bands20Path);
      await modal.cards.nth(19).waitFor({ state: 'visible' });
      await modal.submitBtn.click();
      await waitForComposerFeedback(page, '#inline-composer', 'error', /横向排列顺序|切片顺序错误/);

      // 14c. CSS style.order mutation DURING await verifyAttachmentOrder() on 4x5 wrap-grid -> auto-closes first with warning, then updates to error after release!
      const cdp = await page.context().newCDPSession(page);
      const isolatedContextIds = new Set();
      cdp.on('Runtime.executionContextCreated', (evt) => {
        if (evt.context?.id && evt.context.auxData && evt.context.auxData.isDefault === false) {
          isolatedContextIds.add(evt.context.id);
        }
      });
      await cdp.send('Runtime.enable');
      let extContextId = null;
      for (const id of isolatedContextIds) {
        const res = await cdp.send('Runtime.evaluate', {
          contextId: id,
          expression: 'Boolean(globalThis.XSlicer)',
          returnByValue: true
        });
        if (res?.result?.value === true) {
          extContextId = id;
          break;
        }
      }
      assert.ok(extContextId, 'Expected extension isolated context');

      try {
        await page.evaluate(() => {
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          window.__mockX.setLayoutMode('wrap-grid');
          window.__mockX.setUploadMode('real-x-square-thumbs');
          delete document.documentElement.dataset.xslicerBitmapAwait14;
        });
        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.sliceCountInput.fill('20');
        await modal.fileInput.setInputFiles(bands20Path);
        await modal.cards.nth(19).waitFor({ state: 'visible' });

        await cdp.send('Runtime.evaluate', {
          contextId: extContextId,
          expression: `(() => {
            if (!globalThis.__origBitmap14) {
              globalThis.__origBitmap14 = globalThis.createImageBitmap.bind(globalThis);
            }
            let release;
            const gate = new Promise((r) => { release = r; });
            globalThis.__releaseBitmap14 = () => {
              release();
              globalThis.createImageBitmap = globalThis.__origBitmap14;
            };
            globalThis.createImageBitmap = (...args) => {
              document.documentElement.dataset.xslicerBitmapAwait14 = '1';
              return gate.then(() => globalThis.__origBitmap14(...args));
            };
          })()`
        });

        await modal.submitBtn.click();
        await page.waitForFunction(() => document.documentElement.dataset.xslicerBitmapAwait14 === '1');
        await waitForComposerFeedback(page, '#inline-composer', 'warning', /上传完成，共 20 张，请检查顺序后再发布/);
        await page.evaluate(() => window.__mockX.scrambleCssOrder('inline'));
        await cdp.send('Runtime.evaluate', {
          contextId: extContextId,
          expression: 'globalThis.__releaseBitmap14 && globalThis.__releaseBitmap14()'
        });

        await waitForComposerFeedback(page, '#inline-composer', 'error', /横向排列顺序|切片顺序错误/);
      } finally {
        await cdp.detach();
      }

      // 14d. Toast reuse, ancestor-hidden reveal, and auto-dismissed/hidden toast handling
      for (const toastCase of [
        { initial: '', layerHidden: false, nodeHidden: false, mode: 'global-toast-reuse-empty', expectTone: 'error', expect: /无法上传更多媒体文件/ },
        { initial: '草稿已保存', layerHidden: false, nodeHidden: false, mode: 'global-toast-reuse-update', expectTone: 'error', expect: /上传失败/ },
        { initial: '上传失败：超出媒体限制', layerHidden: true, nodeHidden: false, mode: 'global-toast-reveal-parent', expectTone: 'error', expect: /上传失败/ },
        { initial: '草稿已保存', layerHidden: false, nodeHidden: false, mode: 'global-toast-dismiss-existing', expectTone: 'success', expect: /已填入 20 张切片，等待发布/ },
        { initial: '旧隐藏错误', layerHidden: false, nodeHidden: true, mode: 'immediate', expectTone: 'success', expect: /已填入 20 张切片，等待发布/ }
      ]) {
        await page.evaluate(({ initial, layerHidden, nodeHidden, mode }) => {
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          window.__mockX.setLayoutMode('default');
          window.__mockX.setPreExistingToast(initial, { layerHidden, nodeHidden });
          window.__mockX.setUploadMode(mode);
        }, toastCase);
        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.sliceCountInput.fill('20');
        await modal.fileInput.setInputFiles(bands20Path);
        await modal.cards.nth(19).waitFor({ state: 'visible' });
        await modal.submitBtn.click();
        if (toastCase.expectTone === 'success') {
          await waitForComposerFeedback(page, '#inline-composer', 'success', toastCase.expect);
        } else {
          await page.waitForFunction(
            (tone) => {
              const st = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status');
              return st?.getAttribute('data-tone') === tone;
            },
            toastCase.expectTone
          );
          assert.match(await modal.status.textContent(), toastCase.expect);
          await modal.cancelBtn.click();
          await modal.host.waitFor({ state: 'detached' });
        }
      }

      // 14e. Realistic 20-slice images: white-margin poster, smooth sky+sand gradient, and 25x4 non-divisible small-height
      for (const tc of [
        { filePath: marginPosterPath, mode: 'real-x-carousel' },
        { filePath: marginPosterPath, mode: 'real-x-square-thumbs' },
        { filePath: landscapePath, mode: 'real-x-carousel' },
        { filePath: smallHeight25x4Path, mode: 'real-x-carousel' }
      ]) {
        await page.evaluate((mode) => {
          const layer = document.getElementById('toast-layer');
          layer.innerHTML = '';
          layer.hidden = false;
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          window.__mockX.setLayoutMode('default');
          window.__mockX.setUploadMode(mode);
        }, tc.mode);
        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.sliceCountInput.fill('20');
        await modal.fileInput.setInputFiles(tc.filePath);
        await modal.cards.nth(19).waitFor({ state: 'visible' });
        await modal.submitBtn.click();
        await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 20 张切片，等待发布/, 15000);
      }

      // 14f. 3-slice heterogeneous collage (120x280 + 250x138 + 250x138) -> must PASS
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.setUploadMode('real-x-3-collage');
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.sliceCountInput.fill('3');
      await modal.fileInput.setInputFiles(pat3Path);
      await modal.cards.nth(2).waitFor({ state: 'visible' });
      await modal.submitBtn.click();
      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 3 张切片，等待发布/);

      // 14g. Distinct full slices (red/white vs blue/white vs green) with identical cropped center thumbnails swapped -> order-unconfirmed auto-closes with warning banner
      const collisionPath = writeTempFile(tmpDir, 'cropped-collision-300x300.png', createCroppedCollisionThreeSlicePng());
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.setUploadMode('real-x-square-thumbs-swap-first2');
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.sliceCountInput.fill('3');
      await modal.fileInput.setInputFiles(collisionPath);
      await modal.cards.nth(2).waitFor({ state: 'visible' });
      await modal.submitBtn.click();
      const fb14g = await waitForComposerFeedback(
        page,
        '#inline-composer',
        'warning',
        /无法明确区分或确认/
      );
      assert.match(fb14g.text, /上传完成，共 3 张，请检查顺序后再发布/);
      assert.equal(fb14g.role, 'status');
      assert.equal((await page.evaluate(() => window.__mockX.getState())).publishClicks.length, 0);

      // 14h. Progressive decodedCount extends timeout beyond 30s baseTimeoutMs while tweetButton stays aria-disabled="true",
      //      and stalls still trigger upload-timeout once effectiveTimeoutMs elapses
      const cdp14h = await page.context().newCDPSession(page);
      const extIds14h = new Set();
      cdp14h.on('Runtime.executionContextCreated', (evt) => {
        if (evt.context?.id && evt.context.auxData && evt.context.auxData.isDefault === false) {
          extIds14h.add(evt.context.id);
        }
      });
      await cdp14h.send('Runtime.enable');
      let extId14h = null;
      for (const id of extIds14h) {
        const res = await cdp14h.send('Runtime.evaluate', {
          contextId: id,
          expression: 'Boolean(globalThis.XSlicer)',
          returnByValue: true
        });
        if (res?.result?.value === true) {
          extId14h = id;
          break;
        }
      }
      assert.ok(extId14h, 'Expected extension isolated context for 14h');

      try {
        await cdp14h.send('Runtime.evaluate', {
          contextId: extId14h,
          expression: `(() => {
            if (!globalThis.__origDateNow14h) {
              globalThis.__origDateNow14h = Date.now.bind(Date);
            }
            globalThis.__nowOffset14h = 0;
            Date.now = () => globalThis.__origDateNow14h() + globalThis.__nowOffset14h;
          })()`
        });

        await page.evaluate(() => {
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          window.__mockX.setLayoutMode('default');
          window.__mockX.setUploadMode('progressive-decoded-slow');
        });
        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.sliceCountInput.fill('20');
        await modal.fileInput.setInputFiles(bands20Path);
        await modal.cards.nth(19).waitFor({ state: 'visible' });
        await modal.submitBtn.click();

        // First 10 slots decoded while tweetButton is aria-disabled="true"
        await page.waitForFunction(() => {
          const imgs = document.querySelectorAll('#inline-composer [data-testid="attachments"] img');
          return imgs.length === 10 && Array.from(imgs).every((img) => img.complete && img.naturalWidth > 0);
        });
        await page.waitForTimeout(200);

        // Advance virtual clock by +18s (< 30s baseTimeoutMs), then decode slots 11..20
        await cdp14h.send('Runtime.evaluate', {
          contextId: extId14h,
          expression: 'globalThis.__nowOffset14h += 18000'
        });
        await page.evaluate(() => window.__mockX.releaseProgressiveBatch('inline'));
        await page.waitForFunction(() => {
          const imgs = document.querySelectorAll('#inline-composer [data-testid="attachments"] img');
          return imgs.length === 20 && Array.from(imgs).every((img) => img.complete && img.naturalWidth > 0);
        });
        await page.waitForTimeout(220);

        // Advance +14s (elapsed ~32.4s > 30s baseTimeoutMs); progress extension (18s + 20s = 38s) must keep upload alive!
        await cdp14h.send('Runtime.evaluate', {
          contextId: extId14h,
          expression: 'globalThis.__nowOffset14h += 14000'
        });
        await page.waitForTimeout(300);
        assert.equal(await modal.status.getAttribute('data-tone'), 'busy');

        // Enable post button and advance past fullSettleMs (350ms) -> must succeed & auto-close
        await page.evaluate(() => window.__mockX.enableComposerPostButton('inline'));
        await cdp14h.send('Runtime.evaluate', {
          contextId: extId14h,
          expression: 'globalThis.__nowOffset14h += 450'
        });
        await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 20 张切片，等待发布/);

        // Stalled upload without further decodedCount progress must still time out cleanly
        await page.evaluate(() => {
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          window.__mockX.setUploadMode('progressive-decoded-slow');
        });
        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.sliceCountInput.fill('20');
        await modal.fileInput.setInputFiles(bands20Path);
        await modal.cards.nth(19).waitFor({ state: 'visible' });
        await modal.submitBtn.click();
        await page.waitForFunction(() => {
          const imgs = document.querySelectorAll('#inline-composer [data-testid="attachments"] img');
          return imgs.length === 10 && Array.from(imgs).every((img) => img.complete && img.naturalWidth > 0);
        });
        await page.waitForTimeout(200);
        await cdp14h.send('Runtime.evaluate', {
          contextId: extId14h,
          expression: 'globalThis.__nowOffset14h += 31000'
        });
        await page.waitForFunction(() => {
          const st = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status');
          return st?.getAttribute('data-tone') === 'error';
        });
        assert.match(await modal.status.textContent(), /等待超时/);
      } finally {
        await cdp14h.send('Runtime.evaluate', {
          contextId: extId14h,
          expression: 'if (globalThis.__origDateNow14h) { Date.now = globalThis.__origDateNow14h; }'
        }).catch(() => {});
        await cdp14h.detach();
      }
    });

    // 15. Ticket 03: Rich Draft.js re-render preservation (with ZWJ/variation emojis), ZWJ/ZWSP loss detection, preview edits, multi-composer isolation, alert/toast isolation, and focus safety
    await runCase('15_ticket_03_draft_edits_multi_composer_isolation_and_focus', async (page) => {
      const tinyPngDataUrl =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const pat8Path = writeTempFile(tmpDir, 't03-pat-160x80.png', createPatternPng(160, 80).buffer);
      const bands20Path = writeTempFile(tmpDir, 't03-bands-20.png', createColorBandsPng(20, 40, 20, 255));

      // 15a. Draft.js [data-block="true"] + ZWJ twemoji <img> + #tag + @user + benign re-render -> verify exact character-for-character ground truth
      const expectedRichDraft = '第一行正文 👩\u200D💻 #标签\n\n@friend 👨\u200D👩\u200D👧\u200D👦 🏳️\u200D🌈 第三行';
      const initialDraftHtml = [
        `<span class="public-DraftEditorPlaceholder-root" aria-hidden="true">有什么新鲜事？</span>`,
        `<div data-contents="true">`,
        `<div data-block="true"><span>第一行正文 </span><img alt="👩\u200D💻" src="${tinyPngDataUrl}" /><span> #标签</span></div>`,
        `<div data-block="true"><span><br data-text="true" /></span></div>`,
        `<div data-block="true"><span>@friend </span><img alt="👨\u200D👩\u200D👧\u200D👦" src="${tinyPngDataUrl}" /><span> 🏳️\u200D🌈 第三行</span></div>`,
        `</div>`
      ].join('');
      const rerenderedDraftHtml = [
        `<div data-contents="true">`,
        `<div data-block="true"><span data-offset-key="r1">第一行正文 </span><img alt="👩\u200D💻" src="${tinyPngDataUrl}" /><a href="#tag"> #标签</a></div>`,
        `<div data-block="true"><span data-offset-key="r2"><br data-text="true" /></span></div>`,
        `<div data-block="true"><span data-offset-key="r3">@friend </span><img alt="👨\u200D👩\u200D👧\u200D👦" src="${tinyPngDataUrl}" /><span> 🏳️\u200D🌈 第三行</span></div>`,
        `</div>`
      ].join('');

      await page.evaluate(
        ({ html, rerender }) => {
          window.__mockX.setComposerDraftHtml('inline', html, rerender);
          window.__mockX.setUploadMode('rerender-draft-preserve');
        },
        { html: initialDraftHtml, rerender: rerenderedDraftHtml }
      );

      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      let modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(pat8Path);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.submitBtn.click();

      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布（已保留原有文案）/);

      // Independent DOM verification (does NOT call extension extractor)
      const actualRichDraft = await page.evaluate(() => {
        const tb = document.querySelector('#inline-composer [data-testid="tweetTextarea_0"]');
        const blocks = Array.from(tb.querySelectorAll('[data-contents="true"] > [data-block="true"]'));
        return blocks
          .map((block) => {
            let line = '';
            const walk = (n) => {
              if (n.nodeType === Node.TEXT_NODE) {
                line += n.nodeValue;
              } else if (n.nodeType === Node.ELEMENT_NODE) {
                if (n.tagName === 'IMG') {
                  line += n.getAttribute('alt') || '';
                } else {
                  for (const child of n.childNodes) walk(child);
                }
              }
            };
            walk(block);
            return line;
          })
          .join('\n');
      });
      assert.equal(actualRichDraft, expectedRichDraft, 'Preserved Draft.js HTML must match exact expected text including spaces, blank line, #tag, @user, and ZWJ emojis');

      // 15b. Preview-period draft edit & clear: latest draft at submit time wins (never restores modal-open snapshot)
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.setUploadMode('immediate');
        window.__mockX.setComposerText('inline', '打开弹窗时的旧快照文案');
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(pat8Path);
      await modal.cards.nth(7).waitFor({ state: 'visible' });

      const updatedDraft = '预览期间改写的新文案 🚀\n第二行 #最新 @user';
      await page.evaluate((t) => window.__mockX.setComposerText('inline', t), updatedDraft);
      await modal.submitBtn.click();

      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布（已保留原有文案）/);
      assert.equal(
        await page.locator('#inline-composer [data-testid="tweetTextarea_0"]').textContent(),
        updatedDraft,
        'Must keep latest draft edited during preview, not revert to old snapshot'
      );

      // Clearing text during preview stays cleared
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.setComposerText('inline', '将被用户手动清空的旧文案');
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(pat8Path);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await page.evaluate(() => window.__mockX.setComposerText('inline', ''));
      await modal.submitBtn.click();
      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布/);
      assert.equal(await page.locator('#inline-composer [data-testid="tweetTextarea_0"]').textContent(), '');

      // 15c. Negative tests for subtle zero-width / ZWJ corruption (U+200B stripped & U+200D stripped)
      for (const zCase of [
        { initial: 'hello\u200Bworld', corrupted: 'helloworld', label: 'U+200B ZWSP loss' },
        { initial: 'dev 👩\u200D💻 team', corrupted: 'dev 👩💻 team', label: 'U+200D ZWJ loss' }
      ]) {
        await page.evaluate(({ initial, corrupted }) => {
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          window.__mockX.setComposerText('inline', initial);
          const tb = document.querySelector('#inline-composer [data-testid="tweetTextarea_0"]');
          tb.dataset.syncCorruptText = corrupted;
          window.__mockX.setUploadMode('corrupt-draft-on-change');
        }, zCase);
        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(pat8Path);
        await modal.cards.nth(7).waitFor({ state: 'visible' });
        await modal.submitBtn.click();

        await page.waitForFunction(() => {
          const st = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status');
          return st?.getAttribute('data-tone') === 'error';
        });
        assert.match(await modal.status.textContent(), /未完成.*原有文案.*发生变化或丢失/, zCase.label);
        assert.equal(
          await page.locator('#inline-composer [data-testid="tweetTextarea_0"]').textContent(),
          zCase.corrupted,
          `${zCase.label}: must not overwrite current DOM text`
        );
        await modal.cancelBtn.click();
        await modal.host.waitFor({ state: 'detached' });
      }

      // 15d. Simultaneous inline + modal + reply + quote composers; alert inside #modal-composer + benign global toast MUST NOT fail #inline-composer upload
      await page.evaluate(() => {
        const tb = document.querySelector('#inline-composer [data-testid="tweetTextarea_0"]');
        delete tb.dataset.syncCorruptText;
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        document.getElementById('toast-layer').innerHTML = '';
        window.__mockX.showModalComposer();
        window.__mockX.setComposerText('inline', '内联框保留文案 #inline 🚀');
        window.__mockX.setComposerText('modal', '弹窗框专属文案\n多行内容 #modal 🎉');
        window.__mockX.setComposerText('reply', '回复框原有文字');
        window.__mockX.setComposerText('quote', '引用框原有文字');
        window.__mockX.setUploadMode('async', { asyncStepMs: 60, asyncCompleteMs: 260 });
      });
      await page.waitForSelector('#modal-composer button[data-x-slicer-entry="true"]');
      assert.equal(await page.locator('#reply-composer button[data-x-slicer-entry="true"]').count(), 0);
      assert.equal(await page.locator('#quote-composer button[data-x-slicer-entry="true"]').count(), 0);

      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(pat8Path);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.submitBtn.click();

      await page.waitForTimeout(100);
      await page.evaluate(() => {
        window.__mockX.addComposerAlert('modal', 'other composer error');
        window.__mockX.showGlobalToast('草稿已保存');
      });

      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布/, 10000);
      assert.equal(await page.locator('#modal-composer [data-x-slicer-feedback="true"]').count(), 0);

      // 15e. Dialog quote / thread exclusion (outside modal-composer root but inside role="dialog")
      await page.evaluate(() => {
        const dlg = document.getElementById('modal-dialog-wrapper');
        const q = document.createElement('div');
        q.setAttribute('data-testid', 'quoteTweet');
        q.id = 'dialog-outer-quote';
        q.textContent = '对话框内外部引用';
        dlg.appendChild(q);
      });
      await page.waitForFunction(() => document.querySelectorAll('#modal-composer button[data-x-slicer-entry="true"]').length === 0);
      await page.evaluate(() => document.getElementById('dialog-outer-quote')?.remove());
      await page.waitForFunction(() => document.querySelectorAll('#modal-composer button[data-x-slicer-entry="true"]').length === 1);

      await page.evaluate(() => {
        const dlg = document.getElementById('modal-dialog-wrapper');
        const secondBox = document.createElement('div');
        secondBox.setAttribute('role', 'textbox');
        secondBox.setAttribute('contenteditable', 'true');
        secondBox.setAttribute('data-testid', 'tweetTextarea_1');
        secondBox.id = 'dialog-thread-box';
        dlg.appendChild(secondBox);
      });
      await page.waitForFunction(() => document.querySelectorAll('#modal-composer button[data-x-slicer-entry="true"]').length === 0);
      await page.evaluate(() => document.getElementById('dialog-thread-box')?.remove());
      await page.waitForFunction(() => document.querySelectorAll('#modal-composer button[data-x-slicer-entry="true"]').length === 1);

      // 15f. 20-slice submit to #modal-composer + cross-composer focus restoration + post-identity swap focus check + real-X cross-composer blur (without data-composer-id)
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        document.querySelectorAll('#modal-composer [role="alert"]').forEach((n) => n.remove());
        window.__mockX.setUploadMode('real-x-carousel');
      });
      const modalEntryBtn = page.locator('#modal-composer button[data-x-slicer-entry="true"]');
      await modalEntryBtn.focus();
      await page.keyboard.press('Enter');
      modal = await getModalLocators(page);
      await modal.sliceCountInput.fill('20');
      await modal.fileInput.setInputFiles(bands20Path);
      await modal.cards.nth(19).waitFor({ state: 'visible' });
      await modal.submitBtn.click();

      await waitForComposerFeedback(page, '#modal-composer', 'success', /已填入 20 张切片，等待发布（已保留原有文案）/);

      const multiCheck = await page.evaluate(() => ({
        focusedId: document.activeElement?.closest('[data-composer-id]')?.getAttribute('data-composer-id') || null,
        focusedIsEntry: document.activeElement?.getAttribute('data-x-slicer-entry') === 'true',
        inlineText: document.querySelector('#inline-composer [data-testid="tweetTextarea_0"]')?.textContent,
        modalText: document.querySelector('#modal-composer [data-testid="tweetTextarea_0"]')?.textContent,
        replyText: document.querySelector('#reply-composer [data-testid="tweetTextarea_0"]')?.textContent,
        quoteText: document.querySelector('#quote-composer [data-testid="tweetTextarea_0"]')?.textContent,
        inlineAttachments: document.querySelectorAll('#inline-composer [data-testid="attachments"] img').length,
        modalAttachments: document.querySelectorAll('#modal-composer [data-testid="attachments"] img').length,
        replyAttachments: document.querySelectorAll('#reply-composer [data-testid="attachments"] img').length,
        quoteAttachments: document.querySelectorAll('#quote-composer [data-testid="attachments"] img').length
      }));
      assert.equal(multiCheck.focusedId, 'modal', 'Focus must return to #modal-composer, never #inline-composer');
      assert.equal(multiCheck.focusedIsEntry, true);
      assert.equal(multiCheck.inlineText, '内联框保留文案 #inline 🚀');
      assert.equal(multiCheck.modalText, '弹窗框专属文案\n多行内容 #modal 🎉');
      assert.equal(multiCheck.replyText, '回复框原有文字');
      assert.equal(multiCheck.quoteText, '引用框原有文字');
      assert.equal(multiCheck.inlineAttachments, 0);
      assert.equal(multiCheck.modalAttachments, 20);
      assert.equal(multiCheck.replyAttachments, 0);
      assert.equal(multiCheck.quoteAttachments, 0);

      // Keep root & entry button intact on #inline-composer, swap identity to 'different-post' -> closing must NOT focus different-post entry button!
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await page.evaluate(() => window.__mockX.swapComposerPostIdentity('inline', 'different-post'));
      await page.waitForFunction(() => {
        const st = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status');
        return st?.getAttribute('data-tone') === 'error';
      });
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });
      const afterIdentitySwap = await page.evaluate(() => ({
        focusedComposer: document.activeElement?.closest('[data-composer-id]')?.getAttribute('data-composer-id') || null
      }));
      assert.equal(afterIdentitySwap.focusedComposer, null, 'Must not restore focus to swapped post identity button');

      // Real-X cross-composer focus safety WITHOUT [data-composer-id]: if modal target is removed and page moves focus onto another composer's Post button, close() must blur it!
      await page.evaluate(() => {
        document.querySelectorAll('[data-composer-id]').forEach((el) => el.removeAttribute('data-composer-id'));
      });
      await page.locator('#modal-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await page.evaluate(() => {
        document.getElementById('modal-composer')?.remove();
      });
      await page.waitForFunction(() => {
        const st = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status');
        return st?.getAttribute('data-tone') === 'error';
      });
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="tweetButtonInline"]')?.focus();
      });
      await page.keyboard.press('Escape');
      await modal.host.waitFor({ state: 'detached' });
      const realXOrphanFocus = await page.evaluate(() => ({
        inInlineComposer: Boolean(document.getElementById('inline-composer')?.contains(document.activeElement)),
        inAnyComposer: Boolean(document.activeElement?.closest?.('[data-testid="toolBar"], [data-testid="tweetButtonInline"], [data-testid="tweetButton"], [role="textbox"]'))
      }));
      assert.equal(realXOrphanFocus.inInlineComposer, false);
      assert.equal(realXOrphanFocus.inAnyComposer, false);
    });

    // 16. Ticket 03: Target hide-and-restore lock, reply conversion + button/focus safety, true sync draft wipe, mid-upload poll/video/GIF conflicts, and un-released CDP order-gate protection
    await runCase('16_ticket_03_target_conversion_draft_corruption_and_mid_upload_conflicts', async (page) => {
      const pat8Path = writeTempFile(tmpDir, 't03-fail-160x80.png', createPatternPng(160, 80).buffer);
      const bandsPath = writeTempFile(tmpDir, 't03-bands-8.png', createColorBandsPng(100, 80, 8, 255));

      // 16a. Hiding modal composer during preview locks session PERMANENTLY (even if re-shown!) and never falls back to inline composer
      await page.evaluate(() => {
        window.__mockX.showModalComposer();
        window.__mockX.setComposerText('inline', '内联框保持不变');
        window.__mockX.setComposerText('modal', '弹窗框草稿');
      });
      await page.waitForSelector('#modal-composer button[data-x-slicer-entry="true"]');
      await page.locator('#modal-composer button[data-x-slicer-entry="true"]').click();
      let modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(pat8Path);
      await modal.cards.nth(7).waitFor({ state: 'visible' });

      await page.evaluate(() => window.__mockX.hideModalComposer());
      await page.waitForFunction(() => {
        const st = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status');
        return st?.getAttribute('data-tone') === 'error';
      });
      assert.match(await modal.status.textContent(), /已关闭|被隐藏|已失效|停止/);
      assert.equal(await modal.submitBtn.isDisabled(), true);

      // Re-showing the modal composer must NOT unlock this invalidated slicer round
      await page.evaluate(() => window.__mockX.showModalComposer());
      await page.waitForTimeout(200);
      assert.equal(await modal.status.getAttribute('data-tone'), 'error');
      assert.equal(await modal.submitBtn.isDisabled(), true);
      assert.equal(await modal.fileInput.isDisabled(), true);
      assert.equal((await page.evaluate(() => window.__mockX.getState())).submissions.length, 0);
      assert.equal(await page.locator('#inline-composer [data-testid="attachmentItem"]').count(), 0);
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // 16b. Target composer converted into a reply box during preview -> locks round, removes stale entry button, and closing does NOT focus reply box or inline box
      await page.evaluate(() => window.__mockX.showModalComposer());
      await page.locator('#modal-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(pat8Path);
      await modal.cards.nth(7).waitFor({ state: 'visible' });

      await page.evaluate(() => window.__mockX.convertToReply('modal'));
      await page.waitForFunction(() => {
        const st = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status');
        return st?.getAttribute('data-tone') === 'error';
      });
      assert.match(await modal.status.textContent(), /不再是新建帖子发帖框|停止/);
      assert.equal(await modal.submitBtn.isDisabled(), true);
      assert.equal(await page.locator('#modal-composer button[data-x-slicer-entry="true"]').count(), 0, 'Stale entry button must be removed on reply conversion');
      assert.equal((await page.evaluate(() => window.__mockX.getState())).submissions.length, 0);
      assert.equal(await page.locator('#inline-composer [data-testid="attachmentItem"]').count(), 0);
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });
      const postReplyConvertFocus = await page.evaluate(() => ({
        focusedComposer: document.activeElement?.closest('[data-composer-id]')?.getAttribute('data-composer-id') || null
      }));
      assert.equal(postReplyConvertFocus.focusedComposer, null, 'Must not restore focus onto reply-converted target or another composer');

      // 16c. Draft wiped SYNCHRONOUSLY inside fileInput change handler -> must detect immediately and report incomplete
      await page.evaluate(() => {
        window.__mockX.setComposerText('inline', '同步事件中不可丢失的草稿 #protect');
        window.__mockX.setUploadMode('corrupt-draft-on-change');
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(pat8Path);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.submitBtn.click();

      await page.waitForFunction(() => {
        const st = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status');
        return st?.getAttribute('data-tone') === 'error';
      });
      assert.match(await modal.status.textContent(), /未完成.*原有文案.*发生变化或丢失/);
      assert.equal(await page.locator('#inline-composer [data-testid="attachmentItem"]').count(), 8, 'Must not delete appeared attachments');
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // 16d. Draft corrupted mid-upload during async -> must stop, report incomplete, and NOT overwrite current DOM text
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.setComposerText('inline', '异步上传期间保护的完整文案\n第二行 #keep');
        window.__mockX.setUploadMode('corrupt-draft-during-async');
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(pat8Path);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.submitBtn.click();

      await page.waitForFunction(() => {
        const st = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status');
        return st?.getAttribute('data-tone') === 'error';
      });
      assert.match(await modal.status.textContent(), /未完成.*原有文案.*发生变化或丢失/);
      assert.equal(
        await page.locator('#inline-composer [data-testid="tweetTextarea_0"]').textContent(),
        '被篡改的残缺文案',
        'Extension must NOT blindly overwrite textbox when detecting unexpected draft mutation'
      );
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // 16e. Poll, Video, GIF, and Remove-GIF-label added mid-upload during async -> must all stop & report conflict
      for (const conflictMode of [
        { mode: 'add-poll-during-async', expect: /未完成.*投票/ },
        { mode: 'add-video-during-async', expect: /未完成.*视频或 GIF/ },
        { mode: 'add-gif-during-async', expect: /未完成.*视频或 GIF/ },
        { mode: 'add-gif-label-during-async', expect: /未完成.*视频或 GIF/ }
      ]) {
        await page.evaluate((m) => {
          document.querySelector('#inline-composer [data-testid="pollOptions"]')?.remove();
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          window.__mockX.setComposerText('inline', '保留这句文案');
          window.__mockX.setUploadMode(m);
        }, conflictMode.mode);
        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(pat8Path);
        await modal.cards.nth(7).waitFor({ state: 'visible' });
        await modal.submitBtn.click();

        await page.waitForFunction(() => {
          const st = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status');
          return st?.getAttribute('data-tone') === 'error';
        });
        assert.match(await modal.status.textContent(), conflictMode.expect, `Conflict mode ${conflictMode.mode}`);
        await modal.cancelBtn.click();
        await modal.host.waitFor({ state: 'detached' });
      }

      // 16f. Draft mutated WHILE await verifyAttachmentOrder() is STILL SUSPENDED on CDP gate -> must immediately stop BEFORE gate releases, and never turn into success after gate releases!
      const cdp16 = await page.context().newCDPSession(page);
      const isolatedIds16 = new Set();
      cdp16.on('Runtime.executionContextCreated', (evt) => {
        if (evt.context?.id && evt.context.auxData && evt.context.auxData.isDefault === false) {
          isolatedIds16.add(evt.context.id);
        }
      });
      await cdp16.send('Runtime.enable');
      let extId16 = null;
      for (const id of isolatedIds16) {
        const res = await cdp16.send('Runtime.evaluate', {
          contextId: id,
          expression: 'Boolean(globalThis.XSlicer)',
          returnByValue: true
        });
        if (res?.result?.value === true) {
          extId16 = id;
          break;
        }
      }
      assert.ok(extId16, 'Expected extension isolated context for 16f');

      try {
        await page.evaluate(() => {
          document.querySelector('#inline-composer [data-testid="pollOptions"]')?.remove();
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          window.__mockX.setComposerText('inline', '顺序核验期间必须保持的文案');
          window.__mockX.setUploadMode('real-x-square-thumbs');
          delete document.documentElement.dataset.xslicerBitmapAwait16;
        });

        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(bandsPath);
        await modal.cards.nth(7).waitFor({ state: 'visible' });

        await cdp16.send('Runtime.evaluate', {
          contextId: extId16,
          expression: `(() => {
            if (!globalThis.__origBitmap16) {
              globalThis.__origBitmap16 = globalThis.createImageBitmap.bind(globalThis);
            }
            let release;
            const gate = new Promise((r) => { release = r; });
            globalThis.__releaseBitmap16 = () => {
              release();
              globalThis.createImageBitmap = globalThis.__origBitmap16;
            };
            globalThis.createImageBitmap = (...args) => {
              document.documentElement.dataset.xslicerBitmapAwait16 = '1';
              return gate.then(() => globalThis.__origBitmap16(...args));
            };
          })()`
        });

        await modal.submitBtn.click();

        await page.waitForFunction(() => document.documentElement.dataset.xslicerBitmapAwait16 === '1');
        await waitForComposerFeedback(page, '#inline-composer', 'warning', /上传完成，共 8 张，请检查顺序后再发布/);
        // Mutate draft while verifyAttachmentOrder is STILL suspended, WITHOUT releasing the gate yet!
        await page.evaluate(() => window.__mockX.setComposerText('inline', '顺序核验挂起期间被破坏'));

        // Must immediately transition composer feedback to error while gate is still suspended
        await waitForComposerFeedback(page, '#inline-composer', 'error', /未完成.*原有文案.*发生变化或丢失/, 3000);

        // Now release late-arriving order check -> must remain error and never flip to success
        await cdp16.send('Runtime.evaluate', {
          contextId: extId16,
          expression: 'globalThis.__releaseBitmap16 && globalThis.__releaseBitmap16()'
        });
        await page.waitForTimeout(250);
        await waitForComposerFeedback(page, '#inline-composer', 'error', /未完成.*原有文案.*发生变化或丢失/, 2000);
        assert.equal((await page.evaluate(() => window.__mockX.getState())).publishClicks.length, 0);
      } finally {
        await cdp16.send('Runtime.evaluate', {
          contextId: extId16,
          expression: 'if (globalThis.__origBitmap16) { globalThis.createImageBitmap = globalThis.__origBitmap16; }'
        }).catch(() => {});
        await cdp16.detach();
      }

      // 16g. Upload error coexisting with active progressbar during normal upload -> must fail BEFORE progressbar clears, and stay error after toast vanishes & progressbar completes!
      await page.evaluate(() => {
        document.getElementById('toast-layer').innerHTML = '';
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.setComposerText('inline', '进度与报错共存时的保留文案');
        window.__mockX.setUploadMode('sibling-progressbar');
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(pat8Path);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.submitBtn.click();

      await page.waitForTimeout(150);
      assert.equal(await modal.status.getAttribute('data-tone'), 'busy');

      await page.evaluate(() => {
        window.__mockX.showGlobalToast('Upload failed: unable to upload media');
      });
      await page.waitForFunction(
        () => document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status')?.getAttribute('data-tone') === 'error',
        null,
        { timeout: 2000 }
      );
      assert.match(await modal.status.textContent(), /上传错误.*Upload failed/);

      // Auto-dismiss error toast AND finish progressbar -> must stay error and never flip to success!
      await page.evaluate(() => {
        document.getElementById('toast-layer').innerHTML = '';
        window.__mockX.clearSiblingProgressbar('inline');
      });
      await page.waitForTimeout(250);
      assert.equal(await modal.status.getAttribute('data-tone'), 'error');
      assert.equal(
        await page.locator('#inline-composer [data-testid="tweetTextarea_0"]').textContent(),
        '进度与报错共存时的保留文案'
      );
      assert.equal((await page.evaluate(() => window.__mockX.getState())).publishClicks.length, 0);
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // 16h. Upload error + progressbar WHILE verifyAttachmentOrder() is STILL SUSPENDED on CDP gate -> must fail BEFORE gate release & stay error after toast/progressbar clear and gate releases!
      const cdp16h = await page.context().newCDPSession(page);
      const isolatedIds16h = new Set();
      cdp16h.on('Runtime.executionContextCreated', (evt) => {
        if (evt.context?.id && evt.context.auxData && evt.context.auxData.isDefault === false) {
          isolatedIds16h.add(evt.context.id);
        }
      });
      await cdp16h.send('Runtime.enable');
      let extId16h = null;
      for (const id of isolatedIds16h) {
        const res = await cdp16h.send('Runtime.evaluate', {
          contextId: id,
          expression: 'Boolean(globalThis.XSlicer)',
          returnByValue: true
        });
        if (res?.result?.value === true) {
          extId16h = id;
          break;
        }
      }
      assert.ok(extId16h, 'Expected extension isolated context for 16h');

      try {
        await page.evaluate(() => {
          document.getElementById('toast-layer').innerHTML = '';
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          window.__mockX.setComposerText('inline', '顺序核验挂起与进度报错共存文案');
          window.__mockX.setUploadMode('real-x-square-thumbs');
          delete document.documentElement.dataset.xslicerBitmapAwait16h;
        });

        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(bandsPath);
        await modal.cards.nth(7).waitFor({ state: 'visible' });

        await cdp16h.send('Runtime.evaluate', {
          contextId: extId16h,
          expression: `(() => {
            if (!globalThis.__origBitmap16h) {
              globalThis.__origBitmap16h = globalThis.createImageBitmap.bind(globalThis);
            }
            let release;
            const gate = new Promise((r) => { release = r; });
            globalThis.__releaseBitmap16h = () => {
              release();
              globalThis.createImageBitmap = globalThis.__origBitmap16h;
            };
            globalThis.createImageBitmap = (...args) => {
              document.documentElement.dataset.xslicerBitmapAwait16h = '1';
              return gate.then(() => globalThis.__origBitmap16h(...args));
            };
          })()`
        });

        await modal.submitBtn.click();
        await page.waitForFunction(() => document.documentElement.dataset.xslicerBitmapAwait16h === '1');
        await waitForComposerFeedback(page, '#inline-composer', 'warning', /上传完成，共 8 张，请检查顺序后再发布/);

        await page.evaluate(() => {
          window.__mockX.addSiblingProgressbar('inline');
          window.__mockX.showGlobalToast('Upload failed: unable to upload media');
        });

        await waitForComposerFeedback(page, '#inline-composer', 'error', /上传错误.*Upload failed/, 3000);

        // Remove toast, clear progressbar, then release late-arriving verifyAttachmentOrder gate -> must stay error!
        await page.evaluate(() => {
          document.getElementById('toast-layer').innerHTML = '';
          window.__mockX.clearSiblingProgressbar('inline');
        });
        await cdp16h.send('Runtime.evaluate', {
          contextId: extId16h,
          expression: 'globalThis.__releaseBitmap16h && globalThis.__releaseBitmap16h()'
        });
        await page.waitForTimeout(250);
        await waitForComposerFeedback(page, '#inline-composer', 'error', /上传错误.*Upload failed/, 2000);
        assert.equal(
          await page.locator('#inline-composer [data-testid="tweetTextarea_0"]').textContent(),
          '顺序核验挂起与进度报错共存文案'
        );
        assert.equal(await page.locator('#inline-composer [data-testid="attachments"] img').count(), 8);
        assert.equal((await page.evaluate(() => window.__mockX.getState())).publishClicks.length, 0);
      } finally {
        await cdp16h.send('Runtime.evaluate', {
          contextId: extId16h,
          expression: 'if (globalThis.__origBitmap16h) { globalThis.createImageBitmap = globalThis.__origBitmap16h; }'
        }).catch(() => {});
        await cdp16h.detach();
      }
    });

    // 17. Phase 04: 120,000,000 exact boundary, 100MP (10,000x10,000) fine-line/text sample, no pre-shrink on 8000x1000 & 16000x2000, 800x4097 auto-scale, and zero-dim recovery
    await runCase('17_phase04_100mp_120m_exact_boundary_no_preshrink_and_zero_dim_recovery', async (page) => {
      // 17a. 12,000 x 10,000 (120,000,000 exact boundary) MUST pass & optimize to height 4096
      const exact120mPath = writeTempFile(tmpDir, 'exact-120m.png', createFastFineLineRgbPng(12000, 10000));
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      let modal = await getModalLocators(page);

      const preReq17 = allRemoteRequests.length;
      await modal.fileInput.setInputFiles(exact120mPath);
      await page.waitForFunction(
        () => {
          const host = document.querySelector('#x-slicer-modal-host');
          const st = host?.shadowRoot?.querySelector('.status');
          return (
            host?.shadowRoot?.querySelectorAll('.slice-card').length === 8 &&
            st?.getAttribute('data-tone') === 'success'
          );
        },
        null,
        { timeout: 90000 }
      );
      assert.equal(allRemoteRequests.length, preReq17, '120MP local processing must emit zero network requests');

      const info120m = await modal.cards.evaluateAll((cards) =>
        cards.map((c) => {
          const img = c.querySelector('img');
          return { name: c.getAttribute('data-slice-name'), w: img.naturalWidth, h: img.naturalHeight };
        })
      );
      assert.equal(info120m.length, 8);
      for (const s of info120m) {
        assert.equal(s.w, 614, `Expected Math.round(1500 * 4096 / 10000) = 614, got ${s.w}`);
        assert.equal(s.h, 4096);
      }
      assert.match(await modal.summary.textContent(), /12000 × 10000 px.*已等比缩小（缩放比例 41\.0%）/);

      // 17b. 10,000 x 10,000 (100MP standard image with fine lines & edge markers) + draft preservation -> submit
      const std100mPath = writeTempFile(tmpDir, 'std-100m-fine.png', createFastFineLineRgbPng(10000, 10000));
      await page.evaluate(() => window.__mockX.setComposerText('inline', '100MP 标准测试图保留草稿 #100MP'));
      await modal.fileInput.setInputFiles(std100mPath);
      await page.waitForFunction(
        () => {
          const host = document.querySelector('#x-slicer-modal-host');
          const sum = host?.shadowRoot?.querySelector('.summary');
          const st = host?.shadowRoot?.querySelector('.status');
          return (
            sum?.textContent?.includes('10000 × 10000') &&
            host?.shadowRoot?.querySelectorAll('.slice-card').length === 8 &&
            st?.getAttribute('data-tone') === 'success'
          );
        },
        null,
        { timeout: 90000 }
      );

      const info100m = await modal.cards.evaluateAll((cards) =>
        cards.map((c) => {
          const img = c.querySelector('img');
          const cv = document.createElement('canvas');
          cv.width = img.naturalWidth;
          cv.height = img.naturalHeight;
          const ctx = cv.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const left = Array.from(ctx.getImageData(0, Math.floor(cv.height / 2), 1, 1).data);
          const right = Array.from(ctx.getImageData(cv.width - 1, Math.floor(cv.height / 2), 1, 1).data);
          const top = Array.from(ctx.getImageData(Math.floor(cv.width / 2), 0, 1, 1).data);
          const bottom = Array.from(ctx.getImageData(Math.floor(cv.width / 2), cv.height - 1, 1, 1).data);
          return { w: img.naturalWidth, h: img.naturalHeight, left, right, top, bottom };
        })
      );
      for (let i = 0; i < 8; i++) {
        assert.equal(info100m[i].w, 512);
        assert.equal(info100m[i].h, 4096);
        assert.ok(info100m[i].top[2] > 180 && info100m[i].top[0] < 80, `Slice ${i + 1} top blue edge missing`);
        assert.ok(info100m[i].bottom[0] > 180 && info100m[i].bottom[1] > 170, `Slice ${i + 1} bottom yellow edge missing`);
      }
      assert.ok(info100m[0].left[0] > 180 && info100m[0].left[1] < 80, 'Slice 1 left red edge missing');
      assert.ok(info100m[7].right[1] > 180 && info100m[7].right[0] < 80, 'Slice 8 right green edge missing');

      await page.evaluate(() => window.__mockX.setUploadMode('real-x-carousel'));
      await modal.submitBtn.click();
      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布（已保留原有文案）/, 30000);
      const state100m = await page.evaluate(() => window.__mockX.getState());
      assert.equal(state100m.publishClicks.length, 0);
      assert.equal(state100m.submissions[0].count, 8);
      for (const f of state100m.submissions[0].files) {
        assert.ok(f.size > 0 && f.size <= 4_500_000, `Slice ${f.name} exceeded 4.5MB: ${f.size}`);
      }
      assert.equal(
        await page.locator('#inline-composer [data-testid="tweetTextarea_0"]').textContent(),
        '100MP 标准测试图保留草稿 #100MP'
      );

      // 17c. Ultra-wide 8000x1000 & 16000x2000 (slice long edge <= 4096) MUST NOT pre-shrink source width to 4096!
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.setUploadMode('immediate');
      });
      const wide8kPath = writeTempFile(tmpDir, 'wide-8000x1000.png', createFastFineLineRgbPng(8000, 1000));
      const wide16kPath = writeTempFile(tmpDir, 'wide-16000x2000.png', createFastFineLineRgbPng(16000, 2000));
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);

      for (const wp of [
        { filePath: wide8kPath, expectW: 1000, expectH: 1000, srcLabel: '8000 × 1000' },
        { filePath: wide16kPath, expectW: 2000, expectH: 2000, srcLabel: '16000 × 2000' }
      ]) {
        await modal.fileInput.setInputFiles(wp.filePath);
        await page.waitForFunction(
          (src) => {
            const host = document.querySelector('#x-slicer-modal-host');
            const sum = host?.shadowRoot?.querySelector('.summary');
            const st = host?.shadowRoot?.querySelector('.status');
            return sum?.textContent?.includes(src) && st?.getAttribute('data-tone') === 'success';
          },
          wp.srcLabel,
          { timeout: 60000 }
        );
        const sumText = await modal.summary.textContent();
        assert.match(sumText, /未缩小（保留原切片尺寸）.*PNG 无损编码/);
        const dims = await modal.cards.evaluateAll((cards) =>
          cards.map((c) => ({ w: c.querySelector('img').naturalWidth, h: c.querySelector('img').naturalHeight }))
        );
        assert.equal(dims.length, 8);
        for (const d of dims) {
          assert.equal(d.w, wp.expectW, `Must NOT pre-shrink ${wp.srcLabel} slice width`);
          assert.equal(d.h, wp.expectH);
        }
      }

      // 17d. 800x4097 (previously Phase 01 rejected) now auto-scales cleanly to 800/8=100 x 4096 without rounding scale to 100.0%
      const tall4097Path = writeTempFile(tmpDir, 'tall-4097.png', createSolidPng(800, 4097));
      await modal.fileInput.setInputFiles(tall4097Path);
      await page.waitForFunction(
        () => {
          const sum = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.summary');
          const st = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status');
          return sum?.textContent?.includes('800 × 4097') && st?.getAttribute('data-tone') === 'success';
        },
        null,
        { timeout: 30000 }
      );
      const sum4097 = await modal.summary.textContent();
      assert.match(sum4097, /已等比缩小（缩放比例 99\.97%）/);
      assert.ok(!sum4097.includes('100.0%'), `Slight downscale must not display 100.0%: ${sum4097}`);
      const dims4097 = await modal.cards.evaluateAll((cards) =>
        cards.map((c) => ({ w: c.querySelector('img').naturalWidth, h: c.querySelector('img').naturalHeight }))
      );
      for (const d of dims4097) {
        assert.equal(d.w, 100);
        assert.equal(d.h, 4096);
      }

      // 17d2. OS/2 BITMAPCOREHEADER (12-byte DIB header) valid small BMP must NOT be misparsed as >500M px
      const os2BmpPath = writeTempFile(tmpDir, 'os2-core-16x16.bmp', createOs2BmpBuffer(16, 16));
      await modal.fileInput.setInputFiles(os2BmpPath);
      await page.waitForFunction(
        () => {
          const sum = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.summary');
          const st = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status');
          return sum?.textContent?.includes('16 × 16 px') && st?.getAttribute('data-tone') === 'success';
        },
        null,
        { timeout: 15000 }
      );
      const os2Dims = await modal.cards.evaluateAll((cards) =>
        cards.map((c) => ({ w: c.querySelector('img').naturalWidth, h: c.querySelector('img').naturalHeight }))
      );
      assert.equal(os2Dims.length, 8);
      for (const d of os2Dims) {
        assert.equal(d.w, 2);
        assert.equal(d.h, 16);
      }

      // 17e. Scaling causes zero-width slice (12x12000 at 10 slices -> 1 * 4096/12000 = 0.34 -> 0 px) -> error, then recover to 2 slices!
      const narrowTallPath = writeTempFile(tmpDir, 'narrow-12x12000.png', createSolidPng(12, 12000));
      await modal.sliceCountInput.fill('10');
      await modal.fileInput.setInputFiles(narrowTallPath);
      await page.waitForFunction(() => {
        const st = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status');
        return st?.getAttribute('data-tone') === 'error';
      });
      assert.match(await modal.status.textContent(), /变为 0 px/);
      assert.equal(await modal.sliceBadge.textContent(), '缩放后零尺寸');
      assert.equal(await modal.submitBtn.isDisabled(), true);

      await modal.sliceCountInput.fill('2');
      await page.waitForFunction(
        () => {
          const host = document.querySelector('#x-slicer-modal-host');
          return (
            host?.shadowRoot?.querySelectorAll('.slice-card').length === 2 &&
            host?.shadowRoot?.querySelector('.status')?.getAttribute('data-tone') === 'success'
          );
        },
        null,
        { timeout: 30000 }
      );
      const recovered2 = await modal.cards.evaluateAll((cards) =>
        cards.map((c) => ({ w: c.querySelector('img').naturalWidth, h: c.querySelector('img').naturalHeight }))
      );
      assert.deepEqual(recovered2, [
        { w: 2, h: 4096 },
        { w: 2, h: 4096 }
      ]);
    });

    // 18. Phase 04: Real local GFX100RF 101.76MP landscape JPEG (8 slices & 20 slices + existing draft protection + read-only source check)
    await runCase('18_phase04_real_gfx100rf_sample_8_and_20_with_draft_protection', async (page) => {
      const localSamplesMd = path.join(ROOT_DIR, '.scratch/x-slicer/validation/local-samples.md');
      if (!fs.existsSync(localSamplesMd)) {
        process.stdout.write('[SKIP: local-samples.md not present] ');
        return;
      }
      const samplePath = parseLocalSamplePath(localSamplesMd);
      if (!fs.existsSync(samplePath)) {
        process.stdout.write('[SKIP: local read-only sample file not present] ');
        return;
      }
      const statBefore = fs.statSync(samplePath);

      // 18a. Default 8 slices on #inline-composer with existing rich draft text
      const draft8 = 'GFX100RF 沙地风景 8张草稿保留 #风景 @xuser';
      await page.evaluate((t) => {
        window.__mockX.setComposerText('inline', t);
        window.__mockX.setUploadMode('real-x-carousel');
      }, draft8);

      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      let modal = await getModalLocators(page);
      const reqCountBefore = allRemoteRequests.length;
      await modal.fileInput.setInputFiles(samplePath);

      await page.waitForFunction(
        () => {
          const host = document.querySelector('#x-slicer-modal-host');
          const st = host?.shadowRoot?.querySelector('.status');
          return (
            host?.shadowRoot?.querySelectorAll('.slice-card').length === 8 &&
            st?.getAttribute('data-tone') === 'success'
          );
        },
        null,
        { timeout: 90000 }
      );
      assert.equal(allRemoteRequests.length, reqCountBefore, 'GFX100RF slicing/preview must make 0 network requests');

      const summary8 = await modal.summary.textContent();
      assert.match(summary8, /11648 × 8736 px/);
      assert.match(summary8, /8 张/);

      const preview8 = await modal.cards.evaluateAll(async (cards) => {
        const out = [];
        for (const card of cards) {
          const img = card.querySelector('img');
          const buf = await (await fetch(img.src)).arrayBuffer();
          const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
          const sha256 = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
          out.push({
            name: card.getAttribute('data-slice-name'),
            w: img.naturalWidth,
            h: img.naturalHeight,
            size: buf.byteLength,
            sha256,
            meta: card.querySelector('.slice-meta').textContent
          });
        }
        return out;
      });
      assert.equal(preview8.length, 8);
      const widths8 = preview8.map((p) => p.w);
      assert.ok(Math.max(...widths8) - Math.min(...widths8) <= 1, `8-slice widths diff > 1: ${widths8}`);
      for (const p of preview8) {
        assert.ok(p.w >= 1 && p.h >= 1 && p.h === preview8[0].h, 'All 8 slices must share uniform height >= 1');
        assert.ok(Math.max(p.w, p.h) <= 4096, `Long edge exceeded 4096: ${p.w}x${p.h}`);
        assert.ok(p.size > 0 && p.size <= 4_500_000, `Slice ${p.name} exceeded 4.5MB: ${p.size}`);
      }

      await modal.submitBtn.click();
      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布（已保留原有文案）/, 30000);
      assert.equal(
        await page.locator('#inline-composer [data-testid="tweetTextarea_0"]').textContent(),
        draft8
      );
      const state8 = await page.evaluate(() => window.__mockX.getState());
      assert.equal(state8.publishClicks.length, 0);
      assert.equal(state8.submissions[0].count, 8);
      for (let i = 0; i < 8; i++) {
        assert.equal(preview8[i].size, state8.submissions[0].files[i].size);
        assert.equal(preview8[i].sha256, state8.submissions[0].files[i].sha256);
      }

      const sizes8 = preview8.map((p) => p.size);
      console.log(
        `\n[GFX100RF 8-slice] ${summary8} | min=${Math.min(...sizes8)} B, max=${Math.max(...sizes8)} B, total=${sizes8.reduce((a, b) => a + b, 0)} B`
      );

      // 18b. 20 slices on #modal-composer with existing rich draft text
      const draft20 = 'GFX100RF 沙地风景 20张保护文案\n第二行 #全景';
      await page.evaluate((t) => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.showModalComposer();
        window.__mockX.setComposerText('modal', t);
        window.__mockX.setUploadMode('real-x-carousel');
      }, draft20);
      await page.waitForSelector('#modal-composer button[data-x-slicer-entry="true"]');

      await page.locator('#modal-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.sliceCountInput.fill('20');
      await modal.fileInput.setInputFiles(samplePath);

      await page.waitForFunction(
        () => {
          const host = document.querySelector('#x-slicer-modal-host');
          const st = host?.shadowRoot?.querySelector('.status');
          return (
            host?.shadowRoot?.querySelectorAll('.slice-card').length === 20 &&
            st?.getAttribute('data-tone') === 'success'
          );
        },
        null,
        { timeout: 90000 }
      );

      const summary20 = await modal.summary.textContent();
      assert.match(summary20, /11648 × 8736 px/);
      assert.match(summary20, /20 张/);

      const preview20 = await modal.cards.evaluateAll(async (cards) => {
        const out = [];
        for (const card of cards) {
          const img = card.querySelector('img');
          const buf = await (await fetch(img.src)).arrayBuffer();
          const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
          const sha256 = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
          out.push({
            name: card.getAttribute('data-slice-name'),
            w: img.naturalWidth,
            h: img.naturalHeight,
            size: buf.byteLength,
            sha256
          });
        }
        return out;
      });
      assert.equal(preview20.length, 20);
      const widths20 = preview20.map((p) => p.w);
      assert.ok(Math.max(...widths20) - Math.min(...widths20) <= 1, `20-slice widths diff > 1: ${widths20}`);
      for (const p of preview20) {
        assert.ok(p.w >= 1 && p.h >= 1 && p.h === preview20[0].h, 'All 20 slices must share uniform height');
        assert.ok(Math.max(p.w, p.h) <= 4096, `Long edge exceeded 4096: ${p.w}x${p.h}`);
        assert.ok(p.size > 0 && p.size <= 4_500_000, `Slice ${p.name} exceeded 4.5MB: ${p.size}`);
      }

      await modal.submitBtn.click();
      await waitForComposerFeedback(page, '#modal-composer', 'success', /已填入 20 张切片，等待发布（已保留原有文案）/, 30000);
      assert.equal(
        await page.locator('#modal-composer [data-testid="tweetTextarea_0"]').textContent(),
        draft20
      );
      assert.equal(await page.locator('#inline-composer [data-testid="attachmentItem"]').count(), 0);
      const state20 = await page.evaluate(() => window.__mockX.getState());
      assert.equal(state20.publishClicks.length, 0);
      assert.equal(state20.submissions[1].composerId, 'modal');
      assert.equal(state20.submissions[1].count, 20);
      for (let i = 0; i < 20; i++) {
        assert.equal(preview20[i].size, state20.submissions[1].files[i].size);
        assert.equal(preview20[i].sha256, state20.submissions[1].files[i].sha256);
      }

      const sizes20 = preview20.map((p) => p.size);
      console.log(
        `[GFX100RF 20-slice] ${summary20} | min=${Math.min(...sizes20)} B, max=${Math.max(...sizes20)} B, total=${sizes20.reduce((a, b) => a + b, 0)} B`
      );

      const statAfter = fs.statSync(samplePath);
      assert.equal(statAfter.size, statBefore.size, 'Source GFX100RF file size must remain untouched');
      assert.equal(statAfter.mtimeMs, statBefore.mtimeMs, 'Source GFX100RF file mtime must remain untouched');
    });

    // 19. Phase 04: Transparency preservation under 0.85 scale decay, unscaled JPEG fallback, 0.85 scale decay from source, and 1024/0.80 floor failure
    await runCase('19_phase04_transparency_preservation_and_jpeg_waterfall_and_floor', async (page) => {
      // 19a. Semi-transparent noisy image -> PNG > 4.5MB at initialScale, MUST trigger 0.85 decay while staying PNG with alpha < 255
      const semiNoisyPath = writeTempFile(
        tmpDir,
        'semi-noisy-2400x4800.png',
        createSemiTransparentNoisyPng(2400, 4800, 0.65)
      );
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      let modal = await getModalLocators(page);
      await modal.sliceCountInput.fill('2');
      await modal.fileInput.setInputFiles(semiNoisyPath);
      await page.waitForFunction(
        () => {
          const host = document.querySelector('#x-slicer-modal-host');
          const st = host?.shadowRoot?.querySelector('.status');
          return (
            host?.shadowRoot?.querySelectorAll('.slice-card').length === 2 &&
            st?.getAttribute('data-tone') === 'success'
          );
        },
        null,
        { timeout: 60000 }
      );
      const semiSummary = await modal.summary.textContent();
      assert.match(semiSummary, /2 张 PNG 切片.*已等比缩小.*PNG 无损编码/);

      const semiSliceCheck = await modal.cards.evaluateAll(async (cards) => {
        const out = [];
        for (const c of cards) {
          const img = c.querySelector('img');
          const buf = await (await fetch(img.src)).arrayBuffer();
          const cv = document.createElement('canvas');
          cv.width = img.naturalWidth;
          cv.height = img.naturalHeight;
          const ctx = cv.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const data = ctx.getImageData(0, 0, cv.width, 64).data;
          let minAlpha = 255;
          for (let i = 3; i < data.length; i += 4) {
            if (data[i] < minAlpha) minAlpha = data[i];
          }
          out.push({
            name: c.getAttribute('data-slice-name'),
            w: img.naturalWidth,
            h: img.naturalHeight,
            bytes: buf.byteLength,
            minAlpha
          });
        }
        return out;
      });
      for (const s of semiSliceCheck) {
        assert.match(s.name, /\.png$/);
        assert.ok(s.h < 4096 && s.h >= 1024, `Expected 0.85 decay below 4096 while >= 1024, got ${s.h}`);
        assert.ok(s.bytes <= 4_500_000);
        assert.ok(s.minAlpha < 250, `Semi-transparent PNG alpha lost! minAlpha=${s.minAlpha}`);
      }

      // 19b. Opaque 8000x2000 noisy PNG (8 slices -> 1000x2000 <= 4096) -> PNG > 4.5MB, switches to JPEG WITHOUT shrinking dimensions!
      const noisy8kPath = writeTempFile(tmpDir, 'noisy-8000x2000.png', createFastTexturedRgbPng(8000, 2000, 1));
      await modal.sliceCountInput.fill('8');
      await modal.fileInput.setInputFiles(noisy8kPath);
      await page.waitForFunction(
        () => {
          const host = document.querySelector('#x-slicer-modal-host');
          const sum = host?.shadowRoot?.querySelector('.summary');
          const st = host?.shadowRoot?.querySelector('.status');
          return sum?.textContent?.includes('8000 × 2000') && st?.getAttribute('data-tone') === 'success';
        },
        null,
        { timeout: 60000 }
      );
      const noisy8kSum = await modal.summary.textContent();
      assert.match(noisy8kSum, /JPEG 切片.*未缩小（保留原切片尺寸）.*JPEG 有损编码（编码质量参数 0\.(90|85|80)）/);
      const noisy8kCards = await modal.cards.evaluateAll((cards) =>
        cards.map((c) => ({
          name: c.getAttribute('data-slice-name'),
          w: c.querySelector('img').naturalWidth,
          h: c.querySelector('img').naturalHeight
        }))
      );
      for (const c of noisy8kCards) {
        assert.match(c.name, /\.jpg$/);
        assert.equal(c.w, 1000);
        assert.equal(c.h, 2000);
      }

      // 19c. Extreme high-entropy opaque 4800x4200 (2 slices -> 2341x4096) where JPEG 0.80 > 4.5MB -> triggers 0.85 scale decay from source!
      const extremePath = writeTempFile(tmpDir, 'extreme-4800x4200.png', createFastTexturedRgbPng(4800, 4200, 1));
      await modal.sliceCountInput.fill('2');
      await modal.fileInput.setInputFiles(extremePath);
      await page.waitForFunction(
        () => {
          const host = document.querySelector('#x-slicer-modal-host');
          const sum = host?.shadowRoot?.querySelector('.summary');
          const st = host?.shadowRoot?.querySelector('.status');
          return sum?.textContent?.includes('4800 × 4200') && st?.getAttribute('data-tone') === 'success';
        },
        null,
        { timeout: 60000 }
      );
      const extremeSum = await modal.summary.textContent();
      assert.match(extremeSum, /JPEG 切片.*已等比缩小.*JPEG 有损编码（编码质量参数 0\.(90|85|80)）/);
      const extremeCards = await modal.cards.evaluateAll(async (cards) => {
        const out = [];
        for (const c of cards) {
          const img = c.querySelector('img');
          const buf = await (await fetch(img.src)).arrayBuffer();
          out.push({ w: img.naturalWidth, h: img.naturalHeight, bytes: buf.byteLength });
        }
        return out;
      });
      for (const c of extremeCards) {
        assert.ok(c.h < 4096 && c.h >= 1024, `Expected scale decay below 4096, got h=${c.h}`);
        assert.ok(c.bytes <= 4_500_000, `Slice bytes exceeded 4.5MB: ${c.bytes}`);
      }

      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // 19d. CDP deterministic check of 1024 floor, JPEG >= 0.80 floor, and <=1024 small-image no-shrink/no-upscale stop
      const cdp19 = await page.context().newCDPSession(page);
      const extIds19 = new Set();
      cdp19.on('Runtime.executionContextCreated', (evt) => {
        if (evt.context?.id && evt.context.auxData && evt.context.auxData.isDefault === false) {
          extIds19.add(evt.context.id);
        }
      });
      await cdp19.send('Runtime.enable');
      let extId19 = null;
      for (const id of extIds19) {
        const res = await cdp19.send('Runtime.evaluate', {
          contextId: id,
          expression: 'Boolean(globalThis.XSlicer)',
          returnByValue: true
        });
        if (res?.result?.value === true) {
          extId19 = id;
          break;
        }
      }
      assert.ok(extId19);

      try {
        await cdp19.send('Runtime.evaluate', {
          contextId: extId19,
          expression: `(() => {
            globalThis.__origToBlob19 = HTMLCanvasElement.prototype.toBlob;
            globalThis.__toBlobCalls19 = [];
            HTMLCanvasElement.prototype.toBlob = function(cb, type, quality) {
              globalThis.__toBlobCalls19.push({ w: this.width, h: this.height, type, quality: quality ?? null });
              const oversized = new Blob([new Uint8Array(4500001)], { type: type || 'image/png' });
              setTimeout(() => cb(oversized), 0);
            };
          })()`
        });

        const [jpeg2048B64, jpeg800B64] = await page.evaluate(() => {
          const makeJpeg = (w, h) => {
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#336699';
            ctx.fillRect(0, 0, w, h);
            return c.toDataURL('image/jpeg', 0.9).split(',')[1];
          };
          return [makeJpeg(2048, 2048), makeJpeg(800, 800)];
        });
        const img2048Path = writeTempFile(tmpDir, 'floor-2048.jpg', Buffer.from(jpeg2048B64, 'base64'));
        const img800Path = writeTempFile(tmpDir, 'small-floor-800.jpg', Buffer.from(jpeg800B64, 'base64'));

        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.sliceCountInput.fill('2');
        await modal.fileInput.setInputFiles(img2048Path);

        await page.waitForFunction(
          () => document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status')?.getAttribute('data-tone') === 'error',
          null,
          { timeout: 30000 }
        );
        assert.match(await modal.status.textContent(), /4,500,000 字节.*0\.80.*1024 px/);
        assert.equal(await modal.submitBtn.isDisabled(), true);

        const calls2048 = await cdp19.send('Runtime.evaluate', {
          contextId: extId19,
          expression: 'globalThis.__toBlobCalls19',
          returnByValue: true
        });
        const recorded2048 = calls2048.result.value;
        assert.ok(recorded2048.length > 0);
        for (const call of recorded2048) {
          assert.ok(call.h >= 1024, `Must NEVER shrink below 1024 floor, saw h=${call.h}`);
          if (call.type === 'image/jpeg') {
            assert.ok(call.quality >= 0.8, `Must NEVER use JPEG quality < 0.80, saw ${call.quality}`);
          }
        }
        assert.equal(recorded2048[recorded2048.length - 1].h, 1024, 'Last round must clamp cleanly at 1024 floor');

        // Originally small image (800x800, 2 slices -> 400x800, lMax=800 <= 1024) must NOT upscale or shrink further
        await cdp19.send('Runtime.evaluate', {
          contextId: extId19,
          expression: 'globalThis.__toBlobCalls19 = []'
        });
        await modal.fileInput.setInputFiles(img800Path);
        await page.waitForFunction(
          () => {
            const st = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status');
            return st?.getAttribute('data-tone') === 'error' && st.textContent.includes('不超过 1024 px');
          },
          null,
          { timeout: 15000 }
        );
        const calls800 = await cdp19.send('Runtime.evaluate', {
          contextId: extId19,
          expression: 'globalThis.__toBlobCalls19',
          returnByValue: true
        });
        for (const call of calls800.result.value) {
          assert.equal(call.h, 800, `Small image must stay at h=800 (no upscale, no further downscale), got ${call.h}`);
        }
        assert.equal((await page.evaluate(() => window.__mockX.getState())).submissions.length, 0);

        // 19e. PNG with > 4096 chunks before tRNS: must NOT misclassify as strictly opaque; falls back to pixel check and keeps PNG + alpha
        const manyChunkPngPath = writeTempFile(
          tmpDir,
          'many-chunks-trns-160x4120.png',
          createRgbPngWithManyChunksBeforeTrns(160, 4120, 4100)
        );
        await cdp19.send('Runtime.evaluate', {
          contextId: extId19,
          expression: `(() => {
            HTMLCanvasElement.prototype.toBlob = function(cb, type, quality) {
              if (type === 'image/png' && this.height === 4096) {
                const oversized = new Blob([new Uint8Array(4500001)], { type });
                setTimeout(() => cb(oversized), 0);
                return;
              }
              return globalThis.__origToBlob19.call(this, cb, type, quality);
            };
          })()`
        });
        await modal.sliceCountInput.fill('2');
        await modal.fileInput.setInputFiles(manyChunkPngPath);
        await page.waitForFunction(
          () => {
            const host = document.querySelector('#x-slicer-modal-host');
            const sum = host?.shadowRoot?.querySelector('.summary');
            const st = host?.shadowRoot?.querySelector('.status');
            return sum?.textContent?.includes('160 × 4120') && st?.getAttribute('data-tone') === 'success';
          },
          null,
          { timeout: 30000 }
        );
        const manyChunkSummary = await modal.summary.textContent();
        assert.match(manyChunkSummary, /2 张 PNG 切片.*已等比缩小.*PNG 无损编码/);
        const manyChunkAlpha = await modal.cards.evaluateAll((cards) =>
          cards.map((c) => {
            const img = c.querySelector('img');
            const cv = document.createElement('canvas');
            cv.width = img.naturalWidth;
            cv.height = img.naturalHeight;
            const ctx = cv.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const data = ctx.getImageData(0, 0, cv.width, 10).data;
            let minA = 255;
            for (let i = 3; i < data.length; i += 4) {
              if (data[i] < minA) minA = data[i];
            }
            return { name: c.getAttribute('data-slice-name'), h: img.naturalHeight, minA };
          })
        );
        for (const s of manyChunkAlpha) {
          assert.match(s.name, /\.png$/);
          assert.ok(s.h < 4096 && s.h >= 1024, `Expected 0.85 scale decay for >4096-chunk tRNS PNG, got ${s.h}`);
          assert.equal(s.minA, 0, 'tRNS transparency after >4096 chunks must be preserved as alpha=0');
        }

        // 19f. Deterministic JPEG waterfall (highest qualified tier, last-slice-only exceed, exact 4,500,000 vs 4,500,001, no tier mixing)
        await modal.cancelBtn.click();
        await modal.host.waitFor({ state: 'detached' });
        await cdp19.send('Runtime.evaluate', {
          contextId: extId19,
          expression: `(() => {
            globalThis.__waterfallScenario19 = 'pick-090-exact';
            globalThis.__waterfallCounts19 = {};
            HTMLCanvasElement.prototype.toBlob = function(cb, type, quality) {
              if (type === 'image/png') {
                const oversized = new Blob([new Uint8Array(4500001)], { type });
                setTimeout(() => cb(oversized), 0);
                return;
              }
              const qStr = (quality ?? 0).toFixed(2);
              const idx = (globalThis.__waterfallCounts19[qStr] = (globalThis.__waterfallCounts19[qStr] || 0) + 1);
              const sc = globalThis.__waterfallScenario19;
              let targetBytes = 40000;
              const tagByte = Math.round((quality ?? 0) * 100);
              if (idx === 4) {
                if (sc === 'pick-090-exact') {
                  targetBytes = qStr === '0.90' ? 4500000 : 40000;
                } else if (sc === 'last-slice-4500001-picks-085') {
                  targetBytes = qStr === '0.90' ? 4500001 : 4500000;
                } else if (sc === 'last-slice-085-fails-picks-080') {
                  targetBytes = (qStr === '0.90' || qStr === '0.85') ? 4500001 : 4500000;
                }
              }
              globalThis.__origToBlob19.call(this, async (realBlob) => {
                const realBytes = new Uint8Array(await realBlob.arrayBuffer());
                const padded = new Uint8Array(Math.max(targetBytes, realBytes.length));
                padded.set(realBytes, 0);
                padded[padded.length - 1] = tagByte;
                cb(new Blob([padded], { type: 'image/jpeg' }));
              }, 'image/jpeg', quality);
            };
          })()`
        });

        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.sliceCountInput.fill('4');
        const waterfallCases = [
          { scenario: 'pick-090-exact', fileName: 'wf-090.jpg', expectQuality: '0.90', expectTag: 90 },
          { scenario: 'last-slice-4500001-picks-085', fileName: 'wf-085.jpg', expectQuality: '0.85', expectTag: 85 },
          { scenario: 'last-slice-085-fails-picks-080', fileName: 'wf-080.jpg', expectQuality: '0.80', expectTag: 80 }
        ];
        for (const wc of waterfallCases) {
          const wfPath = writeTempFile(tmpDir, wc.fileName, Buffer.from(jpeg2048B64, 'base64'));
          await cdp19.send('Runtime.evaluate', {
            contextId: extId19,
            expression: `globalThis.__waterfallScenario19 = ${JSON.stringify(wc.scenario)}; globalThis.__waterfallCounts19 = {};`
          });
          await modal.fileInput.setInputFiles(wfPath);
          await page.waitForFunction(
            (q) => {
              const host = document.querySelector('#x-slicer-modal-host');
              const sum = host?.shadowRoot?.querySelector('.summary');
              const st = host?.shadowRoot?.querySelector('.status');
              return (
                host?.shadowRoot?.querySelectorAll('.slice-card').length === 4 &&
                st?.getAttribute('data-tone') === 'success' &&
                sum?.textContent?.includes(q)
              );
            },
            `编码质量参数 ${wc.expectQuality}`,
            { timeout: 30000 }
          );
          const cardsInfo = await modal.cards.evaluateAll(async (cards) =>
            Promise.all(
              cards.map(async (c) => {
                const img = c.querySelector('img');
                const bytes = new Uint8Array(await (await fetch(img.src)).arrayBuffer());
                return {
                  name: c.getAttribute('data-slice-name'),
                  size: bytes.byteLength,
                  tag: bytes[bytes.byteLength - 1],
                  w: img.naturalWidth,
                  h: img.naturalHeight
                };
              })
            )
          );
          assert.equal(cardsInfo.length, 4);
          assert.equal(cardsInfo[3].size, 4_500_000, `${wc.scenario}: slice 4 exact boundary must be 4,500,000`);
          for (const ci of cardsInfo) {
            assert.match(ci.name, /\.jpg$/);
            assert.ok(ci.w > 0 && ci.h > 0);
            assert.equal(ci.tag, wc.expectTag, `${wc.scenario}: mixed or wrong tier tag in ${ci.name}`);
          }
        }
      } finally {
        await cdp19.send('Runtime.evaluate', {
          contextId: extId19,
          expression: 'if (globalThis.__origToBlob19) { HTMLCanvasElement.prototype.toBlob = globalThis.__origToBlob19; }'
        }).catch(() => {});
        await cdp19.detach();
      }
    });

    // 20. Phase 04: Re-slicing from original (no cumulative lossy compression), mid-flight cancel/Escape/re-count abort & blob cleanup
    await runCase('20_phase04_reslice_from_original_no_cumulative_loss_and_cancel_cleanup', async (page) => {
      function assertBytesEqual(actualArr, expectedArr, label) {
        assert.equal(actualArr.length, expectedArr.length, `${label}: length mismatch`);
        if (Buffer.compare(Buffer.from(actualArr), Buffer.from(expectedArr)) !== 0) {
          throw new Error(`${label}: byte content mismatch despite equal length`);
        }
      }
      // Negative control: equal-length buffers with 1 byte differing MUST fail assertBytesEqual
      assert.throws(() => assertBytesEqual([1, 2, 3, 4], [1, 2, 9, 4], 'neg-control'), /byte content mismatch/);

      // 20a. Re-slice JPEG-optimized textured image 8 -> 12 -> 8 -> exact same dimensions, format, quality, and bytes!
      const texPath = writeTempFile(tmpDir, 'tex-3200x4200.png', createFastTexturedRgbPng(3200, 4200, 1));
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      let modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(texPath);
      await page.waitForFunction(
        () => {
          const host = document.querySelector('#x-slicer-modal-host');
          return (
            host?.shadowRoot?.querySelectorAll('.slice-card').length === 8 &&
            host?.shadowRoot?.querySelector('.status')?.getAttribute('data-tone') === 'success'
          );
        },
        null,
        { timeout: 60000 }
      );
      const firstSummary = await modal.summary.textContent();
      assert.match(firstSummary, /JPEG 有损编码/, '20a textured fixture must enter lossy JPEG optimization path');
      const firstSlices = await modal.cards.evaluateAll(async (cards) =>
        Promise.all(
          cards.map(async (c) => {
            const img = c.querySelector('img');
            const buf = await (await fetch(img.src)).arrayBuffer();
            return {
              w: img.naturalWidth,
              h: img.naturalHeight,
              bytes: Array.from(new Uint8Array(buf)),
              url: img.src
            };
          })
        )
      );

      await modal.sliceCountInput.fill('12');
      await page.waitForFunction(
        () => {
          const host = document.querySelector('#x-slicer-modal-host');
          return (
            host?.shadowRoot?.querySelectorAll('.slice-card').length === 12 &&
            host?.shadowRoot?.querySelector('.status')?.getAttribute('data-tone') === 'success'
          );
        },
        null,
        { timeout: 60000 }
      );

      // Old 8-slice URLs must be revoked
      for (const s of firstSlices) {
        const alive = await page.evaluate(async (u) => {
          try { await fetch(u); return true; } catch { return false; }
        }, s.url);
        assert.equal(alive, false, 'Old preview object URL must be revoked on slice count change');
      }

      await modal.sliceCountInput.fill('8');
      await page.waitForFunction(
        () => {
          const host = document.querySelector('#x-slicer-modal-host');
          return (
            host?.shadowRoot?.querySelectorAll('.slice-card').length === 8 &&
            host?.shadowRoot?.querySelector('.status')?.getAttribute('data-tone') === 'success'
          );
        },
        null,
        { timeout: 60000 }
      );
      const secondSummary = await modal.summary.textContent();
      const secondSlices = await modal.cards.evaluateAll(async (cards) =>
        Promise.all(
          cards.map(async (c) => {
            const img = c.querySelector('img');
            const buf = await (await fetch(img.src)).arrayBuffer();
            return { w: img.naturalWidth, h: img.naturalHeight, bytes: Array.from(new Uint8Array(buf)) };
          })
        )
      );
      assert.equal(secondSummary, firstSummary, 'Re-slicing 8 -> 12 -> 8 must yield identical optimization summary');
      for (let i = 0; i < 8; i++) {
        assert.equal(secondSlices[i].w, firstSlices[i].w);
        assert.equal(secondSlices[i].h, firstSlices[i].h);
        assertBytesEqual(
          secondSlices[i].bytes,
          firstSlices[i].bytes,
          `Slice ${i + 1} byte-for-byte identical after 8->12->8`
        );
      }
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // 20b. Mid-flight cancellation during busy canvas encoding via CDP gate: verifies serialized cleanup BEFORE callback release!
      const cdp20 = await page.context().newCDPSession(page);
      const extIds20 = new Set();
      cdp20.on('Runtime.executionContextCreated', (evt) => {
        if (evt.context?.id && evt.context.auxData && evt.context.auxData.isDefault === false) {
          extIds20.add(evt.context.id);
        }
      });
      await cdp20.send('Runtime.enable');
      let extId20 = null;
      for (const id of extIds20) {
        const res = await cdp20.send('Runtime.evaluate', {
          contextId: id,
          expression: 'Boolean(globalThis.XSlicer)',
          returnByValue: true
        });
        if (res?.result?.value === true) {
          extId20 = id;
          break;
        }
      }
      assert.ok(extId20);

      const largeFastPath = writeTempFile(tmpDir, 'cancel-4800x4800.png', createFastFineLineRgbPng(4800, 4800));
      try {
        await page.evaluate(() => window.__mockX.setComposerText('inline', '取消大图处理时必须保留的草稿'));

        // Track active & peak concurrent ImageBitmaps plus canvas cleanup
        await cdp20.send('Runtime.evaluate', {
          contextId: extId20,
          expression: `(() => {
            globalThis.__origToBlob20 = HTMLCanvasElement.prototype.toBlob;
            globalThis.__origBitmap20 = globalThis.createImageBitmap.bind(globalThis);
            globalThis.__activeBitmaps20 = 0;
            globalThis.__maxConcurrentBitmaps20 = 0;
            globalThis.createImageBitmap = async function(...args) {
              const bmp = await globalThis.__origBitmap20(...args);
              globalThis.__activeBitmaps20++;
              if (globalThis.__activeBitmaps20 > globalThis.__maxConcurrentBitmaps20) {
                globalThis.__maxConcurrentBitmaps20 = globalThis.__activeBitmaps20;
              }
              let closed = false;
              const origClose = bmp.close.bind(bmp);
              bmp.close = function() {
                if (!closed) {
                  closed = true;
                  globalThis.__activeBitmaps20 = Math.max(0, globalThis.__activeBitmaps20 - 1);
                }
                return origClose();
              };
              return bmp;
            };
          })()`
        });

        // Subtest 1: Click Cancel while slice 2 encoding is in-flight (real toBlob started, callback held)
        await cdp20.send('Runtime.evaluate', {
          contextId: extId20,
          expression: `(() => {
            globalThis.__toBlobGates20 = [];
            let count = 0;
            HTMLCanvasElement.prototype.toBlob = function(cb, type, quality) {
              count++;
              if (count === 2) {
                return globalThis.__origToBlob20.call(
                  this,
                  (realBlob) => {
                    globalThis.__toBlobGates20.push(() => cb(realBlob));
                  },
                  type,
                  quality
                );
              }
              return globalThis.__origToBlob20.call(this, cb, type, quality);
            };
          })()`
        });

        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(largeFastPath);

        const deadline = Date.now() + 10000;
        while (Date.now() < deadline) {
          const res = await cdp20.send('Runtime.evaluate', {
            contextId: extId20,
            expression: 'globalThis.__toBlobGates20.length',
            returnByValue: true
          });
          if (res.result.value >= 1) break;
          await page.waitForTimeout(20);
        }
        assert.equal(await modal.status.getAttribute('data-tone'), 'busy');
        assert.match(await modal.status.textContent(), /正在本地优化生成 8 张切片/);

        await modal.cancelBtn.click();
        await modal.host.waitFor({ state: 'detached' });

        // Verify source ImageBitmap was released IMMEDIATELY on cancel BEFORE gated callback fires!
        const cancelWaitEnd = Date.now() + 3000;
        let activeAfterCancel = -1;
        while (Date.now() < cancelWaitEnd) {
          const r = await cdp20.send('Runtime.evaluate', {
            contextId: extId20,
            expression: 'globalThis.__activeBitmaps20',
            returnByValue: true
          });
          activeAfterCancel = r.result.value;
          if (activeAfterCancel === 0) break;
          await page.waitForTimeout(10);
        }
        assert.equal(activeAfterCancel, 0, 'ImageBitmap must be closed immediately on cancel even while toBlob callback is pending');

        // Release old gated callback -> must NOT re-open or submit or alter draft
        await cdp20.send('Runtime.evaluate', {
          contextId: extId20,
          expression: 'for (const fn of globalThis.__toBlobGates20) fn();'
        });
        await page.waitForTimeout(100);
        assert.equal(await page.locator('#x-slicer-modal-host').count(), 0);
        assert.equal(
          await page.locator('#inline-composer [data-testid="tweetTextarea_0"]').textContent(),
          '取消大图处理时必须保留的草稿'
        );
        assert.equal((await page.evaluate(() => window.__mockX.getState())).submissions.length, 0);

        // Subtest 2: Change slice count 8 -> 4 while slice 2 encoding of 8-slice run is blocked -> serialized cleanup guarantees maxConcurrentBitmaps === 1!
        await cdp20.send('Runtime.evaluate', {
          contextId: extId20,
          expression: `(() => {
            globalThis.__activeBitmaps20 = 0;
            globalThis.__maxConcurrentBitmaps20 = 0;
            globalThis.__toBlobGates20 = [];
            let count = 0;
            HTMLCanvasElement.prototype.toBlob = function(cb, type, quality) {
              count++;
              if (count === 2) {
                return globalThis.__origToBlob20.call(
                  this,
                  (realBlob) => {
                    globalThis.__toBlobGates20.push(() => cb(realBlob));
                  },
                  type,
                  quality
                );
              }
              return globalThis.__origToBlob20.call(this, cb, type, quality);
            };
          })()`
        });

        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(largeFastPath);
        const deadline2 = Date.now() + 10000;
        while (Date.now() < deadline2) {
          const res = await cdp20.send('Runtime.evaluate', {
            contextId: extId20,
            expression: 'globalThis.__toBlobGates20.length',
            returnByValue: true
          });
          if (res.result.value >= 1) break;
          await page.waitForTimeout(20);
        }

        await modal.sliceCountInput.fill('4');
        await page.waitForFunction(
          () => {
            const host = document.querySelector('#x-slicer-modal-host');
            return (
              host?.shadowRoot?.querySelectorAll('.slice-card').length === 4 &&
              host?.shadowRoot?.querySelector('.status')?.getAttribute('data-tone') === 'success'
            );
          },
          null,
          { timeout: 30000 }
        );
        // Check concurrency BEFORE flushing __toBlobGates20!
        const bitmapStats = await cdp20.send('Runtime.evaluate', {
          contextId: extId20,
          expression: '({ active: globalThis.__activeBitmaps20, max: globalThis.__maxConcurrentBitmaps20 })',
          returnByValue: true
        });
        assert.equal(
          bitmapStats.result.value.max,
          1,
          `Must NEVER hold >1 concurrent ImageBitmap across slice-count switch (got max=${bitmapStats.result.value.max})`
        );
        assert.equal(bitmapStats.result.value.active, 0, 'All ImageBitmaps must be closed after 4-slice completion');

        await cdp20.send('Runtime.evaluate', {
          contextId: extId20,
          expression: 'for (const fn of globalThis.__toBlobGates20) fn();'
        });
        await page.waitForTimeout(100);
        assert.equal(await modal.cards.count(), 4);
        await modal.cancelBtn.click();
        await modal.host.waitFor({ state: 'detached' });

        // 20c. Pending createImageBitmap serialization:
        //      (1) 8 -> 4 -> 2 while first createImageBitmap is STILL pending -> inFlightDecodes NEVER exceeds 1, skips 4, closes late bitmap 8!
        //      (2) Close modal 1 while createImageBitmap is pending + immediately reopen modal 2 -> modal 2 waits for modal 1's decode+close!
        await cdp20.send('Runtime.evaluate', {
          contextId: extId20,
          expression: `(() => {
            HTMLCanvasElement.prototype.toBlob = globalThis.__origToBlob20;
            globalThis.__decodeGates20c = [];
            globalThis.__inFlightDecodes20c = 0;
            globalThis.__maxInFlightDecodes20c = 0;
            globalThis.__totalDecodeCalls20c = 0;
            globalThis.__activeBitmaps20c = 0;
            globalThis.__maxActiveBitmaps20c = 0;
            globalThis.__closedBitmaps20c = 0;
            globalThis.createImageBitmap = async function(...args) {
              globalThis.__totalDecodeCalls20c++;
              globalThis.__inFlightDecodes20c++;
              if (globalThis.__inFlightDecodes20c > globalThis.__maxInFlightDecodes20c) {
                globalThis.__maxInFlightDecodes20c = globalThis.__inFlightDecodes20c;
              }
              try {
                await new Promise((resolve) => globalThis.__decodeGates20c.push(resolve));
                const bmp = await globalThis.__origBitmap20(...args);
                globalThis.__activeBitmaps20c++;
                if (globalThis.__activeBitmaps20c > globalThis.__maxActiveBitmaps20c) {
                  globalThis.__maxActiveBitmaps20c = globalThis.__activeBitmaps20c;
                }
                let closed = false;
                const origClose = bmp.close.bind(bmp);
                bmp.close = function() {
                  if (!closed) {
                    closed = true;
                    globalThis.__activeBitmaps20c = Math.max(0, globalThis.__activeBitmaps20c - 1);
                    globalThis.__closedBitmaps20c++;
                  }
                  return origClose();
                };
                return bmp;
              } finally {
                globalThis.__inFlightDecodes20c = Math.max(0, globalThis.__inFlightDecodes20c - 1);
              }
            };
          })()`
        });

        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(largeFastPath);

        const waitForGateCount = async (targetCount) => {
          const end = Date.now() + 10000;
          while (Date.now() < end) {
            const r = await cdp20.send('Runtime.evaluate', {
              contextId: extId20,
              expression: 'globalThis.__decodeGates20c.length',
              returnByValue: true
            });
            if (r.result.value >= targetCount) return true;
            await page.waitForTimeout(15);
          }
          return false;
        };

        assert.equal(await waitForGateCount(1), true, 'First pending decode gate must open');

        // Switch 8 -> 4 -> 2 while gate 1 (count=8) is still pending
        await modal.sliceCountInput.fill('4');
        await page.waitForTimeout(40);
        await modal.sliceCountInput.fill('2');
        await page.waitForTimeout(60);

        const beforeReleaseStats = await cdp20.send('Runtime.evaluate', {
          contextId: extId20,
          expression: '({ total: globalThis.__totalDecodeCalls20c, inFlight: globalThis.__inFlightDecodes20c, maxInFlight: globalThis.__maxInFlightDecodes20c })',
          returnByValue: true
        });
        assert.equal(beforeReleaseStats.result.value.total, 1, 'Must NOT start 2nd decode while 1st decode is still pending');
        assert.equal(beforeReleaseStats.result.value.inFlight, 1);
        assert.equal(beforeReleaseStats.result.value.maxInFlight, 1);

        // Release gate 1 -> stale bitmap 8 must auto-close, count=4 skipped, only count=2 starts decode gate 2
        await cdp20.send('Runtime.evaluate', {
          contextId: extId20,
          expression: 'globalThis.__decodeGates20c[0]();'
        });
        assert.equal(await waitForGateCount(2), true, 'Latest decode (count=2) must start after stale decode 1 closes');
        await page.waitForTimeout(30);

        const midReleaseStats = await cdp20.send('Runtime.evaluate', {
          contextId: extId20,
          expression: '({ total: globalThis.__totalDecodeCalls20c, inFlight: globalThis.__inFlightDecodes20c, maxInFlight: globalThis.__maxInFlightDecodes20c, activeBitmaps: globalThis.__activeBitmaps20c, closedBitmaps: globalThis.__closedBitmaps20c })',
          returnByValue: true
        });
        assert.equal(midReleaseStats.result.value.total, 2, 'Intermediate cancelled count=4 must be skipped without decoding');
        assert.equal(midReleaseStats.result.value.inFlight, 1);
        assert.equal(midReleaseStats.result.value.maxInFlight, 1);
        assert.equal(midReleaseStats.result.value.activeBitmaps, 0, 'Aborted late bitmap 8 must close BEFORE decode 2 allocates');
        assert.equal(midReleaseStats.result.value.closedBitmaps, 1, 'Aborted late bitmap 8 must have close() called');

        // Release gate 2 -> 2 slices complete cleanly
        await cdp20.send('Runtime.evaluate', {
          contextId: extId20,
          expression: 'globalThis.__decodeGates20c[1]();'
        });
        await page.waitForFunction(
          () => {
            const host = document.querySelector('#x-slicer-modal-host');
            return (
              host?.shadowRoot?.querySelectorAll('.slice-card').length === 2 &&
              host?.shadowRoot?.querySelector('.status')?.getAttribute('data-tone') === 'success'
            );
          },
          null,
          { timeout: 30000 }
        );
        const endStats20c1 = await cdp20.send('Runtime.evaluate', {
          contextId: extId20,
          expression: '({ maxInFlight: globalThis.__maxInFlightDecodes20c, maxBitmaps: globalThis.__maxActiveBitmaps20c, activeBitmaps: globalThis.__activeBitmaps20c, closedBitmaps: globalThis.__closedBitmaps20c })',
          returnByValue: true
        });
        assert.equal(endStats20c1.result.value.maxInFlight, 1);
        assert.equal(endStats20c1.result.value.maxBitmaps, 1);
        assert.equal(endStats20c1.result.value.activeBitmaps, 0);
        assert.equal(endStats20c1.result.value.closedBitmaps, 2);
        await modal.cancelBtn.click();
        await modal.host.waitFor({ state: 'detached' });

        // 20c Subtest 2: Close Modal 1 while createImageBitmap is pending + immediately reopen Modal 2
        const largeFastPath2 = writeTempFile(tmpDir, 'cancel-reopen-4800x4800.png', createFastFineLineRgbPng(4800, 4800));
        await cdp20.send('Runtime.evaluate', {
          contextId: extId20,
          expression: `(() => {
            globalThis.__decodeGates20c = [];
            globalThis.__inFlightDecodes20c = 0;
            globalThis.__maxInFlightDecodes20c = 0;
            globalThis.__totalDecodeCalls20c = 0;
            globalThis.__activeBitmaps20c = 0;
            globalThis.__maxActiveBitmaps20c = 0;
            globalThis.__closedBitmaps20c = 0;
          })()`
        });
        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(largeFastPath);
        assert.equal(await waitForGateCount(1), true, 'Modal 1 decode gate must open');

        // Close Modal 1 -> must detach immediately while decode 1 is still pending
        await modal.cancelBtn.click();
        await modal.host.waitFor({ state: 'detached' });

        // Reopen Modal 2 immediately and select second file -> must NOT start decode 2 until decode 1 settles & closes
        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(largeFastPath2);
        await page.waitForTimeout(80);

        const crossModalBefore = await cdp20.send('Runtime.evaluate', {
          contextId: extId20,
          expression: '({ total: globalThis.__totalDecodeCalls20c, inFlight: globalThis.__inFlightDecodes20c, maxInFlight: globalThis.__maxInFlightDecodes20c })',
          returnByValue: true
        });
        assert.equal(crossModalBefore.result.value.total, 1, 'Reopened Modal 2 must wait for Modal 1 pending decode before starting createImageBitmap');
        assert.equal(crossModalBefore.result.value.inFlight, 1);
        assert.equal(crossModalBefore.result.value.maxInFlight, 1);

        await cdp20.send('Runtime.evaluate', {
          contextId: extId20,
          expression: 'globalThis.__decodeGates20c[0]();'
        });
        assert.equal(await waitForGateCount(2), true, 'Modal 2 decode must begin after Modal 1 pending decode closes');
        await cdp20.send('Runtime.evaluate', {
          contextId: extId20,
          expression: 'globalThis.__decodeGates20c[1]();'
        });
        await page.waitForFunction(
          () => {
            const host = document.querySelector('#x-slicer-modal-host');
            return (
              host?.shadowRoot?.querySelectorAll('.slice-card').length === 8 &&
              host?.shadowRoot?.querySelector('.status')?.getAttribute('data-tone') === 'success'
            );
          },
          null,
          { timeout: 30000 }
        );
        const crossModalEnd = await cdp20.send('Runtime.evaluate', {
          contextId: extId20,
          expression: '({ total: globalThis.__totalDecodeCalls20c, maxInFlight: globalThis.__maxInFlightDecodes20c, maxBitmaps: globalThis.__maxActiveBitmaps20c, activeBitmaps: globalThis.__activeBitmaps20c, closedBitmaps: globalThis.__closedBitmaps20c })',
          returnByValue: true
        });
        assert.equal(crossModalEnd.result.value.total, 2);
        assert.equal(crossModalEnd.result.value.maxInFlight, 1);
        assert.equal(crossModalEnd.result.value.maxBitmaps, 1);
        assert.equal(crossModalEnd.result.value.activeBitmaps, 0);
        assert.equal(crossModalEnd.result.value.closedBitmaps, 2);
      } finally {
        await cdp20.send('Runtime.evaluate', {
          contextId: extId20,
          expression:
            'if (globalThis.__origToBlob20) { HTMLCanvasElement.prototype.toBlob = globalThis.__origToBlob20; } if (globalThis.__origBitmap20) { globalThis.createImageBitmap = globalThis.__origBitmap20; }'
        }).catch(() => {});
        await cdp20.detach();
      }
    });

    // 21. Phase 04: Decoder failure & mid-slice encode failure keep UI recoverable, release resources, & keep draft untouched
    await runCase('21_phase04_decode_failure_recovery_and_draft_safety', async (page) => {
      const cdp21 = await page.context().newCDPSession(page);
      const extIds21 = new Set();
      cdp21.on('Runtime.executionContextCreated', (evt) => {
        if (evt.context?.id && evt.context.auxData && evt.context.auxData.isDefault === false) {
          extIds21.add(evt.context.id);
        }
      });
      await cdp21.send('Runtime.enable');
      let extId21 = null;
      for (const id of extIds21) {
        const res = await cdp21.send('Runtime.evaluate', {
          contextId: id,
          expression: 'Boolean(globalThis.XSlicer)',
          returnByValue: true
        });
        if (res?.result?.value === true) {
          extId21 = id;
          break;
        }
      }
      assert.ok(extId21);

      const validPath = writeTempFile(tmpDir, 'recover-160x80.png', createPatternPng(160, 80).buffer);
      const largeRecPath = writeTempFile(tmpDir, 'recover-4800x4800.png', createFastFineLineRgbPng(4800, 4800));
      try {
        await page.evaluate(() => window.__mockX.setComposerText('inline', '解码失败时不应丢失的草稿'));
        await cdp21.send('Runtime.evaluate', {
          contextId: extId21,
          expression: `(() => {
            globalThis.__origBitmap21 = globalThis.createImageBitmap.bind(globalThis);
            globalThis.__origToBlob21 = HTMLCanvasElement.prototype.toBlob;
            globalThis.__activeBitmaps21 = 0;
            globalThis.createImageBitmap = () => Promise.reject(new DOMException('Simulated OOM decode error', 'AbortError'));
          })()`
        });

        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        const modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(validPath);
        await page.waitForFunction(() => {
          const st = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status');
          return st?.getAttribute('data-tone') === 'error';
        });
        assert.match(await modal.status.textContent(), /无法解码|已损坏/);
        assert.equal(await modal.submitBtn.isDisabled(), true);
        assert.equal(await modal.fileInput.isDisabled(), false);

        // 21b. Mid-slice encoding failure (slice 3 returns null from canvas.toBlob after slices 1 & 2 succeeded)
        await cdp21.send('Runtime.evaluate', {
          contextId: extId21,
          expression: `(() => {
            globalThis.createImageBitmap = async function(...args) {
              const bmp = await globalThis.__origBitmap21(...args);
              globalThis.__activeBitmaps21++;
              const origClose = bmp.close.bind(bmp);
              let closed = false;
              bmp.close = () => {
                if (!closed) {
                  closed = true;
                  globalThis.__activeBitmaps21 = Math.max(0, globalThis.__activeBitmaps21 - 1);
                }
                return origClose();
              };
              return bmp;
            };
            let callCount = 0;
            HTMLCanvasElement.prototype.toBlob = function(cb, type, quality) {
              callCount++;
              if (callCount === 3) {
                setTimeout(() => cb(null), 0);
                return;
              }
              return globalThis.__origToBlob21.call(this, cb, type, quality);
            };
          })()`
        });

        await modal.fileInput.setInputFiles(largeRecPath);
        await page.waitForFunction(() => {
          const st = document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status');
          return st?.getAttribute('data-tone') === 'error';
        });
        assert.match(await modal.status.textContent(), /切片编码失败/);
        assert.equal(await modal.submitBtn.isDisabled(), true);
        assert.equal(await modal.cards.count(), 0);
        const activeAfterMidErr = await cdp21.send('Runtime.evaluate', {
          contextId: extId21,
          expression: 'globalThis.__activeBitmaps21',
          returnByValue: true
        });
        assert.equal(activeAfterMidErr.result.value, 0, 'Bitmap must be closed when mid-slice toBlob returns null');
        assert.equal((await page.evaluate(() => window.__mockX.getState())).submissions.length, 0);

        // Restore decoder and encoder and verify interface recovers cleanly with valid file
        await cdp21.send('Runtime.evaluate', {
          contextId: extId21,
          expression:
            'globalThis.createImageBitmap = globalThis.__origBitmap21; HTMLCanvasElement.prototype.toBlob = globalThis.__origToBlob21;'
        });
        await modal.fileInput.setInputFiles(validPath);
        await modal.cards.nth(7).waitFor({ state: 'visible' });
        assert.equal(await modal.submitBtn.isDisabled(), false);
        await modal.submitBtn.click();
        await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布（已保留原有文案）/);
        assert.equal(
          await page.locator('#inline-composer [data-testid="tweetTextarea_0"]').textContent(),
          '解码失败时不应丢失的草稿'
        );
      } finally {
        await cdp21.send('Runtime.evaluate', {
          contextId: extId21,
          expression:
            'if (globalThis.__origBitmap21) { globalThis.createImageBitmap = globalThis.__origBitmap21; } if (globalThis.__origToBlob21) { HTMLCanvasElement.prototype.toBlob = globalThis.__origToBlob21; }'
        }).catch(() => {});
        await cdp21.detach();
      }
    });

    // 22. Ticket 01: Accurate upload completion vs false-positive exclusion, unconfirmable states, non-blocking order verification, auto-close, focus restoration, and per-composer feedback lifecycle
    await runCase('22_ticket_01_completion_detection_autoclose_feedback_isolation_and_a11y', async (page) => {
      const bands8Path = writeTempFile(tmpDir, 't01-bands-8.png', createColorBandsPng(160, 80, 8, 255));

      // 22a. False-positive upload indicators (toolbar/sibling char counter progressbar, truly unlabeled 0-value/completed/280 progressbars without CharCount testid, hidden/aria-hidden progressbars, blank & benign [role="status"], and wrapped blank/ALT status in attachments)
      //      MUST NOT falsely block via hasExistingMedia or keep modal stuck in "uploading"; modal auto-closes promptly, focus restores, and manual publish stays untouched.
      await page.evaluate(() => {
        window.__mockX.setComposerText('inline', '误报进度条排除测试文案 #t01');
        window.__mockX.setUploadMode('immediate');
        window.__mockX.addCharacterCounterProgressbar('inline', { insideToolbar: true, max: 280, now: 12 });
        window.__mockX.addCharacterCounterProgressbar('inline', { insideToolbar: false, max: 280, now: 12, ariaLabel: null, testId: null });
        window.__mockX.addCharacterCounterProgressbar('inline', { insideToolbar: false, max: 100, now: 0, ariaLabel: null, testId: null });
        window.__mockX.addCharacterCounterProgressbar('inline', { insideToolbar: false, max: 100, now: 100, ariaLabel: null, testId: null });
        window.__mockX.addCharacterCounterProgressbar('inline', { insideToolbar: false, max: 280, now: 0, ariaLabel: null, testId: null });
        window.__mockX.addHiddenProgressbar('inline', 'display-none');
        window.__mockX.addHiddenProgressbar('inline', 'hidden');
        window.__mockX.addHiddenProgressbar('inline', 'aria-hidden');
        window.__mockX.addBlankStatusNode('inline', '');
        window.__mockX.addBlankStatusNode('inline', '草稿已保存');
        const att = document.querySelector('#inline-composer [data-testid="attachments"]');
        const emptyAttStatus = document.createElement('div');
        emptyAttStatus.setAttribute('data-testid', 'mockEmptyAttStatus');
        emptyAttStatus.setAttribute('role', 'status');
        att.appendChild(emptyAttStatus);
        const wrappedStatusShell = document.createElement('div');
        wrappedStatusShell.setAttribute('data-mock-control', '1');
        wrappedStatusShell.style.width = '100px';
        wrappedStatusShell.style.height = '16px';
        const innerBlankStatus = document.createElement('div');
        innerBlankStatus.setAttribute('role', 'status');
        wrappedStatusShell.appendChild(innerBlankStatus);
        att.appendChild(wrappedStatusShell);
        const wrappedAltShell = document.createElement('div');
        wrappedAltShell.setAttribute('data-mock-control', '1');
        wrappedAltShell.style.width = '48px';
        wrappedAltShell.style.height = '16px';
        const innerAltStatus = document.createElement('span');
        innerAltStatus.setAttribute('role', 'status');
        innerAltStatus.textContent = 'ALT';
        wrappedAltShell.appendChild(innerAltStatus);
        att.appendChild(wrappedAltShell);
      });

      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      let modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(bands8Path);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      const tStart22a = Date.now();
      await modal.submitBtn.click();
      const fb22a = await waitForComposerFeedback(
        page,
        '#inline-composer',
        'success',
        /已填入 8 张切片，等待发布（已保留原有文案）/,
        4000
      );
      assert.ok(Date.now() - tStart22a < 3000, 'Must auto-close promptly without timing out on false-positive indicators');
      assert.equal(fb22a.role, 'status');
      assert.equal(fb22a.ariaLive, 'polite');
      const focusAfter22a = await page.evaluate(() => ({
        inInlineEntry: document.activeElement === document.querySelector('#inline-composer button[data-x-slicer-entry="true"]'),
        modalCount: document.querySelectorAll('#x-slicer-modal-host').length,
        tbText: document.querySelector('#inline-composer [data-testid="tweetTextarea_0"]')?.textContent || ''
      }));
      assert.equal(focusAfter22a.modalCount, 0);
      assert.equal(focusAfter22a.inInlineEntry, true, 'Auto-close must restore keyboard focus to original composer entry button');
      assert.equal(focusAfter22a.tbText, '误报进度条排除测试文案 #t01', 'Feedback banner must never pollute composer textbox');

      // Non-upload [role="status"] badge ("ALT") inside ready attachment must NOT cause upload timeout
      await page.evaluate(() => {
        window.__mockX.clearMockControlNodes('inline');
        const att = document.querySelector('#inline-composer [data-testid="attachments"]');
        att.innerHTML = '';
        window.__mockX.setUploadMode('immediate');
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(bands8Path);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.submitBtn.click();
      await page.evaluate(() => {
        const firstSlot = document.querySelector('#inline-composer [data-testid="attachmentItem"]');
        if (firstSlot) {
          const altBadge = document.createElement('span');
          altBadge.setAttribute('role', 'status');
          altBadge.textContent = 'ALT';
          firstSlot.appendChild(altBadge);
        }
      });
      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布/, 4000);

      // 22b. Genuine sibling-progressbar AND byte-scale progressbars (both inside attachments now=500000 AND outside attachments now=0, no upload label)
      //      MUST block completion even alongside unrelated counter/status nodes, and complete immediately once removed;
      //      also verify intentional external focus is preserved on auto-close!
      await page.evaluate(() => {
        window.__mockX.clearMockControlNodes('inline');
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.setUploadMode('sibling-progressbar');
        window.__mockX.addCharacterCounterProgressbar('inline', { insideToolbar: true, max: 280, now: 12 });
        window.__mockX.addBlankStatusNode('inline', '');
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(bands8Path);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.submitBtn.click();
      await page.waitForTimeout(600);
      assert.equal(await modal.host.count(), 1, 'Genuine media progressbar must prevent premature auto-close');
      assert.equal(await modal.status.getAttribute('data-tone'), 'busy');

      // Focus external control intentionally while upload still in progress -> auto-close must preserve it!
      await page.evaluate(() => {
        let btn = document.getElementById('test-external-focus-btn');
        if (!btn) {
          btn = document.createElement('button');
          btn.id = 'test-external-focus-btn';
          btn.type = 'button';
          btn.textContent = '外部焦点控件';
          document.body.appendChild(btn);
        }
        btn.focus();
      });
      await page.evaluate(() => window.__mockX.clearSiblingProgressbar('inline'));
      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布/, 4000);
      const preservedExternalFocus = await page.evaluate(
        () => document.activeElement === document.getElementById('test-external-focus-btn')
      );
      assert.equal(preservedExternalFocus, true, 'Auto-close must preserve intentional external focus placed outside modal');
      await page.evaluate(() => document.getElementById('test-external-focus-btn')?.remove());

      // Byte-scale progressbar inside attachments without upload label text MUST block completion
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.setUploadMode('immediate');
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(bands8Path);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await page.evaluate(() => {
        const fi = document.querySelector('#inline-composer input[data-testid="fileInput"]');
        fi.addEventListener(
          'change',
          () => {
            setTimeout(() => {
              const att = document.querySelector('#inline-composer [data-testid="attachments"]');
              if (att) {
                const byteBar = document.createElement('div');
                byteBar.id = 'byte-scale-att-bar';
                byteBar.setAttribute('role', 'progressbar');
                byteBar.setAttribute('aria-valuemin', '0');
                byteBar.setAttribute('aria-valuemax', '1048576');
                byteBar.setAttribute('aria-valuenow', '500000');
                att.appendChild(byteBar);
              }
            }, 0);
          },
          { once: true }
        );
      });
      await modal.submitBtn.click();
      await page.waitForTimeout(600);
      assert.equal(await modal.host.count(), 1, 'Unlabeled byte-scale progressbar inside attachments must block completion');
      assert.equal(await modal.status.getAttribute('data-tone'), 'busy');
      await page.evaluate(() => document.getElementById('byte-scale-att-bar')?.remove());
      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布/, 4000);

      // Byte-scale progressbar OUTSIDE attachments at now=0 (no upload label, no semantic testid) MUST also block completion
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.setUploadMode('immediate');
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(bands8Path);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await page.evaluate(() => {
        const fi = document.querySelector('#inline-composer input[data-testid="fileInput"]');
        fi.addEventListener(
          'change',
          () => {
            setTimeout(() => {
              const comp = document.querySelector('#inline-composer');
              if (comp) {
                const extByteZeroBar = document.createElement('div');
                extByteZeroBar.id = 'byte-scale-ext-zero-bar';
                extByteZeroBar.setAttribute('role', 'progressbar');
                extByteZeroBar.setAttribute('aria-valuemin', '0');
                extByteZeroBar.setAttribute('aria-valuemax', '1048576');
                extByteZeroBar.setAttribute('aria-valuenow', '0');
                comp.appendChild(extByteZeroBar);
              }
            }, 0);
          },
          { once: true }
        );
      });
      await modal.submitBtn.click();
      await page.waitForTimeout(600);
      assert.equal(await modal.host.count(), 1, 'Outside-attachments unlabeled byte-scale now=0 progressbar must block completion');
      assert.equal(await modal.status.getAttribute('data-tone'), 'busy');
      await page.evaluate(() => document.getElementById('byte-scale-ext-zero-bar')?.remove());
      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布/, 4000);

      // 22c. Feedback lifecycle:
      //      (1) Same-slot re-upload transition invalidates success -> then clearing removes banner
      //      (2) Replaced fileInput change invalidates success -> then clearing removes banner
      //      (3) Attachment URL mutation invalidates to warning -> close button removes banner & restores focus
      await page.evaluate(() => {
        const firstSlot = document.querySelector('#inline-composer [data-testid="attachmentItem"]');
        firstSlot?.setAttribute('data-upload-status', 'uploading');
      });
      await waitForComposerFeedback(page, '#inline-composer', 'warning', /检测到发帖框附件已变化/, 4000);
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
      });
      await page.waitForFunction(() => document.querySelectorAll('#inline-composer [data-x-slicer-feedback="true"]').length === 0);

      // Submit fresh -> replace fileInput -> dispatch change on new fileInput -> invalidates -> clear removes banner
      await page.evaluate(() => {
        window.__mockX.setUploadMode('immediate');
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(bands8Path);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.submitBtn.click();
      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布/, 4000);

      await page.evaluate(() => {
        const oldInput = document.querySelector('#inline-composer input[data-testid="fileInput"]');
        window.__savedInput22c = oldInput;
        const newInput = oldInput.cloneNode(false);
        oldInput.replaceWith(newInput);
        newInput.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await waitForComposerFeedback(page, '#inline-composer', 'warning', /检测到发帖框有新的文件变动/, 4000);
      await page.evaluate(() => {
        const curInput = document.querySelector('#inline-composer input[data-testid="fileInput"]');
        if (window.__savedInput22c && curInput) {
          curInput.replaceWith(window.__savedInput22c);
        }
        delete window.__savedInput22c;
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
      });
      await page.waitForFunction(() => document.querySelectorAll('#inline-composer [data-x-slicer-feedback="true"]').length === 0);

      // Mutate URL -> close button removes banner & restores focus
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.fileInput.setInputFiles(bands8Path);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.submitBtn.click();
      await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布/, 4000);
      await page.evaluate(() => window.__mockX.mutateLastAttachmentSrc('inline'));
      await waitForComposerFeedback(page, '#inline-composer', 'warning', /检测到发帖框附件已变化/, 4000);

      const closeFeedbackFocus = await page.evaluate(() => {
        const host = document.querySelector('#inline-composer [data-x-slicer-feedback="true"]');
        const closeBtn = host?.shadowRoot?.querySelector('.feedback-close');
        closeBtn?.click();
        return {
          remaining: document.querySelectorAll('#inline-composer [data-x-slicer-feedback="true"]').length,
          focusedEntry: document.activeElement === document.querySelector('#inline-composer button[data-x-slicer-entry="true"]')
        };
      });
      assert.equal(closeFeedbackFocus.remaining, 0, 'Close button must remove feedback banner');
      assert.equal(closeFeedbackFocus.focusedEntry, true, 'Closing feedback banner must restore focus to composer entry button');

      // 22d. Unconfirmable upload states (opaque container, direct canvas, shadow host, & unknown status timeout) report 暂无法确认上传状态 as warning without faking success/failure or auto-closing
      const cdp22 = await page.context().newCDPSession(page);
      const extIds22 = new Set();
      cdp22.on('Runtime.executionContextCreated', (evt) => {
        if (evt.context?.id && evt.context.auxData && evt.context.auxData.isDefault === false) {
          extIds22.add(evt.context.id);
        }
      });
      await cdp22.send('Runtime.enable');
      let extId22 = null;
      for (const id of extIds22) {
        const res = await cdp22.send('Runtime.evaluate', {
          contextId: id,
          expression: 'Boolean(globalThis.XSlicer)',
          returnByValue: true
        });
        if (res?.result?.value === true) {
          extId22 = id;
          break;
        }
      }
      assert.ok(extId22, 'Expected extension isolated context for Test 22');

      try {
        await cdp22.send('Runtime.evaluate', {
          contextId: extId22,
          expression: `(() => {
            if (!globalThis.__origDateNow22) {
              globalThis.__origDateNow22 = Date.now.bind(Date);
            }
            globalThis.__nowOffset22 = 0;
            Date.now = () => globalThis.__origDateNow22() + globalThis.__nowOffset22;
          })()`
        });

        for (const unconfirmedMode of [
          'opaque-media-container',
          'opaque-media-canvas',
          'opaque-media-shadow',
          'opaque-media-status-shadow',
          'unknown-upload-status'
        ]) {
          await page.evaluate((mode) => {
            window.__mockX.clearMockControlNodes('inline');
            document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
            window.__mockX.setUploadMode(mode);
          }, unconfirmedMode);
          await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
          modal = await getModalLocators(page);
          await modal.fileInput.setInputFiles(bands8Path);
          await modal.cards.nth(7).waitFor({ state: 'visible' });
          await modal.submitBtn.click();

          await page.waitForTimeout(200);
          await cdp22.send('Runtime.evaluate', {
            contextId: extId22,
            expression: 'globalThis.__nowOffset22 += 31000'
          });
          await page.waitForFunction(
            () => document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status')?.getAttribute('data-tone') === 'warning',
            null,
            { timeout: 5000 }
          );
          assert.match(await modal.status.textContent(), /暂无法确认上传状态/, `${unconfirmedMode} must state unconfirmed status`);
          assert.equal(await modal.host.count(), 1, `${unconfirmedMode} must NOT auto-close`);
          assert.equal(await page.locator('#inline-composer [data-x-slicer-feedback="true"]').count(), 0);
          await modal.cancelBtn.click();
          await modal.host.waitFor({ state: 'detached' });

          if (unconfirmedMode === 'opaque-media-status-shadow') {
            await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
            const blockedModal = await getModalLocators(page);
            assert.match(
              await blockedModal.status.textContent(),
              /已有媒体附件/,
              'hasExistingMedia must catch Shadow DOM media wrapped inside blank [role="status"]'
            );
            await blockedModal.cancelBtn.click();
            await blockedModal.host.waitFor({ state: 'detached' });
          }
        }

        // 22e. Decoupled order verification under CDP createImageBitmap gate:
        //      (1) Auto-closes immediately with warning -> releases to success
        //      (2) Next submit -> self-excludes extension banner, auto-closes with warning -> mismatch transitions to role="alert" error (never says "上传失败")
        //      (3) Timed-out order verification while suspended (intact attachments) -> warning (order-unconfirmed)
        //      (4) Partial delete / re-upload / full clear / manual close WHILE suspended -> immediate revocation or cleanup; never emits "上传完成，共 0 张"
        //      (5) Target composer disappearance during suspended order check must clear banner & NEVER transfer to #inline-composer
        await cdp22.send('Runtime.evaluate', {
          contextId: extId22,
          expression: 'globalThis.__nowOffset22 = 0;'
        });

        const setupGate22 = async (datasetKey) => {
          await cdp22.send('Runtime.evaluate', {
            contextId: extId22,
            expression: `(() => {
              if (!globalThis.__origBitmap22) {
                globalThis.__origBitmap22 = globalThis.createImageBitmap.bind(globalThis);
              }
              let release;
              const gate = new Promise((r) => { release = r; });
              globalThis.__releaseBitmap22 = () => {
                release();
                globalThis.createImageBitmap = globalThis.__origBitmap22;
              };
              globalThis.createImageBitmap = (...args) => {
                document.documentElement.dataset[${JSON.stringify(datasetKey)}] = '1';
                return gate.then(() => globalThis.__origBitmap22(...args));
              };
            })()`
          });
        };

        // (1) Gated confirmable order: auto-close -> warning -> release -> success
        await page.evaluate(() => {
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          window.__mockX.setUploadMode('real-x-square-thumbs');
          delete document.documentElement.dataset.xslicerGate22a;
        });
        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(bands8Path);
        await modal.cards.nth(7).waitFor({ state: 'visible' });
        await setupGate22('xslicerGate22a');
        await modal.submitBtn.click();

        await page.waitForFunction(() => document.documentElement.dataset.xslicerGate22a === '1');
        const warn22e1 = await waitForComposerFeedback(
          page,
          '#inline-composer',
          'warning',
          /上传完成，共 8 张，请检查顺序后再发布/,
          3000
        );
        assert.equal(warn22e1.role, 'status');
        assert.equal(await page.locator('#x-slicer-modal-host').count(), 0, 'Modal must auto-close even while order check awaits bitmap');

        await cdp22.send('Runtime.evaluate', {
          contextId: extId22,
          expression: 'globalThis.__releaseBitmap22 && globalThis.__releaseBitmap22()'
        });
        await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布/, 4000);

        // Clearing all attachments removes the banner completely
        await page.evaluate(() => {
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        });
        await page.waitForFunction(() => document.querySelectorAll('#inline-composer [data-x-slicer-feedback="true"]').length === 0);

        // (2) Gated order mismatch -> transitions post-close warning -> role="alert" error (never says 上传失败)
        await page.evaluate(() => {
          window.__mockX.setUploadMode('real-x-square-thumbs-swap-first2');
          delete document.documentElement.dataset.xslicerGate22b;
        });
        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(bands8Path);
        await modal.cards.nth(7).waitFor({ state: 'visible' });
        await setupGate22('xslicerGate22b');
        await modal.submitBtn.click();

        await page.waitForFunction(() => document.documentElement.dataset.xslicerGate22b === '1');
        await waitForComposerFeedback(page, '#inline-composer', 'warning', /上传完成，共 8 张，请检查顺序后再发布/, 3000);
        await cdp22.send('Runtime.evaluate', {
          contextId: extId22,
          expression: 'globalThis.__releaseBitmap22 && globalThis.__releaseBitmap22()'
        });
        const err22e2 = await waitForComposerFeedback(
          page,
          '#inline-composer',
          'error',
          /上传已完成（共 8 张.*），但检测到切片顺序错误.*手动检查并调整附件顺序/,
          4000
        );
        assert.equal(err22e2.role, 'alert');
        assert.equal(err22e2.ariaLive, 'assertive');
        assert.ok(!err22e2.text.includes('上传失败'), `Order mismatch feedback must never say 上传失败: ${err22e2.text}`);

        // Self-exclusion + new submission token isolation: leaving the role="alert" mismatch banner mounted
        // when starting a new submission must clear stale banner cleanly & never trip upload-error detection!
        await page.evaluate(() => {
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          window.__mockX.setUploadMode('immediate');
        });
        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(bands8Path);
        await modal.cards.nth(7).waitFor({ state: 'visible' });
        await modal.submitBtn.click();
        const fresh22e = await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布/, 4000);
        assert.equal(fresh22e.hostCount, 1, 'Must reuse single composer feedback host without duplicating banners');

        // (3) Order verification timeout while suspended with intact attachments -> warning (order-unconfirmed), never "上传失败"
        await page.evaluate(() => {
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          window.__mockX.setUploadMode('real-x-square-thumbs');
          delete document.documentElement.dataset.xslicerGate22c;
        });
        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(bands8Path);
        await modal.cards.nth(7).waitFor({ state: 'visible' });
        await setupGate22('xslicerGate22c');
        await modal.submitBtn.click();

        await page.waitForFunction(() => document.documentElement.dataset.xslicerGate22c === '1');
        await waitForComposerFeedback(page, '#inline-composer', 'warning', /上传完成，共 8 张，请检查顺序后再发布/, 3000);
        await cdp22.send('Runtime.evaluate', {
          contextId: extId22,
          expression: 'globalThis.__nowOffset22 += 40000'
        });
        const timeoutUnconfirmed = await waitForComposerFeedback(
          page,
          '#inline-composer',
          'warning',
          /顺序核验等待超时，请手动确认/,
          4000
        );
        assert.equal(timeoutUnconfirmed.role, 'status');
        assert.ok(!timeoutUnconfirmed.text.includes('上传失败'));
        await cdp22.send('Runtime.evaluate', {
          contextId: extId22,
          expression: 'globalThis.__releaseBitmap22 && globalThis.__releaseBitmap22()'
        });
        await page.waitForTimeout(150);
        // Must stay warning (stale order promise settled after timeout must not overwrite)
        await waitForComposerFeedback(page, '#inline-composer', 'warning', /顺序核验等待超时，请手动确认/, 2000);

        // (4a) Partial deletion while order verification STILL suspended -> revokes "上传完成" immediately, then clearing removes banner
        await cdp22.send('Runtime.evaluate', { contextId: extId22, expression: 'globalThis.__nowOffset22 = 0;' });
        await page.evaluate(() => {
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          window.__mockX.setUploadMode('real-x-square-thumbs');
          delete document.documentElement.dataset.xslicerGate22p;
        });
        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(bands8Path);
        await modal.cards.nth(7).waitFor({ state: 'visible' });
        await setupGate22('xslicerGate22p');
        await modal.submitBtn.click();
        await page.waitForFunction(() => document.documentElement.dataset.xslicerGate22p === '1');
        await waitForComposerFeedback(page, '#inline-composer', 'warning', /上传完成，共 8 张，请检查顺序后再发布/, 3000);

        await page.evaluate(() => {
          document.querySelector('#inline-composer [data-testid="attachments"] .carousel-slot')?.remove();
        });
        await waitForComposerFeedback(page, '#inline-composer', 'warning', /检测到发帖框附件已变化（当前 7 项）/, 2500);
        await cdp22.send('Runtime.evaluate', {
          contextId: extId22,
          expression: 'globalThis.__releaseBitmap22 && globalThis.__releaseBitmap22()'
        });
        await page.waitForTimeout(150);
        await waitForComposerFeedback(page, '#inline-composer', 'warning', /检测到发帖框附件已变化（当前 7 项）/, 2000);
        await page.evaluate(() => {
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        });
        await page.waitForFunction(() => document.querySelectorAll('#inline-composer [data-x-slicer-feedback="true"]').length === 0);

        // (4b) Full clearing while order verification STILL suspended -> banner removed immediately, timeout/release NEVER emits "共 0 张"
        await page.evaluate(() => {
          window.__mockX.setUploadMode('real-x-square-thumbs');
          delete document.documentElement.dataset.xslicerGate22clr;
        });
        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(bands8Path);
        await modal.cards.nth(7).waitFor({ state: 'visible' });
        await setupGate22('xslicerGate22clr');
        await modal.submitBtn.click();
        await page.waitForFunction(() => document.documentElement.dataset.xslicerGate22clr === '1');
        await waitForComposerFeedback(page, '#inline-composer', 'warning', /上传完成，共 8 张，请检查顺序后再发布/, 3000);

        await page.evaluate(() => {
          const att = document.querySelector('#inline-composer [data-testid="attachments"]');
          att.innerHTML = '';
          const wrappedShell = document.createElement('div');
          wrappedShell.style.width = '100px';
          wrappedShell.style.height = '16px';
          const blankStatus = document.createElement('div');
          blankStatus.setAttribute('role', 'status');
          wrappedShell.appendChild(blankStatus);
          att.appendChild(wrappedShell);
        });
        await page.waitForFunction(() => document.querySelectorAll('#inline-composer [data-x-slicer-feedback="true"]').length === 0);
        await cdp22.send('Runtime.evaluate', { contextId: extId22, expression: 'globalThis.__nowOffset22 += 40000' });
        await cdp22.send('Runtime.evaluate', {
          contextId: extId22,
          expression: 'globalThis.__releaseBitmap22 && globalThis.__releaseBitmap22()'
        });
        await page.waitForTimeout(200);
        assert.equal(
          await page.locator('#inline-composer [data-x-slicer-feedback="true"]').count(),
          0,
          'Clearing attachments during suspended order check must never emit 0-slice completion banner even with wrapped blank status shell'
        );
        await page.evaluate(() => {
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        });

        // (4c) Same-slot re-uploading OR manual close while order verification suspended -> revokes / stays dismissed!
        await cdp22.send('Runtime.evaluate', { contextId: extId22, expression: 'globalThis.__nowOffset22 = 0;' });
        await page.evaluate(() => {
          window.__mockX.setUploadMode('real-x-square-thumbs');
          delete document.documentElement.dataset.xslicerGate22reup;
        });
        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(bands8Path);
        await modal.cards.nth(7).waitFor({ state: 'visible' });
        await setupGate22('xslicerGate22reup');
        await modal.submitBtn.click();
        await page.waitForFunction(() => document.documentElement.dataset.xslicerGate22reup === '1');
        await waitForComposerFeedback(page, '#inline-composer', 'warning', /上传完成，共 8 张，请检查顺序后再发布/, 3000);

        await page.evaluate(() => {
          document.querySelector('#inline-composer [data-testid="attachments"] .carousel-slot')?.setAttribute('data-upload-status', 'uploading');
        });
        await waitForComposerFeedback(page, '#inline-composer', 'warning', /检测到发帖框附件已变化/, 2500);
        await cdp22.send('Runtime.evaluate', {
          contextId: extId22,
          expression: 'globalThis.__releaseBitmap22 && globalThis.__releaseBitmap22()'
        });
        await page.waitForTimeout(150);
        await waitForComposerFeedback(page, '#inline-composer', 'warning', /检测到发帖框附件已变化/, 2000);

        // Manual close during suspended check must keep dismissed even after gate releases
        await page.evaluate(() => {
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          window.__mockX.setUploadMode('real-x-square-thumbs');
          delete document.documentElement.dataset.xslicerGate22dismiss;
        });
        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(bands8Path);
        await modal.cards.nth(7).waitFor({ state: 'visible' });
        await setupGate22('xslicerGate22dismiss');
        await modal.submitBtn.click();
        await page.waitForFunction(() => document.documentElement.dataset.xslicerGate22dismiss === '1');
        await waitForComposerFeedback(page, '#inline-composer', 'warning', /上传完成，共 8 张，请检查顺序后再发布/, 3000);
        await page.evaluate(() => {
          document.querySelector('#inline-composer [data-x-slicer-feedback="true"]')?.shadowRoot?.querySelector('.feedback-close')?.click();
        });
        assert.equal(await page.locator('#inline-composer [data-x-slicer-feedback="true"]').count(), 0);
        await cdp22.send('Runtime.evaluate', {
          contextId: extId22,
          expression: 'globalThis.__releaseBitmap22 && globalThis.__releaseBitmap22()'
        });
        await page.waitForTimeout(200);
        assert.equal(
          await page.locator('#inline-composer [data-x-slicer-feedback="true"]').count(),
          0,
          'Manually dismissed feedback banner must not reappear when background order check settles'
        );

        // (5) Target composer disappearance during suspended order check must clear banner & NEVER transfer to #inline-composer
        await page.evaluate(() => {
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          window.__mockX.showModalComposer();
          window.__mockX.setUploadMode('real-x-square-thumbs');
          delete document.documentElement.dataset.xslicerGate22d;
        });
        await page.waitForSelector('#modal-composer button[data-x-slicer-entry="true"]');
        await page.locator('#modal-composer button[data-x-slicer-entry="true"]').click();
        modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(bands8Path);
        await modal.cards.nth(7).waitFor({ state: 'visible' });
        await setupGate22('xslicerGate22d');
        await modal.submitBtn.click();

        await page.waitForFunction(() => document.documentElement.dataset.xslicerGate22d === '1');
        await waitForComposerFeedback(page, '#modal-composer', 'warning', /上传完成，共 8 张，请检查顺序后再发布/, 3000);
        assert.equal(await page.locator('#inline-composer [data-x-slicer-feedback="true"]').count(), 0);

        // Remove #modal-composer while order check still awaits bitmap
        await page.evaluate(() => document.getElementById('modal-composer')?.remove());
        await cdp22.send('Runtime.evaluate', {
          contextId: extId22,
          expression: 'globalThis.__releaseBitmap22 && globalThis.__releaseBitmap22()'
        });
        await page.waitForTimeout(200);
        assert.equal(
          await page.locator('#inline-composer [data-x-slicer-feedback="true"]').count(),
          0,
          'Target composer disappearance must NEVER transfer feedback banner to another composer'
        );
        assert.equal((await page.evaluate(() => window.__mockX.getState())).publishClicks.length, 0);
      } finally {
        await cdp22.send('Runtime.evaluate', {
          contextId: extId22,
          expression:
            'if (globalThis.__origDateNow22) { Date.now = globalThis.__origDateNow22; } if (globalThis.__origBitmap22) { globalThis.createImageBitmap = globalThis.__origBitmap22; }'
        }).catch(() => {});
        await cdp22.detach();
      }
    });

    // 23. Ticket 02: Single in-composer image capture (fileInput / drop / paste / background-image), full-res priority over thumbnail, 8 & 20 safe replace, cancel preservation
    await runCase('23_ticket_02_in_composer_capture_and_replace_flows', async (page) => {
      // 23a. FileInput user add (clears fileInput.value, localized 移除媒体, ALT btn, 0.5x downscaled thumbnail alongside 240x80 original)
      const pat240 = createPatternPng(240, 80);
      const pat240Path = writeTempFile(tmpDir, 't02-inline-240x80.png', pat240.buffer);
      await page.evaluate(() => {
        window.__mockX.setComposerText('inline', '单图框内切分保留文案 #T02');
        window.__mockX.configureUserSingleUpload('inline', {
          clearFileInputAfterSelect: true,
          previewScale: 0.5,
          removeAriaLabel: '移除媒体',
          withAltButton: true
        });
      });

      const inlineFileInput = page.locator('#inline-composer input[type="file"][data-testid="fileInput"]');
      await inlineFileInput.setInputFiles(pat240Path);
      await page.waitForSelector('#inline-composer [data-testid="attachmentItem"] img');

      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      let modal = await getModalLocators(page);
      await page.waitForFunction(
        () =>
          document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelectorAll('.slice-card').length === 8 &&
          document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status')?.getAttribute('data-tone') === 'success'
      );
      assert.equal(await modal.fileInput.isVisible(), false, 'Replace mode must not force re-picking local file');
      assert.equal(await modal.sourceBanner.isVisible(), true);
      assert.match(await modal.summary.textContent(), /240 × 80 px/, 'Must use captured 240x80 original, NOT 120x40 thumbnail');
      assert.equal(await modal.submitBtn.textContent(), '确认替换并填入发帖框');

      await page.evaluate(() => {
        window.__mockX.setUploadMode('real-x-carousel');
      });
      await modal.submitBtn.click();
      await waitForComposerFeedback(
        page,
        '#inline-composer',
        'success',
        /已填入 8 张切片（已替换原附件），等待发布（已保留原有文案）/,
        15000
      );

      const st23a = await page.evaluate(() => window.__mockX.getState());
      assert.equal(st23a.publishClicks.length, 0);
      assert.equal(st23a.submissions.length, 1);
      assert.equal(st23a.submissions[0].count, 8);
      assert.equal(await page.locator('#inline-composer [data-testid="attachments"] img').count(), 8);
      assert.equal(
        await page.locator('#inline-composer [data-testid="tweetTextarea_0"]').textContent(),
        '单图框内切分保留文案 #T02'
      );
      const out8Buffers = st23a.submissions[0].files.map((f) => Buffer.from(f.bytes));
      await reassembleAndVerifyPngSlices(out8Buffers, pat240.rgba, 240, 80, 8);

      // 23b. Drag & Drop capture + reslice 8 -> 20 with enforce20Cap + React fileInput replacement on remove
      const bands200 = createColorBandsPng(200, 60, 20, 255);
      await page.evaluate((bytes) => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        document.querySelector('#inline-composer [data-x-slicer-feedback="true"]')?.remove();
        window.__mockX.clearSubmissions();
        window.__mockX.setEnforce20Cap(true);
        window.__mockX.setUploadMode('real-x-carousel');
        window.__mockX.setComposerText('inline', '拖入原图切 20 张替换测试 #drop20');
        window.__mockX.configureUserSingleUpload('inline', {
          removeAriaLabel: 'Remove photo',
          replaceFileInputOnRemove: true
        });
        window.__mockX.triggerDropFileBytes('inline', bytes, 'dropped-200x60.png', 'image/png');
      }, Array.from(bands200));

      await page.waitForSelector('#inline-composer [data-testid="attachmentItem"] img');
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.sliceCountInput.fill('20');
      await page.waitForFunction(
        () =>
          document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelectorAll('.slice-card').length === 20 &&
          document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status')?.getAttribute('data-tone') === 'success'
      );
      await modal.submitBtn.click();
      await waitForComposerFeedback(
        page,
        '#inline-composer',
        'success',
        /已填入 20 张切片（已替换原附件），等待发布（已保留原有文案）/,
        20000
      );

      const st23b = await page.evaluate(() => window.__mockX.getState());
      assert.equal(st23b.publishClicks.length, 0);
      assert.equal(st23b.submissions.length, 1);
      assert.equal(st23b.submissions[0].count, 20);
      assert.equal(await page.locator('#inline-composer [data-testid="attachments"] img').count(), 20);
      assert.equal(
        await page.locator('#inline-composer [data-testid="tweetTextarea_0"]').textContent(),
        '拖入原图切 20 张替换测试 #drop20'
      );

      // 23c. Paste capture + background-image slot + cancel / Escape preservation -> re-open & replace
      const pat160 = createPatternPng(160, 80);
      await page.evaluate((bytes) => {
        window.__mockX.setEnforce20Cap(false);
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        document.querySelector('#inline-composer [data-x-slicer-feedback="true"]')?.remove();
        window.__mockX.clearSubmissions();
        window.__mockX.setUploadMode('immediate');
        window.__mockX.setComposerText('inline', '粘贴图片取消后原附件不变 #paste');
        window.__mockX.configureUserSingleUpload('inline', {
          useBackgroundImage: true,
          removeAriaLabel: '删除图片'
        });
        window.__mockX.triggerPasteFileBytes('inline', bytes, 'pasted-160x80.png', 'image/png');
      }, Array.from(pat160.buffer));

      await page.waitForSelector('#inline-composer [data-testid="attachmentItem"] .remove-media-btn');
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // Cancel must preserve original background-image slot & draft with zero submissions
      assert.equal(await page.locator('#inline-composer [data-testid="attachmentItem"]').count(), 1);
      assert.equal((await page.evaluate(() => window.__mockX.getState())).submissions.length, 0);
      assert.equal(
        await page.locator('#inline-composer [data-testid="tweetTextarea_0"]').textContent(),
        '粘贴图片取消后原附件不变 #paste'
      );

      // Re-open & confirm replace
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.submitBtn.click();
      await waitForComposerFeedback(
        page,
        '#inline-composer',
        'success',
        /已填入 8 张切片（已替换原附件），等待发布（已保留原有文案）/,
        10000
      );
      const st23c = await page.evaluate(() => window.__mockX.getState());
      assert.equal(st23c.submissions.length, 1);
      assert.equal(st23c.submissions[0].count, 8);
    });

    // 24. Ticket 02: Conflicts, unconfirmed/cropped/revoked/animated sources, pre- vs post-removal failure, session-only retained source, and multi-composer isolation
    await runCase('24_ticket_02_conflicts_failures_and_multi_composer_safety', async (page) => {
      const pat160 = createPatternPng(160, 80);

      // 24a. Source blocking checks (2 slots, GIF, poll, still-uploading, remote HTTPS, revoked blob, cropped mismatch, animated GIF)
      const resetInlineSingle = async (fn, arg) => {
        await page.evaluate(({ code, payload }) => {
          document.querySelector('#inline-composer [data-testid="pollOptions"]')?.remove();
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          document.querySelector('#inline-composer [data-x-slicer-feedback="true"]')?.remove();
          window.__mockX.enableComposerPostButton('inline');
          window.__mockX.setUploadMode('immediate');
          window.__mockX.clearSubmissions();
          window.__mockX.setComposerText('inline', '阻止情形保留文案与原附件');
          new Function('arg', code)(payload);
        }, { code: `(${fn.toString()})(arg)`, payload: arg });
      };

      // (i) Remote unconfirmed HTTPS URL without user capture
      allowCrossOriginMockUrls = true;
      try {
        await resetInlineSingle(() => {
          window.__mockX.addRemovableSingleSlot('inline', {
            customSrc: 'https://pbs.twimg.com/media/mock-slice-0.png',
            removeAriaLabel: 'Remove media'
          });
        });
        await page.waitForFunction(() => {
          const img = document.querySelector('#inline-composer [data-testid="attachmentItem"] img');
          return Boolean(img && img.complete && img.naturalWidth > 0);
        });
        await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
        let modal = await getModalLocators(page);
        assert.equal(await modal.status.getAttribute('data-tone'), 'error');
        assert.match(await modal.status.textContent(), /远程链接/);
        assert.equal(await page.locator('#inline-composer [data-testid="attachmentItem"]').count(), 1);
        await modal.cancelBtn.click();
        await modal.host.waitFor({ state: 'detached' });
      } finally {
        allowCrossOriginMockUrls = false;
      }

      // (ii) Uncaptured loaded data: URL and revoked/unreadable blob: URL without captured file -> both must reject without slicing
      const patDataUrl = `data:image/png;base64,${pat160.buffer.toString('base64')}`;
      await resetInlineSingle((src) => {
        window.__mockX.addRemovableSingleSlot('inline', {
          customSrc: src,
          removeAriaLabel: 'Remove media'
        });
      }, patDataUrl);
      await page.waitForFunction(() => {
        const img = document.querySelector('#inline-composer [data-testid="attachmentItem"] img');
        return Boolean(img && img.complete && img.naturalWidth === 160);
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      let modal = await getModalLocators(page);
      assert.equal(await modal.status.getAttribute('data-tone'), 'error');
      assert.match(await modal.status.textContent(), /未捕获到用户添加的完整原文件.*无法确认完整原图/);
      assert.equal(await page.locator('#inline-composer [data-testid="attachmentItem"]').count(), 1);
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      await resetInlineSingle(() => {
        window.__mockX.addRemovableSingleSlot('inline', {
          customSrc: 'blob:https://x.com/00000000-0000-0000-0000-000000000000',
          removeAriaLabel: 'Remove media'
        });
      });
      await page.waitForFunction(() => Boolean(document.querySelector('#inline-composer [data-testid="attachmentItem"] img')?.complete));
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      assert.equal(await modal.status.getAttribute('data-tone'), 'error');
      assert.match(await modal.status.textContent(), /加载失败|失效|无法读取/);
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // (iii) Multi-media conflict (2 removable slots)
      await resetInlineSingle(() => {
        const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        window.__mockX.addRemovableSingleSlot('inline', { customSrc: tinyPng });
        window.__mockX.addRemovableSingleSlot('inline', { customSrc: tinyPng });
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      assert.match(await modal.status.textContent(), /2 个媒体附件.*仅支持单张静态图片/);
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // (iv) Poll conflict alongside single image
      await resetInlineSingle((bytes) => {
        window.__mockX.configureUserSingleUpload('inline', { removeAriaLabel: 'Remove media' });
        window.__mockX.triggerDropFileBytes('inline', bytes, 'ok.png', 'image/png');
        window.__mockX.addPoll('inline');
      }, Array.from(pat160.buffer));
      await page.waitForSelector('#inline-composer [data-testid="attachmentItem"] img');
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      assert.match(await modal.status.textContent(), /投票/);
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // (v) Still uploading single image
      await resetInlineSingle((bytes) => {
        window.__mockX.configureUserSingleUpload('inline', { uploadAsyncMs: 2500 });
        window.__mockX.triggerDropFileBytes('inline', bytes, 'uploading.png', 'image/png');
      }, Array.from(pat160.buffer));
      await page.waitForSelector('#inline-composer [data-testid="attachmentItem"] img');
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      assert.match(await modal.status.textContent(), /等待图片上传完成/);
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // (vi) Cropped / aspect-mismatched image after capture -> rejected cleanly
      await resetInlineSingle((bytes) => {
        window.__mockX.configureUserSingleUpload('inline', { removeAriaLabel: 'Remove media' });
        window.__mockX.triggerDropFileBytes('inline', bytes, 'pat160x80.png', 'image/png');
      }, Array.from(pat160.buffer));
      await page.waitForSelector('#inline-composer [data-testid="attachmentItem"] img');
      await page.evaluate(() => window.__mockX.cropFirstAttachmentToSquare('inline'));
      await page.waitForFunction(() => {
        const img = document.querySelector('#inline-composer [data-testid="attachmentItem"] img');
        return Boolean(img && img.complete && img.naturalWidth === 40);
      });
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      assert.equal(await modal.status.getAttribute('data-tone'), 'error');
      assert.match(await modal.status.textContent(), /裁剪|不一致/);
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // (vii) Animated GIF dropped into composer -> modal opens and blocks on animation without touching original
      const animGif = createAnimatedGifBuffer();
      await resetInlineSingle((bytes) => {
        window.__mockX.configureUserSingleUpload('inline', { removeAriaLabel: 'Remove media' });
        window.__mockX.triggerDropFileBytes('inline', bytes, 'anim.gif', 'image/gif');
      }, Array.from(animGif));
      await page.waitForSelector('#inline-composer [data-testid="attachmentItem"] img');
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await page.waitForFunction(
        () => document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status')?.getAttribute('data-tone') === 'error'
      );
      assert.match(await modal.status.textContent(), /动态图片.*已保留发帖框原附件与文案/);
      assert.equal(await modal.submitBtn.isDisabled(), true);
      assert.equal(await page.locator('#inline-composer [data-testid="attachmentItem"]').count(), 1);
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // 24b. Pre-removal failure (untouched), delayed removal timeout (uncertain, retained download offered), and preview-time mutations
      await resetInlineSingle((bytes) => {
        window.__mockX.configureUserSingleUpload('inline', { removeDelayMs: 4500, removeAriaLabel: 'Remove media' });
        window.__mockX.triggerDropFileBytes('inline', bytes, 'delayed-remove.png', 'image/png');
      }, Array.from(pat160.buffer));
      await page.waitForSelector('#inline-composer [data-testid="attachmentItem"] img');
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.cards.nth(7).waitFor({ state: 'visible' });

      // Delayed remove (>4s wait window): must NOT claim original untouched and MUST retain source download!
      await modal.submitBtn.click();
      await page.waitForFunction(
        () => document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status')?.getAttribute('data-tone') === 'error',
        null,
        { timeout: 10000 }
      );
      const delayMsg = await modal.status.textContent();
      assert.match(delayMsg, /无法确认原附件是否已安全移除/);
      assert.ok(!delayMsg.includes('原附件与文案均保持不变'), `Post-click timeout must not promise original untouched: ${delayMsg}`);
      assert.equal(await modal.downloadRetainedBtn.isVisible(), true);
      await page.waitForSelector('#inline-composer [data-testid="attachmentItem"]', { state: 'detached', timeout: 3000 });
      assert.equal((await page.evaluate(() => window.__mockX.getState())).submissions.length, 0);
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // Source removed while modal preview open -> immediately stops & locks, no retained download needed (already invalid pre-click)
      await resetInlineSingle((bytes) => {
        window.__mockX.configureUserSingleUpload('inline', { removeAriaLabel: 'Remove media' });
        window.__mockX.triggerDropFileBytes('inline', bytes, 'source-removed-live.png', 'image/png');
      }, Array.from(pat160.buffer));
      await page.waitForSelector('#inline-composer [data-testid="attachmentItem"] img');
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await page.evaluate(() => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
      });
      await page.waitForFunction(
        () => document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status')?.getAttribute('data-tone') === 'error'
      );
      assert.match(await modal.status.textContent(), /原图片已被移除/);
      assert.equal(await modal.submitBtn.isDisabled(), true);
      assert.equal(await modal.downloadRetainedBtn.isVisible(), false);
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // Adding a poll while replace-mode preview modal is open -> locks & stops without removing original
      await resetInlineSingle((bytes) => {
        window.__mockX.configureUserSingleUpload('inline', { removeAriaLabel: 'Remove media' });
        window.__mockX.triggerDropFileBytes('inline', bytes, 'poll-live.png', 'image/png');
      }, Array.from(pat160.buffer));
      await page.waitForSelector('#inline-composer [data-testid="attachmentItem"] img');
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await page.evaluate(() => window.__mockX.addPoll('inline'));
      await page.waitForFunction(
        () => document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status')?.getAttribute('data-tone') === 'error'
      );
      assert.match(await modal.status.textContent(), /投票/);
      assert.equal(await modal.submitBtn.isDisabled(), true);
      assert.equal(await page.locator('#inline-composer [data-testid="attachmentItem"]').count(), 1);
      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // 24c. Post-removal failure (truncate-4) -> accurate removed state, count=4, intact partial slices & draft, session-only retained download, lock after failure, zero persistence
      await resetInlineSingle((bytes) => {
        window.__mockX.setUploadMode('truncate-4');
        window.__mockX.configureUserSingleUpload('inline', { removeAriaLabel: 'Remove media' });
        window.__mockX.triggerDropFileBytes('inline', bytes, 'post-remove-fail.png', 'image/png');
        window.__mockX.setComposerText('inline', '移除后部分失败保留文案与4切片 #partial');
      }, Array.from(pat160.buffer));
      await page.waitForSelector('#inline-composer [data-testid="attachmentItem"] img');
      await page.locator('#inline-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      await modal.submitBtn.click();

      await page.waitForFunction(
        () => document.querySelector('#x-slicer-modal-host')?.shadowRoot?.querySelector('.status')?.getAttribute('data-tone') === 'error',
        null,
        { timeout: 12000 }
      );
      const postFailText = await modal.status.textContent();
      assert.match(postFailText, /原附件已从发帖框移除.*当前发帖框内共有 4 张附件/);
      assert.match(postFailText, /不会自动重新上传原图.*不会清空现有附件或部分成功的切片/);
      assert.match(postFailText, /当前窗口会话内存中/);
      assert.equal(await page.locator('#inline-composer [data-testid="attachmentItem"]').count(), 4);
      assert.equal(
        await page.locator('#inline-composer [data-testid="tweetTextarea_0"]').textContent(),
        '移除后部分失败保留文案与4切片 #partial'
      );
      assert.equal(await modal.downloadRetainedBtn.isVisible(), true);
      assert.equal(await modal.submitBtn.isDisabled(), true);
      assert.equal(await modal.sliceCountInput.isDisabled(), true);

      // Verify retained download produces the exact original bytes
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        modal.downloadRetainedBtn.click()
      ]);
      const dlPath = await download.path();
      assert.ok(dlPath && Buffer.compare(fs.readFileSync(dlPath), pat160.buffer) === 0, 'Downloaded retained source must match original bytes');

      // Verify zero persistence across storage APIs
      const storageAudit = await page.evaluate(async () => {
        const dbs = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];
        return {
          localLen: localStorage.length,
          sessionLen: sessionStorage.length,
          dbCount: dbs.length
        };
      });
      assert.equal(storageAudit.localLen, 0);
      assert.equal(storageAudit.sessionLen, 0);
      assert.equal(storageAudit.dbCount, 0);

      await modal.cancelBtn.click();
      await modal.host.waitFor({ state: 'detached' });

      // 24d. Multi-composer isolation: both inline and modal have single dropped images; replace modal -> inline untouched
      const patModal = createPatternPng(192, 64);
      await page.evaluate(({ bInline, bModal }) => {
        document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
        window.__mockX.showModalComposer();
        window.__mockX.setUploadMode('immediate');
        window.__mockX.clearSubmissions();
        window.__mockX.setComposerText('inline', '内联单图保持不变 #inline');
        window.__mockX.setComposerText('modal', '弹窗单图待替换 #modal');
        window.__mockX.configureUserSingleUpload('inline', { removeAriaLabel: 'Remove media' });
        window.__mockX.configureUserSingleUpload('modal', { removeAriaLabel: 'Remove media' });
        window.__mockX.triggerDropFileBytes('inline', bInline, 'inline.png', 'image/png');
        window.__mockX.triggerDropFileBytes('modal', bModal, 'modal.png', 'image/png');
      }, { bInline: Array.from(pat160.buffer), bModal: Array.from(patModal.buffer) });

      await page.waitForSelector('#inline-composer [data-testid="attachmentItem"] img');
      await page.waitForSelector('#modal-composer [data-testid="attachmentItem"] img');
      await page.locator('#modal-composer button[data-x-slicer-entry="true"]').click();
      modal = await getModalLocators(page);
      await modal.cards.nth(7).waitFor({ state: 'visible' });
      assert.match(await modal.summary.textContent(), /192 × 64 px/, 'Modal composer must slice its own captured image, never inline image');
      await modal.submitBtn.click();

      await waitForComposerFeedback(
        page,
        '#modal-composer',
        'success',
        /已填入 8 张切片（已替换原附件），等待发布（已保留原有文案）/,
        10000
      );
      assert.equal(await page.locator('#modal-composer [data-testid="attachments"] img').count(), 8);
      assert.equal(await page.locator('#inline-composer [data-testid="attachments"] img').count(), 1, 'Inline single attachment must remain untouched');
      assert.equal(
        await page.locator('#inline-composer [data-testid="tweetTextarea_0"]').textContent(),
        '内联单图保持不变 #inline'
      );
      assert.equal(
        await page.locator('#modal-composer [data-testid="tweetTextarea_0"]').textContent(),
        '弹窗单图待替换 #modal'
      );
      assert.equal((await page.evaluate(() => window.__mockX.getState())).publishClicks.length, 0);
    });

    // 25. Split mode toggle (等分 / 自由) in both entries + extension-local memory of the last-used mode only
    await runCase('25_split_mode_toggle_and_split_mode_memory', async (page) => {
      try {
        const entryBtn = page.locator('#inline-composer button[data-x-slicer-entry="true"]');
        const expectMode = async (modal, mode) => {
          const other = mode === 'equal' ? 'free' : 'equal';
          assert.equal(await modal.splitModeBtn(mode).getAttribute('aria-pressed'), 'true', `${mode} should be active`);
          assert.equal(await modal.splitModeBtn(other).getAttribute('aria-pressed'), 'false', `${other} should be inactive`);
        };
        const expectNoPageStorage = async () => {
          assert.deepEqual(await auditPageStorage(page), { localLen: 0, sessionLen: 0, dbCount: 0 });
        };

        // 25a. First open defaults to 左右等分, both toggles available
        await entryBtn.click();
        let modal = await getModalLocators(page);
        assert.equal(await modal.splitModeBtn('equal').textContent(), '等分');
        assert.equal(await modal.splitModeBtn('free').textContent(), '自由');
        assert.equal(await modal.splitModeBtn('equal').isEnabled(), true);
        assert.equal(await modal.splitModeBtn('free').isEnabled(), true);
        await expectMode(modal, 'equal');
        assert.equal(await modal.sliceBadge.textContent(), '左右等分 1×8');

        // 25b. Free mode shows 等分张数 and 切片张数, and preview + fill still work (N = 5 here)
        await modal.splitModeBtn('free').click();
        await expectMode(modal, 'free');
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 8 张');

        const pat = createPatternPng(197, 80);
        const patPath = writeTempFile(tmpDir, 'split-mode-197x80.png', pat.buffer);
        await modal.fileInput.setInputFiles(patPath);
        await modal.cards.nth(7).waitFor({ state: 'visible' });
        assert.equal(await modal.cards.count(), 8);
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 8 张');

        await modal.presetBtn(5).click();
        await page.waitForFunction(() => {
          const sr = document.querySelector('#x-slicer-modal-host')?.shadowRoot;
          return sr?.querySelectorAll('.slice-card').length === 5 && sr.querySelector('.status')?.getAttribute('data-tone') === 'success';
        });
        assert.equal(await modal.sliceBadge.textContent(), '5 等分 · 合并后 5 张');
        await expectMode(modal, 'free');
        await modal.submitBtn.click();
        await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 5 张切片，等待发布/);
        const st25b = await page.evaluate(() => window.__mockX.getState());
        assert.equal(st25b.submissions.length, 1);
        assert.equal(st25b.submissions[0].count, 5);
        reassembleAndVerifyPngSlices(
          st25b.submissions[0].files.map((f) => Buffer.from(f.bytes)),
          pat.rgba,
          pat.width,
          pat.height
        );
        await expectNoPageStorage();
        assert.deepEqual(
          await evaluateInExtensionWorld(page, `chrome.storage.local.get(null).then((all) => Object.keys(all))`),
          ['splitMode'],
          'Extension storage must hold only the split mode'
        );

        // 25c. Reopen goes straight to 自由, but 等分张数 resets to 8 with no leftover image or slices
        await page.evaluate(() => {
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          document.querySelector('#inline-composer [data-x-slicer-feedback="true"]')?.remove();
          window.__mockX.clearSubmissions();
        });
        await entryBtn.click();
        modal = await getModalLocators(page);
        await expectMode(modal, 'free');
        assert.equal(await modal.sliceCountInput.inputValue(), '8');
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 8 张');
        assert.equal(await modal.cards.count(), 0);
        assert.equal(await modal.fileInput.inputValue(), '');
        assert.equal(await modal.submitBtn.isDisabled(), true);
        await modal.closeBtn.click();
        await modal.host.waitFor({ state: 'detached' });

        // 25d. Page reload keeps 自由 with a fresh 8 and nothing left over; in-composer entry fills in free mode too
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#inline-composer button[data-x-slicer-entry="true"]');
        await expectNoPageStorage();
        await entryBtn.click();
        modal = await getModalLocators(page);
        await expectMode(modal, 'free');
        assert.equal(await modal.sliceCountInput.inputValue(), '8');
        assert.equal(await modal.cards.count(), 0);
        assert.equal(await modal.fileInput.inputValue(), '');
        await modal.closeBtn.click();
        await modal.host.waitFor({ state: 'detached' });

        const pat240 = createPatternPng(240, 80);
        await page.evaluate((bytes) => {
          window.__mockX.setComposerText('inline', '自由切分框内切图保留文案 #free');
          window.__mockX.configureUserSingleUpload('inline', { removeAriaLabel: 'Remove media' });
          window.__mockX.triggerDropFileBytes('inline', bytes, 'free-240x80.png', 'image/png');
        }, Array.from(pat240.buffer));
        await page.waitForSelector('#inline-composer [data-testid="attachmentItem"] img');
        await entryBtn.click();
        modal = await getModalLocators(page);
        await expectMode(modal, 'free');
        assert.equal(await modal.sourceBanner.isVisible(), true);
        await page.waitForFunction(() => {
          const sr = document.querySelector('#x-slicer-modal-host')?.shadowRoot;
          return sr?.querySelectorAll('.slice-card').length === 8 && sr.querySelector('.status')?.getAttribute('data-tone') === 'success';
        });
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 8 张');
        assert.equal(await modal.splitModeBtn('equal').isEnabled(), true);
        await modal.submitBtn.click();
        await waitForComposerFeedback(
          page,
          '#inline-composer',
          'success',
          /已填入 8 张切片（已替换原附件），等待发布（已保留原有文案）/
        );
        const st25d = await page.evaluate(() => window.__mockX.getState());
        assert.equal(st25d.submissions.length, 1);
        assert.equal(st25d.submissions[0].count, 8);
        reassembleAndVerifyPngSlices(
          st25d.submissions[0].files.map((f) => Buffer.from(f.bytes)),
          pat240.rgba,
          pat240.width,
          pat240.height
        );

        // 25e. Switching back to 等分 (keyboard) is remembered across reopen and reload
        await page.evaluate(() => {
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          document.querySelector('#inline-composer [data-x-slicer-feedback="true"]')?.remove();
          window.__mockX.clearSubmissions();
        });
        await entryBtn.click();
        modal = await getModalLocators(page);
        await expectMode(modal, 'free');
        await modal.splitModeBtn('equal').focus();
        await page.keyboard.press('Enter');
        await expectMode(modal, 'equal');
        assert.equal(await modal.sliceBadge.textContent(), '左右等分 1×8');
        assert.equal(
          await page.evaluate(() => window.__mockX.getState().pageEscapeEvents),
          0,
          'Toggle keyboard use must not leak to the page'
        );
        await modal.closeBtn.click();
        await modal.host.waitFor({ state: 'detached' });

        await entryBtn.click();
        modal = await getModalLocators(page);
        await expectMode(modal, 'equal');
        await modal.closeBtn.click();
        await modal.host.waitFor({ state: 'detached' });

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#inline-composer button[data-x-slicer-entry="true"]');
        await entryBtn.click();
        modal = await getModalLocators(page);
        await expectMode(modal, 'equal');
        await modal.closeBtn.click();
        await modal.host.waitFor({ state: 'detached' });

        // 25f. A malformed stored mode falls back to 左右等分
        await evaluateInExtensionWorld(page, `chrome.storage.local.set({ splitMode: { mode: 'free' } })`);
        await entryBtn.click();
        modal = await getModalLocators(page);
        await expectMode(modal, 'equal');
        await modal.closeBtn.click();
        await modal.host.waitFor({ state: 'detached' });
        await expectNoPageStorage();
      } finally {
        // The profile is shared by all cases: never leak a remembered mode into later ones
        await evaluateInExtensionWorld(page, `chrome.storage.local.clear()`);
      }
    });

    // 26. 自由切分: merge dividers, re-slice from the original and fill M slices (ticket #3)
    await runCase('26_free_split_merge_dividers_reslice_from_original_and_fill', async (page) => {
      try {
        const entryBtn = page.locator('#inline-composer button[data-x-slicer-entry="true"]');
        const mergeBtn = (modal, left) => modal.host.getByRole('button', { name: `合并第 ${left} 张与第 ${left + 1} 张切片` });
        const allMergeBtns = (modal) => modal.host.getByRole('button', { name: /^合并第 \d+ 张与第 \d+ 张切片$/ });

        // 26a. One merge on 8 等分 of 197 px: 等分 regions 3+4 (x 49..98) become one slice cut fresh from the original
        const pat = createPatternPng(197, 80);
        const patPath = writeTempFile(tmpDir, 'free-merge-197x80.png', pat.buffer);
        await page.evaluate(() => window.__mockX.setComposerText('inline', '自由切分本地选图保留文案'));
        await entryBtn.click();
        let modal = await getModalLocators(page);
        await modal.splitModeBtn('free').click();
        await modal.fileInput.setInputFiles(patPath);
        await waitForSlicePreview(page, 8);
        assert.equal(await allMergeBtns(modal).count(), 7, '8 slices have 7 dividers');

        const mark = mergeBtn(modal, 3).locator('.divider-mark');
        assert.equal(await mark.textContent(), '×');
        assert.equal(await mark.evaluate((el) => getComputedStyle(el).opacity), '0', '× hidden until hover');
        await mergeBtn(modal, 3).hover();
        await page.waitForFunction(
          () =>
            getComputedStyle(
              document.querySelector('#x-slicer-modal-host').shadowRoot.querySelector('[aria-label="合并第 3 张与第 4 张切片"] .divider-mark')
            ).opacity === '1'
        );

        await mergeBtn(modal, 3).click();
        await waitForSlicePreview(page, 7);
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 7 张');
        assert.equal(await allMergeBtns(modal).count(), 6);

        await modal.submitBtn.click();
        await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 7 张切片，等待发布/);
        assert.equal(
          await page.locator('#inline-composer [data-testid="tweetTextarea_0"]').textContent(),
          '自由切分本地选图保留文案'
        );
        const st26a = await page.evaluate(() => window.__mockX.getState());
        assert.equal(st26a.submissions.length, 1);
        assert.equal(st26a.submissions[0].count, 7);
        assert.deepEqual(
          st26a.submissions[0].files.map((f) => f.name),
          ['slice-01.png', 'slice-02.png', 'slice-03.png', 'slice-04.png', 'slice-05.png', 'slice-06.png', 'slice-07.png']
        );
        reassembleAndVerifyPngSlices(
          st26a.submissions[0].files.map((f) => Buffer.from(f.bytes)),
          pat.rgba,
          pat.width,
          pat.height,
          [24, 25, 49, 25, 24, 25, 25]
        );

        // 26b. Consecutive merges: 两侧窄、中间宽 (等分 regions 2..7 in one slice), then down to the 2-slice minimum
        await page.evaluate(() => {
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          document.querySelector('#inline-composer [data-x-slicer-feedback="true"]')?.remove();
          window.__mockX.clearSubmissions();
          window.__mockX.setComposerText('inline', '');
        });
        await entryBtn.click();
        modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(patPath);
        await waitForSlicePreview(page, 8);
        for (let merges = 1; merges <= 5; merges++) {
          await mergeBtn(modal, 2).click();
          await waitForSlicePreview(page, 8 - merges);
        }
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 3 张');
        assert.match(await modal.summary.textContent(), /3 张 PNG 切片（8 等分 · 合并后 3 张/);
        reassembleAndVerifyPngSlices(await readPreviewPngs(modal), pat.rgba, pat.width, pat.height, [24, 148, 25]);

        await mergeBtn(modal, 1).click();
        await waitForSlicePreview(page, 2);
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 2 张');
        reassembleAndVerifyPngSlices(await readPreviewPngs(modal), pat.rgba, pat.width, pat.height, [172, 25]);
        assert.equal(await allMergeBtns(modal).count(), 1);
        assert.equal(await mergeBtn(modal, 1).isDisabled(), true, 'Only 2 slices left: × must be disabled');
        await mergeBtn(modal, 1).dispatchEvent('click');
        assert.equal(await modal.cards.count(), 2);
        assert.equal(await modal.status.getAttribute('data-tone'), 'success');
        assert.equal(await modal.submitBtn.isEnabled(), true);
        await modal.closeBtn.click();
        await modal.host.waitFor({ state: 'detached' });

        // 26c. While regenerating, the old preview stays greyed and fill is blocked; rapid merges submit only the last result
        await entryBtn.click();
        modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(patPath);
        await waitForSlicePreview(page, 8);
        const duringRegen = await page.evaluate(() => {
          const sr = document.querySelector('#x-slicer-modal-host').shadowRoot;
          const submit = sr.querySelector('[data-action="submit"]');
          sr.querySelector('[aria-label="合并第 1 张与第 2 张切片"]').click();
          const afterFirst = {
            cards: sr.querySelectorAll('.slice-card').length,
            stripBusy: sr.querySelector('.preview-strip').getAttribute('aria-busy'),
            cardOpacity: getComputedStyle(sr.querySelector('.slice-card')).opacity,
            tone: sr.querySelector('.status').getAttribute('data-tone'),
            submitDisabled: submit.disabled,
            badge: sr.querySelector('.slice-badge').textContent
          };
          const statusText = sr.querySelector('.status').textContent;
          // Second merge on the still-greyed preview (等分 regions 7+8), then try to fill the stale result
          sr.querySelector('[aria-label="合并第 7 张与第 8 张切片"]').click();
          submit.click();
          return { afterFirst, statusText, badgeAfterSecond: sr.querySelector('.slice-badge').textContent, submitDisabled: submit.disabled };
        });
        assert.deepEqual(duringRegen.afterFirst, {
          cards: 8,
          stripBusy: 'true',
          cardOpacity: '0.45',
          tone: 'busy',
          submitDisabled: true,
          badge: '8 等分 · 合并后 7 张'
        });
        assert.match(duringRegen.statusText, /重新生成 7 张切片/);
        assert.equal(duringRegen.badgeAfterSecond, '8 等分 · 合并后 6 张');
        assert.equal(duringRegen.submitDisabled, true);
        await waitForSlicePreview(page, 6);
        assert.equal(await modal.host.locator('.preview-strip').getAttribute('aria-busy'), null);
        assert.equal((await page.evaluate(() => window.__mockX.getState())).submissions.length, 0, 'Stale result must not be filled');
        await modal.submitBtn.click();
        await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 6 张切片，等待发布/);
        const st26c = await page.evaluate(() => window.__mockX.getState());
        assert.equal(st26c.submissions.length, 1);
        assert.equal(st26c.submissions[0].count, 6);
        reassembleAndVerifyPngSlices(
          st26c.submissions[0].files.map((f) => Buffer.from(f.bytes)),
          pat.rgba,
          pat.width,
          pat.height,
          [49, 24, 25, 25, 24, 50]
        );

        // 26d. Large semi-transparent 9000×1200: 8 等分 needs no scaling, but merging 等分 regions 3..6 (4500 px wide)
        // forces the whole group onto one shared scale and output height, within budget, keeping PNG alpha
        await page.evaluate(() => {
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          document.querySelector('#inline-composer [data-x-slicer-feedback="true"]')?.remove();
          window.__mockX.clearSubmissions();
        });
        const semiWidePath = writeTempFile(tmpDir, 'free-semi-9000x1200.png', createSemiTransparentPng(9000, 1200).buffer);
        await entryBtn.click();
        modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(semiWidePath);
        await waitForSlicePreview(page, 8, 60000);
        assert.match(await modal.summary.textContent(), /未缩小/);
        await page.evaluate(() => {
          const sr = document.querySelector('#x-slicer-modal-host').shadowRoot;
          for (const left of [3, 4, 5]) {
            sr.querySelector(`[aria-label="合并第 ${left} 张与第 ${left + 1} 张切片"]`).click();
          }
        });
        await waitForSlicePreview(page, 5, 90000);
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 5 张');
        assert.match(await modal.summary.textContent(), /5 张 PNG 切片（8 等分 · 合并后 5 张.*已等比缩小.*PNG 无损编码/);
        const wideSlices = await modal.cards.evaluateAll(async (cards) =>
          Promise.all(
            cards.map(async (c) => {
              const img = c.querySelector('img');
              const bytes = (await (await fetch(img.src)).arrayBuffer()).byteLength;
              const cv = document.createElement('canvas');
              cv.width = img.naturalWidth;
              cv.height = img.naturalHeight;
              const ctx = cv.getContext('2d');
              ctx.drawImage(img, 0, 0);
              const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
              let minAlpha = 255;
              for (let i = 3; i < data.length; i += 4) {
                if (data[i] < minAlpha) minAlpha = data[i];
              }
              return { name: c.getAttribute('data-slice-name'), w: img.naturalWidth, h: img.naturalHeight, bytes, minAlpha };
            })
          )
        );
        const regionWidths = [1125, 1125, 4500, 1125, 1125];
        const outH = wideSlices[0].h;
        assert.ok(outH < 1200, `Merged group should be scaled down, got height ${outH}`);
        wideSlices.forEach((s, i) => {
          assert.match(s.name, /\.png$/);
          assert.equal(s.h, outH, 'All slices share one output height');
          assert.ok(
            Math.abs(s.w - (regionWidths[i] * outH) / 1200) <= 3,
            `Slice ${i + 1} width ${s.w} not on the shared scale (${outH}/1200 of ${regionWidths[i]})`
          );
          assert.ok(Math.max(s.w, s.h) <= 4096, `Slice ${i + 1} long edge ${Math.max(s.w, s.h)} > 4096`);
          assert.ok(s.bytes <= 4_500_000, `Slice ${i + 1} is ${s.bytes} bytes`);
          assert.ok(s.minAlpha < 250, `Slice ${i + 1} lost transparency (minAlpha ${s.minAlpha})`);
        });
        await modal.closeBtn.click();
        await modal.host.waitFor({ state: 'detached' });

        // 26e. 框内切图: merged result replaces the composer image with M slices, keeps the draft, M-based feedback
        const pat240 = createPatternPng(240, 80);
        await page.evaluate((bytes) => {
          window.__mockX.setComposerText('inline', '自由切分合并保留文案 #merge');
          window.__mockX.configureUserSingleUpload('inline', { removeAriaLabel: 'Remove media' });
          window.__mockX.triggerDropFileBytes('inline', bytes, 'merge-240x80.png', 'image/png');
        }, Array.from(pat240.buffer));
        await page.waitForSelector('#inline-composer [data-testid="attachmentItem"] img');
        await entryBtn.click();
        modal = await getModalLocators(page);
        assert.equal(await modal.sourceBanner.isVisible(), true);
        await waitForSlicePreview(page, 8);
        await mergeBtn(modal, 1).click();
        await waitForSlicePreview(page, 7);
        await mergeBtn(modal, 6).click();
        await waitForSlicePreview(page, 6);
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 6 张');
        await modal.submitBtn.click();
        await waitForComposerFeedback(
          page,
          '#inline-composer',
          'success',
          /已填入 6 张切片（已替换原附件），等待发布（已保留原有文案）/
        );
        const st26e = await page.evaluate(() => window.__mockX.getState());
        assert.equal(st26e.submissions.length, 1);
        assert.equal(st26e.submissions[0].count, 6);
        assert.equal(await page.locator('#inline-composer [data-testid="attachmentItem"]').count(), 6);
        assert.equal(
          await page.locator('#inline-composer [data-testid="tweetTextarea_0"]').textContent(),
          '自由切分合并保留文案 #merge'
        );
        reassembleAndVerifyPngSlices(
          st26e.submissions[0].files.map((f) => Buffer.from(f.bytes)),
          pat240.rgba,
          pat240.width,
          pat240.height,
          [60, 30, 30, 30, 30, 60]
        );

        // 26f. 左右等分 has no 分割线 controls; switching modes after picking the image shows/hides them,
        // and merges never apply in 左右等分
        await page.evaluate(() => {
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          document.querySelector('#inline-composer [data-x-slicer-feedback="true"]')?.remove();
          window.__mockX.clearSubmissions();
          window.__mockX.setComposerText('inline', '');
        });
        await entryBtn.click();
        modal = await getModalLocators(page);
        await modal.splitModeBtn('equal').click();
        await modal.fileInput.setInputFiles(patPath);
        await waitForSlicePreview(page, 8);
        assert.equal(await allMergeBtns(modal).count(), 0, '左右等分 must not offer merging');
        await modal.splitModeBtn('free').click();
        assert.equal(await allMergeBtns(modal).count(), 7);
        await mergeBtn(modal, 4).click();
        await waitForSlicePreview(page, 7);
        const staleDividersEnabled = await page.evaluate(() => {
          const sr = document.querySelector('#x-slicer-modal-host').shadowRoot;
          sr.querySelector('[data-action="split-mode"][data-split-mode="equal"]').click();
          return Array.from(sr.querySelectorAll('.slice-divider')).filter((d) => !d.disabled).length;
        });
        assert.equal(staleDividersEnabled, 0, 'Greyed 自由 preview must not offer merging after switching to 左右等分');
        await waitForSlicePreview(page, 8);
        assert.equal(await modal.sliceBadge.textContent(), '左右等分 1×8');
        assert.equal(await allMergeBtns(modal).count(), 0);
        reassembleAndVerifyPngSlices(await readPreviewPngs(modal), pat.rgba, pat.width, pat.height);
        await modal.submitBtn.click();
        await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 8 张切片，等待发布/);

        // 26g. A merge that makes the group unscalable (28000×3 shrinks to 0 px high) shows the error;
        // switching to 左右等分 recovers with a valid badge and count, not a stuck error state
        await page.evaluate(() => {
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          document.querySelector('#inline-composer [data-x-slicer-feedback="true"]')?.remove();
          window.__mockX.clearSubmissions();
        });
        const stripPath = writeTempFile(tmpDir, 'free-strip-32000x3.png', createSolidPng(32000, 3, [30, 140, 200, 255]));
        await entryBtn.click();
        modal = await getModalLocators(page);
        await modal.splitModeBtn('free').click();
        await modal.fileInput.setInputFiles(stripPath);
        await waitForSlicePreview(page, 8);
        await page.evaluate(() => {
          const sr = document.querySelector('#x-slicer-modal-host').shadowRoot;
          for (let left = 1; left <= 6; left++) {
            sr.querySelector(`[aria-label="合并第 ${left} 张与第 ${left + 1} 张切片"]`).click();
          }
        });
        await page.waitForFunction(
          () => document.querySelector('#x-slicer-modal-host').shadowRoot.querySelector('.status').getAttribute('data-tone') === 'error'
        );
        assert.equal(await modal.cards.count(), 0);
        assert.equal(await modal.sliceBadge.textContent(), '缩放后零尺寸');
        await modal.splitModeBtn('equal').click();
        await waitForSlicePreview(page, 8);
        assert.equal(await modal.sliceBadge.textContent(), '左右等分 1×8');
        assert.equal(await modal.sliceCountInput.getAttribute('aria-invalid'), 'false');
        await modal.closeBtn.click();
        await modal.host.waitFor({ state: 'detached' });

        // 26h. If the 原图 becomes unreadable mid-session, the failed merge drops the image and its merges
        const gonePath = writeTempFile(tmpDir, 'free-gone-197x80.png', pat.buffer);
        await entryBtn.click();
        modal = await getModalLocators(page);
        await modal.splitModeBtn('free').click();
        await modal.fileInput.setInputFiles(gonePath);
        await waitForSlicePreview(page, 8);
        fs.unlinkSync(gonePath);
        await mergeBtn(modal, 1).click();
        await page.waitForFunction(
          () => document.querySelector('#x-slicer-modal-host').shadowRoot.querySelector('.status').getAttribute('data-tone') === 'error'
        );
        assert.equal(await modal.cards.count(), 0);
        assert.equal(await modal.fileInput.inputValue(), '');
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 8 张');
        await modal.closeBtn.click();
        await modal.host.waitFor({ state: 'detached' });
      } finally {
        // 自由 is remembered in the shared profile: never leak it into later cases
        await evaluateInExtensionWorld(page, `chrome.storage.local.clear()`);
      }
    });

    // 27. Ticket #4: 拆回 along an original 分割线, 清除合并, and the merge lifecycle across N / mode / 原图 / reopen
    await runCase('27_free_split_unmerge_clear_merges_and_merge_lifecycle', async (page) => {
      try {
        const entryBtn = page.locator('#inline-composer button[data-x-slicer-entry="true"]');
        const mergeBtn = (modal, left) => modal.host.getByRole('button', { name: `合并第 ${left} 张与第 ${left + 1} 张切片` });
        const unmergeBtns = (modal) => modal.host.getByRole('button', { name: /^沿第 \d+ 条原有分割线拆回第 \d+ 张切片$/ });
        const unmergeBtn = (modal, slice, nth) =>
          modal.host.getByRole('button', { name: `沿第 ${nth} 条原有分割线拆回第 ${slice} 张切片` });
        // 8 等分 of 197 px puts 分割线 1..7 at x = 24, 49, 73, 98, 123, 147, 172
        const pat = createPatternPng(197, 80);
        const patPath = writeTempFile(tmpDir, 'unmerge-197x80.png', pat.buffer);
        const verifyPreview = async (modal, widths) =>
          reassembleAndVerifyPngSlices(await readPreviewPngs(modal), pat.rgba, pat.width, pat.height, widths);

        // 27a. A merged card marks its inner original 分割线 with faint dashed lines; hover shows ＋ and a click
        // splits the card back along that line (M + 1), re-slicing the whole group from the original
        await entryBtn.click();
        let modal = await getModalLocators(page);
        await modal.splitModeBtn('free').click();
        await modal.fileInput.setInputFiles(patPath);
        await waitForSlicePreview(page, 8);
        assert.equal(await unmergeBtns(modal).count(), 0, 'Unmerged slices have no inner 分割线');
        await mergeBtn(modal, 3).click();
        await waitForSlicePreview(page, 7);
        await mergeBtn(modal, 3).click();
        await waitForSlicePreview(page, 6);
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 6 张');
        await verifyPreview(modal, [24, 25, 74, 24, 25, 25]);

        // Slice 3 is 等分 regions 3..5 (x 49..123): inner lines at x 73 and 98, i.e. 24/74 and 49/74 of its width
        assert.equal(await unmergeBtns(modal).count(), 2);
        const geometry = await modal.cards.nth(2).evaluate((card) => {
          const frame = card.querySelector('.slice-frame').getBoundingClientRect();
          return Array.from(card.querySelectorAll('button[aria-label*="原有分割线拆回"]')).map((line) => {
            const r = line.getBoundingClientRect();
            return {
              at: (r.left + r.width / 2 - frame.left) / frame.width,
              lineStyle: getComputedStyle(line, '::before').borderLeftStyle,
              plusOpacity: getComputedStyle(line.querySelector('[aria-hidden="true"]')).opacity,
              plus: line.querySelector('[aria-hidden="true"]').textContent
            };
          });
        });
        assert.equal(geometry.length, 2);
        [24 / 74, 49 / 74].forEach((expected, i) => {
          assert.ok(Math.abs(geometry[i].at - expected) < 0.03, `Inner line ${i + 1} at ${geometry[i].at}, expected ${expected}`);
          assert.equal(geometry[i].lineStyle, 'dashed');
          assert.equal(geometry[i].plus, '＋');
          assert.equal(geometry[i].plusOpacity, '0', '＋ hidden until hover');
        });
        await unmergeBtn(modal, 3, 2).hover();
        await page.waitForFunction(
          () =>
            getComputedStyle(
              document
                .querySelector('#x-slicer-modal-host')
                .shadowRoot.querySelector('[aria-label="沿第 2 条原有分割线拆回第 3 张切片"] [aria-hidden="true"]')
            ).opacity === '1'
        );

        await unmergeBtn(modal, 3, 2).click();
        await waitForSlicePreview(page, 7);
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 7 张');
        await verifyPreview(modal, [24, 25, 49, 25, 24, 25, 25]);
        assert.equal(await unmergeBtns(modal).count(), 1);
        await unmergeBtn(modal, 3, 1).click();
        await waitForSlicePreview(page, 8);
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 8 张');
        assert.equal(await unmergeBtns(modal).count(), 0);
        await verifyPreview(modal);

        // Rapid 拆回 on the greyed preview: a line already split back is inert, and only the latest result can be filled
        await mergeBtn(modal, 1).click();
        await waitForSlicePreview(page, 7);
        await mergeBtn(modal, 1).click();
        await waitForSlicePreview(page, 6);
        const duringSplit = await page.evaluate(() => {
          const sr = document.querySelector('#x-slicer-modal-host').shadowRoot;
          const first = sr.querySelector('[aria-label="沿第 1 条原有分割线拆回第 1 张切片"]');
          first.click();
          const snapshot = {
            stripBusy: sr.querySelector('.preview-strip').getAttribute('aria-busy'),
            submitDisabled: sr.querySelector('[data-action="submit"]').disabled,
            badge: sr.querySelector('.slice-badge').textContent,
            firstDisabled: first.disabled
          };
          first.click();
          sr.querySelector('[aria-label="沿第 2 条原有分割线拆回第 1 张切片"]').click();
          sr.querySelector('[data-action="submit"]').click();
          return { ...snapshot, badgeAfter: sr.querySelector('.slice-badge').textContent };
        });
        assert.deepEqual(duringSplit, {
          stripBusy: 'true',
          submitDisabled: true,
          badge: '8 等分 · 合并后 7 张',
          firstDisabled: true,
          badgeAfter: '8 等分 · 合并后 8 张'
        });
        await waitForSlicePreview(page, 8);
        assert.equal((await page.evaluate(() => window.__mockX.getState())).submissions.length, 0);
        await verifyPreview(modal);

        // 27b. 清除合并 is disabled without merges, restores pure 8 等分 in one click, and is a 自由切分-only control
        assert.equal(await modal.clearMergesBtn.isVisible(), true);
        assert.equal(await modal.clearMergesBtn.isDisabled(), true, 'No merges: 清除合并 must be disabled');
        await mergeBtn(modal, 2).click();
        await waitForSlicePreview(page, 7);
        await mergeBtn(modal, 5).click();
        await waitForSlicePreview(page, 6);
        assert.equal(await modal.clearMergesBtn.isEnabled(), true);
        await modal.clearMergesBtn.click();
        await waitForSlicePreview(page, 8);
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 8 张');
        assert.equal(await unmergeBtns(modal).count(), 0);
        await verifyPreview(modal);
        assert.equal(await modal.clearMergesBtn.isDisabled(), true);
        await modal.clearMergesBtn.dispatchEvent('click');
        assert.equal(await modal.status.getAttribute('data-tone'), 'success', 'Disabled 清除合并 must not regenerate');
        await modal.splitModeBtn('equal').click();
        assert.equal(await modal.clearMergesBtn.isVisible(), false, '左右等分 has no merges to clear');
        await modal.splitModeBtn('free').click();

        // 清除合并 also recovers from a merge that failed: 32000×3 merged down to 2 slices cannot scale (0 px high)
        const stripPath = writeTempFile(tmpDir, 'clear-strip-32000x3.png', createSolidPng(32000, 3, [30, 140, 200, 255]));
        await modal.fileInput.setInputFiles(stripPath);
        await waitForSlicePreview(page, 8);
        await page.evaluate(() => {
          const sr = document.querySelector('#x-slicer-modal-host').shadowRoot;
          for (let left = 1; left <= 6; left++) {
            sr.querySelector(`[aria-label="合并第 ${left} 张与第 ${left + 1} 张切片"]`).click();
          }
        });
        await page.waitForFunction(
          () => document.querySelector('#x-slicer-modal-host').shadowRoot.querySelector('.status').getAttribute('data-tone') === 'error'
        );
        assert.equal(await modal.sliceBadge.textContent(), '缩放后零尺寸');
        assert.equal(await modal.clearMergesBtn.isEnabled(), true);
        await modal.clearMergesBtn.click();
        await waitForSlicePreview(page, 8);
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 8 张');
        assert.equal(await modal.sliceCountInput.getAttribute('aria-invalid'), 'false');

        // 27c. Changing 等分张数 N by preset, stepper or typing drops every merge and re-slices pure N, with no confirm
        const dialogs = [];
        page.on('dialog', (d) => {
          dialogs.push(d.message());
          d.dismiss().catch(() => {});
        });
        await modal.fileInput.setInputFiles(patPath);
        await waitForSlicePreview(page, 8);
        const mergeTwice = async (n) => {
          await mergeBtn(modal, 1).click();
          await waitForSlicePreview(page, n - 1);
          await mergeBtn(modal, 1).click();
          await waitForSlicePreview(page, n - 2);
          assert.equal(await modal.sliceBadge.textContent(), `${n} 等分 · 合并后 ${n - 2} 张`);
        };
        const expectPureN = async (n) => {
          await waitForSlicePreview(page, n);
          assert.equal(await modal.sliceBadge.textContent(), `${n} 等分 · 合并后 ${n} 张`);
          assert.equal(await unmergeBtns(modal).count(), 0);
          assert.equal(await modal.clearMergesBtn.isDisabled(), true);
          await verifyPreview(modal);
        };
        await mergeTwice(8);
        await modal.presetBtn(5).click();
        await expectPureN(5);
        await mergeTwice(5);
        await modal.increaseBtn.click();
        await expectPureN(6);
        await mergeTwice(6);
        await modal.decreaseBtn.click();
        await expectPureN(5);
        await mergeTwice(5);
        await modal.sliceCountInput.fill('7');
        await expectPureN(7);
        await mergeTwice(7);
        await modal.sliceCountInput.focus();
        await page.keyboard.press('ArrowUp');
        await expectPureN(8);
        await mergeTwice(8);
        await modal.presetBtn(20).click();
        await expectPureN(20);
        // Going back to the old N does not bring the old merges back either
        await modal.presetBtn(8).click();
        await expectPureN(8);
        assert.deepEqual(dialogs, [], 'Changing N must not ask for confirmation');

        // 27d. 自由 → 等分 → 自由 with the same window, 原图 and N: 等分 outputs pure N, 自由 restores the merges
        await mergeBtn(modal, 3).click();
        await waitForSlicePreview(page, 7);
        await mergeBtn(modal, 3).click();
        await waitForSlicePreview(page, 6);
        await mergeBtn(modal, 5).click();
        await waitForSlicePreview(page, 5);
        await verifyPreview(modal, [24, 25, 74, 24, 50]);
        await modal.splitModeBtn('equal').click();
        await waitForSlicePreview(page, 8);
        assert.equal(await modal.sliceBadge.textContent(), '左右等分 1×8');
        assert.equal(await unmergeBtns(modal).count(), 0);
        await verifyPreview(modal);
        await modal.splitModeBtn('free').click();
        await waitForSlicePreview(page, 5);
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 5 张');
        await verifyPreview(modal, [24, 25, 74, 24, 50]);
        assert.equal(await unmergeBtns(modal).count(), 3);
        assert.equal(await modal.clearMergesBtn.isEnabled(), true);
        // A restored merge still splits back
        await unmergeBtn(modal, 5, 1).click();
        await waitForSlicePreview(page, 6);
        await verifyPreview(modal, [24, 25, 74, 24, 25, 25]);

        // Changing N while in 等分 still drops the kept merges
        await modal.splitModeBtn('equal').click();
        await waitForSlicePreview(page, 8);
        await modal.presetBtn(5).click();
        await waitForSlicePreview(page, 5);
        await modal.presetBtn(8).click();
        await waitForSlicePreview(page, 8);
        await modal.splitModeBtn('free').click();
        await expectPureN(8);

        // 27e. A new 原图 drops the merges, in 自由 and while they are parked in 等分
        const pat2 = createPatternPng(161, 40);
        const pat2Path = writeTempFile(tmpDir, 'unmerge-other-161x40.png', pat2.buffer);
        await mergeTwice(8);
        await modal.fileInput.setInputFiles(pat2Path);
        await waitForSlicePreview(page, 8);
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 8 张');
        assert.equal(await unmergeBtns(modal).count(), 0);
        assert.equal(await modal.clearMergesBtn.isDisabled(), true);
        reassembleAndVerifyPngSlices(await readPreviewPngs(modal), pat2.rgba, pat2.width, pat2.height);
        await modal.fileInput.setInputFiles(patPath);
        await waitForSlicePreview(page, 8);
        await mergeTwice(8);
        await modal.splitModeBtn('equal').click();
        await waitForSlicePreview(page, 8);
        await modal.fileInput.setInputFiles(pat2Path);
        await waitForSlicePreview(page, 8);
        await modal.splitModeBtn('free').click();
        await waitForSlicePreview(page, 8);
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 8 张');
        assert.equal(await modal.clearMergesBtn.isDisabled(), true);

        // Closing the window drops them too: reopen (自由 is remembered) and pick the same 原图 again
        await modal.fileInput.setInputFiles(patPath);
        await waitForSlicePreview(page, 8);
        await mergeTwice(8);
        await modal.closeBtn.click();
        await modal.host.waitFor({ state: 'detached' });
        await entryBtn.click();
        modal = await getModalLocators(page);
        assert.equal(await modal.splitModeBtn('free').getAttribute('aria-pressed'), 'true');
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 8 张');
        assert.equal(await modal.clearMergesBtn.isDisabled(), true);
        await modal.fileInput.setInputFiles(patPath);
        await expectPureN(8);
        // Nothing about merges is persisted: the extension keeps only the split mode, the X page nothing
        assert.deepEqual(await evaluateInExtensionWorld(page, `chrome.storage.local.get(null)`), { splitMode: 'free' });
        assert.deepEqual(await auditPageStorage(page), { localLen: 0, sessionLen: 0, dbCount: 0 });
        await modal.closeBtn.click();
        await modal.host.waitFor({ state: 'detached' });

        // 27f. 框内切图: merge, 拆回 and 清除合并 work on the composer image, and the fill uses the final M
        const pat240 = createPatternPng(240, 80);
        await page.evaluate((bytes) => {
          window.__mockX.setComposerText('inline', '拆回后填入保留文案');
          window.__mockX.configureUserSingleUpload('inline', { removeAriaLabel: 'Remove media' });
          window.__mockX.triggerDropFileBytes('inline', bytes, 'unmerge-240x80.png', 'image/png');
        }, Array.from(pat240.buffer));
        await page.waitForSelector('#inline-composer [data-testid="attachmentItem"] img');
        await entryBtn.click();
        modal = await getModalLocators(page);
        assert.equal(await modal.sourceBanner.isVisible(), true);
        await waitForSlicePreview(page, 8);
        await mergeTwice(8);
        await modal.clearMergesBtn.click();
        await waitForSlicePreview(page, 8);
        await mergeBtn(modal, 2).click();
        await waitForSlicePreview(page, 7);
        await mergeBtn(modal, 2).click();
        await waitForSlicePreview(page, 6);
        await unmergeBtn(modal, 2, 1).click();
        await waitForSlicePreview(page, 7);
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 7 张');
        await modal.submitBtn.click();
        await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 7 张切片（已替换原附件），等待发布（已保留原有文案）/);
        const st27f = await page.evaluate(() => window.__mockX.getState());
        assert.equal(st27f.submissions.length, 1);
        assert.equal(st27f.submissions[0].count, 7);
        assert.equal(await page.locator('#inline-composer [data-testid="attachmentItem"]').count(), 7);
        assert.equal(await page.locator('#inline-composer [data-testid="tweetTextarea_0"]').textContent(), '拆回后填入保留文案');
        reassembleAndVerifyPngSlices(
          st27f.submissions[0].files.map((f) => Buffer.from(f.bytes)),
          pat240.rgba,
          pat240.width,
          pat240.height,
          [30, 30, 60, 30, 30, 30, 30]
        );

        // 27g. QA regressions: 拆回 lines stay on the real 分割线 and hit the right one when packed tight,
        // ＋ is never clipped, same-N clicks never drop merges, and badges follow the mode in every state
        await page.evaluate(() => {
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          document.querySelector('#inline-composer [data-x-slicer-feedback="true"]')?.remove();
          window.__mockX.clearSubmissions();
          window.__mockX.setComposerText('inline', '');
        });
        // Where 分割线 at `fraction` of a card's width is drawn: measured on the image as rendered (object-fit: contain)
        const lineTarget = (card, fraction) =>
          card.evaluate((c, f) => {
            const img = c.querySelector('img');
            const r = img.getBoundingClientRect();
            const ratio = img.naturalWidth / img.naturalHeight;
            const w = Math.min(r.width, r.height * ratio);
            return { x: r.left + (r.width - w) / 2 + f * w, y: r.top + r.height / 2 };
          }, fraction);

        // Square 800×800 at N = 20: merging 等分 1..4 packs 3 inner lines ~7.5 px apart in a 30 px card
        const sq = createPatternPng(800, 800);
        const sqPath = writeTempFile(tmpDir, 'unmerge-square-800.png', sq.buffer);
        await entryBtn.click();
        modal = await getModalLocators(page);
        await modal.presetBtn(20).click();
        await modal.fileInput.setInputFiles(sqPath);
        await waitForSlicePreview(page, 20);
        for (let m = 1; m <= 3; m++) {
          await mergeBtn(modal, 1).click();
          await waitForSlicePreview(page, 20 - m);
        }
        const rest = Array(16).fill(40);
        reassembleAndVerifyPngSlices(await readPreviewPngs(modal), sq.rgba, 800, 800, [160, ...rest]);
        let target = await lineTarget(modal.cards.nth(0), 1 / 4);
        await page.mouse.click(target.x, target.y);
        await waitForSlicePreview(page, 18);
        reassembleAndVerifyPngSlices(await readPreviewPngs(modal), sq.rgba, 800, 800, [40, 120, ...rest]);
        target = await lineTarget(modal.cards.nth(1), 2 / 3);
        await page.mouse.click(target.x, target.y);
        await waitForSlicePreview(page, 19);
        reassembleAndVerifyPngSlices(await readPreviewPngs(modal), sq.rgba, 800, 800, [40, 80, 40, ...rest]);

        // Panorama 3200×100 at N = 8, 等分 1..6 merged: the preview frames are only ~9 px high
        const pano = createPatternPng(3200, 100);
        const panoPath = writeTempFile(tmpDir, 'unmerge-pano-3200x100.png', pano.buffer);
        await modal.presetBtn(8).click();
        await modal.fileInput.setInputFiles(panoPath);
        await waitForSlicePreview(page, 8);
        for (let m = 1; m <= 5; m++) {
          await mergeBtn(modal, 1).click();
          await waitForSlicePreview(page, 8 - m);
        }
        for (let nth = 1; nth <= 5; nth++) {
          const expected = await lineTarget(modal.cards.nth(0), nth / 6);
          const box = await unmergeBtn(modal, 1, nth).boundingBox();
          assert.ok(
            Math.abs(box.x + box.width / 2 - expected.x) < 1.5,
            `Inner line ${nth} drawn at ${box.x + box.width / 2}, 分割线 is at ${expected.x}`
          );
        }
        await unmergeBtn(modal, 1, 3).hover();
        const markBox = await unmergeBtn(modal, 1, 3).locator('[aria-hidden="true"]').boundingBox();
        assert.equal(Math.round(markBox.width), 18, '＋ must not be squished');
        assert.equal(Math.round(markBox.height), 18);
        const markShot = PNG.sync.read(
          await page.screenshot({ clip: { x: markBox.x, y: markBox.y, width: 18, height: 18 } })
        );
        const deviceScale = markShot.width / 18;
        for (const [px, py] of [[5, 3], [13, 15]]) {
          const i = (Math.floor(py * deviceScale) * markShot.width + Math.floor(px * deviceScale)) * 4;
          const [r, g, b] = markShot.data.subarray(i, i + 3);
          assert.ok(b > 200 && r < 100 && g > 120 && g < 190, `＋ badge clipped at (${px}, ${py}): rgb(${r}, ${g}, ${b})`);
        }
        await modal.closeBtn.click();
        await modal.host.waitFor({ state: 'detached' });

        // Re-applying the current N (preset or ArrowUp at the limit) while a regeneration is in flight keeps the merges,
        // both in 自由 and while they are parked in 等分
        await entryBtn.click();
        modal = await getModalLocators(page);
        await modal.fileInput.setInputFiles(patPath);
        await waitForSlicePreview(page, 8);
        await mergeBtn(modal, 1).click();
        await waitForSlicePreview(page, 7);
        await page.evaluate(() => {
          const sr = document.querySelector('#x-slicer-modal-host').shadowRoot;
          sr.querySelector('[aria-label="合并第 1 张与第 2 张切片"]').click();
          sr.querySelector('[data-action="preset-count"][data-count="8"]').click();
        });
        await waitForSlicePreview(page, 6);
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 6 张');
        await verifyPreview(modal, [73, 25, 25, 24, 25, 25]);
        await page.evaluate(() => {
          const sr = document.querySelector('#x-slicer-modal-host').shadowRoot;
          sr.querySelector('[data-action="split-mode"][data-split-mode="equal"]').click();
          sr.querySelector('[data-action="preset-count"][data-count="8"]').click();
        });
        await waitForSlicePreview(page, 8);
        await modal.splitModeBtn('free').click();
        await waitForSlicePreview(page, 6);
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 6 张');
        await modal.presetBtn(20).click();
        await waitForSlicePreview(page, 20);
        await mergeBtn(modal, 1).click();
        await waitForSlicePreview(page, 19);
        await page.evaluate(() => {
          const sr = document.querySelector('#x-slicer-modal-host').shadowRoot;
          sr.querySelector('[aria-label="合并第 1 张与第 2 张切片"]').click();
          sr.querySelector('#xslicer-slice-count').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, composed: true }));
        });
        await waitForSlicePreview(page, 18);
        assert.equal(await modal.sliceBadge.textContent(), '20 等分 · 合并后 18 张');

        // 清除合并 after a failed merge drops the error marking at once, so 等分 shows its own badge while regenerating
        await modal.presetBtn(8).click();
        await modal.fileInput.setInputFiles(stripPath);
        await waitForSlicePreview(page, 8);
        await page.evaluate(() => {
          const sr = document.querySelector('#x-slicer-modal-host').shadowRoot;
          for (let left = 1; left <= 6; left++) {
            sr.querySelector(`[aria-label="合并第 ${left} 张与第 ${left + 1} 张切片"]`).click();
          }
        });
        await page.waitForFunction(
          () => document.querySelector('#x-slicer-modal-host').shadowRoot.querySelector('.status').getAttribute('data-tone') === 'error'
        );
        const afterClear = await page.evaluate(() => {
          const sr = document.querySelector('#x-slicer-modal-host').shadowRoot;
          sr.querySelector('[data-action="clear-merges"]').click();
          sr.querySelector('[data-action="split-mode"][data-split-mode="equal"]').click();
          return {
            badge: sr.querySelector('.slice-badge').textContent,
            invalid: sr.querySelector('#xslicer-slice-count').getAttribute('aria-invalid')
          };
        });
        assert.deepEqual(afterClear, { badge: '左右等分 1×8', invalid: 'false' });
        await waitForSlicePreview(page, 8);
        await modal.splitModeBtn('free').click();
        await modal.closeBtn.click();
        await modal.host.waitFor({ state: 'detached' });

        // A window that opens blocked (existing poll) still shows the remembered 自由 badge and its 清除合并
        await page.evaluate(() => window.__mockX.addPoll('inline'));
        await entryBtn.click();
        modal = await getModalLocators(page);
        assert.equal(await modal.status.getAttribute('data-tone'), 'error');
        assert.equal(await modal.splitModeBtn('free').getAttribute('aria-pressed'), 'true');
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 8 张');
        assert.equal(await modal.clearMergesBtn.isVisible(), true);
        assert.equal(await modal.clearMergesBtn.isDisabled(), true);
        await modal.closeBtn.click();
        await modal.host.waitFor({ state: 'detached' });
        await page.evaluate(() => document.querySelector('#inline-composer [data-testid="pollOptions"]')?.remove());
      } finally {
        await evaluateInExtensionWorld(page, `chrome.storage.local.clear()`);
      }
    });

    // 28. Ticket #5: keyboard-only 自由切分: Tab reaches each 分割线, Delete / Backspace 合并, Enter 拆回, focus follows
    // the 分割线 through every rebuild, nothing leaks to the X page, and the result is filled with the keyboard
    await runCase('28_free_split_keyboard_merge_unmerge_focus_and_fill', async (page) => {
      try {
        const entryBtn = page.locator('#inline-composer button[data-x-slicer-entry="true"]');
        const draft = '键盘自由切分保留文案';
        // 8 等分 of 197 px puts 分割线 1..7 at x = 24, 49, 73, 98, 123, 147, 172
        const pat = createPatternPng(197, 80);
        const patPath = writeTempFile(tmpDir, 'keyboard-197x80.png', pat.buffer);
        const focused = () =>
          page.evaluate(() => {
            const host = document.querySelector('#x-slicer-modal-host');
            const el = host?.shadowRoot?.activeElement;
            const mark = el?.querySelector('[aria-hidden="true"]');
            return {
              inModal: Boolean(host) && document.activeElement === host,
              label: el ? el.getAttribute('aria-label') || el.textContent.trim() : null,
              markOpacity: mark ? getComputedStyle(mark).opacity : null
            };
          });
        // Presses (Shift+)Tab until `label` has focus; every stop on the way must stay inside the window
        const tabTo = async (label, { shift = false, max = 40 } = {}) => {
          const path = [];
          for (let i = 0; i < max; i++) {
            await page.keyboard.press(shift ? 'Shift+Tab' : 'Tab');
            const f = await focused();
            assert.equal(f.inModal, true, `Tab left the window after ${path.join(' → ')}`);
            path.push(f.label);
            if (f.label === label) return path;
          }
          throw new Error(`Tab never reached ${label}: ${path.join(' → ')}`);
        };
        await page.evaluate((text) => window.__mockX.setComposerText('inline', text), draft);
        await entryBtn.focus();
        await page.keyboard.press('Enter');
        const modal = await getModalLocators(page);

        // Keys that reach any of the page's own listeners (capture or bubble, like X's shortcuts), and any moment
        // focus drops out of the window
        await page.evaluate(() => {
          const leaks = (window.__keyLeaks = []);
          for (const target of [window, document]) {
            for (const type of ['keydown', 'keypress', 'keyup']) {
              for (const capture of [true, false]) {
                target.addEventListener(
                  type,
                  (e) => {
                    if (['Delete', 'Backspace', 'Enter', 'Tab', ' '].includes(e.key)) leaks.push(`${type}:${e.key}`);
                  },
                  capture
                );
              }
            }
          }
          const host = document.querySelector('#x-slicer-modal-host');
          const lost = (window.__focusLost = []);
          new MutationObserver(() => {
            if (host.isConnected && document.activeElement !== host) lost.push(document.activeElement?.tagName || 'null');
          }).observe(host.shadowRoot, { subtree: true, childList: true, attributes: true });
        });

        // 28a. 自由 by keyboard; Tab then visits every 分割线 left to right (× shown on focus) between the controls and footer
        await tabTo('自由切分');
        await page.keyboard.press('Space');
        assert.equal(await modal.splitModeBtn('free').getAttribute('aria-pressed'), 'true');
        await modal.fileInput.setInputFiles(patPath);
        await waitForSlicePreview(page, 8);
        assert.equal((await focused()).label, '自由切分');
        const forward = await tabTo('填入发帖框');
        assert.deepEqual(forward, [
          '减少切片数量',
          '切片数量',
          '增加切片数量',
          '推荐切片数量 5 张',
          '推荐切片数量 8 张',
          '推荐切片数量 20 张',
          '合并第 1 张与第 2 张切片',
          '合并第 2 张与第 3 张切片',
          '合并第 3 张与第 4 张切片',
          '合并第 4 张与第 5 张切片',
          '合并第 5 张与第 6 张切片',
          '合并第 6 张与第 7 张切片',
          '合并第 7 张与第 8 张切片',
          '取消',
          '填入发帖框'
        ]);
        await tabTo('合并第 3 张与第 4 张切片', { shift: true });
        assert.equal((await focused()).markOpacity, '1', 'A focused 分割线 shows ×');

        // 28b. Delete merges; focus stays on that 分割线, now the ＋ inside the merged card
        await page.keyboard.press('Delete');
        await waitForSlicePreview(page, 7);
        assert.deepEqual(await focused(), { inModal: true, label: '沿第 1 条原有分割线拆回第 3 张切片', markOpacity: '1' });
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 7 张');

        // 28c. Backspace merges the next 分割线 (4); Enter on ＋ 拆回 分割线 3 and focus lands on its × again
        assert.deepEqual(await tabTo('合并第 3 张与第 4 张切片'), ['合并第 3 张与第 4 张切片']);
        await page.keyboard.press('Backspace');
        await waitForSlicePreview(page, 6);
        assert.equal((await focused()).label, '沿第 2 条原有分割线拆回第 3 张切片');
        await tabTo('沿第 1 条原有分割线拆回第 3 张切片', { shift: true });
        assert.equal((await focused()).markOpacity, '1', 'A focused inner 分割线 shows ＋');
        // Held Enter: the auto-repeat lands on the restored × and must not merge it straight back
        await page.keyboard.down('Enter');
        await waitForSlicePreview(page, 7);
        assert.deepEqual(await focused(), { inModal: true, label: '合并第 3 张与第 4 张切片', markOpacity: '1' });
        await page.keyboard.down('Enter');
        await page.keyboard.up('Enter');
        await page.waitForTimeout(300);
        assert.equal(await modal.cards.count(), 7, 'A repeated Enter must not 合并 again');
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 7 张');
        reassembleAndVerifyPngSlices(await readPreviewPngs(modal), pat.rgba, pat.width, pat.height, [24, 25, 24, 50, 24, 25, 25]);

        // 28d. Keyboard merges down to the 2-slice minimum, each landing on the ＋ of the 分割线 just merged
        const keyboardMerges = [
          ['Delete', '合并第 3 张与第 4 张切片', false, '沿第 1 条原有分割线拆回第 3 张切片'],
          ['Delete', '合并第 3 张与第 4 张切片', false, '沿第 3 条原有分割线拆回第 3 张切片'],
          ['Backspace', '合并第 3 张与第 4 张切片', false, '沿第 4 条原有分割线拆回第 3 张切片'],
          ['Delete', '合并第 3 张与第 4 张切片', false, '沿第 5 条原有分割线拆回第 3 张切片'],
          ['Backspace', '合并第 1 张与第 2 张切片', true, '沿第 1 条原有分割线拆回第 1 张切片']
        ];
        for (const [i, [key, divider, shift, landsOn]] of keyboardMerges.entries()) {
          if ((await focused()).label !== divider) await tabTo(divider, { shift });
          await page.keyboard.press(key);
          await waitForSlicePreview(page, 6 - i);
          assert.equal((await focused()).label, landsOn, `${key} on ${divider} (to ${6 - i} slices)`);
        }
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 2 张');

        // 28e. At 2 slices the last × is out of the focus ring, and Delete / Backspace on any ＋ change nothing
        assert.equal(await modal.host.getByRole('button', { name: '合并第 1 张与第 2 张切片' }).isDisabled(), true);
        const ring = await tabTo('沿第 1 条原有分割线拆回第 1 张切片');
        assert.equal(ring.filter((label) => label.startsWith('合并第')).length, 0, `× in focus ring: ${ring.join(' → ')}`);
        for (const line of ['沿第 1 条原有分割线拆回第 1 张切片', '沿第 3 条原有分割线拆回第 2 张切片']) {
          if ((await focused()).label !== line) await tabTo(line);
          await page.keyboard.press('Delete');
          await page.keyboard.press('Backspace');
        }
        await page.waitForTimeout(300);
        assert.equal(await modal.cards.count(), 2);
        assert.equal(await modal.status.getAttribute('data-tone'), 'success');
        assert.equal(await modal.host.locator('.preview-strip').getAttribute('aria-busy'), null);
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 2 张');

        // 28f. Enter 拆回 分割线 5 back to 3 slices, Tab to 填入发帖框 and Enter fills them
        await page.keyboard.press('Enter');
        await waitForSlicePreview(page, 3);
        assert.equal((await focused()).label, '合并第 2 张与第 3 张切片');
        await tabTo('填入发帖框');
        await page.keyboard.press('Enter');
        await waitForComposerFeedback(page, '#inline-composer', 'success', /已填入 3 张切片，等待发布/);
        const st = await page.evaluate(() => window.__mockX.getState());
        assert.equal(st.submissions.length, 1);
        assert.equal(st.submissions[0].count, 3);
        reassembleAndVerifyPngSlices(
          st.submissions[0].files.map((f) => Buffer.from(f.bytes)),
          pat.rgba,
          pat.width,
          pat.height,
          [49, 74, 74]
        );
        const after = await page.evaluate(() => ({
          text: document.querySelector('#inline-composer [data-testid="tweetTextarea_0"]').textContent,
          focusOnEntry: document.activeElement === document.querySelector('#inline-composer button[data-x-slicer-entry="true"]'),
          leaks: window.__keyLeaks,
          lost: window.__focusLost
        }));
        assert.deepEqual(after, { text: draft, focusOnEntry: true, leaks: [], lost: [] });

        // 28g. Escape while a keyboard 合并 regenerates closes cleanly back to the entry button, nothing leaks
        await page.evaluate(() => {
          document.querySelector('#inline-composer [data-testid="attachments"]').innerHTML = '';
          document.querySelector('#inline-composer [data-x-slicer-feedback="true"]')?.remove();
          window.__mockX.clearSubmissions();
        });
        await page.keyboard.press('Enter');
        await getModalLocators(page);
        await page.evaluate(() => (window.__keyLeaks.length = 0));
        await modal.fileInput.setInputFiles(patPath);
        await waitForSlicePreview(page, 8);
        // 清除合并 by keyboard disables itself; focus moves to the 自由 button beside it, not the dialog
        await tabTo('合并第 1 张与第 2 张切片');
        await page.keyboard.press('Delete');
        await waitForSlicePreview(page, 7);
        await tabTo('清除合并', { shift: true });
        await page.keyboard.press('Enter');
        await waitForSlicePreview(page, 8);
        assert.equal((await focused()).label, '自由切分');
        await tabTo('合并第 1 张与第 2 张切片');
        await page.keyboard.press('Delete');
        await page.keyboard.press('Escape');
        await modal.host.waitFor({ state: 'detached' });
        assert.deepEqual(
          await page.evaluate(() => ({
            focusOnEntry: document.activeElement === document.querySelector('#inline-composer button[data-x-slicer-entry="true"]'),
            leaks: window.__keyLeaks,
            escapes: window.__mockX.getState().pageEscapeEvents,
            submissions: window.__mockX.getState().submissions.length,
            text: document.querySelector('#inline-composer [data-testid="tweetTextarea_0"]').textContent
          })),
          { focusOnEntry: true, leaks: [], escapes: 0, submissions: 0, text: draft }
        );

        // 28h. A larger original keeps the preview regenerating while the keyboard moves on: Tab / Shift+Tab from
        // the busy preview continue from the 分割线 just merged, so a second Delete merges its neighbour
        const big = createPatternPng(2400, 1600);
        const bigPath = writeTempFile(tmpDir, 'keyboard-2400x1600.png', big.buffer);
        const unmergeLabels = () =>
          modal.host.locator('.merged-divider').evaluateAll((lines) => lines.map((l) => l.getAttribute('aria-label')));
        await page.keyboard.press('Enter');
        await getModalLocators(page);
        await page.evaluate(() => (window.__keyLeaks.length = 0));
        await modal.fileInput.setInputFiles(bigPath);
        await waitForSlicePreview(page, 8, 60000);
        await tabTo('合并第 4 张与第 5 张切片');
        await page.keyboard.press('Delete');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Delete');
        await waitForSlicePreview(page, 6, 60000);
        assert.deepEqual(await unmergeLabels(), ['沿第 1 条原有分割线拆回第 4 张切片', '沿第 2 条原有分割线拆回第 4 张切片']);
        assert.equal((await focused()).label, '沿第 2 条原有分割线拆回第 4 张切片');
        await tabTo('合并第 3 张与第 4 张切片', { shift: true });
        await page.keyboard.press('Delete');
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Delete');
        await waitForSlicePreview(page, 4, 60000);
        assert.equal(await modal.sliceBadge.textContent(), '8 等分 · 合并后 4 张');
        assert.equal((await focused()).label, '沿第 1 条原有分割线拆回第 2 张切片');
        // The last 分割线: Tab moves on to 取消 rather than back to the first ×
        await tabTo('合并第 3 张与第 4 张切片');
        await page.keyboard.press('Delete');
        await page.keyboard.press('Tab');
        await waitForSlicePreview(page, 3, 60000);
        assert.equal((await focused()).label, '取消');

        // 28i. At 20 slices every × reached by Tab / Shift+Tab is fully inside the preview, never cut by its edge
        await tabTo('推荐切片数量 20 张', { shift: true });
        await page.keyboard.press('Enter');
        await waitForSlicePreview(page, 20, 60000);
        const outsideStrip = () =>
          page.evaluate(() => {
            const sr = document.querySelector('#x-slicer-modal-host').shadowRoot;
            const strip = sr.querySelector('.preview-strip').getBoundingClientRect();
            const r = sr.activeElement.getBoundingClientRect();
            return Math.max(0, strip.left - r.left, r.right - strip.right);
          });
        for (const shift of [false, true]) {
          for (let left = 1; left <= 19; left++) {
            const n = shift ? 20 - left : left;
            await tabTo(`合并第 ${n} 张与第 ${n + 1} 张切片`, { shift });
            assert.equal(await outsideStrip(), 0, `× ${n} is cut by the preview edge`);
          }
        }

        // 28j. Focus on the dialog or the preview itself (a click on their text or images): Shift+Tab wraps inside the
        // window instead of escaping onto X, and scrolling keys never scroll the X page underneath
        await page.evaluate(() => {
          document.body.style.minHeight = '5000px';
          window.scrollTo(0, 100);
        });
        for (const spot of [modal.dialog.locator('.title'), modal.cards.nth(10).locator('img')]) {
          await spot.click();
          for (const key of ['Space', 'PageDown', 'ArrowDown', 'End']) await page.keyboard.press(key);
          await page.waitForTimeout(200);
          assert.equal(await page.evaluate(() => window.scrollY), 100, 'Keys inside the window must not scroll the X page');
        }
        await modal.dialog.locator('.title').click();
        await page.keyboard.press('Shift+Tab');
        assert.deepEqual(await focused(), { inModal: true, label: '填入发帖框', markOpacity: null });
        await page.keyboard.press('Escape');
        await modal.host.waitFor({ state: 'detached' });
        assert.deepEqual(
          await page.evaluate(() => ({
            leaks: window.__keyLeaks,
            publishClicks: window.__mockX.getState().publishClicks.length,
            submissions: window.__mockX.getState().submissions.length,
            text: document.querySelector('#inline-composer [data-testid="tweetTextarea_0"]').textContent
          })),
          { leaks: [], publishClicks: 0, submissions: 0, text: draft }
        );
      } finally {
        await page.evaluate(() => {
          document.body.style.minHeight = '';
        });
        await evaluateInExtensionWorld(page, `chrome.storage.local.clear()`);
      }
    });

    assert.equal(
      unexpectedRequests.length,
      0,
      `Unexpected network requests detected: ${unexpectedRequests.join(', ')}`
    );
  } finally {
    await context.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nSummary: ${passed} passed, ${failed} failed (total ${results.length})`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

runTests().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
