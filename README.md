# Furnisher

Plan your apartment layout and furniture before you move in. Think Sims build
mode, pared down: drag rooms onto a grid, drop in doors, and place furniture at
real-world dimensions to see how it all fits.

- **Stack:** Next.js 16 + React 19 + TypeScript, hand-written CSS, no runtime deps.
- **Storage:** your plan is saved to the browser's `localStorage` (no account, no backend).
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

Each grid square is 50 cm. Positions snap to 10 cm.

## Roadmap

- Import a blueprint from a listing (image trace / floor-plan parse).
- Import furniture (with dimensions) from product pages.
- Multiple saved plans.
