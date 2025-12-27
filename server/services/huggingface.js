/**
 * HuggingFace AI Service
 * Uses HuggingFace Inference API for:
 * - Sentiment Analysis (analyze reviews)
 * - Text Classification (categorize clinics)
 * - Summarization (summarize clinic info)
 */

class HuggingFaceService {
  constructor() {
    this.apiKey = process.env.HUGGINGFACE_API_KEY;
    this.baseUrl = 'https://api-inference.huggingface.co/models';
  }

  isConfigured() {
    return !!this.apiKey;
  }

  async query(model, inputs) {
    if (!this.apiKey) {
      throw new Error('HUGGINGFACE_API_KEY not configured');
    }

    const response = await fetch(`${this.baseUrl}/${model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ inputs })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HuggingFace error: ${error}`);
    }

    return response.json();
  }

  /**
   * Analyze sentiment of reviews or text
   * Returns: positive, negative, or neutral score
   */
  async analyzeSentiment(text) {
    try {
      const result = await this.query(
        'cardiffnlp/twitter-roberta-base-sentiment-latest',
        text.slice(0, 500) // Limit input size
      );

      // Parse result
      if (Array.isArray(result) && result[0]) {
        const scores = result[0];
        const best = scores.reduce((a, b) => a.score > b.score ? a : b);
        return {
          sentiment: best.label.toLowerCase(),
          confidence: Math.round(best.score * 100),
          scores: {
            positive: scores.find(s => s.label === 'positive')?.score || 0,
            neutral: scores.find(s => s.label === 'neutral')?.score || 0,
            negative: scores.find(s => s.label === 'negative')?.score || 0
          }
        };
      }

      return { sentiment: 'neutral', confidence: 50 };
    } catch (error) {
      console.error('Sentiment analysis error:', error);
      return { sentiment: 'unknown', confidence: 0, error: error.message };
    }
  }

  /**
   * Classify clinic type based on services/description
   */
  async classifyClinic(text) {
    try {
      const result = await this.query(
        'facebook/bart-large-mnli',
        {
          inputs: text.slice(0, 500),
          parameters: {
            candidate_labels: [
              'general dentistry',
              'cosmetic dentistry', 
              'pediatric dentistry',
              'orthodontics',
              'oral surgery',
              'emergency dental',
              'family dentistry'
            ]
          }
        }
      );

      if (result.labels && result.scores) {
        return {
          primaryType: result.labels[0],
          confidence: Math.round(result.scores[0] * 100),
          allTypes: result.labels.map((label, i) => ({
            type: label,
            score: Math.round(result.scores[i] * 100)
          }))
        };
      }

      return { primaryType: 'general dentistry', confidence: 50 };
    } catch (error) {
      console.error('Classification error:', error);
      return { primaryType: 'unknown', confidence: 0, error: error.message };
    }
  }

  /**
   * Summarize clinic description/website content
   */
  async summarize(text, maxLength = 100) {
    try {
      const result = await this.query(
        'facebook/bart-large-cnn',
        text.slice(0, 1000)
      );

      if (Array.isArray(result) && result[0]?.summary_text) {
        return {
          summary: result[0].summary_text,
          success: true
        };
      }

      return { summary: text.slice(0, maxLength), success: false };
    } catch (error) {
      return { summary: '', success: false, error: error.message };
    }
  }

  /**
   * Extract key entities from text (names, locations, etc.)
   */
  async extractEntities(text) {
    try {
      const result = await this.query(
        'dslim/bert-base-NER',
        text.slice(0, 500)
      );

      if (Array.isArray(result)) {
        const entities = {
          persons: [],
          organizations: [],
          locations: []
        };

        for (const entity of result) {
          if (entity.entity_group === 'PER') {
            entities.persons.push(entity.word);
          } else if (entity.entity_group === 'ORG') {
            entities.organizations.push(entity.word);
          } else if (entity.entity_group === 'LOC') {
            entities.locations.push(entity.word);
          }
        }

        return entities;
      }

      return { persons: [], organizations: [], locations: [] };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Analyze a clinic's online presence and give a score
   */
  async analyzeClinicPresence(clinicData) {
    const factors = {
      hasWebsite: clinicData.website ? 20 : 0,
      hasPhone: clinicData.phone ? 15 : 0,
      hasEmail: clinicData.email ? 15 : 0,
      hasRating: clinicData.rating ? 10 : 0,
      highRating: (clinicData.rating >= 4) ? 15 : 0,
      hasReviews: (clinicData.reviewCount > 10) ? 10 : 0,
      manyReviews: (clinicData.reviewCount > 50) ? 15 : 0
    };

    const score = Object.values(factors).reduce((a, b) => a + b, 0);

    return {
      score,
      grade: score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D',
      factors,
      recommendation: score >= 60 
        ? 'High priority lead - contact immediately'
        : score >= 40
        ? 'Medium priority - follow up within a week'
        : 'Low priority - may need more research'
    };
  }
}

export default new HuggingFaceService();
