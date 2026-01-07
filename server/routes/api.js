/**
 * API Routes for Dental Scraper
 * Simplified to use only Google Places API (real data)
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { scrapeGooglePlaces } from '../../scripts/sources/places.js';
import Logger from '../../scripts/lib/logger.js';
import usageTracker from '../services/apiUsageTracker.js';

const router = express.Router();

// In-memory job storage (in production, use a database)
const jobs = new Map();

// Simple per-minute scrape guard to avoid accidental overuse
const scrapeRequests = [];
const SCRAPE_RATE_LIMIT_PER_MINUTE = 12; // enough for solo use
const MAX_RESULTS = 200; // safety cap for Places cost
const MIN_DELAY_MS = 100;
const MAX_DELAY_MS = 2000;

/**
 * GET /api/status
 * Check server status and configuration
 */
router.get('/status', (req, res) => {
  const hasGooglePlacesKey = !!process.env.GOOGLE_PLACES_KEY;
  
  res.json({
    status: 'ok',
    hasGooglePlacesKey,
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    availableSources: hasGooglePlacesKey ? ['places'] : [],
    configured: hasGooglePlacesKey,
    message: hasGooglePlacesKey 
      ? 'Google Places API configured - ready to scrape real data' 
      : 'Google Places API key required. See GOOGLE-PLACES-SETUP.md',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/usage
 * Get API usage and credit information
 */
router.get('/usage', (req, res) => {
  res.json(usageTracker.getStatus());
});

/**
 * GET /api/credit
 * Get Google Places credit information
 */
router.get('/credit', (req, res) => {
  res.json(usageTracker.getGooglePlacesStatus());
});

/**
 * POST /api/scrape
 * Start a new scraping job (Google Places only)
 */
router.post('/scrape', async (req, res) => {
  const { location, max = 50, delay = 200, webhookUrl } = req.body;

  if (!location) {
    return res.status(400).json({ error: 'Location is required' });
  }

  // Rate limit per minute to avoid surprise API spend
  const now = Date.now();
  scrapeRequests.push(now);
  while (scrapeRequests.length && now - scrapeRequests[0] > 60000) {
    scrapeRequests.shift();
  }
  if (scrapeRequests.length > SCRAPE_RATE_LIMIT_PER_MINUTE) {
    return res.status(429).json({
      error: 'Too many scrape requests. Please wait a minute and try again.',
      limitPerMinute: SCRAPE_RATE_LIMIT_PER_MINUTE
    });
  }

  const cappedMax = Math.min(Math.max(parseInt(max, 10) || 0, 1), MAX_RESULTS);
  const safeDelay = Math.min(Math.max(parseInt(delay, 10) || MIN_DELAY_MS, MIN_DELAY_MS), MAX_DELAY_MS);

  if (!process.env.GOOGLE_PLACES_KEY) {
    return res.status(400).json({ 
      error: 'Google Places API key not configured',
      help: 'Add GOOGLE_PLACES_KEY to your .env file. See GOOGLE-PLACES-SETUP.md for instructions.'
    });
  }

  // Create job
  const jobId = uuidv4();
  const job = {
    id: jobId,
    status: 'running',
    source: 'google-places',
    location,
    max: cappedMax,
    delay: safeDelay,
    createdAt: new Date().toISOString(),
    results: [],
    stats: {
      total: 0,
      validPhones: 0,
      invalidPhones: 0,
      withWebsite: 0
    },
    error: null
  };

  jobs.set(jobId, job);

  // Return immediately with job ID
  res.json({
    jobId,
    message: 'Scraping started with Google Places API (real data)',
    max: cappedMax,
    delay: safeDelay
  });

  // Run scraper in background
  runScraper(jobId, { location, max: cappedMax, delay: safeDelay, webhookUrl });
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
 * Run the Google Places scraper for a job
 */
async function runScraper(jobId, options) {
  const job = jobs.get(jobId);
  if (!job) return;

  const logger = new Logger();
  let clinicId = 0;

  try {
    const scraperOptions = {
      location: options.location,
      max: options.max,
      delay: options.delay,
      googlePlacesKey: process.env.GOOGLE_PLACES_KEY
    };

    // Track the text search API call
    usageTracker.trackPlacesTextSearch();
    
    // Run Google Places scraper
    for await (const prospect of scrapeGooglePlaces(scraperOptions, logger)) {
      clinicId++;
      
      // Track each place details API call
      usageTracker.trackPlacesDetails();
      
      const result = { clinic_id: clinicId, ...prospect };
      job.results.push(result);
      job.stats.total = clinicId;

      if (prospect.phone_e164) job.stats.validPhones++;
      else job.stats.invalidPhones++;
      if (prospect.website) job.stats.withWebsite++;

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
    logger.close();
  }
}

export default router;
