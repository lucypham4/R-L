/**
 * Builds a single, dependency-free HTML file that renders a read-only
 * portfolio gallery from a snapshot of meals. No React, no build step,
 * no backend calls, and — deliberately — no JavaScript at view time: the
 * gallery and every recipe are baked into plain markup, and the "modal"
 * detail view is a pure CSS :target overlay. That's what makes it survive
 * places that render HTML/CSS but never run scripts, like iOS's Quick
 * Look document preview (what actually opens when a downloaded .html file
 * is tapped on an iPhone) — a script-driven version renders nothing there.
 * Meant to be uploaded as-is to any static host too (Vercel, Netlify,
 * GitHub Pages, S3...), where it works the same way.
 */
export function generateStaticSiteHtml(meals, { siteTitle = 'Meal Diary', theme = 'light' } = {}) {
  const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const safeTheme = theme === 'dark' ? 'dark' : 'light';

  const safeMeals = meals.map((m) => ({
    id: m.id,
    name: m.name,
    cuisine: m.cuisine,
    category: m.category,
    date: m.date,
    serves: m.serves,
    description: m.description,
    ingredients: m.ingredients || [],
    method: m.method || [],
    note: m.note || '',
    photoUrl: m.photos?.[0] || null,
  }));

  const cardsHtml = safeMeals.map((meal) => mealCardHtml(meal, dateFmt)).join('\n');
  const modalsHtml = safeMeals.map((meal) => mealModalHtml(meal, dateFmt)).join('\n');

  return `<!doctype html>
<html lang="en" data-theme="${safeTheme}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(siteTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Tinos:ital@0;1&family=Instrument+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
<style>
${SITE_CSS}
</style>
</head>
<body>
  <header class="site-header">
    <h1>${escapeHtml(siteTitle)}</h1>
    <p class="site-tagline">A running portfolio of home-cooked plates.</p>
  </header>
  <main class="gallery-grid">
${cardsHtml}
  </main>
${modalsHtml}
</body>
</html>
`;
}

function mealCardHtml(meal, dateFmt) {
  const alt = escapeHtml(`${meal.name}, ${meal.cuisine} ${meal.category}`);
  const image = meal.photoUrl
    ? `<img src="${escapeAttr(meal.photoUrl)}" alt="${alt}" loading="lazy" />`
    : '';
  return `    <a href="#meal-${escapeAttr(meal.id)}" class="meal-card">
      <span class="meal-card-image">${image}</span>
      <span class="meal-card-name">${escapeHtml(meal.name)}</span>
      <span class="meal-card-meta">${escapeHtml(meal.cuisine)} · ${escapeHtml(meal.category)}</span>
      <span class="meal-card-date">${escapeHtml(dateFmt.format(new Date(meal.date)))}</span>
    </a>`;
}

function mealModalHtml(meal, dateFmt) {
  const photo = meal.photoUrl
    ? `<img src="${escapeAttr(meal.photoUrl)}" class="modal-photo" alt="${escapeAttr(meal.name)}" />`
    : '';

  const subParts = [meal.cuisine, dateFmt.format(new Date(meal.date))];
  if (meal.serves) subParts.push(`Serves ${meal.serves}`);
  const sub = subParts.map(escapeHtml).join(' · ');

  const description = meal.description ? `<p class="modal-description">${escapeHtml(meal.description)}</p>` : '';

  const ingredients = meal.ingredients.length
    ? `<div class="bubble-row">${meal.ingredients.map((ing) => `<span class="bubble">${escapeHtml(ing)}</span>`).join('')}</div>`
    : '';

  const method = meal.method.length
    ? `<ol class="modal-method">${meal.method.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>`
    : '';

  const note = meal.note ? `<p class="modal-note">${escapeHtml(meal.note)}</p>` : '';

  return `  <div class="modal-overlay" id="meal-${escapeAttr(meal.id)}">
    <div class="modal-card" role="dialog" aria-label="${escapeAttr(meal.name)}">
      <a href="#_" class="modal-close" aria-label="Close">×</a>
      ${photo}
      <h2 class="modal-name">${escapeHtml(meal.name)}</h2>
      ${description}
      <p class="modal-sub">${sub}</p>
      ${ingredients}
      ${method}
      ${note}
    </div>
  </div>`;
}

