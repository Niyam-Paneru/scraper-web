/**
 * Gemini AI Service
 * 
 * Provides AI-powered features for DentSignal lead generation:
 * - Generate personalized outreach for DentSignal AI voice agent
 * - Analyze clinic data for sales potential
 * - LEAD SCORING for DentSignal sales
 * - Personalized pitch generation
 */

const SYSTEM_PROMPT = `You are a specialized AI assistant for DentSignal - an AI voice agent for dental clinics.

ABOUT DENTSIGNAL:
- AI voice agent that answers dental clinic phones 24/7
- Books appointments directly into practice management systems
- Handles FAQs about insurance, hours, services
- HIPAA compliant
- Costs $149-199/month (less than 1 hour of front desk wages)
- Demo line: (904) 867-9643 - prospects can call anytime to hear it
- Main value prop: Dental clinics miss 30-40% of calls = $20K+/month in lost revenue

YOU CAN HELP WITH:
- Writing personalized outreach emails about DentSignal
- Creating cold call scripts mentioning the demo line
- Scoring leads based on likelihood to buy DentSignal
- Analyzing scraped clinic data for sales potential
- Generating personalized sales pitches
- Suggesting follow-up strategies

KEY SELLING POINTS TO USE:
1. Missed calls = missed revenue ($600+ per new patient)
2. After-hours and lunch breaks are revenue killers
3. No more hold music or voicemail
4. Demo line proves it works: (904) 867-9643
5. ROI: 1 new patient/month covers the cost 10x
6. Better than Weave/competitors - AI actually answers, not just routes

When writing pitches or emails:
- Always mention the demo line: (904) 867-9643
- Focus on missed calls = lost money ($20K/month)
- Be conversational, not corporate
- Keep it short - busy dentists won't read walls of text
- End with clear CTA (call demo or schedule 10-min chat)`;

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
          temperature: 0.35,
          maxOutputTokens: 700,
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
   * Score a lead for DentSignal sales potential
   * Returns a score 1-100 and detailed analysis
   */
  async scoreLeadForVoiceAgent(clinic) {
    const prompt = `Score this dental clinic for DentSignal AI voice agent sales.

CLINIC DATA:
- Name: ${clinic.clinic_name || clinic.name}
- Rating: ${clinic.rating || 'Unknown'}/5 stars
- Reviews: ${clinic.reviewCount || 'Unknown'} reviews
- Phone: ${clinic.phone || 'None'}
- Website: ${clinic.website || 'None'}
- Address: ${clinic.address || 'Unknown'}
- Hours: ${clinic.hours || 'Unknown'}
- City: ${clinic.city || 'Unknown'}, ${clinic.state || ''}

DENTSIGNAL IDEAL CUSTOMER:
- Busy practices (lots of reviews = lots of calls)
- Good reputation (they care about patient experience)
- Has website (tech-savvy, will adopt AI)
- Limited/standard hours (need after-hours solution)
- Solo/small practice (no dedicated call center)

SCORING GUIDE:
90-100: Perfect fit - busy, good reviews, likely drowning in calls
70-89: Great fit - solid practice that would benefit
50-69: Decent fit - might need more convincing
30-49: Weak fit - may have objections
0-29: Poor fit - unlikely to buy

Return a JSON object with EXACTLY this format (no markdown, no code blocks, just raw JSON):
{
  "score": 85,
  "grade": "A",
  "likelihood": "High",
  "reasons": [
    "High volume with 200+ reviews = overwhelmed front desk",
    "4.8 rating shows they prioritize patient experience",
    "Would benefit from 24/7 call coverage"
  ],
  "concerns": [
    "May already use Weave or similar"
  ],
  "bestApproach": "Lead with missed calls during lunch stat",
  "openingLine": "Quick question - how many calls does your team miss during lunch?",
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
   * Generate personalized DentSignal pitch for a clinic
   */
  async generateVoiceAgentPitch(clinic, pitchType = 'cold-call') {
    const clinicName = clinic.clinic_name || clinic.name;
    const pitchTypes = {
      'cold-call': `Create a cold call script for selling DentSignal to ${clinicName}.

The script should:
- Open by asking how many calls they miss during lunch or after hours
- Mention you saw their ${clinic.reviewCount || 'great'} reviews - busy practices miss more calls
- Introduce DentSignal: "AI that answers your phones 24/7, books appointments, sounds natural"
- Give them the demo number: (904) 867-9643 - tell them to call it right now
- Ask for a 10-minute call to show how it works for THEIR practice
- Be under 45 seconds, conversational, not salesy
- Handle "we're not interested" with: "Totally get it. Before I go, what do you do when calls come in during lunch?"

Format with [PAUSE], [IF THEY SAY...], etc.`,

      'email': `Write a cold email from DentSignal to ${clinicName}.

MUST INCLUDE:
- Subject line that creates curiosity (not salesy)
- Open with question about missed calls
- One stat: "Most dental practices miss 30-40% of calls = $20K+ lost revenue/month"
- What DentSignal does in one sentence
- Demo line: (904) 867-9643 - tell them to call it
- CTA: 10-minute chat or just try the demo
- Sign off as the founder, keep it human

Keep under 120 words. No fluff. Sound like a real person, not marketing.`,

      'linkedin': `Write a LinkedIn connection message for the owner/manager of ${clinicName}.

Rules:
- Under 40 words (LinkedIn truncates longer)
- Don't pitch immediately, create curiosity
- Mention you help dental clinics capture missed calls
- Ask a question or offer value
- No "I'd love to connect" generic stuff`,

      'follow-up': `Write a follow-up email for ${clinicName} who didn't respond to the first DentSignal email.

The follow-up should:
- Be even shorter than the first email (under 80 words)
- Reference the demo line again: (904) 867-9643
- Add mild urgency without being pushy
- Try a different angle (maybe they're losing patients to competitors with better phone service)
- End with simple yes/no CTA`,

      'demo-offer': `Write a "demo offer" email for ${clinicName}.

This is for warm leads who showed interest. Include:
- Enthusiasm (but not cheesy)
- What happens in the demo (we set up a test number for their practice)
- It's free and takes 10 minutes
- They can hear how it sounds with their practice name
- Demo line to try first: (904) 867-9643
- Clear scheduling CTA

Keep under 100 words.`
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
