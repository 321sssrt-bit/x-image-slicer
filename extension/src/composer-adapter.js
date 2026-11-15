(() => {
  'use strict';

  const XSlicer = (globalThis.XSlicer = globalThis.XSlicer || {});

  const POST_BUTTON_SELECTOR = '[data-testid="tweetButtonInline"], [data-testid="tweetButton"]';

  const EXTENSION_HOST_SELECTOR = '#x-slicer-modal-host, [data-x-slicer-feedback="true"]';

  function isExtensionOwnedNode(node) {
    if (!node || node.nodeType !== 1) return false;
    return Boolean(node.closest(EXTENSION_HOST_SELECTOR));
  }

  function queryEditorTextboxes(root) {
    const candidates = Array.from(
      root.querySelectorAll(
        '[data-testid^="tweetTextarea_"][role="textbox"], [role="textbox"][contenteditable="true"], textarea[data-testid^="tweetTextarea_"], textarea'
      )
    ).filter((el) => !isExtensionOwnedNode(el));
    return candidates.filter((el) => !candidates.some((other) => other !== el && el.contains(other)));
  }

  function queryComposerFileInputs(root) {
    const preferred = Array.from(root.querySelectorAll('input[type="file"][data-testid="fileInput"]')).filter(
      (el) => !isExtensionOwnedNode(el)
    );
    if (preferred.length > 0) return preferred;
    return Array.from(root.querySelectorAll('input[type="file"]')).filter((el) => !isExtensionOwnedNode(el));
  }

  function isIgnoredEditorNode(node) {
    if (!node || node.nodeType !== 1) return false;
    return Boolean(
      node.matches('.public-DraftEditorPlaceholder-root, [data-placeholder-only="true"], [aria-hidden="true"]')
    );
  }

  function extractInlineEditorText(node, blockRoot) {
    if (!node) return '';
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.nodeValue || '').replace(/\r\n?/g, '\n');
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    if (isIgnoredEditorNode(node)) return '';

    const tag = node.tagName;
    if (tag === 'IMG') {
      return node.getAttribute('alt') || '';
    }
    if (tag === 'BR') {
      if (node.hasAttribute('data-text')) return '';
      const parentText = (blockRoot?.textContent || '').replace(/[\r\n]/g, '');
      if (!parentText && blockRoot?.querySelectorAll('br, img').length <= 1) {
        return '';
      }
      if (
        blockRoot &&
        !node.nextSibling &&
        node.parentElement === blockRoot &&
        blockRoot.childNodes.length > 1
      ) {
        return '';
      }
      return '\n';
    }

    let out = '';
    for (const child of node.childNodes) {
      out += extractInlineEditorText(child, blockRoot);
    }
    return out;
  }

  function extractEditorDraftText(textbox) {
    if (!textbox) return '';
    if (textbox.tagName === 'TEXTAREA' || textbox.tagName === 'INPUT') {
      return (textbox.value || '').replace(/\r\n?/g, '\n');
    }

    const rawBlocks = Array.from(textbox.querySelectorAll('[data-block="true"]')).filter(
      (el) =>
        !isIgnoredEditorNode(el) &&
        !el.closest('.public-DraftEditorPlaceholder-root, [data-placeholder-only="true"], [aria-hidden="true"]')
    );
    const draftBlocks = rawBlocks.filter(
      (el) => !rawBlocks.some((other) => other !== el && el.contains(other))
    );
    if (draftBlocks.length > 0) {
      return draftBlocks.map((b) => extractInlineEditorText(b, b)).join('\n');
    }

    const BLOCK_TAGS = new Set(['DIV', 'P', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
    const hasChildBlocks = Array.from(textbox.children).some(
      (child) => !isIgnoredEditorNode(child) && BLOCK_TAGS.has(child.tagName)
    );
    if (!hasChildBlocks) {
      return extractInlineEditorText(textbox, textbox);
    }

    const lines = [];
    let inlineBuf = '';
    for (const child of textbox.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE && isIgnoredEditorNode(child)) {
        continue;
      }
      if (child.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(child.tagName)) {
        if (inlineBuf.length > 0) {
          lines.push(inlineBuf);
          inlineBuf = '';
        }
        lines.push(extractEditorDraftText(child));
      } else {
        inlineBuf += extractInlineEditorText(child, textbox);
      }
    }
    if (inlineBuf.length > 0) {
      lines.push(inlineBuf);
    }
    return lines.join('\n');
  }

  const REPLY_BUTTON_LABELS = new Set([
    'reply',
    '回复',
    '回覆',
    '返信',
    'responder',
    'répondre',
    'antworten',
    '답글'
  ]);

  const REPLY_TEXTBOX_LABELS = new Set([
    'reply',
    'post your reply',
    'reply text',
    '回复',
    '回复正文',
    '回覆',
    '回覆正文',
    '返信'
  ]);

  const NON_NEW_POST_NODE_SELECTOR =
    '[data-testid="quoteTweet"], [data-testid="quote"], article[data-testid="tweet"], [data-testid="inline_reply_offscreen"], [data-testid="inReplyToUsernames"]';

  function isNonStandaloneNewPostComposer(root, tweetButton) {
    if (!root || !tweetButton) return true;
    if (
      root.dataset.xComposerKind === 'reply' ||
      root.dataset.xComposerKind === 'quote' ||
      tweetButton.closest('[data-x-composer-kind="reply"], [data-x-composer-kind="quote"]')
    ) {
      return true;
    }
    const btnText = (tweetButton.textContent || '').trim().toLowerCase();
    const btnAria = (tweetButton.getAttribute('aria-label') || '').trim().toLowerCase();
    if (REPLY_BUTTON_LABELS.has(btnText) || REPLY_BUTTON_LABELS.has(btnAria)) {
      return true;
    }
    const textboxes = queryEditorTextboxes(root);
    if (textboxes.length === 1) {
      const tbAria = (textboxes[0].getAttribute('aria-label') || '').trim().toLowerCase();
      if (REPLY_TEXTBOX_LABELS.has(tbAria)) {
        return true;
      }
    }
    // Quote post or inline reply indicator check (ignoring anything inside editor textbox)
    for (const node of root.querySelectorAll(NON_NEW_POST_NODE_SELECTOR)) {
      if (!isExtensionOwnedNode(node) && !textboxes.some((tb) => tb.contains(node))) {
        return true;
      }
    }
    try {
      if (typeof location !== 'undefined' && location.pathname.includes('/status/') && !root.closest('[role="dialog"]')) {
        return true;
      }
    } catch {
      // ignore
    }
    const dialog = root.closest('[role="dialog"]');
    if (dialog) {
      const dialogTextboxes = queryEditorTextboxes(dialog);
      if (dialogTextboxes.length > 1) {
        return true;
      }
      for (const node of dialog.querySelectorAll(NON_NEW_POST_NODE_SELECTOR)) {
        if (!isExtensionOwnedNode(node) && !dialogTextboxes.some((tb) => tb.contains(node))) {
          return true;
        }
      }
    }
    return false;
  }

  function findComposerRootForButton(tweetButton) {
    let el = tweetButton.parentElement;
    while (el && el !== document.body && el !== document.documentElement) {
      const textboxes = queryEditorTextboxes(el);
      const fileInputs = queryComposerFileInputs(el);
      const buttons = Array.from(el.querySelectorAll(POST_BUTTON_SELECTOR)).filter(
        (btn) => !isExtensionOwnedNode(btn)
      );
      if (buttons.length > 1) {
        return null;
      }
      if (textboxes.length === 1 && fileInputs.length === 1 && buttons.length === 1) {
        return {
          root: el,
          textbox: textboxes[0],
          fileInput: fileInputs[0],
          tweetButton: buttons[0],
          toolbar: el.querySelector('[data-testid="toolBar"]') || tweetButton.parentElement
        };
      }
      el = el.parentElement;
    }
    return null;
  }

  function discoverComposers(doc = document) {
    const buttons = Array.from(doc.querySelectorAll(POST_BUTTON_SELECTOR)).filter(
      (btn) => !isExtensionOwnedNode(btn)
    );
    const seenRoots = new Set();
    const composers = [];

    for (const btn of buttons) {
      const found = findComposerRootForButton(btn);
      if (!found) continue;
      if (seenRoots.has(found.root)) continue;
      if (isNonStandaloneNewPostComposer(found.root, found.tweetButton)) continue;
      seenRoots.add(found.root);
      if (found.fileInput) {
        knownFileInputToComposer.set(found.fileInput, found.root);
      }
      composers.push(found);
    }

    return composers;
  }

  function createBindingSnapshot(binding) {
    return Object.freeze({
      root: binding.root,
      textbox: binding.textbox,
      fileInput: binding.fileInput,
      tweetButton: binding.tweetButton,
      initialComposerId: binding.root?.getAttribute('data-composer-id') || null
    });
  }

  function validateTargetStructure(binding, options = {}) {
    const { allowReplacedFileInput = false } = options;
    if (!binding || !binding.root || !binding.root.isConnected) {
      return {
        ok: false,
        reason: 'target-lost',
        message: '目标发帖框已关闭、被移除或已失效，已停止操作（不会转投其他发帖框）。'
      };
    }

    if (
      !isElementVisible(binding.root) ||
      !isElementVisible(binding.textbox) ||
      !isElementVisible(binding.tweetButton)
    ) {
      return {
        ok: false,
        reason: 'target-lost',
        message: '目标发帖框已关闭、被隐藏或已失效，已停止操作（不会转投其他发帖框）。'
      };
    }

    if (
      binding.initialComposerId !== null &&
      (binding.root.getAttribute('data-composer-id') || null) !== binding.initialComposerId
    ) {
      return {
        ok: false,
        reason: 'target-ambiguous',
        message: '目标发帖框标识发生变化，无法确认唯一目标，已停止操作以防误投。'
      };
    }

    const textboxes = queryEditorTextboxes(binding.root);
    const fileInputs = queryComposerFileInputs(binding.root);
    const tweetButtons = Array.from(binding.root.querySelectorAll(POST_BUTTON_SELECTOR)).filter(
      (btn) => !isExtensionOwnedNode(btn)
    );

    const fileInputValid = allowReplacedFileInput
      ? fileInputs.length <= 1
      : fileInputs.length === 1 && fileInputs[0] === binding.fileInput;

    if (
      textboxes.length !== 1 ||
      textboxes[0] !== binding.textbox ||
      !fileInputValid ||
      tweetButtons.length !== 1 ||
      tweetButtons[0] !== binding.tweetButton
    ) {
      return {
        ok: false,
        reason: 'target-ambiguous',
        message: '目标发帖框结构变化或无法唯一识别，已停止操作以防误投。'
      };
    }

    if (isNonStandaloneNewPostComposer(binding.root, binding.tweetButton)) {
      return {
        ok: false,
        reason: 'not-new-post',
        message: '当前目标已不再是新建帖子发帖框，已停止操作。'
      };
    }

    return { ok: true };
  }

  function hasExistingPoll(root) {
    const candidates = root.querySelectorAll(
      '[data-testid="cardPoll"], [data-testid="pollOptions"], [data-testid="removePollButton"], [data-testid="addPollChoice"], [data-testid="pollDuration"], [data-testid="pollsContainer"], input[name^="choice" i], select[data-testid^="selectPoll"]'
    );
    for (const node of candidates) {
      if (!isExtensionOwnedNode(node) && !node.closest('[data-testid="toolBar"]')) {
        return true;
      }
    }
    return false;
  }

  function isOpaqueAttachmentSubtree(node, options = {}) {
    if (!node || node.nodeType !== 1) return false;
    if (isExtensionOwnedNode(node) || !isElementVisible(node)) return false;

    if (node.matches?.('img, video, canvas, svg, [role="img"]')) return true;
    if (node.shadowRoot || (node.tagName && node.tagName.includes('-'))) return true;

    const suppressSelfShell = Boolean(
      options.insideIgnoredIndicator || node.matches?.(INDICATOR_SELECTOR)
    );

    if (!suppressSelfShell) {
      for (const childNode of node.childNodes) {
        if (childNode.nodeType === 3 && (childNode.nodeValue || '').trim().length > 0) {
          return true;
        }
      }
    }

    if (node.children.length > 0) {
      return Array.from(node.children).some((child) =>
        isOpaqueAttachmentSubtree(child, {
          ...options,
          insideIgnoredIndicator: suppressSelfShell
        })
      );
    }

    if (suppressSelfShell) {
      return false;
    }

    const rect = typeof node.getBoundingClientRect === 'function' ? node.getBoundingClientRect() : null;
    return Boolean(rect && rect.width > 0 && rect.height > 0);
  }

  const VIDEO_OR_GIF_MARKER_SELECTOR =
    'video, [data-testid="gifPreview"], [aria-label*="Remove GIF" i], [aria-label*="移除 GIF"], [aria-label*="移除GIF"], [aria-label*="Remove video" i], [aria-label*="移除视频"], [aria-label*="移除影片"]';

  function hasVideoOrGifMarkers(root, textbox) {
    const markers = root.querySelectorAll(VIDEO_OR_GIF_MARKER_SELECTOR);
    for (const marker of markers) {
      if (
        !isExtensionOwnedNode(marker) &&
        isElementVisible(marker) &&
        !marker.closest('[data-testid="toolBar"]') &&
        (!textbox || !textbox.contains(marker))
      ) {
        return true;
      }
    }
    return false;
  }

  function hasExistingMedia(root, textbox) {
    const attachmentsContainer = root.querySelector('[data-testid="attachments"]');
    if (attachmentsContainer && !isExtensionOwnedNode(attachmentsContainer)) {
      const explicitMediaNodes = attachmentsContainer.querySelectorAll(
        'img, video, canvas, [data-testid="attachmentItem"], [data-testid="mediaPreview"], [data-testid="gifPreview"], [data-upload-status], [data-testid="removeMediaButton"]'
      );
      for (const node of explicitMediaNodes) {
        if (!isExtensionOwnedNode(node) && isElementVisible(node)) {
          return true;
        }
      }
      if (findUploadingIndicators(attachmentsContainer, { insideAttachments: true, textbox }).length > 0) {
        return true;
      }
      const hasOpaqueVisibleChild = Array.from(attachmentsContainer.children).some((child) =>
        isOpaqueAttachmentSubtree(child, { textbox })
      );
      if (hasOpaqueVisibleChild) {
        return true;
      }
    }
    const mediaMarkers = root.querySelectorAll(
      'video, [data-testid="removeMediaButton"], [data-testid="gifPreview"], [data-testid="mediaPreview"], [aria-label*="Remove media" i], [aria-label*="移除媒体"], [aria-label*="移除媒體"], [aria-label*="Remove GIF" i], [aria-label*="移除 GIF"], [aria-label*="移除GIF"], [aria-label*="Remove video" i], [aria-label*="移除视频"], [aria-label*="移除影片"]'
    );
    for (const marker of mediaMarkers) {
      if (
        !isExtensionOwnedNode(marker) &&
        isElementVisible(marker) &&
        !marker.closest('[data-testid="toolBar"]') &&
        (!textbox || !textbox.contains(marker))
      ) {
        return true;
      }
    }
    return false;
  }

  function validateTargetComposer(binding) {
    const structCheck = validateTargetStructure(binding, { allowReplacedFileInput: false });
    if (!structCheck.ok) return structCheck;

    if (hasExistingPoll(binding.root)) {
      return {
        ok: false,
        reason: 'has-poll',
        message: '当前发帖框已添加投票（与图片互斥），请先手动移除投票后再使用切图。'
      };
    }

    if (hasExistingMedia(binding.root, binding.textbox)) {
      return {
        ok: false,
        reason: 'has-media',
        message: '当前发帖框已有媒体附件（图片、视频或 GIF），请先手动清空现有附件后再试（不会自动覆盖或混入）。'
      };
    }

    const draftText = extractEditorDraftText(binding.textbox);
    return { ok: true, draftText };
  }

  function collectMediaImgs(container) {
    const allImgs = Array.from(container.querySelectorAll('img'));
    return allImgs.filter((img) => {
      if (isExtensionOwnedNode(img) || img.closest('[aria-hidden="true"]')) return false;
      const src = img.getAttribute('src') || '';
      if (!src) return true;
      // Ignore tiny inline UI icons when real media blobs/URLs are present, or non-data/non-blob/non-twimg small SVGs
      if (src.startsWith('data:image/svg+xml')) return false;
      return true;
    });
  }

  function hasOtherSlotMarker(el, img) {
    const markers = el.querySelectorAll(
      '[data-testid="attachmentItem"], [data-testid="mediaPreview"], [data-upload-status]'
    );
    for (const marker of markers) {
      if (isExtensionOwnedNode(marker) || marker === el || marker.contains(img) || img.contains(marker)) continue;
      if (
        !marker.matches('[data-testid="attachmentItem"], [data-testid="mediaPreview"]') &&
        marker.matches('[role="progressbar"], [role="status"], [data-testid="uploadError"], [role="alert"]')
      ) {
        continue;
      }
      return true;
    }
    return false;
  }

  function isSingleSlotWrapper(el, img, container) {
    return (
      Boolean(el) &&
      container.contains(el) &&
      collectMediaImgs(el).length === 1 &&
      !hasOtherSlotMarker(el, img)
    );
  }

  function findSingleMediaContainer(img, container) {
    const attachmentItem = img.closest('[data-testid="attachmentItem"]');
    if (isSingleSlotWrapper(attachmentItem, img, container)) {
      return attachmentItem;
    }
    const preferred = img.closest('[data-testid="mediaPreview"], [role="group"]');
    if (isSingleSlotWrapper(preferred, img, container)) {
      return preferred;
    }
    let current = img;
    while (current.parentElement && current.parentElement !== container) {
      if (isSingleSlotWrapper(current.parentElement, img, container)) {
        current = current.parentElement;
      } else {
        break;
      }
    }
    return current;
  }

  function collectAttachmentSlots(container) {
    const slots = [];
    const seen = new Set();

    // 1. Derive single-item slots from every media <img> (handles anonymous carousels & mixed containers)
    for (const img of collectMediaImgs(container)) {
      const card = findSingleMediaContainer(img, container);
      if (!seen.has(card)) {
        seen.add(card);
        slots.push(card);
      }
    }

    // 2. Also include explicit slots / placeholders (including those without an <img> yet)
    const explicitCandidates = [
      ...container.querySelectorAll('[data-testid="attachmentItem"]'),
      ...container.querySelectorAll('[data-testid="mediaPreview"]'),
      ...container.querySelectorAll('[data-upload-status]')
    ].filter((el) => !isExtensionOwnedNode(el));

    for (const cand of explicitCandidates) {
      if (cand === container || seen.has(cand)) continue;
      if (collectMediaImgs(cand).length > 1) continue;

      // Skip if an existing slot already covers this node or this node wraps an existing slot
      let overlapsExisting = false;
      for (const existing of slots) {
        if (existing === cand || existing.contains(cand) || cand.contains(existing)) {
          overlapsExisting = true;
          break;
        }
      }
      if (overlapsExisting) continue;

      // Skip multi-slot wrapper that contains multiple nested explicit slots
      const nestedSlots = cand.querySelectorAll('[data-testid="attachmentItem"], [data-testid="mediaPreview"]');
      if (nestedSlots.length > 1) continue;

      seen.add(cand);
      slots.push(cand);
    }

    slots.sort((a, b) => {
      if (a === b) return 0;
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    return slots;
  }

  function isPostButtonDisabled(tweetButton) {
    if (!tweetButton) return true;
    return Boolean(tweetButton.disabled || tweetButton.getAttribute('aria-disabled') === 'true');
  }

  const INDICATOR_SELECTOR =
    '[role="progressbar"], [role="status"], [aria-busy="true"], [data-upload-status="uploading"], [data-upload-status="pending"], [data-testid*="spinner"], [data-testid*="loading"], [class*="spinner" i], [class*="loading" i]';

  const CHARACTER_COUNTER_PATTERN =
    /character\s*count|char\s*count|characters?\s*remaining|character\s*limit|字数|字符|字數/i;

  const MEDIA_UPLOAD_HINT_PATTERN =
    /upload|media|image|photo|attach|slice|uploading|processing|上传|上載|媒體|媒体|图片|圖片|附件|处理中|處理中/i;

  const BENIGN_STATUS_TEXT_PATTERN =
    /^(草稿已保存|已保存草稿|已复制到剪贴板|已复制|draft saved|your draft was saved|copied to clipboard|\d+\s*\/\s*\d+|\d+)$/i;

  function getIndicatorSignalText(el) {
    return [
      el.getAttribute('aria-label') || '',
      el.getAttribute('title') || '',
      el.getAttribute('aria-valuetext') || '',
      el.getAttribute('data-testid') || '',
      el.id || '',
      typeof el.className === 'string' ? el.className : '',
      el.textContent || ''
    ]
      .join(' ')
      .trim();
  }

  function isLikelyCharacterCounter(el, options = {}) {
    const { insideAttachments = false } = options;
    const ariaLabel = (el.getAttribute('aria-label') || '').trim();
    const title = (el.getAttribute('title') || '').trim();
    const testId = (el.getAttribute('data-testid') || '').trim();
    const text = (el.textContent || '').trim();
    const labelAndId = `${ariaLabel} ${title} ${testId} ${el.id || ''}`;
    const signalText = `${labelAndId} ${text}`;

    if (CHARACTER_COUNTER_PATTERN.test(labelAndId) || CHARACTER_COUNTER_PATTERN.test(text)) {
      return !MEDIA_UPLOAD_HINT_PATTERN.test(labelAndId);
    }

    if (insideAttachments) {
      return false;
    }

    if (el.getAttribute('role') === 'progressbar') {
      if (MEDIA_UPLOAD_HINT_PATTERN.test(signalText) || hasExplicitSpinnerOrLoadingMarker(el)) {
        return false;
      }
      const nowAttr = el.getAttribute('aria-valuenow');
      const maxAttr = el.getAttribute('aria-valuemax');
      const nowVal = nowAttr !== null ? Number(nowAttr) : NaN;
      const maxVal = maxAttr !== null ? Number(maxAttr) : NaN;
      if (Number.isFinite(maxVal) && maxVal > 25000) {
        return false;
      }
      if (nowAttr !== null && Number.isFinite(nowVal) && nowVal <= 0) {
        return true;
      }
      if (
        Number.isFinite(nowVal) &&
        Number.isFinite(maxVal) &&
        maxVal > 0 &&
        nowVal >= maxVal &&
        maxVal <= 25000
      ) {
        return true;
      }
      if (maxVal === 280 && (!Number.isFinite(nowVal) || (nowVal >= 0 && nowVal <= 280))) {
        return true;
      }
      if (Number.isFinite(maxVal) && maxVal > 0 && maxVal <= 25000 && /^[-+]?\d+$/.test(text)) {
        return true;
      }
    }

    return false;
  }

  function hasExplicitSpinnerOrLoadingMarker(el) {
    const testId = el.getAttribute('data-testid') || '';
    const cls = typeof el.className === 'string' ? el.className : '';
    return (
      el.getAttribute('aria-busy') === 'true' ||
      el.getAttribute('data-upload-status') === 'uploading' ||
      el.getAttribute('data-upload-status') === 'pending' ||
      /spinner|loading/i.test(testId) ||
      /spinner|loading/i.test(cls)
    );
  }

  function isRelevantMediaUploadingIndicator(el, options = {}) {
    const { insideAttachments = false, textbox = null } = options;
    if (!el || el.nodeType !== 1) return false;
    if (isExtensionOwnedNode(el)) return false;
    if (textbox && (el === textbox || textbox.contains(el))) return false;
    if (!isElementVisible(el)) return false;

    const uploadStatus = el.getAttribute('data-upload-status');
    if (uploadStatus === 'uploading' || uploadStatus === 'pending') {
      return true;
    }
    if (uploadStatus === 'ready' || uploadStatus === 'complete' || uploadStatus === 'error') {
      return false;
    }

    if (isLikelyCharacterCounter(el, { insideAttachments })) {
      return false;
    }

    const role = el.getAttribute('role');
    const explicitMarker = hasExplicitSpinnerOrLoadingMarker(el);
    const labelText = (
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      el.getAttribute('aria-valuetext') ||
      ''
    ).trim();
    const bodyText = (el.textContent || '').trim();
    const signalText = getIndicatorSignalText(el);

    if (role === 'status' && role !== 'progressbar' && !explicitMarker) {
      if (!labelText && !bodyText) {
        return false;
      }
      if (
        BENIGN_STATUS_TEXT_PATTERN.test(bodyText) &&
        !MEDIA_UPLOAD_HINT_PATTERN.test(`${labelText} ${el.getAttribute('data-testid') || ''}`)
      ) {
        return false;
      }
      if (insideAttachments && !MEDIA_UPLOAD_HINT_PATTERN.test(signalText) && !/^\d+\s*%$/.test(bodyText)) {
        return false;
      }
    }

    if (insideAttachments) {
      return true;
    }

    if (el.closest('[data-testid="toolBar"]')) {
      return MEDIA_UPLOAD_HINT_PATTERN.test(signalText);
    }

    if (role === 'progressbar' || el.getAttribute('aria-busy') === 'true') {
      return true;
    }

    return MEDIA_UPLOAD_HINT_PATTERN.test(signalText) || explicitMarker;
  }

  function findUploadingIndicators(scopeEl, options = {}) {
    return Array.from(scopeEl.querySelectorAll(INDICATOR_SELECTOR)).filter((el) =>
      isRelevantMediaUploadingIndicator(el, options)
    );
  }

  function isElementVisible(el) {
    if (!el || !el.isConnected) return false;
    let cur = el;
    while (cur && cur.nodeType === 1) {
      if (cur.hidden || cur.getAttribute('aria-hidden') === 'true') return false;
      const style = typeof getComputedStyle === 'function' ? getComputedStyle(cur) : null;
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
      cur = cur.parentElement;
    }
    return true;
  }

  const GLOBAL_ERROR_TOAST_PATTERN =
    /失败|错误|出错|异常|无法|不能|不可|拒绝|限制|超出|上限|过多|过大|不支持|重试|无效|未完成|中断|超时|error|fail|failed|unable|can't|cannot|couldn't|could not|exceed|limit|too many|too large|unsupported|invalid|rejected|went wrong|try again|not allowed/i;

  const BENIGN_TOAST_PATTERN =
    /^(草稿已保存|已保存草稿|已复制到剪贴板|已复制|帖子已发送|已发送|已添加书签|draft saved|your draft was saved|copied to clipboard|your post was sent|added to bookmarks)\.?$/i;

  function isNodeInsideOtherComposer(node, targetRoot) {
    if (!node || !targetRoot || targetRoot.contains(node)) return false;

    const composerMarker = node.closest('[data-composer-id]');
    if (composerMarker && composerMarker !== targetRoot && !composerMarker.contains(targetRoot)) {
      return true;
    }

    const nodeDialog = node.closest('[role="dialog"]');
    if (nodeDialog && !nodeDialog.contains(targetRoot)) {
      return true;
    }

    let anc = node.parentElement;
    while (anc && anc !== document.body && anc !== document.documentElement) {
      if (anc.contains(targetRoot)) break;
      if (
        queryEditorTextboxes(anc).length > 0 &&
        Array.from(anc.querySelectorAll(POST_BUTTON_SELECTOR)).filter((b) => !isExtensionOwnedNode(b)).length === 1
      ) {
        return true;
      }
      anc = anc.parentElement;
    }

    return false;
  }

  function isUploadFailureToastText(text) {
    if (!text) return false;
    if (BENIGN_TOAST_PATTERN.test(text)) return false;
    return GLOBAL_ERROR_TOAST_PATTERN.test(text);
  }

  function captureToastBaseline() {
    const snapshots = new Map();
    const nodes = document.querySelectorAll('[data-testid="toast"], [role="alert"]');
    for (const node of nodes) {
      if (isExtensionOwnedNode(node)) continue;
      snapshots.set(node, {
        text: (node.textContent || '').trim(),
        visible: isElementVisible(node)
      });
    }
    return snapshots;
  }

  function getGlobalToastErrors(baselineToastSnapshots, targetRoot) {
    const nodes = Array.from(document.querySelectorAll('[data-testid="toast"], [role="alert"]'));
    const errors = [];
    for (const node of nodes) {
      if (isExtensionOwnedNode(node)) continue;
      if (isNodeInsideOtherComposer(node, targetRoot)) continue;
      const text = (node.textContent || '').trim();
      if (text.length === 0) continue;
      const visible = isElementVisible(node);
      if (!visible) continue;
      if (baselineToastSnapshots && baselineToastSnapshots.has(node)) {
        const prev = baselineToastSnapshots.get(node);
        if (text === prev.text && visible === prev.visible) {
          continue;
        }
      }
      if (targetRoot && targetRoot.contains(node)) {
        if (!BENIGN_TOAST_PATTERN.test(text)) {
          errors.push(text);
        }
      } else if (isUploadFailureToastText(text)) {
        errors.push(text);
      }
    }
    return errors;
  }

  function inspectAttachmentsState(binding, baselineToasts) {
    const root = binding.root;
    const container = root.querySelector('[data-testid="attachments"]');

    const errorNodes = Array.from(
      root.querySelectorAll(
        '[data-testid="uploadError"], [data-upload-status="error"], [data-testid="attachments"] [role="alert"]'
      )
    ).filter((el) => !isExtensionOwnedNode(el));
    const toastErrors = getGlobalToastErrors(baselineToasts, root);

    const rootUploadingIndicators = findUploadingIndicators(root, {
      insideAttachments: false,
      textbox: binding.textbox
    }).filter((el) => !container || !container.contains(el));

    if (!container) {
      return {
        items: [],
        readyItems: [],
        decodedCount: 0,
        containerHasOpaqueContent: false,
        inProgressCount: rootUploadingIndicators.length,
        errorCount: errorNodes.length + toastErrors.length,
        errorText: errorNodes[0]?.textContent?.trim() || toastErrors[0] || '',
        postButtonDisabled: isPostButtonDisabled(binding.tweetButton)
      };
    }

    const rawItems = collectAttachmentSlots(container);
    const containerUploadingIndicators = findUploadingIndicators(container, {
      insideAttachments: true,
      textbox: binding.textbox
    });

    const items = [];
    const readyItems = [];
    let pendingCount = 0;
    let decodedCount = 0;

    for (const item of rawItems) {
      const img = item.tagName === 'IMG' ? item : collectMediaImgs(item)[0] || item.querySelector('img');
      const itemStatus = item.getAttribute('data-upload-status'); // null if absent
      const itemIndicators = findUploadingIndicators(item, {
        insideAttachments: true,
        textbox: binding.textbox
      });
      const hasError =
        itemStatus === 'error' ||
        Boolean(
          Array.from(
            item.querySelectorAll('[data-upload-status="error"], [data-testid="uploadError"], [role="alert"]')
          ).find((el) => !isExtensionOwnedNode(el))
        );
      const imgReady = Boolean(img && img.complete && img.naturalWidth > 0);
      if (!hasError && imgReady) {
        decodedCount++;
      }

      const statusBusy = itemStatus === 'uploading' || itemStatus === 'pending';
      const statusExplicitReady = itemStatus === 'ready' || itemStatus === 'complete';
      const statusUnknown = itemStatus !== null && !statusBusy && !statusExplicitReady && itemStatus !== 'error';

      const isUploading = !hasError && (statusBusy || itemIndicators.length > 0 || !imgReady);
      if (isUploading) {
        pendingCount++;
      }

      const isReady =
        !hasError &&
        !isUploading &&
        !statusUnknown &&
        imgReady &&
        (statusExplicitReady || (itemStatus === null && !isPostButtonDisabled(binding.tweetButton)));

      const entry = {
        element: item,
        img,
        fileName:
          item.getAttribute('data-slice-name') ||
          item.getAttribute('data-filename') ||
          img?.getAttribute('data-slice-name') ||
          img?.getAttribute('alt') ||
          '',
        ready: isReady,
        explicitBusy: statusBusy || itemIndicators.length > 0,
        unknownStatus: statusUnknown || (!hasError && !isUploading && !isReady),
        error: hasError
      };

      items.push(entry);
      if (entry.ready) {
        readyItems.push(entry);
      }
    }

    const containerHasOpaqueContent =
      rawItems.length === 0 &&
      Array.from(container.children).some((child) =>
        isOpaqueAttachmentSubtree(child, { textbox: binding.textbox })
      );

    return {
      items,
      readyItems,
      decodedCount,
      containerHasOpaqueContent,
      containerOrRootIndicators: Math.max(
        rootUploadingIndicators.length,
        containerUploadingIndicators.length
      ),
      inProgressCount: Math.max(
        pendingCount,
        rootUploadingIndicators.length,
        containerUploadingIndicators.length
      ),
      errorCount: errorNodes.length + toastErrors.length + items.filter((i) => i.error).length,
      errorText: errorNodes[0]?.textContent?.trim() || toastErrors[0] || '',
      postButtonDisabled: isPostButtonDisabled(binding.tweetButton)
    };
  }

  function signatureMad(sigA, sigB) {
    let sum = 0;
    for (let i = 0; i < sigA.length; i++) {
      sum += Math.abs(sigA[i] - sigB[i]);
    }
    return sum / sigA.length;
  }

  async function computeReferenceSignaturesForAspect(slices, targetRatio, sigCtx) {
    const refs = [];
    for (const slice of slices) {
      const sliceRatio = slice.width / slice.height;
      const ratioDiff = Math.abs(sliceRatio - targetRatio) / Math.max(sliceRatio, targetRatio, 1e-6);
      if (ratioDiff < 0.05) {
        refs.push(slice.signature);
        continue;
      }
      // Re-sample center-cropped region of the slice matching targetRatio
      const bmp = await createImageBitmap(slice.file);
      try {
        let sx = 0;
        let sy = 0;
        let sw = bmp.width;
        let sh = bmp.height;
        if (sliceRatio > targetRatio) {
          sw = Math.max(1, Math.round(bmp.height * targetRatio));
          sx = Math.floor((bmp.width - sw) / 2);
        } else {
          sh = Math.max(1, Math.round(bmp.width / targetRatio));
          sy = Math.floor((bmp.height - sh) / 2);
        }
        sigCtx.clearRect(0, 0, 8, 8);
        sigCtx.imageSmoothingEnabled = true;
        sigCtx.drawImage(bmp, sx, sy, sw, sh, 0, 0, 8, 8);
        refs.push(Array.from(sigCtx.getImageData(0, 0, 8, 8).data));
      } finally {
        bmp.close();
      }
    }
    return refs;
  }

  function maxPairwiseGap(refs) {
    let maxGap = 0;
    for (let i = 0; i < refs.length; i++) {
      for (let j = i + 1; j < refs.length; j++) {
        const diff = signatureMad(refs[i], refs[j]);
        if (diff > maxGap) maxGap = diff;
      }
    }
    return maxGap;
  }

  function bytesEqual(bufA, bufB) {
    if (!bufA || !bufB || bufA.byteLength !== bufB.byteLength) return false;
    const a = new Uint8Array(bufA);
    const b = new Uint8Array(bufB);
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function checkVisualLayoutOrder(readyItems) {
    const rects = readyItems.map((item) => item.element.getBoundingClientRect());
    for (let i = 0; i < rects.length; i++) {
      const curr = rects[i];
      if (curr.width <= 0 || curr.height <= 0) {
        return {
          ok: false,
          reason: 'visual-order-mismatch',
          message: '检测到发帖框中存在不可见或零尺寸的附件槽位，无法确认从左到右排列顺序。'
        };
      }
      if (i > 0) {
        const prev = rects[i - 1];
        const rowTol = Math.max(12, Math.min(prev.height, curr.height) * 0.5);
        const sameRow = Math.abs(prev.top - curr.top) < rowTol;
        const currAbovePrev = curr.top + rowTol < prev.top;
        const notRightwardInSameRow = sameRow && curr.left <= prev.left + Math.min(2, prev.width * 0.1);
        if (currAbovePrev || notRightwardInSameRow) {
          return {
            ok: false,
            reason: 'visual-order-mismatch',
            message: '发帖框附件的横向排列顺序与 DOM 顺序不一致，无法确认从左到右顺序正确。'
          };
        }
      }
    }
    return { ok: true, rects };
  }

  async function verifyAttachmentOrder(readyItems, slices) {
    if (readyItems.length !== slices.length) {
      return { ok: false, reason: 'count-mismatch', message: '附件数量与预期切片数不一致。' };
    }

    // 1. Visual left-to-right (row-major) layout must agree with DOM order
    const layoutCheck = checkVisualLayoutOrder(readyItems);
    if (!layoutCheck.ok) {
      return layoutCheck;
    }

    // 2. Check explicit filename identity if present on all slots
    let allExplicitlyNamed = true;
    for (let i = 0; i < readyItems.length; i++) {
      const name = (readyItems[i].fileName || '').trim();
      if (/^slice-\d+\.(png|jpe?g)$/i.test(name)) {
        if (name !== slices[i].fileName) {
          return {
            ok: false,
            reason: 'filename-order-mismatch',
            message: `检测到附件顺序异常：第 ${i + 1} 位为 ${name}，预期为 ${slices[i].fileName}。`
          };
        }
      } else {
        allExplicitlyNamed = false;
      }
    }

    let sliceBuffers = null;
    try {
      sliceBuffers = await Promise.all(slices.map((s) => s.file.arrayBuffer()));
    } catch {
      sliceBuffers = null;
    }
    const allSlicesByteIdentical =
      Array.isArray(sliceBuffers) &&
      sliceBuffers.length > 0 &&
      sliceBuffers.every((b) => bytesEqual(b, sliceBuffers[0]));

    // 3. Same-origin blob: URL byte comparison (exact order proof for un-reencoded composer blobs)
    let visualConfirmed = false;
    const allSameOriginBlobs = readyItems.every(
      (item) => item.img && typeof item.img.src === 'string' && item.img.src.startsWith('blob:')
    );
    if (allSameOriginBlobs && sliceBuffers && !allSlicesByteIdentical) {
      try {
        const slotBuffers = await Promise.all(
          readyItems.map((item) =>
            fetch(item.img.src).then((res) => (res.ok ? res.arrayBuffer() : null))
          )
        );

        if (slotBuffers.every((b) => b !== null)) {
          let allBytesMatch = true;
          for (let i = 0; i < slotBuffers.length; i++) {
            if (bytesEqual(slotBuffers[i], sliceBuffers[i])) continue;
            allBytesMatch = false;
            const wrongIdx = sliceBuffers.findIndex(
              (sb, j) => j !== i && !bytesEqual(sb, sliceBuffers[i]) && bytesEqual(slotBuffers[i], sb)
            );
            if (wrongIdx !== -1) {
              return {
                ok: false,
                reason: 'pixel-order-mismatch',
                message: `检测到第 ${i + 1} 个附件与第 ${wrongIdx + 1} 张切片文件一致，顺序错乱，请手动检查。`
              };
            }
          }
          if (allBytesMatch) {
            visualConfirmed = true;
          }
        }
      } catch {
        // Blob fetch unavailable or revoked -> fall through to visual 8x8 signature check
      }
    }

    if (visualConfirmed) {
      return { ok: true };
    }

    // 4. Visually verify rendered <img> pixels against slices (handles cropped/re-encoded thumbnails)
    const sigCanvas = document.createElement('canvas');
    sigCanvas.width = 8;
    sigCanvas.height = 8;
    const sigCtx = sigCanvas.getContext('2d', { willReadFrequently: true });

    if (sigCtx) {
      try {
        const slotSigs = [];
        const slotRatios = [];
        for (let i = 0; i < readyItems.length; i++) {
          const img = readyItems[i].img;
          if (!img) {
            throw new Error('missing-img');
          }
          const imgBmp = await createImageBitmap(img);
          try {
            sigCtx.clearRect(0, 0, 8, 8);
            sigCtx.imageSmoothingEnabled = true;
            sigCtx.drawImage(imgBmp, 0, 0, 8, 8);
            const data = sigCtx.getImageData(0, 0, 8, 8).data;
            slotSigs.push(Array.from(data));
            slotRatios.push(img.naturalWidth / Math.max(1, img.naturalHeight));
          } finally {
            imgBmp.close();
          }
        }

        const refsCache = new Map();
        async function getRefsForRatio(ratio) {
          const key = Math.round(ratio * 1000) / 1000;
          if (!refsCache.has(key)) {
            refsCache.set(key, await computeReferenceSignaturesForAspect(slices, ratio, sigCtx));
          }
          return refsCache.get(key);
        }

        const MAX_ALLOWED_MATCH_MAD = 18;
        let allSlotsConfirmed = true;
        for (let i = 0; i < slotSigs.length; i++) {
          const refs = await getRefsForRatio(slotRatios[i]);
          const expectedMad = signatureMad(slotSigs[i], refs[i]);
          let bestIdx = i;
          let bestMad = expectedMad;

          for (let j = 0; j < refs.length; j++) {
            const mad = signatureMad(slotSigs[i], refs[j]);
            if (mad < bestMad) {
              bestMad = mad;
              bestIdx = j;
            }
          }

          if (bestIdx !== i && expectedMad - bestMad > 3) {
            return {
              ok: false,
              reason: 'pixel-order-mismatch',
              message: `检测到第 ${i + 1} 个附件画面与第 ${bestIdx + 1} 张切片更匹配，顺序错乱，请手动检查。`
            };
          }
          if (expectedMad > MAX_ALLOWED_MATCH_MAD) {
            return {
              ok: false,
              reason: 'visual-content-mismatch',
              message: `检测到第 ${i + 1} 个附件画面与本次切分切片差异过大，无法确认内容匹配，请手动检查发帖框。`
            };
          }

          if (allSlicesByteIdentical || maxPairwiseGap(refs) <= 2) {
            allSlotsConfirmed = false;
            continue;
          }

          let ambiguousDistinctSlice = false;
          for (let j = 0; j < refs.length; j++) {
            if (j === i) continue;
            // Only treat another slice as interchangeable when the full slice files are byte-identical
            if (sliceBuffers && bytesEqual(sliceBuffers[i], sliceBuffers[j])) continue;
            const madJ = signatureMad(slotSigs[i], refs[j]);
            if (madJ - expectedMad <= 2) {
              ambiguousDistinctSlice = true;
              break;
            }
          }

          const bestIsEquivalentFile =
            bestIdx === i || (sliceBuffers && bytesEqual(sliceBuffers[i], sliceBuffers[bestIdx]));
          if (ambiguousDistinctSlice || !bestIsEquivalentFile) {
            allSlotsConfirmed = false;
            if (!allExplicitlyNamed) {
              return {
                ok: false,
                reason: 'order-unconfirmed',
                message: '无法明确区分或确认各附件槽位对应的切片顺序，请手动检查发帖框。'
              };
            }
          }
        }
        visualConfirmed = allSlotsConfirmed;
      } catch {
        // Cross-origin tainted canvas or unreadable img -> visualConfirmed remains false
      } finally {
        sigCanvas.width = 0;
        sigCanvas.height = 0;
      }
    }

    if (!allExplicitlyNamed && !visualConfirmed) {
      return {
        ok: false,
        reason: 'order-unconfirmed',
        message: `由于缺少可核验的切片标识且无法读取图像像素比对（如跨域限制或画面高度相似），无法确认 ${slices.length} 张附件的从左到右顺序，请手动检查发帖框。`
      };
    }

    return { ok: true };
  }

  function hasUnexpectedVideoOrGifDuringUpload(root, textbox) {
    const markers = root.querySelectorAll(
      'video, [data-testid="gifPreview"], [aria-label*="Remove GIF" i], [aria-label*="移除 GIF"], [aria-label*="移除GIF"], [aria-label*="Remove video" i], [aria-label*="移除视频"], [aria-label*="移除影片"]'
    );
    for (const marker of markers) {
      if (
        !isExtensionOwnedNode(marker) &&
        !marker.closest('[data-testid="toolBar"]') &&
        (!textbox || !textbox.contains(marker))
      ) {
        return true;
      }
    }
    return false;
  }

  const FEEDBACK_STYLES = `
    :host {
      display: block;
      margin: 6px 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    * {
      box-sizing: border-box;
    }
    .feedback {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid #cfd9de;
      background: #f7f9f9;
      color: #0f1419;
      font-size: 13px;
      line-height: 1.45;
    }
    .feedback[data-tone="success"] {
      background: #ecfdf3;
      border-color: #abefc6;
      color: #067647;
    }
    .feedback[data-tone="warning"] {
      background: #fffaeb;
      border-color: #fedf89;
      color: #b54708;
    }
    .feedback[data-tone="error"] {
      background: #fef1f2;
      border-color: #f9b4bc;
      color: #b42318;
    }
    .feedback-main {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 6px;
      min-width: 0;
      flex: 1 1 auto;
    }
    .feedback-badge {
      font-size: 11px;
      font-weight: 700;
      padding: 1px 7px;
      border-radius: 9999px;
      background: rgba(15, 20, 25, 0.08);
      white-space: nowrap;
    }
    .feedback[data-tone="success"] .feedback-badge {
      background: rgba(6, 118, 71, 0.14);
    }
    .feedback[data-tone="warning"] .feedback-badge {
      background: rgba(181, 71, 8, 0.14);
    }
    .feedback[data-tone="error"] .feedback-badge {
      background: rgba(180, 35, 24, 0.14);
    }
    .feedback-text {
      word-break: break-word;
    }
    .feedback-close {
      appearance: none;
      flex: 0 0 auto;
      border: 1px solid rgba(15, 20, 25, 0.16);
      background: rgba(255, 255, 255, 0.72);
      color: inherit;
      width: 24px;
      height: 24px;
      border-radius: 9999px;
      font-size: 15px;
      line-height: 1;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .feedback-close:focus-visible {
      outline: 2px solid #1d9bf0;
      outline-offset: 2px;
    }
  `;

  const composerFeedbackRegistry = new WeakMap();

  function getOrCreateComposerFeedbackRecord(root) {
    let rec = composerFeedbackRegistry.get(root);
    if (!rec) {
      rec = {
        activeToken: 0,
        host: null,
        observer: null,
        changeRootEl: null,
        onRootChange: null
      };
      composerFeedbackRegistry.set(root, rec);
    }
    return rec;
  }

  function stopFeedbackWatcher(rec) {
    if (!rec) return;
    if (rec.observer) {
      rec.observer.disconnect();
      rec.observer = null;
    }
    if (rec.changeRootEl && rec.onRootChange) {
      rec.changeRootEl.removeEventListener('change', rec.onRootChange, true);
    }
    rec.changeRootEl = null;
    rec.onRootChange = null;
  }

  function clearComposerFeedback(bindingOrRoot) {
    const root = bindingOrRoot?.root || bindingOrRoot;
    if (!root) return;
    const rec = composerFeedbackRegistry.get(root);
    if (rec) {
      stopFeedbackWatcher(rec);
      if (rec.host) {
        rec.host.remove();
        rec.host = null;
      }
    }
    if (typeof root.querySelectorAll === 'function') {
      for (const stray of root.querySelectorAll('[data-x-slicer-feedback="true"]')) {
        stray.remove();
      }
    }
  }

  function nextSubmissionToken(bindingOrRoot) {
    const root = bindingOrRoot?.root || bindingOrRoot;
    if (!root) return 0;
    const rec = getOrCreateComposerFeedbackRecord(root);
    rec.activeToken++;
    clearComposerFeedback(root);
    return rec.activeToken;
  }

  function findFeedbackMountAnchor(root, textbox) {
    const attachments = root.querySelector('[data-testid="attachments"]');
    if (attachments && attachments.parentElement === root && attachments.nextSibling) {
      return { parent: root, before: attachments.nextSibling };
    }
    const toolbar = root.querySelector('[data-testid="toolBar"]');
    if (toolbar) {
      let cur = toolbar;
      while (cur.parentElement && cur.parentElement !== root) {
        cur = cur.parentElement;
      }
      if (cur.parentElement === root && (!textbox || !cur.contains(textbox))) {
        return { parent: root, before: cur };
      }
    }
    return { parent: root, before: null };
  }

  function getFeedbackBadgeLabel(tone) {
    if (tone === 'success') return '已就绪';
    if (tone === 'warning') return '请核对';
    if (tone === 'error') return '注意';
    return '切图状态';
  }

  function showComposerFeedback(binding, options = {}) {
    if (!binding || !binding.root) return false;
    const root = binding.root;
    const rec = getOrCreateComposerFeedbackRecord(root);
    const {
      token = rec.activeToken,
      tone = 'neutral',
      message = '',
      watchAttachments = false,
      alreadyInvalidated = false,
      expectedCount = 0
    } = options;

    if (token !== rec.activeToken) {
      return false;
    }

    const structCheck = validateTargetStructure(binding, { allowReplacedFileInput: true });
    if (!structCheck.ok) {
      clearComposerFeedback(root);
      return false;
    }

    stopFeedbackWatcher(rec);

    let host = rec.host;
    if (!host || !host.isConnected || !root.contains(host)) {
      clearComposerFeedback(root);
      host = document.createElement('div');
      host.setAttribute('data-x-slicer-feedback', 'true');
      const shadow = host.attachShadow({ mode: 'open' });
      const styleEl = document.createElement('style');
      styleEl.textContent = FEEDBACK_STYLES;
      const box = document.createElement('div');
      box.className = 'feedback';
      box.setAttribute('aria-atomic', 'true');
      box.innerHTML = `
        <div class="feedback-main">
          <span class="feedback-badge"></span>
          <span class="feedback-text"></span>
        </div>
        <button type="button" class="feedback-close" aria-label="关闭切图结果提示">&times;</button>
      `;
      const closeBtn = box.querySelector('.feedback-close');
      closeBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        getOrCreateComposerFeedbackRecord(root).activeToken++;
        const entryBtn = root.querySelector('button[data-x-slicer-entry="true"]');
        clearComposerFeedback(root);
        if (entryBtn && isElementVisible(entryBtn)) {
          entryBtn.focus();
        } else if (binding.textbox && isElementVisible(binding.textbox)) {
          binding.textbox.focus();
        }
      });
      shadow.append(styleEl, box);

      const anchor = findFeedbackMountAnchor(root, binding.textbox);
      if (anchor.before) {
        anchor.parent.insertBefore(host, anchor.before);
      } else {
        anchor.parent.appendChild(host);
      }
      rec.host = host;
    }

    const box = host.shadowRoot.querySelector('.feedback');
    const badgeEl = host.shadowRoot.querySelector('.feedback-badge');
    const textEl = host.shadowRoot.querySelector('.feedback-text');
    box.setAttribute('data-tone', tone);
    if (tone === 'error') {
      box.setAttribute('role', 'alert');
      box.setAttribute('aria-live', 'assertive');
    } else {
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
    }
    badgeEl.textContent = getFeedbackBadgeLabel(tone);
    textEl.textContent = message;

    if (watchAttachments) {
      const feedbackToastBaseline = captureToastBaseline();
      const baseline = inspectAttachmentsState(binding, feedbackToastBaseline);
      const baselineElements = baseline.items.map((i) => i.element);
      const baselineSrcs = baseline.items.map((i) => i.img?.src || '');
      let invalidated = Boolean(alreadyInvalidated);

      const handleRuntimeChange = () => {
        if (token !== rec.activeToken) {
          stopFeedbackWatcher(rec);
          return;
        }
        const targetCheck = validateTargetStructure(binding, { allowReplacedFileInput: true });
        if (!targetCheck.ok) {
          clearComposerFeedback(root);
          return;
        }
        const current = inspectAttachmentsState(binding, feedbackToastBaseline);
        if (
          current.items.length === 0 &&
          !current.containerHasOpaqueContent &&
          !hasExistingMedia(root, binding.textbox)
        ) {
          clearComposerFeedback(root);
          return;
        }
        if (invalidated) return;

        const hasUnknownNow = current.items.some((i) => i.unknownStatus);
        const slotsChanged =
          current.items.length !== baselineElements.length ||
          (expectedCount > 0 && current.items.length !== expectedCount) ||
          current.readyItems.length !== current.items.length ||
          current.inProgressCount > 0 ||
          hasUnknownNow ||
          current.items.some(
            (item, idx) =>
              item.element !== baselineElements[idx] ||
              (item.img?.src || '') !== baselineSrcs[idx] ||
              !item.ready
          ) ||
          current.errorCount > 0;
        if (slotsChanged) {
          invalidated = true;
          box.setAttribute('data-tone', 'warning');
          box.setAttribute('role', 'status');
          box.setAttribute('aria-live', 'polite');
          badgeEl.textContent = getFeedbackBadgeLabel('warning');
          textEl.textContent = `检测到发帖框附件已变化（当前 ${current.items.length} 项），原切图填入结果不再适用，请手动核对后再发布。`;
        }
      };

      if (typeof MutationObserver !== 'undefined') {
        const obs = new MutationObserver((mutations) => {
          if (mutations.every((m) => isExtensionOwnedNode(m.target))) return;
          handleRuntimeChange();
        });
        obs.observe(root, {
          childList: true,
          subtree: true,
          attributes: true
        });
        rec.observer = obs;
      }

      const onRootChange = (event) => {
        if (token !== rec.activeToken) {
          stopFeedbackWatcher(rec);
          return;
        }
        const target = event?.target;
        if (!target || isExtensionOwnedNode(target) || internalFileDispatchInputs.has(target)) return;
        if (target.tagName !== 'INPUT' || target.type !== 'file') return;
        if (!invalidated) {
          invalidated = true;
          box.setAttribute('data-tone', 'warning');
          box.setAttribute('role', 'status');
          box.setAttribute('aria-live', 'polite');
          badgeEl.textContent = getFeedbackBadgeLabel('warning');
          textEl.textContent = '检测到发帖框有新的文件变动，原切图填入结果已失效，请手动核对后再发布。';
        }
      };
      root.addEventListener('change', onRootChange, true);
      rec.changeRootEl = root;
      rec.onRootChange = onRootChange;
    }

    return true;
  }

  function submitSlicesToComposer(binding, slices, options = {}) {
    if (!Array.isArray(slices) || slices.length === 0) {
      return Promise.resolve({
        ok: false,
        reason: 'no-slices',
        message: '未生成有效的切片文件，无法填入发帖框。'
      });
    }

    const sliceSnapshots = slices.map((s) => ({
      file: s.file,
      fileName: s.fileName,
      width: s.width,
      height: s.height,
      bytes: s.bytes,
      signature: s.signature ? s.signature.slice() : null
    }));

    const totalBytes = sliceSnapshots.reduce((sum, s) => sum + (s.bytes || s.file?.size || 0), 0);
    const baseTimeoutMs = Math.max(
      25000,
      sliceSnapshots.length * 1500,
      Math.min(120000, Math.round(totalBytes / 300000) * 1000)
    );
    const hardMaxTimeoutMs = Math.max(60000, sliceSnapshots.length * 4500, baseTimeoutMs);
    const {
      onProgress = () => {},
      onUploadReady = null,
      expectedPreSubmitDraftText = null,
      isReplacement = false
    } = options;
    const noAttachGraceMs = 5000;
    const partialSettleMs = 4500;
    const fullSettleMs = 350;

    const preCheck = validateTargetComposer(binding);
    if (!preCheck.ok) {
      return Promise.resolve(preCheck);
    }

    if (typeof expectedPreSubmitDraftText === 'string' && preCheck.draftText !== expectedPreSubmitDraftText) {
      return Promise.resolve({
        ok: false,
        reason: 'draft-changed-during-upload',
        message:
          expectedPreSubmitDraftText.length > 0
            ? '未完成：检测到目标发帖框中的原有文案在移除原附件后发生变化或丢失，已停止提交切片并保留当前现状，请手动核对发帖框。'
            : '未完成：检测到目标发帖框中的正文内容在移除原附件后发生意外变化，已停止提交切片并保留当前现状，请手动核对发帖框。'
      });
    }

    // Always capture the latest draft at submit time (never an older modal-open snapshot)
    const preSubmitDraftText =
      typeof expectedPreSubmitDraftText === 'string' ? expectedPreSubmitDraftText : preCheck.draftText;
    const baselineToastSnapshots = captureToastBaseline();

    let dataTransfer;
    try {
      dataTransfer = new DataTransfer();
      for (const slice of sliceSnapshots) {
        dataTransfer.items.add(slice.file);
      }
      binding.fileInput.value = '';
      binding.fileInput.files = dataTransfer.files;
      if (!binding.fileInput.files || binding.fileInput.files.length !== sliceSnapshots.length) {
        return Promise.resolve({
          ok: false,
          reason: 'file-assign-failed',
          message: `浏览器未能将全部 ${sliceSnapshots.length} 张切片写入目标文件输入框，请重试或手动导入。`
        });
      }
      internalFileDispatchInputs.add(binding.fileInput);
      try {
        binding.fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      } finally {
        internalFileDispatchInputs.delete(binding.fileInput);
      }
    } catch (err) {
      return Promise.resolve({
        ok: false,
        reason: 'dispatch-error',
        message: `触发目标发帖框上传失败：${err?.message || '未知错误'}`
      });
    }

    onProgress('submitted', 0, sliceSnapshots.length);

    return new Promise((resolve) => {
      const startTime = Date.now();
      let lastMutationTime = startTime;
      let lastProgressTime = startTime;
      let maxProgressSeen = 0;
      let lastSignatureKey = '';
      let fullReadySince = null;
      let settled = false;
      let evaluatingOrder = false;
      let uploadReadyFired = false;
      let pollTimer = null;
      let observer = null;

      function finish(result) {
        if (settled) return;
        settled = true;
        if (pollTimer) clearInterval(pollTimer);
        if (observer) observer.disconnect();
        resolve(result);
      }

      function verifyDraftAndConflictState(stageLabel) {
        const structCheck = validateTargetStructure(binding, { allowReplacedFileInput: true });
        if (!structCheck.ok) {
          return {
            ok: false,
            uploadCompleted: uploadReadyFired,
            reason: 'target-lost-during-upload',
            message: `${structCheck.message} 本次填入未确认完成，请检查页面后重新开始。`
          };
        }

        if (hasExistingPoll(binding.root)) {
          return {
            ok: false,
            uploadCompleted: uploadReadyFired,
            reason: 'poll-conflict-during-upload',
            message: '未完成：检测到目标发帖框在填入过程中新增了投票（与图片互斥），已停止并保留当前状态，请手动处理。'
          };
        }

        if (hasUnexpectedVideoOrGifDuringUpload(binding.root, binding.textbox)) {
          return {
            ok: false,
            uploadCompleted: uploadReadyFired,
            reason: 'media-conflict-during-upload',
            message: '未完成：检测到目标发帖框在填入过程中出现视频或 GIF 等互斥媒体，已停止并保留当前状态，请手动处理。'
          };
        }

        const currentDraftText = extractEditorDraftText(binding.textbox);
        if (currentDraftText !== preSubmitDraftText) {
          return {
            ok: false,
            uploadCompleted: uploadReadyFired,
            reason: 'draft-changed-during-upload',
            message:
              preSubmitDraftText.length > 0
                ? `未完成：检测到目标发帖框中的原有文案在${stageLabel}发生变化或丢失，无法确认草稿完整保留。扩展已立即停止确认并保留页面现状（未覆盖内容，也未自动重传或删除附件），请手动核对发帖框。`
                : `未完成：检测到目标发帖框中的正文内容在${stageLabel}发生意外变化，已立即停止确认并保留页面现状，请手动核对发帖框。`
          };
        }

        return null;
      }

      function buildOrderMismatchOutcome(reason, detailMsg, readyCount) {
        const hasDraft = preSubmitDraftText.length > 0;
        const draftPart = hasDraft ? '，已保留原有文案' : '';
        const isContentMismatch = reason === 'visual-content-mismatch';
        const issueLabel = isContentMismatch ? '检测到切片内容或顺序异常' : '检测到切片顺序错误';
        const guide = isContentMismatch
          ? '请在发帖框中手动核对切片画面与顺序后再发布（扩展未自动重传或删除已有附件）。'
          : '请在发帖框中手动检查并调整附件顺序后再发布（扩展未自动重传或删除已有附件）。';
        return {
          ok: false,
          uploadCompleted: true,
          orderStatus: 'mismatch',
          count: readyCount,
          hasDraft,
          reason,
          message: `上传已完成（共 ${readyCount} 张${draftPart}），但${issueLabel}：${detailMsg} ${guide}`
        };
      }

      function buildOrderUnconfirmedOutcome(detailMsg, readyCount) {
        const hasDraft = preSubmitDraftText.length > 0;
        const draftPart = hasDraft ? '（已保留原有文案）' : '';
        return {
          ok: true,
          uploadCompleted: true,
          orderStatus: 'unconfirmed',
          count: readyCount,
          hasDraft,
          reason: 'order-unconfirmed',
          message: `上传完成，共 ${readyCount} 张，请检查顺序后再发布${draftPart}。${detailMsg}`
        };
      }

      let pendingVerifiedSnapshot = null;

      function checkPostUploadAttachmentsState(currentState) {
        if (
          currentState.items.length === 0 &&
          !currentState.containerHasOpaqueContent &&
          !hasExistingMedia(binding.root, binding.textbox)
        ) {
          return { status: 'cleared' };
        }
        const hasUnexpectedSlotState =
          currentState.items.length !== sliceSnapshots.length ||
          currentState.postButtonDisabled ||
          currentState.containerOrRootIndicators > 0 ||
          currentState.items.some(
            (i) => i.error || i.explicitBusy || i.unknownStatus || !i.img
          );
        if (hasUnexpectedSlotState) {
          return { status: 'changed' };
        }
        const allReadyPresent =
          currentState.readyItems.length === sliceSnapshots.length &&
          currentState.inProgressCount === 0;
        if (!allReadyPresent) {
          return { status: 'resettling' };
        }
        const sameSlots =
          Boolean(pendingVerifiedSnapshot) &&
          currentState.readyItems.every(
            (item, idx) =>
              item.element === pendingVerifiedSnapshot.elements[idx] &&
              (item.img?.src || '') === pendingVerifiedSnapshot.srcs[idx]
          );
        return { status: sameSlots ? 'intact' : 'resettling' };
      }

      async function evaluate() {
        if (settled) return;
        const now = Date.now();
        const elapsed = now - startTime;

        const preGuardFail = verifyDraftAndConflictState(
          evaluatingOrder || uploadReadyFired ? '校验期间' : '填入过程中'
        );
        if (preGuardFail) {
          finish(preGuardFail);
          return;
        }

        const state = inspectAttachmentsState(binding, baselineToastSnapshots);
        const readyCount = state.readyItems.length;
        const totalItems = state.items.length;
        const progressCount = Math.min(sliceSnapshots.length, Math.max(readyCount, state.decodedCount));
        if (progressCount > maxProgressSeen) {
          maxProgressSeen = progressCount;
          lastProgressTime = now;
        }
        const effectiveTimeoutMs = Math.min(
          hardMaxTimeoutMs,
          Math.max(baseTimeoutMs, lastProgressTime - startTime + 20000)
        );

        const sigKey = `${readyCount}:${totalItems}:${state.inProgressCount}:${state.errorCount}:${state.postButtonDisabled}`;
        if (sigKey !== lastSignatureKey) {
          lastSignatureKey = sigKey;
          lastMutationTime = now;
        }

        if (state.errorCount > 0) {
          finish({
            ok: false,
            uploadCompleted: uploadReadyFired,
            reason: 'upload-error',
            message: `未完成：发帖框或页面出现上传错误${state.errorText ? `（${state.errorText}）` : ''}，当前仅就绪 ${readyCount} / ${sliceSnapshots.length} 张。请检查并手动处理发帖框。`
          });
          return;
        }

        if (evaluatingOrder || uploadReadyFired) {
          const postUploadStatus = checkPostUploadAttachmentsState(state);
          if (postUploadStatus.status === 'cleared') {
            finish({
              ok: false,
              uploadCompleted: true,
              attachmentsCleared: true,
              orderStatus: 'cleared',
              count: 0,
              reason: 'attachments-cleared-during-order-check',
              message: ''
            });
            return;
          }
          if (postUploadStatus.status === 'changed') {
            finish({
              ok: false,
              uploadCompleted: false,
              orderStatus: 'changed',
              count: state.items.length,
              reason: 'attachments-changed-during-order-check',
              message: `检测到发帖框附件已变化（当前 ${state.items.length} 项），原切图填入结果不再适用，请手动核对后再发布。`
            });
            return;
          }
          if (evaluatingOrder) {
            if (elapsed >= effectiveTimeoutMs) {
              if (postUploadStatus.status === 'intact') {
                finish(
                  buildOrderUnconfirmedOutcome(
                    '顺序核验等待超时，请手动确认发帖框中附件是否按从左到右排列。',
                    sliceSnapshots.length
                  )
                );
              } else {
                finish({
                  ok: false,
                  uploadCompleted: false,
                  orderStatus: 'changed',
                  count: state.items.length,
                  reason: 'attachments-changed-during-order-check',
                  message: `检测到发帖框附件已变化（当前 ${state.items.length} 项），原切图填入结果不再适用，请手动核对后再发布。`
                });
              }
            }
            return;
          }
          if (postUploadStatus.status === 'resettling' && elapsed >= effectiveTimeoutMs) {
            finish({
              ok: false,
              uploadCompleted: false,
              orderStatus: 'changed',
              count: state.items.length,
              reason: 'attachments-changed-during-order-check',
              message: `检测到发帖框附件已变化（当前 ${state.items.length} 项），原切图填入结果不再适用，请手动核对后再发布。`
            });
            return;
          }
        }

        const hasUnknownSlots = state.items.some((i) => i.unknownStatus);

        if (totalItems > sliceSnapshots.length) {
          fullReadySince = null;
          if (state.inProgressCount > 0 || hasUnknownSlots || state.postButtonDisabled) {
            onProgress('uploading', readyCount, sliceSnapshots.length);
            if (elapsed >= effectiveTimeoutMs) {
              finish({
                ok: false,
                reason: 'unexpected-extra-attachments',
                message: `未完成：检测到目标发帖框附件数量异常（${totalItems} 项，预期 ${sliceSnapshots.length} 项），请手动核对发帖框。`
              });
            }
            return;
          }
          finish({
            ok: false,
            reason: 'unexpected-extra-attachments',
            message: `未完成：检测到目标发帖框附件数量异常（${totalItems} 张，预期 ${sliceSnapshots.length} 张），请手动核对发帖框。`
          });
          return;
        }

        if (
          state.inProgressCount > 0 ||
          hasUnknownSlots ||
          (totalItems > 0 && state.postButtonDisabled)
        ) {
          fullReadySince = null;
          onProgress('uploading', readyCount, sliceSnapshots.length);
          if (elapsed >= effectiveTimeoutMs) {
            const hasIncompleteImg = state.items.some(
              (i) => i.img && !(i.img.complete && i.img.naturalWidth > 0)
            );
            if (
              totalItems === sliceSnapshots.length &&
              state.inProgressCount === 0 &&
              !hasIncompleteImg
            ) {
              finish({
                ok: false,
                reason: 'upload-status-unconfirmed',
                message: `暂无法确认上传状态（等待超时：已检测到 ${totalItems} / ${sliceSnapshots.length} 张图片，但发帖框未给出可确认的上传就绪状态）。扩展未自动重传、清空附件或发布，请手动检查发帖框。`
              });
            } else {
              finish({
                ok: false,
                reason: 'upload-timeout',
                message: `等待超时：目标发帖框附件状态仍未确认就绪（当前就绪 ${readyCount} / ${sliceSnapshots.length} 张）。未自动重传或删除已有附件，请手动检查发帖框。`
              });
            }
          }
          return;
        }

        if (totalItems === 0 || readyCount === 0) {
          fullReadySince = null;
          if (state.containerHasOpaqueContent) {
            if (elapsed >= noAttachGraceMs) {
              finish({
                ok: false,
                reason: 'upload-status-unconfirmed',
                message: '暂无法确认上传状态：检测到发帖框媒体区已有内容变化，但无法读取各附件的上传状态。扩展未自动重传、清空附件或发布，请手动检查发帖框。'
              });
            }
            return;
          }
          if (elapsed >= noAttachGraceMs) {
            finish({
              ok: false,
              reason: 'rejected-empty',
              message: '未完成：目标发帖框未接收任何切片附件，可能已被平台拒绝或页面状态变化，请手动检查发帖框。'
            });
          }
          return;
        }

        if (readyCount < sliceSnapshots.length || totalItems < sliceSnapshots.length) {
          fullReadySince = null;
          onProgress('partial', readyCount, sliceSnapshots.length);
          if (now - lastMutationTime >= partialSettleMs || elapsed >= effectiveTimeoutMs) {
            finish({
              ok: false,
              reason: 'partial-accepted',
              count: readyCount,
              expected: sliceSnapshots.length,
              message: `未完成：目标发帖框仅就绪 ${readyCount} / ${sliceSnapshots.length} 张切片（可能受账号单帖图数上限或平台拒传影响）。扩展未自动重传或删除已有附件，请自行处理后决定是否继续。`
            });
          }
          return;
        }

        if (fullReadySince === null) {
          fullReadySince = now;
          onProgress('verifying', readyCount, sliceSnapshots.length);
          return;
        }

        if (now - fullReadySince >= fullSettleMs) {
          evaluatingOrder = true;
          try {
            const verifiedElements = state.readyItems.map((i) => i.element);
            const verifiedSrcs = state.readyItems.map((i) => i.img?.src || '');
            const verifiedRects = state.readyItems.map((i) => i.element.getBoundingClientRect());
            pendingVerifiedSnapshot = {
              elements: verifiedElements,
              srcs: verifiedSrcs,
              rects: verifiedRects
            };

            if (!uploadReadyFired) {
              uploadReadyFired = true;
              if (typeof onUploadReady === 'function') {
                try {
                  onUploadReady({
                    count: sliceSnapshots.length,
                    hasDraft: preSubmitDraftText.length > 0
                  });
                } catch {
                  // ignore callback errors
                }
              }
            }

            const orderCheck = await verifyAttachmentOrder(state.readyItems, sliceSnapshots);
            if (settled) return;

            // Re-verify target integrity, draft preservation, attachment state, and visual layout after async order check
            const postGuardFail = verifyDraftAndConflictState('校验期间');
            if (postGuardFail) {
              finish(postGuardFail);
              return;
            }

            const postState = inspectAttachmentsState(binding, baselineToastSnapshots);
            if (postState.errorCount > 0) {
              finish({
                ok: false,
                uploadCompleted: true,
                reason: 'upload-error',
                message: `未完成：发帖框或页面出现上传错误${postState.errorText ? `（${postState.errorText}）` : ''}，当前仅就绪 ${postState.readyItems.length} / ${sliceSnapshots.length} 张。请检查并手动处理发帖框。`
              });
              return;
            }

            const postSnapStatus = checkPostUploadAttachmentsState(postState);
            if (postSnapStatus.status === 'cleared') {
              finish({
                ok: false,
                uploadCompleted: true,
                attachmentsCleared: true,
                orderStatus: 'cleared',
                count: 0,
                reason: 'attachments-cleared-during-order-check',
                message: ''
              });
              return;
            }
            if (postSnapStatus.status === 'changed') {
              finish({
                ok: false,
                uploadCompleted: false,
                orderStatus: 'changed',
                count: postState.items.length,
                reason: 'attachments-changed-during-order-check',
                message: `检测到发帖框附件已变化（当前 ${postState.items.length} 项），原切图填入结果不再适用，请手动核对后再发布。`
              });
              return;
            }
            if (postSnapStatus.status === 'resettling') {
              pendingVerifiedSnapshot = null;
              fullReadySince = null;
              return;
            }

            const postLayout = checkVisualLayoutOrder(postState.readyItems);
            if (!postLayout.ok) {
              finish(buildOrderMismatchOutcome(postLayout.reason, postLayout.message, readyCount));
              return;
            }

            const layoutMoved = postLayout.rects.some(
              (r, idx) =>
                Math.abs(r.left - verifiedRects[idx].left) > 2 ||
                Math.abs(r.top - verifiedRects[idx].top) > 2
            );
            if (layoutMoved) {
              fullReadySince = null;
              return;
            }

            if (!orderCheck.ok) {
              if (orderCheck.reason === 'order-unconfirmed') {
                finish(buildOrderUnconfirmedOutcome(orderCheck.message, readyCount));
              } else {
                finish(buildOrderMismatchOutcome(orderCheck.reason, orderCheck.message, readyCount));
              }
              return;
            }

            const replaceLabel = isReplacement ? '（已替换原附件）' : '';
            const draftLabel = preSubmitDraftText.length > 0 ? '（已保留原有文案）' : '';
            finish({
              ok: true,
              uploadCompleted: true,
              orderStatus: 'confirmed',
              count: readyCount,
              hasDraft: preSubmitDraftText.length > 0,
              message: `已填入 ${readyCount} 张切片${replaceLabel}，等待发布${draftLabel}。请核对顺序与画面后手动点击发布按钮。`
            });
          } finally {
            evaluatingOrder = false;
          }
        }
      }

      if (typeof MutationObserver !== 'undefined') {
        observer = new MutationObserver((mutations) => {
          if (mutations.every((m) => isExtensionOwnedNode(m.target))) {
            return;
          }
          lastMutationTime = Date.now();
          evaluate();
        });
        observer.observe(document.body || binding.root, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true
        });
      }

      pollTimer = setInterval(evaluate, 120);
      evaluate();
    });
  }

  // --- Ticket 02: Single In-Composer Image Capture, Validation & Safe Replacement ---
  const internalFileDispatchInputs = new WeakSet();
  const composerCapturedMedia = new WeakMap();
  const composerClearedAt = new WeakMap();
  const knownFileInputToComposer = new WeakMap();
  const captureInstalledDocs = new WeakSet();

  const REMOVE_MEDIA_LABEL_PATTERN =
    /(remove(\s*(media|image|photo|attachment))?|移除(\s*(媒体|媒體|图片|圖片|附件))?|删除(\s*(媒体|媒體|图片|圖片|附件))?|刪除(\s*(媒体|媒體|图片|圖片|附件))?|メディアを削除|미디어\s*삭제|supprimer(\s*le\s*m[eé]dia)?|eliminar(\s*(archivo\s*)?multimedia)?|medien\s*entfernen)/i;
  const EXCLUDED_REMOVE_LABEL_PATTERN = /(gif|video|poll|视频|影片|投票|切图|结果提示)/i;
  const EDIT_MEDIA_LABEL_PATTERN = /^(edit(\s*media)?|编辑(\s*媒体)?|編輯(\s*媒體)?|alt|添加描述|新增說明)/i;

  function resolveElementNode(node) {
    if (!node) return null;
    if (node.nodeType === 1) return node;
    return node.parentElement || null;
  }

  function findOwningNewPostComposer(targetNode, doc = document, options = {}) {
    const { allowSingleComposerFallback = false } = options;
    const composers = discoverComposers(doc);
    if (composers.length === 0) return null;

    const el = resolveElementNode(targetNode);
    if (el) {
      if (el.tagName === 'INPUT' && el.type === 'file') {
        const mappedRoot = knownFileInputToComposer.get(el);
        if (mappedRoot) {
          const mapped = composers.find((c) => c.root === mappedRoot);
          if (mapped) return mapped;
        }
      }

      for (const comp of composers) {
        if (comp.root.contains(el)) return comp;
      }
      const targetComposerAttr = el.closest('[data-composer-id]');
      if (targetComposerAttr) {
        return composers.find((c) => c.root === targetComposerAttr) || null;
      }
      const dialog = el.closest('[role="dialog"]');
      if (dialog) {
        const dialogComposers = composers.filter((c) => dialog.contains(c.root));
        if (dialogComposers.length === 1) return dialogComposers[0];
        return null;
      }

      // Walk upward from an outer composer wrapper/dropzone as long as it encloses uniquely one composer
      let cur = el.parentElement;
      while (cur && cur !== doc.body && cur !== doc.documentElement) {
        const enclosed = composers.filter((c) => cur === c.root || cur.contains(c.root));
        if (enclosed.length === 1) return enclosed[0];
        if (enclosed.length > 1) break;
        cur = cur.parentElement;
      }
    }

    if (allowSingleComposerFallback && composers.length === 1) {
      return composers[0];
    }
    return null;
  }

  function extractFilesFromDataTransfer(dataTransfer) {
    if (!dataTransfer) return [];
    const directFiles = Array.from(dataTransfer.files || []).filter((f) => f && f.size > 0);
    if (directFiles.length > 0) return directFiles;
    const items = Array.from(dataTransfer.items || []);
    const fromItems = [];
    for (const item of items) {
      if (item.kind === 'file' && typeof item.getAsFile === 'function') {
        const file = item.getAsFile();
        if (file && file.size > 0) fromItems.push(file);
      }
    }
    return fromItems;
  }

  function recordCapturedMediaForComposer(composerRoot, files, sourceKind) {
    if (!composerRoot) return;
    if (files.length === 1) {
      composerClearedAt.delete(composerRoot);
      composerCapturedMedia.set(composerRoot, {
        file: files[0],
        sourceKind,
        capturedAt: Date.now(),
        sawAttachment: false
      });
    } else if (files.length > 1) {
      composerCapturedMedia.delete(composerRoot);
      composerClearedAt.set(composerRoot, Date.now());
    }
  }

  function installInputCaptureListeners(doc = document) {
    if (!doc || captureInstalledDocs.has(doc)) return;
    captureInstalledDocs.add(doc);

    doc.addEventListener(
      'change',
      (event) => {
        const target = event?.target;
        if (!target || target.nodeType !== 1 || target.tagName !== 'INPUT' || target.type !== 'file') return;
        if (isExtensionOwnedNode(target) || internalFileDispatchInputs.has(target)) return;
        const composer = findOwningNewPostComposer(target, doc);
        if (!composer) return;
        const files = Array.from(target.files || []).filter((f) => f && f.size > 0);
        if (files.length > 0) {
          recordCapturedMediaForComposer(composer.root, files, 'file-input');
        }
      },
      true
    );

    doc.addEventListener(
      'drop',
      (event) => {
        const target = event?.target;
        if (target && isExtensionOwnedNode(target)) return;
        const files = extractFilesFromDataTransfer(event?.dataTransfer);
        if (files.length === 0) return;
        const composer = findOwningNewPostComposer(target, doc, { allowSingleComposerFallback: true });
        if (!composer) return;
        recordCapturedMediaForComposer(composer.root, files, 'drop');
      },
      true
    );

    doc.addEventListener(
      'paste',
      (event) => {
        const rawTarget = resolveElementNode(event?.target);
        let target = rawTarget;
        if (!target || target === doc.body || target === doc.documentElement) {
          const activeEl = resolveElementNode(doc.activeElement);
          if (activeEl && activeEl !== doc.body && activeEl !== doc.documentElement) {
            target = activeEl;
          } else {
            const selEl = resolveElementNode(doc.getSelection?.()?.anchorNode);
            if (selEl && selEl !== doc.body && selEl !== doc.documentElement) {
              target = selEl;
            }
          }
        }
        if (target && isExtensionOwnedNode(target)) return;
        const files = extractFilesFromDataTransfer(event?.clipboardData);
        if (files.length === 0) return;
        const composer = findOwningNewPostComposer(target, doc, { allowSingleComposerFallback: true });
        if (!composer) return;
        recordCapturedMediaForComposer(composer.root, files, 'paste');
      },
      true
    );
  }

  function syncCapturedMediaState(doc = document) {
    const composers = discoverComposers(doc);
    for (const comp of composers) {
      if (comp.fileInput) {
        knownFileInputToComposer.set(comp.fileInput, comp.root);
      }
      const rec = composerCapturedMedia.get(comp.root);
      if (!rec) continue;
      if (hasExistingPoll(comp.root) || hasVideoOrGifMarkers(comp.root, comp.textbox)) {
        composerCapturedMedia.delete(comp.root);
        composerClearedAt.set(comp.root, Date.now());
        continue;
      }
      const container = comp.root.querySelector('[data-testid="attachments"]');
      const slots = container && !isExtensionOwnedNode(container) ? collectAttachmentSlots(container) : [];
      if (slots.length > 1) {
        composerCapturedMedia.delete(comp.root);
        composerClearedAt.set(comp.root, Date.now());
      } else if (slots.length === 1) {
        rec.sawAttachment = true;
      } else if (slots.length === 0 && !hasExistingMedia(comp.root, comp.textbox)) {
        if (rec.sawAttachment) {
          composerCapturedMedia.delete(comp.root);
          composerClearedAt.set(comp.root, Date.now());
        }
      }
    }
  }

  function extractSlotBackgroundImageUrl(slot) {
    if (!slot || slot.nodeType !== 1) return '';
    const candidates = [slot, ...Array.from(slot.querySelectorAll('[style*="background-image"]'))];
    for (const el of candidates) {
      if (isExtensionOwnedNode(el)) continue;
      const bg = el.style?.backgroundImage || (typeof getComputedStyle === 'function' ? getComputedStyle(el).backgroundImage : '');
      if (!bg || bg === 'none') continue;
      const match = bg.match(/url\(\s*(['"]?)(.*?)\1\s*\)/i);
      if (match && match[2]) {
        return match[2].trim();
      }
    }
    return '';
  }

  function isSlotRemoveButtonCandidate(btn) {
    if (!btn || btn.nodeType !== 1 || isExtensionOwnedNode(btn)) return false;
    if (!isElementVisible(btn)) return false;
    if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
    if (btn.closest('[data-testid="toolBar"]')) return false;

    const testId = (btn.getAttribute('data-testid') || '').trim();
    if (testId === 'removePollButton' || testId === 'editMediaButton' || testId === 'altTextButton') {
      return false;
    }
    if (testId === 'removeMediaButton' || testId === 'removeMedia') {
      return true;
    }

    const label = [
      btn.getAttribute('aria-label') || '',
      btn.getAttribute('title') || '',
      btn.textContent || ''
    ]
      .join(' ')
      .trim();
    if (!label) return false;
    if (EDIT_MEDIA_LABEL_PATTERN.test(label)) return false;
    if (EXCLUDED_REMOVE_LABEL_PATTERN.test(label)) return false;
    return REMOVE_MEDIA_LABEL_PATTERN.test(label);
  }

  function findSlotRemoveButton(slot, container) {
    const insideSlot = Array.from(slot.querySelectorAll('button, [role="button"]')).filter(
      isSlotRemoveButtonCandidate
    );
    if (insideSlot.length === 1) {
      return insideSlot[0];
    }
    if (insideSlot.length > 1) {
      return null;
    }
    if (container && collectAttachmentSlots(container).length === 1) {
      const insideContainer = Array.from(container.querySelectorAll('button, [role="button"]')).filter(
        isSlotRemoveButtonCandidate
      );
      if (insideContainer.length === 1) {
        return insideContainer[0];
      }
    }
    return null;
  }

  function computeBitmap8x8Signature(bitmapOrImg) {
    const sigCanvas = document.createElement('canvas');
    sigCanvas.width = 8;
    sigCanvas.height = 8;
    const sigCtx = sigCanvas.getContext('2d', { willReadFrequently: true });
    if (!sigCtx) return null;
    try {
      sigCtx.clearRect(0, 0, 8, 8);
      sigCtx.imageSmoothingEnabled = true;
      sigCtx.drawImage(bitmapOrImg, 0, 0, 8, 8);
      return Array.from(sigCtx.getImageData(0, 0, 8, 8).data);
    } catch {
      return null;
    } finally {
      sigCanvas.width = 0;
      sigCanvas.height = 0;
    }
  }

  async function verifyCandidateFileMatchesSlot(candidateFile, img, slotSrc, options = {}) {
    const { fromCapturedEvent = false } = options;
    if (!candidateFile || candidateFile.size <= 0) {
      return { matched: false, reason: 'empty-candidate' };
    }

    const isLocalUrl = slotSrc.startsWith('blob:') || slotSrc.startsWith('data:');
    let slotBlob = null;
    if (isLocalUrl) {
      try {
        const res = await fetch(slotSrc);
        if (res.ok) {
          slotBlob = await res.blob();
        }
      } catch {
        slotBlob = null;
      }
    }

    if (slotBlob && slotBlob.size === candidateFile.size) {
      try {
        const [aBuf, bBuf] = await Promise.all([slotBlob.arrayBuffer(), candidateFile.arrayBuffer()]);
        if (bytesEqual(aBuf, bBuf)) {
          return { matched: true, exactBytes: true };
        }
      } catch {
        // fall through to bitmap verification
      }
    }

    let candBmp = null;
    let slotBmp = null;
    try {
      candBmp = await createImageBitmap(candidateFile, { imageOrientation: 'from-image' });
      const candW = candBmp.width;
      const candH = candBmp.height;
      const candRatio = candW / Math.max(1, candH);

      if (slotBlob) {
        slotBmp = await createImageBitmap(slotBlob, { imageOrientation: 'from-image' });
        const slotW = slotBmp.width;
        const slotH = slotBmp.height;
        const slotRatio = slotW / Math.max(1, slotH);
        const ratioDiff = Math.abs(candRatio - slotRatio) / Math.max(candRatio, slotRatio, 1e-6);
        if (ratioDiff > 0.08) {
          return { matched: false, reason: 'aspect-mismatch' };
        }
        if (slotW > candW || slotH > candH) {
          return { matched: false, reason: 'slot-larger-than-candidate' };
        }
        const candSig = computeBitmap8x8Signature(candBmp);
        const slotSig = computeBitmap8x8Signature(slotBmp);
        if (!candSig || !slotSig || signatureMad(candSig, slotSig) > 18) {
          return { matched: false, reason: 'visual-mismatch' };
        }
        return { matched: true, exactBytes: false };
      }

      if (img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
        const imgW = img.naturalWidth;
        const imgH = img.naturalHeight;
        const imgRatio = imgW / Math.max(1, imgH);
        const ratioDiff = Math.abs(candRatio - imgRatio) / Math.max(candRatio, imgRatio, 1e-6);
        if (ratioDiff > 0.08) {
          return { matched: false, reason: 'aspect-mismatch' };
        }
        if (imgW > candW || imgH > candH) {
          return { matched: false, reason: 'slot-larger-than-candidate' };
        }
        const candSig = computeBitmap8x8Signature(candBmp);
        const imgSig = computeBitmap8x8Signature(img);
        if (candSig && imgSig) {
          if (signatureMad(candSig, imgSig) > 18) {
            return { matched: false, reason: 'visual-mismatch' };
          }
          return { matched: true, exactBytes: false };
        }
        // Cross-origin image (e.g. pbs.twimg.com) where pixel readback is tainted:
        // accept ONLY if candidate came from a verified capture event in this attachment lifecycle
        if (fromCapturedEvent) {
          return { matched: true, exactBytes: false };
        }
      }

      return { matched: false, reason: 'unconfirmable-source' };
    } catch {
      return { matched: false, reason: 'decode-failed' };
    } finally {
      if (candBmp) {
        try {
          candBmp.close();
        } catch {
          // ignore
        }
      }
      if (slotBmp) {
        try {
          slotBmp.close();
        } catch {
          // ignore
        }
      }
    }
  }

  function extensionFromMime(mimeType) {
    if (mimeType === 'image/jpeg') return 'jpg';
    if (mimeType === 'image/webp') return 'webp';
    if (mimeType === 'image/gif') return 'gif';
    if (mimeType === 'image/bmp') return 'bmp';
    if (mimeType === 'image/avif') return 'avif';
    return 'png';
  }

  function inspectSingleComposerAttachment(binding) {
    const structCheck = validateTargetStructure(binding, { allowReplacedFileInput: false });
    if (!structCheck.ok) return structCheck;

    if (hasExistingPoll(binding.root)) {
      return {
        ok: false,
        reason: 'has-poll',
        message: '当前发帖框已添加投票（与图片互斥），请先手动移除投票后再使用切图。'
      };
    }

    if (hasVideoOrGifMarkers(binding.root, binding.textbox)) {
      return {
        ok: false,
        reason: 'has-media',
        message: '当前发帖框已有媒体附件（视频或 GIF），框内切图仅支持单张静态图片；请先手动移除后再试（不会自动覆盖或混入）。'
      };
    }

    const container = binding.root.querySelector('[data-testid="attachments"]');
    const baseline = captureToastBaseline();
    const state = inspectAttachmentsState(binding, baseline);

    if (!container || isExtensionOwnedNode(container)) {
      if (hasExistingMedia(binding.root, binding.textbox)) {
        return {
          ok: false,
          reason: 'has-media',
          message: '当前发帖框已有媒体附件，但无法定位唯一的图片附件区域，无法执行替换。原附件与文案保持不变，请手动移除后再试。'
        };
      }
      return {
        ok: true,
        empty: true,
        draftText: extractEditorDraftText(binding.textbox)
      };
    }

    const slots = collectAttachmentSlots(container);
    if (slots.length === 0) {
      if (state.containerHasOpaqueContent || hasExistingMedia(binding.root, binding.textbox)) {
        return {
          ok: false,
          reason: 'has-media',
          message: '当前发帖框已有媒体附件，但无法读取完整静态图片数据（不支持直接截取可见区域）。原附件与文案保持不变，请手动移除后改用本地原文件。'
        };
      }
      return {
        ok: true,
        empty: true,
        draftText: extractEditorDraftText(binding.textbox)
      };
    }

    if (slots.length > 1) {
      return {
        ok: false,
        reason: 'has-media',
        message: `当前发帖框已有 ${slots.length} 个媒体附件，框内切图仅支持单张静态图片（不会批量替换或混排）。请手动保留 1 张或清空后再试。`
      };
    }

    const slot = slots[0];
    const itemEntry = state.items[0];
    if (state.errorCount > 0 || itemEntry?.error) {
      return {
        ok: false,
        reason: 'has-media',
        message: '当前发帖框已有媒体附件且处于上传错误状态，无法直接切分替换。原附件与文案保持不变，请先手动处理或移除后改用本地原文件。'
      };
    }

    const img = itemEntry?.img || null;
    const bgUrl = !img ? extractSlotBackgroundImageUrl(slot) : '';
    const slotSrc = img ? (img.getAttribute('src') || img.src || '').trim() : bgUrl;

    const slotStatusAttr = slot.getAttribute('data-upload-status');
    const bgReady =
      Boolean(!img && bgUrl) &&
      state.containerOrRootIndicators === 0 &&
      !itemEntry?.explicitBusy &&
      !state.postButtonDisabled &&
      (slotStatusAttr === 'ready' || slotStatusAttr === 'complete' || slotStatusAttr === null);

    const isBrokenImgWithoutBusy =
      Boolean(img && img.complete && img.naturalWidth === 0) &&
      state.containerOrRootIndicators === 0 &&
      !itemEntry?.explicitBusy &&
      slotStatusAttr !== 'uploading' &&
      slotStatusAttr !== 'pending' &&
      !state.postButtonDisabled;

    if (
      state.postButtonDisabled ||
      itemEntry?.explicitBusy ||
      isBrokenImgWithoutBusy ||
      (!bgReady &&
        (state.inProgressCount > 0 ||
          itemEntry?.unknownStatus ||
          (img && (!img.complete || img.naturalWidth <= 0))))
    ) {
      return {
        ok: false,
        reason: 'has-media',
        message: isBrokenImgWithoutBusy
          ? '当前发帖框已有媒体附件，但图片加载失败或来源已失效。原附件与文案保持不变，请手动移除后改用本地原文件。'
          : '当前发帖框已有媒体附件且仍在上传或尚未就绪，请等待图片上传完成后再点击“切图”（原附件与文案保持不变）。'
      };
    }

    if (!slotSrc) {
      return {
        ok: false,
        reason: 'has-media',
        message: '当前发帖框已有媒体附件，但未找到可读取的完整图片数据（不会截取可见画面）。原附件与文案保持不变，请手动移除后改用本地原文件。'
      };
    }

    const removeButton = findSlotRemoveButton(slot, container);
    if (!removeButton) {
      return {
        ok: false,
        reason: 'has-media',
        message: '当前发帖框已有媒体附件，但未识别到安全的移除按钮，无法确认替换原附件。原附件与文案保持不变，请手动移除后改用本地原文件。'
      };
    }

    return {
      ok: true,
      empty: false,
      draftText: extractEditorDraftText(binding.textbox),
      slot,
      img,
      slotSrc,
      naturalWidth: img ? img.naturalWidth : 0,
      naturalHeight: img ? img.naturalHeight : 0,
      fileName: itemEntry?.fileName || '',
      removeButton
    };
  }

  async function prepareComposerModalSession(binding) {
    syncCapturedMediaState(document);
    const inspection = inspectSingleComposerAttachment(binding);
    if (!inspection.ok) {
      return inspection;
    }
    if (inspection.empty) {
      return {
        ok: true,
        mode: 'local-file',
        draftText: inspection.draftText,
        inComposerSource: null
      };
    }

    const { slot, img, slotSrc, naturalWidth, naturalHeight, fileName, removeButton, draftText } = inspection;
    const captured = composerCapturedMedia.get(binding.root) || null;
    const clearedAt = composerClearedAt.get(binding.root) || 0;
    const inputFile =
      !captured && binding.fileInput?.files?.length === 1 && clearedAt === 0
        ? binding.fileInput.files[0]
        : null;

    let resolvedFile = null;
    let resolvedKind = '';
    let candidateMismatchReason = null;

    if (captured && captured.file) {
      const check = await verifyCandidateFileMatchesSlot(captured.file, img, slotSrc, {
        fromCapturedEvent: true
      });
      if (check.matched) {
        resolvedFile = captured.file;
        resolvedKind = `captured-${captured.sourceKind}`;
      } else {
        candidateMismatchReason = check.reason;
      }
    }

    if (!resolvedFile && inputFile) {
      const check = await verifyCandidateFileMatchesSlot(inputFile, img, slotSrc, {
        fromCapturedEvent: false
      });
      if (check.matched) {
        resolvedFile = inputFile;
        resolvedKind = 'file-input';
      } else if (!candidateMismatchReason) {
        candidateMismatchReason = check.reason;
      }
    }

    if (!resolvedFile && candidateMismatchReason) {
      return {
        ok: false,
        reason: 'source-mismatch',
        message:
          '当前发帖框已有媒体附件，但检测到图片可能已被裁剪、编辑或来源与原文件不一致，无法确认完整原图。已保留原附件与文案，请手动移除后改用本地原文件切图。'
      };
    }

    if (!resolvedFile) {
      if (slotSrc.startsWith('http://') || slotSrc.startsWith('https://')) {
        return {
          ok: false,
          reason: 'remote-source-unconfirmed',
          message:
            '当前发帖框已有媒体附件，但该图片为远程链接（可能为平台缩放图或历史草稿），无法确认是完整本地原图。已保留原附件与文案，请手动移除后改用本地原文件切图。'
        };
      }

      return {
        ok: false,
        reason: slotSrc.startsWith('blob:') || slotSrc.startsWith('data:') ? 'source-unconfirmed' : 'source-unsupported',
        message:
          '当前发帖框已有媒体附件，但未捕获到用户添加的完整原文件（可能为页面缩略图、历史草稿或扩展加载前添加的图片），无法确认完整原图。已保留原附件与文案，请手动移除后改用本地原文件切图。'
      };
    }

    return {
      ok: true,
      mode: 'replace-existing',
      draftText,
      inComposerSource: {
        sourceFile: resolvedFile,
        capturedFile: captured?.file || null,
        sourceKind: resolvedKind,
        fileName: resolvedFile.name || fileName || 'composer-image',
        slotElement: slot,
        imgElement: img,
        imgSrc: slotSrc,
        naturalWidth,
        naturalHeight,
        removeButton
      }
    };
  }

  function validateComposerForReplace(binding, inComposerSource) {
    if (!inComposerSource) {
      return {
        ok: false,
        reason: 'missing-source',
        message: '未找到有效的框内来源图片信息，已停止替换，原附件与文案保持不变。'
      };
    }

    const inspection = inspectSingleComposerAttachment(binding);
    if (!inspection.ok) {
      return inspection;
    }
    if (inspection.empty) {
      return {
        ok: false,
        reason: 'source-removed',
        message: '检测到发帖框内的原图片已被移除，已停止替换（不会自动提交切片），现有文案保持不变。'
      };
    }

    const latestCapturedFile = composerCapturedMedia.get(binding.root)?.file || null;
    if (
      inspection.slot !== inComposerSource.slotElement ||
      inspection.img !== inComposerSource.imgElement ||
      inspection.slotSrc !== inComposerSource.imgSrc ||
      inspection.naturalWidth !== inComposerSource.naturalWidth ||
      inspection.naturalHeight !== inComposerSource.naturalHeight ||
      (inComposerSource.capturedFile && latestCapturedFile !== inComposerSource.capturedFile)
    ) {
      return {
        ok: false,
        reason: 'source-changed',
        message: '检测到发帖框内的原图片已发生变化或被替换，已停止替换（原附件与文案均未改动），请关闭后重新检查。'
      };
    }

    return {
      ok: true,
      draftText: inspection.draftText,
      removeButton: inspection.removeButton
    };
  }

  function countCurrentAttachments(binding) {
    if (!binding || !binding.root || !binding.root.isConnected) return 0;
    const container = binding.root.querySelector('[data-testid="attachments"]');
    if (!container || isExtensionOwnedNode(container)) return 0;
    return collectAttachmentSlots(container).length;
  }

  function isOriginalSlotRemovedFromComposer(binding, inComposerSource) {
    if (!inComposerSource?.slotElement) return false;
    if (!binding?.root?.isConnected) return false;
    const container = binding.root.querySelector('[data-testid="attachments"]');
    if (!container || isExtensionOwnedNode(container)) return true;
    return !inComposerSource.slotElement.isConnected || !container.contains(inComposerSource.slotElement);
  }

  function waitForSingleAttachmentRemoved(binding, inComposerSource, preSubmitDraftText, timeoutMs = 4000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let settled = false;
      let timer = null;
      let observer = null;

      function finish(result) {
        if (settled) return;
        settled = true;
        if (timer) clearInterval(timer);
        if (observer) observer.disconnect();
        resolve(result);
      }

      function buildPostClickRemovalStatus() {
        if (binding.root?.isConnected && isOriginalSlotRemovedFromComposer(binding, inComposerSource)) {
          return { originalRemoved: true, originalRemovalUncertain: false };
        }
        return { originalRemoved: false, originalRemovalUncertain: true };
      }

      function check() {
        if (settled) return;
        const structCheck = validateTargetStructure(binding, { allowReplacedFileInput: true });
        if (!structCheck.ok) {
          const status = buildPostClickRemovalStatus();
          finish({
            ok: false,
            ...status,
            currentAttachmentCount: countCurrentAttachments(binding),
            reason: 'target-lost-during-remove',
            message: `${structCheck.message} 已停止替换。`
          });
          return;
        }

        const currentDraft = extractEditorDraftText(binding.textbox);
        if (currentDraft !== preSubmitDraftText) {
          const status = buildPostClickRemovalStatus();
          finish({
            ok: false,
            ...status,
            currentAttachmentCount: countCurrentAttachments(binding),
            reason: 'draft-changed-during-remove',
            message:
              '检测到发帖框中的文案在移除原附件过程中发生变化，已停止提交切片并保留页面现状。'
          });
          return;
        }

        if (hasExistingPoll(binding.root) || hasVideoOrGifMarkers(binding.root, binding.textbox)) {
          const status = buildPostClickRemovalStatus();
          finish({
            ok: false,
            ...status,
            currentAttachmentCount: countCurrentAttachments(binding),
            reason: 'conflict-during-remove',
            message: '检测到发帖框在移除过程中出现投票或互斥媒体，已停止提交切片并保留页面现状。'
          });
          return;
        }

        const container = binding.root.querySelector('[data-testid="attachments"]');
        const slots = container && !isExtensionOwnedNode(container) ? collectAttachmentSlots(container) : [];
        if (slots.length === 0 && !hasExistingMedia(binding.root, binding.textbox)) {
          finish({ ok: true });
          return;
        }

        if (Date.now() - startTime >= timeoutMs) {
          const status = buildPostClickRemovalStatus();
          finish({
            ok: false,
            ...status,
            currentAttachmentCount: countCurrentAttachments(binding),
            reason: 'remove-timeout',
            message: status.originalRemoved
              ? '原附件节点已移除，但发帖框中检测到其他未预期的附件状态变化，已停止提交切片。'
              : '已触发移除原附件，但超时未能确认原附件已完全清空（平台可能存在延迟移除或状态变化），已停止提交切片。'
          });
        }
      }

      if (typeof MutationObserver !== 'undefined') {
        observer = new MutationObserver((mutations) => {
          if (mutations.every((m) => isExtensionOwnedNode(m.target))) return;
          check();
        });
        observer.observe(binding.root, {
          childList: true,
          subtree: true,
          attributes: true
        });
      }

      timer = setInterval(check, 60);
      check();
    });
  }

  function waitForSingleFileInputAfterRemove(binding, preSubmitDraftText, timeoutMs = 1000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let settled = false;
      let timer = null;
      let observer = null;

      function finish(result) {
        if (settled) return;
        settled = true;
        if (timer) clearInterval(timer);
        if (observer) observer.disconnect();
        resolve(result);
      }

      function check() {
        if (settled) return;
        const postRemoveStruct = validateTargetStructure(binding, { allowReplacedFileInput: true });
        if (!postRemoveStruct.ok) {
          finish({
            ok: false,
            reason: 'target-lost-after-remove',
            message: `${postRemoveStruct.message} 原附件已从发帖框移除，未提交任何切片。`
          });
          return;
        }
        if (extractEditorDraftText(binding.textbox) !== preSubmitDraftText) {
          finish({
            ok: false,
            reason: 'draft-changed-during-remove',
            message: '检测到发帖框中的文案在移除原附件后发生变化，已停止提交切片并保留页面现状。'
          });
          return;
        }
        const inputs = queryComposerFileInputs(binding.root);
        if (inputs.length === 1) {
          finish({ ok: true, fileInput: inputs[0] });
          return;
        }
        if (Date.now() - startTime >= timeoutMs) {
          finish({
            ok: false,
            reason: 'file-input-missing-after-remove',
            message: '原附件已从发帖框移除，但未能定位唯一的文件输入控件，无法继续提交切片。原有文案已保留，请手动处理。'
          });
        }
      }

      if (typeof MutationObserver !== 'undefined' && binding.root?.isConnected) {
        observer = new MutationObserver(() => check());
        observer.observe(binding.root, { childList: true, subtree: true });
      }
      timer = setInterval(check, 50);
      check();
    });
  }

  async function replaceAttachmentAndSubmitSlices(binding, inComposerSource, slices, options = {}) {
    const preCheck = validateComposerForReplace(binding, inComposerSource);
    if (!preCheck.ok) {
      return {
        ...preCheck,
        originalRemoved: false,
        originalRemovalUncertain: false
      };
    }

    const preSubmitDraftText = preCheck.draftText;
    const removeBtn = preCheck.removeButton;

    if (typeof options.onProgress === 'function') {
      try {
        options.onProgress('removing', 0, Array.isArray(slices) ? slices.length : 0);
      } catch {
        // ignore progress errors
      }
    }

    try {
      removeBtn.click();
    } catch (err) {
      return {
        ok: false,
        originalRemoved: false,
        originalRemovalUncertain: false,
        reason: 'remove-click-failed',
        message: `触发移除原附件失败（${err?.message || '未知错误'}），已停止替换，原附件与文案保持不变。`
      };
    }

    const removeResult = await waitForSingleAttachmentRemoved(binding, inComposerSource, preSubmitDraftText, 4000);
    if (!removeResult.ok) {
      return removeResult;
    }

    const fileInputReady = await waitForSingleFileInputAfterRemove(binding, preSubmitDraftText, 1000);
    if (!fileInputReady.ok) {
      return {
        ok: false,
        originalRemoved: true,
        originalRemovalUncertain: false,
        currentAttachmentCount: countCurrentAttachments(binding),
        reason: fileInputReady.reason,
        message: fileInputReady.message
      };
    }

    const submissionBinding = createBindingSnapshot({
      root: binding.root,
      textbox: binding.textbox,
      fileInput: fileInputReady.fileInput,
      tweetButton: binding.tweetButton
    });

    const submitOutcome = await submitSlicesToComposer(submissionBinding, slices, {
      ...options,
      expectedPreSubmitDraftText: preSubmitDraftText,
      isReplacement: true
    });

    return {
      ...submitOutcome,
      originalRemoved: true,
      originalRemovalUncertain: false,
      currentAttachmentCount: countCurrentAttachments(binding)
    };
  }

  XSlicer.composerAdapter = {
    discoverComposers,
    createBindingSnapshot,
    validateTargetStructure,
    validateTargetComposer,
    submitSlicesToComposer,
    isElementVisible,
    nextSubmissionToken,
    showComposerFeedback,
    clearComposerFeedback,
    installInputCaptureListeners,
    syncCapturedMediaState,
    prepareComposerModalSession,
    validateComposerForReplace,
    replaceAttachmentAndSubmitSlices,
    countCurrentAttachments
  };
})();
