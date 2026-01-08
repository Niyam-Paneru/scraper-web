/**
 * Email Queue Service
 * 
 * Handles throttled email sending and scheduled follow-ups.
 * Persists queue to disk so it survives server restarts.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mailgunService from './mailgun.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../../data');
const QUEUE_FILE = path.join(DATA_DIR, 'email-queue.json');
const CONTACTS_FILE = path.join(DATA_DIR, 'contacts.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class EmailQueueService {
  constructor() {
    // Queue of pending emails
    this.queue = [];
    // Scheduled follow-ups
    this.scheduled = [];
    // Contact statuses for pipeline
    this.contacts = {};
    // Sending state
    this.isSending = false;
    this.sendInterval = null;
    this.checkInterval = null;
    // Config
    this.sendDelayMs = 5 * 60 * 1000; // 5 minutes between emails
    this.maxPerDay = 50;
    this.sentToday = 0;
    this.lastResetDate = new Date().toDateString();
    
    // Load persisted data
    this.load();
    
    // Start the queue processor
    this.startProcessor();
  }

  /**
   * Load queue and contacts from disk
   */
  load() {
    try {
      if (fs.existsSync(QUEUE_FILE)) {
        const data = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
        this.queue = data.queue || [];
        this.scheduled = data.scheduled || [];
        this.sentToday = data.sentToday || 0;
        this.lastResetDate = data.lastResetDate || new Date().toDateString();
      }
    } catch (err) {
      console.error('Failed to load email queue:', err.message);
    }

    try {
      if (fs.existsSync(CONTACTS_FILE)) {
        this.contacts = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf-8'));
      }
    } catch (err) {
      console.error('Failed to load contacts:', err.message);
    }
  }

  /**
   * Save queue and contacts to disk
   */
  save() {
    try {
      fs.writeFileSync(QUEUE_FILE, JSON.stringify({
        queue: this.queue,
        scheduled: this.scheduled,
        sentToday: this.sentToday,
        lastResetDate: this.lastResetDate
      }, null, 2));
    } catch (err) {
      console.error('Failed to save email queue:', err.message);
    }

    try {
      fs.writeFileSync(CONTACTS_FILE, JSON.stringify(this.contacts, null, 2));
    } catch (err) {
      console.error('Failed to save contacts:', err.message);
    }
  }

  /**
   * Reset daily counter if new day
   */
  checkDayReset() {
    const today = new Date().toDateString();
    if (today !== this.lastResetDate) {
      this.sentToday = 0;
      this.lastResetDate = today;
      this.save();
    }
  }

  /**
   * Add emails to the queue
   * @param {Array} emails - Array of { email, clinic, templateType, subject, html }
   * @param {boolean} withFollowups - Schedule follow-ups at 3 and 7 days
   */
  addToQueue(emails, withFollowups = true) {
    const now = Date.now();
    
    for (const item of emails) {
      const contactId = item.clinic.clinic_id || item.clinic.email;
      
      // Add to queue
      this.queue.push({
        id: `q_${now}_${Math.random().toString(36).substr(2, 9)}`,
        email: item.email,
        clinic: item.clinic,
        templateType: item.templateType || 'intro',
        subject: item.subject,
        html: item.html,
        addedAt: now,
        status: 'pending'
      });

      // Track contact
      if (!this.contacts[contactId]) {
        this.contacts[contactId] = {
          email: item.email,
          clinic: item.clinic,
          status: 'new',
          introSentAt: null,
          followup1SentAt: null,
          followup2SentAt: null,
          repliedAt: null,
          createdAt: now
        };
      }

      // Schedule follow-ups if requested
      if (withFollowups) {
        // Follow-up 1: 3 days later
        this.scheduled.push({
          id: `s_${now}_fu1_${Math.random().toString(36).substr(2, 9)}`,
          contactId,
          templateType: 'followup1',
          sendAt: now + (3 * 24 * 60 * 60 * 1000), // 3 days
          status: 'scheduled'
        });

        // Follow-up 2: 7 days later
        this.scheduled.push({
          id: `s_${now}_fu2_${Math.random().toString(36).substr(2, 9)}`,
          contactId,
          templateType: 'followup2',
          sendAt: now + (7 * 24 * 60 * 60 * 1000), // 7 days
          status: 'scheduled'
        });
      }
    }

    this.save();
    return { added: emails.length, queueLength: this.queue.length };
  }

  /**
   * Start the queue processor
   */
  startProcessor() {
    // Process queue every minute
    this.sendInterval = setInterval(() => this.processQueue(), 60 * 1000);
    
    // Check scheduled follow-ups every 15 minutes
    this.checkInterval = setInterval(() => this.checkScheduled(), 15 * 60 * 1000);
    
    console.log('📧 Email queue processor started');
  }

  /**
   * Process pending emails in queue
   */
  async processQueue() {
    if (this.isSending) return;
    if (this.queue.length === 0) return;
    
    this.checkDayReset();
    
    if (this.sentToday >= this.maxPerDay) {
      console.log(`📧 Daily limit reached (${this.maxPerDay}), waiting until tomorrow`);
      return;
    }

    const now = Date.now();
    const pending = this.queue.filter(q => q.status === 'pending');
    if (pending.length === 0) return;

    // Check if enough time has passed since last send
    const lastSent = this.queue
      .filter(q => q.status === 'sent' && q.sentAt)
      .sort((a, b) => b.sentAt - a.sentAt)[0];
    
    if (lastSent && (now - lastSent.sentAt) < this.sendDelayMs) {
      return; // Not enough time has passed
    }

    this.isSending = true;
    const item = pending[0];

    try {
      if (!mailgunService.isConfigured()) {
        console.log('📧 Mailgun not configured, skipping send');
        this.isSending = false;
        return;
      }

      const result = await mailgunService.sendEmail({
        to: item.email,
        subject: item.subject,
        html: item.html,
        clinic: item.clinic
      });

      if (result.success) {
        item.status = 'sent';
        item.sentAt = now;
        item.messageId = result.messageId;
        this.sentToday++;

        // Update contact status
        const contactId = item.clinic.clinic_id || item.clinic.email;
        if (this.contacts[contactId]) {
          this.contacts[contactId].status = 'emailed';
          if (item.templateType === 'intro') {
            this.contacts[contactId].introSentAt = now;
          } else if (item.templateType === 'followup1') {
            this.contacts[contactId].followup1SentAt = now;
          } else if (item.templateType === 'followup2') {
            this.contacts[contactId].followup2SentAt = now;
          }
        }

        console.log(`📧 Sent email to ${item.email} (${this.sentToday}/${this.maxPerDay} today)`);
      } else {
        item.status = 'failed';
        item.error = result.error;
        console.error(`📧 Failed to send to ${item.email}:`, result.error);
      }

      this.save();
    } catch (err) {
      item.status = 'failed';
      item.error = err.message;
      console.error(`📧 Error sending to ${item.email}:`, err.message);
      this.save();
    } finally {
      this.isSending = false;
    }
  }

  /**
   * Check scheduled follow-ups and add to queue if due
   */
  async checkScheduled() {
    const now = Date.now();
    const due = this.scheduled.filter(s => s.status === 'scheduled' && s.sendAt <= now);

    for (const item of due) {
      const contact = this.contacts[item.contactId];
      if (!contact) {
        item.status = 'cancelled';
        continue;
      }

      // Don't send follow-up if contact already replied
      if (contact.status === 'replied' || contact.status === 'demo_booked' || contact.status === 'closed') {
        item.status = 'cancelled';
        continue;
      }

      // Get the right template
      let template;
      if (item.templateType === 'followup1') {
        template = {
          subject: 'Did you try the demo? - {{clinic_name}}',
          html: `Hi {{owner_name}},

Following up on my note about missed calls at {{clinic_name}}.

Did you get a chance to call our AI demo line? (904) 867-9643

Most dentists who try it are pretty surprised - it sounds natural, books appointments, and answers insurance questions.

I'd love to show you how this could work for your specific practice. 10 minutes?

Best,
DentSignal Team`
        };
      } else if (item.templateType === 'followup2') {
        template = {
          subject: 'Closing the loop - {{clinic_name}}',
          html: `Hi {{owner_name}},

I've reached out a couple times about helping {{clinic_name}} capture more revenue from missed calls, but haven't heard back.

No worries at all - I know you're busy. I'll assume the timing isn't right and won't keep bugging you.

If anything changes, our demo line is always available: (904) 867-9643

Best of luck with everything at {{clinic_name}}!

DentSignal Team`
        };
      }

      if (template) {
        // Add to queue
        this.queue.push({
          id: `q_${now}_${Math.random().toString(36).substr(2, 9)}`,
          email: contact.email,
          clinic: contact.clinic,
          templateType: item.templateType,
          subject: template.subject,
          html: template.html,
          addedAt: now,
          status: 'pending',
          scheduledId: item.id
        });
        item.status = 'queued';
      }
    }

    this.save();
  }

  /**
   * Handle reply webhook from Mailgun
   */
  handleReply(senderEmail) {
    // Find contact by email
    const contactId = Object.keys(this.contacts).find(id => 
      this.contacts[id].email === senderEmail
    );

    if (contactId) {
      this.contacts[contactId].status = 'replied';
      this.contacts[contactId].repliedAt = Date.now();

      // Cancel any pending follow-ups
      this.scheduled
        .filter(s => s.contactId === contactId && s.status === 'scheduled')
        .forEach(s => { s.status = 'cancelled'; });

      // Remove from queue
      this.queue = this.queue.filter(q => 
        q.status !== 'pending' || q.clinic.email !== senderEmail
      );

      this.save();
      console.log(`📧 Reply received from ${senderEmail}, moved to replied`);
      return true;
    }

    return false;
  }

  /**
   * Update contact status (for manual updates)
   */
  updateContactStatus(contactId, status) {
    if (this.contacts[contactId]) {
      this.contacts[contactId].status = status;
      
      if (status === 'demo_booked' || status === 'closed') {
        // Cancel pending follow-ups
        this.scheduled
          .filter(s => s.contactId === contactId && s.status === 'scheduled')
          .forEach(s => { s.status = 'cancelled'; });
      }

      this.save();
      return true;
    }
    return false;
  }

  /**
   * Get queue status
   */
  getStatus() {
    this.checkDayReset();
    
    const pending = this.queue.filter(q => q.status === 'pending').length;
    const sent = this.queue.filter(q => q.status === 'sent').length;
    const failed = this.queue.filter(q => q.status === 'failed').length;
    const scheduledCount = this.scheduled.filter(s => s.status === 'scheduled').length;

    // Calculate next send time
    const lastSent = this.queue
      .filter(q => q.status === 'sent' && q.sentAt)
      .sort((a, b) => b.sentAt - a.sentAt)[0];
    
    let nextSendIn = 0;
    if (lastSent) {
      const elapsed = Date.now() - lastSent.sentAt;
      nextSendIn = Math.max(0, this.sendDelayMs - elapsed);
    }

    return {
      queue: {
        pending,
        sent,
        failed,
        total: this.queue.length
      },
      scheduled: scheduledCount,
      today: {
        sent: this.sentToday,
        limit: this.maxPerDay,
        remaining: this.maxPerDay - this.sentToday
      },
      nextSendIn: Math.round(nextSendIn / 1000), // seconds
      isProcessing: this.isSending
    };
  }

  /**
   * Get pipeline stats
   */
  getPipelineStats() {
    const contacts = Object.values(this.contacts);
    return {
      new: contacts.filter(c => c.status === 'new').length,
      emailed: contacts.filter(c => c.status === 'emailed').length,
      replied: contacts.filter(c => c.status === 'replied').length,
      demo_booked: contacts.filter(c => c.status === 'demo_booked').length,
      closed: contacts.filter(c => c.status === 'closed').length,
      total: contacts.length
    };
  }

  /**
   * Get all contacts
   */
  getContacts() {
    return this.contacts;
  }

  /**
   * Clear completed/failed from queue (keep last 100)
   */
  cleanup() {
    const pending = this.queue.filter(q => q.status === 'pending');
    const completed = this.queue
      .filter(q => q.status !== 'pending')
      .slice(-100);
    this.queue = [...pending, ...completed];
    
    // Clean old scheduled items
    this.scheduled = this.scheduled.filter(s => 
      s.status === 'scheduled' || 
      (s.status !== 'scheduled' && Date.now() - s.sendAt < 7 * 24 * 60 * 60 * 1000)
    );
    
    this.save();
  }

  /**
   * Cancel all pending for a contact
   */
  cancelForContact(contactId) {
    this.queue = this.queue.filter(q => 
      q.status !== 'pending' || 
      (q.clinic.clinic_id !== contactId && q.clinic.email !== contactId)
    );
    
    this.scheduled
      .filter(s => s.contactId === contactId && s.status === 'scheduled')
      .forEach(s => { s.status = 'cancelled'; });
    
    this.save();
  }
}

const emailQueueService = new EmailQueueService();
export default emailQueueService;
