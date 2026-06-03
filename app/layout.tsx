import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Furnisher',
  description: 'Plan your apartment layout and furniture before you move in.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
