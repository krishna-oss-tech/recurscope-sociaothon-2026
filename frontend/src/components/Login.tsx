import { useState } from 'react'
import {
  Recycle, ShieldCheck, MapPinned, ClipboardCheck, ArrowRight, UserPlus, LogIn,
  Sparkles, RefreshCw, UserCheck, AlertTriangle, Truck, ShieldAlert, CheckCircle2, Lock
} from 'lucide-react'
import { isDemoConfigured, getDemoBase, isOperationalConfigured, getOperationalBase } from '../lib/api'

export interface RoleOption {
  id: string
  backendRole: 'resident' | 'worker' | 'admin' | 'receiver'
  name: string
  badge: string
  fullName: string
  desc: string
  color: string
  demoUsername: string
  demoPassword: string
  allowSelfRegistration: boolean
  icon: typeof MapPinned
}

export const ROLE_OPTIONS: RoleOption[] = [
  {
    id: 'resident',
    backendRole: 'resident',
    name: 'Resident (Citizen)',
    badge: 'Citizen Experience',
    fullName: 'Resident (Citizen) — Citizen Experience',
    desc: 'Submit photo incidents, choose locations, and follow the real status timeline.',
    color: 'lime',
    demoUsername: 'resident',
    demoPassword: 'citizen123',
    allowSelfRegistration: true,
    icon: MapPinned,
  },
  {
    id: 'worker',
    backendRole: 'worker',
    name: 'Field Worker',
    badge: 'Worker Experience',
    fullName: 'Field Worker — Worker Experience',
    desc: 'View assigned tasks, upload GPS before/after evidence, and classify waste streams.',
    color: 'blue',
    demoUsername: 'worker',
    demoPassword: 'worker123',
    allowSelfRegistration: false,
    icon: Truck,
  },
  {
    id: 'supervisor',
    backendRole: 'admin',
    name: 'Ward Supervisor',
    badge: 'Supervisor Workbench',
    fullName: 'Ward Supervisor — Supervisor Workbench',
    desc: 'Recurrence decision board, evidence review, cleanup verification, and follow-ups.',
    color: 'teal',
    demoUsername: 'admin',
    demoPassword: 'admin123',
    allowSelfRegistration: false,
    icon: ShieldCheck,
  },
  {
    id: 'recovery',
    backendRole: 'receiver',
    name: 'Recovery Partner',
    badge: 'Segregation & MRF',
    fullName: 'Recovery Partner — Segregation & MRF',
    desc: 'Inspect segregation handoffs, confirm material intake, and track recovery rates.',
    color: 'amber',
    demoUsername: 'receiver',
    demoPassword: 'receiver123',
    allowSelfRegistration: false,
    icon: Recycle,
  },
]

type Props = {
  onLogin: (username: string, password: string, isDemo?: boolean, selectedRole?: string) => Promise<void>
  onRegister: (data: { username: string; password: string; display_name: string; ward?: string; consent: boolean }) => Promise<void>
  onResetDemo?: () => Promise<unknown> | void
  loading: boolean
  error: string
  demoMode?: boolean
}

