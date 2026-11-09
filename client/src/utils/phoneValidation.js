/**
 * Phone Number Validation Utility
 * Enforces strict Indian mobile number validation:
 * - Exactly 10 digits
 * - Starts with 6, 7, 8, or 9
 * - Digits only (normalizes +91 or leading 0/spaces/dashes)
 * Regex: ^[6-9][0-9]{9}$
 */

export const INDIAN_PHONE_REGEX = /^[6-9][0-9]{9}$/;

/**
 * Normalizes a phone string by stripping +91, spaces, hyphens, and non-digit characters.
 * @param {string|number} raw
 * @returns {string} Clean digits
 */
export function cleanPhoneNumber(raw) {
  if (raw === null || raw === undefined) return '';
  let str = String(raw).trim();

  // Strip leading +91 or 91 if it results in more than 10 digits
  if (str.startsWith('+91')) {
    str = str.slice(3).trim();
  } else if (str.startsWith('91') && str.length > 10) {
    str = str.slice(2).trim();
  } else if (str.startsWith('0') && str.length === 11) {
    str = str.slice(1).trim();
  }

  // Keep digits only
  return str.replace(/\D/g, '');
}

/**
 * Checks whether a phone number is a valid 10-digit Indian mobile number.
 * @param {string|number} raw
 * @returns {boolean}
 */
export function isValidIndianPhone(raw) {
  const digits = cleanPhoneNumber(raw);
  return INDIAN_PHONE_REGEX.test(digits);
}

/**
 * Validates phone and returns error message if invalid.
 * @param {string|number} raw
 * @returns {{ isValid: boolean, cleaned: string, message: string }}
 */
export function validateIndianPhone(raw) {
  const digits = cleanPhoneNumber(raw);

  if (!digits) {
    return {
      isValid: false,
      cleaned: '',
      message: 'Mobile number is required.',
    };
  }

  if (!/^[6-9]/.test(digits)) {
    return {
      isValid: false,
      cleaned: digits,
      message: 'Mobile number must start with 6, 7, 8, or 9.',
    };
  }

  if (digits.length !== 10) {
    return {
      isValid: false,
      cleaned: digits,
      message: `Mobile number must be exactly 10 digits (currently ${digits.length}).`,
    };
  }

  return {
    isValid: true,
    cleaned: digits,
    message: '',
  };
}
