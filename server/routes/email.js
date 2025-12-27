/**
 * Email Campaign Routes
 * Handles email template management and sending via Mailgun
 */

import express from 'express';
import mailgunService from '../services/mailgun.js';

const router = express.Router();

// Store email templates in memory (you could use a database later)
let emailTemplates = [
  {
    id: 'default',
    name: 'Introduction Template',
    subject: 'Quick question for {{clinic_name}}',
    html: `<p>Hi {{owner_name}},</p>

<p>I came across {{clinic_name}} while researching dental practices in {{city}}, and I was impressed by your {{rating}} rating.</p>

<p>I'm reaching out because we help dental clinics like yours [YOUR VALUE PROPOSITION HERE].</p>

<p>Would you be open to a quick 10-minute call this week to see if it might be a fit?</p>

<p>Best regards,<br>
[YOUR NAME]<br>
[YOUR COMPANY]</p>

<p style="font-size: 12px; color: #666;">
If you'd prefer not to receive emails from us, just reply with "unsubscribe" and we'll remove you immediately.
</p>`,
    text: '',
    createdAt: new Date().toISOString()
  }
];

// Campaign history
let campaignHistory = [];

/**
 * GET /api/email/status
 * Get Mailgun configuration status
 */
router.get('/status', (req, res) => {
  res.json(mailgunService.getConfig());
});

/**
 * GET /api/email/templates
 * Get all email templates
 */
router.get('/templates', (req, res) => {
  res.json(emailTemplates);
});

/**
 * POST /api/email/templates
 * Create a new template
 */
router.post('/templates', (req, res) => {
  const { name, subject, html, text } = req.body;
  
  if (!name || !subject || !html) {
    return res.status(400).json({ error: 'Name, subject, and HTML content are required' });
  }

  const template = {
    id: `template_${Date.now()}`,
    name,
    subject,
    html,
    text: text || '',
    createdAt: new Date().toISOString()
  };

  emailTemplates.push(template);
  res.json(template);
});

/**
 * PUT /api/email/templates/:id
 * Update a template
 */
router.put('/templates/:id', (req, res) => {
  const { id } = req.params;
  const { name, subject, html, text } = req.body;
  
  const index = emailTemplates.findIndex(t => t.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Template not found' });
  }

  emailTemplates[index] = {
    ...emailTemplates[index],
    name: name || emailTemplates[index].name,
    subject: subject || emailTemplates[index].subject,
    html: html || emailTemplates[index].html,
    text: text !== undefined ? text : emailTemplates[index].text,
    updatedAt: new Date().toISOString()
  };

  res.json(emailTemplates[index]);
});

/**
 * DELETE /api/email/templates/:id
 * Delete a template
 */
router.delete('/templates/:id', (req, res) => {
  const { id } = req.params;
  
  if (id === 'default') {
    return res.status(400).json({ error: 'Cannot delete default template' });
  }

  const index = emailTemplates.findIndex(t => t.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Template not found' });
  }

  emailTemplates.splice(index, 1);
  res.json({ message: 'Template deleted' });
});

/**
 * POST /api/email/preview
 * Preview personalized email for a clinic
 */
router.post('/preview', (req, res) => {
  const { subject, html, clinic } = req.body;
  
  if (!subject || !html) {
    return res.status(400).json({ error: 'Subject and HTML are required' });
  }

  const personalizedSubject = mailgunService.personalizeTemplate(subject, clinic || {});
  const personalizedHtml = mailgunService.personalizeTemplate(html, clinic || {});

  res.json({
    subject: personalizedSubject,
    html: personalizedHtml,
    clinic
  });
});

/**
 * POST /api/email/send-test
 * Send a test email to yourself
 */
