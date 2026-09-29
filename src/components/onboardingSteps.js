// The tour's art registry.
//
// This is the one file to touch when illustrations change: give a step an
// `art` entry and OnboardingArt renders it, leave `art` off and the step
// falls back to the labelled placeholder with the size hint still shown.
//
// Static art goes in as:
//   art: { kind: 'image', src: importedPng, alt: 'A plate of...' }
//
// An animated dish scene goes in as:
//   art: { kind: 'scene', scene: 'dessert', alt: 'A dessert, breathing' }
//
// `scene` must be one of the keys of SCENES in SceneArt.jsx (dessert,
// soup, archive, zucchini). An unknown name falls back to `dessert`
// rather than rendering an empty box, because a silently blank slot is a
// confusing way to lose an hour.
const SCENE_RATIO = '4 / 3';

export function buildSteps(publicUrl) {
  return [
    {
      icon: 'book',
      title: 'Every dish, remembered',
      body: 'Document all your proudest dishes.',
      art: { kind: 'scene', scene: 'dessert', alt: 'Vanilla ice cream with chocolate garnish, blackberries and raspberries' },
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
      art: { kind: 'scene', scene: 'soup', alt: 'A squash soup being assembled: soup, toast, scallion oil, chives and almonds' },
      ratio: SCENE_RATIO,
      artLabel: 'Add-meal illustration',
    },
    {
      icon: 'grid',
      title: 'Watch it grow',
      body: 'Every meal adds to your archive.',
      art: { kind: 'scene', scene: 'archive', alt: 'A grid of dishes filling up, one slot at a time' },
      ratio: SCENE_RATIO,
      artLabel: 'Growing-archive illustration',
    },
    {
      icon: 'share',
      title: 'Share it when you’re ready',
      body: publicUrl
        ? `Your page is already live at ${publicUrl}.`
        : 'Sign in for a live page and to export a copy any time.',
      art: { kind: 'scene', scene: 'zucchini', alt: 'A bowl of zucchini ribbons with ricotta and almonds, lifting' },
      ratio: SCENE_RATIO,
      artLabel: 'Share illustration',
    },
  ];
}
