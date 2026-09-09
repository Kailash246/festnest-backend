// routes/ai.js
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { pdf } from 'pdf-to-img';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = Router();

// Multer memory storage configuration (aligned with Cloudinary setup)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB max file size
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (file.mimetype !== 'application/pdf' && ext !== '.pdf') {
      return cb(Object.assign(new Error("Couldn't read PDF"), { status: 400 }));
    }
    cb(null, true);
  },
});

// Middleware wrapper to gracefully catch multer errors and prevent unhandled exceptions
const uploadPdfMiddleware = (req, res, next) => {
  upload.any()(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: "Couldn't read PDF" });
    }
    next();
  });
};

const EXTRACTION_PROMPT = `You are an expert event data extraction system for FestNest, a college event discovery platform.
Analyze all provided event poster and brochure page images in order and extract event information.

STRICT EXTRACTION RULES:
1. NEVER guess or invent missing information. Extract ONLY facts explicitly stated in the poster/brochure.
2. NEVER invent dates, prices, links, contact information, venues, organizers, rules, or eligibility.
3. Missing scalar fields MUST be null.
4. If there are no sub-events or competition tracks, return "subEvents": [].
5. If multiple tracks/competitions are present, extract every clearly identifiable track into the "subEvents" array.
6. Preserve registration links exactly as written.
7. Preserve email addresses and phone numbers exactly as written.
8. Preserve monetary amounts accurately.
9. Do not calculate totals unless the PDF explicitly states the total.
10. Do not treat a registration deadline as the event start or end date.
11. Do not confuse organizer/POC personal contact with the college or organization name.
12. Determine "mode" ONLY when supported by the poster: "Offline", "Online", or "Hybrid". Otherwise null.
13. "hasPrizePool":
    - true ONLY when a prize/reward pool is explicitly indicated.
    - false ONLY when the PDF explicitly states that there is no prize.
    - otherwise null.
14. "totalPrizeAmount" must only contain an explicitly stated total prize amount. Do NOT calculate a total from individual competition prizes.
15. Do not generate marketing copy. Preserve descriptions and rules as written on the poster.
16. Information across multiple pages should be merged into one coherent result. If a field exists on only one page, still include it.
17. Do not infer "category" simply because the event sounds like a particular category. Only classify when the poster provides sufficient evidence.
    Allowed categories:
    - "Mega Fest"
    - "Hackathon"
    - "Management"
    - "Startup"
    - "Cultural Fest"
    - "Sports"
    - "Workshop"
    - "Competition"
    - "Tech Talk"
    - "Technical Fest"
    - "Other"
    If insufficient evidence, return null.
18. For "startDate" and "endDate", format as YYYY-MM-DD if year, month, and day are clearly identifiable (e.g. "2025-05-18"). Otherwise retain the exact date string from the poster, or null if missing.

STRICT JSON ONLY:
Return valid JSON only. Do NOT include markdown formatting, backticks, code fences (\`\`\`json), or explanations.

Target JSON Structure:
{
  "category": null,
  "eventTitle": null,
  "description": null,
  "mode": null,
  "startDate": null,
  "endDate": null,
  "collegeOrganization": null,
  "cityState": null,
  "venue": null,
  "hasPrizePool": null,
  "totalPrizeAmount": null,
  "registrationFee": null,
  "registrationLink": null,
  "otherPerks": null,
  "eligibility": null,
  "rules": null,
  "pocName": null,
  "phone": null,
  "email": null,
  "website": null,
  "subEvents": [
    {
      "trackName": null,
      "registrationFee": null,
      "prizeDetails": null,
      "venuePlatform": null,
      "teamSize": null,
      "eligibility": null,
      "durationRounds": null,
      "registrationLink": null,
      "description": null,
      "rulesGuidelines": null
    }
  ]
}`;

/**
 * Executes Gemini generation with requested model and automatic fallback
 * if the requested model is retired/unavailable.
 */
async function extractEventWithGemini(apiKey, imageParts) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const primaryModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
  const fallbackModel = 'gemini-3.5-flash-lite';

  const contents = [EXTRACTION_PROMPT, ...imageParts];

  try {
    const model = genAI.getGenerativeModel({
      model: primaryModel,
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });
    const result = await model.generateContent(contents);
    return result.response.text();
  } catch (err) {
    const isModelRetired =
      err?.message?.includes('404') ||
      err?.message?.includes('no longer available') ||
      err?.message?.includes('not found');

    if (isModelRetired && primaryModel !== fallbackModel) {
      console.warn(`[AI Extraction] Model ${primaryModel} unavailable. Falling back to ${fallbackModel}.`);
      const model = genAI.getGenerativeModel({
        model: fallbackModel,
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });
      const result = await model.generateContent(contents);
      return result.response.text();
    }
    throw err;
  }
}

/**
 * Validates, cleans, and normalizes AI output against logical schema and FestNest event fields.
 */
