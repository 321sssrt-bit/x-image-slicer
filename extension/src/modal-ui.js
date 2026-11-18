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
      overscroll-behavior: contain;
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
    .preset-btn:focus-visible,
    .mode-btn:focus-visible,
    .clear-merges-btn:focus-visible,
    .preview-strip:focus-visible {
      outline: 2px solid #1d9bf0;
      outline-offset: 2px;
    }
    .body {
      padding: 16px 20px;
      overflow-y: auto;
      overscroll-behavior: contain;
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
    .mode-label,
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
    .mode-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .mode-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .clear-merges-btn {
      appearance: none;
      height: 26px;
      padding: 0 12px;
      border-radius: 9999px;
      border: 1px solid #cfd9de;
      background: #ffffff;
      color: #0f1419;
      font-size: 12px;
      font-weight: 600;
      line-height: 1;
      cursor: pointer;
    }
    .clear-merges-btn[hidden] {
      display: none;
    }
    .clear-merges-btn:hover:not(:disabled) {
      background: #eff3f4;
    }
    .clear-merges-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .mode-switch {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 2px;
      border: 1px solid #cfd9de;
      border-radius: 9999px;
      background: #ffffff;
    }
    .mode-btn {
      appearance: none;
      height: 26px;
      padding: 0 14px;
      border: 0;
      border-radius: 9999px;
      background: transparent;
      color: #536471;
      font-size: 13px;
      font-weight: 600;
      line-height: 1;
      cursor: pointer;
    }
    .mode-btn:hover:not(:disabled) {
      background: #eff3f4;
    }
    .mode-btn[aria-pressed="true"] {
      background: #1d9bf0;
      color: #ffffff;
    }
    .mode-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
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
      /* Never squeeze the cards: a shrunk strip clips their tops (and the 拆回 lines); let .body scroll instead */
      flex: 0 0 auto;
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
    .preview-strip[data-split-mode="free"] {
      gap: 0;
    }
    .preview-strip[aria-busy="true"] .slice-card {
      opacity: 0.45;
      filter: grayscale(1);
    }
    .slice-divider {
      appearance: none;
      position: relative;
      flex: 0 0 auto;
      align-self: stretch;
      width: 22px;
      margin: 0;
      padding: 0;
      border: 0;
      background: transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .slice-divider::before {
      content: "";
      position: absolute;
      top: 6px;
      bottom: 6px;
      left: 50%;
      border-left: 1px dashed #8b98a5;
    }
    .slice-divider:hover:not(:disabled)::before,
    .slice-divider:focus-visible::before {
      border-left: 2px solid #f4212e;
    }
    .slice-divider:disabled {
      cursor: not-allowed;
    }
    .slice-divider:disabled::before {
      border-left-color: #cfd9de;
    }
    .slice-divider:focus-visible,
    .merged-divider:focus-visible {
      outline: 2px solid #1d9bf0;
      outline-offset: -2px;
      border-radius: 6px;
    }
    .divider-mark,
    .unmerge-mark {
      position: relative;
      flex: 0 0 auto;
      width: 18px;
      height: 18px;
      border-radius: 9999px;
      background: #f4212e;
      color: #ffffff;
      font-size: 13px;
      font-weight: 700;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
    }
    .slice-divider:hover:not(:disabled) .divider-mark,
    .slice-divider:focus-visible .divider-mark {
      opacity: 1;
    }
    /* 拆回 hit box: left and width are set per line so neighbouring lines never overlap */
    .merged-divider {
      appearance: none;
      position: absolute;
      top: 0;
      bottom: 0;
      margin: 0;
      padding: 0;
      border: 0;
      background: transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .merged-divider::before {
      content: "";
      position: absolute;
      top: 0;
      bottom: 0;
      left: 50%;
      border-left: 1px dashed rgba(255, 255, 255, 0.85);
      filter: drop-shadow(0 0 1px rgba(15, 20, 25, 0.45));
    }
    .merged-divider:hover:not(:disabled),
    .merged-divider:focus-visible {
      z-index: 1;
    }
    .merged-divider:hover:not(:disabled)::before,
    .merged-divider:focus-visible::before {
      border-left: 2px solid #1d9bf0;
      filter: none;
    }
    .merged-divider:disabled {
      cursor: not-allowed;
    }
    .unmerge-mark {
      background: #1d9bf0;
    }
    .merged-divider:hover:not(:disabled) .unmerge-mark,
    .merged-divider:focus-visible .unmerge-mark {
      opacity: 1;
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
    /* content-box: the inline width × height is exactly the image box, so 拆回 lines land on the real 分割线 */
    .slice-frame {
      position: relative;
      box-sizing: content-box;
      height: 150px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: repeating-conic-gradient(#eef1f4 0% 25%, #ffffff 0% 50%) 50% / 12px 12px;
      border: 1px solid #e1e8ed;
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
    splitMode: initialSplitMode,
    inComposerSource = null,
    initialError,
    onClose
  }) {
    const { imageProcessor, composerAdapter, preferences } = XSlicer;
    const {
      MIN_SLICE_COUNT,
      MAX_SLICE_COUNT,
      DEFAULT_SLICE_COUNT,
      parseSliceCountInput,
      formatBytes,
      equalSplitX,
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
            <div class="mode-group">
              <span class="mode-label" id="xslicer-mode-label">切分模式</span>
              <div class="mode-row">
                <div class="mode-switch" role="group" aria-labelledby="xslicer-mode-label">
                  <button
                    type="button"
                    class="mode-btn"
                    data-action="split-mode"
                    data-split-mode="equal"
                    aria-pressed="true"
                    aria-label="左右等分"
                  >等分</button>
                  <button
                    type="button"
                    class="mode-btn"
                    data-action="split-mode"
                    data-split-mode="free"
                    aria-pressed="false"
                    aria-label="自由切分"
                  >自由</button>
                </div>
                <button type="button" class="clear-merges-btn" data-action="clear-merges" hidden disabled>清除合并</button>
              </div>
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
            支持单张静态位图（PNG / JPEG / WebP / BMP / 静态 GIF / 静态 AVIF，原图总像素 ≤ 500,000,000，支持 4 亿像素高解析大图）。每次打开默认 8 张（推荐 5 / 8 / 20 张，可调整为 2～20 的整数）；修改张数将清空合并并从原图重新切分；自由切分下点击相邻切片之间分割线上的 ×（或用 Tab 聚焦后按 Delete / Backspace）可合并两侧切片（至少保留 2 张），点击合并后切片内虚线上的 ＋（或聚焦后按 Enter）可沿原有分割线拆回，「清除合并」可一键恢复纯等分，每次合并或拆回都从原图重新生成整组切片。大图将自动按整组统一比例缩小并优化至每片长边 ≤ 4096 px、体积 ≤ 4.5 MB（透明图保留 PNG 透明背景），处理期间可随时取消或关闭。
          </p>
          <div class="status" role="status" aria-live="polite" data-tone="neutral"></div>
          <div class="summary" hidden></div>
          <div class="preview-strip" aria-label="切片预览列表" tabindex="-1" hidden></div>
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
    const modeBtns = Array.from(shadow.querySelectorAll('[data-action="split-mode"]'));
    const freeModeBtn = shadow.querySelector('[data-split-mode="free"]');
    const clearMergesBtn = shadow.querySelector('[data-action="clear-merges"]');
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
    // 自由切分 merges for the current 原图 and 等分张数 N: 分割线 k sits between 等分 regions k-1 and k
    const mergedDividers = new Set();
    let currentResultPlanKey = null;
    // 分割线 k whose control had focus when it was disabled or rebuilt: focus follows k into the new preview
    let focusedDivider = null;
    let splitMode = initialSplitMode;
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

    // Park focus on the (busy) strip, not the page, while the focused 分割线 control is disabled or rebuilt
    function parkDividerFocus() {
      const active = shadow.activeElement;
      if (active === previewStrip || !previewStrip.contains(active)) return;
      focusedDivider = Number(active.getAttribute('data-divider'));
      previewStrip.focus();
    }

    // focus() stops scrolling once a control is partly in view: bring a focused 分割线 control fully past the strip's
    // padding so its ×/＋ and focus ring are never cut by the strip edge (only the strip scrolls, never the page)
    function revealFocusedDivider(event) {
      if (event.target === previewStrip) return;
      const control = event.target.getBoundingClientRect();
      const strip = previewStrip.getBoundingClientRect();
      const inset = 12;
      if (control.left < strip.left + inset) {
        previewStrip.scrollLeft -= strip.left + inset - control.left;
      } else if (control.right > strip.right - inset) {
        previewStrip.scrollLeft += control.right - (strip.right - inset);
      }
    }

    // The same 分割线 in the rebuilt preview: ＋ after 合并, × after 拆回
    function restoreDividerFocus() {
      if (shadow.activeElement === previewStrip && focusedDivider !== null) {
        previewStrip.querySelector(`[data-divider="${focusedDivider}"]`)?.focus();
      }
      focusedDivider = null;
    }

    function clearPreview() {
      if (shadow.activeElement === submitBtn || previewStrip.contains(shadow.activeElement)) {
        if (!sliceCountInput.disabled) {
          sliceCountInput.focus();
        } else if (!cancelBtn.disabled) {
          cancelBtn.focus();
        } else {
          dialogEl.focus();
        }
      }
      focusedDivider = null;
      revokeObjectUrls();
      currentResult = null;
      currentResultPlanKey = null;
      previewStrip.innerHTML = '';
      previewStrip.removeAttribute('aria-busy');
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
        modeBtns.includes(active) ||
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

    function formatSliceBadge(count) {
      return splitMode === 'free'
        ? `${count} 等分 · 合并后 ${count - mergedDividers.size} 张`
        : `左右等分 1×${count}`;
    }

    // What to generate: 等分张数 N plus the merged 分割线; 左右等分 outputs pure N regardless of kept merges.
    // outputCount is 切片张数 M = N − merges.
    function currentPlan() {
      const countCheck = parseSliceCountInput(sliceCountInput.value);
      if (!countCheck.ok) return null;
      const dividers = splitMode === 'free' ? [...mergedDividers].sort((a, b) => a - b) : [];
      return {
        sliceCount: countCheck.value,
        mergedDividers: dividers,
        outputCount: countCheck.value - dividers.length
      };
    }

    function planKey(plan) {
      return `${plan.sliceCount}|${plan.mergedDividers.join(',')}`;
    }

    function describeGeneration(plan) {
      return plan.mergedDividers.length > 0
        ? `正在本地解码并从原图重新生成 ${plan.outputCount} 张切片（${plan.sliceCount} 等分 · 合并后 ${plan.outputCount} 张，可随时取消）...`
        : `正在本地解码并从原图左右等分为 ${plan.sliceCount} 张切片（可随时取消）...`;
    }

    // Disable a control without stranding keyboard focus on it
    function setDisabledKeepingFocus(el, disabled, fallback) {
      if (disabled && shadow.activeElement === el) {
        (fallback.disabled ? dialogEl : fallback).focus();
      }
      el.disabled = disabled;
    }

    function setDividerDisabled(control, disabled) {
      if (disabled && shadow.activeElement === control) {
        parkDividerFocus();
      }
      control.disabled = disabled;
    }

    // Merge / 拆回 / 清除合并 controls follow the merges, the split mode and the slice-control lock
    function renderMergeControls() {
      const plan = currentPlan();
      const atMinimum = !plan || plan.outputCount <= MIN_SLICE_COUNT;
      // Controls left on a stale 自由 preview after switching to 左右等分 must not stay usable
      const locked = areSliceControlsLocked() || splitMode !== 'free';
      for (const btn of previewStrip.querySelectorAll('.slice-divider')) {
        setDividerDisabled(btn, locked || atMinimum || mergedDividers.has(Number(btn.getAttribute('data-divider'))));
        btn.title = atMinimum ? `至少保留 ${MIN_SLICE_COUNT} 张切片，无法继续合并` : '合并相邻两张切片';
      }
      // A line already split back while the preview regenerates has nothing left to undo
      for (const line of previewStrip.querySelectorAll('.merged-divider')) {
        setDividerDisabled(line, locked || !mergedDividers.has(Number(line.getAttribute('data-divider'))));
      }
      clearMergesBtn.hidden = splitMode !== 'free';
      // After 清除合并 focus moves to the 自由 button beside it
      setDisabledKeepingFocus(clearMergesBtn, locked || mergedDividers.size === 0, freeModeBtn);
    }

    // Keep the old cards visible but greyed and unsubmittable until the latest generation lands
    function markPreviewStale() {
      currentResult = null;
      currentResultPlanKey = null;
      if (shadow.activeElement === submitBtn) {
        dialogEl.focus();
      }
      submitBtn.disabled = true;
      if (!previewStrip.hidden) {
        previewStrip.setAttribute('aria-busy', 'true');
      }
    }

    // Merges changed: relabel (dropping any earlier error marking) and re-slice the whole group from the original
    function applyMergeChange(sliceCount) {
      updateSliceCountVisuals({ ok: true, value: sliceCount });
      regenerateFromOriginal();
    }

    function regenerateFromOriginal() {
      const plan = currentPlan();
      if (!plan) return;
      pendingGeneration = null;
      abortActiveTask();
      const token = ++activeTaskToken;
      markPreviewStale();
      scheduleSliceGeneration(currentFile, plan, token);
    }

    function mergeDivider(divider) {
      if (areSliceControlsLocked() || splitMode !== 'free' || !currentFile) return;
      const plan = currentPlan();
      if (!plan || !Number.isInteger(divider) || divider < 1 || divider >= plan.sliceCount) return;
      if (mergedDividers.has(divider) || plan.outputCount <= MIN_SLICE_COUNT) return;
      if (!checkPreviewTargetIntegrity()) return;
      mergedDividers.add(divider);
      applyMergeChange(plan.sliceCount);
    }

    // 拆回: restore merged 分割线 k, so its merged slice splits back into two
    function unmergeDivider(divider) {
      if (areSliceControlsLocked() || splitMode !== 'free' || !mergedDividers.has(divider)) return;
      if (!checkPreviewTargetIntegrity()) return;
      mergedDividers.delete(divider);
      applyMergeChange(currentPlan().sliceCount);
    }

    // 清除合并: back to the pure 等分 of the current N (also the way out of a merge that failed to generate)
    function clearMerges() {
      if (areSliceControlsLocked() || splitMode !== 'free' || mergedDividers.size === 0) return;
      if (!checkPreviewTargetIntegrity()) return;
      mergedDividers.clear();
      applyMergeChange(currentPlan().sliceCount);
    }

    function renderSplitMode() {
      for (const btn of modeBtns) {
        btn.setAttribute('aria-pressed', btn.getAttribute('data-split-mode') === splitMode ? 'true' : 'false');
      }
    }

    function areSliceControlsLocked() {
      return (
        isClosed ||
        Boolean(initialError) ||
        targetInvalidated ||
        isSubmitting ||
        submissionFinished ||
        (isReplaceMode && !currentFile)
      );
    }

    function setSplitMode(nextMode) {
      if (areSliceControlsLocked()) return;
      if (nextMode === splitMode || !preferences.isSplitMode(nextMode)) return;
      if (!checkPreviewTargetIntegrity()) return;
      splitMode = nextMode;
      preferences.saveSplitMode(nextMode);
      renderSplitMode();
      renderMergeControls();
      // Only relabel a valid count; keep error badges (e.g. 超出原图宽度) and aria-invalid untouched
      const countCheck = parseSliceCountInput(sliceCountInput.value);
      if (countCheck.ok && sliceCountInput.getAttribute('aria-invalid') !== 'true') {
        sliceBadge.textContent = formatSliceBadge(countCheck.value);
      }
      if (mergedDividers.size > 0) {
        // Merges apply only in 自由切分, so the regions changed: re-slice from the original
        regenerateFromOriginal();
      } else if (currentResult) {
        // Same regions; only show or hide the 分割线 controls
        renderPreview(currentResult);
      }
    }

    function updateSliceCountVisuals(countCheck) {
      const locked = areSliceControlsLocked();
      let nextDecreaseDisabled = locked;
      let nextIncreaseDisabled = locked;
      if (countCheck.ok) {
        const count = countCheck.value;
        sliceCountInput.setAttribute('aria-invalid', 'false');
        sliceCountInput.setAttribute('aria-valuenow', String(count));
        sliceBadge.textContent = formatSliceBadge(count);
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
        ((presetBtns.includes(active) || modeBtns.includes(active)) && locked)
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
      for (const btn of modeBtns) {
        btn.disabled = locked;
      }
      renderMergeControls();
    }

    function renderPreview(result) {
      parkDividerFocus();
      revokeObjectUrls();
      previewStrip.innerHTML = '';
      previewStrip.removeAttribute('aria-busy');
      previewStrip.setAttribute('data-split-mode', splitMode);

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

      const layoutDesc =
        result.mergedDividers.length > 0
          ? `${result.sliceCount} 等分 · 合并后 ${result.slices.length} 张`
          : `1×${result.sliceCount}`;
      summaryEl.textContent = `原图尺寸：${result.sourceWidth} × ${result.sourceHeight} px（${result.sourcePixels.toLocaleString()} 像素） · 输出：${result.slices.length} 张 ${formatUpper} 切片（${layoutDesc}，输出尺寸 ${sliceDimLabel}） · 优化：${scaleDesc} · ${encodingDesc}`;
      summaryEl.hidden = false;

      // One frame height for the whole group so merged (wider) slices still line up as a continuous strip
      const maxRatio = Math.max(...result.slices.map((s) => s.width / s.height));
      const frameHeight = 150 * maxRatio > 220 ? Math.max(8, Math.round(220 / maxRatio)) : 150;

      const merged = new Set(result.mergedDividers);
      const keptDividers = [];
      for (let k = 1; k < result.sliceCount; k++) {
        if (!merged.has(k)) keptDividers.push(k);
      }

      result.slices.forEach((slice, i) => {
        const url = URL.createObjectURL(slice.file);
        objectUrls.push(url);

        const card = document.createElement('div');
        card.className = 'slice-card';
        card.setAttribute('data-slice-name', slice.fileName);

        const frame = document.createElement('div');
        frame.className = 'slice-frame';

        const frameWidth = Math.max(4, Math.round((frameHeight * slice.width) / slice.height));
        frame.style.width = `${frameWidth}px`;
        frame.style.height = `${frameHeight}px`;

        const img = document.createElement('img');
        img.className = 'slice-img';
        img.src = url;
        img.alt = `${slice.fileName} (${slice.width}×${slice.height})`;
        frame.appendChild(img);

        // A merged slice spans 等分 regions start..end; mark each original 分割线 inside it for 拆回
        if (splitMode === 'free') {
          const start = i === 0 ? 0 : keptDividers[i - 1];
          const end = i < keptDividers.length ? keptDividers[i] : result.sliceCount;
          const startX = equalSplitX(result.sourceWidth, result.sliceCount, start);
          const spanW = equalSplitX(result.sourceWidth, result.sliceCount, end) - startX;
          const lines = [];
          for (let k = start + 1; k < end; k++) {
            lines.push({ k, x: (frameWidth * (equalSplitX(result.sourceWidth, result.sliceCount, k) - startX)) / spanW });
          }
          lines.forEach(({ k, x }, j) => {
            // Up to 16 px wide, but never past the frame or halfway to a neighbouring line
            const leftRoom = j === 0 ? x : (x - lines[j - 1].x) / 2;
            const rightRoom = j === lines.length - 1 ? frameWidth - x : (lines[j + 1].x - x) / 2;
            const half = Math.min(8, leftRoom, rightRoom);
            const line = document.createElement('button');
            line.type = 'button';
            line.className = 'merged-divider';
            line.setAttribute('data-divider', String(k));
            line.setAttribute('aria-label', `沿第 ${j + 1} 条原有分割线拆回第 ${i + 1} 张切片`);
            line.title = '沿原有分割线拆回两张切片';
            line.style.left = `${x - half}px`;
            line.style.width = `${2 * half}px`;
            line.innerHTML = '<span class="unmerge-mark" aria-hidden="true">＋</span>';
            line.addEventListener('click', () => unmergeDivider(k));
            frame.appendChild(line);
          });
        }

        const meta = document.createElement('div');
        meta.className = 'slice-meta';
        meta.innerHTML = `
          <div class="slice-name">${slice.fileName}</div>
          <div>${slice.width}×${slice.height} px</div>
          <div>${formatBytes(slice.bytes)}</div>
        `;

        card.append(frame, meta);
        previewStrip.appendChild(card);

        if (splitMode === 'free' && i < result.slices.length - 1) {
          const divider = document.createElement('button');
          divider.type = 'button';
          divider.className = 'slice-divider';
          divider.setAttribute('data-divider', String(keptDividers[i]));
          divider.setAttribute('aria-label', `合并第 ${i + 1} 张与第 ${i + 2} 张切片`);
          divider.innerHTML = '<span class="divider-mark" aria-hidden="true">×</span>';
          divider.addEventListener('click', () => mergeDivider(Number(divider.getAttribute('data-divider'))));
          previewStrip.appendChild(divider);
        }
      });

      previewStrip.hidden = false;
      renderMergeControls();
      restoreDividerFocus();
    }

    // Keyboard 合并: Delete / Backspace on a focused ×. Enter / Space keep native activation (× 合并, ＋ 拆回);
    // a held key must not repeat on the control focus lands on after the rebuild and undo itself
    function handleDividerKeyDown(event, target) {
      const control = target.closest('.slice-divider, .merged-divider');
      if (!control || !['Delete', 'Backspace', 'Enter', ' '].includes(event.key)) return;
      const isMergeKey = event.key === 'Delete' || event.key === 'Backspace';
      if (isMergeKey || event.repeat) event.preventDefault();
      if (isMergeKey && !event.repeat && control.classList.contains('slice-divider')) {
        mergeDivider(Number(control.getAttribute('data-divider')));
      }
    }

    async function runSliceGeneration(file, plan, token) {
      if (isClosed || targetInvalidated || isSubmitting || submissionFinished || token !== activeTaskToken) {
        return;
      }
      if (!checkPreviewTargetIntegrity()) return;
      abortActiveTask();
      const controller = new AbortController();
      activeAbortController = controller;
      setStatus('busy', describeGeneration(plan));

      try {
        const result = await sliceImageFile(file, plan.sliceCount, {
          mergedDividers: plan.mergedDividers,
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

        const latestPlan = currentPlan();
        if (
          !latestPlan ||
          planKey(latestPlan) !== planKey(plan) ||
          result.sliceCount !== plan.sliceCount ||
          result.slices.length !== plan.outputCount
        ) {
          return;
        }

        currentResult = result;
        currentResultPlanKey = planKey(plan);
        // A success clears any earlier 超出原图宽度 / 缩放后零尺寸 error, e.g. after a merge failed and the mode switched back
        updateSliceCountVisuals({ ok: true, value: plan.sliceCount });
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
          // Merges belong to the dropped 原图
          mergedDividers.clear();
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
          updateSliceCountVisuals(parseSliceCountInput(sliceCountInput.value));
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

    function scheduleSliceGeneration(file, plan, token) {
      pendingGeneration = { file, plan, token };
      setStatus('busy', describeGeneration(plan));
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
            await runSliceGeneration(req.file, req.plan, req.token);
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

      const previousCount = parseSliceCountInput(lastProcessedCountRaw);
      lastProcessedCountRaw = sliceCountInput.value;
      pendingGeneration = null;
      abortActiveTask();
      const token = ++activeTaskToken;
      const countCheck = parseSliceCountInput(sliceCountInput.value);
      // Merges belong to one 等分张数 N: a new N drops them, re-applying the same N (e.g. its preset) keeps them
      if (!countCheck.ok || countCheck.value !== previousCount.value) {
        mergedDividers.clear();
      }
      clearPreview();
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

      await scheduleSliceGeneration(currentFile, currentPlan(), token);
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
      mergedDividers.clear();
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

      await scheduleSliceGeneration(currentFile, currentPlan(), token);
    }

    async function handleSubmit() {
      if (isClosed || isSubmitting || submissionFinished || targetInvalidated || !currentResult) return;
      if (!checkPreviewTargetIntegrity()) return;

      const countCheck = parseSliceCountInput(sliceCountInput.value);
      const plan = currentPlan();
      if (
        !plan ||
        currentResultPlanKey !== planKey(plan)
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
      for (const btn of [...presetBtns, ...modeBtns]) {
        btn.disabled = true;
      }
      renderMergeControls();
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

    // Tab from the strip parked mid-rebuild continues from 分割线 k, as if its control still had focus
    function besideParkedDivider(focusables, backward) {
      const isAfter = (el) =>
        previewStrip.contains(el)
          ? Number(el.getAttribute('data-divider')) > focusedDivider
          : Boolean(previewStrip.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
      return backward ? focusables.findLast((el) => !isAfter(el)) : focusables.find(isAfter);
    }

    function handleTab(event) {
      const focusables = getFocusableElements();
      const active = shadow.activeElement;
      // The dialog itself (e.g. after a click on its text) is outside the ring like the page is
      const offRing = active === dialogEl || !dialogEl.contains(active);
      let target = null;
      if (focusables.length === 0) {
        target = dialogEl;
      } else if (active === previewStrip && focusedDivider !== null) {
        target = besideParkedDivider(focusables, event.shiftKey);
      } else if (event.shiftKey) {
        if (offRing || active === focusables[0]) target = focusables.at(-1);
      } else if (offRing || active === focusables.at(-1)) {
        target = focusables[0];
      }
      if (target) {
        event.preventDefault();
        target.focus();
      }
    }

    // Every key event while the window is open, from key-shield.js (which keeps them all away from X)
    function handleKey(event) {
      if (event.type !== 'keydown') return;
      const target = event.composedPath()[0];
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!isSubmitting) {
          close();
        }
      } else if (event.key === 'Tab') {
        handleTab(event);
      } else if (target === sliceCountInput && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        stepSliceCount(event.key === 'ArrowUp' ? 1 : -1);
      } else if (previewStrip.contains(target)) {
        handleDividerKeyDown(event, target);
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
      if (XSlicer.slicerKeyHandler === handleKey) {
        XSlicer.slicerKeyHandler = null;
      }
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
    for (const btn of modeBtns) {
      btn.addEventListener('click', () => setSplitMode(btn.getAttribute('data-split-mode')));
    }
    previewStrip.addEventListener('focusin', revealFocusedDivider);
    clearMergesBtn.addEventListener('click', clearMerges);
    downloadRetainedBtn.addEventListener('click', handleDownloadRetainedSource);
    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    submitBtn.addEventListener('click', handleSubmit);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop && !isSubmitting) {
        close();
      }
    });
    XSlicer.slicerKeyHandler = handleKey;

    renderSplitMode();
    if (initialError) {
      fileInput.disabled = true;
      sliceCountInput.disabled = true;
      updateSliceCountVisuals({ ok: true, value: DEFAULT_SLICE_COUNT });
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
      scheduleSliceGeneration(inComposerSource.sourceFile, currentPlan(), ++activeTaskToken);
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
