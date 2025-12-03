/**
 * Visit and Extract module - Handles page fetching and data extraction
 * Uses Playwright for headless browsing with anti-detection measures
 */
import { chromium } from 'playwright';
import { isAllowedByRobots, getCrawlDelay } from './robotsChecker.js';
import { normalizePhone, extractPhoneNumbers, extractEmails } from '../utils/phoneUtils.js';
import fs from 'fs';

// User agent rotation pool
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

// Captcha detection patterns
const CAPTCHA_PATTERNS = [
  /captcha/i,
  /recaptcha/i,
  /hcaptcha/i,
  /cloudflare/i,
  /challenge-running/i,
  /please verify/i,
  /are you a robot/i,
  /suspicious activity/i,
  /access denied/i
];

// Email extraction regex
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

let browserInstance = null;
let userAgentIndex = 0;

/**
 * Get next user agent from rotation pool
 * @returns {string}
 */
function getNextUserAgent() {
  const ua = USER_AGENTS[userAgentIndex];
  userAgentIndex = (userAgentIndex + 1) % USER_AGENTS.length;
  return ua;
}

/**
 * Initialize browser instance
 * @param {object} options
 * @returns {Promise<Browser>}
 */
export async function initBrowser(options = {}) {
  if (browserInstance) {
    return browserInstance;
  }

  const launchOptions = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu'
    ]
  };

  // Add proxy if provided
  if (options.proxy) {
    launchOptions.proxy = {
      server: options.proxy
    };
  }

  browserInstance = await chromium.launch(launchOptions);
  return browserInstance;
}

/**
 * Close browser instance
 */
export async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * Check if page contains captcha or anti-bot measures
 * @param {Page} page
 * @returns {Promise<boolean>}
 */
async function detectCaptcha(page) {
  try {
    const content = await page.content();
    const url = page.url();
    
    // Check URL patterns
    if (url.includes('captcha') || url.includes('challenge')) {
      return true;
    }
    
    // Check page content
    for (const pattern of CAPTCHA_PATTERNS) {
      if (pattern.test(content)) {
        return true;
      }
    }
    
    // Check for reCAPTCHA iframe
    const recaptcha = await page.$('iframe[src*="recaptcha"]');
    if (recaptcha) {
      return true;
    }
    
    return false;
  } catch (err) {
    return false;
  }
}

/**
 * Extract email addresses from page content
 * @param {Page} page
 * @returns {Promise<string|null>}
 */
