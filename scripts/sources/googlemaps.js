/**
 * Google Maps Scraper (Free - No API Key Required)
 * 
 * Scrapes dental clinics directly from Google Maps search results
 * using Playwright browser automation.
 * 
 * ⚠️ Note: This may violate Google's Terms of Service.
 * Use responsibly and consider rate limiting.
 */

import { initBrowser, closeBrowser } from '../lib/visitAndExtract.js';
import { normalizePhone } from '../utils/phoneUtils.js';

// Timezone mapping
const STATE_TIMEZONES = {
  'AL': 'America/Chicago', 'AK': 'America/Anchorage', 'AZ': 'America/Phoenix',
  'AR': 'America/Chicago', 'CA': 'America/Los_Angeles', 'CO': 'America/Denver',
  'CT': 'America/New_York', 'DE': 'America/New_York', 'FL': 'America/New_York',
  'GA': 'America/New_York', 'HI': 'Pacific/Honolulu', 'ID': 'America/Boise',
  'IL': 'America/Chicago', 'IN': 'America/Indiana/Indianapolis', 'IA': 'America/Chicago',
  'KS': 'America/Chicago', 'KY': 'America/New_York', 'LA': 'America/Chicago',
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

function getTimezoneForState(state) {
  if (!state) return 'America/New_York';
  const abbrev = state.length === 2 ? state.toUpperCase() : state.substring(0, 2).toUpperCase();
  return STATE_TIMEZONES[abbrev] || 'America/New_York';
}

/**
 * Scrape Google Maps for dental clinics
 * @param {object} options - Scraping options
 * @param {object} logger - Logger instance
 * @yields {object} Clinic data
 */
export async function* scrapeGoogleMaps(options, logger) {
  const { location, max = 50, delay = 2000 } = options;
  
  logger.info(`Starting Google Maps scraper for: ${location}`);
  logger.warn('⚠️ Scraping Google Maps may violate their ToS. Use responsibly.');
  
  const browser = await initBrowser({ headless: true });
  const page = await browser.newPage();
  
  try {
    // Build search URL
    const searchQuery = encodeURIComponent(`dental clinics in ${location}`);
    const mapsUrl = `https://www.google.com/maps/search/${searchQuery}`;
    
    logger.info(`Navigating to: ${mapsUrl}`);
    await page.goto(mapsUrl, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Wait for results to load
    await page.waitForTimeout(3000);
    
    // Accept cookies if prompted
    try {
      const acceptButton = await page.$('button[aria-label*="Accept"]');
      if (acceptButton) await acceptButton.click();
      await page.waitForTimeout(1000);
    } catch (e) {}
    
    let resultsFound = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 20;
    const seenNames = new Set();
    
    while (resultsFound < max && scrollAttempts < maxScrollAttempts) {
      // Find the scrollable results panel
      const resultsPanel = await page.$('div[role="feed"]');
      if (!resultsPanel) {
        logger.warn('Could not find results panel');
        break;
      }
      
      // Get all listing elements
      const listings = await page.$$('div[role="feed"] > div > div[jsaction]');
      
      for (const listing of listings) {
        if (resultsFound >= max) break;
        
        try {
          // Click on the listing to get details
          await listing.click();
          await page.waitForTimeout(delay);
          
          // Extract data from the detail panel
          const data = await page.evaluate(() => {
            const getName = () => {
              const h1 = document.querySelector('h1.DUwDvf');
              return h1?.textContent?.trim() || '';
            };
            
            const getPhone = () => {
              const phoneButton = document.querySelector('button[data-item-id^="phone:"]');
              if (phoneButton) {
                const phoneText = phoneButton.getAttribute('data-item-id');
                return phoneText?.replace('phone:tel:', '') || '';
              }
              // Try aria-label
              const phoneEl = document.querySelector('button[aria-label*="Phone:"]');
              if (phoneEl) {
                const label = phoneEl.getAttribute('aria-label');
                const match = label?.match(/Phone:\s*([\d\s\-\(\)\+]+)/);
                return match ? match[1].trim() : '';
              }
              return '';
            };
            
            const getWebsite = () => {
              const websiteLink = document.querySelector('a[data-item-id="authority"]');
              return websiteLink?.href || '';
            };
            
            const getAddress = () => {
              const addressButton = document.querySelector('button[data-item-id="address"]');
              if (addressButton) {
                return addressButton.getAttribute('aria-label')?.replace('Address: ', '') || '';
              }
              return '';
            };
            
            const getRating = () => {
              const ratingEl = document.querySelector('div.F7nice span[aria-hidden="true"]');
              return ratingEl?.textContent?.trim() || '';
            };
            
            return {
              name: getName(),
              phone: getPhone(),
              website: getWebsite(),
              address: getAddress(),
              rating: getRating()
            };
          });
          
          if (!data.name || seenNames.has(data.name)) continue;
          seenNames.add(data.name);
          
          // Parse address components
          let city = '', state = '', postalCode = '', streetAddress = '';
          if (data.address) {
            // Try to parse "123 Main St, Austin, TX 78701"
            const parts = data.address.split(',').map(p => p.trim());
            if (parts.length >= 3) {
              streetAddress = parts[0];
              city = parts[parts.length - 2];
              const stateZip = parts[parts.length - 1];
              const stateZipMatch = stateZip.match(/([A-Z]{2})\s*(\d{5})?/);
              if (stateZipMatch) {
                state = stateZipMatch[1];
                postalCode = stateZipMatch[2] || '';
              }
            } else if (parts.length === 2) {
              streetAddress = parts[0];
              const stateZipMatch = parts[1].match(/([A-Z]{2})\s*(\d{5})?/);
              if (stateZipMatch) {
                state = stateZipMatch[1];
                postalCode = stateZipMatch[2] || '';
              }
            }
          }
          
          // Normalize phone
          let phone_e164 = '';
          const notes = [];
          
          if (data.phone) {
            const phoneResult = normalizePhone(data.phone, 'US');
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
          
          if (data.rating) {
            notes.push(`rating:${data.rating}`);
          }
          
          resultsFound++;
          logger.updateStat('totalFound');
          logger.info(`[${resultsFound}/${max}] ${data.name}`);
          
          yield {
            clinic_name: data.name,
            owner_name: '',
            phone: data.phone,
            phone_e164,
            email: '',
            website: data.website,
            address: streetAddress,
            city,
            state,
            postal_code: postalCode,
            country: 'US',
            timezone: getTimezoneForState(state),
            source_url: page.url(),
            notes: notes.join('; ')
          };
          
        } catch (err) {
          logger.debug(`Error extracting listing: ${err.message}`);
        }
      }
      
      // Scroll down to load more results
      await page.evaluate(() => {
        const feed = document.querySelector('div[role="feed"]');
        if (feed) feed.scrollTop = feed.scrollHeight;
      });
      
      await page.waitForTimeout(2000);
      scrollAttempts++;
    }
    
    logger.info(`Google Maps scraping complete. Found ${resultsFound} clinics.`);
    
  } catch (error) {
    logger.error(`Google Maps scraper error: ${error.message}`);
    throw error;
  } finally {
    await page.close();
  }
}

export default scrapeGoogleMaps;
