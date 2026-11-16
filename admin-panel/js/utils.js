/**
 * ShopBill Admin Panel - Utility Helpers
 * Includes Cryptographic PIN generation, SHA-256 hashing, Toast notifications, and formatting.
 */

/**
 * Generate a unique, human-readable Shop ID.
 * Format: SB-XXXX (e.g. SB-4829)
 */
export function generateShopId() {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `SB-${randomNum}`;
}

/**
 * Generate a cryptographically secure random numeric PIN.
 * Uses window.crypto.getRandomValues for true entropy.
 * @param {number} length - Number of digits (default: 4)
 */
export function generateSecurePin(length = 4) {
  const digits = '0123456789';
  const randomBytes = new Uint8Array(length);
  window.crypto.getRandomValues(randomBytes);
  
  let pin = '';
  for (let i = 0; i < length; i++) {
    pin += digits[randomBytes[i] % digits.length];
  }
  return pin;
}

/**
 * Hash a PIN using the Web Crypto API SHA-256.
 * Never store plaintext PINs in Firestore.
 * @param {string} pin - Plaintext staff PIN
 * @returns {Promise<string>} Hexadecimal SHA-256 hash string
 */
export async function hashPin(pin) {
  if (!pin) return '';
  const encoder = new TextEncoder();
  const data = encoder.encode(pin.trim());
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Display a modern animated toast notification.
 * @param {string} message - Message to show
 * @param {'success'|'error'|'info'} type - Toast variant
 */
export function showToast(message, type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/**
 * Format date or Firestore Timestamp into a clean local string.
 * @param {Date|string|number|object} timestamp - Date representation
 */
export function formatDate(timestamp) {
  if (!timestamp) return '-';

  let date;
  if (timestamp && typeof timestamp.toDate === 'function') {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
    date = new Date(timestamp);
  } else {
    return '-';
  }

  if (isNaN(date.getTime())) return '-';

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Copy text string to the system clipboard.
 * @param {string} text - Content to copy
 */
export async function copyToClipboard(text) {
  if (!text) return;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  } catch (err) {
    console.error('Clipboard copy failed:', err);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
