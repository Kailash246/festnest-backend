// routes/ai.js
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { pdf } from 'pdf-to-img';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = Router();

const MAX_PDF_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB max file size
const CONVERSION_TIMEOUT_MS = 60 * 1000;      // 60s timeout for PDF-to-image conversion
const GEMINI_TIMEOUT_MS = 60 * 1000;          // 60s timeout for Gemini API call
const TIMEOUT_ERROR_MESSAGE = 'This PDF is taking too long to process — try a smaller file or fewer pages';

// Multer memory storage configuration (aligned with Cloudinary setup)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_SIZE_BYTES },
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
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File exceeds 15 MB limit. Please upload a smaller PDF.',
        });
      }
      return res.status(400).json({ success: false, message: err.message || "Couldn't read PDF" });
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

const SUB_EVENT_EXTRACTION_PROMPT = `You are an expert event data extraction system for FestNest, a college event discovery platform.
Analyze all provided page images of a competition track, sub-event poster, or contest flyer in order, and extract the details for this specific competition track.

STRICT EXTRACTION RULES:
1. NEVER guess or invent missing information. Extract ONLY facts explicitly stated in the provided images.
2. Missing values MUST be null.
3. "trackName": Extract the specific competition/track/contest name (e.g. "RoboWars", "HackAI", "Web3 Security Sprint", "Algorithmic Code Sprint").
   - If the competition/track name is unclear or cannot be determined with certainty, "trackName" MUST be null.
   - Do NOT confuse the overarching festival or college name with the specific competition track name.
4. "registrationLink":
   - ONLY populate when an actual, explicit URL (e.g. "https://...", "http://...", "unstop.com/...", "forms.gle/...") is clearly visible in the uploaded PDF.
   - NEVER fabricate, invent, or infer registration URLs. If no URL is visible, return null.
5. "registrationFee":
   - Preserve the fee exactly as stated on the poster (e.g. "Free", "Rs. 200 per team", "₹150").
   - Do not guess or modify. If missing, return null.
6. "prizeDetails":
   - Extract the explicit prize information for this track (e.g. "1st: ₹25,000, 2nd: ₹10,000", "Total Pool: ₹50,000 + Trophies").
   - Do NOT calculate or invent prizes. If missing, return null.
7. "venuePlatform":
   - Extract the venue, room, lab, or platform (e.g. "CSE Lab 3", "Auditorium Hall B", "Google Meet / Discord", "HackerEarth").
   - If missing, return null.
8. "teamSize":
   - Extract the explicitly stated team composition or size (e.g. "1-4 members", "Individual", "2-3 participants").
   - Do NOT calculate or guess team sizes. If missing, return null.
9. "eligibility":
   - Extract explicitly stated criteria (e.g. "Open to all B.Tech/B.E. students", "First-year students only").
   - Do NOT invent eligibility rules. If missing, return null.
10. "durationRounds":
    - Extract explicitly stated time limit, schedule duration, or round details (e.g. "24 Hours", "2 Rounds: Prelims (1 hr) + Finals (3 hrs)").
    - Summarize duration/rounds concisely in under 150 characters — e.g. "Round 1: Online submission, Round 2: Live judging" rather than reproducing the poster's full paragraph.
    - Prioritize round count and format over exact task details.
    - Do NOT infer duration or rounds when not explicitly stated. If missing, return null.
11. "description":
    - Extract a clear summary of the competition track challenge, problem statement, or objective as stated in the flyer.
    - Do NOT generate marketing copy. If missing, return null.
12. "rulesGuidelines":
    - Extract explicitly stated competition rules, constraints, judging criteria, or submission guidelines.
    - Do NOT generate rules that are not present in the PDF. If missing, return null.
13. Information across multiple pages should be merged into one coherent result. If a field exists on only one page, still include it.

STRICT JSON ONLY:
Return valid JSON only. Do NOT include markdown formatting, backticks, code fences (\`\`\`json), or explanations.
Return an object with EXACTLY these 10 keys and no others:

Target JSON Structure:
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
}`;

