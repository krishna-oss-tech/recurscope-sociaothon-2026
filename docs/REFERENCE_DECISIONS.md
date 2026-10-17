# RecurScope reference decisions (reviewed 17 October 2026)

RecurScope is independently implemented. The references below are used to inspect interaction patterns and requirements, not to copy source code, screenshots, styles, text, or assets. No code from either project was merged into this repository.

## MapMyWaste
- Repository: https://github.com/harishy0406/MapMyWaste
- Useful product patterns: map-first issue reporting; photo + GPS/manual location; hotspot visibility; geospatial candidate clustering; duplicate/spam checks; operations queue and collection planning.
- RecurScope implementation: Leaflet / OpenStreetMap hotspot map, selected-site radius context, explicit candidate lookup within a configurable review radius, photo upload and location-aware reports. Candidate suggestions are not proof that two reports refer to the same physical site.
- Deliberately not claimed in this MVP: AI image classification, validated K-means clustering, optimized municipal routes, fleet GPS, or measured collection savings.

## JanSetu-Swachh
- Repository: https://github.com/p3iyanshu/JanSetu-Swachh
- Useful product patterns: role-separated resident/worker/admin experience; worker assignment; before/after evidence; human verification; four waste streams; downstream receiver/MRF handoff and operational analytics.
- RecurScope implementation: resident/worker/supervisor/receiver login, task lifecycle and evidence checks, supervisor approval/rejection, explicit mixed/unknown stream, receiver status and handoff records.
- Deliberately not claimed in this MVP: household-level rounds, native Android/Electron apps, voice assistant, external AI inference, or connection to a municipal dispatch system.

## RecurScope's own product centre
A verified cleanup establishes a timeline boundary. Only a later incident with evidence and authorised review may become a confirmed recurrence. The Intervention Ledger ties a suspected cause (as a hypothesis), a preventive action, an accountable owner and due date to scheduled 7/30-day observations. Missing observations remain insufficient evidence; action completion is not proof of effectiveness.

## Licensing boundary
At the time of review, the root repository file listings viewed on GitHub did not show a `LICENSE` file for either reference repository. Public visibility is not permission to copy. Confirm the owners' permission/licence before any source or asset reuse. The RecurScope code, UI, styles, copy, seed records and assets in this project were independently created for the RecurScope MVP.

## Mapping compliance
The interactive map uses Leaflet and the standard OpenStreetMap tile endpoint. The map visibly attributes `© OpenStreetMap contributors`; consult the tile provider's current usage policy before a high-traffic production deployment: https://operations.osmfoundation.org/policies/tiles/
