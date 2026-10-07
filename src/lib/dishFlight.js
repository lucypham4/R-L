// A dish's photo, carried between its card in the gallery and its place in
// the dish view.
//
// Opening a dish lifts its photo off the card and sets it down where the
// dish view keeps it; closing carries it back. The photo that travels is a
// copy, a lone <img> on the page itself: the real one belongs to the dish
// sheet, which positions it with transforms of its own and sits inside a
// view that fades in and out around it.
//
// The copy animates the box itself (left, top, width, height) with
// `object-fit: cover`, rather than a transform. A card shows a square crop
// of the photo and the dish view shows all of it, and animating the box is
// what lets the crop open out as it goes, with the corners and the hairline
// the same size throughout. It is the one place in the app where layout
// properties animate, on one fixed element with nothing around it to lay
// out.

import { token, tokenMs } from './motion';

/** The photo box of dish `id`'s card in the gallery, if it is on the page. */
export function cardPhotoOf(id) {
  return document.querySelector(`[data-meal-photo="${CSS.escape(String(id))}"]`);
}

const boxFrom = ({ left, top, width, height }) => ({ left, top, width, height });

/** Where `el` is on screen now. */
export function boxOf(el) {
  return boxFrom(el.getBoundingClientRect());
}

/**
 * Where `el`, a piece of the gallery, will be once the gallery has come
 * back into focus. Behind an open dish the gallery is scaled down a hair
 * (`--dof-scale`) about its own centre, and it comes back to full size as
 * the photo flies home; aiming at where the card is *now* would land it a
 * few pixels short.
 */
export function settledBoxOf(el) {
  const box = el.getBoundingClientRect();
  const stage = el.closest('.app-stage');
  const transform = stage ? getComputedStyle(stage).transform : 'none';
  const scale = transform && transform !== 'none' ? parseFloat(transform.slice(transform.indexOf('(') + 1)) : 1;
  if (!stage || !scale || scale === 1) return boxFrom(box);
  const around = stage.getBoundingClientRect();
  const cx = around.left + around.width / 2;
  const cy = around.top + around.height / 2;
  return {
    left: cx + (box.left - cx) / scale,
    top: cy + (box.top - cy) / scale,
    width: box.width / scale,
    height: box.height / scale,
  };
}

/**
 * Whether a box is wholly on screen. A photo can only fly to somewhere it
 * can be seen to land: stepping along the shelf can leave the open dish's
 * card far down a gallery that has not moved, and the dish leaves with the
 * view instead.
 */
export function isOnScreen(box) {
  return box.top >= 0 && box.top + box.height <= window.innerHeight;
}

/**
 * Flies a copy of the photo `src` from the box `from` to the box `to`.
 * `hide` are the elements the copy stands in for, kept out of sight for as
 * long as it is in the air; `onDone` runs once it has landed and they are
 * back.
 *
 * `to` is a box, or a function that reads one when the flight takes off,
 * for a landing place that is not known until then (a photo that has not
 * loaded has no size to land on). It may answer null. `ready` is a promise
 * the flight waits for first, and gives up on if it resolves false. The copy
 * sits on `from` meanwhile, which is where the photo it stands in for is.
 * A flight that gives up puts everything back and never calls `onDone`.
 *
 * Returns { el, cancel }: the copy, so a flight cut short can be carried on
 * from where it is, and what puts everything back, safe to call at any
 * point. A flight that is handed on to another passes the elements the next
 * one hides as `keep`, so they are not put back for the moment between the
 * two.
 */
export function flyPhoto({ src, from, to, hide, ready, onDone }) {
  const el = document.createElement('img');
  el.className = 'dish-flyer';
  el.alt = '';
  el.setAttribute('aria-hidden', 'true');
  el.src = src;
  const px = (box) => ({
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  });
  Object.assign(el.style, px(from));
  document.body.appendChild(el);

  let animation = null;
  let cancelled = false;
  const show = (nodes) => nodes.forEach((node) => (node.style.visibility = ''));

  const abandon = () => {
    cancelled = true;
    el.remove();
    show(hide);
  };

  const takeOff = () => {
    if (cancelled) return;
    const target = typeof to === 'function' ? to() : to;
    if (!target) return abandon();
    hide.forEach((node) => (node.style.visibility = 'hidden'));
    // --ease, not --ease-out: the photo is an element that is already on
    // screen changing place and size, and --ease-out spends nearly all of
    // its travel in the first third, which leaves the rest of the 380ms
    // as a tail nobody sees.
    animation = el.animate([px(from), px(target)], {
      duration: tokenMs('--dur-enter'),
      easing: token('--ease'),
      fill: 'both',
    });
    animation.onfinish = () => {
      show(hide);
      // And lets go of them once the real ones have been painted underneath.
      requestAnimationFrame(() => {
        if (cancelled) return;
        el.remove();
        onDone?.();
      });
    };
  };

  // The copy takes over from the real photos in the frame it can first be
  // painted in, so there is never one with neither. A photo that is already
  // on the page (every one here, bar a slow network) is in hand at once;
  // anything else waits to be decoded.
  const inHand = el.complete && el.naturalWidth > 0;
  if (inHand && !ready) {
    takeOff();
  } else {
    const decoded = inHand ? Promise.resolve() : (el.decode ? el.decode() : Promise.resolve()).catch(() => {});
    Promise.all([decoded, ready ?? true]).then(([, ok]) => (ok === false ? abandon() : takeOff()));
  }

  return {
    el,
    cancel(keep = []) {
      cancelled = true;
      animation?.cancel();
      el.remove();
      show(hide.filter((node) => !keep.includes(node)));
    },
  };
}
