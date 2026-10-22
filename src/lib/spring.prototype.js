// PROTOTYPE (?variant=apple). See variant.prototype.js.
//
// The apple-design skill's motion primitives: a spring described the way
// Apple describes one, by damping ratio and response rather than mass,
// stiffness and damping; the momentum projection Apple ships in its
// Designing Fluid Interfaces sample code; and release velocity in px/s.

/**
 * Runs a spring from `from` to `to`, starting at `velocity` (px/s), and
 * calls `onUpdate(value)` once a frame until it settles.
 *
 *   damping   1 settles without overshoot; below 1 overshoots. Bounce is
 *             for a release that carried momentum, not for a tap.
 *   response  roughly how long it takes to get there, in seconds. Not a
 *             duration: a spring has none, it settles when it settles.
 *
 * Returns a handle whose `value` and `velocity` are live, so whatever
 * interrupts it can carry on from where it is and how fast it was going.
 */
export function springTo({ from, to, velocity = 0, damping = 1, response = 0.35, onUpdate, onDone }) {
  const stiffness = ((2 * Math.PI) / response) ** 2;
  const friction = (4 * Math.PI * damping) / response;
  let x = from;
  let v = velocity;
  let last = null;
  let raf = 0;
  let stopped = false;

  function frame(t) {
    if (stopped) return;
    if (last === null) last = t;
    let dt = Math.min(0.064, (t - last) / 1000);
    last = t;
    // Fixed substeps keep a stiff spring stable on a slow frame.
    while (dt > 0) {
      const h = Math.min(dt, 1 / 240);
      v += (-stiffness * (x - to) - friction * v) * h;
      x += v * h;
      dt -= h;
    }
    if (Math.abs(x - to) < 0.5 && Math.abs(v) < 8) {
      x = to;
      v = 0;
      onUpdate(x);
      handle.running = false;
      onDone?.();
      return;
    }
    onUpdate(x);
    raf = requestAnimationFrame(frame);
  }

  const handle = {
    running: true,
    to,
    get value() {
      return x;
    },
    get velocity() {
      return v;
    },
    stop() {
      stopped = true;
      handle.running = false;
      cancelAnimationFrame(raf);
    },
  };
  onUpdate(x);
  raf = requestAnimationFrame(frame);
  return handle;
}

/**
 * How far a release at `velocity` (px/s) would carry on if left to
 * decelerate, as scrolling does. 0.998 is UIScrollView's normal rate.
 */
export function project(velocity, rate = 0.998) {
  return ((velocity / 1000) * rate) / (1 - rate);
}

/**
 * Velocity at release in px/s along one axis, from the last 100ms of
 * `samples` ({ v, t }). A finger that had stopped before lifting was
 * placed, not thrown.
 */
export function velocityOf(samples, releasedAt) {
  const last = samples[samples.length - 1];
  if (!last || releasedAt - last.t > 80) return 0;
  const first = samples.find((s) => last.t - s.t <= 100) ?? last;
  const dt = last.t - first.t;
  return dt > 0 ? ((last.v - first.v) / dt) * 1000 : 0;
}

/** Apple's rubber band: the further past the edge, the less it follows. */
export function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
