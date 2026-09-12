# FestNest — Refer & Earn + Spin Wheel

Implement a **secure, backend-driven Refer & Earn + FN Coins + Spin Wheel reward system** in the existing FestNest application. Do not trust frontend-calculated FN Coins, referral counts, eligibility, or spin results.

The frontend page for this already exists at `src/pages/refer/ReferAndEarn.jsx` — its header comment defines the exact API contract this backend must implement. Build against that contract.

**Terminology — read this before touching the User model.** "FN Coins" is the currency for this program only: earned exclusively via referrals (10 per verified referral), spent exclusively on spins (200 at a time). It is a **completely separate system** from the "Points" a user already earns elsewhere on FestNest for hosting or registering for events (`User.points`). Do not read, write, mix, or convert between the two anywhere in this feature. Give FN Coins its own field(s) and its own ledger — never touch the existing `User.points` field or its write paths. A spin-wheel reward of type `fn_coins` credits bonus FN Coins, never `User.points`.

## 1. Core User Flow

**User refers friends → successful referrals generate FN Coins → FN Coins accumulate → eligibility is checked → user gets Spin Wheel access → user spins → reward is awarded.**

### FN Coins

* Every **valid successful referral = 10 FN Coins**
* The user needs **200 FN Coins** to satisfy the FN Coins requirement for one spin.
* 200 FN Coins = 20 successful referrals worth of FN Coins.

However, FN Coins alone are NOT sufficient.

### Referral-to-event requirement

For every group of **10 successful referred users**, at least **5 of those referred users must register for an event**.

**10 successful referrals + minimum 5 referred users registering for an event = eligible progress**

Do NOT allow a user to get a spin simply by reaching 200 FN Coins if the event-registration requirement has not been satisfied.

---

## 2. Important FestNest Architecture Constraint

FestNest currently does **not process event registration payments or registration itself** — it displays an event and redirects the user to the **official event registration page**.

Do NOT assume that clicking "Register" means the user actually completed the external registration.

* do NOT mark the referral as event-registered merely because the user clicked the external registration link.
* do NOT create fake registration confirmation.
* structure the code so registration verification can later be connected to an organizer/API/webhook/import/confirmation mechanism.
* keep the verification source explicit in the database.

---

## 3. Referral Ownership

Every user can have **zero or one permanent referrer**. Once assigned:

* that relationship is permanent and cannot be changed through the frontend.
* the referred user cannot later enter another referral code.
* referral ownership must be stored server-side.

`B.referredBy = A` must never later become `B.referredBy = C`.

---

## 4. What Counts as a Successful Referral

NOT successful merely because someone clicked a link, opened a page, entered a code, or created an unverified/fake account.

At minimum enforce: new account, valid unique email/phone per existing FestNest auth rules, referral relationship created only once, account verification completed, no self-referral. Follow FestNest's existing verification system rather than a parallel one.

Only after the referral becomes valid should the referrer receive **+10 FN Coins**.

---

## 5. Anti-Abuse Rules — Mandatory

**Self referral:** block a user referring themselves, an alternate account referring their own primary account, or registering via their own referral link.

**Duplicate referral:** one referred account generates a reward only once — never award the +10 FN Coins more than once for the same referred user.

**Referral reassignment:** once assigned, a referral cannot be moved to another referrer.

**Fake accounts:** detect/block suspicious duplicate accounts using signals already available in the project (same verified email/phone, existing account identity, suspicious repeated registration patterns). Do not rely on IP alone.

**Referral link abuse:** opening/sharing a link must not generate FN Coins — only a valid referred account does.

**Race conditions:** use transactional backend logic so two simultaneous requests cannot award `10 + 10` FN Coins for the same referral. The reward operation must be idempotent.

**API manipulation:** never accept these as authoritative from the frontend — FN Coins, referral count, successful referral count, event-registration count, spin eligibility, reward probability, selected prize, remaining spins. The backend calculates all of these.

---

## 6. FN Coin Ledger

Do not store a single mutable `fnCoins = 200` value. Build a proper transaction/ledger:

| User | Type | FN Coins | Reference |
| --- | --- | ---: | --- |
| A | Referral reward | +10 | Referral B |
| A | Referral reward | +10 | Referral C |
| A | Spin cost | -200 | Spin #12 |
| A | Bonus | +20 | Campaign |

