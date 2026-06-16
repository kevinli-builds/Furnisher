// Preset room types, each with a soft tint. A room can also be 'custom' (its own
// colour) or have no type at all (neutral). Rendered at low opacity as a fill.

export interface RoomTypeDef {
  key: string
  label: string
  color: string
}

export const ROOM_TYPES: RoomTypeDef[] = [
  { key: 'living', label: 'Living room', color: '#e0a458' },
  { key: 'bedroom', label: 'Bedroom', color: '#a98fd0' },
  { key: 'kitchen', label: 'Kitchen', color: '#69ad6e' },
  { key: 'dining', label: 'Dining', color: '#d97f6a' },
  { key: 'bathroom', label: 'Bathroom', color: '#5aa6c2' },
  { key: 'office', label: 'Office', color: '#c4a14e' },
  { key: 'hallway', label: 'Hallway', color: '#9aa0a8' },
  { key: 'closet', label: 'Closet', color: '#b08968' },
  { key: 'outdoor', label: 'Outdoor', color: '#8fb86a' },
]

// Resolve a room's tint colour, or null for a neutral (untyped) room.
export function roomColor(r: { roomType?: string; color?: string }): string | null {
  if (!r.roomType) return null
  if (r.roomType === 'custom') return r.color || null
  return ROOM_TYPES.find((t) => t.key === r.roomType)?.color ?? null
}
