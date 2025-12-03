/**
 * CSV Export utility for dental clinic prospects
 */
import { createObjectCsvWriter } from 'csv-writer';
import path from 'path';
import fs from 'fs';

// CSV Headers matching the AI agent upload schema
const CSV_HEADERS = [
  { id: 'clinic_id', title: 'clinic_id' },
  { id: 'clinic_name', title: 'clinic_name' },
  { id: 'owner_name', title: 'owner_name' },
  { id: 'phone', title: 'phone' },
  { id: 'phone_e164', title: 'phone_e164' },
  { id: 'email', title: 'email' },
  { id: 'website', title: 'website' },
  { id: 'address', title: 'address' },
  { id: 'city', title: 'city' },
  { id: 'state', title: 'state' },
  { id: 'postal_code', title: 'postal_code' },
  { id: 'country', title: 'country' },
  { id: 'timezone', title: 'timezone' },
  { id: 'source_url', title: 'source_url' },
  { id: 'notes', title: 'notes' }
];

/**
 * Generate a safe filename from location
 * @param {string} location
 * @returns {string}
 */
function sanitizeLocation(location) {
  return location
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 50);
}

/**
 * Create a CSV writer for dental prospects
 * @param {string} location - The location searched
 * @param {string} outputDir - Output directory (default: current)
 * @returns {{ writer: CsvWriter, filename: string }}
 */
export function createProspectsCsvWriter(location, outputDir = '.') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const safeLocation = sanitizeLocation(location);
  const filename = `dental_prospects_${safeLocation}_${timestamp}.csv`;
  const filepath = path.join(outputDir, filename);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const writer = createObjectCsvWriter({
    path: filepath,
    header: CSV_HEADERS
  });

  return { writer, filename, filepath };
}

/**
 * Write prospects to CSV
 * @param {Array} prospects - Array of prospect objects
 * @param {string} location - Location searched
 * @param {string} outputDir - Output directory
 * @returns {Promise<{ filepath: string, count: number }>}
 */
export async function writeProspectsCsv(prospects, location, outputDir = '.') {
  const { writer, filepath } = createProspectsCsvWriter(location, outputDir);
  
  // Add clinic_id to each record
  const records = prospects.map((prospect, index) => ({
    clinic_id: index + 1,
    clinic_name: prospect.clinic_name || '',
    owner_name: prospect.owner_name || '',
    phone: prospect.phone || '',
    phone_e164: prospect.phone_e164 || '',
    email: prospect.email || '',
    website: prospect.website || '',
    address: prospect.address || '',
    city: prospect.city || '',
    state: prospect.state || '',
    postal_code: prospect.postal_code || '',
    country: prospect.country || 'US',
    timezone: prospect.timezone || '',
    source_url: prospect.source_url || '',
    notes: prospect.notes || ''
  }));

  await writer.writeRecords(records);
  
  return { filepath, count: records.length };
}

/**
 * Create an empty CSV template
 * @param {string} outputDir
 * @returns {string} Path to template file
 */
export async function createTemplate(outputDir = '.') {
  const filepath = path.join(outputDir, 'dental_prospects_template.csv');
  
  const writer = createObjectCsvWriter({
    path: filepath,
    header: CSV_HEADERS
  });

  // Write sample row
  await writer.writeRecords([{
    clinic_id: 1,
    clinic_name: 'Sample Dental Clinic',
    owner_name: 'Dr. John Smith',
    phone: '(555) 123-4567',
    phone_e164: '+15551234567',
    email: 'contact@sampleclinic.com',
    website: 'https://sampleclinic.com',
    address: '123 Main Street',
    city: 'Austin',
    state: 'TX',
    postal_code: '78701',
    country: 'US',
    timezone: 'America/Chicago',
    source_url: 'https://yelp.com/biz/sample-clinic',
    notes: ''
  }]);

  return filepath;
}

export default { createProspectsCsvWriter, writeProspectsCsv, createTemplate };
