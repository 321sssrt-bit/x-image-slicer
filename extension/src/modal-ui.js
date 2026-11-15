(() => {
  'use strict';

  const XSlicer = (globalThis.XSlicer = globalThis.XSlicer || {});

  const STYLES = `
    :host {
      all: initial;
    }
    * {
      box-sizing: border-box;
    }
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 2147483640;
      background: rgba(15, 20, 25, 0.62);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f1419;
    }
    .dialog {
      width: min(920px, 100%);
      max-height: 90vh;
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid #cfd9de;
      outline: none;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 20px;
      border-bottom: 1px solid #eff3f4;
    }
    .title {
      margin: 0;
      font-size: 17px;
      font-weight: 700;
      color: #0f1419;
    }
    .close-btn {
      appearance: none;
      border: 1px solid #cfd9de;
      background: #ffffff;
      color: #0f1419;
      width: 32px;
      height: 32px;
      border-radius: 9999px;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .close-btn:hover:not(:disabled) {
      background: #eff3f4;
    }
    .close-btn:focus-visible,
    .btn:focus-visible,
    .file-input:focus-visible,
    .count-input:focus-visible,
    .stepper-btn:focus-visible,
    .preset-btn:focus-visible {
      outline: 2px solid #1d9bf0;
      outline-offset: 2px;
    }
    .body {
      padding: 16px 20px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .controls {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      background: #f7f9f9;
      border: 1px solid #eff3f4;
      border-radius: 12px;
    }
    .file-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .file-group[hidden] {
      display: none;
    }
    .file-label,
    .count-label {
      font-size: 13px;
      font-weight: 600;
      color: #0f1419;
    }
    .file-input {
      font-size: 13px;
      color: #0f1419;
      max-width: 100%;
    }
    .count-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .count-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .count-stepper {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .stepper-btn {
      appearance: none;
      width: 30px;
      height: 30px;
      border-radius: 9999px;
      border: 1px solid #cfd9de;
      background: #ffffff;
      color: #0f1419;
      font-size: 16px;
      font-weight: 700;
      line-height: 1;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .stepper-btn:hover:not(:disabled) {
      background: #eff3f4;
    }
    .stepper-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .count-input {
      width: 58px;
      height: 30px;
      border: 1px solid #cfd9de;
      border-radius: 8px;
      padding: 4px 8px;
      font-size: 14px;
      font-weight: 600;
      text-align: center;
      color: #0f1419;
      background: #ffffff;
    }
    .count-input[aria-invalid="true"] {
      border-color: #d92d20;
      background: #fef1f2;
      color: #b42318;
    }
    .count-input:disabled {
      opacity: 0.6;
      background: #eff3f4;
      cursor: not-allowed;
    }
    .slice-badge {
      font-size: 12px;
      font-weight: 600;
      color: #0f1419;
      background: #e8f5fd;
      border: 1px solid #b6e0fb;
      padding: 5px 10px;
      border-radius: 9999px;
      white-space: nowrap;
    }
    .preset-group {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .preset-label {
      font-size: 12px;
      color: #536471;
      font-weight: 500;
      white-space: nowrap;
    }
    .preset-btn {
      appearance: none;
      height: 26px;
      min-width: 32px;
      padding: 0 8px;
      border-radius: 9999px;
      border: 1px solid #cfd9de;
      background: #ffffff;
      color: #0f1419;
      font-size: 12px;
      font-weight: 600;
      line-height: 1;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .preset-btn:hover:not(:disabled) {
      background: #eff3f4;
    }
    .preset-btn[aria-pressed="true"] {
      background: #e8f5fd;
      border-color: #1d9bf0;
      color: #1d9bf0;
    }
    .preset-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .hint {
      margin: 0;
      font-size: 12px;
      color: #536471;
      line-height: 1.45;
    }
    .status {
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 13px;
      line-height: 1.5;
      border: 1px solid #cfd9de;
      background: #f7f9f9;
      color: #0f1419;
    }
    .status[data-tone="error"] {
      background: #fef1f2;
      border-color: #f9b4bc;
      color: #b42318;
    }
    .status[data-tone="warning"] {
      background: #fffaeb;
      border-color: #fedf89;
      color: #b54708;
    }
    .status[data-tone="success"] {
      background: #ecfdf3;
      border-color: #abefc6;
      color: #067647;
    }
    .status[data-tone="busy"] {
      background: #eff8ff;
      border-color: #b2ddff;
      color: #175cd3;
    }
    .summary {
      font-size: 13px;
      color: #536471;
      font-weight: 500;
      line-height: 1.5;
    }
    .preview-strip {
      display: flex;
      align-items: flex-end;
      gap: 10px;
      overflow-x: auto;
      padding: 12px;
      background: #f7f9f9;
      border: 1px solid #eff3f4;
      border-radius: 12px;
      min-height: 120px;
    }
    .preview-strip[hidden] {
      display: none;
    }
    .slice-card {
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      background: #ffffff;
      border: 1px solid #cfd9de;
      border-radius: 8px;
      padding: 8px;
    }
    .slice-frame {
      height: 150px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: repeating-conic-gradient(#eef1f4 0% 25%, #ffffff 0% 50%) 50% / 12px 12px;
      border: 1px solid #e1e8ed;
      overflow: hidden;
    }
    .slice-img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .slice-meta {
      font-size: 11px;
      color: #536471;
      text-align: center;
      line-height: 1.35;
      white-space: nowrap;
    }
    .slice-name {
      font-weight: 600;
      color: #0f1419;
    }
    .footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      padding: 14px 20px;
      border-top: 1px solid #eff3f4;
      background: #ffffff;
    }
    .btn {
      appearance: none;
      border-radius: 9999px;
      padding: 8px 18px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-secondary {
      background: #ffffff;
      color: #0f1419;
      border-color: #cfd9de;
    }
    .btn-secondary:hover:not(:disabled) {
      background: #eff3f4;
    }
    .btn-primary {
      background: #1d9bf0;
      color: #ffffff;
    }
    .btn-primary:hover:not(:disabled) {
      background: #1a8cd8;
    }
    .source-banner {
      padding: 10px 14px;
      border-radius: 10px;
      background: #e8f5fd;
      border: 1px solid #b6e0fb;
      color: #0f1419;
      font-size: 13px;
      line-height: 1.45;
      font-weight: 500;
    }
    .source-banner[hidden] {
      display: none;
    }
  `;

  function createSlicerModal({
    binding,
    triggerButton,
    mode = 'local-file',
    inComposerSource = null,
    initialError,
    onClose
  }) {
    const { imageProcessor, composerAdapter } = XSlicer;
    const {
      MIN_SLICE_COUNT,
      MAX_SLICE_COUNT,
      DEFAULT_SLICE_COUNT,
      parseSliceCountInput,
      formatBytes,
      sliceImageFile
    } = imageProcessor;
    const isReplaceMode = mode === 'replace-existing' && Boolean(inComposerSource?.sourceFile);

    const host = document.createElement('div');
    host.id = 'x-slicer-modal-host';
    const shadow = host.attachShadow({ mode: 'open' });

    const styleEl = document.createElement('style');
    styleEl.textContent = STYLES;

    const backdrop = document.createElement('div');
    backdrop.className = 'backdrop';

    backdrop.innerHTML = `
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="xslicer-title" tabindex="-1">
        <div class="header">
          <h2 class="title" id="xslicer-title">X 切图助手（默认 ${DEFAULT_SLICE_COUNT} 张，可调 ${MIN_SLICE_COUNT}～${MAX_SLICE_COUNT} 张）</h2>
          <button type="button" class="close-btn" data-action="close" aria-label="关闭切图窗口">&times;</button>
        </div>
        <div class="body">
          <div class="source-banner" hidden></div>
          <div class="controls">
            <div class="file-group">
              <label class="file-label" for="xslicer-file-input">选择单张静态原图（本地处理，选图不上传）</label>
              <input
                id="xslicer-file-input"
                class="file-input"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/bmp,image/gif,image/avif"
                aria-label="选择单张静态原图"
              />
            </div>
            <div class="count-group">
              <label class="count-label" for="xslicer-slice-count">切片数量（${MIN_SLICE_COUNT}～${MAX_SLICE_COUNT} 张）</label>
              <div class="count-row">
                <div class="count-stepper">
                  <button
                    type="button"
                    class="stepper-btn"
                    data-action="decrease-count"
                    aria-label="减少切片数量"
                  >−</button>
                  <input
                    id="xslicer-slice-count"
                    class="count-input"
                    type="text"
                    inputmode="numeric"
                    role="spinbutton"
                    aria-label="切片数量"
                    aria-valuemin="${MIN_SLICE_COUNT}"
                    aria-valuemax="${MAX_SLICE_COUNT}"
                    aria-valuenow="${DEFAULT_SLICE_COUNT}"
                    aria-invalid="false"
                    value="${DEFAULT_SLICE_COUNT}"
                  />
                  <button
                    type="button"
                    class="stepper-btn"
                    data-action="increase-count"
                    aria-label="增加切片数量"
                  >+</button>
                </div>
                <div class="preset-group" role="group" aria-label="推荐切片数量">
                  <span class="preset-label">推荐：</span>
                  <button
                    type="button"
                    class="preset-btn"
                    data-action="preset-count"
                    data-count="5"
                    aria-pressed="false"
                    aria-label="推荐切片数量 5 张"
                  >5</button>
                  <button
                    type="button"
                    class="preset-btn"
                    data-action="preset-count"
                    data-count="8"
                    aria-pressed="true"
                    aria-label="推荐切片数量 8 张"
                  >8</button>
                  <button
                    type="button"
                    class="preset-btn"
                    data-action="preset-count"
                    data-count="20"
                    aria-pressed="false"
                    aria-label="推荐切片数量 20 张"
                  >20</button>
                </div>
                <div class="slice-badge" aria-live="off">左右等分 1×${DEFAULT_SLICE_COUNT}</div>
              </div>
            </div>
          </div>
          <p class="hint">
            支持单张静态位图（PNG / JPEG / WebP / BMP / 静态 GIF / 静态 AVIF，原图总像素 ≤ 500,000,000，支持 4 亿像素高解析大图）。每次打开默认 8 张（推荐 5 / 8 / 20 张，可调整为 2～20 的整数）；修改张数将从原图重新切分。大图将自动按整组统一比例缩小并优化至每片长边 ≤ 4096 px、体积 ≤ 4.5 MB（透明图保留 PNG 透明背景），处理期间可随时取消或关闭。
          </p>
          <div class="status" role="status" aria-live="polite" data-tone="neutral"></div>
          <div class="summary" hidden></div>
          <div class="preview-strip" aria-label="切片预览列表" hidden></div>
        </div>
        <div class="footer">
          <button type="button" class="btn btn-secondary" data-action="download-retained-source" hidden>下载保留的来源原图</button>
          <button type="button" class="btn btn-secondary" data-action="cancel">取消</button>
          <button type="button" class="btn btn-primary" data-action="submit" disabled>${isReplaceMode ? '确认替换并填入发帖框' : '填入发帖框'}</button>
        </div>
      </div>
    `;

    shadow.append(styleEl, backdrop);
    document.body.appendChild(host);

    const dialogEl = shadow.querySelector('.dialog');
    const sourceBannerEl = shadow.querySelector('.source-banner');
    const fileGroupEl = shadow.querySelector('.file-group');
    const closeBtn = shadow.querySelector('[data-action="close"]');
    const cancelBtn = shadow.querySelector('[data-action="cancel"]');
    const downloadRetainedBtn = shadow.querySelector('[data-action="download-retained-source"]');
    const submitBtn = shadow.querySelector('[data-action="submit"]');
    const fileInput = shadow.querySelector('#xslicer-file-input');
    const sliceCountInput = shadow.querySelector('#xslicer-slice-count');
    const decreaseBtn = shadow.querySelector('[data-action="decrease-count"]');
    const increaseBtn = shadow.querySelector('[data-action="increase-count"]');
    const presetBtns = Array.from(shadow.querySelectorAll('[data-action="preset-count"]'));
    const sliceBadge = shadow.querySelector('.slice-badge');
    const statusEl = shadow.querySelector('.status');
    const summaryEl = shadow.querySelector('.summary');
    const previewStrip = shadow.querySelector('.preview-strip');

    let activeTaskToken = 0;
    let activeAbortController = null;
    let activeTaskPromise = null;
    let pendingGeneration = null;
    let currentFile = isReplaceMode ? inComposerSource.sourceFile : null;
    let retainedSourceFile = null;
    let retainedDownloadTimer = null;
    let retainedDownloadUrl = null;
    let currentResult = null;
    let objectUrls = [];
    let isClosed = false;
    let isSubmitting = false;
    let submissionFinished = false;
    let targetInvalidated = false;
    let lastProcessedCountRaw = String(DEFAULT_SLICE_COUNT);
    let targetWatchObserver = null;
    let targetWatchTimer = null;

    function formatScalePercent(scale) {
      const pct = scale * 100;
      if (pct >= 99.95) {
        const floored2 = Math.floor(pct * 100) / 100;
        return `${Math.min(99.99, floored2).toFixed(2)}%`;
      }
      if (pct < 0.05) {
        return '< 0.1%';
      }
      return `${pct.toFixed(1)}%`;
    }

    function abortActiveTask() {
      if (activeAbortController) {
        try {
          activeAbortController.abort();
        } catch {
          // ignore
        }
        activeAbortController = null;
      }
    }

    function revokeObjectUrls() {
      for (const url of objectUrls) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      }
      objectUrls = [];
    }

    function clearPreview() {
      if (shadow.activeElement === submitBtn) {
        if (!sliceCountInput.disabled) {
          sliceCountInput.focus();
        } else if (!cancelBtn.disabled) {
          cancelBtn.focus();
        } else {
          dialogEl.focus();
        }
      }
      revokeObjectUrls();
      currentResult = null;
      previewStrip.innerHTML = '';
      previewStrip.hidden = true;
      summaryEl.textContent = '';
      summaryEl.hidden = true;
      submitBtn.disabled = true;
    }

    function setStatus(tone, text) {
      statusEl.setAttribute('data-tone', tone);
      statusEl.textContent = text;
    }

    function stopTargetWatch() {
      if (targetWatchObserver) {
        targetWatchObserver.disconnect();
        targetWatchObserver = null;
      }
      if (targetWatchTimer) {
        clearInterval(targetWatchTimer);
        targetWatchTimer = null;
      }
    }

    function invalidateTargetSession(reasonMessage) {
      if (isClosed || targetInvalidated || submissionFinished) return;
      targetInvalidated = true;
      activeTaskToken++;
      pendingGeneration = null;
      abortActiveTask();
      stopTargetWatch();
      const active = shadow.activeElement;
      if (
        active === fileInput ||
        active === sliceCountInput ||
        active === decreaseBtn ||
        active === increaseBtn ||
        presetBtns.includes(active) ||
        active === submitBtn
      ) {
        if (!cancelBtn.disabled) {
          cancelBtn.focus();
        } else {
          dialogEl.focus();
        }
      }
      clearPreview();
      fileInput.disabled = true;
      sliceCountInput.disabled = true;
      updateSliceCountVisuals(parseSliceCountInput(sliceCountInput.value));
      submitBtn.disabled = true;
      submitBtn.textContent = '目标已失效';
      cancelBtn.textContent = '关闭';
      setStatus('error', `${reasonMessage} 请关闭窗口并从有效的新建帖子发帖框重新打开切图。`);
      if (!cancelBtn.disabled) {
        cancelBtn.focus();
      } else {
        dialogEl.focus();
      }
    }

    function checkPreviewTargetIntegrity() {
      if (isClosed || initialError || targetInvalidated || isSubmitting || submissionFinished) {
        return true;
      }
      if (isReplaceMode) {
        const replaceCheck = composerAdapter.validateComposerForReplace(binding, inComposerSource);
        if (!replaceCheck.ok) {
          invalidateTargetSession(replaceCheck.message);
          return false;
        }
        return true;
      }
      const structCheck = composerAdapter.validateTargetStructure(binding, { allowReplacedFileInput: false });
      if (!structCheck.ok) {
        invalidateTargetSession(structCheck.message);
        return false;
      }
      return true;
    }

    function startTargetWatch() {
      if (isClosed || initialError || targetInvalidated || isSubmitting || submissionFinished) return;
      stopTargetWatch();
      if (typeof MutationObserver !== 'undefined') {
        targetWatchObserver = new MutationObserver((mutations) => {
          if (mutations.every((m) => m.target === host || host.contains(m.target))) {
            return;
          }
          checkPreviewTargetIntegrity();
        });
        targetWatchObserver.observe(document.documentElement || document.body, {
          childList: true,
          subtree: true,
          attributes: true
        });
      }
      targetWatchTimer = setInterval(checkPreviewTargetIntegrity, 150);
    }

    function updateSliceCountVisuals(countCheck) {
      const locked =
        Boolean(initialError) ||
        targetInvalidated ||
        isSubmitting ||
        submissionFinished ||
        (isReplaceMode && !currentFile);
      let nextDecreaseDisabled = locked;
      let nextIncreaseDisabled = locked;
      if (countCheck.ok) {
        const count = countCheck.value;
        sliceCountInput.setAttribute('aria-invalid', 'false');
        sliceCountInput.setAttribute('aria-valuenow', String(count));
        sliceBadge.textContent = `左右等分 1×${count}`;
        nextDecreaseDisabled = locked || count <= MIN_SLICE_COUNT;
        nextIncreaseDisabled = locked || count >= MAX_SLICE_COUNT;
      } else {
        sliceCountInput.setAttribute('aria-invalid', 'true');
        sliceCountInput.removeAttribute('aria-valuenow');
        sliceBadge.textContent = '切片数量无效';
      }

      const active = shadow.activeElement;
      if (
        (active === decreaseBtn && nextDecreaseDisabled) ||
        (active === increaseBtn && nextIncreaseDisabled) ||
        (presetBtns.includes(active) && locked)
      ) {
        if (!locked && !sliceCountInput.disabled) {
          sliceCountInput.focus();
        } else if (!cancelBtn.disabled) {
          cancelBtn.focus();
        } else {
          dialogEl.focus();
        }
      }

      decreaseBtn.disabled = nextDecreaseDisabled;
      increaseBtn.disabled = nextIncreaseDisabled;
      for (const btn of presetBtns) {
        btn.disabled = locked;
        const presetVal = Number(btn.getAttribute('data-count'));
        btn.setAttribute('aria-pressed', countCheck.ok && countCheck.value === presetVal ? 'true' : 'false');
      }
    }

    function renderPreview(result) {
      revokeObjectUrls();
      previewStrip.innerHTML = '';

      const widths = result.slices.map((s) => s.width);
      const minW = Math.min(...widths);
      const maxW = Math.max(...widths);
      const outH = result.slices[0]?.height ?? 0;
      const widthLabel = minW === maxW ? String(minW) : `${minW}～${maxW}`;
      const sliceDimLabel = `${widthLabel} × ${outH} px`;
      const formatUpper = result.format === 'jpeg' ? 'JPEG' : 'PNG';
      const scaleDesc = result.scaled
        ? `已等比缩小（缩放比例 ${formatScalePercent(result.scale)}）`
        : '未缩小（保留原切片尺寸）';
      const encodingDesc = result.lossy
        ? `JPEG 有损编码（编码质量参数 ${result.jpegQuality.toFixed(2)}）`
        : 'PNG 无损编码';

      summaryEl.textContent = `原图尺寸：${result.sourceWidth} × ${result.sourceHeight} px（${result.sourcePixels.toLocaleString()} 像素） · 输出：${result.slices.length} 张 ${formatUpper} 切片（1×${result.sliceCount}，输出尺寸 ${sliceDimLabel}） · 优化：${scaleDesc} · ${encodingDesc}`;
      summaryEl.hidden = false;

      for (const slice of result.slices) {
        const url = URL.createObjectURL(slice.file);
        objectUrls.push(url);

        const card = document.createElement('div');
        card.className = 'slice-card';
        card.setAttribute('data-slice-name', slice.fileName);

        const frame = document.createElement('div');
        frame.className = 'slice-frame';

        // Render true aspect ratio of each slice (height 150px for tall/narrow slices, capped width for ultra-wide)
        const baseHeight = 150;
        const ratio = slice.width / slice.height;
        let frameWidth = Math.round(baseHeight * ratio);
        let frameHeight = baseHeight;
        if (frameWidth > 220) {
          frameWidth = 220;
          frameHeight = Math.max(8, Math.round(220 / ratio));
        } else if (frameWidth < 4) {
          frameWidth = 4;
        }
        frame.style.width = `${frameWidth}px`;
        frame.style.height = `${frameHeight}px`;

        const img = document.createElement('img');
        img.className = 'slice-img';
        img.src = url;
        img.alt = `${slice.fileName} (${slice.width}×${slice.height})`;
        frame.appendChild(img);

        const meta = document.createElement('div');
        meta.className = 'slice-meta';
        meta.innerHTML = `
          <div class="slice-name">${slice.fileName}</div>
          <div>${slice.width}×${slice.height} px</div>
          <div>${formatBytes(slice.bytes)}</div>
        `;

        card.append(frame, meta);
        previewStrip.appendChild(card);
      }

      previewStrip.hidden = false;
    }

    async function runSliceGeneration(file, sliceCount, token) {
      if (isClosed || targetInvalidated || isSubmitting || submissionFinished || token !== activeTaskToken) {
        return;
      }
      if (!checkPreviewTargetIntegrity()) return;
      abortActiveTask();
      const controller = new AbortController();
      activeAbortController = controller;
      setStatus('busy', `正在本地解码并从原图左右等分为 ${sliceCount} 张切片（可随时取消）...`);

      try {
        const result = await sliceImageFile(file, sliceCount, {
          signal: controller.signal,
          isCancelled: () =>
            controller.signal.aborted || isClosed || targetInvalidated || token !== activeTaskToken,
          onProgress(info) {
            if (
              controller.signal.aborted ||
              isClosed ||
              targetInvalidated ||
              token !== activeTaskToken
            ) {
              return;
            }
            if (info.stage === 'decoding') {
              setStatus('busy', '正在本地解码原图，请稍候（可随时取消或关闭）...');
            } else if (info.stage === 'analyzing') {
              setStatus('busy', '正在检测原图透明通道（透明图将保留 PNG 透明背景）...');
            } else if (info.stage === 'encoding') {
              const formatLabel =
                info.format === 'jpeg'
                  ? `JPEG 质量参数 ${info.quality.toFixed(2)}`
                  : 'PNG';
              const scaleLabel =
                info.scale < 1 ? `缩放 ${formatScalePercent(info.scale)}` : '原切片尺寸';
              setStatus(
                'busy',
                `正在本地优化生成 ${info.totalSlices} 张切片（第 ${info.round} 轮 · ${scaleLabel} · ${formatLabel} · 第 ${info.sliceIndex + 1}/${info.totalSlices} 片）...`
              );
            }
          }
        });
        if (
          controller.signal.aborted ||
          isClosed ||
          targetInvalidated ||
          token !== activeTaskToken ||
          !result
        ) {
          return;
        }
        if (!checkPreviewTargetIntegrity()) return;

        const latestCount = parseSliceCountInput(sliceCountInput.value);
        if (
          !latestCount.ok ||
          latestCount.value !== sliceCount ||
          result.sliceCount !== sliceCount ||
          result.slices.length !== sliceCount
        ) {
          return;
        }

        currentResult = result;
        renderPreview(result);
        submitBtn.disabled = false;
        const scaleSummary = result.scaled
          ? `已等比缩小（${formatScalePercent(result.scale)}）`
          : '未缩小';
        const formatSummary = result.lossy
          ? `JPEG 有损编码（质量参数 ${result.jpegQuality.toFixed(2)}）`
          : 'PNG 无损编码';
        setStatus(
          'success',
          isReplaceMode
            ? `已从发帖框内图片生成 ${result.slices.length} 张切片（${scaleSummary} · ${formatSummary}），请核对上方实际最终切片预览、尺寸和体积后点击“确认替换并填入发帖框”（确认前不会移除原附件）。`
            : `已从原图生成 ${result.slices.length} 张切片（${scaleSummary} · ${formatSummary}），请核对上方实际最终切片预览、尺寸和体积后点击“填入发帖框”。`
        );
      } catch (err) {
        if (controller.signal.aborted || isClosed || targetInvalidated || token !== activeTaskToken) {
          return;
        }
        clearPreview();
        if (err?.code === 'width-too-small') {
          sliceCountInput.setAttribute('aria-invalid', 'true');
          sliceBadge.textContent = '超出原图宽度';
        } else if (err?.code === 'zero-dimension') {
          sliceCountInput.setAttribute('aria-invalid', 'true');
          sliceBadge.textContent = '缩放后零尺寸';
        }
        const isRecoverableCountErr =
          err?.code === 'width-too-small' ||
          err?.code === 'budget-exceeded' ||
          err?.code === 'zero-dimension';
        if (!isRecoverableCountErr) {
          currentFile = null;
          fileInput.value = '';
          if (isReplaceMode) {
            sliceCountInput.disabled = true;
            updateSliceCountVisuals(parseSliceCountInput(sliceCountInput.value));
            cancelBtn.textContent = '关闭';
            setStatus(
              'error',
              `${err?.message || '处理图片时发生未知错误'} 已保留发帖框原附件与文案（未移除也未替换）。请关闭窗口并在发帖框中手动移除原附件后，改用本地原文件切图。`
            );
            cancelBtn.focus();
            return;
          }
        }
        if (isReplaceMode && isRecoverableCountErr) {
          setStatus(
            'error',
            `${err?.message || '当前切片数量无法生成。'} 已保留发帖框原附件与文案（未移除也未替换），请调整切片数量后重试。`
          );
          return;
        }
        setStatus('error', err?.message || '处理图片时发生未知错误，请更换图片后重试。');
      } finally {
        if (activeAbortController === controller) {
          activeAbortController = null;
        }
      }
    }

    function scheduleSliceGeneration(file, sliceCount, token) {
      pendingGeneration = { file, sliceCount, token };
      setStatus('busy', `正在本地解码并从原图左右等分为 ${sliceCount} 张切片（可随时取消）...`);
      if (activeTaskPromise) {
        return activeTaskPromise;
      }
      activeTaskPromise = (async () => {
        try {
          while (pendingGeneration) {
            const req = pendingGeneration;
            pendingGeneration = null;
            if (
              isClosed ||
              targetInvalidated ||
              isSubmitting ||
              submissionFinished ||
              req.token !== activeTaskToken
            ) {
              continue;
            }
            await runSliceGeneration(req.file, req.sliceCount, req.token);
          }
        } finally {
          activeTaskPromise = null;
        }
      })();
      return activeTaskPromise;
    }

    async function handleSliceCountChange() {
      if (isClosed || isSubmitting || submissionFinished || initialError || targetInvalidated) return;
      if (!checkPreviewTargetIntegrity()) return;

      lastProcessedCountRaw = sliceCountInput.value;
      pendingGeneration = null;
      abortActiveTask();
      const token = ++activeTaskToken;
      clearPreview();

      const countCheck = parseSliceCountInput(sliceCountInput.value);
      updateSliceCountVisuals(countCheck);

      if (!countCheck.ok) {
        setStatus('error', countCheck.message);
        return;
      }

      if (!currentFile) {
        setStatus(
          'neutral',
          isReplaceMode
            ? '发帖框内图片不支持切分且未作任何改动，请关闭窗口后手动处理或改用本地原文件。'
            : `已设置切片数量为 ${countCheck.value} 张，请选择一张本地静态原图。`
        );
        return;
      }

      await scheduleSliceGeneration(currentFile, countCheck.value, token);
    }

    function stepSliceCount(delta) {
      if (isClosed || isSubmitting || submissionFinished || initialError || targetInvalidated) return;
      if (!checkPreviewTargetIntegrity()) return;
      const parsed = parseSliceCountInput(sliceCountInput.value);
      let next;
      if (parsed.ok) {
        next = Math.max(MIN_SLICE_COUNT, Math.min(MAX_SLICE_COUNT, parsed.value + delta));
      } else {
        const trimmed = sliceCountInput.value.trim();
        const numeric = /^-?\d+$/.test(trimmed) ? Number(trimmed) : NaN;
        if (Number.isFinite(numeric)) {
          next = Math.max(MIN_SLICE_COUNT, Math.min(MAX_SLICE_COUNT, numeric));
        } else {
          next = DEFAULT_SLICE_COUNT;
        }
      }
      if (
        parsed.ok &&
        next === parsed.value &&
        sliceCountInput.value === String(next) &&
        (!currentFile || currentResult?.sliceCount === next)
      ) {
        return;
      }
      sliceCountInput.value = String(next);
      handleSliceCountChange();
    }

    async function handleFileChange() {
      if (isClosed || isSubmitting || submissionFinished || initialError || targetInvalidated) return;
      if (!checkPreviewTargetIntegrity()) return;

      pendingGeneration = null;
      abortActiveTask();
      const token = ++activeTaskToken;
      const files = fileInput.files;
      clearPreview();

      if (!files || files.length === 0) {
        currentFile = null;
        const countCheck = parseSliceCountInput(sliceCountInput.value);
        updateSliceCountVisuals(countCheck);
        if (!countCheck.ok) {
          setStatus('error', countCheck.message);
        } else {
          setStatus('neutral', '已取消选图，请选择一张本地静态原图。');
        }
        return;
      }

      if (files.length > 1) {
        currentFile = null;
        setStatus('error', '一次只能选择 1 张原图，请重新选择单张静态位图。');
        return;
      }

      currentFile = files[0];
      const countCheck = parseSliceCountInput(sliceCountInput.value);
      updateSliceCountVisuals(countCheck);

      if (!countCheck.ok) {
        setStatus('error', countCheck.message);
        return;
      }

      await scheduleSliceGeneration(currentFile, countCheck.value, token);
    }

    async function handleSubmit() {
      if (isClosed || isSubmitting || submissionFinished || targetInvalidated || !currentResult) return;
      if (!checkPreviewTargetIntegrity()) return;

      const countCheck = parseSliceCountInput(sliceCountInput.value);
      if (
        !countCheck.ok ||
        currentResult.sliceCount !== countCheck.value ||
        currentResult.slices.length !== countCheck.value
      ) {
        clearPreview();
        updateSliceCountVisuals(countCheck);
        setStatus(
          'error',
          countCheck.ok ? '切片数量与当前预览不一致，请等待重新生成后再提交。' : countCheck.message
        );
        return;
      }

      const submittedResult = currentResult;
      const expectedCount = submittedResult.slices.length;

      stopTargetWatch();
      pendingGeneration = null;
      abortActiveTask();
      isSubmitting = true;
      activeTaskToken++;
      dialogEl.focus();
      fileInput.disabled = true;
      sliceCountInput.disabled = true;
      decreaseBtn.disabled = true;
      increaseBtn.disabled = true;
      for (const btn of presetBtns) {
        btn.disabled = true;
      }
      submitBtn.disabled = true;
      submitBtn.setAttribute('aria-busy', 'true');
      cancelBtn.disabled = true;
      closeBtn.disabled = true;

      const preValidation = isReplaceMode
        ? composerAdapter.validateComposerForReplace(binding, inComposerSource)
        : composerAdapter.validateTargetComposer(binding);
      if (!preValidation.ok) {
        isSubmitting = false;
        submitBtn.removeAttribute('aria-busy');
        cancelBtn.disabled = false;
        closeBtn.disabled = false;
        if (
          isReplaceMode ||
          preValidation.reason === 'target-lost' ||
          preValidation.reason === 'target-ambiguous' ||
          preValidation.reason === 'not-new-post'
        ) {
          invalidateTargetSession(preValidation.message);
          return;
        }
        fileInput.disabled = false;
        sliceCountInput.disabled = false;
        updateSliceCountVisuals(countCheck);
        submitBtn.disabled = false;
        setStatus('error', preValidation.message);
        submitBtn.focus();
        startTargetWatch();
        return;
      }

      const feedbackToken = composerAdapter.nextSubmissionToken(binding);
      let uploadReadyDispatched = false;

      setStatus(
        'busy',
        isReplaceMode
          ? `正在移除发帖框内原附件并替换为 ${expectedCount} 张切片，请勿重复操作...`
          : `正在向绑定的发帖框填入 ${expectedCount} 张切片，请勿重复操作...`
      );

      const submitCallbacks = {
        onProgress(stage, readyCount, totalExpected) {
          if (isClosed || uploadReadyDispatched) return;
          if (stage === 'removing') {
            setStatus('busy', `正在移除原附件，准备填入 ${totalExpected} 张切片，请勿重复操作...`);
          } else if (stage === 'uploading') {
            setStatus('busy', `上传中：已就绪 ${readyCount} / ${totalExpected} 张切片，等待全部上传完成...`);
          } else if (stage === 'partial') {
            setStatus('busy', `正在等待发帖框确认附件（当前 ${readyCount} / ${totalExpected} 张）...`);
          } else if (stage === 'verifying') {
            setStatus('busy', `正在确认 ${totalExpected} 张切片的上传就绪状态...`);
          }
        },
        onUploadReady(info) {
          uploadReadyDispatched = true;
          isSubmitting = false;
          submissionFinished = true;
          submitBtn.removeAttribute('aria-busy');
          cancelBtn.disabled = false;
          closeBtn.disabled = false;
          const replaceNote = isReplaceMode ? '（已替换原附件）' : '';
          const draftNote = info.hasDraft ? '（已保留原有文案）' : '';
          composerAdapter.showComposerFeedback(binding, {
            token: feedbackToken,
            tone: 'warning',
            message: `上传完成，共 ${info.count} 张${replaceNote}，请检查顺序后再发布${draftNote}。`,
            watchAttachments: false,
            expectedCount: info.count
          });
          retainedSourceFile = null;
          close();
        }
      };

      const outcome = isReplaceMode
        ? await composerAdapter.replaceAttachmentAndSubmitSlices(
            binding,
            inComposerSource,
            submittedResult.slices,
            submitCallbacks
          )
        : await composerAdapter.submitSlicesToComposer(binding, submittedResult.slices, submitCallbacks);

      if (uploadReadyDispatched) {
        if (
          outcome.reason === 'target-lost-during-upload' ||
          outcome.attachmentsCleared ||
          !binding.root ||
          !binding.root.isConnected
        ) {
          composerAdapter.clearComposerFeedback(binding);
          return;
        }
        if (outcome.orderStatus === 'confirmed') {
          composerAdapter.showComposerFeedback(binding, {
            token: feedbackToken,
            tone: 'success',
            message: outcome.message,
            watchAttachments: true,
            expectedCount: outcome.count
          });
        } else if (outcome.orderStatus === 'unconfirmed') {
          composerAdapter.showComposerFeedback(binding, {
            token: feedbackToken,
            tone: 'warning',
            message: outcome.message,
            watchAttachments: true,
            expectedCount: outcome.count
          });
        } else if (outcome.orderStatus === 'changed') {
          composerAdapter.showComposerFeedback(binding, {
            token: feedbackToken,
            tone: 'warning',
            message: outcome.message,
            watchAttachments: true,
            alreadyInvalidated: true,
            expectedCount: outcome.count
          });
        } else {
          composerAdapter.showComposerFeedback(binding, {
            token: feedbackToken,
            tone: 'error',
            message: outcome.message,
            watchAttachments: true,
            alreadyInvalidated: outcome.orderStatus !== 'mismatch',
            expectedCount: outcome.count || expectedCount
          });
        }
        return;
      }

      isSubmitting = false;
      submitBtn.removeAttribute('aria-busy');
      cancelBtn.disabled = false;
      closeBtn.disabled = false;

      if (outcome.ok) {
        submissionFinished = true;
        submitBtn.disabled = true;
        submitBtn.textContent = isReplaceMode ? '已替换，等待发布' : '已填入，等待发布';
        cancelBtn.textContent = '关闭';
        setStatus('success', outcome.message);
        cancelBtn.focus();
      } else {
        // Keep submitBtn locked after dispatch to avoid auto-retrying or double-appending partial results
        if (
          outcome.reason === 'target-lost-during-upload' ||
          outcome.reason === 'target-lost-during-remove' ||
          outcome.reason === 'target-lost-after-remove'
        ) {
          targetInvalidated = true;
        }
        submissionFinished = true;
        submitBtn.disabled = true;
        const isUnconfirmedStatus = outcome.reason === 'upload-status-unconfirmed';
        submitBtn.textContent = isUnconfirmedStatus ? '暂无法确认' : '本次未完成';
        cancelBtn.textContent = '关闭';

        if (isReplaceMode && (outcome.originalRemoved || outcome.originalRemovalUncertain)) {
          retainedSourceFile = currentFile || inComposerSource?.sourceFile || null;
          const countNow =
            typeof outcome.currentAttachmentCount === 'number'
              ? outcome.currentAttachmentCount
              : composerAdapter.countCurrentAttachments(binding);
          const retainedGuide = retainedSourceFile
            ? '本次来源原图仅保存在当前窗口会话内存中（关闭窗口即释放，不做持久化存储），您可点击下方“下载保留的来源原图”保存后再到发帖框手动补传或调整。'
            : '原有文案与现存附件均已保留，请到发帖框手动核对处理。';
          const statusPrefix = outcome.originalRemoved
            ? `原附件已从发帖框移除，但后续切片提交或上传未完成（当前发帖框内共有 ${countNow} 张附件）。`
            : `已触发移除原附件，但无法确认原附件是否已安全移除（当前发帖框内可见 ${countNow} 张附件，平台可能仍在延迟处理或状态已变化）。`;
          const postRemoveMsg = `${statusPrefix}${outcome.message} 扩展不会自动重新上传原图、不会清空现有附件或部分成功的切片，也不会整组重传；原有文案已保留。${retainedGuide}`;
          if (retainedSourceFile) {
            downloadRetainedBtn.hidden = false;
            downloadRetainedBtn.disabled = false;
          }
          setStatus(isUnconfirmedStatus ? 'warning' : 'error', postRemoveMsg);
        } else {
          setStatus(isUnconfirmedStatus ? 'warning' : 'error', outcome.message);
        }
        cancelBtn.focus();
      }
    }

    function clearRetainedDownload() {
      if (retainedDownloadTimer) {
        clearTimeout(retainedDownloadTimer);
        retainedDownloadTimer = null;
      }
      if (retainedDownloadUrl) {
        try {
          URL.revokeObjectURL(retainedDownloadUrl);
        } catch {
          // ignore
        }
        retainedDownloadUrl = null;
      }
    }

    function handleDownloadRetainedSource() {
      if (isClosed || !retainedSourceFile) return;
      clearRetainedDownload();
      retainedDownloadUrl = URL.createObjectURL(retainedSourceFile);
      const a = document.createElement('a');
      a.href = retainedDownloadUrl;
      a.download = retainedSourceFile.name || inComposerSource?.fileName || 'source-image.png';
      a.style.display = 'none';
      shadow.appendChild(a);
      a.click();
      a.remove();
      retainedDownloadTimer = setTimeout(() => {
        clearRetainedDownload();
      }, 30000);
    }

    function getFocusableElements() {
      return Array.from(
        dialogEl.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])')
      ).filter((el) => !el.hidden && !el.closest('[hidden]'));
    }

    function stopHostKeyLeak(event) {
      event.stopPropagation();
    }

    function handleDocumentKeyDown(event) {
      if (isClosed) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!isSubmitting) {
          close();
        }
        return;
      }
      if (event.key === 'Tab') {
        event.stopPropagation();
        const focusables = getFocusableElements();
        if (focusables.length === 0) {
          event.preventDefault();
          dialogEl.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = shadow.activeElement;
        if (event.shiftKey) {
          if (active === first || !dialogEl.contains(active)) {
            event.preventDefault();
            last.focus();
          }
        } else if (active === last || !dialogEl.contains(active)) {
          event.preventDefault();
          first.focus();
        }
        return;
      }

      if (event.target !== host && !host.contains(event.target)) {
        event.stopPropagation();
      }
    }

    function isElementInAnyComposerControl(el) {
      if (!el || el === document.body || el === document.documentElement) return false;
      const discovered = composerAdapter.discoverComposers(document);
      if (discovered.some((c) => c.root.contains(el))) {
        return true;
      }
      return Boolean(
        el.closest?.(
          '[data-composer-id], [data-testid^="tweetTextarea_"], [role="textbox"][contenteditable="true"], [data-testid="toolBar"], [data-testid="tweetButtonInline"], [data-testid="tweetButton"], [data-x-slicer-entry="true"]'
        )
      );
    }

    function captureFocusStateBeforeClose() {
      const active = document.activeElement;
      const focusWasInModal = Boolean(
        active === host ||
          (active && host.contains(active)) ||
          (shadow && shadow.activeElement)
      );
      const focusWasLost = !active || active === document.body || active === document.documentElement;
      return { activeBefore: active, focusWasInModal, focusWasLost };
    }

    function restoreFocusToTarget(focusState = {}) {
      const { activeBefore = null, focusWasInModal = true, focusWasLost = false } = focusState;
      const targetStillValid =
        !targetInvalidated &&
        composerAdapter.validateTargetStructure(binding, { allowReplacedFileInput: true }).ok;

      const activeAfterRemove = document.activeElement;
      const droppedToDocumentAfterRemove =
        !activeAfterRemove ||
        activeAfterRemove === document.body ||
        activeAfterRemove === document.documentElement;

      const shouldRestore = focusWasInModal || focusWasLost || droppedToDocumentAfterRemove;

      if (targetStillValid) {
        if (!shouldRestore && activeBefore && activeBefore.isConnected) {
          return;
        }
        if (
          triggerButton &&
          triggerButton.isConnected &&
          binding.root.contains(triggerButton) &&
          composerAdapter.isElementVisible(triggerButton)
        ) {
          triggerButton.focus();
          return;
        }
        const entryBtn = binding.root.querySelector('button[data-x-slicer-entry="true"]');
        if (entryBtn && composerAdapter.isElementVisible(entryBtn)) {
          entryBtn.focus();
          return;
        }
        if (binding.textbox && binding.textbox.isConnected && composerAdapter.isElementVisible(binding.textbox)) {
          binding.textbox.focus();
          return;
        }
      }

      const active = document.activeElement;
      if (active && typeof active.blur === 'function' && isElementInAnyComposerControl(active)) {
        active.blur();
      }
    }

    function close() {
      if (isClosed || isSubmitting) return;
      const focusState = captureFocusStateBeforeClose();
      isClosed = true;
      activeTaskToken++;
      pendingGeneration = null;
      abortActiveTask();
      stopTargetWatch();
      document.removeEventListener('keydown', handleDocumentKeyDown, true);
      host.removeEventListener('keydown', stopHostKeyLeak);
      host.removeEventListener('keyup', stopHostKeyLeak);
      host.removeEventListener('keypress', stopHostKeyLeak);
      clearRetainedDownload();
      retainedSourceFile = null;
      if (inComposerSource) {
        inComposerSource.sourceFile = null;
        inComposerSource.slotElement = null;
        inComposerSource.imgElement = null;
        inComposerSource.removeButton = null;
      }
      currentFile = null;
      fileInput.value = '';
      clearPreview();
      host.remove();
      restoreFocusToTarget(focusState);
      if (typeof onClose === 'function') {
        onClose();
      }
    }

    fileInput.addEventListener('change', handleFileChange);
    sliceCountInput.addEventListener('input', handleSliceCountChange);
    sliceCountInput.addEventListener('change', () => {
      if (sliceCountInput.value !== lastProcessedCountRaw) {
        handleSliceCountChange();
      }
    });
    sliceCountInput.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        stepSliceCount(1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        stepSliceCount(-1);
      }
    });
    decreaseBtn.addEventListener('click', () => stepSliceCount(-1));
    increaseBtn.addEventListener('click', () => stepSliceCount(1));
    for (const btn of presetBtns) {
      btn.addEventListener('click', () => {
        if (isClosed || isSubmitting || submissionFinished || initialError || targetInvalidated) return;
        const targetCount = Number(btn.getAttribute('data-count'));
        if (!Number.isInteger(targetCount)) return;
        const parsed = parseSliceCountInput(sliceCountInput.value);
        if (
          parsed.ok &&
          parsed.value === targetCount &&
          sliceCountInput.value === String(targetCount) &&
          (!currentFile || currentResult?.sliceCount === targetCount)
        ) {
          return;
        }
        sliceCountInput.value = String(targetCount);
        handleSliceCountChange();
      });
    }
    downloadRetainedBtn.addEventListener('click', handleDownloadRetainedSource);
    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    submitBtn.addEventListener('click', handleSubmit);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop && !isSubmitting) {
        close();
      }
    });
    host.addEventListener('keydown', stopHostKeyLeak);
    host.addEventListener('keyup', stopHostKeyLeak);
    host.addEventListener('keypress', stopHostKeyLeak);
    document.addEventListener('keydown', handleDocumentKeyDown, true);

    if (initialError) {
      fileInput.disabled = true;
      sliceCountInput.disabled = true;
      decreaseBtn.disabled = true;
      increaseBtn.disabled = true;
      for (const btn of presetBtns) {
        btn.disabled = true;
      }
      submitBtn.disabled = true;
      cancelBtn.textContent = '关闭';
      setStatus('error', initialError);
      cancelBtn.focus();
    } else if (isReplaceMode) {
      fileInput.disabled = true;
      fileGroupEl.hidden = true;
      const sourceName = inComposerSource.fileName || 'composer-image';
      const dimText =
        inComposerSource.naturalWidth > 0 && inComposerSource.naturalHeight > 0
          ? ` · 预览 ${inComposerSource.naturalWidth}×${inComposerSource.naturalHeight} px`
          : '';
      sourceBannerEl.hidden = false;
      sourceBannerEl.textContent = `来源：当前发帖框内图片（${sourceName}${dimText}） · 确认后将替换该原附件并保留已有文案；取消或关闭不会改动原附件。`;
      updateSliceCountVisuals({ ok: true, value: DEFAULT_SLICE_COUNT });
      sliceCountInput.focus();
      startTargetWatch();
      scheduleSliceGeneration(inComposerSource.sourceFile, DEFAULT_SLICE_COUNT, ++activeTaskToken);
    } else {
      updateSliceCountVisuals({ ok: true, value: DEFAULT_SLICE_COUNT });
      setStatus(
        'neutral',
        '请选择一张本地静态原图，默认左右等分为 8 张（可调 2～20 张），切片预览与生成全部在本地完成；目标发帖框已有文案将完整保留。'
      );
      fileInput.focus();
      startTargetWatch();
    }

    return {
      close
    };
  }

  XSlicer.modalUi = {
    createSlicerModal
  };
})();
