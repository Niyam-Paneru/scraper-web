/**
 * Real Email Scraper Service
 * 
 * Actually visits websites and scrapes for real email addresses
 * instead of letting AI guess/generate fake emails
 */

import { chromium } from 'playwright';

class EmailScraperService {
  constructor() {
    this.browser = null;
    this.emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    // Common fake/placeholder emails to filter out
    this.fakeEmailPatterns = [
      /^example@/i,
      /^test@/i,
      /^your@/i,
      /^email@/i,
      /^name@/i,
      /^user@/i,
      /@example\./i,
      /@test\./i,
      /@yoursite\./i,
      /@yourdomain\./i,
      /@domain\./i,
      /placeholder/i,
      /sentry\.io/i,
      /wixpress\.com/i,
      /mailchimp/i,
      /@sentry-next/i,
    ];
  }

  /**
   * Initialize browser if not already running
   */
  async initBrowser() {
    if (!this.browser) {
      try {
        this.browser = await chromium.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
      } catch (err) {
        console.error('Failed to launch browser:', err.message);
        throw new Error('Browser initialization failed. Playwright may need to be installed: npx playwright install chromium');
      }
    }
    return this.browser;
  }

  /**
   * Close browser
   */
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Check if email looks fake/placeholder
   */
  isLikelyFakeEmail(email) {
    return this.fakeEmailPatterns.some(pattern => pattern.test(email));
  }

