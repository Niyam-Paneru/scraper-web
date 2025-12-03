/**
 * YellowPages Source Handler
 * Scrapes dental clinic listings from YellowPages
 */
import { chromium } from 'playwright';
import { visitAndExtract, initBrowser, closeBrowser } from '../lib/visitAndExtract.js';
import { isAllowedByRobots } from '../lib/robotsChecker.js';
import { normalizePhone } from '../utils/phoneUtils.js';

const YP_BASE_URL = 'https://www.yellowpages.com';

/**
 * Build YellowPages search URL
 * @param {string} location
 * @param {number} page - Page number (1-indexed)
 * @returns {string}
 */
function buildSearchUrl(location, page = 1) {
  // YellowPages expects location in format: city-state or zip
  const formattedLocation = location
    .toLowerCase()
    .replace(/,\s*/g, '-')
    .replace(/\s+/g, '-');
  
  return `${YP_BASE_URL}/search?search_terms=dentist&geo_location_terms=${encodeURIComponent(location)}&page=${page}`;
}

/**
 * Extract listings directly from YellowPages search page
 * @param {Page} page
 * @returns {Promise<object[]>}
 */
async function extractListings(page) {
  return page.evaluate(() => {
    const listings = [];
    
    // Try multiple selector patterns
    const resultCards = document.querySelectorAll('.result, .organic, .srp-listing, [class*="BusinessCard"]');
    
    resultCards.forEach(card => {
      try {
        const listing = {};
        
        // Business name
        const nameEl = card.querySelector('.business-name, .n a, h2 a, [class*="businessName"]');
        listing.clinic_name = nameEl?.textContent?.trim() || '';
        
        // Detail page URL
        const linkEl = card.querySelector('a.business-name, .n a, h2 a');
        listing.detail_url = linkEl?.href || '';
        
        // Phone
        const phoneEl = card.querySelector('.phones, .phone, [class*="phone"]');
        listing.phone = phoneEl?.textContent?.trim() || '';
        
        // Address
        const streetEl = card.querySelector('.street-address, .adr .street-address');
        const localityEl = card.querySelector('.locality');
        
        listing.address = streetEl?.textContent?.trim() || '';
        
        if (localityEl) {
          const localityText = localityEl.textContent.trim();
          const parts = localityText.split(',').map(s => s.trim());
          if (parts.length >= 1) listing.city = parts[0];
          if (parts.length >= 2) {
            const stateZip = parts[1].match(/([A-Z]{2})\s*(\d{5})?/);
            if (stateZip) {
              listing.state = stateZip[1];
              listing.postal_code = stateZip[2] || '';
            }
          }
        }
        
        // Website (if visible)
        const websiteEl = card.querySelector('a.track-visit-website, a[href*="website"]');
        listing.website = websiteEl?.href || '';
        
        if (listing.clinic_name || listing.phone) {
          listings.push(listing);
        }
      } catch (err) {
        // Skip malformed listing
      }
    });
    
    return listings;
  });
}

/**
 * Check if there are more pages
 * @param {Page} page
 * @returns {Promise<boolean>}
 */
async function hasNextPage(page) {
  return page.evaluate(() => {
    const nextLink = document.querySelector('.pagination a.next, a[rel="next"], .next-page');
    return !!nextLink;
  });
}

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
 * Scrape YellowPages for dental clinics
 * @param {object} options
 * @param {string} options.location - Location to search
 * @param {number} options.max - Maximum results
 * @param {number} options.delay - Delay between requests (ms)
 * @param {boolean} options.enrich - Whether to enrich data
 * @param {string} options.proxy - Proxy server URL
 * @param {object} logger - Logger instance
 * @returns {AsyncGenerator<object>}
 */
export async function* scrapeYellowPages(options, logger) {
  const {
    location,
    max = 200,
    delay = 1500,
    enrich = false,
    proxy = null
  } = options;

  logger.info(`Starting YellowPages scrape for "${location}" (max: ${max})`);
  
  // Check robots.txt
  const allowed = await isAllowedByRobots(`${YP_BASE_URL}/search`);
  if (!allowed) {
    logger.warn('YellowPages robots.txt may restrict scraping - proceeding with caution');
  }

  const browser = await initBrowser({ proxy });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  const allListings = [];
  let pageNum = 1;

  try {
    while (allListings.length < max) {
      const searchUrl = buildSearchUrl(location, pageNum);
      
      logger.info(`Fetching YellowPages page ${pageNum}: ${searchUrl}`);
      
      try {
        await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
        
        // Check for blocking
        const content = await page.content();
        if (content.includes('captcha') || content.includes('blocked')) {
          logger.error('YellowPages blocked access. Try using a proxy.');
          break;
        }
        
        // Wait for results
        await page.waitForTimeout(delay);
        
        const listings = await extractListings(page);
        
        if (listings.length === 0) {
          logger.info('No more results found');
          break;
        }
        
        // Add listings up to max
        for (const listing of listings) {
          if (allListings.length < max) {
            allListings.push(listing);
          }
        }
        
        logger.info(`Found ${listings.length} listings (total: ${allListings.length})`);
        
        // Check if we should continue
        if (!await hasNextPage(page) || allListings.length >= max) {
          break;
        }
        
        pageNum++;
        
        // Respectful delay
        await page.waitForTimeout(delay);
        
      } catch (err) {
        logger.error(`Error fetching YellowPages: ${err.message}`);
        break;
      }
    }
    
    await context.close();
    
    // Process collected listings
    logger.info(`Processing ${allListings.length} listings...`);
    
    let processed = 0;
    for (const listing of allListings) {
      logger.progress(processed + 1, allListings.length, listing.clinic_name?.substring(0, 30) || '');
      
      // Normalize phone
      let phone_e164 = '';
      let notes = [];
      
      if (listing.phone) {
        const phoneResult = normalizePhone(listing.phone, 'US');
        if (phoneResult.isValid) {
          phone_e164 = phoneResult.normalized;
          logger.updateStat('validPhones');
        } else {
          notes.push(phoneResult.error);
          logger.updateStat('invalidPhones');
        }
      } else {
        notes.push('no phone');
        logger.updateStat('noPhone');
      }
      
      // Get timezone
      const timezone = getTimezoneForState(listing.state);
      
      logger.updateStat('totalFound');
      
      yield {
        clinic_name: listing.clinic_name || '',
        owner_name: '',
        phone: listing.phone || '',
        phone_e164,
        email: '',
        website: listing.website || '',
        address: listing.address || '',
        city: listing.city || '',
        state: listing.state || '',
        postal_code: listing.postal_code || '',
        country: 'US',
        timezone,
        source_url: listing.detail_url || YP_BASE_URL,
        notes: notes.join('; ')
      };
      
      processed++;
      
      // Small delay between processing
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
  } finally {
    // Browser cleanup handled by main script
  }
}

export default { scrapeYellowPages };