router.post('/send-test', async (req, res) => {
  const { to, subject, html, text, testClinic } = req.body;
  
  if (!to) {
    return res.status(400).json({ error: 'Recipient email (to) is required' });
  }

  if (!mailgunService.isValidEmail(to)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  if (!mailgunService.isConfigured()) {
    return res.status(400).json({ 
      error: 'Mailgun not configured',
      help: 'Add MAILGUN_API_KEY, MAILGUN_DOMAIN, and MAILGUN_FROM_EMAIL to your .env file'
    });
  }

  try {
    const result = await mailgunService.sendTestEmail({
      to,
      subject: subject || 'Test Email from DentSignal',
      html: html || '<p>This is a test email. If you see this, your email setup is working!</p>',
      text,
      testClinic
    });

    if (result.success) {
      res.json({
        success: true,
        message: `Test email sent to ${to}`,
        messageId: result.messageId
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/email/send
 * Send email to a single recipient
 */
router.post('/send', async (req, res) => {
  const { to, subject, html, text, clinic } = req.body;
  
  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'To, subject, and HTML are required' });
  }

  if (!mailgunService.isConfigured()) {
    return res.status(400).json({ 
      error: 'Mailgun not configured',
      help: 'Add MAILGUN_API_KEY, MAILGUN_DOMAIN, and MAILGUN_FROM_EMAIL to your .env file'
    });
  }

  try {
    const result = await mailgunService.sendEmail({
      to,
      subject,
      html,
      text,
      clinic: clinic || {}
    });

    // Log to history
    campaignHistory.push({
      id: `email_${Date.now()}`,
      type: 'single',
      to,
      subject: result.subject,
      success: result.success,
      error: result.error,
      sentAt: new Date().toISOString()
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/email/send-bulk
 * Send emails to multiple recipients
 */
router.post('/send-bulk', async (req, res) => {
  const { recipients, template, delayMs } = req.body;
  
  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'Recipients array is required' });
  }

  if (!template || !template.subject || !template.html) {
    return res.status(400).json({ error: 'Template with subject and html is required' });
  }

  if (!mailgunService.isConfigured()) {
    return res.status(400).json({ 
      error: 'Mailgun not configured',
      help: 'Add MAILGUN_API_KEY, MAILGUN_DOMAIN, and MAILGUN_FROM_EMAIL to your .env file'
    });
  }

  // Validate all emails
  const invalidEmails = recipients.filter(r => !mailgunService.isValidEmail(r.email));
  if (invalidEmails.length > 0) {
    return res.status(400).json({ 
      error: 'Invalid email addresses found',
      invalidEmails: invalidEmails.map(r => r.email)
    });
  }

  // Limit bulk send to 50 at a time
  if (recipients.length > 50) {
    return res.status(400).json({ 
      error: 'Maximum 50 recipients per bulk send',
      count: recipients.length
    });
  }

  try {
    const results = await mailgunService.sendBulk({
      recipients,
      template,
      delayMs: delayMs || 2000
    });

    // Log to history
    campaignHistory.push({
      id: `campaign_${Date.now()}`,
      type: 'bulk',
      recipientCount: recipients.length,
      sent: results.sent,
      failed: results.failed,
      template: template.subject,
      sentAt: new Date().toISOString()
    });

    res.json({
      success: true,
      ...results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/email/history
 * Get email campaign history
 */
router.get('/history', (req, res) => {
  res.json(campaignHistory.slice(-100).reverse()); // Last 100, newest first
});

/**
 * GET /api/email/variables
 * Get available template variables
 */
router.get('/variables', (req, res) => {
  res.json({
    variables: [
      { key: '{{clinic_name}}', description: 'Name of the dental clinic' },
      { key: '{{owner_name}}', description: 'Owner/doctor name (if available)' },
      { key: '{{city}}', description: 'City of the clinic' },
      { key: '{{state}}', description: 'State of the clinic' },
      { key: '{{website}}', description: 'Clinic website URL' },
      { key: '{{phone}}', description: 'Clinic phone number' },
      { key: '{{address}}', description: 'Full address' },
      { key: '{{rating}}', description: 'Google rating (e.g., "4.8 stars")' }
    ]
  });
});

export default router;
