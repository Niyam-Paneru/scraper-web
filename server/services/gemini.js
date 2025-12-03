/**
 * Gemini AI Service
 * 
 * Provides AI-powered features for the dental scraper:
 * - Generate personalized outreach emails
 * - Analyze clinic data
 * - Answer project-related questions ONLY
 * - LEAD SCORING for AI voice agent sales
 * - Personalized pitch generation
 */

const SYSTEM_PROMPT = `You are a specialized AI assistant for the Dental Clinic Prospect Finder tool. 
Your ONLY purpose is to help users with tasks related to dental clinic prospecting and selling AI voice agent services.

YOU CAN HELP WITH:
- Writing personalized outreach emails to dental clinics
- Analyzing scraped clinic data for sales potential
- Scoring leads based on likelihood to buy AI voice agent services
- Creating call scripts for AI voice agents
- Generating personalized sales pitches
- Suggesting follow-up strategies
- Prioritizing which clinics to contact first

YOU CANNOT HELP WITH:
- General knowledge questions (geography, history, science, etc.)
- Anything unrelated to dental clinic prospecting or AI voice agent sales
- Personal advice or opinions on non-work topics
- Coding or technical questions outside this tool

If asked about anything outside your scope, respond with:
"I'm specifically designed to help with dental clinic prospecting and AI voice agent sales. I can help you score leads, write pitches, or create outreach strategies. What would you like me to help with?"

CONTEXT ABOUT THE USER'S BUSINESS:
The user is selling an AI Voice Agent service to dental clinics. The AI can:
- Automatically call patients to remind them of appointments
- Schedule new appointments
- Handle patient inquiries 24/7
- Follow up on missed appointments
- The user offers a demo and free trial
- Future features: Auto-calling, social media ads integration, lead generation

When writing pitches or emails:
- Be professional but conversational
- Focus on the clinic's pain points (missed calls, no-shows, after-hours inquiries)
- Highlight ROI (more appointments = more revenue)
- Offer a free demo or trial
- Keep it concise and action-oriented`;

