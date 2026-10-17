import type { User, Hotspot, Task, Passport, Summary, Intervention, Handoff, FollowUp, Report, PilotConfig } from './types'

const envBase = (import.meta.env.VITE_API_BASE_URL || '').trim()
const runtimeBase = (typeof window !== 'undefined' && (window as any).__RECURSCOPE_API_BASE__) || ''
export const API_BASE = (envBase || runtimeBase || (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' ? '' : 'http://127.0.0.1:8018')).replace(/\/$/, '')
let authToken = localStorage.getItem('recurscope_token') || ''
export function setToken(token: string) { authToken = token; if (token) localStorage.setItem('recurscope_token', token); else localStorage.removeItem('recurscope_token') }
export function getToken() { return authToken }

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {})
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`)
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  let response: Response
  try { response = await fetch(`${API_BASE}${path}`, { ...options, headers }) }
  catch { throw new Error('Could not reach RecurScope API. Start the backend and check the API URL.') }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    let errorMsg = payload.message || `Request failed (${response.status})`
    if (typeof payload.detail === 'string') {
      errorMsg = payload.detail
    } else if (Array.isArray(payload.detail)) {
      errorMsg = payload.detail
        .map((item: any) => item.msg || item.message || JSON.stringify(item))
        .join('; ')
    } else if (payload.detail && typeof payload.detail === 'object') {
      errorMsg = JSON.stringify(payload.detail)
    }
    const err: any = new Error(errorMsg)
    err.status = response.status
    err.payload = payload
    throw err
  }
  return payload as T
}
export type HotspotCandidate = { id:number; code:string; label:string; ward:string; distance_m:number; status:string }

export const api = {
  login: (username: string, password: string) => request<{access_token:string; user:User}>('/api/auth/login', { method:'POST', body:JSON.stringify({username,password}) }),
  me: () => request<User>('/api/auth/me'),
  summary: () => request<Summary>('/api/summary'),
  hotspots: () => request<Hotspot[]>('/api/hotspots'),
  hotspotCandidates: (lat:number,lng:number,radius=100) => request<HotspotCandidate[]>(`/api/hotspots/candidates?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius_m=${encodeURIComponent(radius)}`),
  passport: (id:number) => request<Passport>(`/api/hotspots/${id}/passport`),
  tasks: () => request<Task[]>('/api/tasks'),
  interventions: () => request<Intervention[]>('/api/interventions'),
  handoffs: () => request<Handoff[]>('/api/handoffs'),
  followups: () => request<FollowUp[]>('/api/followups'),
  users: (role?:string) => request<User[]>(`/api/users${role ? `?role=${encodeURIComponent(role)}` : ''}`),
  resetDemo: () => request<{ok:boolean;message:string}>('/api/demo/reset', {method:'POST'}),
  createReport: (form:FormData) => request<{report:any;hotspot:Hotspot;message:string}>('/api/reports', {method:'POST',body:form}),
  attachReportEvidence: (id:number, form:FormData) => request<{report:any;message:string}>(`/api/reports/${id}/evidence`, {method:'POST',body:form}),
  createTask: (body:unknown) => request<Task>('/api/tasks', {method:'POST',body:JSON.stringify(body)}),
  updateTask: (id:number, body:unknown) => request<Task>(`/api/tasks/${id}`, {method:'PATCH',body:JSON.stringify(body)}),
  startTask: (id:number) => request<Task>(`/api/tasks/${id}/start`, {method:'POST'}),
  evidence: (id:number, form:FormData) => request<Task>(`/api/tasks/${id}/evidence`, {method:'POST',body:form}),
  finishTask: (id:number) => request<Task>(`/api/tasks/${id}/finish`, {method:'POST'}),
  verifyTask: (id:number, approved:boolean, notes:string) => { const f=new FormData(); f.append('approved',String(approved)); f.append('notes',notes); return request<{task:Task;message:string}>(`/api/tasks/${id}/verify`, {method:'POST',body:f}) },
  confirmRecurrence: (hotspotId:number, reportId:number, notes:string) => request<{message:string}>(`/api/hotspots/${hotspotId}/confirm-recurrence`, {method:'POST',body:JSON.stringify({report_id:reportId,notes})}),
  createIntervention: (hotspotId:number, body:unknown) => request<Intervention>(`/api/hotspots/${hotspotId}/interventions`, {method:'POST',body:JSON.stringify(body)}),
  updateIntervention: (id:number, body:unknown) => request<Intervention>(`/api/interventions/${id}`, {method:'PATCH',body:JSON.stringify(body)}),
  recordFollowup: (hotspotId:number, form:FormData) => request<{followup:FollowUp;message:string}>(`/api/hotspots/${hotspotId}/followups/record`, {method:'POST',body:form}),
  createHandoff: (body:unknown) => request<Handoff>('/api/handoffs',{method:'POST',body:JSON.stringify(body)}),
  updateHandoff: (id:number, body:unknown) => request<Handoff>(`/api/handoffs/${id}`,{method:'PATCH',body:JSON.stringify(body)}),
  reports: (params?:{hotspot_id?:number;mine?:boolean}) => {
    const q=new URLSearchParams();
    if(params?.hotspot_id) q.set('hotspot_id',String(params.hotspot_id));
    if(params?.mine) q.set('mine','true');
    const qs=q.toString();
    return request<Report[]>(`/api/reports${qs?`?${qs}`:''}`)
  },
  getPilotConfig: () => request<PilotConfig>('/api/config/pilot'),
  updatePilotConfig: (body:Partial<PilotConfig>) => request<PilotConfig>('/api/config/pilot', {method:'PATCH',body:JSON.stringify(body)}),
  analytics: () => request<any>('/api/analytics/ward'),
}
export function evidenceUrl(key:string | null) { return key && key.endsWith('.jpg') ? `${API_BASE}/api/evidence/${key}` : null }
