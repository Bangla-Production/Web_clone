/**
 * Compresses an image File to a base64 Data URL using an offscreen canvas.
 * This guarantees fast client-side storage directly into Firestore docs
 * without needing dedicated storage bucket rules or external CDN setup.
 *
 * @param {File} file - The uploaded image file
 * @param {number} maxWidth - Maximum width (default 300px)
 * @param {number} maxHeight - Maximum height (default 300px)
 * @param {number} quality - JPEG compression quality 0.1 to 1.0 (default 0.8)
 * @returns {Promise<string>} Base64 data URL string
 */
export function compressImageToBase64(file, maxWidth = 300, maxHeight = 300, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve('');
      return;
    }

    if (!file.type.startsWith('image/')) {
      reject(new Error('Selected file is not an image'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target.result); // Fallback to raw data url if canvas unavailable
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };

      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.src = event.target.result;
    };

    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}
