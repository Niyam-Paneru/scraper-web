# 🦷 Dental Clinic Prospect Finder

AI-powered web application to find and qualify dental clinics for AI voice agent sales campaigns.

![Status](https://img.shields.io/badge/status-production--ready-brightgreen)
![Node](https://img.shields.io/badge/node-18+-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

### 🔍 Smart Clinic Discovery
- **Gemini Maps Grounding** - 500 FREE searches/day with real Google Maps data
- **Multiple Sources** - Yelp, YellowPages, Google Maps scraping (fallback)
- **Phone Validation** - Automatic E.164 normalization for dialers
- **Real-time Progress** - Watch results populate as they're found

### 🤖 AI-Powered Lead Scoring
- **Lead Scores (1-100)** - AI evaluates contract likelihood
- **Priority Grades (A-F)** - Quick visual prioritization
- **Personalized Insights** - Why each clinic is a good/bad fit
- **Suggested Pitches** - Tailored talking points per clinic

### 📧 AI Sales Assistant
- **Cold Call Scripts** - Natural conversation starters
- **Email Pitches** - Personalized outreach emails
- **LinkedIn Messages** - Short professional intros
- **Follow-up Templates** - Keep the conversation going
- **Chat Interface** - Ask anything about your leads

### 📊 Usage Tracking
- **API Limits Dashboard** - Monitor Gemini usage (1500/day)
- **Maps Quota** - Track grounding requests (500/day)
- **Warning Levels** - 75%, 90%, 100% alerts
- **Auto-reset** - Daily limits reset at midnight UTC

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Gemini API Key (FREE at [aistudio.google.com](https://aistudio.google.com/apikey))

### Installation

```bash
# Clone and install
git clone https://github.com/yourusername/dental-prospect-finder.git
cd dental-prospect-finder
npm install

# Install client dependencies
cd client && npm install && cd ..

# Configure environment
echo "GEMINI_API_KEY=your_api_key_here" > .env

# Start development (runs both server and client)
npm run dev
```

App runs at http://localhost:5173 (frontend) and http://localhost:3001 (API)

## 🌐 Deployment

### Option 1: Deploy to Vercel (Frontend Only)

For frontend-only deployment (you'll need a separate backend):

1. **Push to GitHub**
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/dental-prospect-finder.git
git push -u origin main
```

2. **Deploy on Vercel**
   - Go to [vercel.com](https://vercel.com) and import your repo
   - Set root directory to `client`
   - Deploy!

### Option 2: Deploy to Railway (Full Stack - Recommended)

1. Create account at [railway.app](https://railway.app)
2. New Project → Deploy from GitHub repo
3. Add environment variable: `GEMINI_API_KEY`
4. Railway auto-detects Node.js and deploys

### Option 3: Deploy to Render

1. Create account at [render.com](https://render.com)
2. New Web Service → Connect GitHub repo
3. Configure:
   - Build Command: `npm install && cd client && npm install && npm run build`
   - Start Command: `npm start`
4. Add environment variable: `GEMINI_API_KEY`

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Your Gemini API key from Google AI Studio |
| `PORT` | No | Server port (default: 3001) |
| `NODE_ENV` | No | Set to `production` for deployment |

## 📁 Project Structure

```
├── client/                 # React frontend (Vite)
│   ├── src/
│   │   ├── App.jsx        # Main application
│   │   ├── index.css      # Styles
│   │   └── main.jsx       # Entry point
│   └── vite.config.js     # Vite config with proxy
│
├── server/                 # Express backend
│   ├── index.js           # Server entry
│   ├── routes/
│   │   ├── api.js         # Scraping endpoints
│   │   └── ai.js          # AI/Gemini endpoints
│   └── services/
│       ├── gemini.js      # Gemini AI service
│       └── apiUsageTracker.js
│
├── scripts/               # Scraper modules
│   ├── sources/
│   │   ├── gemini-maps.js # Primary (free, no browser)
│   │   ├── yelp.js        # Playwright scraper
│   │   ├── yellowpages.js # Playwright scraper
│   │   └── googlemaps.js  # Playwright scraper
│   └── utils/
│       └── phoneUtils.js  # E.164 normalization
│
└── package.json           # Root dependencies
```

## 🔌 API Endpoints

### Scraping
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | Server status & config |
| POST | `/api/scrape` | Start scraping job |
| GET | `/api/jobs` | List all jobs |
| GET | `/api/jobs/:id` | Get job details |
| GET | `/api/jobs/:id/csv` | Download results as CSV |
| DELETE | `/api/jobs/:id` | Delete job |

### AI Features
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ai/status` | Gemini config status |
| GET | `/api/ai/usage` | API usage stats |
| POST | `/api/ai/chat` | Chat with AI |
| POST | `/api/ai/score-lead` | Score single clinic |
| POST | `/api/ai/score-all-leads` | Batch score clinics |
| POST | `/api/ai/generate-pitch` | Generate sales pitch |
| POST | `/api/ai/analyze-fit` | Analyze AI voice agent fit |

## 🎯 Usage Examples

### Score a Lead
```javascript
fetch('/api/ai/score-lead', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    clinic: {
      clinic_name: "Smile Dental",
      rating: 4.8,
      reviewCount: 250,
      city: "Austin",
      state: "TX"
    }
  })
});
// Returns: { score: 85, grade: "A", likelihood: "High", ... }
```

### Generate Email Pitch
```javascript
fetch('/api/ai/generate-pitch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    clinic: { clinic_name: "Smile Dental", rating: 4.8 },
    pitchType: "email" // or: cold-call, linkedin, follow-up, demo-offer
  })
});
```

## 🛠️ Tech Stack

- **Frontend**: React 18, Vite
- **Backend**: Express.js, Node.js
- **AI**: Google Gemini 2.0 Flash
- **Scraping**: Playwright (fallback), Gemini Maps Grounding (primary)
- **Phone Validation**: libphonenumber-js

## 📋 Free Tier Limits

| Service | Daily Limit | Notes |
|---------|-------------|-------|
| Gemini API | 1,500 requests | For AI chat, scoring, pitches |
| Gemini Maps | 500 requests | For clinic discovery |
| Playwright | Unlimited | But may get blocked by sites |

## 🖥️ Screenshots

### Main Dashboard
- Search for clinics by location
- View scraped results with ratings
- One-click CSV export

### Lead Scoring
- AI grades each clinic (A-F)
- Priority score (1-100)
- Personalized pitch suggestions

### AI Assistant
- Generate cold call scripts
- Write personalized emails
- Analyze lead quality

## ⚠️ Legal Notice

- Web scraping may violate terms of service of Yelp, YellowPages, etc.
- **Gemini Maps Grounding is recommended** - uses Google's official data
- Respect `robots.txt` and use reasonable delays
- You are responsible for complying with all applicable laws
- This tool is for lead generation - always follow CAN-SPAM and TCPA

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open a Pull Request

## 📄 License

MIT License - feel free to use for commercial purposes.

---

Built with ❤️ for AI voice agent sales teams
