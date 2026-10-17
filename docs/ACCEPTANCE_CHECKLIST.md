# RecurScope MVP — Acceptance & Judge Checklist

Use this to rehearse what the team can prove in the live application. If a box is not checked, do not claim it is implemented.

## Core workflow gates

- [x] Login with resident, admin, worker and receiver demo roles.
- [x] Synthetic hotspot/report/task/handoff seed scenarios are labelled in the interface.
- [x] Report endpoint persists issue, description, coordinates, precision, optional photo key and timestamp.
- [x] Owner or supervisor can attach additional image evidence to the same report; event history is appended without creating a duplicate incident. Unauthorized roles receive 403.
- [x] Candidate radius is configurable; nearby association can require explicit supervisor action.
- [x] Multiple pre-cleanup reports do not count as confirmed recurrence.
- [x] After-photo requires a location and server timestamp, and the location must be within the evidence radius.
- [x] Task cannot be finished without both before and after evidence.
- [x] Cleanup is accepted/rejected by a supervisor; rejection returns task to in-progress.
- [x] Approval schedules follow-up at day 7 and day 30.
- [x] Recurrence confirmation requires a recorded verified cleanup, later report time, linked image key and authorised reviewer.
- [x] Priority rule contributions/maxima are returned to the UI and weights/thresholds can be configured by environment variable.
- [x] Intervention stores hypothesis, rationale, action, owner, due date and 7/30-day follow-up schedule.
- [x] Recurrence workbench separates possible returns, persistent accumulation, confirmed return history and open interventions.
- [x] A synthetic possible-return review case exists without inflating the confirmed recurrence count.
- [x] An intervention-linked observation updates the matching scheduled window instead of duplicating it; cross-hotspot linkage is rejected.
- [x] Follow-up form defaults to “insufficient evidence”, not “no return observed”.
- [x] Unknown/mixed stream remains an explicit state.
- [x] Handoff completion requires a named receiver and a received status.
- [x] Analytics note that missing follow-up is not equivalent to no recurrence.
- [x] Reset restores the synthetic demo storyline.
- [x] API tests cover the highest-risk lifecycle rules.

## Manual UI validation before demo

- [ ] Run backend and frontend on the actual presentation laptop.
- [ ] Verify OpenStreetMap tiles load from that network; have the hotspot list available as fallback.
- [ ] Sign in as admin, create a task on HS-021, assign worker, confirm due date.
- [ ] Sign in as worker; upload a real before-photo; start task; upload a real after-photo; submit for review.
- [ ] Sign in as admin; inspect evidence; verify cleanup; confirm both follow-up rows exist in the passport.
- [ ] Submit a new report without a photo at a hotspot whose cleanup is verified; use the passport’s Attach evidence action to add a photo to that same report, then confirm it first appears as a possible return and only becomes recurrence after supervisor review.
- [ ] Confirm that same report as a supervisor and show the state change / recurrence event.
- [ ] Create an intervention; read the hypothesis language out loud (do not call it confirmed cause without evidence).
- [ ] Confirm a dry-stream handoff as receiver; show that pending was not counted as received.
- [ ] Reset and rehearse the full two-minute path twice.

## Judging rubric alignment

| Rubric area | What to demonstrate | Honest limit |
|---|---|---|
| Technical correctness | Persistent data, role-checked endpoints, task transitions, evidence and recurrence tests | Production hardening and public deployment are not verified yet |
| Innovation & depth | Hotspot Passport + Intervention Ledger, time-windowed follow-up | The workflow is a product design differentiator; do not claim globally unique or patented |
| Problem understanding | Persistent vs post-cleanup recurrence, overdue and mixed-waste cases | Cause remains a hypothesis unless verified |
| Scalability & feasibility | React/API/database split; configurable spatial radius and score | Needs load tests, indexed spatial schema and pilot data before scale |
| UI/UX & presentation | Responsive map/list, focus panel, roles and clear status labels | Run on the actual projector/laptop and confirm connectivity |
| Ethics/domain relevance | Minimal public identity, reviewer gate, synthetic-data label | Permissions, retention, deployment security and local-body governance need further work |

## Known build verification status

- Backend: `pytest -q` passes **8 tests** in the current environment.
- Python: `compileall` passes.
- Frontend TypeScript/TSX source: syntax transpilation passes for all seven source files.
- Full Vite/React build: **not verified in this environment** because the npm registry timed out and required packages are not cached. Run `npm install` followed by `npm run build` on a connected machine before the final demo.
- Docker/PostGIS: Compose file parses as YAML, but containers were not launched in this environment.


## v0.5 interaction / polish checks

- [ ] Overview opens on a map-first working surface; selecting a hotspot pans/zooms the map and highlights its 100 m context ring.
- [ ] New report map click updates the latitude/longitude fields. Manual coordinate edits remain possible.
- [ ] “Use my location” requests browser permission only when clicked; denial leaves manual map/coordinate entry available.
- [ ] As report coordinates change, the backend candidate lookup refreshes after a short debounce. Candidate distances are shown and explicit human selection is required before associating.
- [ ] New nearby reports are not silently merged. Run `test_location_candidate_lookup_is_explicit_and_never_auto_merges`.
- [ ] Unsupported image types and uploads over 5 MB are rejected in the client; server-side validation remains authoritative.
- [ ] Primary buttons provide restrained motion and all motion is disabled/respected under `prefers-reduced-motion`.
- [ ] OSM attribution is visible; the map tiles use the documented standard endpoint.

- [ ] Existing-report evidence flow: submit a possible-return report without a photo, open its Hotspot Passport, attach an image, confirm the same report ID now has evidence, then review it as supervisor. Confirm the timeline includes `REPORT_EVIDENCE_ATTACHED`.
