# FestNest UI/UX Design System Technical Audit & Design System Report

> **Document Version:** 1.0.0  
> **Repository:** `Kailash246/festnest-react` (Frontend) & `Kailash246/festnest-backend` (Backend)  
> **Workspace Root:** `E:\FestNest Main`  
> **Frontend Root:** `E:\FestNest Main\festnest-react`  
> **Date of Audit:** September 12, 2026  
> **Audited By:** Antigravity Pair Programming Agent  
> **Status:** Completed Codebase Audit & Architectural Reference  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Design Philosophy & System Architecture](#2-design-philosophy--system-architecture)
3. [Color Tokens & Palette Implementation](#3-color-tokens--palette-implementation)
4. [Typography & Font System](#4-typography--font-system)
5. [The Reduced Border-Radius System](#5-the-reduced-border-radius-system)
6. [Spacing, Grid & Layout System](#6-spacing-grid--layout-system)
7. [Comprehensive Component Audit](#7-comprehensive-component-audit)
8. [Shadows, Elevation & Border Treatment](#8-shadows-elevation--border-treatment)
9. [Icons & Iconography Standards](#9-icons--iconography-standards)
10. [Animation, Motion & Interaction Patterns](#10-animation-motion--interaction-patterns)
11. [Responsive Design & Breakpoint Mechanics](#11-responsive-design--breakpoint-mechanics)
12. [Page-by-Page UI/UX Audit](#12-page-by-page-uiux-audit)
13. [Design Tokens & CSS Architecture Analysis](#13-design-tokens--css-architecture-analysis)
14. [Audit Findings & Current Inconsistencies](#14-audit-findings--current-inconsistencies)
15. [Recommended FestNest Design Standard](#15-recommended-festnest-design-standard)
16. [Developer Quick Reference Recipes](#16-developer-quick-reference-recipes)
17. [File & Component Master Registry](#17-file--component-master-registry)

---

## 1. Executive Summary

This report documents the actual, currently implemented user interface and user experience design system of **FestNest** based on a file-by-file audit of the React/Vite frontend codebase located in `festnest-react/`.

### Key System Characteristics

1. **Evolution of the System:**  
   Historical project documentation (`CLAUDE.md`, `CLAUDE_2.md`) specified *Syne* for display headings and *DM Sans* for body text. The codebase has since undergone a deliberate design modernization:
   - **Body & UI Font:** Self-hosted variable **Geist Sans** is the default UI and body typeface.
   - **Heading Font:** **DM Sans** is the primary display and heading typeface (the legacy `syne` Tailwind font token is explicitly remapped to `DM Sans`).
   - **Monospace Font:** Self-hosted variable **Geist Mono** powers dates, counters, IDs, codes, and tabular figures.
   - **Border Radius:** A custom **Reduced Border-Radius System** is codified in `tailwind.config.js`, capping `rounded-xl` at `10px`, `rounded-2xl` at `12px`, and `rounded-3xl` at `14px`, replacing oversized consumer pill containers with structured, compact, dense engineering aesthetics.

2. **Non-Standard Breakpoint Engine:**  
   Tailwind's default breakpoints (`sm: 640px, md: 768px, lg: 1024px, xl: 1280px`) are overridden in `tailwind.config.js`. FestNest uses:
   - `sm`: `640px`
   - `md`: `900px` (Desktop sidebar trigger; tablet/mobile breakpoint)
   - `lg`: `1280px`
   - `xl`: `1600px` (Ultrawide 4-column feed trigger)

3. **Core Grid & Chrome Model:**  
   Desktop navigation employs a 2-dimensional CSS Grid in `src/App.jsx` (`[260px/280px/300px sidebar | 1fr main]` × `[64px header | 1fr content]`). Mobile replaces this with a sticky 56px `Topnav`, fixed bottom `BottomNav` with safe-area padding, and a sliding `MobileDrawer`. The event feed relies on a custom CSS rule `.feed-grid` in `src/index.css` rather than utility breakpoint classes.

4. **Strict Light Mode:**  
   The application operates strictly in a light theme (`bg-white` and `bg-surface-2 #F8F8F6`). There is no dark mode toggle, no `dark:` variant usage in page components, and no OS color-scheme switching.

5. **Legacy Artifacts Identified:**  
   The audit identified unused dependencies (such as `@fontsource/space-grotesk`), canvas-specific font assets (`Clash Display` and `Satoshi` used only for digital ID PNG generation), leftover pre-reduced border radius declarations (`rounded-[18px]` in SEO skeleton cards), and localized usage of Tailwind default palettes (`slate-50`, `indigo-600`) in Admin views instead of FestNest system tokens.

---

## 2. Design Philosophy & System Architecture

FestNest balances collegiate energy with the precision of a modern B2B/consumer SaaS utility.

### Visual Values
- **Information Density over Blank Space:** Information cards (events, tickets, metrics) are structured with explicit 1px borders, subtle 4px–12px box shadows, and tight typography (11px–15px body ranges) to maximize content scanability.
- **Micro-elevation & Hairline Delimiters:** Separation is achieved through subtle `#E4E4E0` borders, `#F1F0ED` fills, and delicate shadows (`0 1px 3px rgba(0,0,0,0.07)`) rather than heavy floating cards or stark gradients.
- **Purposeful Color Anchors:** Neutral grays dominate the background and surfaces. Deep Indigo (`#4F46E5`) is reserved for primary CTAs, active states, and focal points. Category-specific pastels tint badges and emoji placeholders.
- **Tactile Feedback:** Buttons and interactive cards feature scale taps (`active:scale-95` or `whileTap={{ scale: 0.98 }}`), subtle 2px–4px hover translations (`hover:-translate-y-[2px]`), and instant CSS transitions (150ms–200ms).

---

## 3. Color Tokens & Palette Implementation

FestNest colors are defined in two synchronised layers:
1. **Tailwind Theme Extensions** in `festnest-react/tailwind.config.js`
2. **CSS Custom Properties** on `:root` in `festnest-react/src/index.css`

### 3.1 Primary Brand Palette

| Token (Tailwind) | CSS Variable | Hex Value | Semantic Purpose | Code Locations |
| :--- | :--- | :--- | :--- | :--- |
| `primary.DEFAULT` | `--c-primary` | `#4F46E5` | Deep Indigo; Primary CTA buttons, brand badges, active link text, focus outlines | `tailwind.config.js:8`, `src/index.css:38` |
| `primary.dark` | `--c-primary-dark` | `#3730A3` | Dark Indigo; Hover state for primary buttons and active CTAs | `tailwind.config.js:8`, `src/index.css:39` |
| `primary.mid` | `--c-primary-mid` | `#818CF8` | Indigo 400; Sub-text in notification banners, secondary illustrations | `tailwind.config.js:8`, `src/index.css:41` |
| `primary.light` | `--c-primary-light` | `#EEF2FF` | Indigo 50; Active sidebar button background, badge backgrounds, pill hover fills | `tailwind.config.js:8`, `src/index.css:40` |
| `primary.xlight` | `--c-primary-xlight`| `#F5F3FF` | Violet 50; Subtle card accents, table hover states, user strip background in drawer | `tailwind.config.js:8`, `src/index.css:42` |

### 3.2 Surface & Background Palette

| Token (Tailwind) | CSS Variable | Hex Value | Visual Role | Code Locations |
| :--- | :--- | :--- | :--- | :--- |
| `surface.DEFAULT` | `--c-surface` | `#FFFFFF` | Pure white; Card containers, topnav, sidebar, modals, input backgrounds | `tailwind.config.js:9`, `src/index.css:43` |
| `surface.2` | `--c-surface-2` | `#F8F8F6` | Off-white canvas; Global shell background, page background behind cards | `tailwind.config.js:9`, `src/index.css:44` |
| `surface.3` | `--c-surface-3` | `#F1F0ED` | Warm light gray; Search input pill background, inactive chips, button hover fills | `tailwind.config.js:9`, `src/index.css:45` |
| `surface.4` | `--c-surface-4` | `#E9E9E5` | Active muted fill; Toggle tracks, active chip depressions, divider lines | `tailwind.config.js:9`, `src/index.css:46` |

### 3.3 Text & Foreground Palette

| Token (Tailwind) | CSS Variable | Hex Value | Hierarchy & Application | Code Locations |
| :--- | :--- | :--- | :--- | :--- |
| `text.1` | `--c-text-1` | `#111110` | High-contrast black; Headings (H1–H3), card titles, active tab labels | `tailwind.config.js:10`, `src/index.css:47` |
| `text.2` | `--c-text-2` | `#4B4B47` | Charcoal; Secondary body text, sidebar links, field labels, metadata values | `tailwind.config.js:10`, `src/index.css:48` |
| `text.3` | `--c-text-3` | `#8A8A85` | Medium gray; Secondary metadata (college, date), search placeholders, timestamps | `tailwind.config.js:10`, `src/index.css:49` |
| `text.4` | `--c-text-4` | `#AEAEAD` | Light gray; Disabled states, uppercase section labels, character counter text | `tailwind.config.js:10`, `src/index.css:50` |

### 3.4 Border System Palette

| Token (Tailwind) | CSS Variable | Hex Value | Usage | Code Locations |
| :--- | :--- | :--- | :--- | :--- |
| `border.DEFAULT` | `--c-border` | `#E4E4E0` | Standard hairline border across cards, headers, sidebars, dividers | `tailwind.config.js:11`, `src/index.css:51` |
| `border.strong` | `--c-border-strong` | `#CBCBC6` | Strong border for inputs, inactive checkboxes, OTP boxes, table borders | `tailwind.config.js:11`, `src/index.css:52` |

### 3.5 Semantic Status & Feedback Palette

| Semantic Role | Main Hex | Background Hex | Border Hex | Typical UI Component |
| :--- | :--- | :--- | :--- | :--- |
| **Green (Success / Free)** | `#16A34A` | `#F0FDF4` | `#BBF7D0` | Free entry pill, Toast success, verified checkmarks, strong password bar |
| **Amber (Warning / Paid)** | `#B45309` | `#FFFBEB` | `#FDE68A` | Paid entry pill, draft alert banner, Toast warning, medium password bar |
| **Red (Error / Expired)** | `#DC2626` | `#FEF2F2` | `#FECACA` | Expired event badge, delete modal, form field error text, weak password bar |
| **Blue (Info / System)** | `#2563EB` | `#EFF6FF` | `#BFDBFE` | Toast info, contact cards, general announcement pills |

*Source files:* `tailwind.config.js:12-15`, `src/index.css:53-63`, `src/components/ToastContainer.jsx:7-48`.

### 3.6 Event Category Pastels & Placeholder Tokens

Used when an event does not have an uploaded poster graphic. The background classes are defined in `src/index.css:191-198` and mapped in `src/data/categories.js`:

| Class | Background Hex | Tint Text / Accent | Category Association |
| :--- | :--- | :--- | :--- |
| `.bg1` | `#EEF2FF` | `text-indigo-700` (`#4338CA`) | Hackathons |
| `.bg2` | `#FFF7ED` | `text-amber-700` / Orange | Mega Fest |
| `.bg3` | `#F0FDFA` | `text-teal-700` (`#0F766E`) | Workshops |
| `.bg4` | `#F0FDF4` | `text-green-700` (`#15803D`) | Sports |
| `.bg5` | `#FDF4FF` | `text-fuchsia-700` (`#A21CAF`) | Cultural Fests |
| `.bg6` | `#FFF1F2` | `text-rose-700` (`#BE123C`) | Competitions (Alternative) |
| `.bg7` | `#FFFBEB` | `text-amber-700` (`#B45309`) | Competitions / Startup |
| `.bg8` | `#EFF6FF` | `text-blue-700` (`#1D4ED8`) | Tech Talks / Management |

---

## 4. Typography & Font System

FestNest uses a 3-tier font hierarchy with self-hosted variable woff2 files and selective web font imports.

```
┌─────────────────────────────────────────────────────────────┐
│                    FESTNEST TYPOGRAPHY                      │
├─────────────────┬─────────────────┬─────────────────────────┤
│    PRIMARY UI   │    HEADINGS     │        MONOSPACE        │
│   Geist Sans    │     DM Sans     │       Geist Mono        │
│  (Self-Hosted)  │ (Google Fonts)  │      (Self-Hosted)      │
│  Variable woff2 │   Static Web    │      Variable woff2     │
│   Body, Cards,  │  H1-H3, Modal   │     Dates, Counters,    │
│  Inputs, Forms  │  Titles, Banner │     OTP, Code, Stats    │
└─────────────────┴─────────────────┴─────────────────────────┘
```

### 4.1 Fonts In Use

#### 1. Geist Sans (`'Geist Sans', 'Geist', sans-serif`)
- **Role:** Body copy, UI controls, navigation labels, card metadata, inputs, and default root typeface.
- **Source:** Self-hosted `/fonts/Geist-Variable.woff2` (preloaded in `index.html:62` and registered via `@font-face` in `src/index.css:2-16`).
- **CSS Properties:** Applied globally on `body` via `var(--f-sans)`. Mapped in Tailwind as `font-sans` and `font-body`.

#### 2. DM Sans (`'DM Sans', sans-serif`)
- **Role:** Primary display font for page titles, modal headings, section titles, card brand headers, and marketing slogans.
- **Source:** Google Fonts `<link>` in `index.html:57-60` (`family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000`).
- **CSS Properties:** Mapped in `tailwind.config.js` to `font-heading`, `font-display`, and `font-syne`. Mapped in `src/index.css:66-67` to `--f-heading` and `--f-display`.

#### 3. Geist Mono (`'Geist Mono', monospace`)
- **Role:** Monospace and numeric data, event start dates (`EventCard.jsx:437`), OTP input boxes (`index.css:227`), ID numbers, live attendee counts, tabular numbers.
- **Source:** Self-hosted `/fonts/GeistMono-Variable.woff2` (registered via `@font-face` in `src/index.css:19-24`).
- **CSS Properties:** Mapped in `tailwind.config.js` to `font-mono`. Mapped in `src/index.css:68` to `--f-mono`.

#### 4. Clash Display & Satoshi (Canvas-Only Font Assets)
- **Files:** `/fonts/ClashDisplay-Bold.woff2`, `/fonts/Satoshi-Regular.woff2` in `public/fonts/`.
- **Usage:** These are **NOT** used in React DOM CSS styling. They are loaded exclusively by the HTML5 canvas routine `exportCardAsPNG` in `src/pages/ca/CampusAmbassadorDashboard.jsx:154-170` to render downloadable digital ID card graphics.

#### 5. Unused / Orphaned Font: Space Grotesk
- **Status:** Installed in `festnest-react/package.json:12` (`"@fontsource/space-grotesk": "^5.3.0"`), but **never imported** anywhere in `main.jsx`, `App.jsx`, `index.css`, or any page component. It is an orphaned dependency.

### 4.2 Type Scale (Font Sizes & Line Heights)

Defined in `festnest-react/tailwind.config.js:27-39`:

| Tailwind Token | Font Size | Line Height | CSS Value | Usage Context |
| :--- | :--- | :--- | :--- | :--- |
| `text-xxs` | `11px` | `1.5` (`16.5px`) | `0.6875rem` | Micro badges, secondary timestamp chips, footer subtext |
| `text-xs` | `12px` | `1.5` (`18px`) | `0.75rem` | Form hint text, character counters, compact category labels |
| `text-sm` | `13px` | `1.5` (`19.5px`) | `0.8125rem` | Navigation links, card subtext, chip filter text |
| `text-base` / `text-md` | `15px` | `1.5` (`22.5px`) | `0.9375rem` | Standard body copy, form input value text, button labels |
| `text-lg` | `16px` | `1.5` (`24px`) | `1rem` | Subheadings, section titles, card primary headers |
| `text-xl` | `18px` | `1.25` (`22.5px`)| `1.125rem` | Small page headers, modal titles, mobile hero headlines |
| `text-2xl` | `22px` | `1.25` (`27.5px`)| `1.375rem` | Desktop section headings, stat metrics, secondary H2s |
| `text-3xl` | `26px` | `1.15` (`29.9px`)| `1.625rem` | Large page headers, Auth title, dashboard overview title |
| `text-4xl` | `32px` | `1.15` (`36.8px`)| `2.0rem` | Landing page subheadings, marketing feature callouts |
| `text-5xl` | `40px` | `1.15` (`46px`) | `2.5rem` | Primary homepage hero banner headline (`Home.jsx:380`) |

### 4.3 Letter Spacing (Tracking)

Defined in `festnest-react/tailwind.config.js:40-46`:

| Token | CSS Value | Typical Application |
| :--- | :--- | :--- |
| `tracking-tight` | `-0.03em` | Display headings, large hero text (prevents loose glyphs) |
| `tracking-snug` | `-0.02em` | Card titles (`EventCard.jsx:393`), section headers |
| `tracking-normal`| `-0.01em` | Standard paragraph text, UI button labels |
| `tracking-wide` | `0.04em` | Category badges, metadata pill labels |
| `tracking-wider` | `0.08em` | Uppercase section dividers (`Sidebar.jsx:35`, `HostEvent.jsx`) |

---

## 5. The Reduced Border-Radius System

A defining characteristic of FestNest's UI is its **Reduced Border-Radius System**. Rather than following Tailwind v3 defaults, FestNest overrides the scale in `tailwind.config.js:56-67` to cap container rounding.

### 5.1 Tailwind Config vs. FestNest Implementation

| Token | Standard Tailwind v3 | FestNest Override | Reduction Factor |
| :--- | :--- | :--- | :--- |
| `rounded-none` | `0px` | `0px` | Same |
| `rounded-xs` | *Not defined* | `4px` | Custom addition |
| `rounded-sm` | `2px` (`0.125rem`) | `6px` | Slightly larger than default |
| `rounded` / `rounded-DEFAULT` | `4px` (`0.25rem`) | `8px` | Standardised baseline |
| `rounded-md` | `6px` (`0.375rem`) | `8px` | Tied to 8px base |
| `rounded-lg` | `8px` (`0.5rem`) | `10px` | Capped |
| `rounded-xl` | `12px` (`0.75rem`) | `10px` | **Reduced by 16.7%** (Capped to 10px) |
| `rounded-2xl` | `16px` (`1.0rem`) | `12px` | **Reduced by 25.0%** (Capped to 12px) |
| `rounded-3xl` | `24px` (`1.5rem`) | `14px` | **Reduced by 41.7%** (Capped to 14px) |
| `rounded-full` | `9999px` | `9999px` | Retained for pill badges & avatars |

> [!IMPORTANT]
> Because `rounded-xl` is mapped to `10px` and `rounded-2xl` is mapped to `12px`, a component declared as `rounded-2xl` in FestNest does **not** receive a bubbly 16px radius. It is constrained to 12px.

### 5.2 Component Radius Application Matrix

| Component Type | Applied Class / Inline | Computed Radius | Source File Reference |
| :--- | :--- | :--- | :--- |
| **Main Event Card** | `style={{ borderRadius: 10 }}` | `10px` | `src/components/EventCard.jsx:290` |
| **Featured Event Card** | `className="rounded-lg"` | `10px` | `src/components/FeaturedEventCard.jsx:25` |
| **Trending / Urgency Card**| `className="rounded-md"` | `8px` | `src/pages/Home.jsx:498, 546` |
| **Primary Buttons** | `className="rounded-md"` | `8px` | `src/components/Topnav.jsx:80`, `AuthOverlay.jsx:39` |
| **Secondary Buttons** | `className="rounded-md"` | `8px` | `src/components/Topnav.jsx:126` |
| **Form Inputs & Search** | `className="rounded-md"` | `8px` | `src/components/Topnav.jsx:51`, `AuthOverlay.jsx:53` |
| **Card Action Buttons** | `style={{ borderRadius: 8 }}` | `8px` | `src/components/EventCard.jsx:340, 359` |
| **Modal / Dialog Boxes** | `style={{ borderRadius: 10 }}` / `rounded-xl` | `10px` | `EventCard.jsx:521`, `LogoutConfirmModal.jsx:27` |
| **Mobile Filter Sheet** | `className="rounded-t-lg"` | `10px (top)` | `src/components/EventFilters.jsx:39` |
| **Active Filter Chips** | `className="rounded-md"` | `8px` | `src/components/EventFilters.jsx:10` |
| **Category Badges** | `className="rounded-md"` / `style={{ borderRadius: 6 }}` | `6px – 8px` | `EventCard.jsx:205, 327` |
| **OTP Boxes** | `border-radius: 6px` | `6px` | `src/index.css:225` |
| **Skeleton Loaders** | `border-radius: 6px` | `6px` | `src/index.css:176` |
| **Floating Feedback Button**| `style={{ borderRadius: 9999 }}` + `.floating-feedback-btn` | `9999px` | `src/App.jsx:217`, `src/index.css:452` |
| **Avatars** | `className="rounded-full"` | `9999px` | `src/components/Topnav.jsx:109` |

---

## 6. Spacing, Grid & Layout System

FestNest uses an explicit 4px baseline spacing rhythm complemented by layout-specific constraints.

### 6.1 Spacing Scale

Defined in `festnest-react/tailwind.config.js:49-53`:

| Key | Value | Key | Value | Key | Value |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `1` | `4px` | `5` | `20px` | `10` | `40px` |
| `2` | `8px` | `6` | `24px` | `12` | `48px` |
| `3` | `12px` | `7` | `28px` | `14` | `56px` |
| `4` | `16px` | `8` | `32px` | | |

*Standard Tailwind spacing values (`p-2.5`, `py-3.5`, `p-5`) are also used where fine-tuned padding is needed.*

### 6.2 Breakpoints

Configured in `festnest-react/tailwind.config.js:78-83`:

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│      sm      │      md      │      lg      │      xl      │
│    640px     │    900px     │    1280px    │    1600px    │
│ Small Mobile │ Desktop Shell│ Large Screen │  Ultrawide   │
│   Devices    │  Transition  │ & Dual Grid  │ 4-Col Feed   │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

> [!WARNING]
> In FestNest, `md` is **900px**, not 768px. Any code that assumes desktop behavior begins at 768px will break or overlap with the sidebar transition.

### 6.3 Global Shell Layout Architecture (`src/App.jsx`)

On desktop (`min-width: 900px`), FestNest mounts a persistent CSS grid shell:

```html
<div className="
  md:grid 
  md:grid-cols-[260px_1fr] 
  lg:grid-cols-[280px_1fr] 
  xl:grid-cols-[300px_1fr] 
  md:grid-rows-[64px_1fr]
">
  <header className="md:col-span-2 md:row-start-1 md:row-end-2"><Topnav /></header>
  <aside  className="hidden md:flex md:col-start-1 md:row-start-2 md:row-end-3"><Sidebar /></aside>
  <main   className="md:col-start-2 md:row-start-2 md:border-l md:border-[#E4E4E0] overflow-y-auto pb-[72px] md:pb-0">
    <!-- Page Component -->
  </main>
</div>
```

- **Sidebar Width:** Scales from `260px` (at 900px) → `280px` (at 1280px) → `300px` (at 1600px).
- **Header Height:** Fixed at `64px` on desktop, `56px` on mobile (`h-14`).
- **Main Container Scroll:** Mobile scrolls the entire document; desktop keeps the header and sidebar stationary while `<main>` scrolls internally with `overflow-y-auto`.

### 6.4 The Event Feed Grid (`.feed-grid`)

The primary event discovery feed on `/home` and `/explore` uses a custom class defined in `src/index.css:294-320`:

- **Mobile (< 900px):** Single column flex layout (`flex flex-col gap: 16px; padding: 0 16px 32px`).
- **Desktop (≥ 900px):** 3-column CSS Grid (`grid-template-columns: repeat(3, 1fr); gap: 18px; max-width: 1200px; margin: 0 auto; padding: 0 24px 32px; align-items: stretch`).
- **Ultrawide (≥ 1600px):** 4-column CSS Grid (`grid-template-columns: repeat(4, 1fr); gap: 22px`).

---

## 7. Comprehensive Component Audit

### 7.1 Buttons

FestNest maintains four primary button archetypes:

#### 1. Primary Solid Button
- **Classes:** `px-4 py-2 bg-primary text-white rounded-md text-[14px] font-semibold hover:bg-primary-dark transition-colors duration-150`
- **Focus / Elevation:** Focus ring `focus:shadow-[0_0_0_3px_rgba(79,70,229,0.10)]`, hover shadow `shadow-indigo`.
- **References:** `Topnav.jsx:80`, `AuthOverlay.jsx:39`.

#### 2. Secondary Outline Button
- **Classes:** `px-4 py-2 border-[1.5px] border-border-strong rounded-md text-[14px] font-medium text-text-2 hover:border-primary hover:text-primary transition-all duration-150`
- **References:** `Topnav.jsx:126`, `Saved.jsx:132`.

#### 3. Ghost / Icon Button
- **Classes:** `w-9 h-9 rounded-lg flex items-center justify-center text-text-2 hover:bg-surface-3 transition-colors duration-150`
- **References:** `Topnav.jsx:92`, `Sidebar.jsx:14`.

#### 4. Floating Circular CTA (Feedback Button)
- **Classes:** `fixed bottom-24 md:bottom-6 right-4 md:right-6 z-30 flex items-center gap-2 p-2.5 sm:px-4 sm:py-2.5 bg-white text-text-1 hover:text-primary border border-[#E4E4E0] hover:border-primary/40 !rounded-full rounded-full floating-feedback-btn shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_24px_rgba(79,70,229,0.18)] transition-all duration-200 active:scale-95`
- **Reference:** `src/App.jsx:214-233`, `src/index.css:451-453`.

### 7.2 Inputs & Form Controls

#### 1. Text / Email / Search Inputs
- **Base Style:** `w-full px-4 py-3 border-[1.5px] border-[#CBCBC6] rounded-md text-[15px] text-[#111110] bg-white placeholder:text-[#AEAEAD] focus:border-primary focus:shadow-[0_0_0_3px_rgba(79,70,229,0.10)] transition-all duration-150 outline-none`
- **Error State:** `border-red-500 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.10)]`
- **Native Browser Invalidation Reset:** `input:invalid, select:invalid, textarea:invalid { box-shadow: none !important; border-color: #CBCBC6 !important; }` in `src/index.css:114-125`.

#### 2. OTP Input Digits
- **Implementation:** 6 individual character boxes defined in `src/index.css:222-237` (`.otp-box`).
- **Dimensions:** `52px × 60px` (mobile), `58px × 66px` (min-width: 400px).
- **Typography:** `Geist Mono`, `22px`, `font-bold`.
- **States:** Border `#CBCBC6`, active focus scales `transform: scale(1.04)` with Indigo ring, filled state changes to `#EEF2FF` background.

#### 3. Settings Toggle Switch
- **Implementation:** Custom pure CSS toggle in `src/index.css:246-267` (`.toggle-track`).
- **Track:** `40px × 22px`, `border-radius: 6px`, background `#E9E9E5`, toggled background `#4F46E5`.
- **Thumb:** `16px × 16px` white circle with `0 1px 3px rgba(0,0,0,0.15)` shadow, translates `18px` on active.

### 7.3 Cards

#### 1. Main Feed EventCard (`src/components/EventCard.jsx`)
- **Structure:**
  - 16:9 Aspect ratio image wrapper (`paddingTop: '56.25%'`).
  - Top-left category badge with category-specific tint.
  - Top-right share & save glassmorphism square icon buttons (`28px × 28px`, `border-radius: 8px`, `backdrop-filter: blur(6px)`).
  - Body container with 2-line clamped title, college + city pin line, hairline separator, date + deadline counter, and "View Details →" link.
- **Card Container:** `background: #fff; border: 1px solid #E4E4E0; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.05)`.
- **Hover:** `whileHover={{ y: -4, boxShadow: '0 12px 32px rgba(0,0,0,0.10)' }}`.

#### 2. Featured Event Card (`src/components/FeaturedEventCard.jsx`)
- **Variant:** Adds golden top border indicator (`#fcd34d`), warm gradient body background (`linear-gradient(135deg, #fffbeb 0%, #fefce8 100%)`), amber badge accents, and hover elevation with amber glow `box-shadow: 0 4px 20px rgba(251,191,36,0.20)`.

#### 3. Horizontal Saved Card (`src/pages/Saved.jsx:112-140`)
- **Layout:** Two-column flex card (`w-[88px]` thumbnail on left, metadata + action buttons on right).
- **Styling:** `bg-surface border border-border rounded-lg overflow-hidden flex hover:shadow-1 hover:-translate-y-[2px]`.

### 7.4 Navigation Components

- **Topnav (`src/components/Topnav.jsx`):** Sticky `64px` bar on desktop, `56px` on mobile. White background, border-bottom `#E4E4E0`, shadow `0 1px 3px rgba(0,0,0,0.06)`. Hosts brand logo, expand-to-fill search pill, desktop route links, notification bell with red unread indicator, and avatar badge.
- **Sidebar (`src/components/Sidebar.jsx`):** Desktop persistent bar (`260px–300px`). Links styled as full-width rounded rows (`rounded-md`, `px-[14px] py-[10px]`, `text-[14px] font-medium`). Active item highlighted with `bg-primary-light text-primary` and left border accent (`.sidebar-active-accent` with `box-shadow: inset 3px 0 0 #4F46E5`).
- **Bottom Navigation (`src/components/BottomNav.jsx`):** Mobile only (`md:hidden`). Fixed at bottom with safe-area padding (`pb-[calc(4px+env(safe-area-inset-bottom,0px))]`). Features 5 core tabs (Home, Explore, Saved/Admin/Organizer, Host, Profile) with active icon scale (`scale-110`) and badge counter.
- **Mobile Drawer (`src/components/MobileDrawer.jsx`):** Slides in from right (`w-[min(300px,82vw)]`) with spring physics `cubic-bezier(0.32, 0.72, 0, 1)`. Houses user profile identity header, categorized navigation list, and logout/login CTA.

### 7.5 Modals & Overlays

- **Modal Backdrop:** `fixed inset-0 bg-black/40` or `bg-black/50 backdrop-blur-[2px] z-[200]`.
- **Modal Containers:** Max-widths range from `340px` (LogoutConfirmModal) to `360px` (Delete modal) and `560px` (Competition details). Styled with `bg-white border border-border rounded-xl shadow-[0_8px_40px_rgba(0,0,0,0.18)] p-6`.
- **Mobile Drawer Sheet (`EventFilters.jsx:39`):** Slides up from bottom (`rounded-t-lg shadow-[0_-8px_40px_rgba(0,0,0,0.15)] max-h-[85vh] flex flex-col`) with a centered pill drag handle (`w-10 h-1 bg-[#E4E4E0] rounded-full`).
- **Auth Overlay (`AuthOverlay.jsx:604`):** Fullscreen portal (`fixed inset-0 z-[9999] flex bg-white md:bg-[#F1F0ED]`). Desktop presents a 400px deep indigo brand panel on the left and a scrollable form pane on the right.

### 7.6 Toasts (`src/components/ToastContainer.jsx`)

- **Placement:** Fixed at `top-4 right-4 z-[200] w-[360px] max-w-[calc(100vw-32px)]`.
- **Structure:** Rounded container (`rounded-lg`, shadow `0 8px 24px rgba(0,0,0,0.10)`), 4px left border accent, circular icon ring, bold title, message, close button, and an animated linear progress bar on the bottom edge that shrinks over the toast's duration (default 3500ms).
- **Variants:** `error` (Red `#DC2626`), `success` (Green `#16A34A`), `info` (Indigo `#4F46E5`), `warning` (Amber `#F59E0B`).

### 7.7 Pagination (`src/components/Pagination.jsx`)

- **Structure:** Centered pagination controls with previous/next chevron buttons, sliding window number pills, and ellipsis indicators.
- **Pill Style:** `min-w-[40px] h-10 px-2 rounded-[8px] text-[13px] font-semibold tabular-nums`.
- **Active Pill:** `bg-primary text-white font-bold shadow-xs shadow-primary/30`.
- **Event Count Subtext:** `text-[13px] text-text-3 font-medium tabular-nums text-center`.

### 7.8 Loading, Skeletons & Empty States

- **Skeleton Shimmer (`src/index.css:165-177`):** Custom CSS class `.skeleton` utilizing a 90-degree gradient sweep:
  ```css
  background: linear-gradient(90deg, #F3F4F6 20%, #EEF2FF 38%, rgba(79,70,229,0.08) 50%, #EEF2FF 62%, #F3F4F6 80%);
  background-size: 1200px 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: 6px;
  ```
- **ProgressiveSection (`src/components/loading/ProgressiveSection.jsx`):** Crossfade container using Framer Motion (`duration: 0.18s, ease: 'easeOut'`) respecting `prefers-reduced-motion`.
- **LongWaitNotice (`src/components/loading/LongWaitNotice.jsx`):** Informational banner appearing if API requests exceed expected latencies (`bg-indigo-50/90 border border-indigo-100 rounded-xl text-xs text-indigo-900`).
- **Empty States:** Large centered emoji (e.g. `🔖` on Saved, `🔍` on Explore), followed by an H3 title in DM Sans (`text-[18px] font-bold`), descriptive text in Geist Sans (`text-[14px] text-text-3`), and a primary action button.

---

## 8. Shadows, Elevation & Border Treatment

FestNest avoids heavy drop shadows, opting for sharp, ambient diffusion.

### 8.1 Shadow System

Defined in `festnest-react/tailwind.config.js:70-75` and `src/index.css:69-72`:

| Token | CSS Value | Application |
| :--- | :--- | :--- |
| `shadow-1` | `0 1px 3px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)` | Subtle resting elevation for cards, search pills |
| `shadow-2` | `0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)` | Hover lift for cards, dropdown menus |
| `shadow-3` | `0 12px 32px rgba(0,0,0,0.10), 0 4px 8px rgba(0,0,0,0.05)` | Active modals, dialogs, desktop popovers |
| `shadow-indigo` | `0 4px 14px rgba(79,70,229,0.25)` | Primary CTA hover state, active button focus |

### 8.2 Border Styles

- **Standard Hairline:** `border border-[#E4E4E0]` (`border-border`) is the universal separator throughout headers, sidebars, cards, and list rows.
- **Input Border:** `border-[1.5px] border-[#CBCBC6]` (`border-border-strong`).
- **Focus Rings:** Non-intrusive box shadows `box-shadow: 0 0 0 3px rgba(79,70,229,0.10)`.
- **Active Card Borders:** `border-primary` or `#4F46E5` upon hover or active selection.

---

## 9. Icons & Iconography Standards

### 9.1 Icon Libraries

1. **`lucide-react` (v1.17.0):** The primary icon library used across all modern pages, forms, and tabs.
2. **Dedicated Inline SVG Helpers:** Used in performance-critical chrome components (`Topnav.jsx`, `Sidebar.jsx`, `EventCard.jsx`, `BottomNav.jsx`) to avoid runtime wrapper overhead and optimize bundle size.

### 9.2 Icon Sizing Standards

- **11px – 13px (Micro):** Location pin, calendar icon, close buttons, external link indicators (`PinIcon`, `CalIcon`).
- **14px – 16px (Inline UI):** Filter chips, dropdown arrows, toast glyphs, section header indicators (`Flame`, `Timer`, `ChevronDown`).
- **18px – 20px (Action & Navigation):** Sidebar icons, search bar inputs, drawer links, stat card metrics.
- **22px – 24px (Major Navigation):** Bottom nav tab icons, modal alerts.
- **28px – 42px (Hero & State Alerts):** Delete confirmation modals, empty state illustrations.

### 9.3 Stroke Width Standards

- **Default Stroke:** `strokeWidth={2}` or `strokeWidth={1.8}` for standard icons.
- **Micro Glyphs:** `strokeWidth={2.5}` for small chevrons and checkmarks (`w-3 h-3`) to maintain line weight at small scales.

---

## 10. Animation, Motion & Interaction Patterns

FestNest implements interface motion primarily via **Framer Motion (v11.0.0)** supplemented by keyframe classes in `src/index.css`.

### 10.1 Global Animation Transitions

Defined in `festnest-react/tailwind.config.js:86-94` and `src/index.css:73-76`:

- `--t-fast`: `150ms ease` (Hover color changes, button active state)
- `--t-base`: `200ms ease-out` (Card elevation, tab switches)
- `--t-modal`: `300ms cubic-bezier(0.32, 0.72, 0, 1)` (Drawer entry, modal popup)
- `--t-bounce`: `400ms cubic-bezier(0.34, 1.56, 0.64, 1)` (Success badges, pop confirmations)

### 10.2 Framer Motion Reusable Patterns

```javascript
// Screen Entrance
<motion.div 
  initial={{ opacity: 0 }} 
  animate={{ opacity: 1 }} 
  exit={{ opacity: 0 }} 
  transition={{ duration: 0.15 }}
/>

// Card Hover Lift
<motion.article
  whileHover={{ y: -4, boxShadow: '0 12px 32px rgba(0,0,0,0.10)' }}
  whileTap={{ scale: 0.98 }}
  transition={{ duration: 0.16, ease: 'easeOut' }}
/>

// Bottom Sheet / Drawer Transition
<motion.div
  initial={{ y: '100%' }}
  animate={{ y: 0 }}
  exit={{ y: '100%' }}
  transition={{ type: 'spring', damping: 30, stiffness: 300 }}
/>
```

### 10.3 Reduced Motion Accessibility

In `src/index.css:179-185`, skeleton animations are disabled for users who request reduced motion:
```css
@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
    background: #F3F4F6;
  }
  .fn-sheen {
    animation: none;
  }
}
```
`ProgressiveSection.jsx` actively listens to `window.matchMedia('(prefers-reduced-motion: reduce)')` and sets animation duration to `0s`.

---

## 11. Responsive Design & Breakpoint Mechanics

### 11.1 Breakpoint Tiers & Behavior

```
Width: 0px ────── 640px ────── 900px ────── 1280px ────── 1600px ───►
Tier:     Mobile         Tablet        Desktop         Ultrawide
        (1 Col)       (1-2 Col)       (3 Col)          (4 Col)
```

| Viewport Tier | Pixel Range | Navigation Shell | Feed Grid Layout |
| :--- | :--- | :--- | :--- |
| **Mobile** | `320px – 639px` | Topnav (`56px`) + BottomNav + Drawer | 1 column stacked (`gap: 16px`) |
| **Tablet** | `640px – 899px` | Topnav (`56px`) + BottomNav + Drawer | 1 column stacked (or 2 col category) |
| **Desktop** | `900px – 1599px` | 260px–280px Sidebar + Topnav (`64px`) | 3 columns grid (`gap: 18px, max-w: 1200px`) |
| **Ultrawide** | `1600px+` | 300px Sidebar + Topnav (`64px`) | 4 columns grid (`gap: 22px`) |

### 11.2 Horizontal Scrolling Patterns

To present dense catalogs on touchscreens without vertical page bloat, FestNest employs horizontal snap scrollers:
- Classes: `overflow-x-auto no-scrollbar scroll-snap-x pb-2`
- Children: `flex-shrink-0 w-[196px] scroll-snap-start`
- Applied on:
  - Trending Now carousel (`Home.jsx:489`)
  - Ending Soon carousel (`Home.jsx:537`)
  - Section navigation tabs on Event Details (`EventDetails.jsx:461`)
  - Active filter pill row (`EventFilters.jsx`)

### 11.3 Safe Area Inset Support

Mobile controls with fixed positions explicitly support notch/home-indicator viewports using `env(safe-area-inset-bottom, 0px)`:
- `BottomNav.jsx:61`: `pb-[calc(4px+env(safe-area-inset-bottom,0px))]`
- `EventDetails.jsx:2079`: Mobile sticky action bar `pb-[calc(12px+env(safe-area-inset-bottom,0px))]`
- `MobileDrawer.jsx:197`: Footer `pb-[calc(12px+env(safe-area-inset-bottom,0px))]`

---

## 12. Page-by-Page UI/UX Audit

### 12.1 Home (`/home`)
- **Layout:** Contained within shell `<main>`. Mobile padding `px-4`, desktop padding `.hero-desktop` (`40px 24px 0, max-w: 1200px`).
- **Typography:** Display hero in DM Sans (`text-[28px]` sm: `text-[34px]` md: `text-[38px] lg:text-[40px] font-bold`). Section headings: `text-[16px] md:text-[18px] font-bold`.
- **Components:** Banner alert, live status pulse dot, search input pill with suggestion flyout, horizontal trending scroller, horizontal urgent scroller, 3-layer category filter chip bar, and `.feed-grid` rendering `EventCard` instances with `Pagination`.
- **Responsive Decisions:** Search suggestions drop down as an absolute popover; trending cards display 196px wide on mobile and 224px on desktop.

### 12.2 Explore (`/explore`)
- **Layout:** Full width with centered max container (`md:max-w-[1140px] md:mx-auto`).
- **Components:** Full-width search bar with integrated filter button, 2-column mobile / 3-column desktop category card grid (`grid-cols-2 md:grid-cols-3 gap-3`), active filter pill strip, and `.feed-grid`.
- **Unique Patterns:** Direct URL parameter sync (`?cat=Hackathon&page=2`) with memory restoration when navigating back from event details.

### 12.3 Event Details (`/event/:id`)
- **Layout:** Header with 16:9 or custom banner image, followed by a 2-column desktop split:
  - `lg:grid lg:grid-cols-[1fr_360px] lg:gap-9 items-start max-w-[1280px]`
  - Left column: Overview, description, competition track cards, eligibility, rules, perks, organizer POC.
  - Right column (Desktop): Sticky sidebar (`360px`) containing registration status, live countdown, ticket prices, and primary CTA.
- **Mobile Treatment:** The right action column hides on mobile. Instead, a fixed bottom floating action bar appears (`lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-[20px]`).
- **SectionNav:** Sticky tab strip (`sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-border`) with automatic horizontal scrolling to keep the active section tab centered.

### 12.4 Host Event (`/host`)
- **Layout:** Stepper form wizard (`lg:grid lg:grid-cols-[3fr_1fr] lg:gap-8 max-w-[1100px]`).
- **Components:** 5-step indicator bar, draft resume notice, `AiPosterUploadCard` (PDF poster autofill with drag-and-drop), `ImageCropper` modal, controlled form sections, and step navigation buttons.
- **Card Styling:** Form sections wrapped in `bg-white border border-[#E4E4E0] rounded-lg p-5 sm:p-6 mb-5`.

### 12.5 Feedback (`/feedback`)
- **Layout:** Centered single-column form (`max-w-2xl mx-auto px-4 py-8`).
- **Components:** Category toggle pill grid (`rounded-xl`), 5-star rating selector, expanding textarea with character counter (`message.length / 2000`), optional email input, and submit button.
- **Visual Variation:** Uses `rounded-xl` (10px) on form controls rather than the system standard `rounded-md` (8px).

### 12.6 Organizer Dashboard (`/organizer`)
- **Layout:** Dedicated dashboard layout independent of student feed. Collapsible left sidebar (`OrganizerSidebar`) + sticky topbar (`OrganizerTopbar`) + main content container (`max-w-7xl mx-auto p-4 sm:p-8`).
- **Tabs:** Overview (Metrics, StatCards, Quick Actions), Events (Tabs for Published/Draft/Past), Participants (Registration table with search and CSV export), Analytics (Engagement graphs via Recharts), Tips.
- **Components:** `CompetitionManager` modal, `EventDetailDrawer` slide-over, `BulkTrackImportModal`.

### 12.7 Admin Dashboard (`/admin`)
- **Layout:** Security-gated shell. Collapsible `AdminSidebar` with notification badges, `AdminTopbar` with quick event creation CTA, and tabbed view.
- **Tabs:** Overview, Submissions (Approval queue with split preview), Events, Users, Tickets (Support ticketing system), Featured (Drag-to-order featured events), Broadcast (In-app notifications), Colleges, Ambassadors, Feedback.
- **Styling Variance:** Substantial usage of Tailwind's default palette (`slate-50`, `neutral-900`, `indigo-600`) alongside FestNest tokens.

### 12.8 Campus Ambassador Portal (`/campus-ambassador` & `/ca/dashboard`)
- **Landing (`festnest_ca_page.jsx`):** Dark/indigo marketing presentation with digital ID card mockup, tier progression roadmap (Bronze, Silver, Gold, City Lead), FAQ accordion, and application form.
- **Dashboard (`ca/CampusAmbassadorDashboard.jsx`):** Live referral stats, digital ID card preview with HTML5 canvas PNG exporter (`exportCardAsPNG`), task list, milestone rewards, and leaderboard.

### 12.9 Authentication Overlay (`AuthOverlay.jsx`)
- **Layout:** Global modal dialog outside page routes (`z-[9999]`). Desktop: 400px deep indigo branding banner with testimonial stats; right pane: multi-step auth wizard.
- **Steps:** 1: Welcome / Entry, 2: Role selection (Student vs. Organizer), 3: Signup form, 4: OTP Verification, 5: Interests picker, 6: Success confirmation, 'login': Login form, 'forgot': Password reset flow.

### 12.10 Profile & Edit Profile (`/profile`, `/profile/edit`)
- **Layout:** Desktop uses `.profile-desktop-grid` (`360px 1fr` columns, `max-w: 1140px`).
- **Left Column:** User avatar, name, college, points badge, achievement medal shelf (Pioneer, First Timer, Explorer, Finisher, Rising Star, FestNest Pro).
- **Right Column:** Tabbed list of registered events, saved events, and activity history.

### 12.11 Notifications (`/notifications`)
- **Layout:** Single column (`max-w-[720px] mx-auto`) with tab strip (All, Deadlines, Updates, System).
- **Cards:** Date-grouped notification items with left unread accent bar (`3px` primary indigo), icon bubble, title, description, and action deep-link.

### 12.12 My College Hub (`/college`)
- **Layout:** Centered campus portal (`max-w-[1140px] mx-auto`).
- **Sections:** College hero card, campus metrics (events, registered students, city rank), upcoming campus events, active student clubs & societies grid, and campus leaderboard podium.

### 12.13 Support (`/support`)
- **Layout:** Multi-channel helpdesk (`max-w-[1000px] mx-auto`).
- **Sections:** Contact channels grid (General, Enquiry, Partnerships, Automated), FAQ accordion with search filter, and ticket submission form.

### 12.14 Blog Hub & Article Pages (`/blog`)
- **Layout:** Magazine layout (`max-w-[1100px] mx-auto`).
- **Typography:** Uses `.prose-custom` (`index.css:424-448`) with `line-height: 1.75` for body paragraphs and DM Sans for article headings.
- **Components:** Table of contents, callout boxes (`tip`, `warning`, `info`, `success`), related post cards, and event discovery CTAs.

---

## 13. Design Tokens & CSS Architecture Analysis

### 13.1 Architecture Overview

```
festnest-react/
├── index.html                   ── Google Fonts (DM Sans), Preload Geist-Variable.woff2
├── tailwind.config.js           ── Color tokens, Reduced Radius, 4px Spacing, Non-standard Breakpoints
└── src/
    ├── index.css                ── @font-face, CSS Variables, Animations, Feed Grid, Resets
    ├── components/              ── Reusable atomic UI building blocks
    ├── pages/                   ── Route-level views with local layouts
    └── data/categories.js       ── Source of truth for categories, tints & ordering
```

### 13.2 Duplication Analysis: CSS Variables vs. Tailwind Tokens

In `src/index.css:37-77`, CSS variables (`--c-primary: #4F46E5`, `--c-surface-2: #F8F8F6`, etc.) mirror the theme tokens in `tailwind.config.js:8-16`. 
- **Reason:** Components that utilize inline styles or Framer Motion animation objects (e.g. `EventCard.jsx`, `AuthOverlay.jsx`) read `var(--c-primary)` or `var(--f-sans)`, while JSX markup uses Tailwind utility classes (`bg-primary`, `font-sans`).
- **Evaluation:** This dual-token setup is stable, but developers must ensure any future color tweak is updated in both `tailwind.config.js` and `src/index.css`.

---

## 14. Audit Findings & Current Inconsistencies

During the technical audit, the following inconsistencies and legacy patterns were documented:

### 1. Typography Inconsistencies
- **CLAUDE.md Outdated:** `CLAUDE.md` documents *Syne* as display font and *DM Sans* as body font. In actual code, **Geist Sans** is the body font and **DM Sans** is the display font.
- **Orphaned Space Grotesk:** `@fontsource/space-grotesk` is installed in `package.json` but never imported or used.
- **Canvas-Only Fonts in Public Folder:** `Clash Display` and `Satoshi` exist in `public/fonts/` but are only referenced in Canvas drawing code. A new developer might assume they can use `font-clash` or `font-satoshi` as CSS classes.

### 2. Border-Radius Inconsistencies
- **Legacy Arbitrary Radius in SEO Pages:** `CityPage.jsx:24` and `CategoryPage.jsx:16` contain `rounded-[18px]` in their skeleton cards, predating the reduced-radius design system.
- **Explicit Pixel Class in Pagination:** `Pagination.jsx:70, 107, 127` uses `rounded-[8px]` rather than the semantic `rounded-md` class.
- **Form Input Discrepancy:** `Feedback.jsx:217, 255` uses `rounded-xl` (10px) on textarea and input elements, whereas all other forms (`AuthOverlay`, `HostEvent`, `Topnav`, `Explore`) use `rounded-md` (8px).
- **Floating Button Override:** Because global resets or button rules threatened to override pill roundings, `App.jsx:222` and `index.css:452` use `!rounded-full` and `border-radius: 9999px !important`.

### 3. Palette & Styling Divergences in Admin Views
- `AdminDashboard.jsx` and its tabs frequently use Tailwind's default palette: `bg-slate-50` (instead of `bg-surface-2`), `text-neutral-900` (instead of `text-text-1`), and `bg-indigo-600` (instead of `bg-primary`). While functional, it diverges from the core FestNest token vocabulary.

### 4. Component Layout Variations
- **Saved Events Card:** `Saved.jsx:112` renders events as a horizontal split row (`w-[88px]` thumbnail on left, text on right) across a 2-column grid, while `Home.jsx` and `Explore.jsx` render 16:9 vertical cards in a 3-column feed.

---

## 15. Recommended FestNest Design Standard

To maintain visual unity across future features, all new components and pages should follow this definitive standard:

### 15.1 Golden Rules for Developers

1. **Typography:**
   - Use `font-sans` (Geist Sans) for all body text, UI labels, buttons, inputs, and card metadata.
   - Use `font-heading` (DM Sans) for all H1, H2, and H3 titles and modal headers.
   - Use `font-mono` (Geist Mono) for dates, times, ticket numbers, OTPs, and metrics.
   - Do **not** use `font-syne` or attempt to import Space Grotesk.

2. **Colors:**
   - Always use FestNest semantic tokens: `bg-primary`, `text-primary`, `bg-surface`, `bg-surface-2`, `text-text-1`, `text-text-2`, `text-text-3`, `border-border`.
   - Never use Tailwind defaults like `bg-slate-50`, `text-neutral-900`, `bg-indigo-600`, or arbitrary hex codes in new components.

3. **Border Radius (Reduced System):**
   - **Inputs & Selects:** Always `rounded-md` (`8px`).
   - **Buttons:** Standard `rounded-md` (`8px`); Large CTAs `rounded-lg` (`10px`).
   - **Cards & Modals:** Standard `rounded-lg` (`10px`); Large dialogs `rounded-xl` (`10px` in config) or `rounded-2xl` (`12px` in config).
   - **Pills, Badges & Avatars:** `rounded-full` (`9999px`).
   - **Never** write arbitrary radius classes like `rounded-[16px]` or `rounded-[18px]`.

4. **Breakpoints & Layout:**
   - Remember that desktop begins at `md:` (**900px**).
   - When building feeds, use the `.feed-grid` class to inherit the tested 1-col → 3-col → 4-col responsive behavior.
   - On mobile pages with fixed action bars, always add `pb-[calc(12px+env(safe-area-inset-bottom,0px))]` to prevent clipping on modern devices.

5. **Icons:**
   - Use `lucide-react` with `strokeWidth={1.8}` or `strokeWidth={2}`.
   - Icon sizing: `12px–14px` for metadata chips; `16px–18px` for buttons; `20px–22px` for top-level navigation.

---

## 16. Developer Quick Reference Recipes

Copy-paste Tailwind recipes for standard FestNest UI patterns:

### Primary CTA Button
```jsx
<button className="px-4 py-2.5 bg-primary text-white text-[14px] font-bold rounded-md hover:bg-primary-dark hover:shadow-indigo transition-all duration-150 active:scale-95 flex items-center justify-center gap-2">
  <span>Confirm Registration</span>
</button>
```

### Secondary Outline Button
```jsx
<button className="px-4 py-2.5 bg-white border-[1.5px] border-border-strong text-text-2 text-[14px] font-medium rounded-md hover:border-primary hover:text-primary transition-all duration-150 active:scale-95">
  <span>Cancel</span>
</button>
```

### Standard Form Input
```jsx
<div className="space-y-1.5">
  <label className="block text-[13px] font-semibold text-text-2">
    College Name
  </label>
  <input
    type="text"
    placeholder="e.g. IIT Bombay"
    className="w-full px-4 py-2.5 border-[1.5px] border-border-strong rounded-md text-[14px] text-text-1 bg-white placeholder:text-text-4 focus:border-primary focus:shadow-[0_0_0_3px_rgba(79,70,229,0.10)] transition-all outline-none"
  />
</div>
```

### Content Card Container
```jsx
<div className="bg-white border border-border rounded-lg p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:shadow-2 hover:-translate-y-[2px] transition-all duration-base">
  <h3 className="font-heading font-bold text-[16px] text-text-1 mb-1">Card Heading</h3>
  <p className="text-[13px] text-text-3 leading-relaxed">Description copy goes here...</p>
</div>
```

### Metadata Badge / Pill
```jsx
<span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-primary-light text-primary border border-[#C7D2FE]">
  <Sparkles size={12} strokeWidth={2} />
  Featured
</span>
```

### Modal Dialog Shell
```jsx
<div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
  <div className="w-full max-w-[420px] bg-white border border-border rounded-xl p-6 shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
    <h2 className="font-heading font-bold text-[18px] text-text-1 mb-2">Modal Title</h2>
    <p className="text-[14px] text-text-3 mb-6">Modal message content goes here.</p>
    <div className="flex gap-3">
      {/* Actions */}
    </div>
  </div>
</div>
```

---

## 17. File & Component Master Registry

| Area | Primary Files | Key Components & Tokens |
| :--- | :--- | :--- |
| **Tokens & Theme** | `tailwind.config.js`, `src/index.css` | Colors, fonts, radius scale, breakpoints, global animations |
| **Shell & Nav** | `src/App.jsx`, `src/components/Topnav.jsx`, `src/components/Sidebar.jsx`, `src/components/BottomNav.jsx`, `src/components/MobileDrawer.jsx` | 2D desktop CSS grid, floating feedback button, mobile navigation |
| **Event Cards** | `src/components/EventCard.jsx`, `src/components/FeaturedEventCard.jsx` | 16:9 aspect image, category badge tint, inline SVG actions, prize badges |
| **Discovery & Filters** | `src/components/EventFilters.jsx`, `src/data/categories.js` | `FilterSheet`, `SortDropdown`, `ActivePill`, priority category ordering |
| **Auth** | `src/components/AuthOverlay.jsx` | Fullscreen modal, 6-box OTP, password strength bar, role selector |
| **Feedback & Dialogs**| `src/pages/Feedback.jsx`, `src/components/LogoutConfirmModal.jsx`, `src/components/ToastContainer.jsx` | Dynamic ratings, toast notifications, confirmation dialogs |
| **Creation & Upload** | `src/pages/HostEvent.jsx`, `src/components/AiPosterUploadCard.jsx`, `src/components/ImageCropper.jsx` | Wizard stepper, PDF upload card, canvas cropper |
| **Event Details** | `src/pages/EventDetails.jsx` | Dual desktop grid, sticky SectionNav, mobile floating bottom CTA bar |
| **Dashboards** | `src/pages/organizer/OrganizerDashboard.jsx`, `src/pages/admin/AdminDashboard.jsx`, `src/pages/ca/CampusAmbassadorDashboard.jsx` | StatCards, management tables, Recharts analytics, digital ID card exporter |
| **Pages & SEO** | `src/pages/Home.jsx`, `src/pages/Explore.jsx`, `src/pages/Saved.jsx`, `src/pages/Profile.jsx`, `src/pages/seo/*`, `src/pages/blog/*` | Feed grid, profile grid, SEO landing hubs, blog typography |

---

*Report concluded. This document serves as the authoritative single source of truth for the FestNest UI/UX Design System.*

