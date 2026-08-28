import { randomUUID } from 'node:crypto'
import { db } from './db/index'

export interface Place {
  id: string
  label: string
  name: string
  lat: number
  lng: number
}

interface PlaceRow {
  id: string
  label: string
  name: string
  lat: number
  lng: number
}

export function listPlaces(userId: string): Place[] {
  return db()
    .prepare('SELECT id, label, name, lat, lng FROM places WHERE user_id = ? ORDER BY created_at')
    .all(userId) as unknown as PlaceRow[]
}

export type SavePlaceResult =
  | { ok: true; place: Place }
  | { ok: false; code: 'label-taken'; message: string }

/**
 * 장소 저장. label 은 사용자당 하나뿐이다("집" 이 둘일 수 없다).
 * 같은 label 로 다시 저장하면 덮어쓴다 — 이사하면 집이 바뀌니까.
 */
export function savePlace(
  userId: string,
  input: { label: string; name: string; lat: number; lng: number },
): SavePlaceResult {
  const label = input.label.trim()
  const existing = db()
    .prepare('SELECT id FROM places WHERE user_id = ? AND label = ?')
    .get(userId, label) as { id: string } | undefined

  if (existing) {
    db()
      .prepare('UPDATE places SET name = ?, lat = ?, lng = ? WHERE id = ?')
      .run(input.name, input.lat, input.lng, existing.id)
    return {
      ok: true,
      place: { id: existing.id, label, name: input.name, lat: input.lat, lng: input.lng },
    }
  }

  const id = randomUUID()
  db()
    .prepare(
      'INSERT INTO places (id, user_id, label, name, lat, lng, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(id, userId, label, input.name, input.lat, input.lng, Date.now())
  return { ok: true, place: { id, label, name: input.name, lat: input.lat, lng: input.lng } }
}

export function deletePlace(userId: string, id: string): boolean {
  // user_id 를 조건에 넣어야 남의 장소를 지울 수 없다
  const r = db().prepare('DELETE FROM places WHERE id = ? AND user_id = ?').run(id, userId)
  return Number(r.changes ?? 0) > 0
}
