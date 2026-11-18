(() => {
  'use strict';

  const XSlicer = (globalThis.XSlicer = globalThis.XSlicer || {});

  // Loaded at document_start, before any X script, so these window capture listeners see every key event first.
  // While the 切图窗口 is open they hand keydown to it and stop all key events from reaching X's own listeners
  // (capture or bubble). Only propagation stops: typing, Tab focus moves and button activation still happen.
  for (const type of ['keydown', 'keypress', 'keyup']) {
    window.addEventListener(
      type,
      (event) => {
        const handleKey = XSlicer.slicerKeyHandler;
        if (!handleKey) return;
        event.stopImmediatePropagation();
        handleKey(event);
      },
      true
    );
  }
})();
