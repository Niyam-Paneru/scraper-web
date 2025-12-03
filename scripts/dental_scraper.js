#!/usr/bin/env node

/**
 * Dental Clinic Prospect Finder
 * 
 * A CLI tool to scrape dental clinic listings from various sources
 * and output a clean CSV matching the AI agent upload schema.
 * 
 * Usage:
 *   node scripts/dental_scraper.js --source yelp --location "Austin, TX" --max 50
 *   node scripts/dental_scraper.js --source places --location "Los Angeles, CA" --google-places-key YOUR_KEY
 *   node scripts/dental_scraper.js --source yelp --location "Miami, FL" --push-webhook http://localhost:3000/webhook
 */

import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

import Logger from './lib/logger.js';
import { writeProspectsCsv } from './lib/csvExporter.js';
import { closeBrowser } from './lib/visitAndExtract.js';
import { scrapeYelp } from './sources/yelp.js';
import { scrapeYellowPages } from './sources/yellowpages.js';
import { scrapeGooglePlaces } from './sources/places.js';

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 [options]')
  .option('source', {
    alias: 's',
    describe: 'Data source to scrape',
    choices: ['yelp', 'yellowpages', 'places'],
    default: 'yelp'
  })
  .option('location', {
    alias: 'l',
    describe: 'Location to search (city, state)',
    type: 'string',
    demandOption: true
  })
  .option('max', {
    alias: 'm',
    describe: 'Maximum number of results',
    type: 'number',
    default: 200
  })
  .option('delay', {
    alias: 'd',
    describe: 'Delay between requests in milliseconds',
    type: 'number',
    default: 1500
  })
  .option('concurrency', {
    alias: 'c',
    describe: 'Number of concurrent requests (not used for all sources)',
    type: 'number',
    default: 3
  })
  .option('proxy-file', {
    describe: 'Path to file containing proxy list (one per line)',
    type: 'string'
  })
  .option('google-places-key', {
    alias: 'k',
    describe: 'Google Places API key (or set GOOGLE_PLACES_KEY env var)',
    type: 'string'
  })
  .option('enrich', {
    alias: 'e',
    describe: 'Try to enrich data by visiting contact pages for emails',
    type: 'boolean',
    default: false
  })
  .option('output', {
    alias: 'o',
    describe: 'Output directory for CSV file',
    type: 'string',
    default: '.'
  })
  .option('push-webhook', {
    alias: 'w',
    describe: 'Webhook URL to POST each lead as JSON (for n8n/automation)',
    type: 'string'
  })
  .example('$0 --source yelp --location "Austin, TX" --max 50', 'Scrape 50 dental clinics from Yelp')
  .example('$0 --source places --location "New York, NY" -k YOUR_API_KEY', 'Use Google Places API (recommended)')
  .example('$0 --source yelp --location "Miami, FL" --push-webhook http://localhost:3000/webhook', 'Push to webhook')
  .example('$0 --source yellowpages --location "Chicago, IL" --enrich', 'Scrape with email enrichment')
  .epilog('⚠️  Ethical Notice: Respect robots.txt and terms of service. Use Google Places API when possible.')
  .argv;

/**
 * Load proxies from file
 * @param {string} filePath
 * @returns {string[]}
 */
function loadProxies(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return [];
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
}

/**
 * Get next proxy from list
 * @param {string[]} proxies
 * @param {number} index
 * @returns {{ proxy: string|null, nextIndex: number }}
 */
function getNextProxy(proxies, index) {
  if (!proxies || proxies.length === 0) {
    return { proxy: null, nextIndex: 0 };
  }
  return {
    proxy: proxies[index % proxies.length],
    nextIndex: (index + 1) % proxies.length
  };
}

/**
 * Push a lead to webhook (non-blocking, failures logged but not fatal)
 * @param {string} webhookUrl
 * @param {object} lead
 * @param {Logger} logger
 */
