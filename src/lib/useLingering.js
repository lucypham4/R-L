import { useCallback, useState } from 'react';

// Holds on to a value for a while after it has gone, so what it drew can
// play its exit before it comes off the page. The open dish is the case:
// closing it clears `openMealId` at once, but the dish has to stay mounted
// while its photo flies back to its card.
//
//   shown     the value while there is one, then the last one there was,
//             until `done` is called
//   leaving   true from the moment the value goes until `done`
//   key       counts how many times a value has arrived after having been
//             gone. Set as a React key, it remounts whatever draws the value
//             when a new one turns up mid-exit (a tap on another dish),
//             instead of that being mistaken for a step along the shelf
//   done      called when the exit has played; lets go of the value
export function useLingering(value) {
  const [track, setTrack] = useState({ prev: value, held: value, key: 0 });

  // Derived during render rather than in an effect, so there is never a
  // frame where the value has gone and nothing has taken its place.
  let current = track;
  if (track.prev !== value) {
    current = {
      prev: value,
      held: value ?? track.held,
      key: track.key + (value && !track.prev ? 1 : 0),
    };
    setTrack(current);
  }

  // A value that came back while the exit was playing is not for letting go.
  const done = useCallback(() => setTrack((t) => (t.prev ? t : { ...t, held: null })), []);

  return {
    shown: value ?? current.held,
    leaving: !value && Boolean(current.held),
    key: current.key,
    done,
  };
}
