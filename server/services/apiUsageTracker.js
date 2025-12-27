/**
 * API Usage Tracker
 * Tracks Gemini API usage and Google Places API cost
 * 
 * Google Places API Pricing:
 * - Text Search: $32 per 1000 requests
 * - Place Details: $17 per 1000 requests
 * - Free credit: $200/month (resets monthly)
 */

class ApiUsageTracker {
  constructor() {
    // Reset usage at midnight for daily limits
    this.resetDaily();
    
    // Monthly credit tracking for Google Places
    this.initMonthlyCredit();
    
    // Track per-minute requests for rate limiting
    this.minuteRequests = [];
    
    // Limits (Gemini Free Tier)
    this.limits = {
      gemini: {
        requestsPerMinute: 15,
        requestsPerDay: 1500,
        tokensPerMinute: 1000000
      },
      googlePlaces: {
        monthlyCredit: 200.00, // $200 free credit
        textSearchCostPer1000: 32.00,
        placeDetailsCostPer1000: 17.00
      }
    };
  }

  initMonthlyCredit() {
    const now = new Date();
    // Reset on 1st of each month
    this.monthlyReset = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
    
    this.googlePlacesUsage = {
      textSearches: 0,
      placeDetails: 0,
      totalCost: 0,
      lastRequest: null
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
      }
    };
  }

  // Check if we need to reset (new day or new month)
  checkReset() {
    const now = new Date();
    if (now >= this.dailyReset) {
      this.resetDaily();
    }
    if (now >= this.monthlyReset) {
      this.initMonthlyCredit();
    }
  }

  // Track Google Places Text Search
  trackPlacesTextSearch(resultCount = 1) {
    this.checkReset();
    
    this.googlePlacesUsage.textSearches++;
    const cost = this.limits.googlePlaces.textSearchCostPer1000 / 1000;
    this.googlePlacesUsage.totalCost += cost;
    this.googlePlacesUsage.lastRequest = new Date().toISOString();
    
    return this.getGooglePlacesStatus();
  }

  // Track Google Places Details request
  trackPlacesDetails(count = 1) {
    this.checkReset();
    
    this.googlePlacesUsage.placeDetails += count;
    const cost = (this.limits.googlePlaces.placeDetailsCostPer1000 / 1000) * count;
    this.googlePlacesUsage.totalCost += cost;
    this.googlePlacesUsage.lastRequest = new Date().toISOString();
    
    return this.getGooglePlacesStatus();
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

  // Get Google Places usage status
  getGooglePlacesStatus() {
    this.checkReset();
    
    const creditUsed = this.googlePlacesUsage.totalCost;
    const creditRemaining = Math.max(0, this.limits.googlePlaces.monthlyCredit - creditUsed);
    const percentUsed = (creditUsed / this.limits.googlePlaces.monthlyCredit) * 100;
    
    // Calculate days until reset
    const now = new Date();
    const daysUntilReset = Math.ceil((this.monthlyReset - now) / (1000 * 60 * 60 * 24));
    
    // Estimate how many more clinics can be scraped
    // Each clinic = 1 text search query share + 1 place details = ~$0.049
    const costPerClinic = (this.limits.googlePlaces.textSearchCostPer1000 / 1000 / 20) + 
                          (this.limits.googlePlaces.placeDetailsCostPer1000 / 1000);
    const clinicsRemaining = Math.floor(creditRemaining / costPerClinic);
    
    return {
      creditTotal: this.limits.googlePlaces.monthlyCredit,
      creditUsed: Math.round(creditUsed * 100) / 100,
      creditRemaining: Math.round(creditRemaining * 100) / 100,
      percentUsed: Math.round(percentUsed),
      textSearches: this.googlePlacesUsage.textSearches,
      placeDetails: this.googlePlacesUsage.placeDetails,
      clinicsScraped: this.googlePlacesUsage.placeDetails,
      clinicsRemaining: clinicsRemaining,
      daysUntilReset: daysUntilReset,
      resetAt: this.monthlyReset.toISOString(),
      lastRequest: this.googlePlacesUsage.lastRequest
    };
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
      googlePlaces: this.getGooglePlacesStatus()
    };
  }

  // Get warning level (none, low, medium, high, critical)
  getWarningLevel(service) {
    this.checkReset();
    
    let percentUsed;
    if (service === 'gemini') {
      percentUsed = (this.usage.gemini.requestsToday / this.limits.gemini.requestsPerDay) * 100;
    } else if (service === 'googlePlaces') {
      percentUsed = (this.googlePlacesUsage.totalCost / this.limits.googlePlaces.monthlyCredit) * 100;
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
      googlePlaces: this.getGooglePlacesStatus(),
      resetIn: `${hoursUntilReset}h ${minutesUntilReset}m`,
      resetAt: this.dailyReset.toISOString()
    };
  }
}

// Singleton instance
const tracker = new ApiUsageTracker();

export default tracker;
