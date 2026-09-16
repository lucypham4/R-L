/**
 * Builds a single, dependency-free HTML file that renders a read-only
 * portfolio gallery from a snapshot of meals. No React, no build step,
 * no backend calls at view time. Meant to be uploaded as-is to any static
 * host (Vercel, Netlify, GitHub Pages, S3...).
 */
export function generateStaticSiteHtml(meals, { siteTitle = 'Meal Diary' } = {}) {
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
    tags: m.tags || [],
    photoUrl: m.photoUrl || null,
  }));

  // Escape `</script>` so the embedded JSON can't break out of its tag.
  const dataJson = JSON.stringify(safeMeals).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
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
  <main class="gallery-grid" id="grid"></main>
  <div id="modal-root"></div>

  <script type="application/json" id="meals-data">${dataJson}</script>
  <script>${SITE_JS}</script>
</body>
</html>
`;
}

export function downloadStaticSite(html, filename = 'meal-diary-portfolio.html') {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

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
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #141311;
    --color-surface: #211f1c;
    --color-line: #33312b;
    --color-ink: #f3f1eb;
    --color-muted: #a6a198;
    --color-disabled: #5a564e;
    --color-accent: #f26d62;
  }
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
  background: none;
  border: none;
  padding: 0;
  font-family: inherit;
  color: inherit;
  cursor: pointer;
}
.meal-card-image {
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
  position: fixed; inset: 0;
  background: rgba(20, 19, 17, 0.55);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  z-index: 10;
}
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
  background: none; border: none; font-size: 1.5rem; line-height: 1; cursor: pointer; color: var(--color-ink);
}
.modal-photo { width: 100%; aspect-ratio: 1/1; object-fit: cover; margin-bottom: 20px; }
.modal-name { font: 400 1.75rem/1.2 var(--font-serif); margin: 0 0 4px; }
.modal-sub { color: var(--color-muted); margin: 0 0 20px; }
.modal-method { padding-left: 0; list-style: none; margin: 0 0 16px; }
.modal-method li { display: flex; gap: 8px; margin-bottom: 8px; }
.modal-note { font-style: italic; color: var(--color-accent); }
.hidden { display: none; }
`;

const SITE_JS = `
const meals = JSON.parse(document.getElementById('meals-data').textContent);
const grid = document.getElementById('grid');
const modalRoot = document.getElementById('modal-root');
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

meals.forEach((meal) => {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'meal-card';

  const imageWrap = document.createElement('span');
  imageWrap.className = 'meal-card-image';
  if (meal.photoUrl) {
    const img = document.createElement('img');
    img.src = meal.photoUrl;
    img.alt = meal.name + ', ' + meal.cuisine + ' ' + meal.category;
    imageWrap.appendChild(img);
  }
  card.appendChild(imageWrap);

  const name = document.createElement('span');
  name.className = 'meal-card-name';
  name.textContent = meal.name;
  card.appendChild(name);

  const meta = document.createElement('span');
  meta.className = 'meal-card-meta';
  meta.textContent = meal.cuisine + ' \\u00b7 ' + meal.category;
  card.appendChild(meta);

  const date = document.createElement('span');
  date.className = 'meal-card-date';
  date.textContent = dateFmt.format(new Date(meal.date));
  card.appendChild(date);

  card.addEventListener('click', () => openModal(meal));
  grid.appendChild(card);
});

function openModal(meal) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeModal(); });

  const card = document.createElement('div');
  card.className = 'modal-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'modal-close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '\\u00d7';
  close.addEventListener('click', closeModal);
  card.appendChild(close);

  if (meal.photoUrl) {
    const img = document.createElement('img');
    img.src = meal.photoUrl;
    img.className = 'modal-photo';
    img.alt = meal.name;
    card.appendChild(img);
  }

  const name = document.createElement('h2');
  name.className = 'modal-name';
  name.textContent = meal.name;
  card.appendChild(name);

  const sub = document.createElement('p');
  sub.className = 'modal-sub';
  sub.textContent = meal.cuisine + ' \\u00b7 ' + dateFmt.format(new Date(meal.date)) + ' \\u00b7 Serves ' + meal.serves;
  card.appendChild(sub);

  if (meal.method && meal.method.length) {
    const ol = document.createElement('ol');
    ol.className = 'modal-method';
    meal.method.forEach((step) => {
      const li = document.createElement('li');
      li.textContent = step;
      ol.appendChild(li);
    });
    card.appendChild(ol);
  } else if (meal.description) {
    const p = document.createElement('p');
    p.textContent = meal.description;
    card.appendChild(p);
  }

  if (meal.note) {
    const note = document.createElement('p');
    note.className = 'modal-note';
    note.textContent = meal.note;
    card.appendChild(note);
  }

  overlay.appendChild(card);
  modalRoot.appendChild(overlay);
  close.focus();

  function onKeyDown(e) { if (e.key === 'Escape') closeModal(); }
  document.addEventListener('keydown', onKeyDown);

  function closeModal() {
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
  }
}
`;
