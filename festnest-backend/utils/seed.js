// utils/seed.js  –  Seed MongoDB with events, colleges and demo users
import 'dotenv/config';
import mongoose   from 'mongoose';
import bcrypt     from 'bcryptjs';
import connectDB  from '../config/db.js';
import Event      from '../models/Event.js';
import User       from '../models/User.js';
import { College, Notification, PointsLog, Registration } from '../models/index.js';

await connectDB();
console.log('\n🌱  Seeding FestNest (MongoDB)…\n');

/* ── Clear existing data ── */
await Promise.all([
  Event.deleteMany({}),
  User.deleteMany({}),
  College.deleteMany({}),
  Notification.deleteMany({}),
  PointsLog.deleteMany({}),
  Registration.deleteMany({}),
]);
console.log('  🗑️   Cleared existing documents');

/* ── Events ── */
const events = await Event.insertMany([
  {
    slug: 'hackbits-2025', name: 'HackBits 2025', emoji: '💻', bgClass: 'bg1',
    category: 'Hackathon', entryType: 'free',
    organiser: { name: 'IIT Bombay Events Cell', logo: '🏛️', location: 'Mumbai, Maharashtra', sub: 'Mumbai · 120 past events' },
    college: 'IIT Bombay', city: 'Mumbai',
    date: { start: '18–19 May 2025', time: '9:00 AM onwards', deadlineDays: 4 },
    venue: 'IITB Sports Complex, Powai', teamSize: '2–4 members',
    badge: { text: '🏆 ₹2L Prize', class: 'badge-prize' },
    price: { display: 'Free', note: 'to register' },
    tags: ['36 Hours', 'On-Site', 'Prize Pool', 'Open to All'],
    about: "HackBits is IIT Bombay's flagship 36-hour hackathon — one of India's most competitive student hackathons. Open to all college students across the country, it brings together the brightest minds to build solutions across tracks: FinTech, HealthTech, EdTech, and Sustainability.",
    highlights: ['🏆 ₹2 Lakh Total Prize', '🍕 Food & Stay Included', '📱 App + Web + AI Tracks', '🎤 Pitch to Sequoia, Accel', '☁️ AWS & GCP Credits', '🎁 Swag for All Participants'],
    registrationUrl: '#',
    trending: { rank: 1, views: '1.2k views', extra: '₹2L Prize' },
    stats: { registrationCount: 1240, viewCount: 1200 },
  },
  {
    slug: 'kaleidoscope-25', name: "Kaleidoscope '25", emoji: '🎭', bgClass: 'bg5',
    category: 'Cultural Fest', entryType: 'paid',
    organiser: { name: 'NIT Trichy Cultural Council', logo: '🏛️', location: 'Tiruchirappalli, Tamil Nadu', sub: 'NIT Trichy · 24 past events' },
    college: 'NIT Trichy', city: 'Tiruchirappalli',
    date: { start: '22–24 May 2025', time: '10:00 AM – 11:00 PM', deadlineDays: 8 },
    venue: 'NIT Open Air Theatre, Trichy', teamSize: 'Individual / Group',
    badge: { text: '₹299 Entry', class: 'badge-paid' },
    price: { display: '₹299', note: 'per person' },
    tags: ['3 Days', 'On-Campus', 'Concert Night', '80+ Events'],
    about: "Kaleidoscope is NIT Trichy's annual three-day cultural extravaganza. With 80+ events spanning classical dance, Western music, drama, literary arts, fine arts, and fashion, it draws over 15,000 students every year.",
    highlights: ['🎤 Bollywood Night Concert', '💃 Dance Competition (₹50k prize)', '🎭 Battle of Bands', '🖼️ Art Exhibition', '🍜 50+ Food Stalls', '📸 Photography Contest'],
    registrationUrl: '#',
    trending: { rank: 2, views: '980 views', extra: '₹299 Entry' },
    stats: { registrationCount: 3800, viewCount: 980 },
  },
  {
    slug: 'ai-challenge-25', name: "AI Challenge '25", emoji: '🧠', bgClass: 'bg6',
    category: 'Competition', entryType: 'prize',
    organiser: { name: 'IISc Research & Innovation', logo: '🔬', location: 'Bangalore, Karnataka', sub: 'IISc · 15 past events' },
    college: 'IISc Bangalore', city: 'Bangalore',
    date: { start: '30–31 May 2025', time: '8:00 AM onwards', deadlineDays: 2 },
    venue: 'Faculty Hall, IISc Main Campus', teamSize: '1–3 members',
    badge: { text: '🏆 ₹5L Prize', class: 'badge-prize' },
    price: { display: 'Free', note: 'to register' },
    tags: ['2 Days', 'Research Track', '3 AI Tracks', 'Google Mentors'],
    about: "AI Challenge '25 is India's most prestigious student AI competition, hosted by IISc Bangalore. Participants tackle real-world problem statements across Computer Vision, NLP, and Reinforcement Learning.",
    highlights: ['🏆 ₹5 Lakh Total Prize', '🔬 Research Paper Track', '🤝 Google DeepMind Mentors', '📊 3 Specialized AI Tracks', '✈️ Travel Stipend for Finalists', '📄 Certificate from IISc'],
    registrationUrl: '#',
    trending: { rank: 3, views: '840 views', extra: '₹5L Prize' },
    stats: { registrationCount: 620, viewCount: 840 },
  },
  {
    slug: 'ux-design-sprint', name: 'UX Design Sprint', emoji: '🎨', bgClass: 'bg3',
    category: 'Workshop', entryType: 'free',
    organiser: { name: 'BITS Pilani Design Club', logo: '🎨', location: 'Pilani, Rajasthan', sub: 'BITS Pilani · 38 past events' },
    college: 'BITS Pilani', city: 'Pilani',
    date: { start: '25 May 2025', time: '10:00 AM – 6:00 PM', deadlineDays: 6 },
    venue: 'NAB Lecture Hall, BITS Pilani', teamSize: 'Individual',
    badge: { text: 'Free Entry', class: 'badge-free' },
    price: { display: 'Free', note: 'limited to 120 seats' },
    tags: ['Full Day', 'Figma Pro', 'Certificate', 'Lunch Included'],
    about: 'A full-day, hands-on UX Design Sprint workshop led by product designers from Figma India and InVision.',
    highlights: ['🖥️ Figma Pro Access (3 months)', '📜 Certificate of Completion', '🎁 Designer Tool Kit', '👩‍💼 1:1 Portfolio Review', '🍱 Lunch & Refreshments', '🤝 Networking Session'],
    registrationUrl: '#',
    trending: { rank: 5, views: '530 views', extra: 'Free' },
    stats: { registrationCount: 72, viewCount: 530 },
  },
  {
    slug: 'robowar-arena-2025', name: 'RoboWar Arena 2025', emoji: '🤖', bgClass: 'bg4',
    category: 'Competition', entryType: 'prize',
    organiser: { name: 'VIT Robotics Club', logo: '⚙️', location: 'Vellore, Tamil Nadu', sub: 'VIT Vellore · 61 past events' },
    college: 'VIT Vellore', city: 'Vellore',
    date: { start: '7–8 Jun 2025', time: '9:00 AM – 8:00 PM', deadlineDays: 12 },
    venue: 'Anna Auditorium, VIT Campus', teamSize: '3–6 members',
    badge: { text: '🏆 ₹1L Prize', class: 'badge-prize' },
    price: { display: '₹500', note: 'per team' },
    tags: ['2 Days', 'Combat Bots', 'Drone Racing', 'Live Audience'],
    about: "RoboWar Arena is VIT's annual robot combat championship and India's largest student robotics event.",
    highlights: ['🤖 3 Robot Categories', '🏆 ₹1 Lakh Total Prize', '🔧 Pre-event Build Workshop', '🚁 Drone Racing Exhibition', '🏅 Best Design Award (₹10k)', '📺 Live Streamed Event'],
    registrationUrl: '#',
    trending: { rank: 4, views: '710 views', extra: '₹1L Prize' },
    stats: { registrationCount: 280, viewCount: 710 },
  },
]);
console.log(`  ✅  Seeded ${events.length} events`);

