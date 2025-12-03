/**
 * Gemini Maps Grounding Scraper
 * Uses Gemini's built-in Google Maps tool for direct access to business data
 * FREE: 500 requests/day included with Gemini API
 */

import { normalizePhone } from '../utils/phoneUtils.js';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Simple logger for this module
const log = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  debug: (msg) => process.env.DEBUG && console.log(`[DEBUG] ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ${msg}`)
};

/**
 * Scrape dental clinics using Gemini's Google Maps grounding
 * @param {string} city - City to search in
 * @param {string} state - State/region
 * @param {number} maxResults - Maximum results to return
 * @param {function} onProgress - Progress callback
 * @returns {Promise<Array>} Array of clinic objects
 */
export async function scrapeGeminiMaps(city, state = '', maxResults = 20, onProgress = () => {}) {
  const location = state ? `${city}, ${state}` : city;
  log.info(`🗺️ Gemini Maps: Searching dental clinics in ${location}`);
  onProgress({ message: `Searching dental clinics in ${location} via Gemini Maps...`, count: 0 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured. Get one free at https://aistudio.google.com/apikey');
  }

  try {
    const prompt = `Find ${maxResults} dental clinics, dentist offices, and dental practices in ${location}. 
    
For each dental clinic, provide the following information in a structured JSON format:
- name: The business name
- address: Full street address including city, state, zip
- phone: Phone number with area code
- email: Email address if available (look on their website or Google listing)
- rating: Google rating (out of 5)
- reviewCount: Number of reviews
- website: Their actual business website URL (NOT the Google Maps URL)
- hours: Opening hours (e.g., "Mon-Fri 8AM-5PM, Sat 9AM-2PM")
- services: Types of dental services offered

Return ONLY a valid JSON array with no additional text or markdown. Example format:
[
  {
    "name": "Smile Dental Care",
    "address": "123 Main St, ${location} 78701",
    "phone": "(512) 555-4567",
    "email": "info@smiledentalcare.com",
    "rating": 4.5,
    "reviewCount": 120,
    "website": "https://smiledentalcare.com",
    "hours": "Mon-Fri 9AM-5PM, Sat 9AM-1PM",
    "services": ["General Dentistry", "Cosmetic", "Orthodontics"]
  }
]`;

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        // Enable Google Maps grounding tool
        tools: [{ googleMaps: {} }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192
        }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    log.debug('Gemini Maps response received, parsing...');

    // Parse the JSON response
    let clinics = [];
    try {
      // Extract JSON from response (might have markdown code blocks)
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        clinics = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      log.warn('Failed to parse Gemini response as JSON, attempting extraction:', parseError.message);
      clinics = extractClinicsFromText(text, location);
    }

    // Process and normalize the results
    const results = clinics.map((clinic, index) => {
      const normalized = {
        name: clinic.name || 'Unknown Dental Clinic',
        clinic_name: clinic.name || 'Unknown Dental Clinic',
        address: clinic.address || location,
        phone: clinic.phone || null,
        phone_e164: clinic.phone ? normalizePhone(clinic.phone) : null,
        email: clinic.email || null,
        rating: clinic.rating || null,
        reviewCount: clinic.reviewCount || null,
        website: clinic.website || null,
        hours: clinic.hours || null,
        services: Array.isArray(clinic.services) ? clinic.services.join(', ') : clinic.services || null,
        source: 'gemini-maps',
        city: city,
        state: state,
        scrapedAt: new Date().toISOString(),
      };

      onProgress({ 
        message: `Found: ${normalized.name}`, 
        count: index + 1,
        clinic: normalized
      });

      return normalized;
    }).filter(c => c.name && c.name !== 'Unknown Dental Clinic');

    // Check for grounding metadata (sources from Google Maps)
    const groundingMetadata = data.candidates?.[0]?.groundingMetadata;
    if (groundingMetadata?.groundingChunks) {
      const sources = groundingMetadata.groundingChunks;
      log.info(`📍 Grounded with ${sources.length} Google Maps sources`);
      
      // Enhance results with place IDs if available
      sources.forEach((source, idx) => {
        if (source.maps && results[idx]) {
          results[idx].placeId = source.maps.placeId;
          results[idx].mapsUrl = source.maps.uri;
          results[idx].source_url = source.maps.uri;
        }
      });
    }

    log.success(`✅ Gemini Maps found ${results.length} dental clinics in ${location}`);
    onProgress({ message: `Completed! Found ${results.length} clinics`, count: results.length, done: true });

    return results;

  } catch (error) {
    log.error('Gemini Maps scraping error:', error.message);
    
    if (error.message.includes('API key')) {
      throw new Error('Invalid or missing GEMINI_API_KEY. Get one free at https://aistudio.google.com/apikey');
    }
    
    if (error.message.includes('quota') || error.message.includes('rate')) {
      throw new Error('Gemini API rate limit reached. Free tier allows 500 Maps requests/day.');
    }
    
    throw error;
  }
}

/**
 * Fallback: Extract clinic info from unstructured text
 */
function extractClinicsFromText(text, location) {
  const clinics = [];
  const lines = text.split('\n');
  let currentClinic = {};

  for (const line of lines) {
    // Look for clinic names (usually followed by rating or address)
    if (line.match(/dental|dentist|orthodont|oral/i) && !line.includes('services')) {
      if (currentClinic.name) {
        clinics.push(currentClinic);
      }
      currentClinic = { name: line.trim() };
    }
    
    // Extract phone numbers
    const phoneMatch = line.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    if (phoneMatch && currentClinic.name) {
      currentClinic.phone = phoneMatch[0];
    }
    
    // Extract ratings
    const ratingMatch = line.match(/(\d\.?\d?)\s*(?:stars?|\/5|rating)/i);
    if (ratingMatch && currentClinic.name) {
      currentClinic.rating = parseFloat(ratingMatch[1]);
    }
    
    // Extract addresses (look for street patterns)
    const addressMatch = line.match(/\d+\s+[\w\s]+(?:St|Ave|Blvd|Dr|Rd|Way|Lane|Ln|Circle|Cir)/i);
    if (addressMatch && currentClinic.name) {
      currentClinic.address = line.trim();
    }
  }

  if (currentClinic.name) {
    clinics.push(currentClinic);
  }

  return clinics;
}

/**
 * Get detailed info about a specific dental clinic using its place ID
 */
export async function getClinicDetails(placeId, clinicName) {
  log.info(`🔍 Getting details for: ${clinicName}`);

  try {
    const prompt = `Get detailed information about this dental clinic: "${clinicName}"
    
Please provide:
1. Full contact information (phone, address, website)
2. Business hours for each day
3. Services offered
4. Recent patient reviews and what they say about the clinic
5. Any specialties or notable features
6. Insurance information if available

Return as structured JSON.`;

    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
      },
    });

    return response.text;

  } catch (error) {
    log.error('Failed to get clinic details:', error.message);
    throw error;
  }
}

export default { scrapeGeminiMaps, getClinicDetails };
