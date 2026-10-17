export type User = { id: number; username: string; display_name: string; role: 'resident'|'admin'|'worker'|'receiver' }
export type PilotConfig = { name: string; latitude: number; longitude: number; radius_km: number; default_ward: string }
export type Hotspot = {
  id: number; code: string; label: string; ward: string; latitude: number; longitude: number; status: string;
  recurrence_count: number; report_count: number; open_task_count: number; overdue: boolean; latest_issue: string | null;
  first_seen_at: string; last_seen_at: string; last_verified_cleanup_at: string | null; is_demo: boolean;
  priority: { score: number; band: string; components: Record<string, number>; maxima: Record<string, number>; thresholds: Record<string, number>; basis: string }
}
export type Report = {
  id: number; hotspot_id: number; hotspot_code: string | null; ward?: string | null; issue_type: string; description: string; latitude: number; longitude: number;
  gps_accuracy_m: number | null; location_precision: string; outside_pilot_area?: boolean; photo_key: string | null; verification_state: string; lifecycle_stage?: string; is_demo: boolean; created_at: string
}
export type Task = {
  id: number; code: string; hotspot_id: number; hotspot_code: string; hotspot_label: string; ward: string; assigned_worker_id: number | null;
  assigned_worker: string; due_at: string; status: string; stream: string; before_key: string | null; after_key: string | null;
  before_latitude: number | null; before_longitude: number | null; after_latitude: number | null; after_longitude: number | null;
  after_uploaded_at: string | null; reviewer: string | null; verified_at: string | null; notes: string; is_demo: boolean; created_at: string
}
export type Event = { id: number; event_type: string; notes: string; actor: string; report_id: number | null; task_id: number | null; evidence_key: string | null; is_demo: boolean; created_at: string }
export type Intervention = { id: number; hotspot_id: number; hotspot_code?: string; hypothesis_code: string; rationale: string; action_type: string; owner: string; due_at: string; status: string; completed_at: string | null; follow_up_dates: number[]; outcome_notes: string; is_demo: boolean; created_at: string }
export type FollowUp = { id: number; hotspot_id: number; hotspot_code?: string; intervention_id: number | null; scheduled_at: string; window_days: number; observed_state: string; evidence_key: string | null; notes: string; observed_at: string | null; is_demo: boolean }
export type Handoff = { id: number; task_id: number; task_code: string; hotspot_code: string; stream: string; receiver_name: string; quantity: number | null; unit: string; status: string; notes: string; received_at: string | null; is_demo: boolean; created_at: string }
export type Passport = { hotspot: Hotspot; reports: Report[]; tasks: Task[]; events: Event[]; interventions: Intervention[]; followups: FollowUp[]; possible_return_reports: Report[] }
export type Summary = { synthetic_data: boolean; hotspots: number; reports: number; active_tasks: number; overdue_tasks: number; confirmed_recurrence_hotspots: number; recurrence_rate_percent: number | null; recurrence_numerator: number; recurrence_denominator: number; median_clearance_hours: number | null; verified_task_count: number; task_count: number; handoff_completed: number; handoff_total: number; note: string }
export type PublicHotspot = { id: number; code: string; label: string; ward: string; latitude: number; longitude: number; status: string; recurrence_count: number; first_seen_at: string | null; last_seen_at: string | null; last_verified_cleanup_at: string | null; is_demo: boolean }
export type ReportTimelineEvent = { id: number; event_type: string; notes: string; actor: string; report_id?: number | null; task_id?: number | null; evidence_key: string | null; latitude?: number | null; longitude?: number | null; is_demo: boolean; created_at: string }