/* ── Colleges ── */
await College.insertMany([
  { name: 'IIT Bombay',     city: 'Mumbai',          state: 'Maharashtra', logoEmoji: '🏛️', pastEvents: 120 },
  { name: 'NIT Trichy',     city: 'Tiruchirappalli', state: 'Tamil Nadu',  logoEmoji: '🏛️', pastEvents: 24  },
  { name: 'IISc Bangalore', city: 'Bangalore',       state: 'Karnataka',   logoEmoji: '🔬', pastEvents: 15  },
  { name: 'BITS Pilani',    city: 'Pilani',          state: 'Rajasthan',   logoEmoji: '🎨', pastEvents: 38  },
  { name: 'VIT Vellore',    city: 'Vellore',         state: 'Tamil Nadu',  logoEmoji: '⚙️', pastEvents: 61  },
  { name: 'NSIT Delhi',     city: 'New Delhi',       state: 'Delhi',       logoEmoji: '🏫', pastEvents: 12  },
  { name: 'IIT Delhi',      city: 'New Delhi',       state: 'Delhi',       logoEmoji: '🏛️', pastEvents: 95  },
  { name: 'IIT Madras',     city: 'Chennai',         state: 'Tamil Nadu',  logoEmoji: '🏛️', pastEvents: 87  },
]);
console.log('  ✅  Seeded 8 colleges');

