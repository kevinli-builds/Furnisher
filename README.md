# Furnisher

Plan your apartment layout and furniture before you move in. Think Sims build
mode, pared down: drag rooms onto a grid, drop in doors, and place furniture at
real-world dimensions to see how it all fits.

- **Stack:** Next.js 16 + React 19 + TypeScript, hand-written CSS; Supabase for optional auth + cloud sync.
- **Storage:** plans save to the browser's `localStorage` by default — no account required. Optionally sign in with Google to save and sync multiple plans to the cloud, scoped per-user with row-level security. See [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md).
- **AI import (optional):** bring your own Anthropic API key (kept only in your browser) and let Claude do the data entry — trace a blueprint image into rooms + doors, or add furniture at real-world dimensions from a photo, a product URL, or pasted text.
- **Units:** everything is stored internally in centimetres; the ft/in ⇄ m/cm
  toggle is display-only.
- **Hosting:** static export — deploys to Vercel (or any static host) out of the box.

## Run locally

```bash
npm install
npm run dev      # http://localhost:3002
```

## Build

```bash
npm run build    # static site emitted to ./out
```

## How to use

1. **Draw room** — click and drag on the grid to create a rectangular room.
   Select it to rename or resize (drag the blue corner handle).
2. **Add door** — click a wall to drop a door, drag it into place, then flip its
   orientation/swing from the inspector bar.
3. **Furniture** — add pieces in the right-hand panel with a name + dimensions,
   then drag them around the plan. Select a piece to rotate, recolour, or resize.
4. **AI import** (optional) — add your Anthropic API key in the import panel, then
   let Claude trace a blueprint image into rooms + doors, or pull a furniture piece
   (with real-world dimensions) from a photo, a product URL, or pasted text.

Each grid square is 50 cm. Positions snap to 10 cm.
