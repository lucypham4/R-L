## Agent skills

### Issue tracker

Issues live as GitHub Issues on `lucypham4/R-L`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` and `docs/adr/` at the repo root (created lazily by `/domain-modeling`). See `docs/agents/domain.md`.

## Design sources

`docs/design-system/` and the components already in `src/components/` are the source of truth for UI. Build new UI from them; when a screen has no design, reuse the nearest existing pattern (a bottom sheet is `MealActionSheet`'s).

- Figma design file `ZgsKhvvdONcGGTuPmRh4sK` (inspiration, not the current design): https://www.figma.com/design/ZgsKhvvdONcGGTuPmRh4sK/R-L. One page, Discover: mood boards, reference screenshots, early nav and onboarding studies, drafts. Read a node when the user points at one. Where it disagrees with `docs/design-system/` (its nav notes call for square corners everywhere else), the docs win.
- FigJam board `oKsh7bF6Lsgd2TsR00gZBD` (an old to-do kanban, from before the rename to Staj): https://www.figma.com/board/oKsh7bF6Lsgd2TsR00gZBD/Staj-Planning. GitHub Issues are the live backlog.
