import { useState } from 'react'
import { Recycle, ShieldCheck, MapPinned, ClipboardCheck, ArrowRight, UserPlus, LogIn, Sparkles, RefreshCw, UserCheck } from 'lucide-react'

type Props = {
  onLogin: (username: string, password: string, isDemo?: boolean) => Promise<void>
  onRegister: (data: { username: string; password: string; display_name: string; ward?: string; consent: boolean }) => Promise<void>
  onResetDemo?: () => Promise<unknown> | void
  loading: boolean
  error: string
  demoMode?: boolean
}

const demoAccounts = [
  {
    role: 'Resident (Citizen)',
    username: 'resident',
    password: 'citizen123',
    desc: 'Submit photo incidents, choose locations, and follow the real status timeline.',
    color: 'lime',
    badge: 'Citizen Experience'
  },
  {
    role: 'Field Worker',
    username: 'worker',
    password: 'worker123',
    desc: 'View assigned tasks, upload GPS before/after evidence, and classify waste streams.',
    color: 'blue',
    badge: 'Worker Experience'
  },
  {
    role: 'Ward Supervisor',
    username: 'admin',
    password: 'admin123',
    desc: 'Recurrence decision board, evidence review, cleanup verification, and follow-ups.',
    color: 'teal',
    badge: 'Supervisor Workbench'
  },
  {
    role: 'Recovery Partner',
    username: 'receiver',
    password: 'receiver123',
    desc: 'Inspect segregation handoffs, confirm material intake, and track recovery rates.',
    color: 'amber',
    badge: 'Segregation & MRF'
  },
]

export default function Login({ onLogin, onRegister, onResetDemo, loading, error, demoMode = false }: Props) {
  const [entryMode, setEntryMode] = useState<'demo' | 'operational'>(demoMode ? 'demo' : 'operational')
  const [operationalTab, setOperationalTab] = useState<'signin' | 'register'>('signin')

  // Operational Sign-in state
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  // Resident Registration state
  const [regDisplayName, setRegDisplayName] = useState('')
  const [regUsername, setRegUsername] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regWard, setRegWard] = useState('Ward 01')
  const [regConsent, setRegConsent] = useState(true)

  const handleOperationalLogin = (e: React.FormEvent) => {
    e.preventDefault()
    void onLogin(username.trim(), password, false)
  }

  const handleRegistration = (e: React.FormEvent) => {
    e.preventDefault()
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
          <div><ClipboardCheck /><span><b>Role-Based Workflows</b><small>Dedicated citizen, worker, and supervisor interfaces</small></span></div>
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

            <div className="demo-role-cards">
              {demoAccounts.map(account => (
                <div className="demo-role-card" key={account.username}>
                  <div className="demo-role-card-top">
                    <span className={`role-dot ${account.color}`} />
                    <div className="demo-role-meta">
                      <b>{account.role}</b>
                      <span className="demo-role-badge">{account.badge}</span>
                    </div>
                  </div>
                  <p className="demo-role-desc">{account.desc}</p>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small demo-launch-btn"
                    disabled={loading}
                    onClick={() => void onLogin(account.username, account.password, true)}
                  >
                    <span>Launch as {account.role.split(' ')[0]}</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="demo-footer-actions">
              {onResetDemo && (
                <button
                  type="button"
                  className="btn btn-quiet btn-small"
                  onClick={() => void onResetDemo()}
                  disabled={loading}
                  title="Restore clean initial demo state"
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
                  <h2>Staff & Resident Sign In</h2>
                  <p>Sign in using your provisioned or registered credentials. Connects directly to the live backend.</p>
                </div>

                <form onSubmit={handleOperationalLogin} className="login-form">
                  <label>
                    Username
                    <input
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      autoComplete="username"
                      placeholder="e.g. resident_nagpur or staff_id"
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
                    {loading ? 'Authenticating…' : 'Enter Workspace'} <ArrowRight size={17} />
                  </button>
                </form>

                <p className="login-disclaimer">
                  Operational mode strictly reads and writes real data from the configured production backend. Never presents simulated records if the API is offline.
                </p>
              </>
            ) : (
              <>
                <div className="login-form-head">
                  <span className="mini-label">CITIZEN ONBOARDING</span>
                  <h2>Resident Registration</h2>
                  <p>Create a resident account to submit verified waste reports and track clearance timelines in your neighborhood.</p>
                </div>

                <form onSubmit={handleRegistration} className="login-form">
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
                    {loading ? 'Creating Account…' : 'Register as Resident'} <UserCheck size={17} />
                  </button>
                </form>

                <p className="login-disclaimer">
                  Public registration assigns resident reporting privileges only. Field worker and supervisor accounts are provisioned exclusively by system administrators.
                </p>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
