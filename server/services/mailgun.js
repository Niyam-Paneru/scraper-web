/**
 * Mailgun Email Service
 * 
 * Required ENV variables:
 * - MAILGUN_API_KEY: Your Mailgun private API key
 * - MAILGUN_DOMAIN: Your verified sending domain (e.g., dentsignal.me)
 * - MAILGUN_FROM_EMAIL: Your from email (e.g., founder@dentsignal.me)
 * - MAILGUN_FROM_NAME: Your from name (e.g., "John from DentSignal")
 */

import Mailgun from 'mailgun.js';
import formData from 'form-data';

class MailgunService {
  constructor() {
    this.client = null;
    this.domain = process.env.MAILGUN_DOMAIN || '';
    this.fromEmail = process.env.MAILGUN_FROM_EMAIL || '';
    this.fromName = process.env.MAILGUN_FROM_NAME || 'DentSignal';
    
    if (process.env.MAILGUN_API_KEY) {
      const mailgun = new Mailgun(formData);
      this.client = mailgun.client({
        username: 'api',
        key: process.env.MAILGUN_API_KEY
      });
    }
  }

  isConfigured() {
    return !!(this.client && this.domain && this.fromEmail);
  }

  getConfig() {
    return {
      configured: this.isConfigured(),
      domain: this.domain || 'Not set',
      fromEmail: this.fromEmail || 'Not set',
      fromName: this.fromName,
      hasApiKey: !!process.env.MAILGUN_API_KEY
    };
  }

  /**
   * Replace template variables with actual values
   * Variables: {{clinic_name}}, {{owner_name}}, {{city}}, {{state}}, {{website}}
   */
  personalizeTemplate(template, clinic) {
    let personalized = template;
    
    const variables = {
      '{{clinic_name}}': clinic.clinic_name || clinic.name || 'there',
      '{{owner_name}}': clinic.owner_name || 'there',
      '{{city}}': clinic.city || '',
      '{{state}}': clinic.state || '',
      '{{website}}': clinic.website || '',
      '{{phone}}': clinic.phone || clinic.phone_e164 || '',
      '{{address}}': clinic.address || '',
      '{{rating}}': clinic.rating ? `${clinic.rating} stars` : '',
    };

    for (const [key, value] of Object.entries(variables)) {
      personalized = personalized.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
    }

    return personalized;
  }

  /**
   * Send a single email
   */
  async sendEmail({ to, subject, html, text, clinic = {} }) {
    if (!this.isConfigured()) {
      throw new Error('Mailgun not configured. Add MAILGUN_API_KEY, MAILGUN_DOMAIN, and MAILGUN_FROM_EMAIL to .env');
    }

    // Personalize content
    const personalizedSubject = this.personalizeTemplate(subject, clinic);
    const personalizedHtml = this.personalizeTemplate(html, clinic);
    const personalizedText = text ? this.personalizeTemplate(text, clinic) : '';

    const messageData = {
      from: `${this.fromName} <${this.fromEmail}>`,
      to: [to],
      subject: personalizedSubject,
      html: personalizedHtml,
    };

    if (personalizedText) {
      messageData.text = personalizedText;
    }

    try {
      const result = await this.client.messages.create(this.domain, messageData);
      return {
        success: true,
        messageId: result.id,
        to,
        subject: personalizedSubject
      };
    } catch (error) {
      console.error('Mailgun send error:', error);
      return {
        success: false,
        error: error.message,
        to,
        subject: personalizedSubject
      };
    }
  }

  /**
   * Send test email to yourself
   */
  async sendTestEmail({ to, subject, html, text, testClinic }) {
    // Use fake clinic data for test
    const clinic = testClinic || {
      clinic_name: 'Test Dental Clinic',
      owner_name: 'Dr. John Smith',
      city: 'Miami',
      state: 'FL',
      website: 'https://testdental.com',
      phone: '(305) 555-1234',
      address: '123 Main St, Miami, FL 33101',
      rating: '4.8'
    };

    return this.sendEmail({ to, subject, html, text, clinic });
  }

  /**
   * Send bulk emails with delay
   * @param {Array} recipients - Array of { email, clinic } objects
   * @param {Object} template - { subject, html, text }
   * @param {number} delayMs - Delay between emails in ms (default 2 seconds)
   */
  async sendBulk({ recipients, template, delayMs = 2000, onProgress }) {
    if (!this.isConfigured()) {
      throw new Error('Mailgun not configured');
    }

    const results = {
      sent: 0,
      failed: 0,
      errors: [],
      details: []
    };

    for (let i = 0; i < recipients.length; i++) {
      const { email, clinic } = recipients[i];
      
      try {
        const result = await this.sendEmail({
          to: email,
          subject: template.subject,
          html: template.html,
          text: template.text,
          clinic
        });

        if (result.success) {
          results.sent++;
        } else {
          results.failed++;
          results.errors.push({ email, error: result.error });
        }
        
        results.details.push(result);

        // Report progress
        if (onProgress) {
          onProgress({
            current: i + 1,
            total: recipients.length,
            sent: results.sent,
            failed: results.failed,
            lastEmail: email
          });
        }

        // Delay before next email (except for last one)
        if (i < recipients.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        results.failed++;
        results.errors.push({ email, error: error.message });
      }
    }

    return results;
  }

  /**
   * Validate email format
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

const mailgunService = new MailgunService();
export default mailgunService;
