import { useState } from 'react'
import { Recycle, ShieldCheck, MapPinned, ClipboardCheck, ArrowRight } from 'lucide-react'
import type { User } from '../lib/types'

type Props={onLogin:(username:string,password:string)=>Promise<void>; loading:boolean; error:string}
const accounts = [
  {role:'Supervisor',username:'admin',password:'admin123',color:'teal'},
  {role:'Field worker',username:'worker',password:'worker123',color:'blue'},
  {role:'Resident',username:'resident',password:'citizen123',color:'lime'},
  {role:'Recovery partner',username:'receiver',password:'receiver123',color:'amber'},
]
export default function Login({onLogin,loading,error}:Props) {
  const [username,setUsername]=useState('admin'); const [password,setPassword]=useState('admin123')
  return <div className="login-shell">
    <section className="login-brand">
      <div className="brand-mark"><Recycle size={26}/></div>
      <div className="eyebrow">SOCIAOTHON 2026 · PS 06</div>
      <h1>Don't just clear the waste.<br/><span>Break the cycle.</span></h1>
      <p>Evidence-led waste operations that connect reports, verified cleanup, prevention and follow-up.</p>
      <div className="login-points">
        <div><MapPinned/><span><b>Hotspot Passport</b><small>One persistent location history</small></span></div>
        <div><ClipboardCheck/><span><b>Intervention Ledger</b><small>Owners, actions and follow-up evidence</small></span></div>
        <div><ShieldCheck/><span><b>Evidence-first decisions</b><small>No recurrence claim without verified cleanup</small></span></div>
      </div>
      <div className="login-footnote">DEMO ENVIRONMENT <span>All seeded records are simulated.</span></div>
    </section>
    <section className="login-panel">
      <div className="login-form-head"><span className="mini-label">RECURSCOPE WORKSPACE</span><h2>Welcome back</h2><p>Sign in using a demo role to explore the operational workflow.</p></div>
      <form onSubmit={e=>{e.preventDefault();void onLogin(username,password)}} className="login-form">
        <label>Username<input value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" required/></label>
        <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/></label>
        {error && <div className="form-error">{error}</div>}
        <button className="btn btn-primary btn-wide" disabled={loading}>{loading?'Signing in…':'Enter workspace'} <ArrowRight size={17}/></button>
      </form>
      <div className="role-login-head"><span>QUICK ACCESS</span><div/></div>
      <div className="role-grid">{accounts.map(a=><button type="button" className="role-choice" key={a.username} onClick={()=>{setUsername(a.username);setPassword(a.password);void onLogin(a.username,a.password)}} disabled={loading}><span className={`role-dot ${a.color}`}/><span><b>{a.role}</b><small>{a.username}</small></span><ArrowRight size={15}/></button>)}</div>
      <p className="login-disclaimer">Local demo credentials only. Replace demo secrets and review security settings before deployment.</p>
    </section>
  </div>
}