const SUB_EVENT_BULK_EXTRACTION_PROMPT = `You are an expert event data extraction system for FestNest, a college event discovery platform.
Analyze all provided page images of the event poster or brochure in order.
This poster may contain MULTIPLE competition tracks/sub-events. Find ALL of them and return an array.

STRICT EXTRACTION RULES:
1. This poster may contain MULTIPLE competition tracks/sub-events. Find ALL of them and return an array.
2. If the poster only has one track, still return it as an array with one item — keep the response shape consistent.
3. If no specific competition tracks or sub-events are found, return an empty array [].
4. NEVER guess or invent missing information. Extract ONLY facts explicitly stated in the provided brochure/poster images.
5. Missing scalar fields MUST be null. Never guess or fabricate information.
6. Each item in the array MUST have ALL 10 fields matching the existing single-track schema exactly:
   - "trackName": Extract the specific competition/track/contest name (e.g. "RoboWars", "HackAI", "Paper Presentation", "Battle of Bands"). If unclear, null.
   - "registrationFee": Exact fee stated for this track (e.g. "Free", "Rs. 200 per team", "₹150"). If missing, null.
   - "prizeDetails": Explicit prize information for this track (e.g. "1st: ₹25,000, 2nd: ₹10,000", "Total Pool: ₹50,000 + Trophies"). If missing, null.
   - "venuePlatform": Venue, room, lab, or platform (e.g. "CSE Lab 3", "Auditorium Hall B", "Google Meet / Discord"). If missing, null.
   - "teamSize": Explicitly stated team composition or size (e.g. "1-4 members", "Individual", "2-3 participants"). If missing, null.
   - "eligibility": Explicitly stated eligibility criteria (e.g. "Open to all UG students", "Engineering students only"). If missing, null.
   - "durationRounds": Explicitly stated time limit, schedule duration, or round details (e.g. "24 Hours", "2 Rounds: Prelims (1 hr) + Finals (3 hrs)"). If missing, null.
   - "durationRounds": Summarize duration/rounds concisely in under 150 characters — e.g. "Round 1: Online submission, Round 2: Live judging" rather than reproducing the poster's full paragraph. Prioritize round count and format over exact task details. If missing, null.
   - "registrationLink": Explicit URL visible in the PDF for this competition (e.g. "https://...", "unstop.com/..."). NEVER fabricate or invent URLs. If no URL is visible, return null.
   - "description": Clear summary of this competition track challenge, problem statement, or objective as stated in the brochure. If missing, null.
   - "rulesGuidelines": Explicitly stated competition rules, constraints, judging criteria, or submission guidelines. If missing, null.
7. Information across multiple pages for each track should be combined accurately.

STRICT JSON ONLY:
Return valid JSON only. Do NOT include markdown formatting, backticks, code fences (\`\`\`json), or explanations.
Return a JSON array of objects (or an object with a "tracks" array) where every item has EXACTLY these 10 keys:

[
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
]`;

export class HighDemandError extends Error {
  constructor(message = 'FestNest AI is experiencing high demand right now — please wait a moment and try again') {
    super(message);
    this.name = 'HighDemandError';
    this.status = 503;
    this.isHighDemand = true;
  }
}

export function isHighDemandError(err) {
  const status = err?.status || err?.statusCode;
  const msg = (err?.message || '').toLowerCase();
  return (
    status === 503 ||
    status === 429 ||
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('high demand') ||
    msg.includes('service unavailable') ||
    msg.includes('serviceunavailable') ||
    msg.includes('resourceexhausted') ||
    msg.includes('overloaded') ||
    msg.includes('rate limit') ||
    msg.includes('quota')
  );
}

export function isRetiredModelError(err) {
  const msg = (err?.message || '').toLowerCase();
  return (
    err?.status === 404 ||
    msg.includes('404') ||
    msg.includes('no longer available') ||
    msg.includes('not found')
  );
}

/**
 * Executes Gemini generation with requested model, automatic retry-with-backoff on 503/429,
 * and fallback to secondary model if primary model is unavailable or overloaded.
 */
