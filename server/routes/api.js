/**
 * API Routes for Dental Scraper
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { scrapeYelp } from '../../scripts/sources/yelp.js';
import { scrapeYellowPages } from '../../scripts/sources/yellowpages.js';
import { scrapeGooglePlaces } from '../../scripts/sources/places.js';
import { scrapeGoogleMaps } from '../../scripts/sources/googlemaps.js';
import { scrapeGeminiMaps } from '../../scripts/sources/gemini-maps.js';
import { closeBrowser } from '../../scripts/lib/visitAndExtract.js';
import Logger from '../../scripts/lib/logger.js';
import usageTracker from '../services/apiUsageTracker.js';

const router = express.Router();

// In-memory job storage (in production, use a database)
const jobs = new Map();

/**
 * GET /api/status
 * Check server status and configuration
 */
router.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    hasGooglePlacesKey: !!process.env.GOOGLE_PLACES_KEY,
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    availableSources: ['gemini-maps', 'googlemaps', 'yelp', 'yellowpages', 'places'],
    recommendedSource: process.env.GEMINI_API_KEY ? 'gemini-maps' : 'googlemaps',
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /api/scrape
 * Start a new scraping job
 */
router.post('/scrape', async (req, res) => {
  const { source = 'yelp', location, max = 50, delay = 1500, enrich = false, webhookUrl } = req.body;

  if (!location) {
    return res.status(400).json({ error: 'Location is required' });
  }

  // Create job
  const jobId = uuidv4();
  const job = {
    id: jobId,
    status: 'running',
    source,
    location,
    max,
    createdAt: new Date().toISOString(),
    results: [],
    stats: {
      total: 0,
      validPhones: 0,
      invalidPhones: 0,
      withEmail: 0
    },
    error: null
  };

  jobs.set(jobId, job);

  // Return immediately with job ID
  res.json({ jobId, message: 'Scraping started' });

  // Run scraper in background
  runScraper(jobId, { source, location, max, delay, enrich, webhookUrl });
});

/**
 * GET /api/jobs
 * List all jobs
 */
router.get('/jobs', (req, res) => {
  const jobList = Array.from(jobs.values())
    .map(j => ({
      id: j.id,
      status: j.status,
      source: j.source,
      location: j.location,
      resultCount: j.results.length,
      createdAt: j.createdAt
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json(jobList);
});

/**
 * GET /api/jobs/:id
 * Get job details and results
 */
router.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json(job);
});

/**
 * GET /api/jobs/:id/csv
 * Download results as CSV
 */
router.get('/jobs/:id/csv', (req, res) => {
  const job = jobs.get(req.params.id);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.results.length === 0) {
    return res.status(400).json({ error: 'No results to export' });
  }

  // Build CSV
  const headers = [
    'clinic_id', 'clinic_name', 'owner_name', 'phone', 'phone_e164',
    'email', 'website', 'address', 'city', 'state', 'postal_code',
    'country', 'timezone', 'source_url', 'notes'
  ];

  const csvRows = [headers.join(',')];

  for (const row of job.results) {
    const values = headers.map(h => {
      const val = row[h] || '';
      // Escape quotes and wrap in quotes if contains comma
      if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    });
    csvRows.push(values.join(','));
  }

  const csv = csvRows.join('\n');
  const filename = `dental_prospects_${job.location.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.csv`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

/**
 * DELETE /api/jobs/:id
 * Delete a job
 */
router.delete('/jobs/:id', (req, res) => {
  if (jobs.has(req.params.id)) {
    jobs.delete(req.params.id);
    res.json({ message: 'Job deleted' });
  } else {
    res.status(404).json({ error: 'Job not found' });
  }
});

/**
 * Run the scraper for a job
 */
async function runScraper(jobId, options) {
  const job = jobs.get(jobId);
  if (!job) return;

  const logger = new Logger();
  let clinicId = 0;

  try {
    // Check for Gemini Maps (preferred, no browser needed)
    if (options.source === 'gemini-maps') {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured. Get one free at https://aistudio.google.com/apikey');
      }
      
      // Check rate limits before making request
      const limits = usageTracker.checkLimits();
      if (limits.geminiMaps.dailyLimitReached) {
        throw new Error('Gemini Maps daily limit (500 requests) reached. Try another source or switch API key.');
      }
      
      // Parse city and state from location
      const [city, state] = options.location.split(',').map(s => s.trim());
      
      try {
        const results = await scrapeGeminiMaps(city, state, options.max, (progress) => {
          if (progress.clinic) {
            clinicId++;
            const result = { clinic_id: clinicId, clinic_name: progress.clinic.name, ...progress.clinic };
            job.results.push(result);
            job.stats.total = clinicId;
            
            if (progress.clinic.phone_e164?.isValid || progress.clinic.phone) job.stats.validPhones++;
            else job.stats.invalidPhones++;
            if (progress.clinic.email) job.stats.withEmail++;
          }
        });
        
        // Track successful request
        usageTracker.trackGeminiMapsRequest(true);
        job.status = 'completed';
        job.usage = usageTracker.getStatus();
      } catch (err) {
        usageTracker.trackGeminiMapsRequest(false);
        throw err;
      }
      
      return;
    }

    // Legacy scrapers using browser automation
    let scraper;
    const scraperOptions = {
      location: options.location,
      max: options.max,
      delay: options.delay,
      enrich: options.enrich,
      googlePlacesKey: process.env.GOOGLE_PLACES_KEY
    };

    switch (options.source) {
      case 'places':
        if (!process.env.GOOGLE_PLACES_KEY) {
          throw new Error('Google Places API key not configured. Set GOOGLE_PLACES_KEY in .env');
        }
        scraper = scrapeGooglePlaces;
        break;
      case 'googlemaps':
        scraper = scrapeGoogleMaps;
        break;
      case 'yellowpages':
        scraper = scrapeYellowPages;
        break;
      case 'yelp':
      default:
        scraper = scrapeYelp;
    }

    // Run scraper
    for await (const prospect of scraper(scraperOptions, logger)) {
      clinicId++;
      const result = { clinic_id: clinicId, ...prospect };
      job.results.push(result);
      job.stats.total = clinicId;

      if (prospect.phone_e164) job.stats.validPhones++;
      else job.stats.invalidPhones++;
      if (prospect.email) job.stats.withEmail++;

      // Push to webhook if configured
      if (options.webhookUrl) {
        try {
          await fetch(options.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result)
          });
        } catch (e) {
          console.error('Webhook push failed:', e.message);
        }
      }

      if (job.results.length >= options.max) break;
    }

    job.status = 'completed';
  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
    console.error(`Job ${jobId} failed:`, error);
  } finally {
    await closeBrowser();
    logger.close();
  }
}

export default router;
