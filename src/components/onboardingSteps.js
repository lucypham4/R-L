import catCookRiv from '../assets/rive/cat-cook.riv';

// The tour's art registry.
//
// This is the one file to touch when illustrations change: give a step an
// `art` entry and OnboardingArt renders it, leave `art` off and the step
// falls back to the labelled placeholder with the size hint still shown.
//
// Static art goes in as:
//   art: { kind: 'image', src: importedPng, alt: 'A plate of...' }
//
// Rive art goes in as below. `artboard` and `stateMachine` must match the
// names inside the .riv exactly -- if they don't, Rive renders nothing and
// fails silently rather than throwing, which is a confusing way to lose an
// hour.
const CAT_COOK = {
  kind: 'rive',
  src: catCookRiv,
  artboard: 'Artboard 1',
  stateMachine: 'State Machine 1',
  alt: 'A cat cooking at a stove',
};

export function buildSteps(publicUrl) {
  return [
    {
      icon: 'book',
      title: 'Every dish, remembered',
      body: 'Document all your proudest dishes.',
      art: CAT_COOK,
      // The cat is a character on empty ground, not a wide scene, so a
      // 16:9 box bounds it by height and strands it in side whitespace.
      // 4:3 gives it noticeably more presence while still clearing the
      // footer on a short phone (tested at 375x667).
      ratio: '4 / 3',
      artLabel: 'Cover illustration',
      artHint: '16:9 · ≥1600px wide',
    },
    {
      icon: 'camera',
      title: 'Log it your way',
      body: 'Snap a photo, or sketch it instead.',
      ratio: '1 / 1',
      artLabel: 'Add-meal illustration',
      artHint: '1:1 · ≥800px',
    },
    {
      icon: 'grid',
      title: 'Watch it grow',
      body: 'Every meal adds to your archive.',
      ratio: '1 / 1',
      artLabel: 'Growing-archive illustration',
      artHint: '1:1 · ≥800px',
    },
    {
      icon: 'share',
      title: 'Share it when you’re ready',
      body: publicUrl
        ? `Your page is already live at ${publicUrl}.`
        : 'Sign in for a live page and to export a copy any time.',
      ratio: '1 / 1',
      artLabel: 'Share illustration',
      artHint: '1:1 · ≥800px',
    },
  ];
}
