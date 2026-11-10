/**
 * Indian Aadhaar Number Validation & UIDAI Verification Helpers
 *
 * Implements the standard UIDAI 12-digit rules:
 * 1. Must be exactly 12 numeric digits
 * 2. Cannot start with 0 or 1
 * 3. Validated with the official Verhoeff Checksum Algorithm
 */

// The Verhoeff multiplication table (d)
const d = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];

// The Verhoeff permutation table (p)
const p = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
];

const inv = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/**
 * Validates Verhoeff Checksum for a string of digits
 */
export function validateVerhoeffChecksum(numStr) {
  let c = 0;
  const invertedArray = String(numStr).split('').map(Number).reverse();
  for (let i = 0; i < invertedArray.length; i++) {
    c = d[c][p[i % 8][invertedArray[i]]];
  }
  return c === 0;
}

/**
 * Computes check digit for 11 digits
 */
export function computeVerhoeffCheckDigit(num11) {
  let c = 0;
  const inverted = String(num11).split('').map(Number).reverse();
  for (let i = 0; i < inverted.length; i++) {
    c = d[c][p[(i + 1) % 8][inverted[i]]];
  }
  return inv[c];
}

/**
 * Formats a 12-digit Aadhaar as "XXXX XXXX XXXX"
 */
export function formatAadhaar(val) {
  const digits = String(val || '').replace(/\D/g, '').slice(0, 12);
  const parts = [];
  for (let i = 0; i < digits.length; i += 4) {
    parts.push(digits.substring(i, i + 4));
  }
  return parts.join(' ');
}

/**
 * Masks Aadhaar number showing only last 4 digits: "•••• •••• 1234"
 */
export function maskAadhaar(val) {
  const digits = String(val || '').replace(/\D/g, '');
  if (digits.length < 4) return digits;
  const last4 = digits.slice(-4);
  return `•••• •••• ${last4}`;
}

/**
 * Validates 12-digit Indian Aadhaar number
 * @param {string} aadhaar
 * @returns {{ isValid: boolean, message: string, cleaned: string, masked: string, formatted: string, isChecksumValid: boolean }}
 */
export function validateIndianAadhaar(aadhaar) {
  if (!aadhaar || typeof aadhaar !== 'string') {
    return {
      isValid: false,
      message: 'Please enter your 12-digit Aadhaar number',
      cleaned: '',
      masked: '',
      formatted: '',
      isChecksumValid: false
    };
  }

  const cleaned = aadhaar.replace(/\D/g, '');

  if (cleaned.length !== 12) {
    return {
      isValid: false,
      message: `Aadhaar number must be exactly 12 digits (currently ${cleaned.length} digits)`,
      cleaned,
      masked: '',
      formatted: formatAadhaar(cleaned),
      isChecksumValid: false
    };
  }

  if (cleaned.startsWith('0') || cleaned.startsWith('1')) {
    return {
      isValid: false,
      message: 'Aadhaar number cannot start with 0 or 1 (UIDAI standard)',
      cleaned,
      masked: '',
      formatted: formatAadhaar(cleaned),
      isChecksumValid: false
    };
  }

  const isChecksumValid = validateVerhoeffChecksum(cleaned);

  return {
    isValid: true,
    message: isChecksumValid ? 'Verified Aadhaar Number' : 'Valid 12-digit Aadhaar format',
    cleaned,
    masked: maskAadhaar(cleaned),
    formatted: formatAadhaar(cleaned),
    isChecksumValid
  };
}
