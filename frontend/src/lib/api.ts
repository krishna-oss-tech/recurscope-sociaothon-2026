import type { User, Hotspot, Task, Passport, Summary, Intervention, Handoff, FollowUp, Report, PilotConfig, ReportTimelineEvent } from './types'

export type AppMode = 'operational' | 'demo'

// Operational backend endpoint (VITE_API_BASE_URL)
export function getOperationalBase(): string {
  const env = (import.meta.env.VITE_API_BASE_URL || '').trim()
  const runtime = (typeof window !== 'undefined' && (window as any).__RECURSCOPE_API_BASE__) || ''
  if (env) return env.replace(/\/$/, '')
  if (runtime) return runtime.replace(/\/$/, '')
  if (import.meta.env.PROD) {
    return ''
  }
  const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  return isLocal ? 'http://127.0.0.1:8018' : ''
}

// Isolated demo backend endpoint (VITE_DEMO_API_BASE_URL)
export function getDemoBase(): string {
  const env = (import.meta.env.VITE_DEMO_API_BASE_URL || '').trim()
  const runtime = (typeof window !== 'undefined' && (window as any).__RECURSCOPE_DEMO_API_BASE__) || ''
  if (env) return env.replace(/\/$/, '')
  if (runtime) return runtime.replace(/\/$/, '')
  if (import.meta.env.PROD) {
    // In production builds, demo service MUST be explicitly configured
    return ''
  }
  const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  return isLocal ? 'http://127.0.0.1:8018' : ''
}

export function isDemoConfigured(): boolean {
  if (!import.meta.env.PROD) {
    return true // Local dev uses local backend
  }
  const demo = getDemoBase()
  const op = getOperationalBase()
  // In production: demo API must be explicitly provided and not pointed to the operational backend
  return Boolean(demo) && demo !== op
}

let activeMode: AppMode = (typeof localStorage !== 'undefined' && (localStorage.getItem('recurscope_mode') as AppMode)) || 'operational'

export function getActiveMode(): AppMode {
  return activeMode
}

export function setActiveMode(mode: AppMode): void {
  activeMode = mode
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('recurscope_mode', mode)
  }
}

export function getToken(mode?: AppMode): string {
  const m = mode || activeMode
  const key = m === 'demo' ? 'recurscope_demo_token' : 'recurscope_operational_token'
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem(key) || (m === 'operational' ? (localStorage.getItem('recurscope_token') || '') : '')
}

export function setToken(token: string, mode?: AppMode): void {
  const m = mode || activeMode
  const key = m === 'demo' ? 'recurscope_demo_token' : 'recurscope_operational_token'
  if (typeof localStorage !== 'undefined') {
    if (token) {
      localStorage.setItem(key, token)
      if (m === 'operational') localStorage.setItem('recurscope_token', token)
    } else {
      localStorage.removeItem(key)
      if (m === 'operational') localStorage.removeItem('recurscope_token')
    }
  }
}

export function clearToken(mode?: AppMode): void {
  setToken('', mode)
}

export function getApiBase(mode?: AppMode): string {
  const m = mode || activeMode
  if (m === 'demo') {
    if (!isDemoConfigured()) {
      throw new Error('Demo service configuration is incomplete. VITE_DEMO_API_BASE_URL is not configured.')
    }
    return getDemoBase()
  }
  return getOperationalBase()
}

export const API_BASE = getOperationalBase()

export async function request<T>(path: string, options: RequestInit = {}, mode?: AppMode): Promise<T> {
  const targetMode = mode || activeMode
  const base = getApiBase(targetMode)
  const token = getToken(targetMode)

  const headers = new Headers(options.headers || {})
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response
  try {
    response = await fetch(`${base}${path}`, { ...options, headers })
  } catch {
    if (targetMode === 'demo') {
      throw new Error(`Could not reach the isolated demo service at ${base || 'configured URL'}. Check that the demo backend is deployed and running.`)
    }
    throw new Error('Could not reach RecurScope API. Start the backend and check the API URL.')
  }

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.detail || payload.message || `Request failed (${response.status})`)
  }
  return payload as T
}

export type HotspotCandidate = { id: number; code: string; label: string; ward: string; distance_m: number; status: string }

const DEMO_PASSWORDS = new Set(['admin123', 'worker123', 'citizen123', 'receiver123'])

