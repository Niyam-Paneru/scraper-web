/**
 * Dental Scraper Web Server
 * Express backend for the dental clinic prospect finder
 */

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';

import apiRoutes from './routes/api.js';
import aiRoutes from './routes/ai.js';
import emailRoutes from './routes/email.js';
import usageTracker from './services/apiUsageTracker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const startedAt = Date.now();

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', apiRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/email', emailRoutes);

// Serve static frontend (production build)
const distPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(distPath)) {
  console.log('📦 Serving static frontend from client/dist');
  app.use(express.static(distPath));
  // Only serve index.html for non-API routes
  app.get('*', (req, res, next) => {
    // Skip API/health/metrics routes
    if (req.path.startsWith('/api') || req.path === '/health' || req.path === '/metrics') {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Prometheus-style metrics for uptime and API usage
app.get('/metrics', (req, res) => {
  const usage = usageTracker.getStatus();
  const mem = process.memoryUsage();

  const lines = [
    'app_info{service="dental-scraper"} 1',
    `process_uptime_seconds ${Math.round(process.uptime())}`,
    `process_start_time_ms ${startedAt}`,
    `process_resident_memory_bytes ${mem.rss}`,
    `process_heap_used_bytes ${mem.heapUsed}`,
    `gemini_requests_today ${usage.gemini.used}`,
    `gemini_requests_remaining ${usage.gemini.remaining}`,
    `gemini_requests_percent_used ${usage.gemini.percentUsed}`,
    `gemini_errors_total ${usage.gemini.errors}`,
    `google_places_credit_used ${usage.googlePlaces.creditUsed}`,
    `google_places_credit_remaining ${usage.googlePlaces.creditRemaining}`,
    `google_places_percent_used ${usage.googlePlaces.percentUsed}`
  ];

  res.set('Content-Type', 'text/plain');
  res.send(lines.join('\n'));
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║         🦷 Dental Scraper Web Server Running 🦷            ║
╠════════════════════════════════════════════════════════════╣
║  Local:   http://localhost:${PORT}                            ║
║  API:     http://localhost:${PORT}/api                        ║
╚════════════════════════════════════════════════════════════╝
  `);
  });
}

export default app;
