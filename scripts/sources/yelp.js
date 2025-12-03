/**
 * Yelp Source Handler
 * Scrapes dental clinic listings from Yelp
 */
import { chromium } from 'playwright';
import { visitAndExtract, initBrowser, closeBrowser } from '../lib/visitAndExtract.js';
import { isAllowedByRobots } from '../lib/robotsChecker.js';

const YELP_BASE_URL = 'https://www.yelp.com';

/**
 * Build Yelp search URL
 * @param {string} location
 * @param {number} start - Starting result index
 * @returns {string}
 */
function buildSearchUrl(location, start = 0) {
  const encodedLocation = encodeURIComponent(location);
  return `${YELP_BASE_URL}/search?find_desc=dentist&find_loc=${encodedLocation}&start=${start}`;
}

/**
 * Extract result URLs from Yelp search page
 * @param {Page} page
 * @returns {Promise<string[]>}
 */
async function extractResultUrls(page) {
  return page.evaluate(() => {
    const links = [];
    const selectors = [
      'a[href*="/biz/"][data-testid="serp-ia-title"]',
      'a.css-19v1rkv[href*="/biz/"]',
      'h3 a[href*="/biz/"]',
      '[class*="businessName"] a[href*="/biz/"]'
    ];
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        if (el.href && el.href.includes('/biz/') && !links.includes(el.href)) {
          // Clean URL - remove query params
          const url = new URL(el.href);
          links.push(`${url.origin}${url.pathname}`);
        }
      });
      if (links.length > 0) break;
    }
    
    return links;
  });
}

/**
 * Check if there are more pages
 * @param {Page} page
 * @returns {Promise<boolean>}
 */
async function hasNextPage(page) {
  return page.evaluate(() => {
    const nextBtn = document.querySelector('[aria-label="Next"]');
    return nextBtn && !nextBtn.disabled;
  });
}

/**
 * Scrape Yelp for dental clinics
 * @param {object} options
 * @param {string} options.location - Location to search
 * @param {number} options.max - Maximum results
 * @param {number} options.delay - Delay between requests (ms)
 * @param {number} options.concurrency - Not used for Yelp (serial scraping)
 * @param {boolean} options.enrich - Whether to enrich data
 * @param {string} options.proxy - Proxy server URL
 * @param {object} logger - Logger instance
 * @returns {AsyncGenerator<object>}
 */
export async function* scrapeYelp(options, logger) {
  const {
    location,
    max = 200,
    delay = 1500,
    enrich = false,
    proxy = null
  } = options;

  logger.info(`Starting Yelp scrape for "${location}" (max: ${max})`);
  logger.warn('⚠️  Yelp may block automated access. Consider using Google Places API for reliable results.');

  // Check robots.txt
  const allowed = await isAllowedByRobots(`${YELP_BASE_URL}/search`);
  if (!allowed) {
    logger.error('Yelp robots.txt disallows scraping search pages');
    return;
  }

  const browser = await initBrowser({ proxy });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  const collectedUrls = new Set();
  let pageNum = 0;
  const resultsPerPage = 10;

  try {
    while (collectedUrls.size < max) {
      const start = pageNum * resultsPerPage;
      const searchUrl = buildSearchUrl(location, start);
      
      logger.info(`Fetching Yelp page ${pageNum + 1}: ${searchUrl}`);
      
      try {
        await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
        
        // Check for captcha/blocking
        const content = await page.content();
        if (content.includes('captcha') || content.includes('unusual traffic')) {
          logger.error('Yelp blocked access (captcha detected). Try using a proxy or Google Places API.');
          break;
        }
        
        // Wait for results to load
        await page.waitForTimeout(delay);
        
        const urls = await extractResultUrls(page);
        
        if (urls.length === 0) {
          logger.info('No more results found');
          break;
        }
        
        // Add new URLs
        let newCount = 0;
        for (const url of urls) {
          if (!collectedUrls.has(url) && collectedUrls.size < max) {
            collectedUrls.add(url);
            newCount++;
          }
        }
        
        logger.info(`Found ${newCount} new listings (total: ${collectedUrls.size})`);
        
        // Check if we should continue
        if (!await hasNextPage(page) || collectedUrls.size >= max) {
          break;
        }
        
        pageNum++;
        
        // Respectful delay between pages
        await page.waitForTimeout(delay);
        
      } catch (err) {
        logger.error(`Error fetching Yelp page: ${err.message}`);
        break;
      }
    }
    
    await context.close();
    
    // Now visit each collected URL and extract data
    logger.info(`Extracting data from ${collectedUrls.size} listings...`);
    
    let processed = 0;
    for (const url of collectedUrls) {
      try {
        logger.progress(processed + 1, collectedUrls.size, url.split('/biz/')[1]?.substring(0, 30) || '');
        
        const data = await visitAndExtract(url, {
          delay,
          retries: 2,
          enrich,
          proxy,
          defaultCountry: 'US'
        }, logger);
        
        logger.updateStat('totalFound');
        yield data;
        
        processed++;
        
        // Delay between extractions
        await new Promise(resolve => setTimeout(resolve, delay));
        
      } catch (err) {
        logger.error(`Error extracting ${url}: ${err.message}`);
      }
    }
    
  } finally {
    // Don't close browser here - let main script handle it
  }
}

export default { scrapeYelp };
