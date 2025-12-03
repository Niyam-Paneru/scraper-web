/**
 * Robots.txt checker utility
 */
import axios from 'axios';
import robotsParser from 'robots-parser';

// Cache for robots.txt content
const robotsCache = new Map();

/**
 * Fetch and parse robots.txt for a domain
 * @param {string} url - URL to check
 * @returns {Promise<object|null>} Parsed robots.txt or null
 */
async function fetchRobotsTxt(url) {
  try {
    const urlObj = new URL(url);
    const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;
    
    if (robotsCache.has(urlObj.host)) {
      return robotsCache.get(urlObj.host);
    }

    const response = await axios.get(robotsUrl, {
      timeout: 5000,
      validateStatus: (status) => status < 500
    });

    if (response.status === 200) {
      const robots = robotsParser(robotsUrl, response.data);
      robotsCache.set(urlObj.host, robots);
      return robots;
    }

    // No robots.txt or 404 - assume allowed
    robotsCache.set(urlObj.host, null);
    return null;
  } catch (err) {
    // Error fetching - assume allowed
    robotsCache.set(new URL(url).host, null);
    return null;
  }
}

/**
 * Check if a URL is allowed by robots.txt
 * @param {string} url - URL to check
 * @param {string} userAgent - User agent string (default: *)
 * @returns {Promise<boolean>} True if allowed, false if disallowed
 */
export async function isAllowedByRobots(url, userAgent = '*') {
  const robots = await fetchRobotsTxt(url);
  
  if (!robots) {
    // No robots.txt found - assume allowed
    return true;
  }

  return robots.isAllowed(url, userAgent);
}

/**
 * Get crawl delay from robots.txt
 * @param {string} url
 * @param {string} userAgent
 * @returns {Promise<number|null>} Delay in seconds or null
 */
export async function getCrawlDelay(url, userAgent = '*') {
  const robots = await fetchRobotsTxt(url);
  
  if (!robots) {
    return null;
  }

  return robots.getCrawlDelay(userAgent);
}

/**
 * Clear the robots.txt cache
 */
export function clearCache() {
  robotsCache.clear();
}

export default { isAllowedByRobots, getCrawlDelay, clearCache };
