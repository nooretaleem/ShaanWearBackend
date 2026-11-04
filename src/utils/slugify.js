/**
 * Utility to generate clean, URL-safe slugs from titles/names.
 *
 * @param {string} text - Input text
 * @returns {string} - URL-safe slug
 */
const slugify = (text) => {
  if (!text || typeof text !== 'string') return '';
  return text
    .toString()
    .normalize('NFD') // Decompose combined characters
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // Remove invalid chars
    .replace(/[\s_-]+/g, '-') // Swap spaces and underscores to hyphens
    .replace(/^-+|-+$/g, ''); // Trim leading/trailing hyphens
};

module.exports = {
  slugify
};
