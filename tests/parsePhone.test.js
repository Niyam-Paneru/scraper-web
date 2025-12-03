/**
 * Phone Normalization Tests
 * Tests for the phone normalization functionality using Node.js test runner
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { normalizePhone, extractPhoneNumbers, extractEmails } from '../scripts/utils/phoneUtils.js';

describe('Phone Normalization', () => {
  
  describe('normalizePhone', () => {
    
    it('should normalize US phone with parentheses format to E.164', () => {
      const result = normalizePhone('(212) 456-7890', 'US');
      
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.normalized, '+12124567890');
    });

    it('should normalize US phone with dashes format to E.164', () => {
      const result = normalizePhone('512-555-1234', 'US');
      
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.normalized, '+15125551234');
    });

    it('should handle phone with +1 prefix', () => {
      const result = normalizePhone('+1 (310) 555-9876', 'US');
      
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.normalized, '+13105559876');
    });

    it('should handle toll-free numbers', () => {
      const result = normalizePhone('1-800-275-2273', 'US');
      
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.normalized, '+18002752273');
    });

    it('should return error for invalid phone', () => {
      const result = normalizePhone('123', 'US');
      
      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.normalized, '');
      assert.ok(result.error);
    });

    it('should return error for empty string', () => {
      const result = normalizePhone('', 'US');
      
      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.error, 'no phone');
    });

    it('should return error for null input', () => {
      const result = normalizePhone(null, 'US');
      
      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.error, 'no phone');
    });

    it('should handle phone with dots format', () => {
      const result = normalizePhone('415.555.1234', 'US');
      
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.normalized, '+14155551234');
    });

    it('should handle international numbers', () => {
      const result = normalizePhone('+44 20 7946 0958', 'GB');
      
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.normalized, '+442079460958');
    });

  });

  describe('extractPhoneNumbers', () => {
    
    it('should extract phone numbers from text', () => {
      const text = 'Call us at (512) 555-1234 or 1-800-555-9999 for more info';
      const phones = extractPhoneNumbers(text);
      
      assert.ok(phones.length >= 2);
      assert.ok(phones.some(p => p.includes('512')));
      assert.ok(phones.some(p => p.includes('800')));
    });

    it('should return empty array for text without phones', () => {
      const text = 'No phone numbers here';
      const phones = extractPhoneNumbers(text);
      
      assert.ok(Array.isArray(phones));
      assert.strictEqual(phones.length, 0);
    });

    it('should handle empty input', () => {
      const phones = extractPhoneNumbers('');
      assert.deepStrictEqual(phones, []);
    });

  });

});

console.log('Running phone normalization tests...\n');
