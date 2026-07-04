# Furnisher — Product / Design / Engineering Brief

_Written 2026-07-03 by a Claude portfolio review session. Audience: a future Opus
session. Read `CLAUDE.md` first (cm-canonical geometry, sanitization rules for
untrusted plans, npm.cmd / build-kills-dev quirks, the ~1152px viewport limitation
for mobile testing). Verify current state before implementing._

---

## 1. Product roadmap (PM)

Furnisher is feature-complete as a **tool**; the growth problem is that a new
visitor faces a blank canvas and a learning curve before any payoff. The roadmap
is: shrink time-to-"aha", then make finished plans shareable.

### P1 — Example plans / template gallery (activation)
**Instructions for Opus:**
- Ship 4–6 built-in example plans as static JSON (studio, 1-bed, 2-bed, office…),
  each a valid plan object passed through `normalizePlan()` at load.
- First-run experience: when no saved plan exists, show a chooser — "Start from a
  template" (opens a copy, never mutates the template) vs "Blank canvas" vs
  "Import blueprint with AI" (existing feature, currently buried).
- Store templates in `app/lib/templates/` and route loading through the exact
  same `normalizePlan` path as any untrusted plan (defense-in-depth habit).

### P1 — Real-device mobile pass (documented outstanding work)
CLAUDE.md lists this: gestures + the gear/trash-near-right-edge case. Do it before
new features — mobile users bounce on broken pinch/drag. Test via synthetic
`pointerType:'touch'` events per the docs, then hand a checklist to the user for
the physical-device part (that step is theirs).

### P2 — Read-only share links with a polished viewer (word-of-mouth)
Cloud save + collab exist; sharing a *finished* plan to someone without an account
is the viral moment ("here's our new living room").
**Instructions for Opus:**
- Verify what `lib/projects.ts`/`url.ts` already support for shared/public
  projects; extend to a `?view=<id>` read-only mode: no toolbars, fit-to-content,
  a "Made with Furnisher" footer CTA, and an "open a copy in the editor" button.
- All loaded data passes `normalizePlan` + `safeColorField` (already the rule).

### P2 — Furniture catalog depth + search
The differentiator vs paper sketches is *real dimensions*. Expand
`lib/catalog.ts` with common real-world items (sofa sizes, bed standards
US/EU, appliance standards), grouped + searchable in `InventoryPanel`.
Data-only change; no schema work.

### P3 — Dimension annotations + printable measured plan
A "measure" tool (click two points → persistent dimension line) and a print
layout that labels room and furniture sizes. Extends `print.ts`/`exportImage.ts`;
respects the existing `.export-hide` stripping convention.

### P3 — AI layout suggestions (only after the above)
"Arrange this furniture for me" via the existing BYO-key `anthropic.ts` path.
Cute demo, but activation/sharing move the needle more — keep it P3.

### Explicitly not now
3D rendering, VR/AR, marketplace integrations.

---

## 2. Design audit

Strengths: distinctive earthy palette (`#b5714e` accent — the strongest visual
identity in the portfolio), Sims-like familiarity, thoughtful touch details
(two-finger pan, Select emergency hatch, action-strip scroll affordance).

Issues:
1. **Blank-canvas cold start** (covered by P1 templates). The single biggest
   ease-of-use problem.
2. **Tool discoverability.** Draw/move/resize/rotate/openings/stairs/lights live
   across toolbar + panels; a first-timer doesn't know rooms come before
   furniture. A 3-step coach-mark overlay on first run (draw a room → drop
   furniture → check fit) would cover it; dismiss permanently to localStorage.
3. **SettingsPanel slide-in on selection** can surprise on mobile (covers canvas
   while dragging). Consider a compact bottom pill (name + rotate + delete) that
   expands to the full panel on tap.
4. **Warnings/clearance are opt-in and hidden** in the Display menu. The fit
   check is the app's promise — surface a small "check fit" toggle directly on
   the canvas UI.
