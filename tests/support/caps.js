/**
 * Finds text drawn in capitals on whatever the page is showing.
 *
 * Staj sets nothing in capitals: labels, counters and dates are sentence
 * case, and the wordmark is "Staj" (shape.md). This walks the rendered
 * page and reports every element whose *style* would draw its text in
 * capitals: a `text-transform` of uppercase or capitalize, or a
 * `font-variant-caps` of anything but normal (small caps and the rest).
 *
 * It reads style and never the letters. A dish a chef named "BBQ ribs", or a
 * note typed in capitals, is theirs and is shown as typed; only the app
 * deciding to shout can fail this. (The flip side: a string typed into the
 * source in capitals isn't a style, so isn't found here. The source has none,
 * and tests/sentence-case.spec.js pins the ones that matter.)
 *
 * It looks at what is rendered: hidden things and the screen-reader-only
 * text are skipped, but the share card, drawn off-screen to be saved as an
 * image, counts. Pseudo-elements with content and a field's placeholder
 * count too.
 *
 * Runs in the page; returns one line per offending element.
 */
export function findCapitals(page) {
  return page.evaluate(() => {
    const SHOUTS = (cs) => {
      const reasons = [];
      if (cs.textTransform === 'uppercase' || cs.textTransform === 'capitalize') reasons.push(`text-transform: ${cs.textTransform}`);
      if (cs.fontVariantCaps && cs.fontVariantCaps !== 'normal') reasons.push(`font-variant-caps: ${cs.fontVariantCaps}`);
      return reasons;
    };

    const hidden = (el) => {
      for (let p = el; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return true;
      }
      return false;
    };

    const describe = (el, suffix = '') => {
      const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '';
      return `${el.tagName.toLowerCase()}${cls}${suffix}`;
    };

    const ownText = (el) =>
      [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent.trim())
        .join(' ')
        .trim();

    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (['SCRIPT', 'STYLE', 'SVG', 'PATH', 'CANVAS'].includes(el.tagName.toUpperCase())) continue;
      const r = el.getBoundingClientRect();
      // The visually-hidden text is for a screen reader and has no size.
      if (r.width <= 1 && r.height <= 1) continue;
      if (hidden(el)) continue;
      const cs = getComputedStyle(el);

      const isField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
      const text = isField ? el.value || el.getAttribute('placeholder') || '' : ownText(el);
      if (text) {
        const reasons = SHOUTS(cs);
        if (reasons.length) out.push(`${describe(el)} "${text.slice(0, 40)}" (${reasons.join(', ')})`);
      }
      if (isField && el.getAttribute('placeholder')) {
        const reasons = SHOUTS(getComputedStyle(el, '::placeholder'));
        if (reasons.length) out.push(`${describe(el, '::placeholder')} (${reasons.join(', ')})`);
      }
      for (const pseudo of ['::before', '::after']) {
        const content = getComputedStyle(el, pseudo).content;
        // A string; "none", "normal" and an empty one draw no text.
        if (!content || content === 'none' || content === 'normal' || content === '""' || content === "''") continue;
        const reasons = SHOUTS(getComputedStyle(el, pseudo));
        if (reasons.length) out.push(`${describe(el, pseudo)} ${content} (${reasons.join(', ')})`);
      }
    }
    return [...new Set(out)];
  });
}