async function extractEmail(page) {
  try {
    const content = await page.content();
    const matches = content.match(EMAIL_REGEX);
    
    if (matches && matches.length > 0) {
      // Filter out common non-contact emails
      const filtered = matches.filter(email => {
        const lower = email.toLowerCase();
        return !lower.includes('example.com') &&
               !lower.includes('domain.com') &&
               !lower.includes('email.com') &&
               !lower.includes('sentry.io') &&
               !lower.includes('wixpress.com') &&
               !lower.endsWith('.png') &&
               !lower.endsWith('.jpg');
      });
      
      return filtered[0] || null;
    }
    
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Try to enrich data by visiting contact pages
 * @param {Page} page
 * @param {string} baseUrl
 * @returns {Promise<{ email: string|null }>}
 */
async function enrichFromContactPage(page, baseUrl) {
  const contactPaths = ['/contact', '/contact-us', '/about', '/about-us'];
  let email = null;
  
  for (const path of contactPaths) {
    try {
      const contactUrl = new URL(path, baseUrl).href;
      await page.goto(contactUrl, { waitUntil: 'networkidle', timeout: 10000 });
      email = await extractEmail(page);
      if (email) break;
    } catch (err) {
      // Continue to next path
    }
  }
  
  return { email };
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
 * Visit a URL and extract clinic data
 * @param {string} url - URL to visit
 * @param {object} options - Options for extraction
 * @param {object} logger - Logger instance
 * @returns {Promise<object>} Extracted data
 */
export async function visitAndExtract(url, options = {}, logger = null) {
  const {
    delay = 1500,
    retries = 2,
    enrich = false,
    proxy = null,
    defaultCountry = 'US'
  } = options;

  const log = logger ? (msg) => logger.debug(msg) : console.log;
  
  // Check robots.txt
  const allowed = await isAllowedByRobots(url);
  if (!allowed) {
    log(`Robots.txt disallows: ${url}`);
    if (logger) logger.updateStat('skipped');
    return { source_url: url, notes: 'robots.txt-blocked' };
  }

  // Check for crawl delay in robots.txt
  const robotsDelay = await getCrawlDelay(url);
  const actualDelay = robotsDelay ? Math.max(delay, robotsDelay * 1000) : delay;

  let lastError = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const browser = await initBrowser({ proxy });
      const context = await browser.newContext({
        userAgent: getNextUserAgent(),
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US'
      });
      
      const page = await context.newPage();
      
      // Set timeout and navigation
      page.setDefaultTimeout(30000);
      
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      
      // Wait for delay
      await new Promise(resolve => setTimeout(resolve, actualDelay));
      
      // Check for captcha
      if (await detectCaptcha(page)) {
        await context.close();
        if (attempt === retries) {
          log(`Captcha detected after ${retries + 1} attempts: ${url}`);
          if (logger) logger.updateStat('captchaBlocked');
          return { source_url: url, notes: 'captcha-blocked' };
        }
        // Wait longer before retry
        await new Promise(resolve => setTimeout(resolve, actualDelay * 2));
        continue;
      }
      
      // Extract data from page
      const data = await page.evaluate(() => {
        const getText = (selectors) => {
          for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el && el.textContent) {
              return el.textContent.trim();
            }
          }
          return null;
        };
        
        const getHref = (selectors) => {
          for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el && el.href) {
              return el.href;
            }
          }
          return null;
        };
        
        // Try multiple selectors for each field
        return {
          clinic_name: getText([
            'h1', '.business-name', '.biz-name', '[data-testid="business-name"]',
            '.listing-title', '.company-name', '[itemprop="name"]'
          ]),
          phone: getText([
            '[href^="tel:"]', '.phone', '.biz-phone', '[data-testid="phone"]',
            '[itemprop="telephone"]', '.telephone', '.contact-phone', 'a[href^="tel"]'
          ]),
          website: getHref([
            '[data-testid="website"]', '.website-link', '.biz-website a',
            '[rel="nofollow"][href^="http"]', '[itemprop="url"]'
          ]),
          address: getText([
            '[itemprop="streetAddress"]', '.street-address', '.address',
            '[data-testid="address"]', '.biz-address'
          ]),
          city: getText([
            '[itemprop="addressLocality"]', '.locality', '.city'
          ]),
          state: getText([
            '[itemprop="addressRegion"]', '.region', '.state'
          ]),
          postal_code: getText([
            '[itemprop="postalCode"]', '.postal-code', '.zip'
          ]),
          full_address: getText([
            '.address', '[itemprop="address"]', '.full-address', '.location-address'
          ])
        };
      });
      
      // Extract email
      let email = await extractEmail(page);
      
      // Try enrichment from contact page
      if (enrich && !email && data.website) {
        const enriched = await enrichFromContactPage(page, data.website);
        email = enriched.email;
      }
      
      await context.close();
      
      // Parse full address if individual fields are missing
      if (data.full_address && (!data.city || !data.state)) {
        const addressParts = data.full_address.split(',').map(s => s.trim());
        if (addressParts.length >= 2) {
          const lastPart = addressParts[addressParts.length - 1];
          const stateZip = lastPart.match(/([A-Z]{2})\s*(\d{5})?/);
          if (stateZip) {
            data.state = data.state || stateZip[1];
            data.postal_code = data.postal_code || stateZip[2];
          }
          if (addressParts.length >= 2) {
            data.city = data.city || addressParts[addressParts.length - 2];
          }
          if (!data.address && addressParts.length >= 3) {
            data.address = addressParts.slice(0, -2).join(', ');
          }
        }
      }
      
      // Normalize phone
      let phone_e164 = '';
      let notes = [];
      
      if (data.phone) {
        // Clean phone from href if needed
        let rawPhone = data.phone.replace(/^tel:/, '').trim();
        const phoneResult = normalizePhone(rawPhone, defaultCountry);
        
        if (phoneResult.isValid) {
          phone_e164 = phoneResult.normalized;
          if (logger) logger.updateStat('validPhones');
        } else {
          notes.push('invalid phone');
          if (logger) logger.updateStat('invalidPhones');
        }
      } else {
        notes.push('no phone');
        if (logger) logger.updateStat('noPhone');
      }
      
      // Add email enriched note
      if (email && enrich) {
        notes.push('email-enriched');
      }
      
      // Get timezone
      const timezone = getTimezoneForState(data.state);
      
      return {
        clinic_name: data.clinic_name || '',
        owner_name: '', // Usually requires deeper extraction
        phone: data.phone || '',
        phone_e164: phone_e164 || '',
        email: email || '',
        website: data.website || '',
        address: data.address || '',
        city: data.city || '',
        state: data.state || '',
        postal_code: data.postal_code || '',
        country: defaultCountry,
        timezone,
        source_url: url,
        notes: notes.join('; ')
      };
      
    } catch (err) {
      lastError = err;
      log(`Attempt ${attempt + 1} failed for ${url}: ${err.message}`);
      
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, actualDelay * (attempt + 1)));
      }
    }
  }
  
  // All retries failed
  if (logger) logger.error(`Failed to extract from ${url}: ${lastError?.message}`);
  return {
    source_url: url,
    notes: `error: ${lastError?.message || 'unknown'}`
  };
}

export default { initBrowser, closeBrowser, visitAndExtract };
