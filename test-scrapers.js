/**
 * Test all scrapers and compare results
 */
import 'dotenv/config';

console.log('\n🧪 SCRAPER COMPARISON TEST\n');
console.log('='.repeat(50));

// Test Gemini API first
console.log('\n1️⃣ Testing GEMINI API Key...');
try {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Say "API working" in 2 words' }] }]
      })
    }
  );
  
  if (response.status === 429) {
    console.log('❌ Gemini API: RATE LIMITED (429) - Need to wait');
  } else if (response.ok) {
    const data = await response.json();
    console.log('✅ Gemini API: Working!');
    console.log('   Response:', data.candidates?.[0]?.content?.parts?.[0]?.text?.slice(0, 50));
  } else {
    console.log('❌ Gemini API Error:', response.status);
  }
} catch (err) {
  console.log('❌ Gemini API Error:', err.message);
}

// Test Yelp scraper
console.log('\n2️⃣ Testing YELP Scraper...');
try {
  const { scrapeYelp } = await import('./scripts/sources/yelp.js');
  const { initBrowser, closeBrowser } = await import('./scripts/lib/visitAndExtract.js');
  
  const logger = {
    info: (msg) => console.log('   [INFO]', msg),
    warn: (msg) => console.log('   [WARN]', msg),
    error: (msg) => console.log('   [ERROR]', msg),
    debug: () => {},
    progress: () => {},
    updateStat: () => {}
  };
  
  let count = 0;
  const startTime = Date.now();
  
  for await (const clinic of scrapeYelp({ location: 'Austin, TX', max: 3, delay: 1000 }, logger)) {
    count++;
    console.log(`   ✅ Found: ${clinic.clinic_name}`);
    console.log(`      Phone: ${clinic.phone || 'N/A'}`);
    console.log(`      Address: ${clinic.address || 'N/A'}`);
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n   📊 Yelp Results: ${count} clinics in ${elapsed}s`);
  
  await closeBrowser();
} catch (err) {
  console.log('❌ Yelp Error:', err.message);
}

// Test Google Maps scraper
console.log('\n3️⃣ Testing GOOGLE MAPS Scraper...');
try {
  const { scrapeGoogleMaps } = await import('./scripts/sources/googlemaps.js');
  const { closeBrowser } = await import('./scripts/lib/visitAndExtract.js');
  
  const logger = {
    info: (msg) => console.log('   [INFO]', msg),
    warn: (msg) => console.log('   [WARN]', msg),
    error: (msg) => console.log('   [ERROR]', msg),
    debug: () => {},
    progress: () => {},
    updateStat: () => {}
  };
  
  let count = 0;
  const startTime = Date.now();
  
  for await (const clinic of scrapeGoogleMaps({ location: 'Austin, TX', max: 3, delay: 1500 }, logger)) {
    count++;
    console.log(`   ✅ Found: ${clinic.clinic_name}`);
    console.log(`      Phone: ${clinic.phone || 'N/A'}`);
    console.log(`      Website: ${clinic.website || 'N/A'}`);
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n   📊 Google Maps Results: ${count} clinics in ${elapsed}s`);
  
  await closeBrowser();
} catch (err) {
  console.log('❌ Google Maps Error:', err.message);
}

// Test Gemini Maps (if API working)
console.log('\n4️⃣ Testing GEMINI MAPS Scraper...');
try {
  const { scrapeGeminiMaps } = await import('./scripts/sources/gemini-maps.js');
  
  const startTime = Date.now();
  const results = await scrapeGeminiMaps('Austin', 'TX', 3, (p) => {
    if (p.clinic) console.log(`   ✅ Found: ${p.clinic.name}`);
  });
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n   📊 Gemini Maps Results: ${results.length} clinics in ${elapsed}s`);
  
  if (results.length > 0) {
    console.log('   Sample:', results[0].name, '-', results[0].phone);
  }
} catch (err) {
  console.log('❌ Gemini Maps Error:', err.message);
}

console.log('\n' + '='.repeat(50));
console.log('📋 COMPARISON SUMMARY:');
console.log('='.repeat(50));
console.log(`
| Source       | Data Type    | Speed    | Reliability |
|--------------|--------------|----------|-------------|
| Yelp         | REAL data    | Slow     | High        |
| Google Maps  | REAL data    | Medium   | Medium      |
| Gemini Maps  | AI-GENERATED | Fast     | Rate limits |

🏆 RECOMMENDATION: Use YELP for real, accurate data
   - Has real business info from Yelp listings
   - Includes verified phone numbers
   - No API rate limits (just browser-based)
   
⚠️  Gemini Maps generates FAKE/AI-imagined data
   - Phone numbers may not be real
   - Addresses may not exist
   - Only useful for testing/demos
`);

process.exit(0);