export async function extractEventWithGemini(apiKey, imageParts, prompt = EXTRACTION_PROMPT) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const primaryModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const fallbackModel = 'gemini-3.5-flash';

  const contents = [prompt, ...imageParts];

  const callModel = async (modelName) => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });
    const result = await model.generateContent(contents);
    return result.response.text();
  };

  try {
    return await callModel(primaryModel);
  } catch (err) {
    if (isRetiredModelError(err) && primaryModel !== fallbackModel) {
      console.warn(`[AI Extraction] Model ${primaryModel} retired/not found. Falling back to ${fallbackModel}.`);
      return await callModel(fallbackModel);
    }

    if (isHighDemandError(err)) {
      console.warn(`[AI Extraction] Model ${primaryModel} reported high demand/rate limit (${err.message}). Waiting 2s before retry...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      try {
        console.log(`[AI Extraction] Retrying on ${primaryModel}...`);
        return await callModel(primaryModel);
      } catch (retryErr) {
        console.warn(`[AI Extraction] Retry on ${primaryModel} failed: ${retryErr.message}`);

        if (primaryModel !== fallbackModel) {
          try {
            console.log(`[AI Extraction] Falling back to ${fallbackModel}...`);
            return await callModel(fallbackModel);
          } catch (fallbackErr) {
            console.error(`[AI Extraction] Fallback to ${fallbackModel} also failed: ${fallbackErr.message}`);
            if (isHighDemandError(fallbackErr) || isHighDemandError(retryErr)) {
              throw new HighDemandError();
            }
            throw fallbackErr;
          }
        }

        throw new HighDemandError();
      }
    }

    throw err;
  }
}

/**
 * Robustly extracts valid JSON substring from raw model output.
 * Handles markdown code fences, leading text, trailing comments, etc.
 */
function extractJsonString(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  let str = rawText.trim();

  // Strip markdown code fences if wrapped
  const fenceMatch = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    str = fenceMatch[1].trim();
  }

  // Find the first { or [ and last matching } or ]
  const firstBrace = str.indexOf('{');
  const firstBracket = str.indexOf('[');
  let startIdx = -1;
  if (firstBrace !== -1 && firstBracket !== -1) {
    startIdx = Math.min(firstBrace, firstBracket);
  } else if (firstBrace !== -1) {
    startIdx = firstBrace;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
  }

  if (startIdx !== -1) {
    const isObject = str[startIdx] === '{';
    const lastIdx = isObject ? str.lastIndexOf('}') : str.lastIndexOf(']');
    if (lastIdx > startIdx) {
      str = str.slice(startIdx, lastIdx + 1);
    }
  }

  return str;
}

/**
 * Truncates text at the last full word under maxLength characters.
 */
function truncateAtWordBoundary(str, maxLength = 200) {
  if (!str || typeof str !== 'string') return null;
  const trimmed = str.trim();
  if (trimmed.length <= maxLength) return trimmed;
  const truncated = trimmed.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 0) {
    return truncated.slice(0, lastSpace).trim();
  }
  return truncated.trim();
}

/**
 * Validates, cleans, and normalizes AI output against logical schema and FestNest event fields.
 */
function validateAndNormalizeData(raw) {
  // Support if model wrapped result in array or an event/data container
  if (Array.isArray(raw)) {
    raw = raw[0];
  } else if (raw && typeof raw === 'object') {
    if (raw.event && typeof raw.event === 'object' && !Array.isArray(raw.event)) {
      raw = raw.event;
    } else if (raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)) {
      raw = raw.data;
    }
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Malformed AI response: expected a JSON object');
  }

  const cleanStr = (v) => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : null);
  const cleanBool = (v) => (typeof v === 'boolean' ? v : null);

  const subEvents = Array.isArray(raw.subEvents)
    ? raw.subEvents
        .map((sub) => {
          if (!sub || typeof sub !== 'object') return null;
          const trackName = truncateAtWordBoundary(cleanStr(sub.trackName || sub.name), 120);
          const registrationFee = truncateAtWordBoundary(cleanStr(sub.registrationFee), 40);
          const prizeDetails = truncateAtWordBoundary(cleanStr(sub.prizeDetails), 300);
          const venuePlatform = truncateAtWordBoundary(cleanStr(sub.venuePlatform || sub.venue), 160);
          const teamSize = truncateAtWordBoundary(cleanStr(sub.teamSize), 80);
          const eligibility = truncateAtWordBoundary(cleanStr(sub.eligibility), 300);
          const durationRounds = truncateAtWordBoundary(cleanStr(sub.durationRounds || sub.duration), 200);
          const registrationLink = truncateAtWordBoundary(cleanStr(sub.registrationLink), 500);
          const description = truncateAtWordBoundary(cleanStr(sub.description), 2000);
          const rulesGuidelines = truncateAtWordBoundary(cleanStr(sub.rulesGuidelines || sub.rules), 1500);

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
 * Validates, cleans, and normalizes AI output for sub-event / competition track extraction.
 * Guarantees returning ONLY the 10 canonical fields, with null for any missing/empty values.
 */
function validateAndNormalizeSubEventData(raw) {
  if (Array.isArray(raw)) {
    raw = raw[0];
  } else if (raw && typeof raw === 'object') {
    if (raw.subEvent && typeof raw.subEvent === 'object') raw = raw.subEvent;
    else if (raw.track && typeof raw.track === 'object') raw = raw.track;
    else if (raw.competition && typeof raw.competition === 'object') raw = raw.competition;
    else if (raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)) raw = raw.data;
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Malformed AI response: expected a JSON object');
  }

  const cleanStr = (v) => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : null);

  return {
    trackName: truncateAtWordBoundary(cleanStr(raw.trackName || raw.name), 120),
    registrationFee: truncateAtWordBoundary(cleanStr(raw.registrationFee || raw.fee), 40),
    prizeDetails: truncateAtWordBoundary(cleanStr(raw.prizeDetails || raw.prize || raw.prizes), 300),
    venuePlatform: truncateAtWordBoundary(cleanStr(raw.venuePlatform || raw.venue), 160),
    teamSize: truncateAtWordBoundary(cleanStr(raw.teamSize), 80),
    eligibility: truncateAtWordBoundary(cleanStr(raw.eligibility), 300),
    durationRounds: truncateAtWordBoundary(cleanStr(raw.durationRounds || raw.duration), 200),
    registrationLink: truncateAtWordBoundary(cleanStr(raw.registrationLink || raw.link || raw.url), 500),
    description: truncateAtWordBoundary(cleanStr(raw.description), 2000),
    rulesGuidelines: truncateAtWordBoundary(cleanStr(raw.rulesGuidelines || raw.rules), 1500),
  };
}

/**
 * Normalizes a single sub-event / competition track item to guarantee the 10 canonical fields.
 */
function normalizeSubEventItem(item) {
  if (!item || typeof item !== 'object') return null;
  const cleanStr = (v) => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : null);

  const trackName = truncateAtWordBoundary(cleanStr(item.trackName || item.name), 120);
  if (!trackName && !cleanStr(item.description) && !cleanStr(item.prizeDetails)) {
    return null;
  }

  return {
    trackName,
    registrationFee: truncateAtWordBoundary(cleanStr(item.registrationFee || item.fee), 40),
    prizeDetails: truncateAtWordBoundary(cleanStr(item.prizeDetails || item.prize || item.prizes), 300),
    venuePlatform: truncateAtWordBoundary(cleanStr(item.venuePlatform || item.venue), 160),
    teamSize: truncateAtWordBoundary(cleanStr(item.teamSize), 80),
    eligibility: truncateAtWordBoundary(cleanStr(item.eligibility), 300),
    durationRounds: truncateAtWordBoundary(cleanStr(item.durationRounds || item.duration), 200),
    registrationLink: truncateAtWordBoundary(cleanStr(item.registrationLink || item.link || item.url), 500),
    description: truncateAtWordBoundary(cleanStr(item.description), 2000),
    rulesGuidelines: truncateAtWordBoundary(cleanStr(item.rulesGuidelines || item.rules), 1500),
  };
}

/**
 * Validates, cleans, and normalizes AI output for multi-track / bulk sub-event extraction.
 * Guarantees returning an array of items each containing all 10 canonical fields, with null for missing fields.
 */
function validateAndNormalizeSubEventBulkData(raw) {
  let list = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.tracks)) list = raw.tracks;
    else if (Array.isArray(raw.subEvents)) list = raw.subEvents;
    else if (Array.isArray(raw.competitions)) list = raw.competitions;
    else if (Array.isArray(raw.data)) list = raw.data;
    else if (raw.trackName || raw.name) list = [raw];
  }

  return list.map(normalizeSubEventItem).filter(Boolean);
}

/**
 * Wraps a promise with a hard timeout and returns a 408 Timeout Error on expiry.
 */
function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(timeoutMessage);
      err.isTimeout = true;
      err.status = 408;
      reject(err);
    }, timeoutMs);
  });
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    timeoutPromise,
  ]);
}

/**
 * Downscales images wider than 1600px using sharp before sending to Gemini
 * to reduce payload size, conversion time, and vision latency.
 */
async function optimizePageImage(pageBuffer) {
  try {
    const meta = await sharp(pageBuffer).metadata();
    if (meta.width && meta.width > 1600) {
      const resized = await sharp(pageBuffer)
        .resize({ width: 1600, withoutEnlargement: true })
        .png({ compressionLevel: 6 })
        .toBuffer();
      return { buffer: resized, mimeType: 'image/png' };
    }
    return { buffer: pageBuffer, mimeType: 'image/png' };
  } catch (err) {
    console.warn('[AI parse-event-poster] Image downscale fallback:', err.message);
    return { buffer: pageBuffer, mimeType: 'image/png' };
  }
}

/**
 * POST /api/ai/parse-event-poster
 * Accepts multipart PDF upload, validates page count, converts to images,
 * and extracts event details using Gemini multimodal vision.
 * Supports optional "context" field: "main-event" (default), "sub-event", or "sub-event-bulk".
 */
router.post('/parse-event-poster', uploadPdfMiddleware, async (req, res) => {
  try {
    const file = req.file || (req.files && req.files[0]);
    if (!file || !file.buffer) {
      return res.status(400).json({ success: false, message: "Couldn't read PDF" });
    }

    if (file.size > MAX_PDF_SIZE_BYTES || file.buffer.length > MAX_PDF_SIZE_BYTES) {
      return res.status(400).json({
        success: false,
        message: 'File exceeds 15 MB limit. Please upload a smaller PDF.',
      });
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

    // Determine extraction context: default is "main-event"
    const context = (req.body?.context || req.query?.context || 'main-event').toString().trim().toLowerCase();
    const isSubEventBulk = context === 'sub-event-bulk';
    const isSubEvent = context === 'sub-event';

    console.log(`[AI parse-event-poster] Incoming request: file="${file.originalname || 'upload.pdf'}", size=${file.buffer.length} bytes, pages=${pageCount}, context="${context}"`);

    let activePrompt;
    if (isSubEventBulk) {
      activePrompt = SUB_EVENT_BULK_EXTRACTION_PROMPT;
    } else if (isSubEvent) {
      activePrompt = SUB_EVENT_EXTRACTION_PROMPT;
    } else {
      activePrompt = EXTRACTION_PROMPT;
    }

    // Convert PDF pages to PNG image buffers using pdf-to-img
    // Convert PDF pages to PNG image buffers using pdf-to-img with a 60s hard timeout
    const imageParts = [];
    let doc;
    try {
      await withTimeout(
        (async () => {
          doc = await pdf(file.buffer);
          for await (const page of doc) {
            const { buffer: processedBuffer, mimeType } = await optimizePageImage(page);
            imageParts.push({
              inlineData: {
                data: processedBuffer.toString('base64'),
                mimeType,
              },
            });
          }
        })(),
        CONVERSION_TIMEOUT_MS,
        TIMEOUT_ERROR_MESSAGE
      );
      console.log(`[AI parse-event-poster] PDF-to-image conversion succeeded: ${imageParts.length} page images extracted`);
    } catch (pdfImgErr) {
      if (pdfImgErr.isTimeout) {
        console.error('[AI parse-event-poster] PDF-to-image conversion TIMED OUT after 60s');
        return res.status(408).json({
          success: false,
          message: TIMEOUT_ERROR_MESSAGE,
        });
      }
      console.error('[AI parse-event-poster] PDF-to-image conversion FAILED:', pdfImgErr.message || pdfImgErr);
      return res.status(400).json({ success: false, message: "Couldn't read PDF" });
    } finally {
      if (doc && typeof doc.destroy === 'function') {
        await doc.destroy().catch(() => {});
      }
    }

    if (imageParts.length === 0) {
      console.error('[AI parse-event-poster] No page images extracted from PDF');
      return res.status(400).json({ success: false, message: "Couldn't read PDF" });
    }

    // Call Gemini with all page images in a single request with a 60s hard timeout
    let rawText;
    try {
      console.log(`[AI parse-event-poster] Sending ${imageParts.length} image(s) to Gemini (context: "${context}")...`);
      rawText = await withTimeout(
        extractEventWithGemini(apiKey, imageParts, activePrompt),
        GEMINI_TIMEOUT_MS,
        TIMEOUT_ERROR_MESSAGE
      );
    } catch (geminiErr) {
      if (geminiErr.isTimeout) {
        console.error('[AI parse-event-poster] Gemini extraction TIMED OUT after 60s');
        return res.status(408).json({
          success: false,
          message: TIMEOUT_ERROR_MESSAGE,
        });
      }
      console.error('[AI parse-event-poster Gemini Error]:', geminiErr.message, geminiErr);
      if (geminiErr.isHighDemand || isHighDemandError(geminiErr)) {
        return res.status(503).json({
          success: false,
          message: 'FestNest AI is experiencing high demand right now — please wait a moment and try again',
        });
      }
      return res.status(500).json({
        success: false,
        message: "Couldn't extract event details",
      });
    }

    console.log('[AI parse-event-poster] Raw Gemini response text:');
    console.log('--- START RAW GEMINI OUTPUT ---');
    console.log(rawText);
    console.log('--- END RAW GEMINI OUTPUT ---');

    // Parse and validate the response
    let parsedData;
    try {
      const cleanText = extractJsonString(rawText);
      parsedData = JSON.parse(cleanText);
      console.log('[AI parse-event-poster] JSON.parse succeeded. Top-level type/keys:', typeof parsedData, Array.isArray(parsedData) ? `array of ${parsedData.length}` : Object.keys(parsedData || {}));
    } catch (parseErr) {
      console.error('[AI parse-event-poster JSON Parse Error]:', parseErr.message);
      console.error('[AI parse-event-poster Failed rawText snippet]:', (rawText || '').slice(0, 500));
      return res.status(500).json({
        success: false,
        message: "Couldn't extract event details",
      });
    }

    let validatedData;
    try {
      if (isSubEventBulk) {
        validatedData = validateAndNormalizeSubEventBulkData(parsedData);
      } else if (isSubEvent) {
        validatedData = validateAndNormalizeSubEventData(parsedData);
      } else {
        validatedData = validateAndNormalizeData(parsedData);
      }
      console.log(`[AI parse-event-poster] Normalization succeeded for context "${context}".`);
    } catch (validationErr) {
      console.error('[AI parse-event-poster Validation Error]:', validationErr.message);
      console.error('[AI parse-event-poster Validation Stack]:', validationErr.stack);
      return res.status(500).json({
        success: false,
        message: "Couldn't extract event details",
      });
    }

    if (isSubEventBulk) {
      return res.status(200).json({
        success: true,
        pageCount,
        tracksFound: validatedData.length,
        data: validatedData,
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