Suggested fields: userId, type, amount, source/reference, referralId if applicable, spinId if applicable, createdAt, metadata. Balance is derived/maintained safely from this ledger.

---

## 7. Spin Eligibility

A user must satisfy **both**:

* **Condition A:** `availableFnCoins >= 200`
* **Condition B:** `successful referred users >= 10` AND `verified event registrations from referred users >= 5` (for the relevant milestone block)

The backend checks eligibility immediately when the user attempts to spin — never from frontend state.

---

## 8. Milestone Handling

Support repeated spins. Example: 20 referrals + 10 verified registrations + 400 FN Coins → potentially 2 spins, if the business rules treat each 10-referral block independently.

* Milestone 1: 10 referrals + 5 registrations → unlock 1 spin
* Milestone 2: 20 referrals + 10 registrations → unlock another spin
* ...and so on.

Once a milestone has been consumed for a spin, it must not be reused. Track consumed/unlocked milestones or an equivalent immutable state mechanism.

---

## 9. Spin Consumption

1. Backend verifies authentication.
2. Backend verifies eligibility.
3. Backend verifies sufficient FN Coins.
4. Backend verifies referral/event requirements.
5. Backend reserves/consumes the spin atomically.
6. Backend deducts 200 FN Coins.
7. Backend determines the reward securely on the server.
8. Backend stores the result.
9. Frontend displays the already-determined result.

`Frontend → spin request` → `Backend → secure random reward` → `Backend → stores result` → `Frontend → displays backend result`. The frontend never determines the prize.

---

## 10. Prevent Double Spins

Guard against double-clicking, refreshing mid-spin, replayed requests, or multiple tabs consuming one spin for multiple rewards. Use a database transaction, unique spin ID, idempotency handling, atomic balance/spin deduction, and server-side validation. A single eligible spin must produce exactly one final result.

---

## 11. Spin Wheel Rewards

Configurable reward slots (not hard-coded in the frontend), e.g.: ₹10 / ₹25 / ₹50 / ₹100 cash, +20 / +50 FN Coins, FestNest merchandise, event-related reward, bonus spin, better luck next time. Rewards should be configurable by admin.

---

## 12. Reward Probability

Controlled entirely by backend configuration (example only, not final values):

| Reward | Probability |
| --- | ---: |
| ₹10 | 25% |
| ₹25 | 15% |
| ₹50 | 5% |
| ₹100 | 1% |
| +20 FN Coins | 20% |
| +50 FN Coins | 10% |
| Merchandise | 1% |
| Better luck next time | 23% |

Admin should be able to configure: reward name, type, value, probability/weight, active/inactive, inventory/availability, start/end date, max winners. Total active reward weights must be validated.

---

## 13. Cash Rewards

FestNest doesn't collect event-registration money, so cash rewards are a separate marketing expense. Never promise automatic payout unless a payout system exists.

Flow: `Spin result → reward marked pending → user provides/has verified payout details → admin/process verifies → reward paid → status becomes paid`.

Suggested states: pending, under_review, approved, paid, rejected, cancelled. Frontend users can never change reward status.

---

## 14. Reward Inventory

For physical/limited rewards, support inventory (e.g. "FestNest T-Shirt": 20 available). Reserve/decrement safely, never go negative, handle simultaneous winners transactionally. At zero, the reward auto-becomes unavailable.

---

## 15–18. Referral Dashboard, Sharing, and History (Frontend — already built)

These are implemented in `src/pages/refer/ReferAndEarn.jsx`: FN Coins progress, referral progress, event-registration progress, spin status, referral link/code sharing (copy, WhatsApp, native share), referral history with status + FN Coins + event status, and spin history with reward + status. The backend must supply this data via the API contract documented at the top of that file. Do not show misleading messages like "FN Coins remaining → spin available" when the event-registration requirement is still incomplete — the page's copy already handles this dynamically from whatever the backend returns.

---

## 19. Admin Panel

Add an admin section (can follow after the core flow is live) covering: total/valid/invalid referrals, referral & event-registration conversion, FN Coins issued/spent, spins performed, rewards won, cash rewards pending/paid, suspicious referrals, blocked users, reward inventory. Admin controls: enable/disable Refer & Earn, change FN Coins earned per referral / FN Coins required per spin / required referral & registration counts, create/edit/deactivate rewards, configure probability/weights, manage inventory, review suspicious referrals, invalidate fraudulent referrals, revoke associated FN Coins, revoke unused fraudulent spins, manage cash reward status. All admin actions should be audited.

