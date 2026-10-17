import { useState, useEffect, useCallback, type FormEvent } from 'react'
import {
  Sliders, ShieldCheck, AlertTriangle, CheckCircle2, RotateCcw,
  Save, RefreshCw, Lock, MapPin, Compass, Globe, Info, AlertCircle
} from 'lucide-react'
import { api } from '../lib/api'
import type { User, PilotConfig } from '../lib/types'

interface PilotSettingsProps {
  user: User
  onPilotUpdated?: (updated: PilotConfig) => void
  onNavigate?: (page: 'overview' | 'hotspots' | 'tasks' | 'reports' | 'interventions' | 'recycling' | 'settings') => void
}

interface ValidationErrors {
  name?: string
  latitude?: string
  longitude?: string
  radius_km?: string
  default_ward?: string
}

export default function PilotSettings({ user, onPilotUpdated, onNavigate }: PilotSettingsProps) {
  // Authorization check: Administrator only
  const isAdmin = user && user.role === 'admin'

  // Server baseline and form fields
  const [baseline, setBaseline] = useState<PilotConfig | null>(null)
  const [name, setName] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [radiusKm, setRadiusKm] = useState('')
  const [defaultWard, setDefaultWard] = useState('')

  // State management
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  // Fetch persisted configuration from backend
  const loadConfig = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    setSaveError(null)
    try {
      const data = await api.getPilotConfig()
      setBaseline(data)
      setName(data.name || '')
      setLatitude(data.latitude !== undefined && data.latitude !== null ? String(data.latitude) : '')
      setLongitude(data.longitude !== undefined && data.longitude !== null ? String(data.longitude) : '')
      setRadiusKm(data.radius_km !== undefined && data.radius_km !== null ? String(data.radius_km) : '')
      setDefaultWard(data.default_ward || '')
      setTouched({})
    } catch (err: any) {
      if (err.status === 401) {
        setFetchError('Your session has expired. Please sign in again.')
      } else if (err.status === 403) {
        setFetchError('Administrator access required to load pilot settings.')
      } else {
        setFetchError(err.message || 'Unable to load pilot settings from the server. Check backend connection.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) {
      void loadConfig()
    }
  }, [isAdmin, loadConfig])

  // Field-level validation matching backend constraints:
  // - name: string, 1-100 characters after trimming
  // - latitude: float, -90 <= lat <= 90
  // - longitude: float, -180 <= lng <= 180
  // - radius_km: float, 0 < radius <= 200 km
  // - default_ward: string, 1-80 characters after trimming
  const validate = useCallback((
    vals: { name: string; latitude: string; longitude: string; radiusKm: string; defaultWard: string }
  ): ValidationErrors => {
    const errors: ValidationErrors = {}

    // Name
    const trimmedName = vals.name.trim()
    if (!trimmedName) {
      errors.name = 'Pilot area name is required.'
    } else if (trimmedName.length > 100) {
      errors.name = 'Pilot area name must be 100 characters or fewer.'
    }

    // Latitude
    const trimmedLat = vals.latitude.trim()
    if (!trimmedLat) {
      errors.latitude = 'Latitude is required.'
    } else {
      const numLat = Number(trimmedLat)
      if (isNaN(numLat) || !isFinite(numLat)) {
        errors.latitude = 'Latitude must be a valid number.'
      } else if (numLat < -90 || numLat > 90) {
        errors.latitude = 'Latitude must be between -90.0 and +90.0 degrees.'
      }
    }

    // Longitude
    const trimmedLng = vals.longitude.trim()
    if (!trimmedLng) {
      errors.longitude = 'Longitude is required.'
    } else {
      const numLng = Number(trimmedLng)
      if (isNaN(numLng) || !isFinite(numLng)) {
        errors.longitude = 'Longitude must be a valid number.'
      } else if (numLng < -180 || numLng > 180) {
        errors.longitude = 'Longitude must be between -180.0 and +180.0 degrees.'
      }
    }

    // Radius in km
    const trimmedRad = vals.radiusKm.trim()
    if (!trimmedRad) {
      errors.radius_km = 'Monitoring radius is required.'
    } else {
      const numRad = Number(trimmedRad)
      if (isNaN(numRad) || !isFinite(numRad)) {
        errors.radius_km = 'Monitoring radius must be a valid number.'
      } else if (numRad <= 0 || numRad > 200) {
        errors.radius_km = 'Radius must be between 0.1 and 200.0 km.'
      }
    }

    // Default Ward
    const trimmedWard = vals.defaultWard.trim()
    if (!trimmedWard) {
      errors.default_ward = 'Default ward is required.'
    } else if (trimmedWard.length > 80) {
      errors.default_ward = 'Default ward must be 80 characters or fewer.'
    }

    return errors
  }, [])

  const currentErrors = validate({ name, latitude, longitude, radiusKm, defaultWard })
  const hasErrors = Object.keys(currentErrors).length > 0

  // Determine if user has made edits compared to last server-confirmed baseline
  const isModified = baseline !== null && (
    name.trim() !== baseline.name ||
    (latitude.trim() !== '' && Number(latitude) !== baseline.latitude) ||
    (longitude.trim() !== '' && Number(longitude) !== baseline.longitude) ||
    (radiusKm.trim() !== '' && Number(radiusKm) !== baseline.radius_km) ||
    defaultWard.trim() !== baseline.default_ward
  )

  // Handle Cancel / Reset to restore last saved values
  const handleReset = () => {
    if (!baseline) return
    setName(baseline.name || '')
    setLatitude(baseline.latitude !== undefined ? String(baseline.latitude) : '')
    setLongitude(baseline.longitude !== undefined ? String(baseline.longitude) : '')
    setRadiusKm(baseline.radius_km !== undefined ? String(baseline.radius_km) : '')
    setDefaultWard(baseline.default_ward || '')
    setTouched({})
    setSaveError(null)
    setSaveSuccess(null)
  }

  // Handle Save Changes
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    // Mark all fields as touched to display any pending errors
    setTouched({
      name: true,
      latitude: true,
      longitude: true,
      radius_km: true,
      default_ward: true,
    })

    const errors = validate({ name, latitude, longitude, radiusKm, defaultWard })
    if (Object.keys(errors).length > 0) {
      setSaveError('Please correct the validation errors below before saving.')
      setSaveSuccess(null)
      return
    }

    setSaving(true)
    setSaveError(null)
    setSaveSuccess(null)

    const payload: Partial<PilotConfig> = {
      name: name.trim(),
      latitude: Number(latitude),
      longitude: Number(longitude),
      radius_km: Number(radiusKm),
      default_ward: defaultWard.trim(),
    }

    try {
      const serverUpdated = await api.updatePilotConfig(payload)
      // Save succeeded and was confirmed by the backend
      setBaseline(serverUpdated)
      setName(serverUpdated.name)
      setLatitude(String(serverUpdated.latitude))
      setLongitude(String(serverUpdated.longitude))
      setRadiusKm(String(serverUpdated.radius_km))
      setDefaultWard(serverUpdated.default_ward)
      setTouched({})
      setSaveSuccess(`Pilot area "${serverUpdated.name}" configuration updated and persisted to the backend database.`)
      onPilotUpdated?.(serverUpdated)
    } catch (err: any) {
      // Preserve user edits on failure so they don't have to re-type
      if (err.status === 403) {
        setSaveError('Access denied: You do not have administrator permissions to update pilot settings.')
      } else if (err.status === 422) {
        setSaveError(`Server validation failed: ${err.message}`)
      } else if (err.status === 401) {
        setSaveError('Your session has expired. Please sign in again.')
      } else {
        setSaveError(err.message || 'Failed to save pilot settings to the backend. Please check network and try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  const markTouched = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }))
  }

  // If user is not an administrator, render the 403 unauthorized access state
  if (!isAdmin) {
    return (
      <div className="panel forbidden-panel" role="alert">
        <div className="panel-header">
          <div className="forbidden-head">
            <div className="forbidden-icon">
              <Lock size={22} />
            </div>
            <div>
              <h2>403 — Administrator Access Required</h2>
              <p>Operational boundary settings are restricted to administrative personnel.</p>
            </div>
          </div>
        </div>
        <div className="forbidden-body">
          <p>
            Your current account (<strong>{user?.display_name || 'Current User'}</strong>, role:{' '}
            <span className="role-tag">{user?.role || 'user'}</span>) does not have permission to view or
            manage pilot settings.
          </p>
          <div className="forbidden-note">
            <AlertCircle size={16} />
            <span>
              All modifications to geographic boundaries, centre coordinates, and monitoring radii are protected
              by server-side authorization checks.
            </span>
          </div>
          {onNavigate && (
            <div className="forbidden-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onNavigate('overview')}
              >
                Return to Recurrence Workbench
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="pilot-settings-container">
      {/* Top Banner: Geographic Boundary Policy Explanation (Requirement 6) */}
      <section className="panel policy-panel" aria-label="Geographic boundary operational policy">
        <div className="policy-card">
          <div className="policy-icon">
            <ShieldCheck size={20} />
          </div>
          <div className="policy-copy">
            <h3>Geographic Boundary Operational Policy</h3>
            <p>
              The pilot boundary defines the configured area used for monitoring and operational workflows. A report's
              location inside or outside this boundary does not establish whether the report is genuine; authenticity
              and hotspot recurrence must be assessed using the available report evidence and verification history.
            </p>
          </div>
        </div>
      </section>

      {/* Overview Cards: Current active pilot parameters at a glance */}
      {baseline && !loading && (
        <section className="stats-grid pilot-stats-strip" aria-label="Current pilot parameters summary">
          <div className="stat-card">
            <div className="stat-icon teal">
              <Globe size={19} />
            </div>
            <div className="stat-main">
              <span>Active Pilot</span>
              <b>{baseline.name}</b>
              <small>Configured operational zone</small>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon blue">
              <Compass size={19} />
            </div>
            <div className="stat-main">
              <span>Geographic Centre</span>
              <b>{baseline.latitude.toFixed(4)}, {baseline.longitude.toFixed(4)}</b>
              <small>Latitude / Longitude centre</small>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon amber">
              <MapPin size={19} />
            </div>
            <div className="stat-main">
              <span>Monitoring Radius</span>
              <b>{baseline.radius_km} km</b>
              <small>~{(Math.PI * Math.pow(baseline.radius_km, 2)).toFixed(0)} km² coverage</small>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon coral">
              <Sliders size={19} />
            </div>
            <div className="stat-main">
              <span>Default Ward</span>
              <b>{baseline.default_ward}</b>
              <small>Primary municipal ward</small>
            </div>
          </div>
        </section>
      )}

      {/* Main Settings Panel */}
      <section className="panel pilot-form-panel">
        <div className="panel-header">
          <div>
            <div className="eyebrow green">ADMINISTRATIVE PILOT CONTROLS</div>
            <h2>Geographic Monitoring Area Configuration</h2>
            <p>
              Configure the active pilot boundary name, geographic centre coordinates, operational radius, and
              default ward. Changes are authoritative and immediately affect reporting boundaries and nearby candidate lookup.
            </p>
          </div>
          <div className="panel-header-actions">
            {isModified && (
              <span className="unsaved-badge" aria-live="polite">
                <span className="unsaved-dot" /> Unsaved changes
              </span>
            )}
            <button
              type="button"
              className="btn btn-quiet btn-small"
              onClick={loadConfig}
              disabled={loading || saving}
              title="Reload configuration from server"
            >
              <RefreshCw size={14} className={loading ? 'spin-icon' : ''} />
              {loading ? 'Fetching...' : 'Reload'}
            </button>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="pilot-loading-state" aria-busy="true">
            <RefreshCw size={24} className="spin-icon" />
            <b>Loading pilot configuration from server...</b>
            <p>Retrieving persisted monitoring boundary and ward parameters.</p>
          </div>
        )}

        {/* Fetch Error State */}
        {fetchError && !loading && (
          <div className="pilot-alert pilot-alert-error" role="alert">
            <AlertTriangle size={18} />
            <div className="pilot-alert-content">
              <b>Error loading configuration</b>
              <span>{fetchError}</span>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={loadConfig}
            >
              Try Again
            </button>
          </div>
        )}

        {/* Save Feedback Alerts */}
        {saveSuccess && (
          <div className="pilot-alert pilot-alert-success" role="status" aria-live="polite">
            <CheckCircle2 size={18} />
            <div className="pilot-alert-content">
              <b>Configuration saved</b>
              <span>{saveSuccess}</span>
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setSaveSuccess(null)}
              aria-label="Dismiss success message"
            >
              ×
            </button>
          </div>
        )}

        {saveError && (
          <div className="pilot-alert pilot-alert-error" role="alert" aria-live="assertive">
            <AlertTriangle size={18} />
            <div className="pilot-alert-content">
              <b>Save failed</b>
              <span>{saveError}</span>
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setSaveError(null)}
              aria-label="Dismiss error message"
            >
              ×
            </button>
          </div>
        )}

        {/* Form */}
        {!loading && (
          <form className="pilot-settings-form" onSubmit={handleSubmit} noValidate>
            <div className="form-fields-grid">
              {/* Field 1: Pilot Area Name */}
              <div className="form-field wide-field">
                <label htmlFor="pilot-name">
                  <span>Pilot Area Name <strong className="required-star">*</strong></span>
                  <input
                    id="pilot-name"
                    name="name"
                    type="text"
                    value={name}
                    maxLength={100}
                    placeholder="e.g. Nagpur Central Pilot"
                    disabled={saving}
                    onChange={e => {
                      setName(e.target.value)
                      setSaveError(null)
                    }}
                    onBlur={() => markTouched('name')}
                    aria-invalid={Boolean(touched.name && currentErrors.name)}
                    aria-describedby={touched.name && currentErrors.name ? 'pilot-name-err' : 'pilot-name-help'}
                    className={touched.name && currentErrors.name ? 'input-error' : ''}
                    required
                  />
                </label>
                {touched.name && currentErrors.name ? (
                  <span id="pilot-name-err" className="field-error" role="alert">
                    {currentErrors.name}
                  </span>
                ) : (
                  <span id="pilot-name-help" className="field-help">
                    Descriptive title of the operational pilot area (up to 100 characters).
                  </span>
                )}
              </div>

              {/* Field 2: Latitude */}
              <div className="form-field">
                <label htmlFor="pilot-latitude">
                  <span>Latitude of Geographic Centre <strong className="required-star">*</strong></span>
                  <input
                    id="pilot-latitude"
                    name="latitude"
                    type="number"
                    step="any"
                    min="-90"
                    max="90"
                    value={latitude}
                    placeholder="e.g. 21.1458"
                    disabled={saving}
                    onChange={e => {
                      setLatitude(e.target.value)
                      setSaveError(null)
                    }}
                    onBlur={() => markTouched('latitude')}
                    aria-invalid={Boolean(touched.latitude && currentErrors.latitude)}
                    aria-describedby={touched.latitude && currentErrors.latitude ? 'pilot-lat-err' : 'pilot-lat-help'}
                    className={touched.latitude && currentErrors.latitude ? 'input-error' : ''}
                    required
                  />
                </label>
                {touched.latitude && currentErrors.latitude ? (
                  <span id="pilot-lat-err" className="field-error" role="alert">
                    {currentErrors.latitude}
                  </span>
                ) : (
                  <span id="pilot-lat-help" className="field-help">
                    Decimal degrees from -90.0 to +90.0 (WGS 84).
                  </span>
                )}
              </div>

              {/* Field 3: Longitude */}
              <div className="form-field">
                <label htmlFor="pilot-longitude">
                  <span>Longitude of Geographic Centre <strong className="required-star">*</strong></span>
                  <input
                    id="pilot-longitude"
                    name="longitude"
                    type="number"
                    step="any"
                    min="-180"
                    max="180"
                    value={longitude}
                    placeholder="e.g. 79.0882"
                    disabled={saving}
                    onChange={e => {
                      setLongitude(e.target.value)
                      setSaveError(null)
                    }}
                    onBlur={() => markTouched('longitude')}
                    aria-invalid={Boolean(touched.longitude && currentErrors.longitude)}
                    aria-describedby={touched.longitude && currentErrors.longitude ? 'pilot-lng-err' : 'pilot-lng-help'}
                    className={touched.longitude && currentErrors.longitude ? 'input-error' : ''}
                    required
                  />
                </label>
                {touched.longitude && currentErrors.longitude ? (
                  <span id="pilot-lng-err" className="field-error" role="alert">
                    {currentErrors.longitude}
                  </span>
                ) : (
                  <span id="pilot-lng-help" className="field-help">
                    Decimal degrees from -180.0 to +180.0 (WGS 84).
                  </span>
                )}
              </div>

              {/* Field 4: Monitoring Radius */}
              <div className="form-field">
                <label htmlFor="pilot-radius-km">
                  <span>Monitoring Radius (km) <strong className="required-star">*</strong></span>
                  <input
                    id="pilot-radius-km"
                    name="radius_km"
                    type="number"
                    step="any"
                    min="0.1"
                    max="200"
                    value={radiusKm}
                    placeholder="e.g. 15.0"
                    disabled={saving}
                    onChange={e => {
                      setRadiusKm(e.target.value)
                      setSaveError(null)
                    }}
                    onBlur={() => markTouched('radius_km')}
                    aria-invalid={Boolean(touched.radius_km && currentErrors.radius_km)}
                    aria-describedby={touched.radius_km && currentErrors.radius_km ? 'pilot-rad-err' : 'pilot-rad-help'}
                    className={touched.radius_km && currentErrors.radius_km ? 'input-error' : ''}
                    required
                  />
                </label>
                {touched.radius_km && currentErrors.radius_km ? (
                  <span id="pilot-rad-err" className="field-error" role="alert">
                    {currentErrors.radius_km}
                  </span>
                ) : (
                  <span id="pilot-rad-help" className="field-help">
                    Operational boundary radius in kilometres (between 0.1 and 200.0 km).
                  </span>
                )}
              </div>

              {/* Field 5: Default Ward */}
              <div className="form-field">
                <label htmlFor="pilot-default-ward">
                  <span>Default Municipal Ward <strong className="required-star">*</strong></span>
                  <input
                    id="pilot-default-ward"
                    name="default_ward"
                    type="text"
                    value={defaultWard}
                    maxLength={80}
                    placeholder="e.g. Ward 01"
                    disabled={saving}
                    onChange={e => {
                      setDefaultWard(e.target.value)
                      setSaveError(null)
                    }}
                    onBlur={() => markTouched('default_ward')}
                    aria-invalid={Boolean(touched.default_ward && currentErrors.default_ward)}
                    aria-describedby={touched.default_ward && currentErrors.default_ward ? 'pilot-ward-err' : 'pilot-ward-help'}
                    className={touched.default_ward && currentErrors.default_ward ? 'input-error' : ''}
                    required
                  />
                </label>
                {touched.default_ward && currentErrors.default_ward ? (
                  <span id="pilot-ward-err" className="field-error" role="alert">
                    {currentErrors.default_ward}
                  </span>
                ) : (
                  <span id="pilot-ward-help" className="field-help">
                    Default administrative ward assigned for incoming reports (up to 80 characters).
                  </span>
                )}
              </div>
            </div>

            {/* Form Actions */}
            <div className="pilot-form-actions">
              <div className="action-hint">
                <Info size={14} />
                <span>
                  All updates are recorded in the system audit ledger with your administrator identity.
                </span>
              </div>
              <div className="action-buttons">
                <button
                  type="button"
                  id="pilot-reset-btn"
                  className="btn btn-secondary"
                  onClick={handleReset}
                  disabled={!isModified || saving || loading}
                  title="Discard edits and restore last saved configuration"
                >
                  <RotateCcw size={15} />
                  Reset Edits
                </button>
                <button
                  type="submit"
                  id="pilot-save-btn"
                  className="btn btn-primary"
                  disabled={!isModified || hasErrors || saving || loading}
                  title={hasErrors ? 'Fix validation errors to save' : 'Persist changes to backend'}
                >
                  {saving ? (
                    <>
                      <RefreshCw size={15} className="spin-icon" />
                      Saving changes...
                    </>
                  ) : (
                    <>
                      <Save size={15} />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