5. **Empty-state copy** for AI import: users won't guess they can photograph a
   blueprint. One-line hint + example image in `ImportModal`.

---

## 3. Engineering audit

### Refactor targets
- **`Canvas.tsx` (1,285 lines)** — the interaction state machine; CLAUDE.md calls
  it the most delicate file. Don't rewrite it; *extract* with tests:
  1. Pull pure helpers (hit-testing, handle math, marquee rectangles) into
     `lib/interactions.ts` with vitest coverage (there are currently **no tests**
     in this repo — start here).
  2. Then split per-gesture handlers (draw / drag / pinch / rotate) into hooks
     that share one small state store.
  Do step 1 alone first; it de-risks every future canvas change including the
  mobile pass.
- Add a vitest setup + CI (typecheck, tests, build) — mirror MapCrowd's
  `.github/workflows/ci.yml`.
- `app/page.tsx` (472 lines) is acceptable; leave it until Canvas is done.

### Security audit potential
The untrusted-plan model is well thought out (`safeColorField`/`SAFE_COLOR` on
every load path, `safeUrl`, React-escaped names). Remaining:
1. **BYO Anthropic key in localStorage**: any XSS = key theft. Mitigations, in
   order of value: (a) add a strict CSP via `next.config.js` headers or
   `vercel.json` (static export) — `script-src 'self'`, `connect-src` limited to
   Supabase + `api.anthropic.com`; (b) a "clear key" button + a one-line risk
   note in the key-entry UI; (c) never widen key storage scope.
2. **Fuzz `normalizePlan`**: it's the trust boundary for shared/cloud/collab
   plans. Add property-style tests feeding malformed/hostile JSON (wrong types,
   huge arrays, `color:"url(...)"`, nested prototype-pollution keys `__proto__`)
   and assert sanitized output. Cheap and directly on-threat-model.
3. **Collab op validation**: verify the realtime collab path (`lib/collab.ts`)
   applies the same sanitization as `normalizePlan` on *every incoming op*, not
   just full-plan loads (CLAUDE.md says it should — confirm with a test).
4. Supabase RLS: confirm shared-project read policies don't leak private
   projects via the projects list endpoint (own-rows vs public flag).

---

## 4. Surprise & delight (unbuilt ideas — cherry-pick)

_Self-contained delight features. Furnisher's superpower is that it knows real
geometry — every idea below turns that data into a moment no paper sketch can
produce._

### D1 — The Doorway Test ⭐ (the mover's heartbreak, prevented)
"Can the sofa actually get IN?" Check each furniture piece's path from the
entry door to its placed position: does it fit through every opening and
hallway on the way, allowing rotation? Flag failures: *"Your sofa (220cm) won't
make the hallway turn near the bathroom."* Nobody's layout tool does this, and
it's the #1 real-world move-day disaster.
**Implementation path:** start simple — v1 checks each piece's smallest
cross-section against every `Opening` width plus a straight-corridor width
check between rooms on its path (existing `geometry.ts` + door data). A proper
piano-mover's rotation sweep is v2; ship the 80% heuristic with honest wording
("might be tight" vs "won't fit"). Add to `warnings.ts` as an opt-in check
beside clearance, plus a "Move-in check" button in `StatsPanel`.

### D2 — Sunlight time-lapse
`lib/sun.ts` already models the sun. Add a ▶ button that sweeps 6am→9pm in a
few seconds, animating the light across the floor via `LightingLayer`. Instantly
answers "will the afternoon sun hit the TV?" and "does the plant corner get
morning light?" — and it's mesmerizing to watch. Mostly animation plumbing over
existing math.

### D3 — Robot-vacuum reachability
Flood-fill the floor at a 35cm-diameter disc; shade the zones a robot vacuum
can never reach ("your roomba will never see under there"). Same collision
machinery as `warnings.ts`, grid-sampled. Funny on the surface, genuinely
useful for furniture spacing underneath.

