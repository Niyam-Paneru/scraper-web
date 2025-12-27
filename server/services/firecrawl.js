/**
 * Firecrawl Service
 * Fast web scraping API for extracting emails and contact info
 * 
 * Get API key from: https://firecrawl.dev
 */

class FirecrawlService {
  constructor() {
    this.apiKey = process.env.FIRECRAWL_API_KEY;
    this.baseUrl = 'https://api.firecrawl.dev/v1';
  }

  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Scrape a single URL for content
   */
  async scrapeUrl(url, options = {}) {
    if (!this.apiKey) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }

    const response = await fetch(`${this.baseUrl}/scrape`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        ...options
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Firecrawl error: ${error}`);
    }

    return response.json();
  }

  /**
   * Extract emails from a website
   */
  async extractEmails(url) {
    try {
      const result = await this.scrapeUrl(url);
      const content = result.data?.markdown || result.data?.html || '';
      
      // Extract emails using regex
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emails = [...new Set(content.match(emailRegex) || [])];
      
      // Filter out fake/generic emails
      const realEmails = emails.filter(email => {
        const lower = email.toLowerCase();
        return !lower.includes('example') &&
               !lower.includes('test@') &&
               !lower.includes('your@') &&
               !lower.includes('email@') &&
               !lower.includes('sentry') &&
               !lower.includes('wix') &&
               !lower.includes('wordpress');
      });

      return {
        success: true,
        emails: realEmails,
        bestEmail: realEmails[0] || null,
        source: url
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        emails: [],
        bestEmail: null
      };
    }
  }

  /**
   * Crawl a website to find contact page and extract info
   */
  async crawlForContact(url, maxPages = 5) {
    if (!this.apiKey) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }

    // Start crawl job
    const response = await fetch(`${this.baseUrl}/crawl`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url,
        limit: maxPages,
        scrapeOptions: {
          formats: ['markdown'],
          onlyMainContent: true
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Firecrawl crawl error: ${response.status}`);
    }

    const { id } = await response.json();
    
    // Poll for results
    let attempts = 0;
    while (attempts < 30) {
      await new Promise(r => setTimeout(r, 2000));
      
      const statusRes = await fetch(`${this.baseUrl}/crawl/${id}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      
      const status = await statusRes.json();
      
      if (status.status === 'completed') {
        // Extract all emails from crawled pages
        const allEmails = new Set();
        for (const page of status.data || []) {
          const content = page.markdown || '';
          const emails = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
          emails.forEach(e => allEmails.add(e.toLowerCase()));
        }
        
        return {
          success: true,
          emails: [...allEmails],
          pagesScraped: status.data?.length || 0
        };
      }
      
      if (status.status === 'failed') {
        throw new Error('Crawl failed');
      }
      
      attempts++;
    }

    throw new Error('Crawl timeout');
  }
}

export default new FirecrawlService();