class GeminiService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
  }

  /**
   * Generate content using Gemini API
   */
  async generate(prompt, context = {}) {
    if (!this.apiKey) {
      throw new Error('Gemini API key not configured');
    }

    const fullPrompt = this.buildPrompt(prompt, context);

    const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: fullPrompt }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ]
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Gemini API error');
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';
  }

  /**
   * Build the full prompt with system context
   */
  buildPrompt(userPrompt, context) {
    let prompt = SYSTEM_PROMPT + '\n\n';

    // Add clinic context if provided
    if (context.clinic) {
      prompt += `CURRENT CLINIC DATA:\n`;
      prompt += `- Name: ${context.clinic.clinic_name}\n`;
      prompt += `- Phone: ${context.clinic.phone || 'N/A'}\n`;
      prompt += `- Email: ${context.clinic.email || 'N/A'}\n`;
      prompt += `- Address: ${context.clinic.address}, ${context.clinic.city}, ${context.clinic.state}\n`;
      prompt += `- Website: ${context.clinic.website || 'N/A'}\n\n`;
    }

    // Add all clinics summary if provided
    if (context.allClinics && context.allClinics.length > 0) {
      prompt += `SCRAPED CLINICS SUMMARY:\n`;
      prompt += `- Total clinics: ${context.allClinics.length}\n`;
      prompt += `- With valid phone: ${context.allClinics.filter(c => c.phone_e164).length}\n`;
      prompt += `- With email: ${context.allClinics.filter(c => c.email).length}\n`;
      prompt += `- Cities: ${[...new Set(context.allClinics.map(c => c.city).filter(Boolean))].slice(0, 5).join(', ')}\n\n`;
    }

    // Add user's business context if provided
    if (context.userBusiness) {
      prompt += `USER'S BUSINESS:\n${context.userBusiness}\n\n`;
    }

    prompt += `USER REQUEST: ${userPrompt}`;

    return prompt;
  }

  /**
   * Generate outreach email for a specific clinic
   */
  async generateEmail(clinic, emailType = 'introduction', customContext = '') {
    const emailPrompts = {
      introduction: `Write a professional introduction email to ${clinic.clinic_name} introducing our AI voice agent service that can help dental clinics with appointment scheduling, reminders, and patient follow-ups.`,
      followup: `Write a follow-up email to ${clinic.clinic_name} checking if they had a chance to review our previous message about AI voice agent services.`,
      appointment: `Write an email to ${clinic.clinic_name} requesting a quick 15-minute call to demonstrate how our AI voice agent can help their practice.`,
      custom: customContext
    };

    const prompt = emailPrompts[emailType] || emailPrompts.introduction;
    return this.generate(prompt, { clinic });
  }

  /**
   * Generate call script for AI voice agent
   */
  async generateCallScript(clinic) {
    const prompt = `Create a brief, natural-sounding call script for an AI voice agent calling ${clinic.clinic_name}. 
The purpose is to introduce our AI receptionist service and schedule a demo.
Make it conversational, under 200 words, with clear pauses and response handling.`;

    return this.generate(prompt, { clinic });
  }

  /**
   * Analyze clinic data and provide insights
   */
  async analyzeData(clinics) {
    const prompt = `Analyze this batch of ${clinics.length} dental clinics and provide:
1. Best times to reach out
2. Which clinics to prioritize (those with websites, valid phones)
3. Suggested personalization strategies
4. Any patterns you notice`;

    return this.generate(prompt, { allClinics: clinics });
  }

  /**
   * Bulk generate emails for multiple clinics
   */
  async bulkGenerateEmails(clinics, emailType = 'introduction') {
    const emails = [];
    for (const clinic of clinics) {
      try {
        const email = await this.generateEmail(clinic, emailType);
        emails.push({
          clinic_id: clinic.clinic_id,
          clinic_name: clinic.clinic_name,
          email_content: email,
          status: 'generated'
        });
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 500));
      } catch (error) {
        emails.push({
          clinic_id: clinic.clinic_id,
          clinic_name: clinic.clinic_name,
          email_content: null,
          status: 'error',
          error: error.message
        });
      }
    }
    return emails;
  }

  /**
   * Score a lead for AI voice agent sales potential
   * Returns a score 1-100 and detailed analysis
   */
  async scoreLeadForVoiceAgent(clinic) {
    const prompt = `Analyze this dental clinic and score their likelihood to purchase an AI voice agent service.

CLINIC DATA:
- Name: ${clinic.clinic_name || clinic.name}
- Rating: ${clinic.rating || 'Unknown'}/5 stars
- Reviews: ${clinic.reviewCount || 'Unknown'} reviews
- Phone: ${clinic.phone || 'None'}
- Website: ${clinic.website || 'None'}
- Address: ${clinic.address || 'Unknown'}
- Hours: ${clinic.hours || 'Unknown'}
- City: ${clinic.city || 'Unknown'}, ${clinic.state || ''}

SCORING CRITERIA:
1. BUSY PRACTICE (High reviews = busy = needs help with calls)
2. GOOD REPUTATION (High rating = they care about patient experience)
3. HAS WEBSITE (Tech-savvy, more likely to adopt AI)
4. LIMITED HOURS (Need after-hours solution)
5. LOCATION (Competitive markets = more pressure to innovate)

Return a JSON object with EXACTLY this format (no markdown, no code blocks, just raw JSON):
{
  "score": 85,
  "grade": "A",
  "likelihood": "High",
  "reasons": [
    "High volume practice with 1000+ reviews needs automation",
    "5-star rating shows they value patient experience",
    "Limited hours create need for 24/7 AI receptionist"
  ],
  "concerns": [
    "May already have staff handling calls"
  ],
  "bestApproach": "Lead with the after-hours coverage angle",
  "suggestedPitch": "Brief 2-sentence pitch",
  "priority": 1
}`;

    try {
      const response = await this.generate(prompt, {});
      // Try to parse as JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      // Fallback: return raw response wrapped
      return { score: 50, grade: 'C', raw: response };
    } catch (error) {
      console.error('Lead scoring error:', error);
      return { score: 50, grade: 'C', error: error.message };
    }
  }

  /**
   * Score multiple leads and prioritize them
   */
  async scoreAndPrioritizeLeads(clinics) {
    const scoredLeads = [];
    
    for (const clinic of clinics) {
      try {
        const score = await this.scoreLeadForVoiceAgent(clinic);
        scoredLeads.push({
          ...clinic,
          leadScore: score
        });
        // Rate limiting delay
        await new Promise(r => setTimeout(r, 300));
      } catch (error) {
        scoredLeads.push({
          ...clinic,
          leadScore: { score: 0, error: error.message }
        });
      }
    }
    
    // Sort by score descending
    return scoredLeads.sort((a, b) => (b.leadScore?.score || 0) - (a.leadScore?.score || 0));
  }

  /**
   * Generate personalized AI voice agent pitch for a clinic
   */
  async generateVoiceAgentPitch(clinic, pitchType = 'cold-call') {
    const pitchTypes = {
      'cold-call': `Create a cold call script for selling an AI voice agent to ${clinic.clinic_name || clinic.name}.
The call should:
- Be natural and conversational (not salesy)
- Start with a question about their current appointment scheduling
- Mention their great reviews (${clinic.reviewCount || 'many'} reviews, ${clinic.rating || 'high'} stars)
- Offer a free demo
- Be under 60 seconds when spoken
- Handle objections gracefully

Format as a script with [PAUSE], [IF OBJECTION], etc.`,

      'email': `Write a cold email to ${clinic.clinic_name || clinic.name} (${clinic.address || 'location unknown'}).
Pitch our AI voice agent that can:
- Call patients to remind them of appointments
- Schedule appointments 24/7
- Handle after-hours inquiries
- Reduce no-shows by 40%

Reference their ${clinic.reviewCount || ''} reviews and ${clinic.rating || ''} rating.
Offer a free demo. Keep it under 150 words.`,

      'linkedin': `Write a LinkedIn message to the owner/manager of ${clinic.clinic_name || clinic.name}.
Keep it super short (under 50 words), professional, and offer value.
Mention AI voice agents for dental clinics.`,

      'follow-up': `Write a follow-up message for ${clinic.clinic_name || clinic.name}.
Reference a previous conversation about AI voice agents.
Add urgency without being pushy.
Offer to answer any questions.`,

      'demo-offer': `Create a demo offer email for ${clinic.clinic_name || clinic.name}.
Explain:
- How the AI voice agent demo works
- They can test it with their own patients
- No commitment required
- We'll set up a custom demo for their clinic
- Include a clear call-to-action`
    };

    const prompt = pitchTypes[pitchType] || pitchTypes['cold-call'];
    return this.generate(prompt, { clinic });
  }

  /**
   * Analyze why a clinic would benefit from AI voice agent
   */
  async analyzeVoiceAgentFit(clinic) {
    const prompt = `Analyze why ${clinic.clinic_name || clinic.name} would benefit from an AI voice agent.

CLINIC DATA:
- Name: ${clinic.clinic_name || clinic.name}
- Rating: ${clinic.rating}/5 (${clinic.reviewCount} reviews)
- Hours: ${clinic.hours || 'Standard business hours'}
- Location: ${clinic.city}, ${clinic.state}

Identify:
1. Their likely pain points (missed calls, no-shows, after-hours inquiries)
2. How AI voice agent solves each pain point
3. Potential ROI (estimate appointments saved per month)
4. Best features to highlight for THIS clinic
5. Potential objections and how to overcome them

Be specific to dental clinics and this particular practice.`;

    return this.generate(prompt, { clinic });
  }
}

export default GeminiService;