/* ── Demo user: Arjun ── */
const arjun = await User.create({
  name: 'Arjun Kumar', email: 'arjun@demo.festnest.in',
  password: 'Demo@1234',
  college: 'NSIT Delhi', city: 'New Delhi', year: '3rd Year', branch: 'CS',
  interests: ['Hackathons', 'AI'],
  referralCode: 'ARJUN2025',
  isEmailVerified: true,
  points: 300,
});

/* ── Demo registrations ── */
const hackbits   = events.find(e => e.slug === 'hackbits-2025');
const aiChallenge= events.find(e => e.slug === 'ai-challenge-25');
const robowar    = events.find(e => e.slug === 'robowar-arena-2025');
const uxSprint   = events.find(e => e.slug === 'ux-design-sprint');

await Registration.insertMany([
  { user: arjun._id, event: hackbits._id,    status: 'confirmed' },
  { user: arjun._id, event: aiChallenge._id, status: 'confirmed' },
  { user: arjun._id, event: robowar._id,     status: 'confirmed' },
  { user: arjun._id, event: uxSprint._id,    status: 'pending'   },
]);

/* ── Demo points log ── */
await PointsLog.insertMany([
  { user: arjun._id, action: 'register', points: 50,  event: hackbits._id,    description: 'Registered for HackBits 2025' },
  { user: arjun._id, action: 'register', points: 50,  event: aiChallenge._id, description: "Registered for AI Challenge '25" },
  { user: arjun._id, action: 'register', points: 50,  event: robowar._id,     description: 'Registered for RoboWar Arena 2025' },
  { user: arjun._id, action: 'attend',   points: 150, event: hackbits._id,    description: 'Attended HackBits 2025' },
]);

/* ── Demo notifications ── */
await Notification.insertMany([
  { user: arjun._id, type: 'deadlines', icon: '🚨', bg: 'bg-[#FFF1F2]', title: 'Registration closing soon!', sub: "AI Challenge '25 at IISc closes in 2 days.", cta: 'Register Now', ctaId: aiChallenge._id.toString(), isRead: false },
  { user: arjun._id, type: 'updates',   icon: '✅', bg: 'bg-[#EEF2FF]', title: 'Registration confirmed!',    sub: "You're all set for HackBits 2025 at IIT Bombay.", isRead: false },
  { user: arjun._id, type: 'updates',   icon: '🏆', bg: 'bg-[#F0FDF4]', title: 'New prize pool announced',  sub: 'RoboWar Arena 2025 prize pool now ₹1.1 Lakh!', isRead: false },
  { user: arjun._id, type: 'deadlines', icon: '🎨', bg: 'bg-[#F0FDFA]', title: 'Event reminder: UX Design Sprint', sub: 'Your registered event at BITS Pilani is in 6 days.', isRead: true },
  { user: arjun._id, type: 'updates',   icon: '🪺', bg: 'bg-[#EEF2FF]', title: '18 new events in your area', sub: 'New hackathons and workshops were posted near Delhi.', cta: 'Browse Events', isRead: true },
]);

console.log('  ✅  Seeded demo user: arjun@demo.festnest.in / Demo@1234 (300 pts, 4 registrations, 5 notifications)');

/* ── Demo user: Nisha ── */
await User.create({
  name: 'Nisha Kapoor', email: 'nisha@demo.festnest.in',
  password: 'Demo@1234',
  college: 'IISc Bangalore', city: 'Bangalore', year: 'B.Tech', branch: 'CSE',
  interests: ['AI', 'Research', 'Competitions'],
  referralCode: 'NISHA2025',
  isEmailVerified: true,
  points: 0,
});
console.log('  ✅  Seeded demo user: nisha@demo.festnest.in / Demo@1234');

/* ── Superadmin ── */
await User.create({
  name: 'FestNest Admin',
  email: 'admin@festnest.in',
  password: 'Admin@festnest1',
  role: 'superadmin',
  isEmailVerified: true,
});
console.log('  ✅  Seeded superadmin: admin@festnest.in / Admin@festnest1');

console.log('\n🎉  Seed complete!\n');
await mongoose.disconnect();
