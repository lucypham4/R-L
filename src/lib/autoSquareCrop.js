// Some older photos (background-removed PNGs uploaded before the in-app
// square crop existed) have a lot of transparent padding baked into their
// own canvas, so `object-fit: cover` alone still leaves visible space
// around the dish in a 1:1 gallery thumbnail. This finds the tight
// bounding box of the actual (non-transparent) content and crops a
// centered square around it, so the gallery genuinely fills edge to edge.
// Photos with no alpha channel (every JPEG, including everything the
// current crop wizard outputs) are left untouched.

const ALPHA_THRESHOLD = 10;
const cache = new Map();

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

export function getSquareCropUrl(src) {
  if (!src) return Promise.resolve(src);
  if (cache.has(src)) return cache.get(src);

  const promise = resolveSquareCrop(src).catch(() => src);
  cache.set(src, promise);
  return promise;
}

async function resolveSquareCrop(src) {
  const img = await loadImage(src);
  const width = img.naturalWidth;
  const height = img.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const { data } = ctx.getImageData(0, 0, width, height);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let hasTransparency = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha <= ALPHA_THRESHOLD) {
        hasTransparency = true;
        continue;
      }
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  // Opaque image (no alpha channel, or nothing transparent found): nothing
  // to trim, use it as-is.
  if (!hasTransparency || maxX < 0) return src;

  const contentW = maxX - minX + 1;
  const contentH = maxY - minY + 1;

  // Content already fills the canvas: cover already handles this fine.
  if (contentW >= width * 0.95 && contentH >= height * 0.95) return src;

  const side = Math.max(contentW, contentH);
  const cx = minX + contentW / 2;
  const cy = minY + contentH / 2;
  const sx = Math.max(0, Math.min(Math.round(cx - side / 2), width - side));
  const sy = Math.max(0, Math.min(Math.round(cy - side / 2), height - side));
  const clampedSide = Math.min(side, width - sx, height - sy);

  const out = document.createElement('canvas');
  out.width = clampedSide;
  out.height = clampedSide;
  out.getContext('2d').drawImage(canvas, sx, sy, clampedSide, clampedSide, 0, 0, clampedSide, clampedSide);

  return out.toDataURL('image/png');
}