  /**
   * Extract domain from URL
   */
  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return null;
    }
  }

  /**
   * Score email relevance (higher = better)
   */
  scoreEmail(email, clinicName, domain) {
    let score = 0;
    const emailLower = email.toLowerCase();
    const clinicLower = (clinicName || '').toLowerCase();
    
    // Bonus for common contact prefixes
    if (/^(info|contact|appointments?|office|hello|admin|reception|frontdesk|scheduling)@/i.test(email)) {
      score += 30;
    }
    
    // Bonus if email domain matches website domain
    if (domain) {
      const emailDomain = email.split('@')[1]?.toLowerCase();
      if (emailDomain === domain.toLowerCase()) {
        score += 50;
      }
    }
    
    // Bonus for dental-related terms
    if (/dental|dentist|tooth|smile|oral|orthodon/i.test(email)) {
      score += 20;
    }
    
    // Penalty for generic free email providers (less likely to be business)
    if (/@(gmail|yahoo|hotmail|outlook|aol|icloud)\.com$/i.test(email)) {
      score -= 10;
    }
    
    // Penalty for very long emails (often auto-generated)
    if (email.length > 40) {
      score -= 15;
    }
    
    return score;
  }

  /**
   * Scrape a single website for email addresses
   */
  async scrapeWebsite(url, clinicName = '') {
    if (!url || url.includes('maps.google.com') || url.includes('goo.gl')) {
      return { emails: [], error: 'Invalid or unsupported URL' };
    }

    // Ensure URL has protocol
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }

    const browser = await this.initBrowser();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 }
    });
    
    const page = await context.newPage();
    const foundEmails = new Set();
    const domain = this.extractDomain(url);
    
    try {
      // Set timeout and navigate
      await page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: 15000 
      });

      // Wait a bit for dynamic content
      await page.waitForTimeout(2000);

      // Method 1: Get all mailto: links
      const mailtoLinks = await page.$$eval('a[href^="mailto:"]', links => 
        links.map(a => a.href.replace('mailto:', '').split('?')[0].trim())
      );
      mailtoLinks.forEach(email => {
        if (email && this.emailRegex.test(email)) {
          foundEmails.add(email.toLowerCase());
        }
      });

      // Method 2: Search page text content
      const pageText = await page.evaluate(() => document.body.innerText);
      const textEmails = pageText.match(this.emailRegex) || [];
      textEmails.forEach(email => foundEmails.add(email.toLowerCase()));

      // Method 3: Check common contact pages
      const contactPages = ['contact', 'contact-us', 'about', 'about-us', 'team'];
      for (const pageName of contactPages) {
        try {
          const contactUrl = new URL(pageName, url).href;
          await page.goto(contactUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
          await page.waitForTimeout(1000);
          
          // Get mailto links
          const moreMailto = await page.$$eval('a[href^="mailto:"]', links => 
            links.map(a => a.href.replace('mailto:', '').split('?')[0].trim())
          );
          moreMailto.forEach(email => {
            if (email && /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(email)) {
              foundEmails.add(email.toLowerCase());
            }
          });
          
          // Search text
          const contactText = await page.evaluate(() => document.body.innerText);
          const moreEmails = contactText.match(this.emailRegex) || [];
          moreEmails.forEach(email => foundEmails.add(email.toLowerCase()));
          
        } catch {
          // Contact page doesn't exist, skip
        }
      }

      await context.close();

      // Filter out fake emails and score the rest
      const validEmails = Array.from(foundEmails)
        .filter(email => !this.isLikelyFakeEmail(email))
        .map(email => ({
          email,
          score: this.scoreEmail(email, clinicName, domain)
        }))
        .sort((a, b) => b.score - a.score);

      return {
        emails: validEmails.map(e => e.email),
        bestEmail: validEmails.length > 0 ? validEmails[0].email : null,
        scrapedUrl: url,
        pagesChecked: contactPages.length + 1
      };

    } catch (err) {
      await context.close();
      console.error(`Scrape error for ${url}:`, err.message);
      return {
        emails: [],
        bestEmail: null,
        error: err.message,
        scrapedUrl: url
      };
    }
  }

  /**
   * Detect if website has chatbot/live chat
   */
  async detectChatbot(url) {
    if (!url || url.includes('maps.google.com')) {
      return { hasChatbot: false };
    }

    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }

    const browser = await this.initBrowser();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(3000); // Wait for chat widgets to load

      const pageHtml = await page.content();
      const pageText = pageHtml.toLowerCase();

      // Common chatbot/live chat indicators
      const chatIndicators = [
        { name: 'Intercom', patterns: ['intercom', 'intercomcdn'] },
        { name: 'Drift', patterns: ['drift.com', 'driftt.com', 'js.driftt'] },
        { name: 'LiveChat', patterns: ['livechatinc', 'livechat'] },
        { name: 'Zendesk', patterns: ['zendesk', 'zopim'] },
        { name: 'Tidio', patterns: ['tidio', 'tidiochat'] },
        { name: 'HubSpot', patterns: ['hubspot', 'hs-scripts'] },
        { name: 'Freshdesk', patterns: ['freshdesk', 'freshchat'] },
        { name: 'Crisp', patterns: ['crisp.chat', 'crisp.im'] },
        { name: 'Tawk.to', patterns: ['tawk.to', 'embed.tawk'] },
        { name: 'Facebook Messenger', patterns: ['facebook.com/customer_chat', 'fb-customerchat'] },
        { name: 'WhatsApp', patterns: ['whatsapp', 'wa.me'] },
        { name: 'Podium', patterns: ['podium'] },
        { name: 'Weave', patterns: ['getweave.com'] },
        { name: 'Birdeye', patterns: ['birdeye'] },
        { name: 'Generic Chat', patterns: ['chat-widget', 'live-chat', 'chatbot', 'chat-button'] }
      ];

      let detectedChat = null;
      for (const indicator of chatIndicators) {
        if (indicator.patterns.some(p => pageText.includes(p))) {
          detectedChat = indicator.name;
          break;
        }
      }

      // Check for online booking systems
      const bookingIndicators = [
        { name: 'Dentrix', patterns: ['dentrix'] },
        { name: 'OpenDental', patterns: ['opendental'] },
        { name: 'Zocdoc', patterns: ['zocdoc'] },
        { name: 'LocalMed', patterns: ['localmed'] },
        { name: 'NexHealth', patterns: ['nexhealth'] },
        { name: 'Weave', patterns: ['getweave'] },
        { name: 'Lighthouse 360', patterns: ['lh360', 'lighthouse360'] },
        { name: 'Generic Booking', patterns: ['book-appointment', 'schedule-appointment', 'book-online', 'schedule-online', 'request-appointment'] }
      ];

      let detectedBooking = null;
      for (const indicator of bookingIndicators) {
        if (indicator.patterns.some(p => pageText.includes(p))) {
          detectedBooking = indicator.name;
          break;
        }
      }

      await context.close();

      return {
        hasChatbot: !!detectedChat,
        chatbotType: detectedChat,
        hasOnlineBooking: !!detectedBooking,
        bookingSystem: detectedBooking
      };

    } catch (err) {
      await context.close();
      return {
        hasChatbot: false,
        error: err.message
      };
    }
  }

  /**
   * Full enrichment: emails + chatbot detection
   */
  async enrichClinic(clinic) {
    const website = clinic.website;
    
    if (!website || website.includes('maps.google.com') || website.includes('goo.gl')) {
      return {
        email: null,
        emails_found: [],
        has_chatbot: false,
        chatbot_type: null,
        has_online_booking: false,
        booking_system: null,
        error: 'No valid website to scrape'
      };
    }

    try {
      // Run both scrapes
      const [emailResult, chatResult] = await Promise.all([
        this.scrapeWebsite(website, clinic.clinic_name || clinic.name),
        this.detectChatbot(website)
      ]);

      return {
        email: emailResult.bestEmail,
        emails_found: emailResult.emails || [],
        has_chatbot: chatResult.hasChatbot || false,
        chatbot_type: chatResult.chatbotType || null,
        has_online_booking: chatResult.hasOnlineBooking || false,
        booking_system: chatResult.bookingSystem || null,
        scraped_from: website,
        scrape_error: emailResult.error || chatResult.error || null
      };
    } catch (err) {
      return {
        email: null,
        emails_found: [],
        has_chatbot: false,
        error: err.message
      };
    }
  }
}

// Singleton instance
const emailScraper = new EmailScraperService();

export default emailScraper;
