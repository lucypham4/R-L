const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export const isCloudinaryConfigured = Boolean(cloudName && uploadPreset);

/**
 * Uploads a file to Cloudinary using an unsigned upload preset.
 * Unsigned uploads are the safe pattern for client-only apps: the API secret
 * never reaches the browser, and the preset (configured in the Cloudinary
 * dashboard) can restrict folder, formats, and max size server-side.
 */
export async function uploadImage(file, { onProgress } = {}) {
  if (!isCloudinaryConfigured) {
    throw new Error('Cloudinary is not configured. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.');
  }

  const formData = new FormData();
  formData.append('file', file, file.name || 'sketch.png');
  formData.append('upload_preset', uploadPreset);

  const result = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded / event.total);
      }
    };

    xhr.onload = () => {
      let body;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && body) {
        resolve(body);
      } else {
        reject(new Error(body?.error?.message || `Cloudinary upload failed (${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error('Cloudinary upload failed — network error'));
    xhr.send(formData);
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
  };
}
