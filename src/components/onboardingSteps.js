// The tour's art registry.
//
// This is the one file to touch when illustrations change: give a step an
// `art` entry and OnboardingArt renders it, leave `art` off and the step
// falls back to the labelled placeholder with the size hint still shown.
//
// Static art goes in as:
//   art: { kind: 'image', src: importedPng, alt: 'A plate of...' }
//
// A 3D scene goes in as:
//   art: { kind: 'scene', scene: 'plate', alt: 'A plate turning slowly' }
//
// `scene` must be one of the names exported from lib/dishScene.js
// (plate, bowl, archive, share). An unknown name falls back to `plate`
// rather than rendering an empty canvas, because a silently blank box is
// a confusing way to lose an hour.
const SCENE_RATIO = '4 / 3';

export function buildSteps(publicUrl) {
  return [
    {
      icon: 'book',
      title: 'Every dish, remembered',
      body: 'Document all your proudest dishes.',
      art: { kind: 'scene', scene: 'plate', alt: 'A plated dish turning slowly' },
      // The scenes are objects on empty ground rather than wide vistas, so
      // a 16:9 box bounds them by height and strands them in side
      // whitespace. 4:3 gives them noticeably more presence while still
      // clearing the footer on a short phone (tested at 375x667).
      ratio: SCENE_RATIO,
      artLabel: 'Cover illustration',
    },
    {
      icon: 'camera',
      title: 'Log it your way',
      body: 'Snap a photo, or sketch it instead.',
      art: { kind: 'scene', scene: 'bowl', alt: 'A bowl of food seen from above' },
      ratio: SCENE_RATIO,
      artLabel: 'Add-meal illustration',
    },
    {
      icon: 'grid',
      title: 'Watch it grow',
      body: 'Every meal adds to your archive.',
      art: { kind: 'scene', scene: 'archive', alt: 'Several plates orbiting slowly' },
      ratio: SCENE_RATIO,
      artLabel: 'Growing-archive illustration',
    },
    {
      icon: 'share',
      title: 'Share it when you’re ready',
      body: publicUrl
        ? `Your page is already live at ${publicUrl}.`
        : 'Sign in for a live page and to export a copy any time.',
      art: { kind: 'scene', scene: 'share', alt: 'A plate lifting away from a stack' },
      ratio: SCENE_RATIO,
      artLabel: 'Share illustration',
    },
  ];
}
