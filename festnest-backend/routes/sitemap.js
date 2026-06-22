// routes/sitemap.js — dynamic XML sitemap for search engines.
// Lists static marketing/legal routes plus every published event URL.
// Proxied to from the frontend at https://festnest.in/sitemap.xml (see vercel.json).
import { Router } from 'express';
import Event from '../models/Event.js';
import { asyncHandler } from '../utils/response.js';

const router = Router();

const SITE = 'https://festnest.in';

// Static, crawlable routes. EventDetails URLs are appended dynamically below.
const STATIC_ROUTES = [
  { path: '/',         changefreq: 'daily',  priority: '1.0' },
  { path: '/explore',  changefreq: 'daily',  priority: '0.9' },
  { path: '/discover', changefreq: 'weekly', priority: '0.9' },
  { path: '/blog',                                                          changefreq: 'weekly',  priority: '0.8' },
  { path: '/blog/how-to-win-a-hackathon',                                   changefreq: 'monthly', priority: '0.7' },
  { path: '/blog/hackathon-strategy-guide',                                 changefreq: 'monthly', priority: '0.7' },
  { path: '/blog/how-to-win-startup-pitch-competition',                     changefreq: 'monthly', priority: '0.7' },
  { path: '/blog/best-colleges-for-inter-college-competitions-india',       changefreq: 'monthly', priority: '0.7' },
  { path: '/blog/best-college-events-india-2025',                           changefreq: 'monthly', priority: '0.7' },
  { path: '/terms',    changefreq: 'yearly', priority: '0.3' },
  { path: '/privacy',  changefreq: 'yearly', priority: '0.3' },
];

// SEO landing pages. Cities mirror the /discover hub; category slugs are the
// URL forms consumed by /category/:category on the frontend. Keep these in sync
// with festnest-react/src/data/seoCategories.js and pages/seo/HubPage.jsx.
const SEO_CITIES = [
  'mumbai', 'delhi', 'bangalore', 'chennai', 'hyderabad',
  'pune', 'kolkata', 'jaipur', 'chandigarh', 'vellore',
];
const SEO_CATEGORY_SLUGS = [
  'mega-fest', 'hackathon', 'cultural-fest', 'workshop',
  'competition', 'tech-talk', 'sports',
];

// Escape the five XML-reserved characters so odd slugs can't break the document.
const xmlEscape = (str = '') =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const urlEntry = ({ loc, lastmod, changefreq, priority }) => {
  const parts = [`    <loc>${xmlEscape(loc)}</loc>`];
  if (lastmod)    parts.push(`    <lastmod>${lastmod}</lastmod>`);
  if (changefreq) parts.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority)   parts.push(`    <priority>${priority}</priority>`);
  return `  <url>\n${parts.join('\n')}\n  </url>`;
};

router.get('/sitemap.xml', asyncHandler(async (_req, res) => {
  // Only published, active events are indexable.
  const events = await Event.find(
    { isActive: true, isApproved: true },
    { slug: 1, updatedAt: 1 },
  ).sort({ updatedAt: -1 }).lean();

  const staticUrls = STATIC_ROUTES.map(r =>
    urlEntry({ loc: `${SITE}${r.path}`, changefreq: r.changefreq, priority: r.priority }),
  );

  const cityUrls = SEO_CITIES.map(c =>
    urlEntry({ loc: `${SITE}/events/${c}`, changefreq: 'weekly', priority: '0.7' }),
  );

  const categoryUrls = SEO_CATEGORY_SLUGS.map(slug =>
    urlEntry({ loc: `${SITE}/category/${slug}`, changefreq: 'weekly', priority: '0.7' }),
  );

  const eventUrls = events
    .filter(e => e.slug)
    .map(e => urlEntry({
      loc:        `${SITE}/event/${e.slug}`,
      lastmod:    e.updatedAt ? new Date(e.updatedAt).toISOString().slice(0, 10) : undefined,
      changefreq: 'weekly',
      priority:   '0.8',
    }));

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    [...staticUrls, ...cityUrls, ...categoryUrls, ...eventUrls].join('\n') +
    `\n</urlset>\n`;

  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=3600'); // 1 hour CDN/browser cache
  res.send(xml);
}));

export default router;
