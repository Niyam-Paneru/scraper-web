/**
 * Phone Utilities - E.164 normalization using libphonenumber-js
 * 
 * This module provides phone number validation and normalization
 * for the Dental Clinic Prospect Finder.
 */

import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Normalize a phone number to E.164 format
 * @param {string} rawPhone - Raw phone number string
 * @param {string} defaultCountry - Default country code (default: 'US')
 * @returns {{ normalized: string, isValid: boolean, error?: string }}
 */
export function normalizePhone(rawPhone, defaultCountry = 'US') {
  if (!rawPhone || typeof rawPhone !== 'string' || rawPhone.trim() === '') {
    return {
      normalized: '',
      isValid: false,
      error: 'no phone'
    };
  }

  // Clean the input - remove common artifacts
  let cleaned = rawPhone
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/ext\.?\s*\d+/gi, '') // Remove extensions
    .replace(/x\s*\d+$/gi, '')     // Remove x123 style extensions
    .trim();

  if (!cleaned) {
    return {
      normalized: '',
      isValid: false,
      error: 'no phone'
    };
  }

  try {
    // Try parsing with default country
    let phoneNumber = parsePhoneNumberFromString(cleaned, defaultCountry);

    // If that fails and number doesn't start with +, try with + prefix
    if (!phoneNumber && !cleaned.startsWith('+')) {
      // Try adding +1 for US numbers
      if (defaultCountry === 'US' && cleaned.replace(/\D/g, '').length === 10) {
        phoneNumber = parsePhoneNumberFromString(`+1${cleaned.replace(/\D/g, '')}`, defaultCountry);
      }
    }

    if (!phoneNumber) {
      return {
        normalized: '',
        isValid: false,
        error: 'Could not parse phone number'
      };
    }

    if (!phoneNumber.isValid()) {
      return {
        normalized: '',
        isValid: false,
        error: `Invalid phone number for ${phoneNumber.country || defaultCountry}`
      };
    }

    return {
      normalized: phoneNumber.format('E.164'),
      isValid: true,
      country: phoneNumber.country,
      nationalNumber: phoneNumber.nationalNumber
    };
  } catch (error) {
    return {
      normalized: '',
      isValid: false,
      error: `Parse error: ${error.message}`
    };
  }
}

/**
 * Extract phone numbers from text using regex patterns
 * @param {string} text - Text to search for phone numbers
 * @returns {string[]} Array of potential phone number strings
 */
export function extractPhoneNumbers(text) {
  if (!text) return [];

  // Common phone number patterns
  const patterns = [
    /\(\d{3}\)\s*\d{3}[-.\s]?\d{4}/g,      // (123) 456-7890
    /\d{3}[-.\s]\d{3}[-.\s]\d{4}/g,         // 123-456-7890
    /\+\d{1,3}\s?\d{3}\s?\d{3}\s?\d{4}/g,   // +1 123 456 7890
    /(?<!\d)\d{10}(?!\d)/g,                  // 1234567890
    /\+\d{1,3}[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g // +1-123-456-7890
  ];

  const found = new Set();
  
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(m => found.add(m.trim()));
    }
  }

  return Array.from(found);
}

/**
 * Extract emails from text using regex
 * @param {string} text - Text to search for emails
 * @returns {string[]} Array of email addresses found
 */
export function extractEmails(text) {
  if (!text) return [];
  
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailPattern) || [];
  
  // Filter out common false positives
  return matches.filter(email => {
    const lower = email.toLowerCase();
    return !lower.includes('example.com') &&
           !lower.includes('domain.com') &&
           !lower.includes('email.com') &&
           !lower.endsWith('.png') &&
           !lower.endsWith('.jpg') &&
           !lower.endsWith('.gif');
  });
}

export default {
  normalizePhone,
  extractPhoneNumbers,
  extractEmails
};
