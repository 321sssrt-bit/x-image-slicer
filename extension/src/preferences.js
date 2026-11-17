(() => {
  'use strict';

  const XSlicer = (globalThis.XSlicer = globalThis.XSlicer || {});

  // The only value this extension persists: the last-used split mode, in the extension's own storage.
  const SPLIT_MODE_KEY = 'splitMode';
  const SPLIT_MODES = ['equal', 'free'];
  const DEFAULT_SPLIT_MODE = 'equal';

  function isSplitMode(value) {
    return SPLIT_MODES.includes(value);
  }

  async function loadSplitMode() {
    try {
      const stored = await chrome.storage.local.get(SPLIT_MODE_KEY);
      const value = stored?.[SPLIT_MODE_KEY];
      return isSplitMode(value) ? value : DEFAULT_SPLIT_MODE;
    } catch {
      // Missing permission, invalidated extension context or storage failure
      return DEFAULT_SPLIT_MODE;
    }
  }

  async function saveSplitMode(mode) {
    try {
      await chrome.storage.local.set({ [SPLIT_MODE_KEY]: mode });
    } catch {
      // Best-effort preference; slicing works without it
    }
  }

  XSlicer.preferences = {
    isSplitMode,
    loadSplitMode,
    saveSplitMode
  };
})();
