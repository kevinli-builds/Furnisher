# Furnisher — Claude Context

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
- **Claude API**, bring-your-own-key (kept only in `localStorage`, sent directly to
  Anthropic) — powers AI import of blueprints / furniture.
- All geometry is stored in **centimetres** (canonical); ft·in ⇄ m·cm is display-only.

## Run / dev
```
cd app
npm.cmd run dev        # serves on http://localhost:3002  (PowerShell: use npm.cmd)
npx tsc --noEmit       # typecheck while iterating
npm.cmd run build      # production build — NOTE: this stops a running `next dev`
```
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

## Status (Jun 2026)
Feature-complete and in active polish. Recent work: room types w/ colour tints,
clearance checker (off by default, bulky-furniture-only heuristic), export strips
on-screen chrome, all add-tools revert to Select after one placement, orphan-door
selectability, mobile pinch fixes (pointercancel cleanup + Select emergency hatch +
two-finger pan), mobile action-strip scroll affordance. Outstanding: a real-device
mobile pass (gestures + the gear/trash-near-right-edge case).
