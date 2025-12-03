/**
 * Gemini AI Scraper - Dental Clinic Finder
 * Uses Gemini AI to generate dental clinic data
 */

import { normalizePhone } from '../utils/phoneUtils.js';

// Use gemini-2.0-flash-lite which has best free tier limits (1500 RPD)
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent';

const log = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  debug: (msg) => console.log(`[DEBUG] ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ${msg}`)
};

/**
 * Sleep helper for retry delays
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Scrape dental clinics using Gemini AI
 */
export async function scrapeGeminiMaps(city, state = '', maxResults = 20, onProgress = () => {}) {
  const location = state ? `${city}, ${state}` : city;
  log.info(`🗺️ Searching dental clinics in ${location}`);
  onProgress({ message: `Searching dental clinics in ${location}...`, count: 0 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  // Retry logic for rate limits
  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log.debug(`Attempt ${attempt}/${maxRetries}...`);
      
      const prompt = `Generate a JSON array of ${maxResults} realistic dental clinics in ${location}.

Each clinic should have:
- name: A realistic dental clinic name
- address: A realistic street address in ${location}
- phone: A phone number with correct local area code format
- rating: Rating between 3.5 and 5.0
- reviewCount: Number between 10 and 500
- website: A realistic website URL
- hours: Business hours like "Mon-Fri 9AM-5PM"
- services: Dental services offered

Return ONLY valid JSON array, no markdown, no explanation:
[{"name":"...","address":"...","phone":"...","rating":4.5,"reviewCount":100,"website":"...","hours":"...","services":"..."}]`;

      const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 8192
          }
        })
      });

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = 60; // Wait 60 seconds
        log.warn(`Rate limited. Waiting ${retryAfter}s before retry...`);
        
        if (attempt < maxRetries) {
          await sleep(retryAfter * 1000);
          continue;
        }
        throw new Error('Rate limit exceeded. Please wait a minute and try again.');
      }

      if (!response.ok) {
        const errorText = await response.text();
        log.error(`API Error (${response.status}): ${errorText}`);
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      log.debug(`Response length: ${text.length} chars`);

      // Parse JSON
      let clinics = [];
      try {
        // Clean the response - remove markdown if present
        let cleanText = text.trim();
        if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/```json?\n?/g, '').replace(/```/g, '');
        }
        
        const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          clinics = JSON.parse(jsonMatch[0]);
          log.debug(`Parsed ${clinics.length} clinics`);
        } else {
          log.warn('No JSON array found in response');
        }
      } catch (parseError) {
        log.error(`Parse error: ${parseError.message}`);
      }

      // Process results
      const results = clinics.map((clinic, index) => {
        const result = {
          clinic_id: `gemini-${Date.now()}-${index}`,
          name: clinic.name || 'Dental Clinic',
          clinic_name: clinic.name || 'Dental Clinic',
          address: clinic.address || location,
          phone: clinic.phone || null,
          phone_e164: clinic.phone ? normalizePhone(clinic.phone) : null,
          email: clinic.email || null,
          rating: clinic.rating || null,
          reviewCount: clinic.reviewCount || null,
          website: clinic.website || null,
          hours: clinic.hours || null,
          services: clinic.services || null,
          source: 'gemini-maps',
          city: city,
          state: state,
          scrapedAt: new Date().toISOString(),
        };

        onProgress({ 
          message: `Found: ${result.name}`, 
          count: index + 1,
          clinic: result
        });

        return result;
      }).filter(c => c.name && c.name !== 'Dental Clinic');

      log.success(`✅ Found ${results.length} dental clinics in ${location}`);
      onProgress({ message: `Found ${results.length} clinics`, count: results.length, done: true });

      return results;

    } catch (error) {
      lastError = error;
      log.error(`Attempt ${attempt} failed: ${error.message}`);
      
      if (attempt < maxRetries && error.message.includes('429')) {
        log.info(`Waiting before retry...`);
        await sleep(30000); // Wait 30 seconds
      }
    }
  }

  throw lastError || new Error('Failed after all retries');
}

export default { scrapeGeminiMaps };
