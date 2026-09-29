/**
 * Finds square corners on whatever the page is showing.
 *
 * Staj has no straight corners: anything that draws a box -- a fill, a
 * border, a shadow, a photo -- rounds every corner you can see. This walks
 * the rendered page and reports each corner that breaks that, so the rule
 * is checked against what ships rather than against a reading of the CSS.
 *
 * A corner only counts if you can see it:
 * - both of its edges are drawn. A fill the same colour as what's behind
 *   it draws nothing; a single border-bottom is a rule, not a box;
 * - it isn't one of the screen's own corners. A sheet flush with the
 *   bottom of the viewport has no bottom corners to round, and a page
 *   that fills the screen takes its corners from the device. A sheet's
 *   top corners do count, sides flush or not: that is a corner you see;
 * - it isn't clipped away or rounded off by an ancestor that clips;
 * - its edge doesn't fade out. A band whose lower edge runs on into a
 *   gradient (an absolutely placed ::before or ::after hung below it) has
 *   no hard edge there, so no corner either.
 *
 * `frames` are selectors for things drawn to be exported as images of
 * their own, like the share card: their edges are the image's edges, as
 * the screen's are for everything else.
 *
 * Runs in the page; returns one line per offending corner.
 */
export function findSquareCorners(page, { frames = [] } = {}) {
  return page.evaluate((frameSelectors) => {
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const docH = document.documentElement.scrollHeight;
    const EPS = 1.5;
    const CORNERS = [
      ['top-left', 'Top', 'Left'],
      ['top-right', 'Top', 'Right'],
      ['bottom-right', 'Bottom', 'Right'],
      ['bottom-left', 'Bottom', 'Left'],
    ];

    const alpha = (color) => {
      const m = color.match(/rgba?\(([^)]+)\)/);
      if (!m) return color === 'transparent' ? 0 : 1;
      const parts = m[1].split(/[\s,/]+/).filter(Boolean);
      return parts.length > 3 ? parseFloat(parts[3]) : 1;
    };

    // What's painted behind an element: the nearest ancestor fill.
    const behind = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const bg = getComputedStyle(p).backgroundColor;
        if (alpha(bg) > 0) return bg;
      }
      return getComputedStyle(document.body).backgroundColor;
    };

    const hidden = (el) => {
      for (let p = el; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return true;
      }
      return false;
    };

    const frameOf = (el) => frameSelectors.map((sel) => el.closest(sel)).find(Boolean) ?? null;

    const fadesBelow = (el, height) =>
      ['::before', '::after'].some((pseudo) => {
        const ps = getComputedStyle(el, pseudo);
        return (
          ps.content !== 'none' &&
          ps.position === 'absolute' &&
          ps.backgroundImage.includes('gradient') &&
          Math.abs(parseFloat(ps.top) - height) < 2
        );
      });

    const inFixed = (el) => {
      for (let p = el; p; p = p.parentElement) {
        const pos = getComputedStyle(p).position;
        if (pos === 'fixed' || pos === 'sticky') return true;
      }
      return false;
    };

    const label = (el) => {
      const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '';
      return `${el.tagName.toLowerCase()}${cls}`;
    };

    const radius = (cs, corner) => parseFloat(cs.getPropertyValue(`border-${corner}-radius`)) || 0;

    const out = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (el.closest('svg')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      if (hidden(el)) continue;
      const cs = getComputedStyle(el);
      // A clip-path shapes the element itself; trust it and move on.
      if (cs.clipPath && cs.clipPath !== 'none') continue;

      const media = ['IMG', 'CANVAS', 'VIDEO'].includes(el.tagName);
      const fill =
        (alpha(cs.backgroundColor) > 0 && cs.backgroundColor !== behind(el)) || cs.backgroundImage !== 'none';
      const shadow = cs.boxShadow && cs.boxShadow !== 'none';
      const whole = media || fill || shadow;
      const soft = { Bottom: fadesBelow(el, r.height) };
      const drawn = (side) =>
        !soft[side] &&
        (whole ||
        (parseFloat(cs[`border${side}Width`]) > 0 &&
          cs[`border${side}Style`] !== 'none' &&
          alpha(cs[`border${side}Color`]) > 0));

      const frame = frameOf(el);
      let onScreenEdge;
      if (frame) {
        const fr = frame.getBoundingClientRect();
        onScreenEdge = {
          Left: r.left <= fr.left + EPS,
          Right: r.right >= fr.right - EPS,
          Top: r.top <= fr.top + EPS,
          Bottom: r.bottom >= fr.bottom - EPS,
        };
      } else {
        const fixed = inFixed(el);
        const top = fixed ? r.top : r.top + window.scrollY;
        const bottom = fixed ? r.bottom : r.bottom + window.scrollY;
        onScreenEdge = {
          Left: r.left <= EPS,
          Right: r.right >= vw - EPS,
          Top: top <= EPS,
          Bottom: bottom >= (fixed ? vh : docH) - EPS,
        };
      }

      for (const [corner, v, h] of CORNERS) {
        if (radius(cs, corner) > 0.5) continue;
        if (!drawn(v) || !drawn(h)) continue;
        if (onScreenEdge[v] && onScreenEdge[h]) continue;
        const x = h === 'Left' ? r.left : r.right;
        const y = v === 'Top' ? r.top : r.bottom;

        // An ancestor that clips either cuts this corner off or rounds it.
        let covered = false;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const pcs = getComputedStyle(p);
          const clips = pcs.overflow !== 'visible' || (pcs.clipPath && pcs.clipPath !== 'none');
          if (!clips) continue;
          const pr = p.getBoundingClientRect();
          if (x < pr.left - EPS || x > pr.right + EPS || y < pr.top - EPS || y > pr.bottom + EPS) {
            covered = true;
            break;
          }
          const px = h === 'Left' ? pr.left : pr.right;
          const py = v === 'Top' ? pr.top : pr.bottom;
          if (Math.abs(px - x) <= EPS && Math.abs(py - y) <= EPS && (radius(pcs, corner) > 0.5 || pcs.clipPath !== 'none')) {
            covered = true;
            break;
          }
        }
        if (!covered) out.push(`${label(el)} ${corner}`);
      }
    }
    return [...new Set(out)];
  }, frames);
}
