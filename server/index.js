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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', apiRoutes);
app.use('/api/ai', aiRoutes);

// Serve static frontend (production build)
const distPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(distPath)) {
  console.log('📦 Serving static frontend from client/dist');
  app.use(express.static(distPath));
  // Only serve index.html for non-API routes
  app.get('*', (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api') || req.path === '/health') {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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

export default app;