---

## 20. Fraud Invalidation

If a referral is later identified as fraudulent and an admin invalidates it, the system must recalculate/reverse the associated referral reward (e.g. 200 FN Coins → 190 FN Coins after reversing a +10 referral). If that referral contributed to spin eligibility, recalculate whether the user remains eligible. Use reversible/auditable transactions — do not simply delete records.

---

## 21. External Event Registration Problem

Implement an explicit `eventRegistrationVerificationSource` field. Possible values: `organizer_api`, `organizer_webhook`, `festnest_registration`, `verified_import`, `manual_admin_verification`. Never use "external register button clicked" as equivalent to "event_registered = true" unless a trustworthy mechanism already proves completion. Keep this extensible.

---

## 22. Security Requirements

All reward-related actions must be authenticated and authorized: referral creation/confirmation, FN Coin awarding/deduction, spin eligibility/execution, prize selection, reward issuance, admin reward management. Add rate limiting, input validation, database constraints, transaction handling, authorization checks, idempotency, and audit logging. Never expose reward probabilities or internal fraud rules to clients.

---

## 23. Database Integrity

Ensure (via unique constraints / foreign keys, following the existing DB conventions): one referral relationship per referred user, one referral reward per referral, one result per spin, unique spin transaction ID, unique FN Coin transaction IDs, no duplicate milestone consumption.

---

## 24. Frontend Requirements

Already implemented in `src/pages/refer/ReferAndEarn.jsx` — see that file's header comment for the exact API contract it expects.

---

## 25. Error Handling (reference copy — the frontend already implements equivalents)

* Not enough FN Coins: "You need N more FN Coins before you can use your spin."
* Referral requirement incomplete: explain exactly what's missing (referrals vs. event registrations).
* No spin available: "You currently don't have an available spin."
* Fraud protection: generic message only — never reveal internal fraud-detection logic.
* Spin already processing: "Your spin is already being processed. Please check your spin history."

---

## 26. Do Not Break Existing FestNest Flows

Before implementing:

1. Read `CLAUDE.md`.
2. Inspect the current authentication system.
3. Inspect the current User model.
4. Inspect event models.
5. Inspect existing event-registration/redirect tracking.
6. Inspect existing admin dashboard structure.
7. Follow existing backend/frontend architecture; reuse existing components/utilities.
8. Do not rewrite unrelated systems or duplicate auth/user/event/admin systems.

---

## 27. Testing Requirements

**Referral:** valid referral, duplicate referral, self-referral, referral reassignment, unverified account, concurrent referral requests.

**FN Coins:** exactly +10 for valid referral, no duplicate reward, correct ledger entry, fraud reversal, concurrent updates.

**Eligibility:** 200 FN Coins + 5/10 registrations = eligible; 200 FN Coins + 4/10 = NOT eligible; 190 FN Coins + 5/10 = NOT eligible; 200 FN Coins + 10/20 = correct milestone handling; milestone cannot be reused.

**Spin:** one spin → exactly one reward; double-click cannot generate two rewards; concurrent requests cannot duplicate rewards; frontend cannot choose the prize; backend chooses it; 200 FN Coins deducted exactly once.

**Rewards:** probability/weight configuration works; inactive rewards cannot be selected; inventory cannot go negative; cash rewards enter the correct state.

**Security:** unauthorized API access rejected; users cannot modify their FN Coins, referral ownership, or reward status; users cannot call admin endpoints.

---

## 28. Business Logic Summary

**1 successful referral = 10 FN Coins.** FN Coins alone do NOT unlock the spin. The user needs **200 FN Coins** AND **at least 5 of every 10 successful referred users with a VERIFIED event registration**. Then **1 eligible milestone = 1 spin**. Spinning consumes 200 FN Coins; the backend securely determines exactly one reward. Everything must be auditable and fraud-resistant.

---

## 29. Implementation Approach

Don't start coding immediately. First inspect the codebase and report back on: current auth/user architecture, relevant event architecture, existing registration/redirect tracking, existing admin architecture, recommended DB changes, recommended API endpoints (match the contract in `ReferAndEarn.jsx`'s header comment), how external event-registration verification fits the current architecture, and any conflicts with existing systems.

Then implement using the project's existing patterns. After implementation, test the complete referral → FN Coins → eligibility → spin → reward lifecycle. Run lint/test/build checks and fix anything the implementation breaks.