export default function Login({ onLogin, onRegister, onResetDemo, loading, error, demoMode = false }: Props) {
  const [entryMode, setEntryMode] = useState<'demo' | 'operational'>(demoMode ? 'demo' : 'operational')
  const [operationalTab, setOperationalTab] = useState<'signin' | 'register'>('signin')

  // Selected role card for Operational Sign In
  const [signinRoleId, setSigninRoleId] = useState<string>('resident')
  // Selected role card for Operational Registration
  const [regRoleId, setRegRoleId] = useState<string>('resident')

  // Operational Sign-in credentials
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  // Resident Registration state
  const [regDisplayName, setRegDisplayName] = useState('')
  const [regUsername, setRegUsername] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regWard, setRegWard] = useState('Ward 01')
  const [regConsent, setRegConsent] = useState(true)

  const selectedSigninRole = ROLE_OPTIONS.find(r => r.id === signinRoleId) || ROLE_OPTIONS[0]
  const selectedRegRole = ROLE_OPTIONS.find(r => r.id === regRoleId) || ROLE_OPTIONS[0]

  const handleOperationalLogin = (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) return
    void onLogin(username.trim(), password, false, selectedSigninRole.backendRole)
  }

  const handleRegistration = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRegRole.allowSelfRegistration) return
    void onRegister({
      username: regUsername.trim(),
      password: regPassword,
      display_name: regDisplayName.trim(),
      ward: regWard,
      consent: regConsent,
    })
  }

  return (
    <div className="login-shell">
      <section className="login-brand">
        <div className="brand-mark"><Recycle size={26} /></div>
        <div className="eyebrow">SOCIAOTHON 2026 · PS 06</div>
        <h1>Don't just clear the waste.<br /><span>Break the cycle.</span></h1>
        <p>Evidence-led waste operations connecting citizen reports, GPS-verified cleanup, recurrence detection, and prevention follow-ups.</p>
        <div className="login-points">
          <div><MapPinned /><span><b>Hotspot Passport</b><small>One persistent location history across all reports</small></span></div>
          <div><ClipboardCheck /><span><b>Role-Based Workflows</b><small>Dedicated citizen, worker, supervisor & recovery interfaces</small></span></div>
          <div><ShieldCheck /><span><b>Evidence-First Decisions</b><small>No recurrence claim without verified cleanup</small></span></div>
        </div>
        <div className="login-footnote">
          {entryMode === 'demo' ? (
            <>DEMO MODE ACTIVE <span>Isolated sandbox with synthetic test records.</span></>
          ) : (
            <>OPERATIONAL PILOT <span>Live municipal database and authenticated API.</span></>
          )}
        </div>
      </section>

      <section className="login-panel">
        {/* Entry Mode Switcher Tabs */}
        <div className="entry-mode-tabs" role="tablist">
          <button
            type="button"
            className={`entry-mode-tab ${entryMode === 'demo' ? 'active' : ''}`}
            onClick={() => setEntryMode('demo')}
          >
            <Sparkles size={16} />
            <span>Explore Demo</span>
          </button>
          <button
            type="button"
            className={`entry-mode-tab ${entryMode === 'operational' ? 'active' : ''}`}
            onClick={() => setEntryMode('operational')}
          >
            <LogIn size={16} />
            <span>Operational Login</span>
          </button>
        </div>

        {error && <div className="form-error" style={{ marginBottom: 16 }}>{error}</div>}

        {entryMode === 'demo' ? (
          /* ==================== EXPLORE DEMO MODE ==================== */
          <div className="demo-entry-panel">
            <div className="login-form-head">
              <span className="mini-label demo-tag">SIMULATED SANDBOX</span>
              <h2>Explore RecurScope</h2>
              <p>Select any role below to experience its dedicated interface using isolated synthetic demonstration records.</p>
            </div>

            {!isDemoConfigured() ? (
              <div className="demo-config-warning">
                <div className="warning-head">
                  <AlertTriangle size={18} />
                  <b>Demo service configuration is incomplete</b>
                </div>
                <p>
                  An isolated demo backend has not been configured (missing <code>VITE_DEMO_API_BASE_URL</code>).
                  To prevent contaminating production records, demo mode requires a separate isolated backend service.
                </p>
                <div className="warning-action">
                  <span>Please use <b>Operational Login</b> for authenticated pilot access.</span>
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => setEntryMode('operational')}>
                    Go to Operational Login
                  </button>
                </div>
              </div>
            ) : (
              getDemoBase() && (
                <div className="demo-connected-chip">
                  <span className="pulse-dot" /> Connected to isolated demo service
                </div>
              )
            )}

            <div className="demo-role-cards">
              {ROLE_OPTIONS.map(role => {
                const IconComponent = role.icon
                return (
                  <div className={`demo-role-card ${!isDemoConfigured() ? 'demo-disabled' : ''}`} key={role.id}>
                    <div className="demo-role-card-top">
                      <span className={`role-dot ${role.color}`} />
                      <div className="demo-role-meta">
                        <b>{role.name}</b>
                        <span className="demo-role-badge">{role.badge}</span>
                      </div>
                    </div>
                    <p className="demo-role-desc">{role.desc}</p>
                    <button
                      type="button"
                      className="btn btn-secondary btn-small demo-launch-btn"
                      disabled={loading || !isDemoConfigured()}
                      title={!isDemoConfigured() ? 'Demo service configuration is incomplete' : `Launch as ${role.name.split(' ')[0]}`}
                      onClick={() => void onLogin(role.demoUsername, role.demoPassword, true, role.backendRole)}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <IconComponent size={14} /> Launch as {role.name.split(' ')[0]}
                      </span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                )
              })}
            </div>

            <div className="demo-footer-actions">
              {onResetDemo && (
                <button
                  type="button"
                  className="btn btn-quiet btn-small"
                  onClick={() => void onResetDemo()}
                  disabled={loading || !isDemoConfigured()}
                  title={!isDemoConfigured() ? 'Demo service is not configured' : 'Restore clean initial demo state'}
                >
                  <RefreshCw size={14} /> Reset Demo Data
                </button>
              )}
              <span className="muted-text">Simulated records are completely isolated from operational databases.</span>
            </div>
          </div>
        ) : (
          /* ==================== OPERATIONAL LOGIN MODE ==================== */
          <div className="operational-entry-panel">
            <div className="operational-subtabs">
              <button
                type="button"
                className={`op-subtab ${operationalTab === 'signin' ? 'active' : ''}`}
                onClick={() => setOperationalTab('signin')}
              >
                <LogIn size={14} /> Sign In
              </button>
              <button
                type="button"
                className={`op-subtab ${operationalTab === 'register' ? 'active' : ''}`}
                onClick={() => setOperationalTab('register')}
              >
                <UserPlus size={14} /> Register Resident
              </button>
            </div>

            {operationalTab === 'signin' ? (
              <>
                <div className="login-form-head">
                  <span className="mini-label">MUNICIPAL ACCESS</span>
                  <h2>Role-Based Experience Sign In</h2>
                  <p>Select your intended role experience below. Authenticates directly against the production database.</p>
                </div>

                {/* 4 Selectable Role Cards */}
                <div className="op-role-cards-container">
                  <span className="field-hint-label">1. CHOOSE INTENDED EXPERIENCE:</span>
                  <div className="op-role-cards-grid">
                    {ROLE_OPTIONS.map(role => {
                      const IconComponent = role.icon
                      const isSelected = signinRoleId === role.id
                      return (
                        <button
                          key={role.id}
                          type="button"
                          className={`op-role-select-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => setSigninRoleId(role.id)}
                          aria-pressed={isSelected}
                        >
                          <div className="op-role-select-header">
                            <span className={`op-role-icon-box ${role.color}`}>
                              <IconComponent size={16} />
                            </span>
                            <div className="op-role-title-wrap">
                              <span className="op-role-card-name">{role.name}</span>
                              <span className="op-role-card-badge">{role.badge}</span>
                            </div>
                            <span className="op-role-check-indicator">
                              {isSelected ? <CheckCircle2 size={16} className="check-active" /> : <span className="check-inactive" />}
                            </span>
                          </div>
                          <p className="op-role-select-desc">{role.desc}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="op-selected-role-banner">
                  <div className="banner-icon"><Lock size={15} /></div>
                  <div className="banner-text">
                    <b>Signing in to:</b> {selectedSigninRole.fullName}
                    <small>The backend authoritatively verifies your assigned role. Selecting a card does not bypass server permissions.</small>
                  </div>
                </div>

                <form onSubmit={handleOperationalLogin} className="login-form">
                  <label>
                    Username
                    <input
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      autoComplete="username"
                      placeholder={
                        selectedSigninRole.id === 'resident'
                          ? 'e.g. resident_nagpur'
                          : selectedSigninRole.id === 'worker'
                          ? 'e.g. worker_ward01'
                          : selectedSigninRole.id === 'supervisor'
                          ? 'e.g. supervisor_admin'
                          : 'e.g. mrf_partner_nagpur'
                      }
                      required
                    />
                  </label>
                  <label>
                    Password
                    <input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoComplete="current-password"
                      placeholder="••••••••••••"
                      required
                    />
                  </label>
                  <button className="btn btn-primary btn-wide" disabled={loading}>
                    {loading ? 'Authenticating with Backend…' : `Sign In to ${selectedSigninRole.name}`} <ArrowRight size={17} />
                  </button>
                </form>

                <p className="login-disclaimer">
                  Operational mode strictly reads and writes live municipal records. Default demo passwords cannot be used against the operational database.
                </p>
              </>
            ) : (
              <>
                <div className="login-form-head">
                  <span className="mini-label">ACCOUNT REGISTRATION</span>
                  <h2>Account Provisioning & Registration</h2>
                  <p>Choose an account type below. Public self-registration is permitted only for Resident (Citizen) accounts.</p>
                </div>

                {/* 4 Role Cards on Registration */}
                <div className="op-role-cards-container">
                  <span className="field-hint-label">CHOOSE ACCOUNT TYPE:</span>
                  <div className="op-role-cards-grid">
                    {ROLE_OPTIONS.map(role => {
                      const IconComponent = role.icon
                      const isSelected = regRoleId === role.id
                      return (
                        <button
                          key={role.id}
                          type="button"
                          className={`op-role-select-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => setRegRoleId(role.id)}
                          aria-pressed={isSelected}
                        >
                          <div className="op-role-select-header">
                            <span className={`op-role-icon-box ${role.color}`}>
                              <IconComponent size={16} />
                            </span>
                            <div className="op-role-title-wrap">
                              <span className="op-role-card-name">{role.name}</span>
                              <span className="op-role-card-badge">{role.badge}</span>
                            </div>
                            <span className="op-role-check-indicator">
                              {isSelected ? <CheckCircle2 size={16} className="check-active" /> : <span className="check-inactive" />}
                            </span>
                          </div>
                          <p className="op-role-select-desc">{role.desc}</p>
                          <div className="op-role-reg-status">
                            {role.allowSelfRegistration ? (
                              <span className="reg-badge-open">Public Self-Registration Available</span>
                            ) : (
                              <span className="reg-badge-restricted">Supervisor Provisioning Required</span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {selectedRegRole.allowSelfRegistration ? (
                  /* Public Resident Registration Form */
                  <form onSubmit={handleRegistration} className="login-form" style={{ marginTop: 12 }}>
                    <div className="op-form-section-head">
                      <h3>Resident (Citizen) Registration</h3>
                      <p>Create a verified citizen account to submit geo-tagged incident reports and follow clearance progress.</p>
                    </div>

                    <label>
                      Full Name
                      <input
                        value={regDisplayName}
                        onChange={e => setRegDisplayName(e.target.value)}
                        placeholder="e.g. Ravi Kumar"
                        required
                      />
                    </label>
                    <label>
                      Choose Username
                      <input
                        value={regUsername}
                        onChange={e => setRegUsername(e.target.value)}
                        placeholder="e.g. ravi_nagpur"
                        autoComplete="username"
                        required
                      />
                    </label>
                    <label>
                      Password (min 6 characters)
                      <input
                        type="password"
                        value={regPassword}
                        onChange={e => setRegPassword(e.target.value)}
                        placeholder="••••••••••••"
                        minLength={6}
                        autoComplete="new-password"
                        required
                      />
                    </label>
                    <label>
                      Residential Ward
                      <select value={regWard} onChange={e => setRegWard(e.target.value)}>
                        <option value="Ward 01">Ward 01 (Central)</option>
                        <option value="Ward 02">Ward 02 (North East)</option>
                        <option value="Ward 03">Ward 03 (Market & Commercial)</option>
                        <option value="Ward 04">Ward 04 (South Transit)</option>
                      </select>
                    </label>
                    <label className="checkbox-label" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.82rem', marginTop: 4 }}>
                      <input
                        type="checkbox"
                        checked={regConsent}
                        onChange={e => setRegConsent(e.target.checked)}
                        required
                        style={{ marginTop: 3 }}
                      />
                      <span>
                        I consent to participating in the municipal waste reporting pilot and agree to share incident photographs and GPS coordinates for cleanup verification.
                      </span>
                    </label>

                    <button className="btn btn-primary btn-wide" disabled={loading || !regConsent}>
                      {loading ? 'Creating Resident Account…' : 'Complete Citizen Registration'} <UserCheck size={17} />
                    </button>
                  </form>
                ) : (
                  /* Privileged Role Notice — Registration Blocked */
                  <div className="privileged-provisioning-box">
                    <div className="provisioning-icon">
                      <ShieldAlert size={28} />
                    </div>
                    <div className="provisioning-content">
                      <h3>Privileged Role: Administrative Provisioning Required</h3>
                      <p>
                        Public self-registration is permitted exclusively for <b>Resident (Citizen)</b> accounts.
                        <b> {selectedRegRole.fullName}</b> accounts handle operational assignments, verification decisions, or material custody,
                        and must be officially provisioned by an authorized Ward Supervisor or Municipal Administrator.
                      </p>
                      <div className="provisioning-instructions">
                        <div><b>Municipal Staff:</b> Request your supervisor to create your login via the Supervisor Workbench.</div>
                        <div><b>Recovery Partners:</b> Contact the Nagpur Municipal Corporation pilot office for onboarding.</div>
                      </div>
                      <div className="provisioning-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          onClick={() => setRegRoleId('resident')}
                        >
                          Switch to Resident Registration
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-small"
                          onClick={() => {
                            setSigninRoleId(selectedRegRole.id)
                            setOperationalTab('signin')
                          }}
                        >
                          Sign In with Existing Credentials
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <p className="login-disclaimer">
                  Public registration assigns citizen reporting privileges only. The backend strictly prevents unauthorized privilege escalation.
                </p>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
