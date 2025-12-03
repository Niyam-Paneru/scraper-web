/**
 * AI Routes - Gemini-powered features
 */

import express from 'express';
import GeminiService from '../services/gemini.js';
import usageTracker from '../services/apiUsageTracker.js';

const router = express.Router();

// Get Gemini instance
function getGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GeminiService(apiKey);
}

/**
 * GET /api/ai/status
 * Check if Gemini is configured
 */
router.get('/status', (req, res) => {
  res.json({
    configured: !!process.env.GEMINI_API_KEY,
    model: 'gemini-1.5-flash',
    usage: usageTracker.getStatus()
  });
});

/**
 * GET /api/ai/usage
 * Get detailed API usage stats
 */
router.get('/usage', (req, res) => {
  const limits = usageTracker.checkLimits();
  const status = usageTracker.getStatus();
  
  res.json({
    ...status,
    limits,
    alerts: getAlerts(status, limits)
  });
});

// Generate alerts based on usage
function getAlerts(status, limits) {
  const alerts = [];
  
  if (limits.gemini.dailyLimitReached) {
    alerts.push({
      type: 'error',
      service: 'gemini',
      message: '🚨 Gemini daily limit reached! Switch API key or wait for reset.'
    });
  } else if (status.gemini.warningLevel === 'high') {
    alerts.push({
      type: 'warning',
      service: 'gemini',
      message: `⚠️ Gemini usage at ${status.gemini.percentUsed}% - ${status.gemini.remaining} requests left`
    });
  }
  
  if (limits.geminiMaps.dailyLimitReached) {
    alerts.push({
      type: 'error',
      service: 'geminiMaps',
      message: '🚨 Gemini Maps daily limit (500) reached! Switch API key or use other scrapers.'
    });
  } else if (status.geminiMaps.warningLevel === 'high') {
    alerts.push({
      type: 'warning',
      service: 'geminiMaps',
      message: `⚠️ Maps usage at ${status.geminiMaps.percentUsed}% - ${status.geminiMaps.remaining} requests left`
    });
  }
  
  if (limits.gemini.rateLimited) {
    alerts.push({
      type: 'warning',
      service: 'gemini',
      message: '⏳ Rate limited - wait a minute before next request'
    });
  }
  
  return alerts;
}

/**
 * POST /api/ai/chat
 * Chat with AI assistant (restricted to project tasks)
 */
router.post('/chat', async (req, res) => {
  const gemini = getGemini();
  if (!gemini) {
    return res.status(400).json({ error: 'Gemini API key not configured. Add GEMINI_API_KEY to .env' });
  }

  // Check rate limits
  const limits = usageTracker.checkLimits();
  if (limits.gemini.dailyLimitReached) {
    return res.status(429).json({ 
      error: 'Daily API limit reached. Please use a different API key or wait until tomorrow.',
      usage: usageTracker.getStatus()
    });
  }

  const { message, context = {} } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const response = await gemini.generate(message, context);
    usageTracker.trackGeminiRequest(0, true);
    res.json({ response, usage: usageTracker.getStatus() });
  } catch (error) {
    usageTracker.trackGeminiRequest(0, false);
    
    // Check for rate limit errors
    if (error.message.includes('quota') || error.message.includes('rate') || error.message.includes('429')) {
      return res.status(429).json({ 
        error: 'API rate limit exceeded. Please wait a moment or use a different API key.',
        usage: usageTracker.getStatus()
      });
    }
    
    res.status(500).json({ error: error.message, usage: usageTracker.getStatus() });
  }
});

/**
 * POST /api/ai/generate-email
 * Generate outreach email for a clinic
 */
