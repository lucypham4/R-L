import { uploadImage, isCloudinaryConfigured } from './cloudinary';

// A profile picture only ever shows as a small circle, so it's stored
// small: the crop comes out at this size, which covers the largest place
// it appears (the profile page, at 112px) at about 3x.
export const AVATAR_SIZE = 320;

// A guest's picture lives on this device, alongside their Local meals.
// Signed in, it's on the chef's profile instead (chefsApi.js), so it
// follows them to every device; the two are separate, as the meals are.
const LOCAL_KEY = 'staj-avatar-local';

export function loadLocalAvatar() {
  try {
    return localStorage.getItem(LOCAL_KEY);
  } catch {
    return null;
  }
}

export function saveLocalAvatar(url) {
  try {
    if (url) localStorage.setItem(LOCAL_KEY, url);
    else localStorage.removeItem(LOCAL_KEY);
  } catch {
    // Storage blocked or full: the picture lasts until the next reload.
  }
}

function toDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Turns a cropped picture into a URL that will still work tomorrow: an
 * upload when there's somewhere to upload it, and otherwise the picture
 * itself, as a data URL. At AVATAR_SIZE that is a few tens of kilobytes,
 * small enough for local storage or a profile row.
 */
export async function storeAvatar(blob, { upload = isCloudinaryConfigured } = {}) {
  if (upload) {
    const file = new File([blob], 'avatar.jpg', { type: blob.type || 'image/jpeg' });
    const { url } = await uploadImage(file);
    return url;
  }
  return toDataUrl(blob);
}
