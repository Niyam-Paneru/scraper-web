/**
 * Google Places API Source Handler
 * Uses Google Places API for reliable, TOS-compliant data retrieval
 * This is the RECOMMENDED source for production use
 */
import axios from 'axios';
import { normalizePhone } from '../utils/phoneUtils.js';

/**
 * Get timezone for a US state
 * @param {string} state
 * @returns {string}
 */
function getTimezoneForState(state) {
  const stateTimezones = {
    'AL': 'America/Chicago', 'AK': 'America/Anchorage', 'AZ': 'America/Phoenix',
    'AR': 'America/Chicago', 'CA': 'America/Los_Angeles', 'CO': 'America/Denver',
    'CT': 'America/New_York', 'DE': 'America/New_York', 'FL': 'America/New_York',
    'GA': 'America/New_York', 'HI': 'Pacific/Honolulu', 'ID': 'America/Boise',
    'IL': 'America/Chicago', 'IN': 'America/Indiana/Indianapolis', 'IA': 'America/Chicago',
    'KS': 'America/Chicago', 'KY': 'America/Kentucky/Louisville', 'LA': 'America/Chicago',
    'ME': 'America/New_York', 'MD': 'America/New_York', 'MA': 'America/New_York',
    'MI': 'America/Detroit', 'MN': 'America/Chicago', 'MS': 'America/Chicago',
    'MO': 'America/Chicago', 'MT': 'America/Denver', 'NE': 'America/Chicago',
    'NV': 'America/Los_Angeles', 'NH': 'America/New_York', 'NJ': 'America/New_York',
    'NM': 'America/Denver', 'NY': 'America/New_York', 'NC': 'America/New_York',
    'ND': 'America/Chicago', 'OH': 'America/New_York', 'OK': 'America/Chicago',
    'OR': 'America/Los_Angeles', 'PA': 'America/New_York', 'RI': 'America/New_York',
    'SC': 'America/New_York', 'SD': 'America/Chicago', 'TN': 'America/Chicago',
    'TX': 'America/Chicago', 'UT': 'America/Denver', 'VT': 'America/New_York',
    'VA': 'America/New_York', 'WA': 'America/Los_Angeles', 'WV': 'America/New_York',
    'WI': 'America/Chicago', 'WY': 'America/Denver', 'DC': 'America/New_York'
  };
  
  return stateTimezones[state?.toUpperCase()] || 'America/New_York';
}

/**
 * Parse address components from Google Places
 * @param {Array} components
 * @returns {object}
 */
function parseAddressComponents(components) {
  const result = {
    address: '',
    city: '',
    state: '',
    postal_code: '',
    country: ''
  };
  
  if (!components) return result;
  
  let streetNumber = '';
  let route = '';
  
  for (const component of components) {
    const types = component.types || [];
    
    if (types.includes('street_number')) {
      streetNumber = component.long_name;
    } else if (types.includes('route')) {
      route = component.long_name;
    } else if (types.includes('locality')) {
      result.city = component.long_name;
    } else if (types.includes('administrative_area_level_1')) {
      result.state = component.short_name;
    } else if (types.includes('postal_code')) {
      result.postal_code = component.long_name;
    } else if (types.includes('country')) {
      result.country = component.short_name;
    }
  }
  
  result.address = [streetNumber, route].filter(Boolean).join(' ');
  
  return result;
}

/**
 * Perform Places Text Search
 * @param {string} query
 * @param {string} apiKey
 * @param {string} pageToken
 * @returns {Promise<object>}
 */
async function textSearch(query, apiKey, pageToken = null) {
  const params = {
    query,
    key: apiKey,
    type: 'dentist'
  };
  
  if (pageToken) {
    params.pagetoken = pageToken;
  }
  
  const response = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
    params,
    timeout: 10000
  });
  
  return response.data;
}

/**
 * Get Place Details
 * @param {string} placeId
 * @param {string} apiKey
 * @returns {Promise<object>}
 */
async function getPlaceDetails(placeId, apiKey) {
  const fields = [
    'name',
    'formatted_phone_number',
    'international_phone_number',
    'website',
    'formatted_address',
    'address_components',
    'url',
    'business_status'
  ].join(',');
  
  const response = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
    params: {
      place_id: placeId,
      fields,
      key: apiKey
    },
    timeout: 10000
  });
  
  return response.data;
}

