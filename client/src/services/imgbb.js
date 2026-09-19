/**
 * ImgBB Image Upload Service
 * Uploads images directly to ImgBB and returns the hosted direct image URL.
 */

const IMGBB_API_KEY = import.meta.env.VITE_IMGBB_API_KEY || 'a90e3a6bc0da9b6999be5fa15886d302'; // default demo key or user-configured key

/**
 * Upload an image File object or base64 string to ImgBB
 * @param {File|Blob|string} imageFile - The image File or base64 string
 * @returns {Promise<{ success: boolean, url: string, deleteUrl?: string, error?: string }>}
 */
export async function uploadToImgBB(imageFile) {
  try {
    const formData = new FormData();
    formData.append('image', imageFile);

    const endpoint = `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (result.success && result.data) {
      return {
        success: true,
        url: result.data.display_url || result.data.url,
        thumbUrl: result.data.thumb?.url || result.data.url,
        deleteUrl: result.data.delete_url
      };
    } else {
      throw new Error(result.error?.message || 'ImgBB upload failed');
    }
  } catch (error) {
    console.error('ImgBB Upload Error:', error);
    return {
      success: false,
      error: error.message || 'Failed to upload image to ImgBB'
    };
  }
}
