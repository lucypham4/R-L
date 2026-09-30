## Keep every old version

Standing rule from the project owner: every earlier version of anything in this project stays recoverable. Change things additively: put the new version beside the old one, or supersede it, and keep the old one. If a task seems to need a deletion, ask the owner first.

- **Git.** History only grows: new commits (undo with `git revert`), plain pushes, never `--force`. Keep branches and tags, merged ones included. Merge PRs with a merge commit (`merge_method: "merge"`), so the branch's own commits stay in `main`. Editing or removing a file in a commit is fine; git holds the old version.
- **Figma** (the R-L file). Add pages, frames, components, variables and styles next to what is there. To replace one, duplicate it, rename the old one with an `Old / ` prefix or move it to an `Archive` page, and keep it. This includes leftovers such as the html.to.design variable collections and styles.
- **Supabase.** Schema changes go in new migration files that add; applied migrations stay as they are. Data rows, columns and tables stay. Before redeploying an Edge Function whose live code differs from git, save the live copy with `supabase functions download` and commit it.
- **Artifacts and other published things.** Update in place so the history is kept; keep the old ones.

## Agent skills

### Issue tracker

Issues live as GitHub Issues on `lucypham4/R-L`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` and `docs/adr/` at the repo root (created lazily by `/domain-modeling`). See `docs/agents/domain.md`.
