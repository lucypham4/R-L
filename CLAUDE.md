## Keep every Figma version

Standing rule from the project owner: in the R-L Figma file (`ZgsKhvvdONcGGTuPmRh4sK`), every earlier version of a design stays. Work additively: add new pages, frames, components, variables and styles next to what is there. To replace something, duplicate it, rename the old one with an `Old / ` prefix or move it to an `Archive` page, and keep it. This covers every page, including leftovers such as the html.to.design variable collections and styles. If a task seems to need a deletion in Figma, ask the owner first.

## Agent skills

### Issue tracker

Issues live as GitHub Issues on `lucypham4/R-L`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` and `docs/adr/` at the repo root (created lazily by `/domain-modeling`). See `docs/agents/domain.md`.
