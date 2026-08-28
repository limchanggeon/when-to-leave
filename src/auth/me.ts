import type { Account } from './types'

export interface SavedPlace {
  id: string
  label: string
  name: string
  lat: number
  lng: number
}

export interface MeSummary {
  account: Account
  meta: { createdAt: number; hasPassword: boolean } | null
  identities: { provider: string; createdAt: number }[]
  places: SavedPlace[]
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string }

async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      credentials: 'include',
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    })
    const json = (await res.json()) as T | { error: { message: string } }
    if (!res.ok || (json && typeof json === 'object' && 'error' in json)) {
      const message =
        json && typeof json === 'object' && 'error' in json
          ? (json as { error: { message: string } }).error.message
          : '요청에 실패했습니다'
      return { ok: false, message }
    }
    return { ok: true, data: json as T }
  } catch {
    return { ok: false, message: '서버에 연결하지 못했습니다' }
  }
}

export const fetchMe = () => call<MeSummary>('/api/me')

export const updateName = (name: string) =>
  call<{ account: Account }>('/api/me', { method: 'PATCH', body: JSON.stringify({ name }) })

export const changePassword = (current: string | undefined, next: string) =>
  call<{ ok: true }>('/api/me/password', {
    method: 'POST',
    body: JSON.stringify({ current, next }),
  })

export const addPlace = (input: {
  label: string
  name?: string
  lat?: number
  lng?: number
}) => call<{ place: SavedPlace }>('/api/me/places', { method: 'POST', body: JSON.stringify(input) })

export const removePlace = (id: string) =>
  call<{ ok: true }>(`/api/me/places/${id}`, { method: 'DELETE' })

export const deleteAccount = () => call<{ ok: true }>('/api/me', { method: 'DELETE' })