### D4 — Before/after slider
Save named layout snapshots ("current apartment" / "plan B") and compare two
with a draggable A/B swipe divider — the *"should we move the couch?"* argument
settler. Builds on `usePlanHistory`/`projects.ts` snapshots + two-layer SVG
render with a clip path.

### D5 — Fit facts
Sprinkle computed one-liners into `StatsPanel`: "Seats for 7 guests · 62% clear
floor · 14m of walkable path." Trivial math over existing furniture metadata;
gives the plan a personality and a reason to screenshot it.

---

## 5. First-visit cold open (user-requested 2026-07-04 — build next)

The WelcomeModal template gallery now covers the "intro"; add the "tutorial":
a non-blocking, 3-tip coach sequence for first-time visitors.

- New `components/IntroTips.tsx`: a small card pinned bottom-center of the
  canvas (above the `.hint` line, `z-index` above canvas but below modals),
  showing one tip at a time with "Next" / "Skip tour" and a 1/3 dot indicator:
  1. **Draw your space** — "Pick ▭ Draw room in the toolbar (or ＋ Add on
     mobile) and drag out your first room. Real dimensions — everything is
     to scale."
  2. **Furnish it** — "Open the Inventory for sofas, beds and tables with
     real sizes — or build a custom piece. Drag to move, handles to rotate."
  3. **Check the fit** — "Turn on warnings and clearance under Display, see
     areas in 📊 Stats, then export a PNG/PDF to share."
- Trigger: when the first-run WelcomeModal closes (any of onPick/onBlank/
  onImport) AND `localStorage['furnisher.tourSeen']` is unset. Set the flag on
  Skip/finish. Never show for returning users (`hasSavedPlan()` true at mount).
- Reopen: a "Show tips" item in `ViewOptionsMenu`.
- Style with the earthy vars (`--panel`, `--accent`, `--ink`); keep it ~320px
  wide, `prefers-reduced-motion`-safe (no animation needed at all).
- Mobile: same card, sits above the tab bar (respect safe-area inset).

---

## 6. Wave 2 — after the cold open (written 2026-07-04)

_State at writing: templates/welcome chooser, Doorway Test v1 (D1), fit
facts (D5), interactions extraction + tests, and the coach tips (section 5)
are LIVE. Verify state before building._

### W1 — Real-device mobile pass (still the outstanding gate)
Unchanged from section 1: synthetic-touch testing + a physical checklist for
the user. Everything else in this wave benefits from it landing first.

### W2 — Doorway Test v2 (the differentiator, deepened)
v1 checks cross-sections against openings. v2:
- Rotation sweep ("piano mover") for the tight-corner case — pure geometry,
  perfect for the tested `lib/` pattern.
- Multi-floor: route through linked stairs (stairs carry width).
- A "delivery path" overlay drawn on the canvas for a failing piece — seeing
  the blocked corridor is the wow.

### W3 — Remaining delights, in value order
D2 sunlight time-lapse (sun.ts exists; animation plumbing) →
D4 before/after slider (usePlanHistory snapshots + clip-path) →
D3 robot-vacuum reachability (flood-fill; funny + useful) →
housewarming poster (extends exportImage.ts).

### W4 — Share loop
Read-only `?view=<id>` viewer per section 1 P2 (no toolbars, fit-to-content,
"open a copy" CTA). All loads through normalizePlan — the rule stands.

### W5 — Listing-to-plan pipeline (far-reaching, tentative)
Paste an apartment-listing URL → fetch floor-plan image → existing AI
blueprint import builds the plan. CORS means the fetch needs a tiny proxy or
"save image, drop it here" UX — start with drag-drop (no proxy, no new
infra) and a "from a listing?" hint in ImportModal. Pairs with the
apartment-hunt project idea in C:\Users\snoww\PROJECT_IDEAS.md.

### Tentative / parked
- AI layout suggestions ("arrange this for me") — cute, after share loop.
- Print-at-scale paper cutouts (print furniture shapes at 1:24 to cut out
  and push around a printed plan — delightfully analog, zero risk).
- Affiliate links on catalog items — only if traffic ever warrants.
