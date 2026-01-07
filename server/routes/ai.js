/**
 * AI Routes - Gemini, HuggingFace, and Firecrawl powered features
 */

import express from 'express';
import GeminiService from '../services/gemini.js';
import usageTracker from '../services/apiUsageTracker.js';
import huggingface from '../services/huggingface.js';
import firecrawl from '../services/firecrawl.js';

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
 * Check all AI services status
 */
router.get('/status', (req, res) => {
  res.json({
    gemini: {
      configured: !!process.env.GEMINI_API_KEY,
      model: 'gemini-2.0-flash-lite',
      purpose: 'Optional: templated email fills, call scripts, lead scoring'
    },
    huggingface: {
      configured: huggingface.isConfigured(),
      features: ['sentiment', 'classification', 'summarization', 'lead-scoring']
    },
    firecrawl: {
      configured: firecrawl.isConfigured(),
      features: ['fast-scraping', 'email-extraction']
    },
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
  
  if (limits.gemini?.dailyLimitReached) {
    alerts.push({
      type: 'error',
      service: 'gemini',
      message: '🚨 Gemini daily limit reached! Switch API key or wait for reset.'
    });
  } else if (status.gemini?.warningLevel === 'high') {
    alerts.push({
      type: 'warning',
      service: 'gemini',
      message: `⚠️ Gemini usage at ${status.gemini.percentUsed}% - ${status.gemini.remaining} requests left`
    });
  }
  
  if (limits.googlePlaces?.percentUsed >= 90) {
    alerts.push({
      type: 'warning',
      service: 'googlePlaces',
      message: `⚠️ Google Places credit at ${limits.googlePlaces.percentUsed}% - $${limits.googlePlaces.creditRemaining} remaining`
    });
  }
  
  if (limits.gemini?.rateLimited) {
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
 * REAL web scraping to find email and detect chatbots
 * Uses Playwright to actually visit the website instead of AI guessing
 */
router.post('/enrich-clinic', async (req, res) => {
  const { clinic } = req.body;
  
  if (!clinic) {
    return res.status(400).json({ error: 'Clinic data is required' });
  }

  // Check if we have a website to scrape
  if (!clinic.website) {
    return res.status(400).json({ 
      error: 'No website available to scrape',
      suggestion: 'Use the Google search link to find the clinic website first'
    });
  }

  // Skip Google Maps links
  if (clinic.website.includes('maps.google.com') || clinic.website.includes('goo.gl')) {
    return res.status(400).json({ 
      error: 'Cannot scrape Google Maps links',
      suggestion: 'Find the actual clinic website using Google search'
    });
  }

  try {
    // Try Firecrawl first (faster), fallback to Playwright
    let enrichedData;
    
    if (firecrawl.isConfigured()) {
      console.log(`🔥 Using Firecrawl for: ${clinic.website}`);
      const result = await firecrawl.extractEmails(clinic.website);
      enrichedData = {
        email: result.bestEmail,
        emails_found: result.emails,
        source: 'firecrawl'
      };
    } else {
      // Fallback to Playwright scraper
      const emailScraper = (await import('../services/emailScraper.js')).default;
      console.log(`🔍 Using Playwright for: ${clinic.website}`);
      enrichedData = await emailScraper.enrichClinic(clinic);
      enrichedData.source = 'playwright';
    }
    
    console.log(`✅ Scrape complete for ${clinic.clinic_name || clinic.name}:`, {
      emailsFound: enrichedData.emails_found?.length || 0,
      bestEmail: enrichedData.email
    });

    res.json({ 
      enrichedData,
      source: enrichedData.source || 'real-scrape',
      usage: usageTracker.getStatus() 
    });
  } catch (error) {
    console.error('Enrichment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// NEW AI FEATURES - HuggingFace & Gemini
// ============================================

/**
 * POST /api/ai/analyze-sentiment
 * Analyze sentiment of reviews or text using HuggingFace
 */
router.post('/analyze-sentiment', async (req, res) => {
  const { text } = req.body;
  
  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  if (!huggingface.isConfigured()) {
    return res.status(400).json({ error: 'HuggingFace API key not configured' });
  }

  try {
    const result = await huggingface.analyzeSentiment(text);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ai/classify-clinic
 * Classify clinic type (cosmetic, pediatric, etc.) using HuggingFace
 */
router.post('/classify-clinic', async (req, res) => {
  const { text, clinicName } = req.body;
  
  if (!text && !clinicName) {
    return res.status(400).json({ error: 'Text or clinicName is required' });
  }

  if (!huggingface.isConfigured()) {
    return res.status(400).json({ error: 'HuggingFace API key not configured' });
  }

  try {
    const result = await huggingface.classifyClinic(text || clinicName);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ai/score-lead
 * Score a clinic lead using HuggingFace analysis
 */
router.post('/score-lead', async (req, res) => {
  const { clinic } = req.body;
  
  if (!clinic) {
    return res.status(400).json({ error: 'Clinic data is required' });
  }

  try {
    const score = await huggingface.analyzeClinicPresence(clinic);
    res.json(score);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ai/batch-score-leads
 * Score multiple clinic leads at once
 */
router.post('/batch-score-leads', async (req, res) => {
  const { clinics } = req.body;
  
  if (!clinics || !Array.isArray(clinics)) {
    return res.status(400).json({ error: 'Clinics array is required' });
  }

  try {
    const results = await Promise.all(
      clinics.map(async (clinic) => {
        const score = await huggingface.analyzeClinicPresence(clinic);
        return { ...clinic, leadScore: score };
      })
    );
    
    // Sort by score (highest first)
    results.sort((a, b) => b.leadScore.score - a.leadScore.score);
    
    res.json({ 
      clinics: results,
      summary: {
        total: results.length,
        gradeA: results.filter(c => c.leadScore.grade === 'A').length,
        gradeB: results.filter(c => c.leadScore.grade === 'B').length,
        gradeC: results.filter(c => c.leadScore.grade === 'C').length,
        gradeD: results.filter(c => c.leadScore.grade === 'D').length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ai/generate-campaign
 * Generate a full email campaign for multiple clinics using Gemini
 */
router.post('/generate-campaign', async (req, res) => {
  const gemini = getGemini();
  if (!gemini) {
    return res.status(400).json({ error: 'Gemini API key not configured' });
  }

  const { clinics, campaignType = 'introduction', senderInfo } = req.body;
  
  if (!clinics || !Array.isArray(clinics)) {
    return res.status(400).json({ error: 'Clinics array is required' });
  }

  try {
    const emails = [];
    const baseBody = `Hi {{owner_name}},

I noticed {{clinic_name}} in {{city}}. Many practices miss 30-40% of calls during lunch/after-hours.

I built DentSignal—an AI receptionist that answers 24/7, books appointments, and cuts no-shows. Demo (60s): (904) 867-9643

Worth a quick look?

Best,
{{sender_name}}
{{sender_company}}`;

    for (const clinic of clinics.slice(0, 10)) { // Limit to 10 at a time
      const prompt = `Fill placeholders only. Keep wording and length. Do not add sentences.

Practice: ${clinic.clinic_name || clinic.name}
City: ${clinic.city || ''}
Owner (if known): ${clinic.owner_name || ''}
Sender: ${senderInfo?.name || 'Your Name'} from ${senderInfo?.company || 'DentSignal'}

Output JSON exactly:
{"subject": "<max 12 words, include clinic and city>", "body": "<template with placeholders filled>"}

TEMPLATE:
${baseBody}`;

      try {
        const response = await gemini.generate(prompt);
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const emailData = JSON.parse(jsonMatch[0]);
          emails.push({
            clinic: clinic.clinic_name || clinic.name,
            clinicEmail: clinic.email,
            subject: emailData.subject,
            body: emailData.body
          });
        }
      } catch (err) {
        console.error(`Failed to generate email for ${clinic.clinic_name}:`, err.message);
      }
      
      await new Promise(r => setTimeout(r, 500));
    }

    res.json({ 
      emails,
      count: emails.length,
      usage: usageTracker.getStatus()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ai/analyze-competitor
 * Analyze a competitor dental clinic using Gemini
 */
router.post('/analyze-competitor', async (req, res) => {
  const gemini = getGemini();
  if (!gemini) {
    return res.status(400).json({ error: 'Gemini API key not configured' });
  }

  const { clinic, targetAudience } = req.body;
  
  if (!clinic) {
    return res.status(400).json({ error: 'Clinic data is required' });
  }

  try {
    const prompt = `Analyze this dental clinic as a competitor:

Name: ${clinic.clinic_name || clinic.name}
Location: ${clinic.address || ''}, ${clinic.city || ''} ${clinic.state || ''}
Rating: ${clinic.rating || 'Unknown'} (${clinic.reviewCount || 0} reviews)
Website: ${clinic.website || 'None'}
Services: ${clinic.services || 'Unknown'}

Provide a competitive analysis:
1. Strengths (what they do well)
2. Weaknesses (opportunities for competitors)
3. Target market they seem to serve
4. Pricing tier estimate (budget/mid/premium)
5. Online presence score (1-10)
6. Suggested approach if reaching out to them

Return as JSON with keys: strengths[], weaknesses[], targetMarket, pricingTier, onlineScore, approachStrategy`;

    const response = await gemini.generate(prompt);
    usageTracker.trackGeminiRequest(0, true);
    
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);
      res.json({ analysis, usage: usageTracker.getStatus() });
    } else {
      res.json({ rawAnalysis: response, usage: usageTracker.getStatus() });
    }
  } catch (error) {
    usageTracker.trackGeminiRequest(0, false);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ai/generate-followup
 * Generate follow-up email based on previous interaction
 */
router.post('/generate-followup', async (req, res) => {
  const gemini = getGemini();
  if (!gemini) {
    return res.status(400).json({ error: 'Gemini API key not configured' });
  }

  const { clinic, previousEmail, daysSince, outcome } = req.body;
  
  if (!clinic || !previousEmail) {
    return res.status(400).json({ error: 'Clinic and previous email are required' });
  }

  try {
    const prompt = `Generate a follow-up email for a dental clinic.

Clinic: ${clinic.clinic_name || clinic.name}
Days since last contact: ${daysSince || 7}
Previous outcome: ${outcome || 'no response'}

Previous email subject: ${previousEmail.subject}
Previous email body: ${previousEmail.body?.slice(0, 200)}...

Write a professional follow-up that:
1. References the previous email
2. Adds new value or information
3. Creates urgency without being pushy
4. Has a different angle than before
5. Is shorter than the original (under 100 words)

Return as JSON: {"subject": "...", "body": "...", "timing": "best time to send"}`;

    const response = await gemini.generate(prompt);
    usageTracker.trackGeminiRequest(0, true);
    
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      res.json({ email: JSON.parse(jsonMatch[0]), usage: usageTracker.getStatus() });
    } else {
      res.json({ rawEmail: response, usage: usageTracker.getStatus() });
    }
  } catch (error) {
    usageTracker.trackGeminiRequest(0, false);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ai/firecrawl-scrape
 * Use Firecrawl to scrape a website for emails (faster than Playwright)
 */
router.post('/firecrawl-scrape', async (req, res) => {
  if (!firecrawl.isConfigured()) {
    return res.status(400).json({ 
      error: 'Firecrawl API key not configured',
      hint: 'Add FIRECRAWL_API_KEY to .env file. Get one at https://firecrawl.dev'
    });
  }

  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const result = await firecrawl.extractEmails(url);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ai/summarize-clinic
 * Summarize clinic information using HuggingFace
 */
router.post('/summarize-clinic', async (req, res) => {
  if (!huggingface.isConfigured()) {
    return res.status(400).json({ error: 'HuggingFace API key not configured' });
  }

  const { text, clinic } = req.body;
  
  const inputText = text || `${clinic?.clinic_name || ''} is a dental clinic located in ${clinic?.city || ''}, ${clinic?.state || ''}. They offer ${clinic?.services || 'dental services'}. Rating: ${clinic?.rating || 'N/A'}`;

  try {
    const result = await huggingface.summarize(inputText);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