router.post('/generate-email', async (req, res) => {
  const gemini = getGemini();
  if (!gemini) {
    return res.status(400).json({ error: 'Gemini API key not configured' });
  }

  const { clinic, emailType = 'introduction', customPrompt = '' } = req.body;

  if (!clinic) {
    return res.status(400).json({ error: 'Clinic data is required' });
  }

  try {
    const email = await gemini.generateEmail(clinic, emailType, customPrompt);
    res.json({ email });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ai/generate-call-script
 * Generate call script for AI voice agent
 */
router.post('/generate-call-script', async (req, res) => {
  const gemini = getGemini();
  if (!gemini) {
    return res.status(400).json({ error: 'Gemini API key not configured' });
  }

  const { clinic } = req.body;

  if (!clinic) {
    return res.status(400).json({ error: 'Clinic data is required' });
  }

  try {
    const script = await gemini.generateCallScript(clinic);
    res.json({ script });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ai/analyze
 * Analyze scraped clinic data
 */
router.post('/analyze', async (req, res) => {
  const gemini = getGemini();
  if (!gemini) {
    return res.status(400).json({ error: 'Gemini API key not configured' });
  }

  const { clinics } = req.body;

  if (!clinics || !Array.isArray(clinics) || clinics.length === 0) {
    return res.status(400).json({ error: 'Clinics array is required' });
  }

  try {
    const analysis = await gemini.analyzeData(clinics);
    res.json({ analysis });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ai/bulk-emails
 * Generate emails for multiple clinics
 */
router.post('/bulk-emails', async (req, res) => {
  const gemini = getGemini();
  if (!gemini) {
    return res.status(400).json({ error: 'Gemini API key not configured' });
  }

  const { clinics, emailType = 'introduction' } = req.body;

  if (!clinics || !Array.isArray(clinics) || clinics.length === 0) {
    return res.status(400).json({ error: 'Clinics array is required' });
  }

  // Limit to 10 at a time to avoid rate limits
  const limitedClinics = clinics.slice(0, 10);

  try {
    const emails = await gemini.bulkGenerateEmails(limitedClinics, emailType);
    res.json({ emails, processed: limitedClinics.length, total: clinics.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ai/score-lead
 * Score a single clinic for AI voice agent sales potential
 */
router.post('/score-lead', async (req, res) => {
  const gemini = getGemini();
  if (!gemini) {
    return res.status(400).json({ error: 'Gemini API key not configured' });
  }

  const { clinic } = req.body;
  if (!clinic) {
    return res.status(400).json({ error: 'Clinic data is required' });
  }

  try {
    const score = await gemini.scoreLeadForVoiceAgent(clinic);
    usageTracker.trackGeminiRequest(0, true);
    res.json({ score, usage: usageTracker.getStatus() });
  } catch (error) {
    usageTracker.trackGeminiRequest(0, false);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ai/score-all-leads
 * Score and prioritize all clinics from a job
 */
router.post('/score-all-leads', async (req, res) => {
  const gemini = getGemini();
  if (!gemini) {
    return res.status(400).json({ error: 'Gemini API key not configured' });
  }

  const { clinics } = req.body;
  if (!clinics || !Array.isArray(clinics) || clinics.length === 0) {
    return res.status(400).json({ error: 'Clinics array is required' });
  }

  // Limit to prevent excessive API usage
  const limitedClinics = clinics.slice(0, 20);

  try {
    const scored = await gemini.scoreAndPrioritizeLeads(limitedClinics);
    res.json({ 
      leads: scored, 
      processed: limitedClinics.length, 
      total: clinics.length,
      usage: usageTracker.getStatus()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ai/generate-pitch
 * Generate personalized AI voice agent sales pitch
 */
router.post('/generate-pitch', async (req, res) => {
  const gemini = getGemini();
  if (!gemini) {
    return res.status(400).json({ error: 'Gemini API key not configured' });
  }

  const { clinic, pitchType = 'cold-call' } = req.body;
  if (!clinic) {
    return res.status(400).json({ error: 'Clinic data is required' });
  }

  // Valid pitch types
  const validTypes = ['cold-call', 'email', 'linkedin', 'follow-up', 'demo-offer'];
  if (!validTypes.includes(pitchType)) {
    return res.status(400).json({ 
      error: `Invalid pitch type. Use: ${validTypes.join(', ')}` 
    });
  }

  try {
    const pitch = await gemini.generateVoiceAgentPitch(clinic, pitchType);
    usageTracker.trackGeminiRequest(0, true);
    res.json({ pitch, pitchType, clinic: clinic.clinic_name || clinic.name, usage: usageTracker.getStatus() });
  } catch (error) {
    usageTracker.trackGeminiRequest(0, false);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ai/analyze-fit
 * Analyze why a clinic would benefit from AI voice agent
 */
router.post('/analyze-fit', async (req, res) => {
  const gemini = getGemini();
  if (!gemini) {
    return res.status(400).json({ error: 'Gemini API key not configured' });
  }

  const { clinic } = req.body;
  if (!clinic) {
    return res.status(400).json({ error: 'Clinic data is required' });
  }

  try {
    const analysis = await gemini.analyzeVoiceAgentFit(clinic);
    usageTracker.trackGeminiRequest(0, true);
    res.json({ analysis, usage: usageTracker.getStatus() });
  } catch (error) {
    usageTracker.trackGeminiRequest(0, false);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ai/enrich-clinic
 * Scrape clinic website to find email and detect AI/chatbots
 */
router.post('/enrich-clinic', async (req, res) => {
  const gemini = getGemini();
  if (!gemini) {
    return res.status(400).json({ error: 'Gemini API key not configured' });
  }

  const { clinic } = req.body;
  if (!clinic || !clinic.website) {
    return res.status(400).json({ error: 'Clinic with website is required' });
  }

  // Skip Google Maps links
  if (clinic.website.includes('maps.google.com') || clinic.website.includes('goo.gl')) {
    return res.status(400).json({ error: 'Cannot scrape Google Maps links' });
  }

  try {
    // Use Gemini to analyze the website
    const prompt = `You are a web scraper assistant. I need you to help me find information from a dental clinic website.

Website: ${clinic.website}
Clinic: ${clinic.clinic_name || clinic.name}

Please analyze what you can determine about this clinic and respond in JSON format:
{
  "email": "found email address or null",
  "emails_found": ["list of all email addresses found"],
  "has_chatbot": true/false (if they have a chat widget, AI assistant, or chatbot),
  "chatbot_type": "name of chatbot if detected (Intercom, Drift, LiveChat, custom, etc) or null",
  "has_online_booking": true/false,
  "booking_system": "name of booking system if detected or null",
  "social_media": {
    "facebook": "url or null",
    "instagram": "url or null",
    "twitter": "url or null"
  },
  "tech_stack_notes": "any notable technology they use",
  "competition_level": "low/medium/high - how sophisticated is their current tech?"
}

IMPORTANT: 
- Look for email addresses like info@, contact@, appointments@, etc
- Look for chat widgets in the corner (Intercom, Drift, Zendesk, etc)
- Check if they have online booking systems
- Be honest if you cannot access the website - return nulls`;

    const response = await gemini.generate(prompt, { 
      clinic,
      task: 'website-enrichment'
    });
    
    usageTracker.trackGeminiRequest(0, true);

    // Try to parse the JSON from the response
    let enrichedData = {};
    try {
      // Extract JSON from response (it might be wrapped in markdown)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        enrichedData = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.error('Failed to parse enrichment response:', parseErr);
      enrichedData = { raw_response: response };
    }

    res.json({ 
      enrichedData,
      usage: usageTracker.getStatus() 
    });
  } catch (error) {
    usageTracker.trackGeminiRequest(0, false);
    console.error('Enrichment error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
