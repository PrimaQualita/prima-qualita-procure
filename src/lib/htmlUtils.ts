import DOMPurify from 'dompurify';

/**
 * Remove HTML tags from a string and return plain text
 */
export function stripHtml(html: string): string {
  if (!html) return '';
  
  // Create a temporary div to parse HTML
  const tmp = document.createElement('div');
  tmp.innerHTML = DOMPurify.sanitize(html);
  
  // Get text content
  return tmp.textContent || tmp.innerText || '';
}

/**
 * Truncate text to a maximum length
 */
export function truncateText(text: string, maxLength: number = 100): string {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}