async function pushToWebhook(webhookUrl, lead, logger) {
  if (!webhookUrl) return;
  
  try {
    await axios.post(webhookUrl, lead, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });
    logger.debug(`Webhook push successful for ${lead.clinic_name}`);
  } catch (err) {
    logger.warn(`Webhook push failed: ${err.message}`);
  }
}

/**
 * Main execution
 */
async function main() {
  const logger = new Logger();
  
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         🦷 Dental Clinic Prospect Finder 🦷                ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Source:   ${argv.source.padEnd(47)}║`);
  console.log(`║  Location: ${argv.location.padEnd(47)}║`);
  console.log(`║  Max:      ${String(argv.max).padEnd(47)}║`);
  console.log(`║  Delay:    ${(argv.delay + 'ms').padEnd(47)}║`);
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n');

  // Warn about scraping
  if (argv.source !== 'places') {
    logger.warn('⚠️  IMPORTANT: Web scraping may violate terms of service.');
    logger.warn('⚠️  Yelp and YellowPages may block automated access.');
    logger.warn('⚠️  For reliable results, use --source places with a Google API key.');
    logger.warn('⚠️  You are responsible for complying with all applicable laws.\n');
  }

  // Load proxies if specified
  const proxies = loadProxies(argv.proxyFile);
  if (proxies.length > 0) {
    logger.info(`Loaded ${proxies.length} proxies from ${argv.proxyFile}`);
  }

  // Get Google Places key
  const googlePlacesKey = argv.googlePlacesKey || process.env.GOOGLE_PLACES_KEY;

  // Prepare options
  const options = {
    location: argv.location,
    max: argv.max,
    delay: argv.delay,
    concurrency: argv.concurrency,
    enrich: argv.enrich,
    proxy: proxies.length > 0 ? proxies[0] : null,
    googlePlacesKey
  };

  // Select and run scraper
  let scraper;
  switch (argv.source) {
    case 'places':
      if (!googlePlacesKey) {
        logger.error('Google Places API key required. Use --google-places-key or set GOOGLE_PLACES_KEY env var.');
        process.exit(1);
      }
      scraper = scrapeGooglePlaces;
      break;
    case 'yellowpages':
      scraper = scrapeYellowPages;
      break;
    case 'yelp':
    default:
      scraper = scrapeYelp;
  }

  // Collect results
  const prospects = [];
  let clinicId = 0;
  
  try {
    logger.info(`Starting ${argv.source} scraper...`);
    
    for await (const prospect of scraper(options, logger)) {
      clinicId++;
      const leadWithId = { clinic_id: clinicId, ...prospect };
      prospects.push(leadWithId);
      
      // Push to webhook if configured
      if (argv.pushWebhook) {
        await pushToWebhook(argv.pushWebhook, leadWithId, logger);
      }
      
      // Early exit if we have enough
      if (prospects.length >= argv.max) {
        break;
      }
    }
    
  } catch (err) {
    logger.error(`Scraper error: ${err.message}`);
  } finally {
    // Clean up browser
    await closeBrowser();
  }

  console.log('\n');

  // Write CSV
  if (prospects.length > 0) {
    try {
      // Ensure output directory exists
      if (!fs.existsSync(argv.output)) {
        fs.mkdirSync(argv.output, { recursive: true });
      }
      
      const { filepath, count } = await writeProspectsCsv(
        prospects,
        argv.location,
        argv.output
      );
      
      logger.info(`✅ CSV saved: ${filepath}`);
      logger.info(`   Total records: ${count}`);
      
    } catch (err) {
      logger.error(`Failed to write CSV: ${err.message}`);
    }
  } else {
    logger.warn('No prospects found. CSV not created.');
  }

  // Print summary
  logger.close();
  
  console.log('\n');
  console.log('Thank you for using Dental Clinic Prospect Finder!');
  console.log('For best results, use Google Places API: --source places -k YOUR_KEY\n');
}

// Run
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
