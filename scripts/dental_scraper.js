#!/usr/bin/env node

/**
 * Dental Clinic Prospect Finder
 * 
 * A CLI tool to find dental clinics using Google Places API.
 * Returns REAL business data, not fake/generated data.
 * 
 * Usage:
 *   node scripts/dental_scraper.js --location "Austin, TX" --max 50
 *   node scripts/dental_scraper.js --location "New York, NY" -k YOUR_API_KEY
 * 
 * Requires: GOOGLE_PLACES_KEY environment variable or --google-places-key flag
 * Get your key at: https://console.cloud.google.com
 */

import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs';
import axios from 'axios';

import Logger from './lib/logger.js';
import { writeProspectsCsv } from './lib/csvExporter.js';
import { scrapeGooglePlaces } from './sources/places.js';

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 [options]')
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
    default: 50
  })
  .option('delay', {
    alias: 'd',
    describe: 'Delay between requests in milliseconds',
    type: 'number',
    default: 200
  })
  .option('google-places-key', {
    alias: 'k',
    describe: 'Google Places API key (or set GOOGLE_PLACES_KEY env var)',
    type: 'string'
  })
  .option('output', {
    alias: 'o',
    describe: 'Output directory for CSV file',
    type: 'string',
    default: '.'
  })
  .option('push-webhook', {
    alias: 'w',
    describe: 'Webhook URL to POST each lead as JSON',
    type: 'string'
  })
  .example('$0 --location "Austin, TX" --max 50', 'Find 50 dental clinics in Austin')
  .example('$0 --location "New York, NY" -k YOUR_API_KEY', 'Use specific API key')
  .example('$0 --location "Miami, FL" -w http://localhost:3000/webhook', 'Push to webhook')
  .example('$0 --source yellowpages --location "Chicago, IL" --enrich', 'Scrape with email enrichment')
  .epilog('⚠️  Ethical Notice: Respect robots.txt and terms of service. Use Google Places API when possible.')
  .argv;

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
  
  // Get Google Places key
  const googlePlacesKey = argv.googlePlacesKey || process.env.GOOGLE_PLACES_KEY;
  
  if (!googlePlacesKey) {
    console.error('\n❌ ERROR: Google Places API key required!\n');
    console.error('Options:');
    console.error('  1. Set GOOGLE_PLACES_KEY in your .env file');
    console.error('  2. Pass --google-places-key YOUR_KEY\n');
    console.error('Get your API key at: https://console.cloud.google.com');
    console.error('See GOOGLE-PLACES-SETUP.md for step-by-step instructions.\n');
    process.exit(1);
  }
  
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         🦷 Dental Clinic Prospect Finder 🦷                ║');
  console.log('║           Using Google Places API (REAL DATA)              ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Location: ${argv.location.padEnd(47)}║`);
  console.log(`║  Max:      ${String(argv.max).padEnd(47)}║`);
  console.log(`║  Delay:    ${(argv.delay + 'ms').padEnd(47)}║`);
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n');

  // Prepare options
  const options = {
    location: argv.location,
    max: argv.max,
    delay: argv.delay,
    googlePlacesKey
  };

  // Collect results
  const prospects = [];
  let clinicId = 0;
  
  try {
    logger.info('Starting Google Places API search...');
    
    for await (const prospect of scrapeGooglePlaces(options, logger)) {
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
    logger.error(`API error: ${err.message}`);
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
  console.log('✅ Done! All data is REAL from Google Places API.');
  console.log('📧 Next step: Add email generation with Gemini (see scraper-mods.md)\n');
}

// Run
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
