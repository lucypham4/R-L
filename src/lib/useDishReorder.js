import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { moveId } from './dishOrder';
import { token, tokenMs } from './motion';

// Rearranging the home screen by hand. A chef holds a dish (MealCard's long
// press, which also opens its action sheet) and, without lifting, moves it:
// the sheet gives way, the dish lifts off the grid and follows the finger,
// and the dishes it passes over make room for it. Letting go leaves it
// there, and the gallery switches to the custom order to keep it.
//
// Held and let go without moving, nothing is dragged and the sheet stays,
// as before. The same order as the home screen at iOS: hold for the menu,
// move to drag.

// How far a held dish has to travel before it's being dragged rather than
// just held. A finger held still still wanders a little.
export const DRAG_SLOP = 8;

// Within this far of the top or bottom of the screen, a dragged dish
// scrolls the page, faster the closer it gets, so it can go anywhere in a
// long archive.
const EDGE = 72;
const MAX_SCROLL_STEP = 16;

/**
 * `ids` are the dishes on screen, in order. `onDragStart` runs as the held
 * dish starts to move; `onDrop(order, id)` gets the ids on screen after
 * the dish `id` was let go, if that changed anything.
 *
 * Returns `bindGrid`, a ref for the grid whose children are the dishes
 * (each with `data-dish-id`); `arm(id, point)`, for the long press to call
 * with where the pointer was held; and, while a dish is moving or
 * settling, its `draggingId` and the `order` to show the dishes in.
 */
export function useDishReorder({ ids, enabled, onDragStart, onDrop }) {
  const gridRef = useRef(null);
  const [grid, setGrid] = useState(null);
  const drag = useRef(null);
  const [state, setState] = useState(null);
  const latest = useRef({});
  latest.current = { ids, onDragStart, onDrop };

  const bindGrid = useCallback((el) => {
    gridRef.current = el;
    setGrid(el);
  }, []);

  // Each dish's place on the grid, in viewport coordinates. Its layout
  // place, not where it's drawn: offsetLeft/Top leave out the transforms
  // that move the dragged dish and slide the others to their new places,
  // so which dish the pointer is over doesn't flicker while they move.
  // The grid is the dishes' offsetParent (Gallery.css).
  const slots = useCallback(() => {
    const el = gridRef.current;
    if (!el) return [];
    const g = el.getBoundingClientRect();
    return Array.from(el.children, (child) => ({
      el: child,
      id: child.dataset.dishId,
      left: g.left + child.offsetLeft,
      top: g.top + child.offsetTop,
      width: child.offsetWidth,
      height: child.offsetHeight,
    }));
  }, []);

  // Draws the dragged dish under the pointer and, if the pointer is over
  // another dish, moves the dragged one into its place.
  const place = useCallback(() => {
    const d = drag.current;
    if (!d?.active) return;
    const all = slots();
    const own = all.find((s) => s.id === d.id);
    if (!own) return;
    own.el.style.transform = `translate(${d.x - d.grabX - own.left}px, ${d.y - d.grabY - own.top}px)`;
    const over = all.find(
      (s) => s.id !== d.id && d.x >= s.left && d.x < s.left + s.width && d.y >= s.top && d.y < s.top + s.height
    );
    if (!over) return;
    // Where the others are drawn now, so each slides on from there, even
    // if it was still on its way somewhere from the last move.
    d.before = new Map(all.filter((s) => s.id !== d.id).map((s) => [s.id, s.el.getBoundingClientRect()]));
    d.order = moveId(d.order, d.id, d.order.indexOf(over.id));
    setState({ id: d.id, order: d.order });
  }, [slots]);

  // After a move has re-rendered the grid: the dishes that were pushed
  // along slide from where they were to their new places, and the dragged
  // one is redrawn under the pointer from its new place.
  useLayoutEffect(() => {
    const d = drag.current;
    if (!d?.before) return;
    const before = d.before;
    d.before = null;
    const duration = tokenMs('--dur-move');
    if (duration) {
      const easing = token('--ease');
      for (const s of slots()) {
        const was = before.get(s.id);
        if (!was) continue;
        const dx = was.left - s.left;
        const dy = was.top - s.top;
        if (dx || dy) {
          s.el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration, easing });
        }
      }
    }
    place();
  }, [state?.order, slots, place]);

  const arm = useCallback(
    (id, point) => {
      if (!enabled) return;
      drag.current = { id: String(id), pointerId: point.pointerId, x0: point.x, y0: point.y, x: point.x, y: point.y, active: false };
    },
    [enabled]
  );

  useEffect(() => {
    if (!enabled) return;

    function scrollStep() {
      const d = drag.current;
      if (!d?.active) return;
      const h = window.innerHeight;
      let step = 0;
      if (d.y < EDGE) step = -MAX_SCROLL_STEP * Math.min(1, (EDGE - d.y) / EDGE);
      else if (d.y > h - EDGE) step = MAX_SCROLL_STEP * Math.min(1, (d.y - (h - EDGE)) / EDGE);
      if (step) window.scrollBy(0, step);
      d.frame = requestAnimationFrame(scrollStep);
    }

    function start(d) {
      const own = slots().find((s) => s.id === d.id);
      if (!own) {
        drag.current = null;
        return;
      }
      d.active = true;
      d.grabX = d.x0 - own.left;
      d.grabY = d.y0 - own.top;
      d.from = latest.current.ids.map(String);
      d.order = d.from;
      setState({ id: d.id, order: d.order });
      latest.current.onDragStart?.();
      d.frame = requestAnimationFrame(scrollStep);
    }

    function onMove(e) {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      d.x = e.clientX;
      d.y = e.clientY;
      if (!d.active) {
        if (Math.hypot(d.x - d.x0, d.y - d.y0) < DRAG_SLOP) return;
        start(d);
        if (!d.active) return;
      }
      place();
    }

    // Let go (or the system took the pointer away): the dish stays where
    // it is and settles into its place.
    function onUp(e) {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      drag.current = null;
      if (!d.active) return;
      cancelAnimationFrame(d.frame);
      const el = gridRef.current?.querySelector(`[data-dish-id="${CSS.escape(d.id)}"]`);
      const from = el?.style.transform;
      if (el) el.style.transform = '';
      setState({ id: d.id, order: null });
      if (d.order.some((id, i) => id !== d.from[i])) latest.current.onDrop(d.order, d.id);
      const duration = tokenMs('--dur-move');
      if (!el || !from || !duration) {
        setState(null);
        return;
      }
      el.animate([{ transform: from }, { transform: 'none' }], { duration, easing: token('--ease-out') })
        .finished.catch(() => {})
        .then(() => setState((s) => (s?.id === d.id && !s.order ? null : s)));
    }

    function onScroll() {
      place();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('scroll', onScroll);
      if (drag.current) cancelAnimationFrame(drag.current.frame);
      drag.current = null;
    };
  }, [enabled, slots, place]);

  // Once a dish is held, a finger moving on the grid drags it instead of
  // scrolling the page. Listened for on the grid from the start, and not
  // passively, so the browser knows before the finger lands that it may
  // have to hold the scroll back: added mid-gesture, it can be too late to.
  useEffect(() => {
    if (!enabled || !grid) return;
    function onTouchMove(e) {
      if (drag.current && e.cancelable) e.preventDefault();
    }
    grid.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => grid.removeEventListener('touchmove', onTouchMove);
  }, [enabled, grid]);

  return { bindGrid, arm, draggingId: state?.id ?? null, order: state?.order ?? null };
}
