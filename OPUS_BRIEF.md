# Furnisher — Product / Design / Engineering Brief

_Written 2026-07-03 by a Claude portfolio review session. Audience: a future Opus
session. Read `CLAUDE.md` first (cm-canonical geometry, sanitization rules for
untrusted plans, npm.cmd / build-kills-dev quirks, the ~1152px viewport limitation
for mobile testing). Verify current state before implementing._

---

## 0. Status ledger (2026-07-05) + how to pick up

**Shipped ✓** — template/welcome chooser + blank/AI-import first-run; Doorway Test v1 (D1); **Doorway Test v2 (2026-07-11: corner-turn sweep — `cornerAllowedLength` rod-around-a-corner bound + orientation-aware route BFS with a translation path for square-ish pieces; new `turn` verdict rendered in Stats; fixture-tested)**; fit facts (D5); `lib/interactions.ts` extraction + tests; first-run coach tips (§5); edge-length labels, marker text labels, polygon corner-delete fixes. (A stray "Tracker" tab was added then removed — it belongs in the Tracker app.)
**Layer spine + L1 SHIPPED (2026-07-22)** — the §9 `lib/layers/` registry landed: each layer is a PURE `compute(plan) → {overlays, panelRows, warnings}` rendered by one generic `<InsightLayer>` SVG component (Canvas stays dumb); a "Insight layers" section in `ViewOptionsMenu`; active ids persist in `Plan.layers`, validated in `normalizePlan` against the registry (`validateLayerIds`). First layer = **L1 clearance zones ⭐**: per-type ergonomic aprons (chair pushback, door swing, bedside/foot access) from the `clearanceStandards.ts` data table; rotated apron polygons tested vs other footprints by SAT (`convexOverlap`); flat pieces (rug/lamp) and intended neighbours (chair↔desk/table, nightstand↔bed) excluded so it's not noisy; blocked aprons tint red + list in Stats (click a row → selects the piece). 17 fixture tests (119 total); build green; verified E2E in-app (aprons render under furniture, wardrobe blocked / desk clear via the neighbour rule, toggle on/off).
**L2 flow/desire-paths SHIPPED (2026-07-22)** ⭐ — second layer. New reusable `lib/layers/walkGrid.ts` (which L6 will share): a **wall-aware** occupancy grid — cells walkable when in-room + clear of furniture; a step is passable only if it doesn't cross a SOLID wall segment (`solidWalls` = room edges minus door openings), so inter-room travel goes through doorways not walls. Adaptive cell size (~2500 cells any plan), precomputed 8-neighbour adjacency (no corner-cutting), Dijkstra `findPath`, `nearestWalkable`; memoised by plan identity. `flow.ts` resolves route endpoints (bed→bath, entry→kitchen, sofa→kitchen, bed→entry, entry→sofa, desk→coffee), paths them, and — KEY — measures the **perpendicular corridor WIDTH** at each point (bounded both sides), NOT distance-to-nearest-wall, so a path merely hugging one wall isn't a false pinch; doorways + the route's own endpoint pieces are excluded; pinches <70cm name the squeezing piece. Auto-wired via the registry (Display + Stats). 10 tests (129 total); verified E2E (5 routes bend through doorways, 3 cross-room ones flag "65cm past Shelf B").
**L6 accessibility SHIPPED (2026-07-22)** ⭐ — third layer, a distinct optional one (id `accessibility`, its own Display toggle, independent of L2 — user explicitly wanted it separate from walkability). `lib/layers/accessibility.ts`: (1) a 150cm turning circle per key room (area ≥2.5m²) via the new `walkGrid.clearanceAt` (largest empty circle = max distance-to-nearest-wall/furniture over the room's walkable cells); (2) doorways below the 81cm step-free minimum; (3) stairs flagged as not-step-free (counts flights by `link`). Added a `circle` overlay primitive to the spine (types.ts + InsightLayer.tsx). 9 tests incl. one asserting flow-paths does NOT pull it in (138 total); verified E2E. _Known limit: stair footprints aren't excluded from walkable, so a turning circle can render over stairs (the stairs row still flags the barrier); tighten if it ever matters._
**Next → (highest value first)** — more §9 layers (L3 sun-hours heatmap — `sun.ts` exists; L4 budget/move-day — furniture has `price`, zero geometry; L5 sightlines/privacy); the **real-device mobile pass** (P1 — §8 pre-verified the chrome; only gestures/pinch/export remain). Doorway v3 candidates if ever wanted: per-corner blame in the issue copy, polygon rooms decomposed instead of bbox'd, tilt/on-end 3D escapes.
**Share links SHIPPED (2026-07-11)** — P2 share links + the MoveDay-handoff receiving half in one: `lib/share.ts` (lz-string fragment payloads, 30k size guard, tested), `#import=` handled on mount in `page.tsx` (confirm → `stashPlanBackup()` → `normalizePlan` trust boundary → adopt, hash cleared), 🔗 copy-share-link button in the Stats panel head. Backup slot `furnisher.plan.backup.v1` has no restore UI yet — cheap follow-up if ever wanted. Sender side lives in `C:\Users\snoww\MoveDay` (`FABLE_BRIEF.md` §4).
**MoveDay return trip SHIPPED (2026-07-18)** — the other half of the fit-check round trip (MoveDay M4). `lib/share.ts` gains `buildMovedayUrl()` (packs a `source:'furnisher'` payload → `move-day.vercel.app/#plan=`, same 30k guard) + `MOVEDAY_LISTING_KEY`. The `#import=` effect now stashes a MoveDay Fit-check's `listingId` to localStorage (cleared for any other import) so the return trip re-attaches to the source listing. StatsPanel head gains a 📦 "Send to MoveDay" button → opens the arranged plan in MoveDay's inbound `#plan=` handler. 2 new share tests (102 total). Verified E2E: 📦 produced a valid MoveDay URL carrying the plan + threaded listingId, decoded cleanly by MoveDay's `unpackHandoff`.
**Security ✅ (2026-07-12)** — F1 (revoke-share now purges collaborators via the new
`revoke_sharing` RPC) + F2 (schema moved into `supabase/projects.sql`) both shipped; see
the §"Security & code-quality audit" entries. ⚠️ Run `supabase/projects.sql` in Supabase
so the `revoke_sharing` function exists.
**Usability pass ✓ (2026-07-12)** — tall dropdowns (`.account-menu`/Display opts) now scroll
via max-height instead of clipping on short phones; the right-click object picker clamps to
the canvas host so it can't be cut off by `overflow:hidden` near an edge. Audit found the
rest already touch-clean: always-visible project actions, manual double-tap vertex delete,
mobile trash/multi-select bars, left-anchored opts menu fits 375px.
**Infra gap** — only `lib/interactions.ts` has tests; §3 wants a vitest setup + CI before the layer work lands.

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

---

## 7. Fable design notes — Doorway Test v2 (algorithm, 2026-07-04)

_Design guidance for W2 so the implementing session does not reach for a
closed-form corner formula that does not exist for our general case._

**Recommendation: numeric configuration-space search, not geometry-paper
math.** Rooms are axis-aligned but compositions (corner turns via two
openings, mid-corridor radiators/markers) defeat closed forms. We already
own exact collision machinery — use it.

- **State space:** poses `(x, y, θ)` of the piece rectangle. Grid: 5 cm
  translation, 15° rotation (12 headings; symmetry halves it for
  rectangles). Restrict the region to the rooms on the v1 path (v1 already
  computes room-to-room paths) plus a 1-piece-length margin around each
  opening.
- **Search:** BFS/A* from the entry-door pose set to any pose overlapping
  the target position; neighbors = ±1 grid step in x/y/θ. Feasibility test
  per pose = piece rect (rotated) fully inside the room union, minus wall
  segments, with openings treated as gaps of their true width — reuse the
  collision predicates from `lib/interactions.ts` / `warnings.ts`.
- **Cost control:** run v2 ONLY when v1 returns "might be tight"
  (cross-section fits every opening but a corner is involved). Typical
  region ≈ 2 rooms ≈ 30 m² → ~12k cells × 12 headings = ~150k states,
  trivially fast in a worker or chunked loop. Cap states; on cap, report
  "too tight to verify" honestly.
- **Output for W2's overlay:** the found path (decimated pose list) →
  polyline for the "delivery path" rendering; on failure, the frontier's
  best-progress pose marks the bottleneck — draw the blocked opening in
  the warning copy ("stuck at the bathroom door").
- **Pure lib first:** `lib/moveIn.ts` with fixture tests BEFORE any UI:
  (a) straight corridor pass/fail at exact widths; (b) the classic
  L-corner case where the cross-section fits both corridors but the turn
  fails; (c) rotation-required doorway (piece longer than corridor is
  wide, fits only diagonally). These three fixtures pin the semantics.
- **Multi-floor:** treat linked stairs as an opening of the stair width
  connecting the two poses; do not path across floors in v2 beyond that.

---

## 8. Mobile & web experience scan (measured 2026-07-05, 375x812 viewport)

_Live-tested — NOTE: the preview harness here CAN apply the max-width:760px
media query (window.innerWidth reports 375), so much of section 1's
"real-device pass" chrome portion is now pre-verified:_

**Verified good on mobile:** welcome/template chooser fits (335x715, cards
227px tall and comfortably tappable); coach tips card clears the tab bar
(bottom 736 vs bar top 756); mobile tab bar buttons 121x47; Add sheet is
full-width with 75px grid buttons; no horizontal overflow; topbar collapses
correctly (desktop tool segment hidden).

**Still needs a physical device** (the part a browser cannot prove):
pinch-zoom vs two-finger pan discrimination, long-press timing feel, the
gear/trash-near-right-edge case from CLAUDE.md, and export/print from
mobile Safari. That checklist is unchanged — but the chrome layer above it
can come off the list.

---

## 9. Depth roadmap — serving the current user (2026-07-05)

_Direction change from the user: depth for existing users over reach. For
Furnisher that means **insight layers** over the plan they already built.
The plan model knows real geometry, types, prices, sun, lights, stairs —
almost none of that knowledge is currently reflected back as insight._

### First: build the layer spine (architecture, do before any layer) — ✅ SHIPPED 2026-07-22
A `lib/layers/` registry: each layer = `{ id, label, compute(plan): {
overlays, panelRows, warnings } }` where compute is PURE (testable) and
overlays are simple primitives (polygon/rect/path/badge) rendered by
one generic `InsightLayer` SVG component. Display menu grew an "Insight
layers" section listing the registry. Canvas stays dumb. Every layer below
is now a self-contained ~day of work. _Built as specified; overlay colours
are code constants (never plan data) so the sanitize trust boundary holds._

### L1 — Functional clearance zones (S) ⭐ — ✅ SHIPPED 2026-07-22
Beyond collision: per-type ergonomic aprons — bed sides/foot 60cm, desk chair
pushback 75cm, dining seats 90cm, wardrobe/appliance door-swing (90–105cm).
Tinted aprons on the canvas (sage = clear, danger = blocked); violations
listed in Stats with the standard's purpose, click-to-select the piece. Data
table `lib/layers/clearanceStandards.ts` drives it. _Obstruction = SAT overlap
of the (rotated) apron vs another footprint, minus flats (rug/lamp) and
intended neighbours (chair↔desk/table, nightstand↔bed) — mirrors the
warnings.ts anti-noise reasoning. Wall-obstruction detection deliberately
left out of v1 (beds against walls are normal); furniture obstructions only._

### L2 — Flow & desire paths (M) ⭐ — ✅ SHIPPED 2026-07-22
Walkability graph over free floor, daily routes as worn-path lines with
lengths + pinch points under 70cm. _Built in `walkGrid.ts` (reusable,
wall-aware grid + Dijkstra) + `flow.ts`. Two design decisions worth knowing:
(1) the wall model = a step may not cross a `solidWalls` segment (room edge
minus door gaps), which is what keeps routes going through doorways; (2)
pinch = perpendicular corridor WIDTH bounded on both sides, NOT distance to
the nearest wall — otherwise every path hugging a wall false-flags. Doorways
+ endpoint pieces are excluded from pinch detection. Honest limits: routes
use a curated endpoint set, one piece per role (first fridge/sink/stove =
"kitchen"), and clearance is grid/march-approximate (±a few cm)._

### L3 — Sun-hours heatmap + seasons (M)
sun.ts already models position; accumulate per-floor-cell direct-light
minutes across a day → heatmap ("the plant map"), with solstice/equinox
presets. Pairs with §4 D2 time-lapse; glare-on-TV warning falls out free
(sun vector vs TV facing).

### L4 — Budget & move-day layer (S)
Furniture has `price`: bill of materials per room, owned-vs-planned flag
per piece ("still to buy: $1,840"), total cubic volume → truck-size
estimate ("fits a 10ft box truck"). CSV export. Zero new geometry.

### L5 — Sightlines & privacy (M)
Ray-casts from entry door and windows: what is visible (bed/toilet visible
from the front door is a real apartment-hunting criterion); TV viewing
distance/angle check from seating (screen size on the TV piece).

### L6 — Accessibility layer (M, high-heart) — ✅ SHIPPED 2026-07-22
Wheelchair mode: 150cm turning circles in key rooms, 81cm door minimums,
step-free path verification (stairs flagged). Reuses L2 grid. For anyone
planning for a parent or friend, this is the most caring feature the app
could ship. _Built as `accessibility.ts`, a SEPARATE optional layer from L2
(own toggle). Turning circle = largest empty circle in a room via
`walkGrid.clearanceAt`; needs `walkGrid.ts` from L2. Stairs are flagged as a
barrier rather than doing a true multi-floor step-free graph (single-plane
grid) — honest and enough for v1._

### L7 — Electrical/outlet layer (S, tentative)
Outlet markers + "needs power" flag on pieces; nearest-outlet distance per
device, extension-run warnings. Simple, weirdly useful; marker type exists.

### L8 — Layout diff/ghost (S)
Overlay a second saved plan at 40% opacity ("plan B ghost") with moved
pieces arrowed. The analytical sibling of §4 D4's slider.

### Explicitly not: acoustics simulation, HVAC/airflow — physics theater
without trustworthy inputs. Keep layers honest or skip them.

---

## Security & code-quality audit (2026-07-12, Fable portfolio pass)

_Public repo; no sensitive/exploitable findings this pass, so all notes stay
in-repo. The Supabase security model is genuinely well-built — verified: `projects`
and `furniture_library` have own-row RLS; the collaboration path
(`join_project` → `project_members` → `is_project_member()`-gated read/update) is
correct, and BOTH SECURITY DEFINER functions pin `search_path = public`. The
untrusted-plan color-sanitization trust boundary (`safeColorField`/`SAFE_COLOR` in
both `normalizePlan` and the collab path) is a sophisticated, correct defense
against `url(...)`-in-CSS exfiltration. Nice work._

**F1 — "Revoke sharing" now cuts off existing collaborators — ✅ SHIPPED (2026-07-12).**
`disableSharing()` used to only null the `share_token`, leaving already-joined
`project_members` with read+edit forever. It now calls a new `revoke_sharing(p_project_id)`
SECURITY DEFINER RPC that (owner-checked, atomically) clears the token **and** deletes
every `project_members` row for the project. `project_members` deliberately has no
client DELETE policy, so the RPC is the only membership-removal path. Test:
`app/lib/__tests__/projects.test.ts` (asserts the RPC path, not a bare token-null).
⚠️ **Deploy step:** run the new `supabase/projects.sql` (or just the `revoke_sharing`
block) in the Supabase SQL editor — the RPC must exist before the button works.
_Optional future nicety:_ a collaborator list with per-member remove (this fix covers
the "turn the link off = access off" expectation without it).

**F2 — projects/collab schema now in `supabase/` — ✅ SHIPPED (2026-07-12).** Created
`supabase/projects.sql` as the canonical, idempotent, runnable source (projects table +
own-row RLS, `project_members` + membership RLS, `is_project_member`, `join_project`,
`revoke_sharing`, the owner-column guard trigger, and the realtime publication add).
`SUPABASE_SETUP.md` now points at it as the source of truth. Fixed alongside F1 (the
`revoke_sharing` function had to land in that file anyway).

**Quality — low priority:**
- `Canvas.tsx` remains the "large, delicate" god-file (acknowledged in CLAUDE.md);
  the `lib/interactions.ts` extraction was the right first move — keep peeling
  per-gesture logic into pure, tested helpers as you touch it.
- Good `lib/` test coverage already (trust boundary, geometry, stats). Maintain it.
