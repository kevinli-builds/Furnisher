'use client'

import { useState } from 'react'

// First-run coach tips: a small non-blocking card that walks a new visitor
// through the draw → furnish → check-fit loop after the welcome chooser
// closes. Shown once (localStorage 'furnisher.tourSeen'); reopenable from
// Display → Show tips.

const TIPS = [
  {
    icon: '▭',
    title: 'Draw your space',
    body: 'Pick “▭ Draw room” in the toolbar (or ＋ Add on mobile) and drag out your first room. Everything is to scale — real dimensions.',
  },
  {
    icon: '🛋',
    title: 'Furnish it',
    body: 'Open the Inventory for sofas, beds and tables with real sizes — or build a custom piece. Drag to move; handles resize and rotate.',
  },
  {
    icon: '📏',
    title: 'Check the fit',
    body: 'Turn on warnings and clearance under ⚙ Display, run the Move-in check in 📊 Stats, then export a PNG or PDF to share.',
  },
]

export default function IntroTips({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0)
  const tip = TIPS[i]
  const last = i === TIPS.length - 1
  return (
    <div className="intro-tips" role="status" aria-label={`Tip ${i + 1} of ${TIPS.length}`}>
      <div className="intro-tips-head">
        <span className="intro-tips-icon">{tip.icon}</span>
        <strong>{tip.title}</strong>
        <span className="intro-tips-count">
          {i + 1}/{TIPS.length}
        </span>
      </div>
      <p>{tip.body}</p>
      <div className="intro-tips-actions">
        <button className="tips-skip" onClick={onClose}>
          Skip tour
        </button>
        <button className="tips-next" onClick={() => (last ? onClose() : setI(i + 1))}>
          {last ? 'Done ✓' : 'Next →'}
        </button>
      </div>
    </div>
  )
}
