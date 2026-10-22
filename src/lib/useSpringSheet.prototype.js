// PROTOTYPE (?variant=apple). See variant.prototype.js.
//
// A bottom sheet the apple-design skill's way. Today the filter sheet rises
// and drops on keyframes, can't be dragged, and takes no taps while it
// leaves; the action sheet rises and then vanishes. Here a sheet:
//
// - rises and leaves on a spring, along the same path both ways;
// - follows a finger 1:1 when its top (the grabber and header) is dragged,
//   resisting above its resting place instead of stopping dead;
// - on release, projects the finger's speed forward and goes where that
//   lands, carrying the speed into the spring, so a flick throws it off and
//   a slow drag past half-way still settles back if it was let go gently;
// - can be caught at any moment, opening or closing, and dragged from
//   wherever it is.
//
// The scrim follows the sheet: half-way down, half as dark.

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { appleMotion } from './variant.prototype';
import { project, rubberband, springTo, velocityOf } from './spring.prototype';

// Movement before a press on the sheet's top counts as a drag, not a tap.
const SLOP = 6;

export function useSpringSheet(onClose) {
  // Decided once, for the sheet's life, so a variant switched under an open
  // sheet doesn't change how it leaves.
  const [active] = useState(appleMotion);
  const overlayRef = useRef(null);
  const sheetRef = useRef(null);
  const spring = useRef(null);
  const y = useRef(0);
  const closing = useRef(false);
  const drag = useRef(null);
  const dragged = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const height = () => Math.max(1, sheetRef.current?.offsetHeight ?? 1);

  const apply = (value) => {
    y.current = value;
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${value}px)`;
    const scrim = Math.max(0, Math.min(1, 1 - value / height()));
    overlayRef.current?.style.setProperty('--sheet-scrim', String(scrim));
  };

  const run = (to, { velocity = 0, damping = 1, response = 0.35, onDone } = {}) => {
    spring.current?.stop();
    spring.current = springTo({ from: y.current, to, velocity, damping, response, onUpdate: apply, onDone });
    spring.current.onDone = onDone;
  };

  const leave = (velocity) => {
    closing.current = true;
    run(height(), { velocity, response: 0.3, onDone: () => onCloseRef.current() });
  };

  useLayoutEffect(() => {
    if (!active) return undefined;
    apply(height());
    run(0);
    return () => spring.current?.stop();
  }, [active]);

  // Every way out that isn't a drag: the close button, Cancel, the
  // backdrop, Escape. From wherever the sheet is, at whatever speed it had.
  const requestClose = useCallback(() => {
    if (closing.current) return;
    leave(spring.current?.running ? spring.current.velocity : 0);
  }, []);

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Catch it where it is. If this turns out to be a tap, whatever was
    // under way carries on (onPointerUp).
    const live = spring.current?.running ? spring.current : null;
    spring.current?.stop();
    dragged.current = false;
    drag.current = {
      id: e.pointerId,
      y0: e.clientY,
      from: y.current,
      pending: true,
      interrupted: live && { to: live.to, onDone: live.onDone },
      samples: [{ v: e.clientY, t: e.timeStamp }],
    };
  }

  function onPointerMove(e) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dy = e.clientY - d.y0;
    if (d.pending) {
      if (Math.abs(dy) < SLOP) return;
      d.pending = false;
      dragged.current = true;
      // A sheet grabbed on its way out stays.
      closing.current = false;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // The pointer is already gone; the move still applies.
      }
    }
    d.samples.push({ v: e.clientY, t: e.timeStamp });
    if (d.samples.length > 12) d.samples.shift();
    const raw = d.from + dy;
    apply(raw < 0 ? -rubberband(-raw, height()) : raw);
  }

  function release(e, { cancelled = false } = {}) {
    const d = drag.current;
    drag.current = null;
    if (!d || e.pointerId !== d.id) return;
    if (d.pending) {
      if (d.interrupted) run(d.interrupted.to, { onDone: d.interrupted.onDone });
      return;
    }
    const velocity = cancelled ? 0 : velocityOf(d.samples, e.timeStamp);
    if (y.current + project(velocity) > height() / 2) leave(velocity);
    // Bounce only when the release carried momentum.
    else run(0, { velocity, damping: Math.abs(velocity) > 300 ? 0.8 : 1, response: 0.3 });
  }

  // A press that turned into a drag doesn't also press the button it
  // started on.
  function onClickCapture(e) {
    if (!dragged.current) return;
    dragged.current = false;
    e.stopPropagation();
    e.preventDefault();
  }

  if (!active) return { active, requestClose: null, overlayProps: {}, sheetRef: undefined, zoneProps: {} };

  return {
    active,
    requestClose,
    overlayProps: { ref: overlayRef, 'data-spring': '' },
    sheetRef,
    zoneProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e) => release(e),
      onPointerCancel: (e) => release(e, { cancelled: true }),
      onClickCapture,
    },
  };
}