export const api = {
  login: (username: string, password: string, isDemo = false) => {
    const targetMode: AppMode = isDemo ? 'demo' : 'operational'
    if (!isDemo && DEMO_PASSWORDS.has(password)) {
      if (import.meta.env.PROD || getOperationalBase() !== getDemoBase()) {
        throw new Error('Default demo credentials cannot be used for operational login. Switch to the Explore Demo tab or use your provisioned credentials.')
      }
    }
    return request<{ access_token: string; user: User }>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify({ username, password }) },
      targetMode
    )
  },
  register: (body: { username: string; password: string; display_name: string; ward?: string; consent: boolean }) =>
    request<{ access_token: string; user: User }>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }, 'operational'),
  me: (mode?: AppMode) => request<User>('/api/auth/me', {}, mode),
  summary: () => request<Summary>('/api/summary'),
  hotspots: () => request<Hotspot[]>('/api/hotspots'),
  publicHotspots: (ward?: string) =>
    request<Array<{ id: number; code: string; label: string; ward: string; latitude: number; longitude: number; status: string; recurrence_count: number; is_demo: boolean }>>(
      `/api/hotspots/public${ward ? `?ward=${encodeURIComponent(ward)}` : ''}`
    ),
  hotspotCandidates: (lat: number, lng: number, radius = 100) =>
    request<HotspotCandidate[]>(`/api/hotspots/candidates?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius_m=${encodeURIComponent(radius)}`),
  passport: (id: number) => request<Passport>(`/api/hotspots/${id}/passport`),
  tasks: () => request<Task[]>('/api/tasks'),
  interventions: () => request<Intervention[]>('/api/interventions'),
  handoffs: () => request<Handoff[]>('/api/handoffs'),
  followups: () => request<FollowUp[]>('/api/followups'),
  users: (role?: string) => request<User[]>(`/api/users${role ? `?role=${encodeURIComponent(role)}` : ''}`),
  resetDemo: () => request<{ ok: boolean; message: string }>('/api/demo/reset', { method: 'POST' }, 'demo'),
  createReport: (form: FormData) => request<{ report: any; hotspot: Hotspot; message: string }>('/api/reports', { method: 'POST', body: form }),
  attachReportEvidence: (id: number, form: FormData) => request<{ report: any; message: string }>(`/api/reports/${id}/evidence`, { method: 'POST', body: form }),
  createTask: (body: unknown) => request<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(body) }),
  updateTask: (id: number, body: unknown) => request<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  startTask: (id: number) => request<Task>(`/api/tasks/${id}/start`, { method: 'POST' }),
  evidence: (id: number, form: FormData) => request<Task>(`/api/tasks/${id}/evidence`, { method: 'POST', body: form }),
  finishTask: (id: number) => request<Task>(`/api/tasks/${id}/finish`, { method: 'POST' }),
  verifyTask: (id: number, approved: boolean, notes: string) => {
    const f = new FormData()
    f.append('approved', String(approved))
    f.append('notes', notes)
    return request<{ task: Task; message: string }>(`/api/tasks/${id}/verify`, { method: 'POST', body: f })
  },
  confirmRecurrence: (hotspotId: number, reportId: number, notes: string) =>
    request<{ message: string }>(`/api/hotspots/${hotspotId}/confirm-recurrence`, { method: 'POST', body: JSON.stringify({ report_id: reportId, notes }) }),
  createIntervention: (hotspotId: number, body: unknown) => request<Intervention>(`/api/hotspots/${hotspotId}/interventions`, { method: 'POST', body: JSON.stringify(body) }),
  updateIntervention: (id: number, body: unknown) => request<Intervention>(`/api/interventions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  recordFollowup: (hotspotId: number, form: FormData) => request<{ followup: FollowUp; message: string }>(`/api/hotspots/${hotspotId}/followups/record`, { method: 'POST', body: form }),
  createHandoff: (body: unknown) => request<Handoff>('/api/handoffs', { method: 'POST', body: JSON.stringify(body) }),
  updateHandoff: (id: number, body: unknown) => request<Handoff>(`/api/handoffs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  reports: (params?: { hotspot_id?: number; mine?: boolean }) => {
    const q = new URLSearchParams()
    if (params?.hotspot_id) q.set('hotspot_id', String(params.hotspot_id))
    if (params?.mine) q.set('mine', 'true')
    const qs = q.toString()
    return request<Report[]>(`/api/reports${qs ? `?${qs}` : ''}`)
  },
  reportTimeline: (reportId: number) => request<ReportTimelineEvent[]>(`/api/reports/${reportId}/timeline`),
  getPilotConfig: () => request<PilotConfig>('/api/config/pilot'),
  updatePilotConfig: (body: Partial<PilotConfig>) => request<PilotConfig>('/api/config/pilot', { method: 'PATCH', body: JSON.stringify(body) }),
  analytics: () => request<any>('/api/analytics/ward'),
  health: (mode?: AppMode) => request<{ ok: boolean; service: string; version: string; database: string; environment: string; demo_mode: boolean }>('/health', {}, mode),
  provisionUser: (body: { username: string; display_name: string; role: string; password: string }) => request<User>('/api/users', { method: 'POST', body: JSON.stringify(body) }),
}

export function evidenceUrl(key: string | null, mode?: AppMode): string | null {
  if (!key || !key.endsWith('.jpg')) return null
  try {
    const base = getApiBase(mode)
    return `${base}/api/evidence/${key}`
  } catch {
    return null
  }
}
