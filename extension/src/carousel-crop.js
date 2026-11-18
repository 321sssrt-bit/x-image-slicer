(() => {
  'use strict';

  const XSlicer = (globalThis.XSlicer = globalThis.XSlicer || {});

  // X 网页端多图轮播 sizing, ported from X's web client (2026-11-17, see docs/discovery.md). Units are the media box
  // width W: every card shares height H, a card is min(H × aspect, 0.8W) wide, and a capped card is cropped centred.
  // Gaps only shift H by a few px and never change which cards are capped or by how much, so they are left out.
  const BASE_HEIGHT = 0.68;
  const MAX_HEIGHT = 1.24446;
  const MAX_CARD_WIDTH = 0.8;
  // 2 images: the shorter side-by-side row is used when the 2nd card already shows at least this much at 0.68W
  const MIN_SECOND_VISIBLE = 0.33;
  // 3+ images: while 33% or more of the 2nd card is hidden the box keeps its height, otherwise it grows until
  // exactly 67% of the 2nd card shows
  const MIN_SECOND_HIDDEN = 0.33;
  const SECOND_PEEK = 1 - MIN_SECOND_HIDDEN;

  function cardWidth(height, aspect) {
    return Math.min(height * aspect, MAX_CARD_WIDTH);
  }

  function sum(aspects) {
    return aspects.reduce((total, a) => total + a, 0);
  }

  // Height at which the row fills W exactly. At most one card can be held at 0.8W (two would need more than the whole
  // row), and the rest then fill the remaining 0.2W
  function fillHeight(aspects) {
    const height = 1 / sum(aspects);
    const fits = aspects.filter((a) => height * a <= MAX_CARD_WIDTH);
    return fits.length === aspects.length ? height : (1 - MAX_CARD_WIDTH) / sum(fits);
  }

  // The 1st card is at most 0.8W wide, so at least 0.2W is left for the 2nd
  function secondVisible(height, [first, second]) {
    const secondWidth = cardWidth(height, second);
    return Math.min(1 - cardWidth(height, first), secondWidth) / secondWidth;
  }

  // Lowest height at which the 1st card plus 67% of the 2nd fill W, with either card possibly at 0.8W (the other one
  // then always fits). Rounding can drop both candidates at the boundary between two cases, e.g. 4757 px next to
  // 1775 px at 3 px high: X then keeps the height, so null stays
  function peekHeight([first, second]) {
    const candidates = [];
    const free = 1 / (first + SECOND_PEEK * second);
    if (free * first <= MAX_CARD_WIDTH && free * second <= MAX_CARD_WIDTH) candidates.push(free);
    const firstCapped = (1 - MAX_CARD_WIDTH) / (SECOND_PEEK * second);
    if (firstCapped * first >= MAX_CARD_WIDTH) candidates.push(firstCapped);
    const secondCapped = (1 - SECOND_PEEK * MAX_CARD_WIDTH) / first;
    if (secondCapped * second >= MAX_CARD_WIDTH) candidates.push(secondCapped);
    return candidates.length > 0 ? Math.min(...candidates) : null;
  }

  function carouselHeight(aspects) {
    let height = BASE_HEIGHT;
    const fill = fillHeight(aspects);
    if (fill >= height) height = Math.min(fill, MAX_HEIGHT);
    if (aspects.length === 2) {
      if (fill < height && secondVisible(height, aspects) >= MIN_SECOND_VISIBLE) height = fill;
    } else if (1 - secondVisible(height, aspects) < MIN_SECOND_HIDDEN) {
      const peek = peekHeight(aspects);
      if (peek !== null) {
        // Grow, but never past the height at which the 1st or 2nd card reaches 0.8W
        const firstTwoCap = Math.min(MAX_CARD_WIDTH / aspects[0], MAX_CARD_WIDTH / aspects[1]);
        height = Math.max(height, Math.min(peek, MAX_HEIGHT, firstTwoCap));
      }
    }
    return height;
  }

  // 轮播裁边 per slice (2 or more), in slice order: the fraction of its width X crops away (half on each side),
  // 0 when shown whole
  function carouselCropFractions(aspects) {
    const height = carouselHeight(aspects);
    return aspects.map((a) => {
      const crop = 1 - cardWidth(height, a) / (height * a);
      return crop > 1e-9 ? crop : 0;
    });
  }

  XSlicer.carouselCrop = { carouselCropFractions };
})();
