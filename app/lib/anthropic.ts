// Client-side, bring-your-own-key Claude calls. The user's key lives only in
// their browser (localStorage) and is sent directly to Anthropic with the
// browser-access header. Cheapest model: claude-haiku-4-5.

import { FURNITURE_TYPES, type FurnitureType } from './furniture'
import { furnitureType } from './furniture'

const KEY = 'furnisher.anthropicKey'
const MODEL = 'claude-haiku-4-5'

export function getApiKey(): string {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(KEY) || ''
}
export function setApiKey(k: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(KEY, k.trim())
}
export function hasApiKey(): boolean {
  return getApiKey().length > 0
}

export interface ImageInput {
  mediaType: string // e.g. "image/png"
  data: string // base64 (no data: prefix)
}

interface ContentBlock {
  type: string
  [k: string]: unknown
}

async function callClaude(
  system: string,
  content: ContentBlock[],
  maxTokens: number,
  opts?: { tools?: unknown[]; beta?: string },
): Promise<string> {
  const key = getApiKey()
  if (!key) throw new Error('Add your Anthropic API key first.')
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }
  if (opts?.beta) headers['anthropic-beta'] = opts.beta
  const body: Record<string, unknown> = { model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }
  if (opts?.tools) body.tools = opts.tools
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let msg = `Claude request failed (${res.status})`
    try {
      const j = await res.json()
      msg = (j?.error?.message as string) || msg
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  const json = await res.json()
  return ((json.content as ContentBlock[]) || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text as string)
    .join('\n')
}

function parseJson<T>(text: string): T {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned
  return JSON.parse(slice) as T
}

function imageBlock(img: ImageInput): ContentBlock {
  return { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } }
}

// ── Blueprint → rooms + doors (cm) ────────────────────────────
export interface BlueprintRoom {
  name: string
  x: number
  y: number
  w: number
  h: number
}
export interface BlueprintDoor {
  x: number
  y: number
  length: number
  orientation: 'h' | 'v'
}
export interface BlueprintResult {
  rooms: BlueprintRoom[]
  doors: BlueprintDoor[]
}

export async function readBlueprint(img: ImageInput): Promise<BlueprintResult> {
  const system = [
    'You read residential floor plans from an image and output their layout in CENTIMETRES.',
    'Coordinate system: origin at top-left, x increases right, y increases down.',
    'Use any printed dimensions in the image; otherwise estimate from typical home sizes.',
    'Lay rooms out to match the image, roughly non-overlapping (shared walls may touch).',
    'Return ONLY JSON, no prose, in this exact shape:',
    '{"rooms":[{"name":string,"x":number,"y":number,"w":number,"h":number}],"doors":[{"x":number,"y":number,"length":number,"orientation":"h"|"v"}]}',
    'For doors, (x,y) is the hinge corner on a wall; orientation "h" = on a horizontal wall, "v" = on a vertical wall.',
  ].join(' ')
  const text = await callClaude(system, [imageBlock(img), { type: 'text', text: 'Read this floor plan.' }], 2000)
  const raw = parseJson<Partial<BlueprintResult>>(text)
  const rooms: BlueprintRoom[] = (raw.rooms ?? [])
    .map((r) => ({
      name: String(r.name ?? 'Room'),
      x: Math.round(Number(r.x) || 0),
      y: Math.round(Number(r.y) || 0),
      w: Math.max(50, Math.round(Number(r.w) || 0)),
      h: Math.max(50, Math.round(Number(r.h) || 0)),
    }))
    .filter((r) => r.w >= 50 && r.h >= 50)
  const doors: BlueprintDoor[] = (raw.doors ?? []).map((d) => ({
    x: Math.round(Number(d.x) || 0),
    y: Math.round(Number(d.y) || 0),
    length: Math.max(40, Math.round(Number(d.length) || 80)),
    orientation: d.orientation === 'v' ? 'v' : 'h',
  }))
  return { rooms, doors }
}

// ── Furniture image → one piece ───────────────────────────────
export interface FurnitureResult {
  name: string
  type: FurnitureType
  w: number
  h: number
  price?: number // detected price (any currency), if stated
}

export async function readFurniture(img: ImageInput): Promise<FurnitureResult> {
  const system = [
    'You identify a single piece of furniture from an image and estimate its real-world footprint in CENTIMETRES.',
    `Choose the closest "type" from this list: ${FURNITURE_TYPES.join(', ')}.`,
    'If a price is visible (e.g. a tag), include it as a plain number; otherwise omit it.',
    'Return ONLY JSON, no prose: {"name":string,"type":string,"w":number,"h":number,"price"?:number} where w = width (cm), h = depth (cm).',
  ].join(' ')
  const text = await callClaude(system, [imageBlock(img), { type: 'text', text: 'Identify this furniture and its footprint.' }], 400)
  return normalizeFurniture(parseJson<Partial<FurnitureResult>>(text))
}

// ── Furniture from a product URL (Amazon, Wayfair, IKEA, …) ────
// Claude fetches the page server-side via the web_fetch tool — no browser CORS.
export async function readFurnitureFromUrl(url: string): Promise<FurnitureResult> {
  const system = [
    'You read a furniture product page and estimate its real-world footprint in CENTIMETRES.',
    'Use the web_fetch tool to read the given URL. Prefer dimensions stated on the page (convert inches to cm if needed).',
    `Choose the closest "type" from this list: ${FURNITURE_TYPES.join(', ')}.`,
    'w = width (cm), h = depth / front-to-back (cm). Use a concise product name.',
    'Also read the listed price — return it as a plain number (no currency symbol); omit if not found.',
    'Return ONLY JSON, no prose: {"name":string,"type":string,"w":number,"h":number,"price"?:number}.',
  ].join(' ')
  const text = await callClaude(
    system,
    [{ type: 'text', text: `Read this furniture product page and extract its footprint and price:\n${url}` }],
    900,
    { tools: [{ type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 5 }], beta: 'web-fetch-2025-09-10' },
  )
  return normalizeFurniture(parseJson<Partial<FurnitureResult>>(text))
}

// ── Furniture from pasted text (description + dimensions) ─────
export async function readFurnitureFromText(text: string): Promise<FurnitureResult> {
  const system = [
    'You convert a furniture description into a structured record with a real-world footprint in CENTIMETRES.',
    'Use any dimensions in the text (convert inches to cm if needed). If depth is missing, estimate it from the item type.',
    `Choose the closest "type" from this list: ${FURNITURE_TYPES.join(', ')}.`,
    'w = width (cm), h = depth / front-to-back (cm). Use a concise name.',
    'If a price is mentioned, include it as a plain number (no currency symbol); otherwise omit it.',
    'Return ONLY JSON, no prose: {"name":string,"type":string,"w":number,"h":number,"price"?:number}.',
  ].join(' ')
  const out = await callClaude(system, [{ type: 'text', text: `Furniture details:\n${text}` }], 400)
  return normalizeFurniture(parseJson<Partial<FurnitureResult>>(out))
}

function normalizeFurniture(raw: Partial<FurnitureResult>): FurnitureResult {
  const price = Number(raw.price)
  return {
    name: String(raw.name ?? 'Furniture').slice(0, 60),
    type: furnitureType(raw.type as string | undefined),
    w: Math.max(10, Math.round(Number(raw.w) || 60)),
    h: Math.max(10, Math.round(Number(raw.h) || 60)),
    ...(Number.isFinite(price) && price > 0 ? { price: Math.round(price) } : {}),
  }
}
