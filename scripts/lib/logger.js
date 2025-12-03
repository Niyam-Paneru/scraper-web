/**
 * Logging utility for the dental scraper
 */
import fs from 'fs';
import path from 'path';

class Logger {
  constructor(logDir = 'logs') {
    this.logDir = logDir;
    this.timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(logDir, `scraper_run_${this.timestamp}.log`);
    this.stats = {
      totalFound: 0,
      validPhones: 0,
      invalidPhones: 0,
      noPhone: 0,
      captchaBlocked: 0,
      errors: 0,
      skipped: 0
    };
    
    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    this.stream = fs.createWriteStream(this.logFile, { flags: 'a' });
    this.log('='.repeat(60));
    this.log(`Dental Scraper Run Started: ${new Date().toISOString()}`);
    this.log('='.repeat(60));
  }

  /**
   * Write to both console and log file
   * @param {string} message
   * @param {string} level - 'info', 'warn', 'error', 'debug'
   */
  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const formattedMsg = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    // Write to file
    this.stream.write(formattedMsg + '\n');
    
    // Write to console with colors
    switch (level) {
      case 'error':
        console.error('\x1b[31m%s\x1b[0m', formattedMsg);
        break;
      case 'warn':
        console.warn('\x1b[33m%s\x1b[0m', formattedMsg);
        break;
      case 'debug':
        if (process.env.DEBUG) {
          console.log('\x1b[36m%s\x1b[0m', formattedMsg);
        }
        break;
      default:
        console.log(formattedMsg);
    }
  }

  info(message) {
    this.log(message, 'info');
  }

  warn(message) {
    this.log(message, 'warn');
  }

  error(message) {
    this.log(message, 'error');
    this.stats.errors++;
  }

  debug(message) {
    this.log(message, 'debug');
  }

  progress(current, total, message = '') {
    const percent = Math.round((current / total) * 100);
    const bar = '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));
    const progressMsg = `[${bar}] ${percent}% (${current}/${total}) ${message}`;
    
    // Clear line and write progress
    process.stdout.write(`\r${progressMsg}`);
    this.stream.write(`[${new Date().toISOString()}] [PROGRESS] ${progressMsg}\n`);
  }

  /**
   * Update statistics
   * @param {string} stat - Stat to update
   * @param {number} value - Value to add (default 1)
   */
  updateStat(stat, value = 1) {
    if (this.stats.hasOwnProperty(stat)) {
      this.stats[stat] += value;
    }
  }

  /**
   * Write final summary
   */
  summary() {
    console.log('\n'); // New line after progress bar
    this.log('='.repeat(60));
    this.log('SCRAPING SUMMARY');
    this.log('='.repeat(60));
    this.log(`Total Records Found: ${this.stats.totalFound}`);
    this.log(`Valid Phone Numbers: ${this.stats.validPhones}`);
    this.log(`Invalid Phone Numbers: ${this.stats.invalidPhones}`);
    this.log(`No Phone Found: ${this.stats.noPhone}`);
    this.log(`Captcha Blocked: ${this.stats.captchaBlocked}`);
    this.log(`Errors: ${this.stats.errors}`);
    this.log(`Skipped (robots.txt): ${this.stats.skipped}`);
    this.log('='.repeat(60));
    this.log(`Run completed at: ${new Date().toISOString()}`);
    this.log(`Log file: ${this.logFile}`);
  }

  /**
   * Close the log stream
   */
  close() {
    this.summary();
    this.stream.end();
  }
}

export default Logger;
