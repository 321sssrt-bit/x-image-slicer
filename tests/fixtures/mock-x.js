(() => {
  'use strict';

  const state = {
    uploadMode: 'immediate',
    layoutMode: 'default',
    asyncStepMs: 160,
    asyncCompleteMs: 420,
    publishClicks: [],
    submissions: [],
    pageEscapeEvents: 0,
    pageArrowEvents: 0
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      state.pageEscapeEvents++;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      state.pageArrowEvents++;
    }
  });

  function createRemoveButtonForCard(item, opts = {}) {
    const {
      removeAriaLabel = 'Remove media',
      removeTestId = null,
      removeDelayMs = 0,
      removeFails = false,
      onRemoved = null
    } = opts;
    const rmBtn = document.createElement('button');
    rmBtn.type = 'button';
    rmBtn.className = 'remove-media-btn';
    rmBtn.textContent = '×';
    if (removeTestId) {
      rmBtn.setAttribute('data-testid', removeTestId);
    }
    if (removeAriaLabel) {
      rmBtn.setAttribute('aria-label', removeAriaLabel);
    }
    rmBtn.style.cssText = 'position:absolute;top:4px;right:4px;z-index:2;width:20px;height:20px;border-radius:9999px;border:none;background:rgba(15,20,25,0.75);color:#fff;cursor:pointer;line-height:1;';
    rmBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (removeFails) {
        return;
      }
      const doRemove = () => {
        if (item.isConnected) {
          item.remove();
        }
        if (typeof onRemoved === 'function') {
          onRemoved();
        }
      };
      if (removeDelayMs > 0) {
        setTimeout(doRemove, removeDelayMs);
      } else {
        doRemove();
      }
    });
    item.appendChild(rmBtn);
    return rmBtn;
  }

  async function renderUserSingleMediaCard(composerEl, attachments, postBtn, file, cfg = {}) {
    const {
      previewScale = 1,
      useBackgroundImage = false,
      uploadAsyncMs = 0,
      status = 'ready',
      removeAriaLabel = 'Remove media',
      removeTestId = null,
      removeDelayMs = 0,
      removeFails = false,
      replaceFileInputOnRemove = false,
      customSrc = null,
      withAltButton = false,
      twoRemoveButtons = false
    } = cfg;

    let displayUrl = customSrc || '';
    if (!displayUrl && file) {
      if (previewScale > 0 && previewScale < 1) {
        const bmp = await createImageBitmap(file);
        try {
          const w = Math.max(1, Math.round(bmp.width * previewScale));
          const h = Math.max(1, Math.round(bmp.height * previewScale));
          const cv = document.createElement('canvas');
          cv.width = w;
          cv.height = h;
          const ctx = cv.getContext('2d');
          ctx.drawImage(bmp, 0, 0, w, h);
          const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
          displayUrl = URL.createObjectURL(blob);
        } finally {
          bmp.close();
        }
      } else {
        displayUrl = URL.createObjectURL(file);
      }
    }

    const item = document.createElement('div');
    item.className = 'attachment-item';
    item.setAttribute('data-testid', 'attachmentItem');
    if (status) {
      item.setAttribute('data-upload-status', status);
    }

    if (useBackgroundImage) {
      item.style.backgroundImage = `url("${displayUrl}")`;
      item.style.backgroundSize = 'cover';
    } else {
      const img = document.createElement('img');
      img.src = displayUrl;
      img.alt = 'Image';
      item.appendChild(img);
    }

    if (withAltButton) {
      const altBtn = document.createElement('button');
      altBtn.type = 'button';
      altBtn.setAttribute('aria-label', 'Edit');
      altBtn.textContent = 'ALT';
      item.appendChild(altBtn);
    }

    const onRemoved = () => {
      if (replaceFileInputOnRemove) {
        const oldInput = composerEl.querySelector('input[type="file"][data-testid="fileInput"]');
        if (oldInput && oldInput.parentElement) {
          const replacement = oldInput.cloneNode(false);
          replacement.value = '';
          oldInput.parentElement.replaceChild(replacement, oldInput);
          bindComposerFileInput(composerEl, replacement, attachments, postBtn);
        }
      }
      if (postBtn) {
        postBtn.removeAttribute('aria-disabled');
      }
    };

    createRemoveButtonForCard(item, {
      removeAriaLabel,
      removeTestId,
      removeDelayMs,
      removeFails,
      onRemoved
    });
    if (twoRemoveButtons) {
      createRemoveButtonForCard(item, {
        removeAriaLabel,
        removeTestId,
        removeDelayMs,
        removeFails
      });
    }

    attachments.appendChild(item);

    if (uploadAsyncMs > 0) {
      if (postBtn) postBtn.setAttribute('aria-disabled', 'true');
      item.setAttribute('data-upload-status', 'uploading');
      const spinner = document.createElement('div');
      spinner.className = 'spinner';
      spinner.setAttribute('role', 'progressbar');
      spinner.setAttribute('aria-label', '上传中');
      spinner.textContent = '上传中';
      item.appendChild(spinner);
      setTimeout(() => {
        if (!composerEl.isConnected || !item.isConnected) return;
        markCardReady(item);
        if (postBtn) postBtn.removeAttribute('aria-disabled');
      }, uploadAsyncMs);
    }

    return item;
  }

  function bindComposerFileInput(composerEl, fileInput, attachments, postBtn) {
    if (!composerEl || !fileInput || !attachments) return;
    const composerId = composerEl.getAttribute('data-composer-id') || composerEl.id;
    fileInput.addEventListener('change', async () => {
      const files = Array.from(fileInput.files || []);
      const userCfg = composerEl.__userUploadConfig;
      if (userCfg && userCfg.enabled && files.length === 1 && !files[0].name.startsWith('slice-')) {
        if (userCfg.clearFileInputAfterSelect) {
          fileInput.value = '';
        }
        await renderUserSingleMediaCard(composerEl, attachments, postBtn, files[0], userCfg);
        return;
      }

      const syncCorrupt = state.uploadMode === 'corrupt-draft-on-change';
      if (syncCorrupt) {
        const textbox = composerEl.querySelector('[data-testid^="tweetTextarea_"][role="textbox"]');
        if (textbox) {
          if (typeof textbox.dataset.syncCorruptText === 'string') {
            textbox.textContent = textbox.dataset.syncCorruptText;
          } else {
            textbox.innerHTML = '';
          }
        }
        applyLayoutClass(attachments);
        for (const file of files) {
          renderAttachmentCard(attachments, file, 'ready');
        }
      }

      const fileBuffers = await Promise.all(
        files.map(async (f) => {
          const ab = await f.arrayBuffer();
          const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', ab));
          const sha256 = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
          return {
            name: f.name,
            size: f.size,
            sha256,
            bytes: f.size <= 1_000_000 ? Array.from(new Uint8Array(ab)) : null
          };
        })
      );

      state.submissions.push({
        composerId,
        count: files.length,
        files: fileBuffers
      });

      if (!syncCorrupt) {
        handleUploadSimulation(composerEl, attachments, postBtn, files);
      }
    });
  }

  function setupComposer(composerEl) {
    if (!composerEl || composerEl.dataset.mockReady === '1') return;
    composerEl.dataset.mockReady = '1';

    const composerId = composerEl.getAttribute('data-composer-id') || composerEl.id;
    const fileInput = composerEl.querySelector('input[type="file"][data-testid="fileInput"]');
    const attachments = composerEl.querySelector('[data-testid="attachments"]');
    const postBtn = composerEl.querySelector('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]');

    if (postBtn) {
      postBtn.addEventListener('click', () => {
        state.publishClicks.push(composerId);
      });
    }

    if (fileInput && attachments) {
      bindComposerFileInput(composerEl, fileInput, attachments, postBtn);
    }

    if (attachments) {
      composerEl.addEventListener('drop', async (e) => {
        const userCfg = composerEl.__userUploadConfig;
        if (!userCfg || !userCfg.enabled) return;
        const files = Array.from(e.dataTransfer?.files || []).filter((f) => f && f.size > 0);
        if (files.length === 1 && !files[0].name.startsWith('slice-')) {
          e.preventDefault();
          await renderUserSingleMediaCard(composerEl, attachments, postBtn, files[0], userCfg);
        }
      });

      composerEl.addEventListener('paste', async (e) => {
        const userCfg = composerEl.__userUploadConfig;
        if (!userCfg || !userCfg.enabled) return;
        const direct = Array.from(e.clipboardData?.files || []).filter((f) => f && f.size > 0);
        const fromItems = Array.from(e.clipboardData?.items || [])
          .filter((it) => it.kind === 'file' && typeof it.getAsFile === 'function')
          .map((it) => it.getAsFile())
          .filter((f) => f && f.size > 0);
        const files = direct.length > 0 ? direct : fromItems;
        if (files.length === 1 && !files[0].name.startsWith('slice-')) {
          e.preventDefault();
          await renderUserSingleMediaCard(composerEl, attachments, postBtn, files[0], userCfg);
        }
      });
    }
  }

  function renderAttachmentCard(attachments, file, status = 'ready', opts = {}) {
    const {
      useCarouselItem = false,
      anonymous = false,
      useRoleStatus = false,
      customSrc = null
    } = opts;

    const item = document.createElement('div');
    item.className = useCarouselItem ? 'carousel-slot' : 'attachment-item';
    if (!useCarouselItem) {
      item.setAttribute('data-testid', 'attachmentItem');
    }
    if (status !== null) {
      item.setAttribute('data-upload-status', status);
    }
    if (!anonymous) {
      item.setAttribute('data-slice-name', file.name);
    }

    const url = customSrc || URL.createObjectURL(file);

    const img = document.createElement('img');
    img.src = url;
    img.alt = anonymous ? 'Image' : file.name;
    item.appendChild(img);

    if (status === 'uploading' || useRoleStatus) {
      const spinner = document.createElement('div');
      spinner.className = 'spinner';
      spinner.setAttribute('role', useRoleStatus ? 'status' : 'progressbar');
      spinner.setAttribute('aria-label', '上传中');
      spinner.textContent = '上传中';
      item.appendChild(spinner);
    } else if (status === 'error') {
      const errBadge = document.createElement('div');
      errBadge.className = 'upload-error';
      errBadge.setAttribute('data-testid', 'uploadError');
      errBadge.textContent = '上传失败';
      item.appendChild(errBadge);
    }

    attachments.appendChild(item);
    return item;
  }

  function markCardReady(item, setStatusAttr = true) {
    if (setStatusAttr) {
      item.setAttribute('data-upload-status', 'ready');
    }
    const spinner = item.querySelector('[role="progressbar"], [role="status"]');
    if (spinner) spinner.remove();
  }

  function markCardError(item) {
    item.setAttribute('data-upload-status', 'error');
    const spinner = item.querySelector('[role="progressbar"], [role="status"]');
    if (spinner) spinner.remove();
    const errBadge = document.createElement('div');
    errBadge.className = 'upload-error';
    errBadge.setAttribute('data-testid', 'uploadError');
    errBadge.textContent = '上传失败';
    item.appendChild(errBadge);
  }

  function applyLayoutClass(el) {
    if (!el) return;
    el.classList.remove('wrap-grid', 'row-reverse', 'x-grid-4');
    if (state.layoutMode === 'wrap-grid' || state.layoutMode === 'row-reverse') {
      el.classList.add(state.layoutMode);
    }
  }

  function handleUploadSimulation(composerEl, attachments, postBtn, files) {
    const mode = state.uploadMode;
    applyLayoutClass(attachments);

    if (state.enforce20Cap) {
      const existingCount = attachments.querySelectorAll('.attachment-item, .carousel-slot, [data-testid="attachmentItem"]').length;
      if (existingCount + files.length > 20) {
        const err = document.createElement('div');
        err.className = 'upload-error';
        err.setAttribute('data-testid', 'uploadError');
        err.textContent = `超出单帖 20 张上限（现有 ${existingCount} + 新增 ${files.length}）`;
        attachments.appendChild(err);
        return;
      }
    }

    if (mode === 'reject-all') {
      const err = document.createElement('div');
      err.className = 'upload-error';
      err.setAttribute('data-testid', 'uploadError');
      err.textContent = '平台拒绝接收媒体附件';
      attachments.appendChild(err);
      return;
    }

    if (mode === 'global-toast-reject') {
      const toast = document.createElement('div');
      toast.setAttribute('data-testid', 'toast');
      toast.textContent = '无法上传更多媒体文件';
      document.getElementById('toast-layer').appendChild(toast);
      return;
    }

    if (mode === 'global-toast-reuse-empty' || mode === 'global-toast-reuse-update') {
      const existingToast = document.querySelector('#toast-layer [data-testid="toast"]');
      if (existingToast) {
        existingToast.textContent =
          mode === 'global-toast-reuse-empty' ? '无法上传更多媒体文件' : '上传失败：超出媒体限制';
      }
      for (const file of files) {
        renderAttachmentCard(attachments, file, 'ready');
      }
      return;
    }

    if (mode === 'global-toast-reveal-parent') {
      const layer = document.getElementById('toast-layer');
      if (layer) layer.hidden = false;
      for (const file of files) {
        renderAttachmentCard(attachments, file, 'ready');
      }
      return;
    }

    if (mode === 'global-toast-dismiss-existing') {
      const existingToast = document.querySelector('#toast-layer [data-testid="toast"]');
      if (existingToast) {
        existingToast.style.display = 'none';
      }
      for (const file of files) {
        renderAttachmentCard(attachments, file, 'ready');
      }
      return;
    }

    if (mode === 'truncate-4' || mode === 'truncate-19') {
      const limit = mode === 'truncate-4' ? 4 : 19;
      const accepted = files.slice(0, limit);
      for (const file of accepted) {
        renderAttachmentCard(attachments, file, 'ready');
      }
      return;
    }

    if (mode === 'scramble-order' || mode === 'scramble-order-anonymous') {
      const reordered = files.slice();
      if (reordered.length >= 2) {
        const tmp = reordered[0];
        reordered[0] = reordered[reordered.length - 1];
        reordered[reordered.length - 1] = tmp;
      }
      for (const file of reordered) {
        renderAttachmentCard(attachments, file, 'ready', {
          anonymous: mode === 'scramble-order-anonymous'
        });
      }
      return;
    }

    if (mode === 'opaque-media-container') {
      const box = document.createElement('div');
      box.className = 'opaque-media-widget';
      box.textContent = '媒体处理区（自定义影子结构）';
      attachments.appendChild(box);
      return;
    }

    if (mode === 'opaque-media-canvas') {
      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 80;
      attachments.appendChild(canvas);
      return;
    }

    if (mode === 'opaque-media-shadow') {
      const host = document.createElement('div');
      host.className = 'opaque-shadow-host';
      const shadow = host.attachShadow({ mode: 'open' });
      const inner = document.createElement('div');
      inner.style.width = '120px';
      inner.style.height = '80px';
      inner.style.background = '#1d9bf0';
      shadow.appendChild(inner);
      attachments.appendChild(host);
      return;
    }

    if (mode === 'opaque-media-status-shadow') {
      const statusShell = document.createElement('div');
      statusShell.setAttribute('role', 'status');
      const host = document.createElement('div');
      host.className = 'opaque-shadow-host';
      const shadow = host.attachShadow({ mode: 'open' });
      const inner = document.createElement('div');
      inner.style.width = '120px';
      inner.style.height = '80px';
      inner.style.background = '#1d9bf0';
      shadow.appendChild(inner);
      statusShell.appendChild(host);
      attachments.appendChild(statusShell);
      return;
    }

    if (mode === 'unknown-upload-status') {
      for (const file of files) {
        renderAttachmentCard(attachments, file, 'opaque-unknown', { anonymous: true });
      }
      return;
    }

    if (mode === 'cross-origin-anonymous') {
      const group = document.createElement('div');
      group.className = 'carousel-group';
      group.setAttribute('role', 'group');
      applyLayoutClass(group);
      attachments.appendChild(group);
      files.forEach((file, idx) => {
        renderAttachmentCard(group, file, null, {
          useCarouselItem: true,
          anonymous: true,
          customSrc: `https://pbs.twimg.com/media/mock-slice-${idx}.png`
        });
      });
      return;
    }

    // Real X composer thumbnails for 4 media: a 2×2 grid built column by column, so its DOM runs 1, 3, 2, 4 while the
    // grid reads (and the post keeps) 1, 2, 3, 4. The misordered variant lays the DOM 1, 2, 3, 4 out the same way, so
    // the grid reads 1, 3, 2, 4: a real order problem
    if ((mode === 'x-composer-grid' || mode === 'x-composer-grid-misordered') && files.length === 4) {
      attachments.classList.add('x-grid-4');
      const domOrder = mode === 'x-composer-grid' ? [0, 2, 1, 3] : [0, 1, 2, 3];
      for (const i of domOrder) {
        renderAttachmentCard(attachments, files[i], 'ready', { anonymous: true });
      }
      return;
    }

    // Anonymous slots with the DOM in reverse, so under row-reverse a single row reads 1, 2, 3, 4 on screen
    if (mode === 'reversed-dom') {
      for (const file of [...files].reverse()) {
        renderAttachmentCard(attachments, file, 'ready', { anonymous: true });
      }
      return;
    }

    if (mode === 'real-x-carousel') {
      // Simulates real X: outer role="group" wrapping blob imgs without attachmentItem or data-upload-status,
      // while tweetButton stays aria-disabled="true" until background upload completes!
      if (postBtn) postBtn.setAttribute('aria-disabled', 'true');
      const group = document.createElement('div');
      group.className = 'carousel-group';
      group.setAttribute('role', 'group');
      applyLayoutClass(group);
      attachments.appendChild(group);

      for (const file of files) {
        renderAttachmentCard(group, file, null, {
          useCarouselItem: true,
          anonymous: true
        });
      }
      setTimeout(() => {
        if (postBtn && composerEl.isConnected) {
          postBtn.removeAttribute('aria-disabled');
        }
      }, 450);
      return;
    }

    if (mode === 'progressive-decoded-slow') {
      if (postBtn) postBtn.setAttribute('aria-disabled', 'true');
      const group = document.createElement('div');
      group.className = 'carousel-group';
      group.setAttribute('role', 'group');
      applyLayoutClass(group);
      attachments.appendChild(group);

      const splitAt = Math.ceil(files.length / 2);
      for (const file of files.slice(0, splitAt)) {
        renderAttachmentCard(group, file, null, {
          useCarouselItem: true,
          anonymous: true
        });
      }
      composerEl.__pendingProgressive = {
        group,
        remaining: files.slice(splitAt)
      };
      return;
    }

    if (mode === 'status-spinner-only') {
      // No data-upload-status, uses [role="status"] + aria-disabled on postBtn
      if (postBtn) postBtn.setAttribute('aria-disabled', 'true');
      const cards = files.map((file) =>
        renderAttachmentCard(attachments, file, null, {
          anonymous: true,
          useRoleStatus: true
        })
      );
      setTimeout(() => {
        if (!composerEl.isConnected) return;
        for (const c of cards) markCardReady(c, false);
        if (postBtn) postBtn.removeAttribute('aria-disabled');
      }, 700);
      return;
    }

    if (mode === 'sibling-progressbar') {
      const bar = document.createElement('div');
      bar.setAttribute('data-testid', 'mockSiblingProgress');
      bar.setAttribute('role', 'progressbar');
      bar.textContent = '容器外上传进度';
      composerEl.insertBefore(bar, attachments);
      for (const file of files) {
        renderAttachmentCard(attachments, file, 'ready');
      }
      return;
    }

    if (mode === 'extra-unknown-item') {
      for (const file of files) {
        renderAttachmentCard(attachments, file, 'ready');
      }
      if (files[0]) {
        renderAttachmentCard(attachments, files[0], 'processing');
      }
      return;
    }

    if (mode === 'extra-unknown-media-preview') {
      for (const file of files) {
        renderAttachmentCard(attachments, file, 'ready');
      }
      if (files[0]) {
        const extra = document.createElement('div');
        extra.className = 'media-preview';
        extra.setAttribute('data-testid', 'mediaPreview');
        extra.setAttribute('data-upload-status', 'processing');
        const img = document.createElement('img');
        img.src = URL.createObjectURL(files[0]);
        img.alt = 'Image';
        extra.appendChild(img);
        attachments.appendChild(extra);
      }
      return;
    }

    if (mode === 'extra-imageless-media-preview') {
      const group = document.createElement('div');
      group.className = 'carousel-group';
      group.setAttribute('role', 'group');
      attachments.appendChild(group);
      for (const file of files) {
        renderAttachmentCard(group, file, null, {
          useCarouselItem: true,
          anonymous: true
        });
      }
      const placeholder = document.createElement('div');
      placeholder.className = 'media-preview';
      placeholder.setAttribute('data-testid', 'mediaPreview');
      placeholder.setAttribute('data-upload-status', 'processing');
      attachments.appendChild(placeholder);
      return;
    }

    if (mode === 'nested-group-imageless-preview') {
      files.slice(0, 7).forEach((file) => {
        renderAttachmentCard(attachments, file, 'ready');
      });
      if (files[7]) {
        const group = document.createElement('div');
        group.className = 'carousel-group';
        group.setAttribute('role', 'group');
        renderAttachmentCard(group, files[7], null, {
          useCarouselItem: true,
          anonymous: true
        });
        const placeholder = document.createElement('div');
        placeholder.className = 'media-preview';
        placeholder.setAttribute('data-testid', 'mediaPreview');
        placeholder.setAttribute('data-upload-status', 'processing');
        group.appendChild(placeholder);
        attachments.appendChild(group);
      }
      return;
    }

    if (mode === 'real-x-square-thumbs' || mode === 'real-x-square-thumbs-swap-first2') {
      if (postBtn) postBtn.setAttribute('aria-disabled', 'true');
      const group = document.createElement('div');
      group.className = 'carousel-group';
      group.setAttribute('role', 'group');
      applyLayoutClass(group);
      attachments.appendChild(group);

      const inputFiles = files.slice();
      if (mode === 'real-x-square-thumbs-swap-first2' && inputFiles.length >= 2) {
        const tmp = inputFiles[0];
        inputFiles[0] = inputFiles[1];
        inputFiles[1] = tmp;
      }

      Promise.all(
        inputFiles.map(async (file) => {
          const bmp = await createImageBitmap(file);
          const side = Math.min(bmp.width, bmp.height);
          const sx = Math.floor((bmp.width - side) / 2);
          const sy = Math.floor((bmp.height - side) / 2);
          const cv = document.createElement('canvas');
          cv.width = 32;
          cv.height = 32;
          const ctx = cv.getContext('2d');
          ctx.drawImage(bmp, sx, sy, side, side, 0, 0, 32, 32);
          bmp.close();
          return { file, src: cv.toDataURL('image/png') };
        })
      ).then((rendered) => {
        if (!composerEl.isConnected) return;
        for (const item of rendered) {
          renderAttachmentCard(group, item.file, null, {
            useCarouselItem: true,
            anonymous: true,
            customSrc: item.src
          });
        }
        if (postBtn) postBtn.removeAttribute('aria-disabled');
      });
      return;
    }

    if (mode === 'real-x-3-collage') {
      if (postBtn) postBtn.setAttribute('aria-disabled', 'true');
      const group = document.createElement('div');
      group.className = 'carousel-group';
      group.setAttribute('role', 'group');
      applyLayoutClass(group);
      attachments.appendChild(group);

      Promise.all(
        files.map(async (file, idx) => {
          const bmp = await createImageBitmap(file);
          const targetW = idx === 0 ? 120 : 250;
          const targetH = idx === 0 ? 280 : 138;
          const targetRatio = targetW / targetH;
          const srcRatio = bmp.width / bmp.height;
          let sx = 0;
          let sy = 0;
          let sw = bmp.width;
          let sh = bmp.height;
          if (srcRatio > targetRatio) {
            sw = Math.max(1, Math.round(bmp.height * targetRatio));
            sx = Math.floor((bmp.width - sw) / 2);
          } else {
            sh = Math.max(1, Math.round(bmp.width / targetRatio));
            sy = Math.floor((bmp.height - sh) / 2);
          }
          const cv = document.createElement('canvas');
          cv.width = targetW;
          cv.height = targetH;
          const ctx = cv.getContext('2d');
          ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, targetW, targetH);
          bmp.close();
          return { file, src: cv.toDataURL('image/png') };
        })
      ).then((rendered) => {
        if (!composerEl.isConnected) return;
        for (const item of rendered) {
          renderAttachmentCard(group, item.file, null, {
            useCarouselItem: true,
            anonymous: true,
            customSrc: item.src
          });
        }
        if (postBtn) postBtn.removeAttribute('aria-disabled');
      });
      return;
    }

    if (mode === 'wrong-channel-anonymous') {
      files.forEach((file, idx) => {
        const cv = document.createElement('canvas');
        cv.width = 16;
        cv.height = 16;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = `rgb(255, ${idx * 30}, 0)`;
        ctx.fillRect(0, 0, 16, 16);
        renderAttachmentCard(attachments, file, 'ready', {
          anonymous: true,
          customSrc: cv.toDataURL('image/png')
        });
      });
      return;
    }

    if (mode === 'staggered-with-disabled-button') {
      if (postBtn) postBtn.setAttribute('aria-disabled', 'true');
      files.slice(0, 4).forEach((file) => {
        renderAttachmentCard(attachments, file, 'ready');
      });
      setTimeout(() => {
        if (!composerEl.isConnected) return;
        files.slice(4).forEach((file) => {
          renderAttachmentCard(attachments, file, 'ready');
        });
        if (postBtn) postBtn.removeAttribute('aria-disabled');
      }, 5200);
      return;
    }

    if (mode === 'async') {
      if (postBtn) postBtn.setAttribute('aria-disabled', 'true');
      let finished = 0;
      files.forEach((file, idx) => {
        setTimeout(() => {
          if (!composerEl.isConnected) return;
          const card = renderAttachmentCard(attachments, file, 'uploading');
          setTimeout(() => {
            if (!composerEl.isConnected) return;
            markCardReady(card);
            finished++;
            if (finished === files.length && postBtn) {
              postBtn.removeAttribute('aria-disabled');
            }
          }, state.asyncCompleteMs);
        }, idx * state.asyncStepMs);
      });
      return;
    }

    if (mode === 'partial-error') {
      files.forEach((file, idx) => {
        const card = renderAttachmentCard(attachments, file, 'uploading');
        setTimeout(() => {
          if (!composerEl.isConnected) return;
          if (idx >= 5) {
            markCardError(card);
          } else {
            markCardReady(card);
          }
        }, 250);
      });
      return;
    }

    if (mode === 'corrupt-draft-during-async') {
      if (postBtn) postBtn.setAttribute('aria-disabled', 'true');
      const cards = files.map((file) => renderAttachmentCard(attachments, file, 'uploading'));
      setTimeout(() => {
        if (!composerEl.isConnected) return;
        const textbox = composerEl.querySelector('[data-testid^="tweetTextarea_"][role="textbox"]');
        if (textbox) {
          textbox.textContent = '被篡改的残缺文案';
        }
        for (const c of cards) markCardReady(c);
        if (postBtn) postBtn.removeAttribute('aria-disabled');
      }, 220);
      return;
    }

    if (mode === 'rerender-draft-preserve') {
      if (postBtn) postBtn.setAttribute('aria-disabled', 'true');
      const cards = files.map((file) => renderAttachmentCard(attachments, file, 'uploading'));
      setTimeout(() => {
        if (!composerEl.isConnected) return;
        const textbox = composerEl.querySelector('[data-testid^="tweetTextarea_"][role="textbox"]');
        if (textbox && textbox.dataset.rerenderHtml) {
          textbox.innerHTML = textbox.dataset.rerenderHtml;
        }
        for (const c of cards) markCardReady(c);
        if (postBtn) postBtn.removeAttribute('aria-disabled');
      }, 220);
      return;
    }

    if (mode === 'add-poll-during-async') {
      if (postBtn) postBtn.setAttribute('aria-disabled', 'true');
      const cards = files.map((file) => renderAttachmentCard(attachments, file, 'uploading'));
      setTimeout(() => {
        if (!composerEl.isConnected) return;
        window.__mockX.addPoll(composerEl.getAttribute('data-composer-id') || composerEl.id);
        for (const c of cards) markCardReady(c);
        if (postBtn) postBtn.removeAttribute('aria-disabled');
      }, 180);
      return;
    }

    if (mode === 'add-video-during-async' || mode === 'add-gif-during-async' || mode === 'add-gif-label-during-async') {
      if (postBtn) postBtn.setAttribute('aria-disabled', 'true');
      const cards = files.map((file) => renderAttachmentCard(attachments, file, 'uploading'));
      setTimeout(() => {
        if (!composerEl.isConnected) return;
        const id = composerEl.getAttribute('data-composer-id') || composerEl.id;
        if (mode === 'add-video-during-async') {
          window.__mockX.addExistingVideo(id);
        } else if (mode === 'add-gif-during-async') {
          window.__mockX.addExistingGif(id);
        } else {
          const item = document.createElement('div');
          item.className = 'attachment-item';
          item.setAttribute('data-testid', 'mediaPreview');
          const rm = document.createElement('button');
          rm.type = 'button';
          rm.setAttribute('aria-label', 'Remove GIF');
          item.appendChild(rm);
          attachments.appendChild(item);
        }
        for (const c of cards) markCardReady(c);
        if (postBtn) postBtn.removeAttribute('aria-disabled');
      }, 180);
      return;
    }

    // Default: immediate
    for (const file of files) {
      renderAttachmentCard(attachments, file, 'ready');
    }
  }

  function initAll() {
    document.querySelectorAll('[data-composer-id]').forEach(setupComposer);
  }

  window.__mockX = {
    setUploadMode(mode, opts = {}) {
      state.uploadMode = mode;
      if (typeof opts.asyncStepMs === 'number') state.asyncStepMs = opts.asyncStepMs;
      if (typeof opts.asyncCompleteMs === 'number') state.asyncCompleteMs = opts.asyncCompleteMs;
    },
    setLayoutMode(mode = 'default') {
      state.layoutMode = mode;
    },
    setPreExistingToast(text = '', opts = {}) {
      const layer = document.getElementById('toast-layer');
      layer.innerHTML = '';
      layer.hidden = Boolean(opts.layerHidden);
      const toast = document.createElement('div');
      toast.setAttribute('data-testid', 'toast');
      toast.setAttribute('role', 'alert');
      if (opts.nodeHidden) toast.hidden = true;
      toast.textContent = text;
      layer.appendChild(toast);
    },
    showGlobalToast(text) {
      const layer = document.getElementById('toast-layer');
      layer.hidden = false;
      const toast = document.createElement('div');
      toast.setAttribute('data-testid', 'toast');
      toast.setAttribute('role', 'alert');
      toast.textContent = text;
      layer.appendChild(toast);
    },
    addComposerAlert(id, text) {
      const comp = document.querySelector(`[data-composer-id="${id}"]`);
      if (!comp) return;
      const alert = document.createElement('div');
      alert.setAttribute('role', 'alert');
      alert.textContent = text;
      comp.appendChild(alert);
    },
    scrambleCssOrder(id) {
      const comp = document.querySelector(`[data-composer-id="${id}"]`);
      const firstSlot = comp?.querySelector('[data-testid="attachments"] .attachment-item, [data-testid="attachments"] .carousel-slot');
      if (firstSlot) {
        firstSlot.style.order = '99';
      }
    },
    showModalComposer() {
      const dlg = document.getElementById('modal-dialog-wrapper');
      dlg.hidden = false;
      setupComposer(document.getElementById('modal-composer'));
    },
    hideModalComposer() {
      const dlg = document.getElementById('modal-dialog-wrapper');
      dlg.hidden = true;
    },
    removeComposer(id) {
      const el = document.querySelector(`[data-composer-id="${id}"]`);
      if (el) el.remove();
    },
    convertToReply(id) {
      const comp = document.querySelector(`[data-composer-id="${id}"]`);
      if (!comp) return;
      comp.dataset.xComposerKind = 'reply';
      const btn = comp.querySelector('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]');
      if (btn) btn.textContent = 'Reply';
    },
    swapComposerPostIdentity(id, newId) {
      const comp = document.querySelector(`[data-composer-id="${id}"]`);
      if (!comp) return;
      comp.setAttribute('data-composer-id', newId);
      const oldBox = comp.querySelector('[data-testid="tweetTextarea_0"]');
      if (oldBox && oldBox.parentElement) {
        const replacement = oldBox.cloneNode(false);
        oldBox.parentElement.replaceChild(replacement, oldBox);
      }
    },
    replaceTextbox(id) {
      const comp = document.querySelector(`[data-composer-id="${id}"]`);
      const oldBox = comp?.querySelector('[data-testid="tweetTextarea_0"]');
      if (oldBox && oldBox.parentElement) {
        const replacement = oldBox.cloneNode(false);
        oldBox.parentElement.replaceChild(replacement, oldBox);
      }
    },
    replaceFileInput(id) {
      const comp = document.querySelector(`[data-composer-id="${id}"]`);
      const oldInput = comp?.querySelector('input[type="file"][data-testid="fileInput"]');
      if (oldInput && oldInput.parentElement) {
        const replacement = oldInput.cloneNode(false);
        oldInput.parentElement.replaceChild(replacement, oldInput);
      }
    },
    replaceTweetButton(id) {
      const comp = document.querySelector(`[data-composer-id="${id}"]`);
      const oldBtn = comp?.querySelector('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]');
      if (oldBtn && oldBtn.parentElement) {
        const replacement = oldBtn.cloneNode(true);
        oldBtn.parentElement.replaceChild(replacement, oldBtn);
      }
    },
    setComposerText(id, text) {
      const el = document.querySelector(`[data-composer-id="${id}"] [data-testid^="tweetTextarea_"][role="textbox"]`);
      if (el) {
        el.innerHTML = '';
        el.textContent = text;
      }
    },
    setComposerDraftHtml(id, html, rerenderHtml = '') {
      const el = document.querySelector(`[data-composer-id="${id}"] [data-testid^="tweetTextarea_"][role="textbox"]`);
      if (el) {
        el.innerHTML = html;
        if (rerenderHtml) {
          el.dataset.rerenderHtml = rerenderHtml;
        } else {
          delete el.dataset.rerenderHtml;
        }
      }
    },
    addExistingAttachment(id) {
      const el = document.querySelector(`[data-composer-id="${id}"] [data-testid="attachments"]`);
      if (el) {
        const item = document.createElement('div');
        item.className = 'attachment-item';
        item.setAttribute('data-testid', 'attachmentItem');
        const img = document.createElement('img');
        img.src =
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        img.alt = 'existing.png';
        item.appendChild(img);
        el.appendChild(item);
      }
    },
    addExistingGif(id) {
      const el = document.querySelector(`[data-composer-id="${id}"] [data-testid="attachments"]`);
      if (el) {
        const item = document.createElement('div');
        item.className = 'attachment-item';
        item.setAttribute('data-testid', 'gifPreview');
        const video = document.createElement('video');
        video.setAttribute('autoplay', '');
        video.setAttribute('loop', '');
        item.appendChild(video);
        el.appendChild(item);
      }
    },
    addExistingVideo(id) {
      const el = document.querySelector(`[data-composer-id="${id}"] [data-testid="attachments"]`);
      if (el) {
        const item = document.createElement('div');
        item.className = 'attachment-item';
        item.setAttribute('data-testid', 'attachmentItem');
        const video = document.createElement('video');
        item.appendChild(video);
        el.appendChild(item);
      }
    },
    addPoll(id) {
      const comp = document.querySelector(`[data-composer-id="${id}"]`);
      const attachments = comp?.querySelector('[data-testid="attachments"]');
      if (comp && attachments) {
        const poll = document.createElement('div');
        poll.className = 'poll-box';
        poll.setAttribute('data-testid', 'pollOptions');
        poll.innerHTML = '<input name="choice1" value="A" /><input name="choice2" value="B" />';
        comp.insertBefore(poll, attachments);
      }
    },
    addSiblingProgressbar(id) {
      const comp = document.querySelector(`[data-composer-id="${id}"]`);
      const attachments = comp?.querySelector('[data-testid="attachments"]');
      if (comp && attachments && !comp.querySelector('[data-testid="mockSiblingProgress"]')) {
        const bar = document.createElement('div');
        bar.setAttribute('role', 'progressbar');
        bar.setAttribute('data-testid', 'mockSiblingProgress');
        bar.textContent = '上传进度条';
        comp.insertBefore(bar, attachments.nextSibling);
      }
    },
    clearSiblingProgressbar(id) {
      const comp = document.querySelector(`[data-composer-id="${id}"]`);
      comp?.querySelector('[data-testid="mockSiblingProgress"]')?.remove();
    },
    addCharacterCounterProgressbar(id, opts = {}) {
      const comp = document.querySelector(`[data-composer-id="${id}"]`);
      const toolbar = comp?.querySelector('[data-testid="toolBar"]');
      if (!comp) return null;
      const bar = document.createElement('div');
      bar.setAttribute('data-mock-control', '1');
      if (opts.testId !== null) {
        bar.setAttribute('data-testid', opts.testId || 'mockCharCounterProgress');
      }
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', String(opts.max ?? 280));
      bar.setAttribute('aria-valuenow', String(opts.now ?? 0));
      if (opts.ariaLabel !== null) {
        bar.setAttribute('aria-label', opts.ariaLabel || '字数限制');
      }
      if (opts.insideToolbar && toolbar) {
        toolbar.appendChild(bar);
      } else {
        comp.appendChild(bar);
      }
      return bar;
    },
    addHiddenProgressbar(id, hideMode = 'display-none') {
      const comp = document.querySelector(`[data-composer-id="${id}"]`);
      if (!comp) return null;
      const bar = document.createElement('div');
      bar.setAttribute('data-testid', 'mockHiddenProgress');
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-label', '上传进度');
      if (hideMode === 'hidden') {
        bar.hidden = true;
      } else if (hideMode === 'aria-hidden') {
        bar.setAttribute('aria-hidden', 'true');
      } else {
        bar.style.display = 'none';
      }
      comp.appendChild(bar);
      return bar;
    },
    addBlankStatusNode(id, text = '') {
      const comp = document.querySelector(`[data-composer-id="${id}"]`);
      if (!comp) return null;
      const status = document.createElement('div');
      status.setAttribute('data-testid', 'mockBlankStatus');
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.textContent = text;
      comp.appendChild(status);
      return status;
    },
    clearMockControlNodes(id) {
      const comp = document.querySelector(`[data-composer-id="${id}"]`);
      comp
        ?.querySelectorAll(
          '[data-mock-control="1"], [data-testid="mockCharCounterProgress"], [data-testid="mockHiddenProgress"], [data-testid="mockBlankStatus"], [data-testid="mockSiblingProgress"]'
        )
        .forEach((n) => n.remove());
    },
    mutateLastAttachmentSrc(id) {
      const comp = document.querySelector(`[data-composer-id="${id}"]`);
      const imgs = comp?.querySelectorAll('[data-testid="attachments"] img');
      if (imgs && imgs.length > 0) {
        const lastImg = imgs[imgs.length - 1];
        const cv = document.createElement('canvas');
        cv.width = 32;
        cv.height = 32;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(0, 0, 32, 32);
        lastImg.src = cv.toDataURL('image/png');
      }
    },
    releaseProgressiveBatch(id) {
      const comp = document.querySelector(`[data-composer-id="${id}"]`);
      const pending = comp?.__pendingProgressive;
      if (!pending || !pending.group.isConnected) return;
      for (const file of pending.remaining) {
        renderAttachmentCard(pending.group, file, null, {
          useCarouselItem: true,
          anonymous: true
        });
      }
      pending.remaining = [];
    },
    enableComposerPostButton(id) {
      const comp = document.querySelector(`[data-composer-id="${id}"]`);
      const postBtn = comp?.querySelector('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]');
      postBtn?.removeAttribute('aria-disabled');
    },
    setEnforce20Cap(flag = true) {
      state.enforce20Cap = Boolean(flag);
    },
    configureUserSingleUpload(id, cfg = {}) {
      const comp = document.querySelector(`[data-composer-id="${id}"]`);
      if (comp) {
        comp.__userUploadConfig = { enabled: true, ...cfg };
      }
    },
    clearSubmissions() {
      state.submissions.length = 0;
    },
    addRemovableSingleSlot(id, opts = {}) {
      const comp = document.querySelector(`[data-composer-id="${id}"]`);
      const attachments = comp?.querySelector('[data-testid="attachments"]');
      const postBtn = comp?.querySelector('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]');
      if (!comp || !attachments) return null;
      return renderUserSingleMediaCard(comp, attachments, postBtn, null, opts);
    },
    triggerDropFileBytes(id, bytesArray, fileName, mimeType) {
      const comp = document.querySelector(`[data-composer-id="${id}"]`);
      const target = comp?.querySelector('[data-testid^="tweetTextarea_"][role="textbox"]') || comp;
      if (!target) return;
      const u8 = new Uint8Array(bytesArray);
      const file = new File([u8], fileName, { type: mimeType, lastModified: Date.now() });
      const dt = new DataTransfer();
      dt.items.add(file);
      const evt = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
      target.dispatchEvent(evt);
    },
    triggerPasteFileBytes(id, bytesArray, fileName, mimeType) {
      const comp = document.querySelector(`[data-composer-id="${id}"]`);
      const target = comp?.querySelector('[data-testid^="tweetTextarea_"][role="textbox"]') || comp;
      if (!target) return;
      const u8 = new Uint8Array(bytesArray);
      const file = new File([u8], fileName, { type: mimeType, lastModified: Date.now() });
      const dt = new DataTransfer();
      dt.items.add(file);
      let evt;
      try {
        evt = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });
      } catch {
        evt = new Event('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(evt, 'clipboardData', { value: dt });
      }
      target.dispatchEvent(evt);
    },
    cropFirstAttachmentToSquare(id) {
      const comp = document.querySelector(`[data-composer-id="${id}"]`);
      const img = comp?.querySelector('[data-testid="attachments"] img');
      if (!img) return;
      const cv = document.createElement('canvas');
      cv.width = 40;
      cv.height = 40;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#cc33ff';
      ctx.fillRect(0, 0, 40, 40);
      img.src = cv.toDataURL('image/png');
    },
    getState() {
      return {
        pageEscapeEvents: state.pageEscapeEvents,
        pageArrowEvents: state.pageArrowEvents,
        publishClicks: state.publishClicks.slice(),
        submissions: state.submissions.map((s) => ({
          composerId: s.composerId,
          count: s.count,
          files: s.files
        }))
      };
    }
  };

  initAll();
})();
