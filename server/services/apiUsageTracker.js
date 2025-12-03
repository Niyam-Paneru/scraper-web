/**
 * API Usage Tracker
 * Tracks Gemini API usage and rate limits
 * 
 * Free Tier Limits (as of Dec 2024):
 * - Gemini 2.0 Flash: 15 RPM, 1M TPM, 1500 RPD
 * - Gemini Maps Grounding: 500 requests/day
 */

class ApiUsageTracker {
  constructor() {
    // Reset usage at midnight
    this.resetDaily();
    
    // Track per-minute requests for rate limiting
    this.minuteRequests = [];
    
    // Limits (Gemini Free Tier)
    this.limits = {
      gemini: {
        requestsPerMinute: 15,
        requestsPerDay: 1500,
        tokensPerMinute: 1000000
      },
      geminiMaps: {
        requestsPerDay: 500
      }
    };
  }

  resetDaily() {
    const now = new Date();
    this.dailyReset = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    
    this.usage = {
      gemini: {
        requestsToday: 0,
        tokensToday: 0,
        lastRequest: null,
        errors: 0
      },
      geminiMaps: {
        requestsToday: 0,
        lastRequest: null,
        errors: 0
      }
    };
  }

  // Check if we need to reset (new day)
  checkReset() {
    if (new Date() >= this.dailyReset) {
      this.resetDaily();
    }
  }

  // Track a Gemini API request
  trackGeminiRequest(tokensUsed = 0, success = true) {
    this.checkReset();
    
    const now = Date.now();
    this.usage.gemini.requestsToday++;
    this.usage.gemini.tokensToday += tokensUsed;
    this.usage.gemini.lastRequest = new Date().toISOString();
    
    if (!success) {
      this.usage.gemini.errors++;
    }
    
    // Track per-minute requests
    this.minuteRequests.push(now);
    this.minuteRequests = this.minuteRequests.filter(t => now - t < 60000);
    
    return this.getStatus();
  }

  // Track a Gemini Maps request
  trackGeminiMapsRequest(success = true) {
    this.checkReset();
    
    this.usage.geminiMaps.requestsToday++;
    this.usage.geminiMaps.lastRequest = new Date().toISOString();
    
    if (!success) {
      this.usage.geminiMaps.errors++;
    }
    
    return this.getStatus();
  }

  // Check if we're approaching limits
  checkLimits() {
    this.checkReset();
    
    const now = Date.now();
    const recentRequests = this.minuteRequests.filter(t => now - t < 60000).length;
    
    return {
      gemini: {
        rateLimited: recentRequests >= this.limits.gemini.requestsPerMinute,
        dailyLimitReached: this.usage.gemini.requestsToday >= this.limits.gemini.requestsPerDay,
        requestsThisMinute: recentRequests,
        warningLevel: this.getWarningLevel('gemini')
      },
      geminiMaps: {
        dailyLimitReached: this.usage.geminiMaps.requestsToday >= this.limits.geminiMaps.requestsPerDay,
        warningLevel: this.getWarningLevel('geminiMaps')
      }
    };
  }

  // Get warning level (none, low, medium, high, critical)
  getWarningLevel(service) {
    this.checkReset();
    
    let percentUsed;
    if (service === 'gemini') {
      percentUsed = (this.usage.gemini.requestsToday / this.limits.gemini.requestsPerDay) * 100;
    } else {
      percentUsed = (this.usage.geminiMaps.requestsToday / this.limits.geminiMaps.requestsPerDay) * 100;
    }
    
    if (percentUsed >= 100) return 'critical';
    if (percentUsed >= 90) return 'high';
    if (percentUsed >= 75) return 'medium';
    if (percentUsed >= 50) return 'low';
    return 'none';
  }

  // Get current status
  getStatus() {
    this.checkReset();
    
    const now = Date.now();
    const recentRequests = this.minuteRequests.filter(t => now - t < 60000).length;
    const timeUntilReset = Math.max(0, this.dailyReset - new Date());
    const hoursUntilReset = Math.floor(timeUntilReset / (1000 * 60 * 60));
    const minutesUntilReset = Math.floor((timeUntilReset % (1000 * 60 * 60)) / (1000 * 60));
    
    return {
      gemini: {
        used: this.usage.gemini.requestsToday,
        limit: this.limits.gemini.requestsPerDay,
        remaining: this.limits.gemini.requestsPerDay - this.usage.gemini.requestsToday,
        percentUsed: Math.round((this.usage.gemini.requestsToday / this.limits.gemini.requestsPerDay) * 100),
        tokensUsed: this.usage.gemini.tokensToday,
        requestsThisMinute: recentRequests,
        requestsPerMinuteLimit: this.limits.gemini.requestsPerMinute,
        errors: this.usage.gemini.errors,
        lastRequest: this.usage.gemini.lastRequest,
        warningLevel: this.getWarningLevel('gemini')
      },
      geminiMaps: {
        used: this.usage.geminiMaps.requestsToday,
        limit: this.limits.geminiMaps.requestsPerDay,
        remaining: this.limits.geminiMaps.requestsPerDay - this.usage.geminiMaps.requestsToday,
        percentUsed: Math.round((this.usage.geminiMaps.requestsToday / this.limits.geminiMaps.requestsPerDay) * 100),
        errors: this.usage.geminiMaps.errors,
        lastRequest: this.usage.geminiMaps.lastRequest,
        warningLevel: this.getWarningLevel('geminiMaps')
      },
      resetIn: `${hoursUntilReset}h ${minutesUntilReset}m`,
      resetAt: this.dailyReset.toISOString()
    };
  }
}

// Singleton instance
const tracker = new ApiUsageTracker();

export default tracker;
