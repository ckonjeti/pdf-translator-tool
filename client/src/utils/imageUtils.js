/**
 * Utility functions for handling image URLs across different devices and deployments
 */

/**
 * Get the absolute URL for an image that works across different devices and domains
 * @param {string} imagePath - The relative image path from the database
 * @returns {string} - The absolute URL to the image
 */
export const getAbsoluteImageUrl = (imagePath) => {
  if (!imagePath) return '';
  
  // If already absolute URL, return as-is
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  
  // Get the server URL for images
  let serverUrl = getServerUrl();
  
  // Add cache-busting parameter to force fresh image loads
  const cacheBuster = Date.now();
  const separator = imagePath.includes('?') ? '&' : '?';
  
  return `${serverUrl}${imagePath}${separator}t=${cacheBuster}`;
};

/**
 * Get the server URL based on environment and configuration
 * @returns {string} - The server URL
 */
const getServerUrl = () => {
  // In development, always use localhost:5000
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:5000';
  }
  
  // In production, use environment variable if available
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  
  // Fallback to current origin in production
  // This works for most deployment scenarios where frontend and backend are on same domain
  return window.location.origin;
};

/**
 * Check if an image URL is accessible
 * @param {string} imageUrl - The image URL to check
 * @returns {Promise<boolean>} - Whether the image is accessible
 */
export const checkImageAccess = (imageUrl) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = imageUrl;
  });
};

/**
 * Get a fallback image URL if the primary image fails to load
 * @param {string} imagePath - The relative image path
 * @returns {string} - A fallback image URL or empty string
 */
export const getFallbackImageUrl = (imagePath) => {
  // Could implement fallback to different server endpoints or placeholder images
  return '';
};