export function downloadStaticSite(html, filename = 'meal-diary-portfolio.html') {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  // No target="_blank" and no popup: blob: URLs are scoped to the
  // document that created them, and opening one in a separate browsing
  // context (a new tab/window) is exactly what has repeatedly loaded
  // blank on iOS Safari. Staying in the current tab is what actually
  // works there — if Safari doesn't honour `download`, it just navigates
  // to and renders the blob in place, which is fine now that the page is
  // fully static and needs no script to show its content.
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Same escaping is safe inside a "..." attribute value too.
const escapeAttr = escapeHtml;

const SITE_CSS = `
:root {
  --color-bg: #faf9f6;
  --color-surface: #f1eee7;
  --color-line: #e4e0d7;
  --color-ink: #1f1e1c;
  --color-muted: #6e6a63;
  --color-disabled: #b0aba2;
  --color-accent: #bb2027;
  --font-serif: 'Tinos', Georgia, serif;
  --font-sans: 'Instrument Sans', system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;
}
:root[data-theme="dark"] {
  --color-bg: #141311;
  --color-surface: #211f1c;
  --color-line: #33312b;
  --color-ink: #f3f1eb;
  --color-muted: #a6a198;
  --color-disabled: #5a564e;
  --color-accent: #f26d62;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-ink);
  font: 400 1rem/1.65 var(--font-sans);
}
.site-header {
  max-width: 1440px;
  margin: 0 auto;
  padding: 48px 20px 32px;
  border-bottom: 1px solid var(--color-line);
}
.site-header h1 {
  margin: 0;
  font: 400 2.125rem/1.1 var(--font-serif);
  letter-spacing: -0.02em;
}
.site-tagline {
  margin: 6px 0 0;
  color: var(--color-muted);
}
.gallery-grid {
  max-width: 1440px;
  margin: 0 auto;
  padding: 32px 20px 80px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
@media (min-width: 768px) {
  .gallery-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; padding-left: 40px; padding-right: 40px; }
}
@media (min-width: 1200px) {
  .gallery-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 24px; }
}
.meal-card {
  display: flex;
  flex-direction: column;
  text-align: left;
  gap: 3px;
  width: 100%;
  text-decoration: none;
  color: inherit;
}
.meal-card-image {
  display: block;
  aspect-ratio: 1 / 1;
  width: 100%;
  overflow: hidden;
  background: var(--color-surface);
}
.meal-card-image img { width: 100%; height: 100%; object-fit: cover; display: block; }
.meal-card-name { margin-top: 8px; font-size: 0.9375rem; }
.meal-card-meta { color: var(--color-muted); font-size: 0.8125rem; }
.meal-card-date { margin-top: 3px; font: 400 0.6875rem/1.5 var(--font-mono); color: var(--color-disabled); }
.modal-overlay {
  display: none;
  position: fixed; inset: 0;
  background: rgba(20, 19, 17, 0.55);
  align-items: center; justify-content: center;
  padding: 20px;
  z-index: 10;
}
.modal-overlay:target { display: flex; }
.modal-card {
  background: var(--color-bg);
  max-width: 640px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  padding: 32px;
  position: relative;
  border: 1px solid var(--color-line);
}
.modal-close {
  position: absolute; top: 16px; right: 16px;
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  background: var(--color-bg); border: 1px solid var(--color-line);
  font-size: 1.25rem; line-height: 1; text-decoration: none; color: var(--color-ink);
}
.modal-photo { width: 100%; aspect-ratio: 1/1; object-fit: cover; margin-bottom: 20px; }
.modal-name { font: 400 1.75rem/1.2 var(--font-serif); margin: 0 0 4px; }
.modal-description { margin: 0 0 12px; }
.modal-sub { color: var(--color-muted); margin: 0 0 20px; }
.bubble-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 20px; }
.bubble {
  display: inline-flex; align-items: center;
  padding: 6px 14px;
  border: 1px solid var(--color-line);
  border-radius: 999px;
  font-size: 0.8125rem;
}
.modal-method { padding-left: 0; list-style: none; margin: 0 0 16px; }
.modal-method li { display: flex; gap: 8px; margin-bottom: 8px; }
.modal-method li::before { content: counter(list-item) '.'; counter-increment: list-item; flex-shrink: 0; color: var(--color-muted); }
.modal-method { counter-reset: list-item; }
.modal-note { font-style: italic; color: var(--color-accent); }
`;
