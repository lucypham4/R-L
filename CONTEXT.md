# Meal Diary

A meal-logging app for any chef: browser-local by default, with an optional cloud-backed account for multi-device access and a public page.

## Language

**Chef**:
A registered account holder — a Supabase-backed identity with a display name and a public page at `/<slug>`. Owns a cloud-backed set of meals, isolated from every other Chef's.
_Avoid_: User, account (when the meaning is specifically "a signed-in Chef")

**Local meal**:
A meal entry stored only in one browser's `localStorage`, used before or without a Chef account. Never syncs and is never visible from another device.
_Avoid_: Guest meal, offline meal

**Local Import**:
The one-time, confirm-gated copy of a browser's Local meals into a newly created Chef's cloud account, offered immediately after sign-up while the account is still empty. Successfully imported meals are cleared from Local storage; any that fail are left in place.
_Avoid_: Migration, sync (Local Import is one-directional and one-shot, not an ongoing sync)