function validateAndNormalizeData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Malformed AI response: expected a JSON object');
  }

  const cleanStr = (v) => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : null);
  const cleanBool = (v) => (typeof v === 'boolean' ? v : null);

  const subEvents = Array.isArray(raw.subEvents)
    ? raw.subEvents
        .map((sub) => {
          if (!sub || typeof sub !== 'object') return null;
          const trackName = cleanStr(sub.trackName || sub.name);
          const registrationFee = cleanStr(sub.registrationFee);
          const prizeDetails = cleanStr(sub.prizeDetails);
          const venuePlatform = cleanStr(sub.venuePlatform || sub.venue);
          const teamSize = cleanStr(sub.teamSize);
          const eligibility = cleanStr(sub.eligibility);
          const durationRounds = cleanStr(sub.durationRounds || sub.duration);
          const registrationLink = cleanStr(sub.registrationLink);
          const description = cleanStr(sub.description);
          const rulesGuidelines = cleanStr(sub.rulesGuidelines || sub.rules);

          return {
            trackName,
            registrationFee,
            prizeDetails,
            venuePlatform,
            teamSize,
            eligibility,
            durationRounds,
            registrationLink,
            description,
            rulesGuidelines,
            // Schema aliases for Competition model compatibility
            name: trackName,
            venue: venuePlatform,
            duration: durationRounds,
            rules: rulesGuidelines,
          };
        })
        .filter(Boolean)
    : [];

  const category = cleanStr(raw.category || raw.eventType);
  const eventTitle = cleanStr(raw.eventTitle || raw.eventName || raw.title);
  const description = cleanStr(raw.description || raw.about);
  const mode = cleanStr(raw.mode);
  const startDate = cleanStr(raw.startDate);
  const endDate = cleanStr(raw.endDate);
  const collegeOrganization = cleanStr(raw.collegeOrganization || raw.college);
  const cityState = cleanStr(raw.cityState || raw.city);
  const venue = cleanStr(raw.venue);
  const hasPrizePool = cleanBool(raw.hasPrizePool ?? raw.hasPrize);
  const totalPrizeAmount = cleanStr(raw.totalPrizeAmount || raw.totalPrize);
  const registrationFee = cleanStr(raw.registrationFee || raw.entryFee || raw.regFee);
  const registrationLink = cleanStr(raw.registrationLink || raw.registrationUrl || raw.regLink);
  const otherPerks = cleanStr(raw.otherPerks || raw.perks);
  const eligibility = cleanStr(raw.eligibility);
  const rules = cleanStr(raw.rules);
  const pocName = cleanStr(raw.pocName);
  const phone = cleanStr(raw.phone || raw.pocPhone);
  const email = cleanStr(raw.email || raw.pocEmail);
  const website = cleanStr(raw.website);

  return {
    // Logical structure required by prompt
    category,
    eventTitle,
    description,
    mode,
    startDate,
    endDate,
    collegeOrganization,
    cityState,
    venue,
    hasPrizePool,
    totalPrizeAmount,
    registrationFee,
    registrationLink,
    otherPerks,
    eligibility,
    rules,
    pocName,
    phone,
    email,
    website,
    subEvents,

    // FestNest Event schema / HostEvent form field aliases for direct autofill
    eventName: eventTitle,
    title: eventTitle,
    about: description,
    college: collegeOrganization,
    city: cityState,
    hasPrize: hasPrizePool,
    totalPrize: totalPrizeAmount,
    entryFee: registrationFee,
    regFee: registrationFee,
    registrationUrl: registrationLink,
    regLink: registrationLink,
    perks: otherPerks,
    pocPhone: phone,
    pocEmail: email,
  };
}

/**
 * POST /api/ai/parse-event-poster
 * Accepts multipart PDF upload, validates page count, converts to images,
 * and extracts event details using Gemini multimodal vision.
 */
router.post('/parse-event-poster', uploadPdfMiddleware, async (req, res) => {
  try {
    const file = req.file || (req.files && req.files[0]);
    if (!file || !file.buffer) {
      return res.status(400).json({ success: false, message: "Couldn't read PDF" });
    }

    // Parse PDF with pdf-lib to check page count
    let pdfDoc;
    try {
      pdfDoc = await PDFDocument.load(file.buffer);
    } catch {
      return res.status(400).json({ success: false, message: "Couldn't read PDF" });
    }

    const pageCount = pdfDoc.getPageCount();
    if (pageCount > 25) {
      return res.status(400).json({ success: false, message: 'PDF exceeds 25 page limit' });
    }

    // Check Gemini configuration
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[AI parse-event-poster] GEMINI_API_KEY environment variable is not set');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error: AI extraction service not configured',
      });
    }

    // Convert PDF pages to PNG image buffers using pdf-to-img
    const imageParts = [];
    const doc = await pdf(file.buffer);
    try {
      for await (const page of doc) {
        imageParts.push({
          inlineData: {
            data: page.toString('base64'),
            mimeType: 'image/png',
          },
        });
      }
    } finally {
      if (typeof doc.destroy === 'function') {
        await doc.destroy();
      }
    }

    if (imageParts.length === 0) {
      return res.status(400).json({ success: false, message: "Couldn't read PDF" });
    }

    // Call Gemini with all page images in a single request
    let rawText;
    try {
      rawText = await extractEventWithGemini(apiKey, imageParts);
    } catch (geminiErr) {
      console.error('[AI parse-event-poster Gemini Error]:', geminiErr.message);
      return res.status(500).json({
        success: false,
        message: "Couldn't extract event details",
      });
    }

    // Parse and validate the response
    let parsedData;
    try {
      let cleanText = (rawText || '').trim();
      if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      }
      parsedData = JSON.parse(cleanText);
    } catch (parseErr) {
      console.error('[AI parse-event-poster JSON Parse Error]:', parseErr.message);
      return res.status(500).json({
        success: false,
        message: "Couldn't extract event details",
      });
    }

    let validatedData;
    try {
      validatedData = validateAndNormalizeData(parsedData);
    } catch (validationErr) {
      console.error('[AI parse-event-poster Validation Error]:', validationErr.message);
      return res.status(500).json({
        success: false,
        message: "Couldn't extract event details",
      });
    }

    return res.status(200).json({
      success: true,
      pageCount,
      data: validatedData,
    });
  } catch (error) {
    console.error('[AI parse-event-poster general error]:', error.message);
    return res.status(500).json({
      success: false,
      message: "Couldn't read PDF",
    });
  }
});

export default router;
