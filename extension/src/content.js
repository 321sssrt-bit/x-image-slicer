(() => {
  'use strict';

  const XSlicer = (globalThis.XSlicer = globalThis.XSlicer || {});
  const { composerAdapter, modalUi, preferences } = XSlicer;

  const ENTRY_ATTR = 'data-x-slicer-entry';
  const composerBindings = new WeakMap();
  let activeModal = null;
  let isPreparingModal = false;
  let syncScheduled = false;

  function createEntryButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute(ENTRY_ATTR, 'true');
    btn.textContent = '切图';
    btn.setAttribute('aria-label', '切图（默认 8 张，可调 2～20 张）');
    btn.title = '切图（左右等分 2～20 张，默认 8 张）';
    btn.style.cssText = [
      'appearance: none',
      'border: 1px solid rgba(29, 155, 240, 0.55)',
      'background: rgba(29, 155, 240, 0.1)',
      'color: #1d9bf0',
      'border-radius: 9999px',
      'padding: 4px 12px',
      'font-size: 13px',
      'font-weight: 700',
      'line-height: 20px',
      'cursor: pointer',
      'margin: 0 6px',
      'display: inline-flex',
      'align-items: center',
      'justify-content: center',
      'vertical-align: middle',
      'flex: 0 0 auto'
    ].join(';');

    btn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (activeModal || isPreparingModal) {
        return;
      }

      const currentBinding = composerBindings.get(btn);
      if (!currentBinding) return;

      isPreparingModal = true;
      try {
        // Freeze an immutable snapshot for this modal session so DOM sync never alters bound target refs
        const snapshot = composerAdapter.createBindingSnapshot(currentBinding);
        const [session, splitMode] = await Promise.all([
          composerAdapter.prepareComposerModalSession(snapshot),
          preferences.loadSplitMode()
        ]);
        if (activeModal) {
          return;
        }
        activeModal = modalUi.createSlicerModal({
          binding: snapshot,
          triggerButton: btn,
          mode: session.ok ? session.mode : 'local-file',
          splitMode,
          inComposerSource: session.ok ? session.inComposerSource : null,
          initialError: session.ok ? null : session.message,
          onClose() {
            activeModal = null;
          }
        });
      } finally {
        isPreparingModal = false;
      }
    });

    return btn;
  }

  function mountEntryForComposer(composer) {
    const existingBtns = Array.from(composer.root.querySelectorAll(`button[${ENTRY_ATTR}="true"]`));
    let validBtn = null;
    for (const btn of existingBtns) {
      const bound = composerBindings.get(btn);
      if (!validBtn && bound && bound.root === composer.root) {
        bound.textbox = composer.textbox;
        bound.fileInput = composer.fileInput;
        bound.tweetButton = composer.tweetButton;
        validBtn = btn;
      } else {
        btn.remove();
      }
    }
    if (validBtn) {
      return;
    }

    const entryBtn = createEntryButton();
    composerBindings.set(entryBtn, { ...composer });

    const scrollList = composer.toolbar?.querySelector('[data-testid="ScrollSnap-List"]');
    if (scrollList && composer.root.contains(scrollList)) {
      scrollList.appendChild(entryBtn);
    } else if (composer.toolbar && composer.root.contains(composer.toolbar)) {
      if (composer.toolbar.contains(composer.tweetButton)) {
        composer.toolbar.insertBefore(entryBtn, composer.tweetButton);
      } else {
        composer.toolbar.appendChild(entryBtn);
      }
    } else if (composer.tweetButton.parentElement) {
      composer.tweetButton.parentElement.insertBefore(entryBtn, composer.tweetButton);
    } else {
      composer.root.appendChild(entryBtn);
    }
  }

  function syncComposers() {
    syncScheduled = false;
    composerAdapter.syncCapturedMediaState(document);
    const composers = composerAdapter.discoverComposers(document);
    const validRoots = new Set(composers.map((c) => c.root));
    for (const composer of composers) {
      mountEntryForComposer(composer);
    }
    const allEntryButtons = Array.from(document.querySelectorAll(`button[${ENTRY_ATTR}="true"]`));
    for (const btn of allEntryButtons) {
      const bound = composerBindings.get(btn);
      if (!bound || !validRoots.has(bound.root) || !bound.root.contains(btn)) {
        btn.remove();
      }
    }
  }

  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    queueMicrotask(syncComposers);
  }

  function init() {
    composerAdapter.installInputCaptureListeners(document);
    syncComposers();
    const observer = new MutationObserver(() => {
      scheduleSync();
    });
    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-x-composer-kind', 'data-composer-id', 'aria-label', 'hidden']
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