/**
 * Scrape Google Places for dental clinics
 * @param {object} options
 * @param {string} options.location - Location to search
 * @param {number} options.max - Maximum results
 * @param {number} options.delay - Delay between requests (ms)
 * @param {string} options.googlePlacesKey - Google Places API key
 * @param {object} logger - Logger instance
 * @returns {AsyncGenerator<object>}
 */
export async function* scrapeGooglePlaces(options, logger) {
  const {
    location,
    max = 200,
    delay = 200, // Google API is fast, but rate-limited
    googlePlacesKey
  } = options;

  if (!googlePlacesKey) {
    logger.error('Google Places API key is required. Use --google-places-key or set GOOGLE_PLACES_KEY env var.');
    return;
  }

  logger.info(`Starting Google Places API search for "dentist in ${location}" (max: ${max})`);
  logger.info('✓ Using Google Places API - TOS compliant and reliable');

  const query = `dentist in ${location}`;
  let pageToken = null;
  const placeIds = new Set();

  try {
    // Collect place IDs from text search
    while (placeIds.size < max) {
      logger.info(`Fetching search results... (${placeIds.size} found so far)`);
      
      const searchResult = await textSearch(query, googlePlacesKey, pageToken);
      
      if (searchResult.status !== 'OK' && searchResult.status !== 'ZERO_RESULTS') {
        logger.error(`Google Places API error: ${searchResult.status} - ${searchResult.error_message || ''}`);
        break;
      }
      
      if (!searchResult.results || searchResult.results.length === 0) {
        logger.info('No more results from Google Places');
        break;
      }
      
      // Add place IDs
      for (const place of searchResult.results) {
        if (placeIds.size < max && place.place_id) {
          placeIds.add(place.place_id);
        }
      }
      
      logger.info(`Found ${searchResult.results.length} places (total: ${placeIds.size})`);
      
      // Check for next page
      if (searchResult.next_page_token && placeIds.size < max) {
        pageToken = searchResult.next_page_token;
        // Google requires a short delay before using next_page_token
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        break;
      }
    }

    logger.info(`Fetching details for ${placeIds.size} places...`);

    // Fetch details for each place
    let processed = 0;
    for (const placeId of placeIds) {
      try {
        logger.progress(processed + 1, placeIds.size, '');
        
        const detailsResult = await getPlaceDetails(placeId, googlePlacesKey);
        
        if (detailsResult.status !== 'OK') {
          logger.debug(`Failed to get details for ${placeId}: ${detailsResult.status}`);
          continue;
        }
        
        const place = detailsResult.result;
        
        // Skip permanently closed businesses
        if (place.business_status === 'CLOSED_PERMANENTLY') {
          logger.debug(`Skipping closed business: ${place.name}`);
          continue;
        }
        
        // Parse address
        const addressParts = parseAddressComponents(place.address_components);
        
        // Normalize phone
        let phone_e164 = '';
        let notes = [];
        const rawPhone = place.international_phone_number || place.formatted_phone_number || '';
        
        if (rawPhone) {
          const phoneResult = normalizePhone(rawPhone, addressParts.country || 'US');
          if (phoneResult.isValid) {
            phone_e164 = phoneResult.normalized;
            logger.updateStat('validPhones');
          } else {
            notes.push('invalid phone');
            logger.updateStat('invalidPhones');
          }
        } else {
          notes.push('no phone');
          logger.updateStat('noPhone');
        }
        
        // Get timezone
        const timezone = getTimezoneForState(addressParts.state);
        
        logger.updateStat('totalFound');
        
        yield {
          clinic_name: place.name || '',
          owner_name: '',
          phone: place.formatted_phone_number || '',
          phone_e164,
          email: '', // Google Places doesn't provide email
          website: place.website || '',
          address: addressParts.address,
          city: addressParts.city,
          state: addressParts.state,
          postal_code: addressParts.postal_code,
          country: addressParts.country || 'US',
          timezone,
          source_url: place.url || `https://www.google.com/maps/place/?q=place_id:${placeId}`,
          notes: notes.join('; ')
        };
        
        processed++;
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, delay));
        
      } catch (err) {
        logger.error(`Error fetching place details: ${err.message}`);
      }
    }

  } catch (err) {
    logger.error(`Google Places API error: ${err.message}`);
  }
}

export default { scrapeGooglePlaces };
