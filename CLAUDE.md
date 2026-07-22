# Furnisher — Claude Context

## Notes & handoff — READ FIRST when told to "go through your notes"
**`OPUS_BRIEF.md`** (repo root) is the forward roadmap of record: PM/design/security
audits (sections 1-3), delight ideas (4), first-visit cold opens (5, shipped), wave-2 (6),
Fable design notes (7), mobile/web scan (8), and the depth roadmap (9) — plus a **status
ledger at the very top** marking what has shipped vs. what is next. When asked to pick up
the next enhancement: (1) read the brief; (2) run `git log --oneline -20` + `git status` —
a dirty working tree means another agent is mid-flight, so choose a different area or write
specs rather than edit the same files; (3) confirm the item is not already built; (4) build
it with the house conventions (tests, then commit + push).

## Concept
An apartment + furniture **layout planner** — "Sims build mode, pared down." Draw
rooms to scale, drop furniture, check fit before moving in. Built for a friend who
was moving. Deploys to **Vercel** (furnisher.vercel.app).

## Stack
- **Next.js 16** (App Router, static export), **React 19**, **TypeScript**.
- Hand-written CSS in `app/globals.css` (CSS vars, earthy palette; accent `#b5714e`,
  danger `#a8463c`).
- **Supabase** (optional): auth, cloud-save, realtime collaboration. App runs fully
  local if its env vars are unset. Anon key is safe to ship (RLS); never service_role.
  Since July 2026 this is the **shared "Central DB" project** (ref
  `tmycdgnofvmbyrmpqohw`, shared with MapCrowd + Tracker, per-user RLS per app) —
  migration artifacts live in the `unified-backend/` repo in the Mapper-Tracker
  workspace. The old dedicated project (`qkwdjvoeganggqntzeya`) is paused pending
  teardown; `.env.local` keeps its values commented for rollback.
- **Claude API**, bring-your-own-key (kept only in `localStorage`, sent directly to
  Anthropic) — powers AI import of blueprints / furniture.
- All geometry is stored in **centimetres** (canonical); ft·in ⇄ m·cm is display-only.

## Run / dev
```
# run from the repo root — package.json lives here (app/ is just the App Router dir)
npm.cmd run dev        # serves on http://localhost:3002  (PowerShell: use npm.cmd)
npx tsc --noEmit       # typecheck while iterating
npm.cmd run test       # vitest (pure lib/* logic — trust boundary, geometry, stats)
npm.cmd run build      # production build — NOTE: this stops a running `next dev`
```
- CI (`.github/workflows/ci.yml`) runs typecheck + test + build on push/PR.
- Prefer `tsc` during iteration; only `build` at commit time (build kills the dev
  server, forcing a restart).
- **Testing the mobile layout is limited**: the dev/browser viewport is effectively
  pinned ~1152px here, so the `@media (max-width:760px)` CSS doesn't render. Test
  mobile *behaviour* via synthetic touch events (`pointerType:'touch'` — touch logic
  is pointer-type gated, not width gated), or temporarily force `isMobile` in
  `app/page.tsx`. Real-device checks are the user's job.

## Architecture
```
app/
├── page.tsx                Root client component: layout, state, mode routing,
│                           desktop toolbar + mobile bottom tab bar / sheets.
├── components/
│   ├── Canvas.tsx          THE interaction state machine — SVG canvas, pointer/
│   │                       drag/pinch/marquee/select, draw/move/resize/rotate.
│   │                       Largest, most delicate file; touch lifecycle lives here.
│   ├── RoomShape, Opening (doors/windows), FurniturePiece, Stairs, Handles,
│   │   LightingLayer, PeerCursors           presentational SVG pieces
│   ├── InventoryPanel      furniture/room/marker templates + catalog + AI import
│   ├── SettingsPanel       per-object editor (slides in on selection)
│   ├── ViewOptionsMenu     "Display" menu (units, grid, warnings, clearance, sun…)
│   ├── AccountMenu, ImportModal, StatsPanel
└── lib/
    ├── types.ts            Plan model (rooms/doors/furniture/markers/stairs/lights
    │                       + inventory + display prefs)
    ├── storage.ts          normalizePlan() — EVERY loaded plan passes through it
    ├── sanitize.ts         SAFE_COLOR / safeColorField (see Security)
    ├── geometry.ts         snapping, zoom bounds, bbox/align helpers
    ├── useViewport.ts      pan/zoom state, fit-to-content, screen↔cm
    ├── warnings.ts         collision warnings + computeClearance (opt-in)
    ├── usePlanHistory.ts   undo/redo;  collab.ts / projects.ts / supabase.ts / auth.ts
    ├── anthropic.ts        BYO-key Claude calls (blueprint / furniture import)
    ├── print.ts/exportImage.ts   PDF (print iframe) + PNG export (strip `.export-hide`)
    └── furniture.ts catalog.ts roomTypes.ts units.ts sun.ts door.ts palette.ts url.ts
```

## Security (untrusted plans)
Shared/cloud projects and live collab ops carry plan JSON a peer controls. **Any
field that reaches an SVG `fill`/`stroke` or CSS `background` must be sanitized on
load** via `safeColorField` / `SAFE_COLOR` (`lib/sanitize.ts`) — applied in both
`normalizePlan` (storage.ts) and the collab path. Unsanitized `color:"url(…)"`
would make a viewer's browser fetch an attacker URL. When adding a coloured entity,
wire it through both. URLs go through `safeUrl()`; names are React/serializer-escaped.

## Conventions
- **Always commit and push without asking.** End commit messages with the
  Co-Authored-By line. `.env` is gitignored — never commit secrets.
- Match the surrounding code's style; geometry stays in cm.

## Status (Jul 2026)
Feature-complete and in active polish. `OPUS_BRIEF.md` holds the roadmap.
Recently shipped from it: vitest suite + CI + CSP/BYO-key hardening; a first-run
**template gallery** (`lib/templates/` → `WelcomeModal`, opened via `normalizePlan`;
reopen with the ✨ Templates button); **fit facts** chips in Stats (`stats.fitFacts`);
`lib/interactions.ts` (pure `pointHits`/`objectsInMarquee`/`cycleNext` lifted out of
Canvas.tsx, unit-tested — the first step of the Canvas de-risk); and the **Doorway
Test** — an opt-in "🚪 Move-in check" in Stats (`warnings.moveInCheck`: room-graph
+ widest-path bottleneck vs each rigid piece's smallest cross-section).
Newest: the **insight-layer system** — a pure `lib/layers/` registry (`compute(plan)
→ {overlays, panelRows, warnings}`) rendered by a generic `InsightLayer` SVG comp,
toggled under Display → "Insight layers", persisted in `plan.layers`. First layer =
**L1 clearance zones** (ergonomic aprons from `clearanceStandards.ts`, SAT-tested vs
footprints). Add a layer = append to `lib/layers/registry.ts`; next up is L2 flow paths.
Earlier: room types w/ colour tints, clearance checker (off by default,
bulky-furniture-only heuristic), export strips on-screen chrome, add-tools revert
to Select after one placement, orphan-door selectability, mobile pinch fixes.
Outstanding (see brief): real-device mobile pass; continue the Canvas split
(per-gesture hooks); P2 share links; catalog depth; Doorway Test v2 (rotation /
corridor-turn sweep).
