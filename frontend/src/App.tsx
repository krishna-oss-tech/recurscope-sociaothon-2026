import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, Check, CheckCircle2,
  ChevronDown, ClipboardCheck, Clock3, Download, FileCheck2, Filter, Home, Leaf, LogOut,
  MapPinned, Menu, Plus, Recycle, RefreshCw, Search, ShieldCheck, Trash2, Truck, Users,
  X, Workflow, CalendarClock, PackageCheck, CircleHelp, ExternalLink, Camera, MapPin, LocateFixed,
} from 'lucide-react'
import Login from './components/Login'
import MapView from './components/MapView'
import LocationPicker from './components/LocationPicker'
import { api, getToken, setToken, API_BASE, type HotspotCandidate } from './lib/api'
import type { User, Hotspot, Task, Passport, Summary, Intervention, Handoff, FollowUp, Report, PilotConfig } from './lib/types'
import './styles.css'

type Page = 'overview'|'hotspots'|'tasks'|'reports'|'interventions'|'recycling'
const STREAMS = ['WET','DRY','SANITARY','SPECIAL_CARE','MIXED_UNKNOWN']
const ISSUES = ['DUMPING','MISSED_PICKUP','MIXED_WASTE','DRY_RECYCLABLES','SANITARY','SPECIAL_CARE','SHARP_OR_HAZARDOUS','BURNING','OTHER']
const pageCopy:Record<Page,{label:string;title:string;desc:string}> = {
  overview:{label:'RECURRENCE OPERATIONS',title:'Recurrence workbench',desc:'Separate unresolved waste from verified post-cleanup returns—and track whether prevention holds.'},
  hotspots:{label:'LOCATION INTELLIGENCE',title:'Hotspot map',desc:'Select a location to inspect its history, priorities and next action.'},
  tasks:{label:'FIELD OPERATIONS',title:'Collection tasks',desc:'Assign, execute and verify work with location and photo evidence.'},
  reports:{label:'EVIDENCE RECORDS',title:'Incident reports',desc:'Track genuine user-submitted reports, location accuracy, and verification status.'},
  interventions:{label:'PREVENTION',title:'Intervention Ledger',desc:'Track suspected causes as hypotheses, actions, owners and outcomes.'},
  recycling:{label:'RECOVERY & MEASUREMENT',title:'Segregation & impact',desc:'Follow waste streams to a named receiver and measure only recorded outcomes.'},
}
const fmtDate=(value?:string|null)=>value?new Date(value).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—'
const fmtTime=(value?:string|null)=>value?new Date(value).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—'
const dueLabel=(value:string)=>{const days=(new Date(value).getTime()-Date.now())/86400000;return days<0?`${Math.abs(Math.ceil(days))}d overdue`:days<1?'Due today':`Due in ${Math.ceil(days)}d`}
const nice=(value?:string|null)=>value?(value.toLowerCase().replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase())):'Unknown'

export default function App(){
  const [user,setUser]=useState<User|null>(null)
  const [authLoading,setAuthLoading]=useState(false)
  const [authError,setAuthError]=useState('')
  const [page,setPage]=useState<Page>('overview')
  const [hotspots,setHotspots]=useState<Hotspot[]>([])
  const [tasks,setTasks]=useState<Task[]>([])
  const [reports,setReports]=useState<Report[]>([])
  const [pilot,setPilot]=useState<PilotConfig>({name:'Nagpur Central Pilot',latitude:21.1458,longitude:79.0882,radius_km:15,default_ward:'Ward 01'})
  const [interventions,setInterventions]=useState<Intervention[]>([])
  const [handoffs,setHandoffs]=useState<Handoff[]>([])
  const [followups,setFollowups]=useState<FollowUp[]>([])
  const [workers,setWorkers]=useState<User[]>([])
  const [summary,setSummary]=useState<Summary|null>(null)
  const [selectedId,setSelectedId]=useState<number|null>(null)
  const [passport,setPassport]=useState<Passport|null>(null)
  const [search,setSearch]=useState('')
  const [filterStatus,setFilterStatus]=useState('ALL')
  const [filterWard,setFilterWard]=useState('ALL')
  const [filterPriority,setFilterPriority]=useState('ALL')
  const [filterAge,setFilterAge]=useState('ALL')
  const [reportOpen,setReportOpen]=useState(false)
  const [toast,setToast]=useState<{message:string;kind:'success'|'error'|'info'}|null>(null)
  const [busy,setBusy]=useState(false)
  const [mobileNav,setMobileNav]=useState(false)
  const [demoMode,setDemoMode]=useState(false)

  const notify=useCallback((message:string,kind:'success'|'error'|'info'='success')=>{
    setToast({message,kind}); window.setTimeout(()=>setToast(null),4200)
  },[])
  const refresh=useCallback(async (keepSelection=true, preferredId?:number|null)=>{
    try{
      const [s,h,t,i,ha,f,pcfg,reps]=await Promise.all([
        api.summary(),api.hotspots(),api.tasks(),api.interventions(),api.handoffs(),api.followups(),
        api.getPilotConfig().catch(()=>null),api.reports().catch(()=>[])
      ])
      setSummary(s);setHotspots(h);setTasks(t);setInterventions(i);setHandoffs(ha);setFollowups(f)
      if(pcfg)setPilot(pcfg);if(reps)setReports(reps)
      const candidateId=preferredId??selectedId
      const firstId=keepSelection&&candidateId&&h.some(x=>x.id===candidateId)?candidateId:(h[0]?.id??null)
      setSelectedId(firstId)
      if(firstId){try{setPassport(await api.passport(firstId))}catch{setPassport(null)}}else setPassport(null)
      if(user&&user.role==='admin'){try{setWorkers(await api.users('worker'))}catch{setWorkers([])}}
    }catch(err){notify(err instanceof Error?err.message:'Unable to load workspace data','error')}
  },[notify,selectedId,user])
  const chooseHotspot=useCallback(async(id:number)=>{
    setSelectedId(id)
    try{setPassport(await api.passport(id))}catch(err){notify(err instanceof Error?err.message:'Could not load hotspot passport','error')}
  },[notify])
  const login=async(username:string,password:string)=>{
    setAuthLoading(true);setAuthError('')
    try{const response=await api.login(username,password);setToken(response.access_token);setUser(response.user);setPage('overview');notify(`Signed in as ${response.user.display_name}`,'success')}
    catch(err){setAuthError(err instanceof Error?err.message:'Sign-in failed')}
    finally{setAuthLoading(false)}
  }
  const logout=()=>{setToken('');setUser(null);setPassport(null);setToast(null)}
  useEffect(()=>{
    api.health().then(h=>setDemoMode(Boolean(h.demo_mode))).catch(()=>setDemoMode(false))
    if(!getToken())return;
    api.me().then(setUser).catch(()=>{setToken('');setUser(null)})
  },[])
  useEffect(()=>{if(user)void refresh(false)},[user])
  useEffect(()=>{if(!user)return;const timer=window.setInterval(()=>void refresh(true),60000);return()=>window.clearInterval(timer)},[user,refresh])
  useEffect(()=>{if(!user||!selectedId)return;api.passport(selectedId).then(setPassport).catch(()=>setPassport(null))},[selectedId,user])

  const selected=hotspots.find(h=>h.id===selectedId)||null
  const filteredHotspots=useMemo(()=>hotspots.filter(h=>{
    const q=search.toLowerCase();const match=!q||`${h.code} ${h.label} ${h.ward} ${h.latest_issue||''}`.toLowerCase().includes(q)
    const status=filterStatus==='ALL'||h.status===filterStatus
    const ward=filterWard==='ALL'||h.ward===filterWard
    const priority=filterPriority==='ALL'||h.priority.band===filterPriority
    const ageDays=(Date.now()-new Date(h.last_seen_at).getTime())/86400000
    const age=filterAge==='ALL'||(filterAge==='24H'&&ageDays<=1)||(filterAge==='7D'&&ageDays<=7)||(filterAge==='30D'&&ageDays<=30)
    return match&&status&&ward&&priority&&age
  }),[hotspots,search,filterStatus,filterWard,filterPriority,filterAge])

  async function runAction(action:()=>Promise<unknown>, success?:string):Promise<boolean>{
    setBusy(true)
    try{
      const result=await action()
      if(success)notify(success);else if(result&&typeof result==='object'&&'message' in result)notify(String((result as any).message))
      const preferredId=result&&typeof result==='object'&&'hotspot' in result&&Number.isFinite(Number((result as any).hotspot?.id))?Number((result as any).hotspot.id):undefined
      await refresh(true,preferredId)
      return true
    }catch(err){notify(err instanceof Error?err.message:'Action failed','error');return false}
    finally{setBusy(false)}
  }
  async function createReport(form:FormData){return runAction(()=>api.createReport(form).then(r=>{setSelectedId(r.hotspot.id);return r}), 'Report saved. Review its hotspot history and evidence.')}
  async function attachReportEvidence(_hotspotId:number, reportId:number, form:FormData){await runAction(()=>api.attachReportEvidence(reportId,form), 'Evidence attached to the existing report. It is ready for supervisor review.')}
  async function startTask(task:Task){await runAction(()=>api.startTask(task.id),`${task.code} moved to in progress.`)}
  async function submitEvidence(task:Task,kind:'before'|'after',file:File){
    const h=hotspots.find(x=>x.id===task.hotspot_id);if(!h){notify('Hotspot coordinates not available','error');return}
    const f=new FormData();f.append('kind',kind);f.append('latitude',String(h.latitude));f.append('longitude',String(h.longitude));f.append('photo',file)
    await runAction(()=>api.evidence(task.id,f),`${kind==='before'?'Before':'After'} evidence uploaded for ${task.code}.`)
  }
  async function finishTask(task:Task){await runAction(()=>api.finishTask(task.id),`${task.code} sent for human verification.`)}
  async function verifyTask(task:Task,approved:boolean,notes?:string){
    const defaultNote = approved ? 'Evidence reviewed and accepted.' : 'Please retake clear after-photo and verify the location.'
    const reviewNote = notes?.trim() || defaultNote
    await runAction(()=>api.verifyTask(task.id,approved,reviewNote),approved?'Cleanup verified. Follow-up was scheduled.':'Evidence rejected; task reopened for correction.')
  }

  if(!user)return <Login onLogin={login} loading={authLoading} error={authError} demoMode={demoMode}/>
  const meta=pageCopy[page]
  return <div className="app-shell rs-v05">
    <aside className={`sidebar ${mobileNav?'sidebar-open':''}`}>
      <div className="sidebar-brand"><div className="brand-symbol"><Recycle size={22}/></div><div><b>RecurScope</b><small>WASTE OPERATIONS</small></div><button className="mobile-close icon-btn" onClick={()=>setMobileNav(false)}><X size={18}/></button></div>
      <div className="demo-chip">{summary?.synthetic_data?<><span className="pulse-dot"/> DEMO ENVIRONMENT <small>SIMULATED DATA</small></>:<><span className="live-dot" style={{marginRight:6}}/> OPERATIONAL PILOT <small>{pilot.name.toUpperCase()}</small></>}</div>
      <div className="nav-section-label">WORKSPACE</div>
      <nav className="main-nav">
        <NavItem active={page==='overview'} icon={<Home size={18}/>} label="Recurrence workbench" onClick={()=>{setPage('overview');setMobileNav(false)}}/>
        <NavItem active={page==='hotspots'} icon={<MapPinned size={18}/>} label="Hotspot map" count={hotspots.length} onClick={()=>{setPage('hotspots');setMobileNav(false)}}/>
        <NavItem active={page==='reports'} icon={<Camera size={18}/>} label="Incident reports" count={reports.length} onClick={()=>{setPage('reports');setMobileNav(false)}}/>
        <NavItem active={page==='tasks'} icon={<ClipboardCheck size={18}/>} label="Collection tasks" count={tasks.filter(t=>['ASSIGNED','IN_PROGRESS','AWAITING_VERIFICATION'].includes(t.status)).length} onClick={()=>{setPage('tasks');setMobileNav(false)}}/>
      </nav>
      <div className="nav-section-label">PREVENTION & RECOVERY</div>
      <nav className="main-nav">
        <NavItem active={page==='interventions'} icon={<Workflow size={18}/>} label="Intervention Ledger" count={interventions.filter(i=>i.status==='OPEN'||i.status==='IN_PROGRESS').length} onClick={()=>{setPage('interventions');setMobileNav(false)}}/>
        <NavItem active={page==='recycling'} icon={<Recycle size={18}/>} label="Segregation & impact" onClick={()=>{setPage('recycling');setMobileNav(false)}}/>
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-help"><div className="help-icon"><ShieldCheck size={18}/></div><b>Evidence before closure</b><p>A closed task is not proof a hotspot stayed clean.</p></div>
        <div className="user-card"><div className="avatar">{user.display_name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}</div><div className="user-card-copy"><b>{user.display_name}</b><small>{nice(user.role)}</small></div><button className="icon-btn logout-btn" title="Sign out" onClick={logout}><LogOut size={17}/></button></div>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar rs-topbar"><div className="topbar-left"><button className="mobile-menu icon-btn" onClick={()=>setMobileNav(true)}><Menu size={20}/></button><div className="crumbs"><span>RecurScope</span><span className="crumb-slash">/</span><b>{meta.label}</b></div></div><div className="topbar-actions"><div className="status-pill"><span className="live-dot"/> {summary?.synthetic_data?'Local demo connected':`Pilot active · ${pilot.name}`}</div><button className="icon-btn notification-btn" title="Refresh workspace" onClick={()=>void refresh(true)}><RefreshCw size={17}/></button>{user.role==='admin'&&<button className="btn btn-quiet btn-reset" onClick={()=>runAction(()=>api.resetDemo(),'Demo reset complete. Scenario restored.')} disabled={busy}><RefreshCw size={15}/> Reset demo</button>}</div></header>
      <div className="page-content">
        <div className="page-heading rs-page-heading"><div><div className="eyebrow green">{meta.label}</div><h1>{meta.title}</h1><p>{meta.desc}</p></div><div className="heading-actions"><div className="last-updated"><span className="live-dot"/> Updates every minute</div><button className="btn btn-primary" onClick={()=>setReportOpen(true)}><Plus size={17}/> New report</button></div></div>
        {summary?.synthetic_data?<div className="demo-banner"><div className="demo-banner-icon"><CircleHelp size={18}/></div><div><b>SIMULATED DATA MODE</b><span>Seeded sample records are for demonstration only. Do not present these as real municipal results.</span></div><button className="banner-close icon-btn" title="Dismiss" onClick={e=>{(e.currentTarget.parentElement as HTMLElement).style.display='none'}}><X size={16}/></button></div>:<div className="demo-banner pilot-banner"><div className="demo-banner-icon"><ShieldCheck size={18}/></div><div><b>PILOT AREA ACTIVE · {pilot.name.toUpperCase()}</b><span>Operating with live coordinates and evidence in {pilot.name} (Ward boundary: {pilot.default_ward}, {pilot.radius_km} km radius).</span></div></div>}
        {page==='overview'&&<Overview summary={summary} hotspots={hotspots} tasks={tasks} interventions={interventions} followups={followups} selected={selected} selectedId={selectedId} passport={passport} user={user} pilot={pilot} onSelect={chooseHotspot} onNavigate={setPage} onOpenReport={()=>setReportOpen(true)} onConfirmRecurrence={(h,r)=>runAction(()=>api.confirmRecurrence(h,r,'Human reviewer confirmed a later evidence-backed incident after verified cleanup.'),'Post-cleanup recurrence confirmed.')} onRecordFollowup={(h,form)=>runAction(()=>api.recordFollowup(h,form),'Follow-up observation recorded.')} onCreateIntervention={(h,body)=>runAction(()=>api.createIntervention(h,body),'Preventive intervention created.')} onAttachReportEvidence={attachReportEvidence} busy={busy}/>}
        {page==='hotspots'&&<HotspotsPage hotspots={filteredHotspots} allHotspots={hotspots} allCount={hotspots.length} selectedId={selectedId} selected={selected} passport={passport} search={search} statusFilter={filterStatus} wardFilter={filterWard} priorityFilter={filterPriority} ageFilter={filterAge} setSearch={setSearch} setStatusFilter={setFilterStatus} setWardFilter={setFilterWard} setPriorityFilter={setFilterPriority} setAgeFilter={setFilterAge} onSelect={chooseHotspot} user={user} pilot={pilot} onConfirmRecurrence={(h,r)=>runAction(()=>api.confirmRecurrence(h,r,'Human reviewer confirmed a later evidence-backed incident after verified cleanup.'),'Post-cleanup recurrence confirmed.')} onRecordFollowup={(h,form)=>runAction(()=>api.recordFollowup(h,form),'Follow-up observation recorded.')} onCreateIntervention={(h,body)=>runAction(()=>api.createIntervention(h,body),'Preventive intervention created.')} onAttachReportEvidence={attachReportEvidence} busy={busy}/>}
        {page==='reports'&&<ReportsPage reports={reports} user={user} onSelectHotspot={(id)=>{chooseHotspot(id);setPage('hotspots')}} onOpenReport={()=>setReportOpen(true)}/>}
        {page==='tasks'&&<TasksPage tasks={tasks} hotspots={hotspots} workers={workers} user={user} busy={busy} onCreate={(body)=>runAction(()=>api.createTask(body),'Collection task created.')} onUpdate={(id,body)=>runAction(()=>api.updateTask(id,body),'Task updated.')} onStart={startTask} onEvidence={submitEvidence} onFinish={finishTask} onVerify={verifyTask}/>}
        {page==='interventions'&&<InterventionsPage interventions={interventions} hotspots={hotspots} followups={followups} user={user} busy={busy} onCreate={(h,body)=>runAction(()=>api.createIntervention(h,body),'Preventive intervention created.')} onUpdate={(id,body)=>runAction(()=>api.updateIntervention(id,body),'Intervention updated.')}/>}
        {page==='recycling'&&<RecyclingPage handoffs={handoffs} tasks={tasks} summary={summary} user={user} busy={busy} onCreate={(body)=>runAction(()=>api.createHandoff(body),'Handoff record created.')} onUpdate={(id,body)=>runAction(()=>api.updateHandoff(id,body),'Handoff status updated.')}/>}
        <footer className="app-footer"><span>RecurScope · SOCIAOTHON 2026 · PS 06</span><span>Operational priority rules · no unvalidated AI claims</span></footer>
      </div>
    </main>
    {reportOpen&&<ReportModal hotspots={hotspots} selected={selected} pilot={pilot} onClose={()=>setReportOpen(false)} onSubmit={async form=>{const ok=await createReport(form);if(ok)setReportOpen(false)}} busy={busy}/>}
    {toast&&<div className={`toast toast-${toast.kind}`}><span className="toast-icon">{toast.kind==='error'?<AlertTriangle size={18}/>:toast.kind==='info'?<Bell size={18}/>:<CheckCircle2 size={18}/>}</span><span>{toast.message}</span><button className="icon-btn" onClick={()=>setToast(null)}><X size={16}/></button></div>}
  </div>
}

function NavItem({active,icon,label,count,onClick}:{active:boolean;icon:ReactNode;label:string;count?:number;onClick:()=>void}){
  return <button className={`nav-item ${active?'nav-item-active':''}`} onClick={onClick}>{icon}<span>{label}</span>{count!==undefined&&<small>{count}</small>}</button>
}
function StatCard({label,value,detail,icon,accent,change}:{label:string;value:string|number;detail:string;icon:ReactNode;accent:string;change?:'up'|'down'|'flat'}){
  return <div className="stat-card"><div className={`stat-icon ${accent}`}>{icon}</div><div className="stat-main"><span>{label}</span><b>{value}</b><small>{change==='up'?<ArrowUpRight size={13}/>:change==='down'?<ArrowDownRight size={13}/>:null}{detail}</small></div></div>
}
function Overview(props:{summary:Summary|null;hotspots:Hotspot[];tasks:Task[];interventions:Intervention[];followups:FollowUp[];selected:Hotspot|null;selectedId:number|null;passport:Passport|null;user:User;pilot:PilotConfig;onSelect:(id:number)=>void;onNavigate:(p:Page)=>void;onOpenReport:()=>void;onConfirmRecurrence:(h:number,r:number)=>void;onRecordFollowup:(h:number,f:FormData)=>void;onCreateIntervention:(h:number,b:unknown)=>void;onAttachReportEvidence:(h:number,r:number,f:FormData)=>void;busy:boolean}){
 const {summary:s,hotspots,tasks,interventions,followups,selected,selectedId,passport,user,pilot,onSelect,onNavigate,onOpenReport,onConfirmRecurrence,onRecordFollowup,onCreateIntervention,onAttachReportEvidence,busy}=props
 const possibleReturns=hotspots.filter(h=>h.status==='POSSIBLE_RETURN')
 const persistent=hotspots.filter(h=>!h.recurrence_count&&!h.last_verified_cleanup_at&&(h.status==='UNRESOLVED'||h.report_count>=2))
 const confirmed=hotspots.filter(h=>h.recurrence_count>0)
 const openInterventions=interventions.filter(i=>['OPEN','IN_PROGRESS'].includes(i.status))
 const overdue=tasks.filter(t=>['ASSIGNED','IN_PROGRESS','AWAITING_VERIFICATION'].includes(t.status)&&new Date(t.due_at)<new Date()).length
 const openCase=(id:number)=>{onSelect(id);onNavigate('hotspots')}
 const followupState=(interventionId:number,days:number)=>followups.find(f=>f.intervention_id===interventionId&&f.window_days===days)?.observed_state||'NOT_SCHEDULED'
 const preventionOutcome=(interventionId:number,windows:number[])=>{
   const linked=followups.filter(f=>f.intervention_id===interventionId)
   if(linked.some(f=>['POSSIBLE_RETURN','CONFIRMED_RETURN'].includes(f.observed_state)))return 'Return signal recorded · review required'
   if(windows.length>0&&windows.every(d=>linked.some(f=>f.window_days===d&&f.observed_state==='NO_RETURN')))return 'No return observed in all recorded windows'
   return 'Effectiveness not established yet'
 }
 return <>
   <section className="stats-grid">
     <StatCard label="Possible returns" value={possibleReturns.length} detail="Need evidence + human review" icon={<Search size={20}/>} accent="amber"/>
     <StatCard label="Persistent accumulation" value={persistent.length} detail="Multiple reports, no verified cleanup" icon={<AlertTriangle size={20}/>} accent="coral"/>
     <StatCard label="Confirmed return history" value={confirmed.length} detail="A return after verified cleanup" icon={<RefreshCw size={20}/>} accent="blue"/>
     <StatCard label="Open interventions" value={openInterventions.length} detail={`${openInterventions.filter(i=>new Date(i.due_at)<new Date()).length} overdue · ${overdue} field tasks overdue`} icon={<Workflow size={20}/>} accent="teal"/>
   </section>

   <div className="overview-grid">
     <section className="panel map-panel"><div className="panel-header"><div><h2>Hotspot context map</h2><p>Use location context to open the full evidence passport</p></div><button className="text-link" onClick={()=>onNavigate('hotspots')}>Open map <ArrowRight size={15}/></button></div><MapView hotspots={hotspots} selectedId={selectedId} onSelect={onSelect} defaultCenter={[pilot.latitude, pilot.longitude]}/><div className="map-bottom-row"><span><b>{hotspots.length}</b> locations</span><span>100 m candidate review radius</span><span className="sample-inline"><i/> {pilot.name}</span></div></section>
     <div className="right-stack"><section className="panel attention-panel"><div className="panel-header"><div><h2>Operational urgency</h2><p>Explainable prototype priority rules</p></div><span className="count-bubble">{hotspots.filter(h=>h.priority.band==='CRITICAL'||h.priority.band==='HIGH').length}</span></div>
       {hotspots.filter(h=>h.priority.band==='CRITICAL'||h.priority.band==='HIGH'||h.overdue).sort((a,b)=>b.priority.score-a.priority.score).slice(0,4).map(h=><button className="attention-row" key={h.id} onClick={()=>openCase(h.id)}><span className={`severity-bar ${h.priority.band.toLowerCase()}`}/><span className="attention-copy"><b>{h.code} · {h.label}</b><small>{h.ward} · {h.report_count} reports {h.overdue?'· Overdue':''}</small></span><span className="score-chip">{h.priority.score}</span></button>)}
       {hotspots.filter(h=>h.priority.band==='CRITICAL'||h.priority.band==='HIGH'||h.overdue).length===0&&<Empty title="No urgent hotspots" text="No current high-priority sample cases."/>}
       <button className="panel-bottom-link" onClick={()=>onNavigate('hotspots')}>Open hotspot queue <ArrowRight size={14}/></button>
     </section><section className="panel task-shortlist"><div className="panel-header"><div><h2>Field queue</h2><p>Tasks requiring field or review action</p></div><button className="icon-btn" title="Open tasks" onClick={()=>onNavigate('tasks')}><ArrowRight size={17}/></button></div>
       {tasks.filter(t=>t.status!=='VERIFIED_RESOLVED').sort((a,b)=>a.due_at.localeCompare(b.due_at)).slice(0,3).map(t=><div className="mini-task" key={t.id}><div className={`task-symbol ${t.status.toLowerCase()}`}>{t.status==='AWAITING_VERIFICATION'?<ShieldCheck size={16}/>:<Truck size={16}/>}</div><div className="mini-task-copy"><b>{t.code} · {t.hotspot_code}</b><small>{nice(t.status)} · {t.assigned_worker}</small></div><span className={new Date(t.due_at)<new Date()?'overdue-text':'muted-text'}>{dueLabel(t.due_at)}</span></div>)}
       <button className="panel-bottom-link" onClick={()=>onNavigate('tasks')}>Open field queue <ArrowRight size={14}/></button>
     </section></div>
   </div>

   <section className="panel decision-board">
     <div className="panel-header decision-board-header"><div><div className="eyebrow green">RECURSCOPE SIGNATURE WORKFLOW</div><h2>Recurrence decision board</h2><p>Classify the evidence first. A closed cleanup task is not proof that prevention worked.</p></div><button className="btn btn-primary btn-small" onClick={onOpenReport}><Plus size={15}/> Report an incident</button></div>
     <div className="decision-rule"><span><b>01</b> Report</span><ArrowRight size={14}/><span><b>02</b> Verify cleanup</span><ArrowRight size={14}/><span><b>03</b> Observe later</span><ArrowRight size={14}/><span><b>04</b> Decide return</span><ArrowRight size={14}/><span><b>05</b> Track prevention</span></div>
     <div className="decision-lanes">
       <div className="decision-lane lane-review"><div className="decision-lane-head"><span className="decision-step">A</span><div><h3>Possible return</h3><p>After-cleanup incident · review needed</p></div><b className="decision-count">{possibleReturns.length}</b></div>
         {possibleReturns.slice(0,3).map(h=><button className="decision-case" key={h.id} onClick={()=>openCase(h.id)}><span className="decision-case-main"><b>{h.code} · {h.label}</b><small>{h.ward} · {h.report_count} reports</small></span><span className="decision-case-action">Review <ArrowRight size={13}/></span></button>)}
         {!possibleReturns.length&&<div className="decision-empty"><CheckCircle2 size={16}/><span>No case awaiting return review. New post-cleanup reports will appear here.</span></div>}
       </div>
       <div className="decision-lane lane-persistent"><div className="decision-lane-head"><span className="decision-step">B</span><div><h3>Persistent / unresolved</h3><p>Not yet proven clear</p></div><b className="decision-count">{persistent.length}</b></div>
         {persistent.slice(0,3).map(h=><button className="decision-case" key={h.id} onClick={()=>openCase(h.id)}><span className="decision-case-main"><b>{h.code} · {h.label}</b><small>{h.report_count} reports · no verified cleanup</small></span><span className="decision-case-action">Assign <ArrowRight size={13}/></span></button>)}
         {!persistent.length&&<div className="decision-empty"><CheckCircle2 size={16}/><span>No multi-report unresolved case in the current records.</span></div>}
       </div>
       <div className="decision-lane lane-confirmed"><div className="decision-lane-head"><span className="decision-step">C</span><div><h3>Confirmed recurrence</h3><p>Later evidence accepted by reviewer</p></div><b className="decision-count">{confirmed.length}</b></div>
         {confirmed.slice(0,3).map(h=><button className="decision-case" key={h.id} onClick={()=>openCase(h.id)}><span className="decision-case-main"><b>{h.code} · {h.label}</b><small>{h.recurrence_count} confirmed return{h.recurrence_count===1?'':'s'} · priority {h.priority.score}</small></span><span className="decision-case-action">Intervene <ArrowRight size={13}/></span></button>)}
         {!confirmed.length&&<div className="decision-empty"><CheckCircle2 size={16}/><span>No confirmed post-cleanup return is recorded yet.</span></div>}
       </div>
       <div className="decision-lane lane-prevention"><div className="decision-lane-head"><span className="decision-step">D</span><div><h3>Intervention ledger</h3><p>Action completion ≠ effectiveness</p></div><b className="decision-count">{openInterventions.length}</b></div>
         {openInterventions.slice(0,3).map(i=><button className="decision-case" key={i.id} onClick={()=>onNavigate('interventions')}><span className="decision-case-main"><b>{i.hotspot_code||`Hotspot ${i.hotspot_id}`} · {nice(i.action_type)}</b><small>{i.owner} · due {fmtDate(i.due_at)}</small><em>{preventionOutcome(i.id,i.follow_up_dates)}</em><span className="decision-window-pills">{i.follow_up_dates.map(d=><small key={d}>{d}d: {nice(followupState(i.id,d))}</small>)}</span></span><ArrowRight size={14}/></button>)}
         {!openInterventions.length&&<div className="decision-empty"><Workflow size={16}/><span>No open preventive action. Create one after reviewing a confirmed return.</span></div>}
         <button className="panel-bottom-link decision-open-ledger" onClick={()=>onNavigate('interventions')}>Open full intervention ledger <ArrowRight size={14}/></button>
       </div>
     </div>
     <div className="decision-integrity"><ShieldCheck size={16}/><span>Decision rule: reports before a verified cleanup stay unresolved. A later incident becomes confirmed recurrence only after evidence review. “Not observed” never means “no return”.</span></div>
   </section>

   <div className="overview-bottom-grid">
     <section className="panel"><div className="panel-header"><div><h2>Hotspot record directory</h2><p>Location records, not isolated complaint counts</p></div><button className="text-link" onClick={()=>onNavigate('hotspots')}>All passports <ArrowRight size={14}/></button></div><HotspotTable hotspots={hotspots.slice(0,5)} selectedId={selectedId} onSelect={onSelect}/></section>
     <section className="panel passport-panel"><div className="panel-header"><div><h2>Hotspot passport</h2><p>Selected location · evidence timeline and next action</p></div><span className="passport-stamp">{selected?.code||'SELECT'}</span></div>
       {selected&&passport?<PassportCompact passport={passport} user={user} onConfirmRecurrence={onConfirmRecurrence} onRecordFollowup={onRecordFollowup} onCreateIntervention={onCreateIntervention} onAttachReportEvidence={onAttachReportEvidence} busy={busy}/>:<Empty title="Select a hotspot" text="Choose a row or map marker to inspect a location."/>}
     </section>
   </div>
 </>
}
function HotspotTable({hotspots,selectedId,onSelect}:{hotspots:Hotspot[];selectedId:number|null;onSelect:(id:number)=>void}){
 return <div className="table-wrap"><table className="data-table"><thead><tr><th>Location</th><th>Reports</th><th>Priority</th><th>Status</th><th></th></tr></thead><tbody>{hotspots.map(h=><tr key={h.id} className={h.id===selectedId?'row-selected':''} onClick={()=>onSelect(h.id)}><td><div className="location-cell"><span className={`location-marker ${h.priority.band.toLowerCase()}`}/><div><b>{h.code} · {h.label}</b><small>{h.ward}</small></div></div></td><td>{h.report_count}</td><td><span className={`score-label ${h.priority.band.toLowerCase()}`}>{h.priority.score} <small>{h.priority.band}</small></span></td><td><StatusPill value={h.status}/></td><td><ArrowRight size={15} className="row-arrow"/></td></tr>)}</tbody></table></div>
}
function StatusPill({value}:{value:string}){const color=value==='RECURRENCE_CONFIRMED'||value==='INTERVENTION_OPEN'?'coral':value==='VERIFIED_RESOLVED'||value==='MONITORING'?'green':value==='POSSIBLE_RETURN'||value==='OVERDUE'?'amber':'slate';return <span className={`status-pill-small ${color}`}>{nice(value)}</span>}
function Empty({title,text}:{title:string;text:string}){return <div className="empty-state"><div className="empty-icon"><CircleHelp size={20}/></div><b>{title}</b><p>{text}</p></div>}

function PassportCompact({passport,user,onConfirmRecurrence,onRecordFollowup,onCreateIntervention,onAttachReportEvidence,busy}:{passport:Passport;user:User;onConfirmRecurrence:(h:number,r:number)=>void;onRecordFollowup:(h:number,f:FormData)=>void;onCreateIntervention:(h:number,b:unknown)=>void;onAttachReportEvidence:(h:number,r:number,f:FormData)=>void;busy:boolean}){
 const [followOpen,setFollowOpen]=useState(false);const [interventionOpen,setInterventionOpen]=useState(false)
 const h=passport.hotspot
 return <div className="passport-compact">
   <div className="passport-location"><div className="passport-pin"><MapPin size={17}/></div><div><b>{h.label}</b><small>{h.ward} · {h.code}</small></div><StatusPill value={h.status}/></div>
   <div className="passport-metrics"><div><small>Priority score</small><b>{h.priority.score}<span>/100</span></b></div><div><small>Reports</small><b>{h.report_count}</b></div><div><small>Returns</small><b>{h.recurrence_count}</b></div></div>
   <div className="score-explainer"><div className="score-track"><span style={{width:`${h.priority.score}%`}}/></div><span>{h.priority.band} priority</span></div>
   <div className="ledger-label"><span>RECENT TIMELINE</span><button className="text-link mini" onClick={()=>setInterventionOpen(v=>!v)}>{interventionOpen?'Close':'Add action'}</button></div>
   <div className="timeline">{passport.events.slice(0,3).map(e=><div className="timeline-item" key={e.id}><span className={`timeline-dot ${e.event_type.includes('RECURRENCE')?'dot-coral':e.event_type.includes('CLEANUP')?'dot-green':'dot-teal'}`}/><div><b>{nice(e.event_type)}</b><small>{e.notes}</small><em>{fmtTime(e.created_at)}</em></div></div>)}</div>
   {passport.possible_return_reports.length>0&&user.role==='admin'&&<div className="return-alert"><div><b>Possible post-cleanup return</b><small>Human review required; verify the event chronology before confirming.</small></div>{passport.possible_return_reports.slice(0,1).map(r=><div className="return-alert-actions" key={r.id}>{r.photo_key?<div className="return-alert-inline"><EvidenceThumb label="Observed incident" keyName={r.photo_key}/><button className="btn btn-coral btn-small" disabled={busy} onClick={()=>onConfirmRecurrence(h.id,r.id)}>Confirm return</button></div>:<EvidenceUploadButton reportId={r.id} hotspotId={h.id} onUpload={onAttachReportEvidence} busy={busy}/>}</div>)}</div>}
   {interventionOpen&&user.role==='admin'&&<InterventionMiniForm hotspotId={h.id} onSubmit={(body)=>{onCreateIntervention(h.id,body);setInterventionOpen(false)}} busy={busy}/>}
   {followOpen&&<FollowupMiniForm hotspotId={h.id} interventions={passport.interventions} onSubmit={(form)=>{onRecordFollowup(h.id,form);setFollowOpen(false)}} busy={busy}/>}
   <div className="passport-actions"><button className="btn btn-secondary btn-small" onClick={()=>setFollowOpen(v=>!v)}><CalendarClock size={14}/>{followOpen?'Cancel follow-up':'Record follow-up'}</button><span className="mini-muted">7 / 30-day observation</span></div>
   {passport.interventions[0]&&<div className="active-intervention"><div className="active-intervention-icon"><Workflow size={15}/></div><div><b>{nice(passport.interventions[0].action_type)}</b><small>{passport.interventions[0].owner} · due {fmtDate(passport.interventions[0].due_at)}</small></div><StatusPill value={passport.interventions[0].status}/></div>}
 </div>
}
function InterventionMiniForm({hotspotId,onSubmit,busy}:{hotspotId:number;onSubmit:(body:unknown)=>void;busy:boolean}){
 const [hypothesis,setHypothesis]=useState('MISSED_PICKUP_WINDOW');const [action,setAction]=useState('PICKUP_ESCALATION');const [owner,setOwner]=useState('Ward Supervisor');const [rationale,setRationale]=useState('Operational logs should be checked to confirm whether the scheduled pickup was missed.');const [due,setDue]=useState(new Date(Date.now()+2*86400000).toISOString().slice(0,16))
 return <form className="mini-form" onSubmit={e=>{e.preventDefault();onSubmit({hypothesis_code:hypothesis,rationale,action_type:action,owner,due_at:new Date(due).toISOString(),follow_up_dates:[7,30]})}}>
   <div className="mini-form-title">Open preventive action <small>Cause is a hypothesis unless verified.</small></div>
   <label>Cause hypothesis<select value={hypothesis} onChange={e=>setHypothesis(e.target.value)}><option value="MISSED_PICKUP_WINDOW">Missed pickup window</option><option value="COLLECTION_FREQUENCY">Collection frequency may be insufficient</option><option value="PLACEMENT_ACCESS">Waste placement / access issue</option><option value="MIXED_WASTE">Source segregation gap</option><option value="RECYCLING_HANDOFF">Recycler handoff gap</option></select></label>
   <label>Preventive action<select value={action} onChange={e=>setAction(e.target.value)}><option value="PICKUP_ESCALATION">Pickup escalation</option><option value="SCHEDULE_REVIEW">Schedule review</option><option value="BIN_PLACEMENT_REVIEW">Bin / signage review</option><option value="SEGREGATION_FOLLOWUP">Segregation follow-up</option><option value="MRF_HANDOFF">Approved MRF handoff</option></select></label>
   <label>Rationale<textarea value={rationale} onChange={e=>setRationale(e.target.value)} rows={2} required/></label><div className="form-row"><label>Owner<input value={owner} onChange={e=>setOwner(e.target.value)} required/></label><label>Due date<input type="datetime-local" value={due} onChange={e=>setDue(e.target.value)} required/></label></div>
   <button className="btn btn-primary btn-small" disabled={busy}><Plus size={14}/> Save action</button>
 </form>
}
function FollowupMiniForm({hotspotId,interventions,onSubmit,busy}:{hotspotId:number;interventions:Intervention[];onSubmit:(form:FormData)=>void;busy:boolean}){
 const [windowDays,setWindowDays]=useState('7');const [state,setState]=useState('INSUFFICIENT_FOLLOWUP');const [notes,setNotes]=useState('');const [interventionId,setInterventionId]=useState('')
 const available=interventions.filter(i=>i.status!=='CANCELLED')
 return <form className="mini-form" onSubmit={e=>{e.preventDefault();const f=new FormData();f.append('window_days',windowDays);f.append('observed_state',state);f.append('notes',notes);if(interventionId)f.append('intervention_id',interventionId);const photo=(e.currentTarget.elements.namedItem('followup-photo') as HTMLInputElement|null)?.files?.[0];if(photo)f.append('photo',photo);onSubmit(f)}}>
   <div className="mini-form-title">Follow-up observation <small>Update a scheduled action window when linked; record only what was observed.</small></div>
   {available.length>0&&<label>Link to preventive action<select value={interventionId} onChange={e=>setInterventionId(e.target.value)}><option value="">General hotspot observation</option>{available.map(i=><option key={i.id} value={i.id}>{nice(i.action_type)} · {i.owner}</option>)}</select></label>}
   <div className="form-row"><label>Window<select value={windowDays} onChange={e=>setWindowDays(e.target.value)}><option value="7">7-day</option><option value="30">30-day</option></select></label><label>Outcome<select value={state} onChange={e=>setState(e.target.value)}><option value="NO_RETURN">No return observed</option><option value="POSSIBLE_RETURN">Possible return</option><option value="CONFIRMED_RETURN">Return signal observed</option><option value="INSUFFICIENT_FOLLOWUP">Insufficient evidence</option></select></label></div>
   <label>Inspection notes<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="What was observed, and what evidence supports it?" required/></label>
   <label>Inspection photo (optional)<input type="file" name="followup-photo" accept="image/jpeg,image/png,image/webp"/></label>
   <button className="btn btn-primary btn-small" disabled={busy}><Check size={14}/> Save observation</button>
 </form>
}

function HotspotsPage(props:{hotspots:Hotspot[];allHotspots:Hotspot[];allCount:number;selectedId:number|null;selected:Hotspot|null;passport:Passport|null;search:string;statusFilter:string;wardFilter:string;priorityFilter:string;ageFilter:string;setSearch:(v:string)=>void;setStatusFilter:(v:string)=>void;setWardFilter:(v:string)=>void;setPriorityFilter:(v:string)=>void;setAgeFilter:(v:string)=>void;onSelect:(id:number)=>void;user:User;pilot:PilotConfig;onConfirmRecurrence:(h:number,r:number)=>void;onRecordFollowup:(h:number,f:FormData)=>void;onCreateIntervention:(h:number,b:unknown)=>void;onAttachReportEvidence:(h:number,r:number,f:FormData)=>void;busy:boolean}){
 const {hotspots,allHotspots,allCount,selectedId,selected,passport,search,statusFilter,wardFilter,priorityFilter,ageFilter,setSearch,setStatusFilter,setWardFilter,setPriorityFilter,setAgeFilter,onSelect,user,pilot,onConfirmRecurrence,onRecordFollowup,onCreateIntervention,onAttachReportEvidence,busy}=props
 return <div className="hotspot-layout">
   <section className="panel hotspot-map-card"><div className="panel-header"><div><h2>Geospatial overview</h2><p>Each marker retains a canonical hotspot identity</p></div><div className="map-count"><MapPinned size={16}/>{allCount} locations</div></div><MapView hotspots={hotspots} selectedId={selectedId} onSelect={onSelect} defaultCenter={[pilot.latitude, pilot.longitude]}/><div className="map-bottom-row"><span>Candidate radius: 100 m</span><span>Pilot area: {pilot.name} ({pilot.radius_km} km)</span><span className="sample-inline"><i/> Pilot context</span></div></section>
   <section className="panel hotspots-list-card"><div className="panel-header"><div><h2>Hotspot directory</h2><p>{hotspots.length} of {allCount} locations</p></div><Filter size={17} className="muted-icon"/></div><div className="filter-row"><div className="search-box"><Search size={15}/><input placeholder="Search code, location…" value={search} onChange={e=>setSearch(e.target.value)}/></div><select value={wardFilter} onChange={e=>setWardFilter(e.target.value)}><option value="ALL">All wards</option>{[...new Set(allHotspots.map(h=>h.ward))].sort().map(w=><option key={w} value={w}>{w}</option>)}</select><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ALL">All statuses</option>{['ACTIVE','OVERDUE','UNRESOLVED','POSSIBLE_RETURN','RECURRENCE_CONFIRMED','INTERVENTION_OPEN','VERIFIED_RESOLVED','MONITORING'].map(s=><option key={s} value={s}>{nice(s)}</option>)}</select><select value={priorityFilter} onChange={e=>setPriorityFilter(e.target.value)}><option value="ALL">All priorities</option>{['ROUTINE','MONITOR','HIGH','CRITICAL'].map(s=><option key={s} value={s}>{nice(s)}</option>)}</select><select value={ageFilter} onChange={e=>setAgeFilter(e.target.value)}><option value="ALL">Any age</option><option value="24H">Last 24 hours</option><option value="7D">Last 7 days</option><option value="30D">Last 30 days</option></select></div><div className="directory-list">{hotspots.map(h=><button key={h.id} className={`directory-row ${selectedId===h.id?'directory-selected':''}`} onClick={()=>onSelect(h.id)}><span className={`location-marker ${h.priority.band.toLowerCase()}`}/><span className="directory-copy"><b>{h.code} · {h.label}</b><small>{h.ward} · {h.report_count} reports · {h.open_task_count} open tasks</small></span><span className={`directory-score ${h.priority.band.toLowerCase()}`}>{h.priority.score}</span></button>)}{hotspots.length===0&&<Empty title="No matching hotspots" text="Change the search or status filter."/>}</div></section>
   <section className="panel hotspot-passport-wide"><div className="panel-header"><div><h2>Hotspot Passport</h2><p>Incident timeline, cleanup evidence and recurrence decisions</p></div>{selected&&<span className="passport-stamp">{selected.code}</span>}</div>{passport?<PassportFull passport={passport} user={user} onConfirmRecurrence={onConfirmRecurrence} onRecordFollowup={onRecordFollowup} onCreateIntervention={onCreateIntervention} onAttachReportEvidence={onAttachReportEvidence} busy={busy}/>:<Empty title="Select a location" text="Choose a marker or directory record."/>}</section>
 </div>
}
const maxScore:Record<string,number>={verified_returns:30,incident_frequency:20,overdue_or_missed_pickup:15,severity_or_handling:15,time_to_return:15,segregation_or_handoff_gap:5}
function PassportFull({passport,user,onConfirmRecurrence,onRecordFollowup,onCreateIntervention,onAttachReportEvidence,busy}:{passport:Passport;user:User;onConfirmRecurrence:(h:number,r:number)=>void;onRecordFollowup:(h:number,f:FormData)=>void;onCreateIntervention:(h:number,b:unknown)=>void;onAttachReportEvidence:(h:number,r:number,f:FormData)=>void;busy:boolean}){
 const [tab,setTab]=useState<'timeline'|'reports'|'followups'>('timeline');const [followOpen,setFollowOpen]=useState(false);const [actionOpen,setActionOpen]=useState(false);const h=passport.hotspot
 return <div className="passport-full">
   <div className="passport-summary-head"><div className="passport-summary-title"><div className="passport-pin large"><MapPin size={20}/></div><div><h3>{h.label}</h3><p>{h.ward} · {h.code} · {h.latitude.toFixed(5)}, {h.longitude.toFixed(5)}</p></div><StatusPill value={h.status}/></div><div className="passport-summary-metrics"><div><small>Operational priority</small><b>{h.priority.score}<span>/100</span></b></div><div><small>Incident reports</small><b>{h.report_count}</b></div><div><small>Confirmed returns</small><b>{h.recurrence_count}</b></div><div><small>Verified cleanup</small><b className="date-value">{fmtDate(h.last_verified_cleanup_at)}</b></div></div></div>
   <div className="priority-breakdown"><div className="priority-breakdown-head"><b>Explainable priority score</b><span>{h.priority.band} · prototype rules</span></div><div className="priority-components">{Object.entries(h.priority.components).map(([k,v])=><div key={k}><span>{nice(k)}</span><div className="component-track"><i style={{width:`${Math.min(100,(v/(h.priority.maxima?.[k]||maxScore[k]||1))*100)}%`}}/></div><b>{v}</b></div>)}</div><p>{h.priority.basis}</p></div>
   {passport.possible_return_reports.length>0&&user.role==='admin'&&<div className="return-alert"><div><b>Possible post-cleanup return</b><small>Human review required; verify the event chronology before confirming.</small></div>{passport.possible_return_reports.map(r=><div className="return-alert-actions" key={r.id}>{r.photo_key?<div className="return-alert-inline"><EvidenceThumb label="Observed incident" keyName={r.photo_key}/><button className="btn btn-coral btn-small" disabled={busy} onClick={()=>onConfirmRecurrence(h.id,r.id)}>Confirm return</button></div>:<EvidenceUploadButton reportId={r.id} hotspotId={h.id} onUpload={onAttachReportEvidence} busy={busy}/>}</div>)}</div>}
    <div className="subtabs"><button className={tab==='timeline'?'subtab-active':''} onClick={()=>setTab('timeline')}>Event timeline <span>{passport.events.length}</span></button><button className={tab==='reports'?'subtab-active':''} onClick={()=>setTab('reports')}>Incident reports <span>{passport.reports.length}</span></button><button className={tab==='followups'?'subtab-active':''} onClick={()=>setTab('followups')}>Follow-up <span>{passport.followups.length}</span></button></div>
   {tab==='timeline'&&<div className="full-timeline">{passport.events.map(e=><div className="full-timeline-row" key={e.id}><div className="timeline-date">{fmtDate(e.created_at)}<small>{new Date(e.created_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</small></div><div className={`event-marker ${e.event_type.includes('RECURRENCE')?'coral':e.event_type.includes('CLEANUP')?'green':'teal'}`}/><div className="event-details"><b>{nice(e.event_type)}</b><p>{e.notes}</p><small>{e.actor}{e.is_demo?' · simulated':''}</small></div></div>)}{passport.events.length===0&&<Empty title="No recorded events" text="New actions will appear here."/>}</div>}
   {tab==='reports'&&<div className="table-wrap"><table className="data-table reports-table"><thead><tr><th>Reported</th><th>Issue</th><th>Verification</th><th>Evidence</th><th>Review</th></tr></thead><tbody>{passport.reports.map(r=><tr key={r.id}><td>{fmtTime(r.created_at)}{r.is_demo&&<small className="table-subnote">Sample record</small>}</td><td><b>{nice(r.issue_type)}</b><small>{r.description}</small></td><td><StatusPill value={r.verification_state}/></td><td>{r.photo_key?<div className="report-evidence-cell"><EvidenceThumb label="Incident photo" keyName={r.photo_key}/></div>:<span className="muted-text">Missing</span>}</td><td>{user.role==='admin'&&r.verification_state==='POSSIBLE_RETURN'&&r.photo_key&&<button className="btn btn-coral btn-small" onClick={()=>onConfirmRecurrence(h.id,r.id)} disabled={busy}>Confirm return</button>}{user.role==='admin'&&r.verification_state==='POSSIBLE_RETURN'&&!r.photo_key&&<EvidenceUploadButton reportId={r.id} hotspotId={h.id} onUpload={onAttachReportEvidence} busy={busy}/> }{user.role==='admin'&&r.verification_state==='UNVERIFIED'&&h.last_verified_cleanup_at&&new Date(r.created_at)>new Date(h.last_verified_cleanup_at)&&r.photo_key&&<button className="btn btn-secondary btn-small" onClick={()=>onConfirmRecurrence(h.id,r.id)} disabled={busy}>Review return</button>}</td></tr>)}</tbody></table></div>}
   {tab==='followups'&&<div className="followup-list">{passport.followups.map(f=><div className="followup-row" key={f.id}><div className="followup-window"><b>{f.window_days}</b><small>DAY</small></div><div className="followup-main"><b>{fmtDate(f.scheduled_at)} · {nice(f.observed_state)}</b><p>{f.notes||'No inspection notes recorded yet.'}</p></div><StatusPill value={f.observed_state}/></div>)}{passport.followups.length===0&&<Empty title="No follow-ups scheduled" text="Verify a cleanup to schedule 7-day and 30-day observations."/>}</div>}
   <div className="passport-full-actions">{user.role==='admin'&&<button className="btn btn-primary btn-small" onClick={()=>setActionOpen(v=>!v)}><Plus size={14}/> Open preventive action</button>}<button className="btn btn-secondary btn-small" onClick={()=>setFollowOpen(v=>!v)}><CalendarClock size={14}/> Record observation</button><span className="mini-muted">Closure records cleanup, not permanent prevention.</span></div>
   {actionOpen&&<InterventionMiniForm hotspotId={h.id} onSubmit={body=>{onCreateIntervention(h.id,body);setActionOpen(false)}} busy={busy}/>}
   {followOpen&&<FollowupMiniForm hotspotId={h.id} interventions={passport.interventions} onSubmit={form=>{onRecordFollowup(h.id,form);setFollowOpen(false)}} busy={busy}/>}
 </div>
}

function EvidenceUploadButton({reportId,hotspotId,onUpload,busy}:{reportId:number;hotspotId:number;onUpload:(h:number,r:number,f:FormData)=>void;busy:boolean}){
 const [error,setError]=useState('')
 return <div className="evidence-upload-control"><label className="btn btn-secondary btn-small evidence-upload-label"><Camera size={14}/> Attach evidence<input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.currentTarget.value='';if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setError('Use JPG, PNG or WebP.');return}if(file.size>5*1024*1024){setError('Image must be 5 MB or smaller.');return}setError('');const form=new FormData();form.append('photo',file);onUpload(hotspotId,reportId,form)}}/></label>{error&&<small className="file-error">{error}</small>}</div>
}

function EvidenceThumb({label,keyName}:{label:string;keyName:string|null}){
 const [url,setUrl]=useState<string|null>(null)
 useEffect(()=>{
   let objectUrl:string|undefined;let cancelled=false
   if(!keyName||!keyName.endsWith('.jpg')){setUrl(null);return ()=>{cancelled=true}}
   fetch(`${API_BASE}/api/evidence/${keyName}`,{headers:{Authorization:`Bearer ${getToken()}`}})
     .then(r=>{if(!r.ok)throw new Error('Evidence unavailable');return r.blob()})
     .then(blob=>{if(!cancelled){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl)}})
     .catch(()=>{if(!cancelled)setUrl(null)})
   return ()=>{cancelled=true;if(objectUrl)URL.revokeObjectURL(objectUrl)}
 },[keyName])
 if(!keyName)return <div className="evidence-thumb missing"><Camera size={14}/><span>{label}<small>Not submitted</small></span></div>
 if(!keyName.endsWith('.jpg'))return <div className="evidence-thumb sample"><FileCheck2 size={14}/><span>{label}<small>Sample evidence reference</small></span></div>
 return <div className="evidence-thumb"><div className="evidence-thumb-image">{url?<img src={url} alt={label}/>:<Camera size={15}/>}</div><span>{label}<small>{url?'Stored image':'Loading protected evidence…'}</small></span></div>
}

function TasksPage({tasks,hotspots,workers,user,busy,onCreate,onUpdate,onStart,onEvidence,onFinish,onVerify}:{tasks:Task[];hotspots:Hotspot[];workers:User[];user:User;busy:boolean;onCreate:(body:unknown)=>void;onUpdate:(id:number,body:unknown)=>void;onStart:(t:Task)=>void;onEvidence:(t:Task,k:'before'|'after',f:File)=>void;onFinish:(t:Task)=>void;onVerify:(t:Task,a:boolean,notes?:string)=>void}){
 const [filter,setFilter]=useState('OPEN');const [createOpen,setCreateOpen]=useState(false);const [hotspotId,setHotspotId]=useState(hotspots[0]?.id||0);const [workerId,setWorkerId]=useState(workers[0]?.id||0);const [due,setDue]=useState(new Date(Date.now()+86400000).toISOString().slice(0,16));const [stream,setStream]=useState('MIXED_UNKNOWN');const [notes,setNotes]=useState('')
 useEffect(()=>{if(!hotspots.some(h=>h.id===hotspotId)&&hotspots[0])setHotspotId(hotspots[0].id)},[hotspots,hotspotId]);useEffect(()=>{if(!workers.some(w=>w.id===workerId)&&workers[0])setWorkerId(workers[0].id)},[workers,workerId])
 const visible=tasks.filter(t=>filter==='ALL'||(filter==='OPEN'&&!['VERIFIED_RESOLVED'].includes(t.status))||t.status===filter).sort((a,b)=>a.due_at.localeCompare(b.due_at))
 return <div className="tasks-page">
   <div className="section-toolbar"><div className="filter-pills"><button className={filter==='OPEN'?'filter-pill-active':''} onClick={()=>setFilter('OPEN')}>Open <span>{tasks.filter(t=>t.status!=='VERIFIED_RESOLVED').length}</span></button><button className={filter==='AWAITING_VERIFICATION'?'filter-pill-active':''} onClick={()=>setFilter('AWAITING_VERIFICATION')}>Review <span>{tasks.filter(t=>t.status==='AWAITING_VERIFICATION').length}</span></button><button className={filter==='VERIFIED_RESOLVED'?'filter-pill-active':''} onClick={()=>setFilter('VERIFIED_RESOLVED')}>Verified <span>{tasks.filter(t=>t.status==='VERIFIED_RESOLVED').length}</span></button><button className={filter==='ALL'?'filter-pill-active':''} onClick={()=>setFilter('ALL')}>All tasks</button></div>{user.role==='admin'&&<button className="btn btn-primary" onClick={()=>setCreateOpen(v=>!v)}><Plus size={16}/>{createOpen?'Close form':'Assign collection task'}</button>}</div>
   {createOpen&&user.role==='admin'&&<section className="panel create-task-panel"><div className="panel-header"><div><h2>Create a field task</h2><p>Give a worker ownership and a clear due time.</p></div><button className="icon-btn" onClick={()=>setCreateOpen(false)}><X size={17}/></button></div><form className="task-create-form" onSubmit={e=>{e.preventDefault();onCreate({hotspot_id:Number(hotspotId),assigned_worker_id:workerId?Number(workerId):null,due_at:new Date(due).toISOString(),notes,stream});setCreateOpen(false)}}><label>Hotspot<select value={hotspotId} onChange={e=>setHotspotId(Number(e.target.value))}>{hotspots.map(h=><option key={h.id} value={h.id}>{h.code} · {h.label}</option>)}</select></label><label>Assigned worker<select value={workerId} onChange={e=>setWorkerId(Number(e.target.value))}>{workers.map(w=><option key={w.id} value={w.id}>{w.display_name}</option>)}</select></label><label>Waste stream<select value={stream} onChange={e=>setStream(e.target.value)}>{STREAMS.map(s=><option key={s} value={s}>{nice(s)}</option>)}</select></label><label>Due date & time<input type="datetime-local" value={due} onChange={e=>setDue(e.target.value)} required/></label><label className="wide-field">Work notes<input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Pickup, access issue or handling note"/></label><button className="btn btn-primary" disabled={busy}><ClipboardCheck size={16}/> Create task</button></form></section>}
   <div className="task-cards">{visible.map(t=><TaskCard key={t.id} task={t} hotspots={hotspots} workers={workers} user={user} busy={busy} onUpdate={onUpdate} onStart={onStart} onEvidence={onEvidence} onFinish={onFinish} onVerify={onVerify}/>)}{visible.length===0&&<section className="panel"><Empty title="No tasks in this view" text="Change the filter or create a collection task for a hotspot."/></section>}</div>
   <div className="workflow-note"><ShieldCheck size={18}/><div><b>Verification gate</b><span>Only an authorised supervisor can verify cleanup. The system records evidence first, then schedules 7-day and 30-day follow-up.</span></div></div>
 </div>
}
function TaskCard({task,hotspots,workers,user,busy,onUpdate,onStart,onEvidence,onFinish,onVerify}:{task:Task;hotspots:Hotspot[];workers:User[];user:User;busy:boolean;onUpdate:(id:number,body:unknown)=>void;onStart:(t:Task)=>void;onEvidence:(t:Task,k:'before'|'after',f:File)=>void;onFinish:(t:Task)=>void;onVerify:(t:Task,a:boolean,notes?:string)=>void}){
 const [kind,setKind]=useState<'before'|'after'>(task.status==='IN_PROGRESS'?'after':'before');const [file,setFile]=useState<File|null>(null);const [reviewNotes,setReviewNotes]=useState('')
 const hotspot=hotspots.find(h=>h.id===task.hotspot_id);const assignedToMe=user.role==='worker'&&task.assigned_worker_id===user.id;const canOperate=user.role==='admin'||assignedToMe
 const duePast=new Date(task.due_at)<new Date()&&!['VERIFIED_RESOLVED'].includes(task.status)
 return <section className={`panel task-card ${duePast?'task-overdue':''}`}>
   <div className="task-card-top"><div className={`task-card-icon ${task.status.toLowerCase()}`}>{task.status==='AWAITING_VERIFICATION'?<ShieldCheck size={20}/>:task.status==='VERIFIED_RESOLVED'?<CheckCircle2 size={20}/>:<Truck size={20}/>}</div><div className="task-title"><div><b>{task.code} <span>· {task.hotspot_code}</span></b><StatusPill value={task.status}/></div><h3>{task.hotspot_label}</h3><p>{task.ward} · {nice(task.stream)} waste stream</p></div><span className={duePast?'deadline overdue-text':'deadline'}><Clock3 size={14}/>{dueLabel(task.due_at)}</span></div>
   <div className="task-meta-grid"><div><small>Assigned to</small><b>{task.assigned_worker}</b></div><div><small>Due date</small><b>{fmtTime(task.due_at)}</b></div><div><small>Evidence</small><b className="evidence-count"><span className={task.before_key?'evidence-ok':''}>{task.before_key?'✓':'○'} Before</span><span className={task.after_key?'evidence-ok':''}>{task.after_key?'✓':'○'} After</span></b></div></div>
   <div className="evidence-previews"><EvidenceThumb label="Before evidence" keyName={task.before_key}/><EvidenceThumb label="After evidence" keyName={task.after_key}/></div>
   {task.notes&&<div className="task-notes"><b>Work notes</b><p>{task.notes}</p></div>}
   {task.status==='AWAITING_VERIFICATION'&&user.role==='admin'&&<div className="review-box"><div className="review-box-title"><ShieldCheck size={17}/><b>Human review required</b></div><p>Check the after-photo, recorded location and timestamp. Approval marks this cleanup as verified; it does not prove the hotspot will stay clean.</p><label>Review notes<textarea value={reviewNotes} onChange={e=>setReviewNotes(e.target.value)} rows={2} placeholder="Optional reviewer note"/></label><div className="review-actions"><button className="btn btn-coral btn-small" disabled={busy} onClick={()=>onVerify(task,false,reviewNotes)}>Reject & request more evidence</button><button className="btn btn-primary btn-small" disabled={busy} onClick={()=>onVerify(task,true,reviewNotes)}><CheckCircle2 size={15}/> Verify cleanup</button></div></div>}
   {task.status==='ASSIGNED'&&canOperate&&<div className="task-controls"><button className="btn btn-primary btn-small" disabled={busy} onClick={()=>onStart(task)}><ArrowRight size={15}/> Start task</button><span className="mini-muted">Add the before-photo below, then start field work.</span></div>}
   {(task.status==='IN_PROGRESS'||task.status==='ASSIGNED')&&canOperate&&<div className="evidence-upload"><div className="evidence-upload-head"><div><Camera size={17}/><b>Field evidence</b></div><span>Photo is timestamped; location must be near the hotspot.</span></div><div className="evidence-form-row"><select value={kind} onChange={e=>setKind(e.target.value as 'before'|'after')}><option value="before">Before photo</option><option value="after" disabled={task.status==='ASSIGNED'}>After photo (start task first)</option></select><label className="file-pick"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0]||null)}/><Camera size={15}/>{file?file.name:'Choose image'}</label><button className="btn btn-secondary btn-small" disabled={!file||busy} onClick={()=>{if(file){onEvidence(task,kind,file);setFile(null)}}}>Upload</button></div>{task.status==='IN_PROGRESS'&&<div className="task-controls"><button className="btn btn-primary btn-small" disabled={!task.before_key||!task.after_key||busy} onClick={()=>onFinish(task)}><FileCheck2 size={15}/> Submit for review</button><span className="mini-muted">Before + after evidence required.</span></div>}</div>}
   {task.status==='ASSIGNED'&&user.role==='admin'&&<div className="task-controls admin-assign"><label>Reassign<select value={task.assigned_worker_id||''} onChange={e=>onUpdate(task.id,{assigned_worker_id:Number(e.target.value)})}>{workers.map(w=><option key={w.id} value={w.id}>{w.display_name}</option>)}</select></label></div>}
   {task.status==='VERIFIED_RESOLVED'&&<div className="verified-note"><CheckCircle2 size={16}/><span>Cleanup verified by {task.reviewer||'authorised reviewer'} on {fmtDate(task.verified_at)}. Follow-up remains necessary.</span></div>}
 </section>
}

function InterventionsPage({interventions,hotspots,followups,user,busy,onCreate,onUpdate}:{interventions:Intervention[];hotspots:Hotspot[];followups:FollowUp[];user:User;busy:boolean;onCreate:(h:number,b:unknown)=>void;onUpdate:(id:number,b:unknown)=>void}){
 const [createOpen,setCreateOpen]=useState(false);const [hotspotId,setHotspotId]=useState(hotspots.find(h=>h.recurrence_count>0)?.id||hotspots[0]?.id||0);const [filter,setFilter]=useState('OPEN');
 const display=interventions.filter(i=>filter==='ALL'||i.status===filter).sort((a,b)=>a.due_at.localeCompare(b.due_at))
 return <div className="intervention-page">
   <section className="intervention-intro panel"><div className="intervention-intro-mark"><Workflow size={26}/></div><div><div className="eyebrow green">THE PREVENTION LOOP</div><h2>Turn a suspected cause into an accountable action.</h2><p>Store the cause as a hypothesis until evidence confirms it. Assign an action owner, set a due date, then measure the next observation window.</p></div><div className="intervention-intro-stat"><b>{interventions.filter(i=>i.status==='OPEN'||i.status==='IN_PROGRESS').length}</b><span>Open actions</span><small>{followups.filter(f=>f.observed_state==='NOT_OBSERVED').length} follow-ups not yet observed</small></div></section>
   <div className="section-toolbar"><div className="filter-pills"><button className={filter==='OPEN'?'filter-pill-active':''} onClick={()=>setFilter('OPEN')}>Open</button><button className={filter==='IN_PROGRESS'?'filter-pill-active':''} onClick={()=>setFilter('IN_PROGRESS')}>In progress</button><button className={filter==='COMPLETED'?'filter-pill-active':''} onClick={()=>setFilter('COMPLETED')}>Completed</button><button className={filter==='ALL'?'filter-pill-active':''} onClick={()=>setFilter('ALL')}>All</button></div>{user.role==='admin'&&<button className="btn btn-primary" onClick={()=>setCreateOpen(v=>!v)}><Plus size={16}/>{createOpen?'Close form':'Create intervention'}</button>}</div>
   {createOpen&&user.role==='admin'&&<section className="panel intervention-create"><div className="panel-header"><div><h2>New Intervention Ledger entry</h2><p>Link the preventive action to a specific hotspot.</p></div></div><label>Hotspot<select value={hotspotId} onChange={e=>setHotspotId(Number(e.target.value))}>{hotspots.map(h=><option value={h.id} key={h.id}>{h.code} · {h.label}</option>)}</select></label><InterventionMiniForm hotspotId={hotspotId} busy={busy} onSubmit={body=>{onCreate(hotspotId,body);setCreateOpen(false)}}/></section>}
   <div className="intervention-list">{display.map(i=><section className="panel intervention-card" key={i.id}><div className="intervention-card-head"><div className="intervention-type-icon"><Workflow size={19}/></div><div className="intervention-main-title"><span>{i.hotspot_code||hotspots.find(h=>h.id===i.hotspot_id)?.code||`Hotspot #${i.hotspot_id}`}</span><h3>{nice(i.action_type)}</h3><small>Cause hypothesis: {nice(i.hypothesis_code)}</small></div><StatusPill value={i.status}/></div><div className="hypothesis-note"><b><CircleHelp size={14}/> Hypothesis, not confirmed cause</b><p>{i.rationale}</p></div><div className="intervention-meta"><div><small>Action owner</small><b>{i.owner}</b></div><div><small>Due date</small><b>{fmtDate(i.due_at)} · {dueLabel(i.due_at)}</b></div><div><small>Follow-up windows</small><b>{i.follow_up_dates.map(d=>`${d}d`).join(' / ')}</b></div></div>{(()=>{const linked=followups.filter(f=>f.intervention_id===i.id);const returnSignal=linked.some(f=>['POSSIBLE_RETURN','CONFIRMED_RETURN'].includes(f.observed_state));const allNoReturn=i.follow_up_dates.length>0&&i.follow_up_dates.every(d=>linked.some(f=>f.window_days===d&&f.observed_state==='NO_RETURN'));const label=returnSignal?'Return signal recorded — review hotspot chronology':allNoReturn?'No return observed in all recorded windows':'Effectiveness not established — follow-up evidence incomplete';const tone=returnSignal?'warning':allNoReturn?'good':'neutral';return <div className={`effectiveness-strip effectiveness-${tone}`}><div><small>INTERVENTION OUTCOME</small><b>{label}</b></div><div className="effectiveness-windows">{i.follow_up_dates.map(d=>{const obs=linked.filter(f=>f.window_days===d).sort((a,b)=>(b.observed_at||b.scheduled_at).localeCompare(a.observed_at||a.scheduled_at))[0];return <span key={d}>{d}d <b>{nice(obs?.observed_state||'NOT_OBSERVED')}</b></span>})}</div></div>})()}{i.outcome_notes&&<p className="outcome-note">Action note: {i.outcome_notes}</p>}{user.role==='admin'&&i.status!=='COMPLETED'&&i.status!=='CANCELLED'&&<div className="intervention-actions"><button className="btn btn-secondary btn-small" disabled={busy} onClick={()=>onUpdate(i.id,{status:'IN_PROGRESS'})}>Mark in progress</button><button className="btn btn-primary btn-small" disabled={busy} onClick={()=>onUpdate(i.id,{status:'COMPLETED',outcome_notes:'Completed by authorised supervisor; outcome should be checked in the scheduled follow-up.'})}><Check size={14}/> Mark complete</button></div>}</section>)}{display.length===0&&<section className="panel"><Empty title="No matching interventions" text="Open a preventive action from a hotspot passport."/></section>}</div>
   <section className="panel followup-calendar"><div className="panel-header"><div><h2>Follow-up schedule</h2><p>Not observed is different from no return.</p></div><CalendarClock size={20} className="muted-icon"/></div><div className="followup-calendar-grid">{followups.slice(0,8).map(f=><div className="calendar-item" key={f.id}><span className={`calendar-day ${f.window_days===30?'long-window':''}`}>{f.window_days}d</span><div><b>{f.hotspot_code||hotspots.find(h=>h.id===f.hotspot_id)?.code}</b><small>{fmtDate(f.scheduled_at)} · {nice(f.observed_state)}</small></div><StatusPill value={f.observed_state}/></div>)}</div></section>
 </div>
}

function RecyclingPage({handoffs,tasks,summary,user,busy,onCreate,onUpdate}:{handoffs:Handoff[];tasks:Task[];summary:Summary|null;user:User;busy:boolean;onCreate:(b:unknown)=>void;onUpdate:(id:number,b:unknown)=>void}){
 const [createOpen,setCreateOpen]=useState(false);const [taskId,setTaskId]=useState(tasks.find(t=>t.stream==='DRY')?.id||tasks[0]?.id||0);const [stream,setStream]=useState('DRY');const [receiver,setReceiver]=useState('Sample MRF Receiver');const [quantity,setQuantity]=useState('');const [unit,setUnit]=useState('kg');const [notes,setNotes]=useState('');const [filter,setFilter]=useState('ALL')
 const filtered=handoffs.filter(h=>filter==='ALL'||h.status===filter).sort((a,b)=>b.created_at.localeCompare(a.created_at))
 const streams=STREAMS.map(s=>({name:s,count:tasks.filter(t=>t.stream===s).length,subtitle:s==='MIXED_UNKNOWN'?'Needs classification':s==='DRY'?'Recyclables & paper':s==='WET'?'Organic stream':s==='SANITARY'?'Separate handling':'Special-care handling'}))
 return <div className="recycling-page">
   <div className="recycling-stat-row"><div className="panel recovery-stat"><div className="recovery-icon green"><Recycle size={20}/></div><div><small>Confirmed receiver handoffs</small><b>{summary?.handoff_completed??'—'}<span> / {summary?.handoff_total??'—'}</span></b><p>Only receiver-confirmed records count as received.</p></div></div><div className="panel recovery-stat"><div className="recovery-icon blue"><PackageCheck size={20}/></div><div><small>Verified cleanups</small><b>{summary?.verified_task_count??'—'}<span> tasks</span></b><p>Photos and location submitted, then reviewed by a supervisor.</p></div></div><div className="panel recovery-stat"><div className="recovery-icon amber"><Clock3 size={20}/></div><div><small>Median clearance time</small><b>{summary?.median_clearance_hours===null||summary?.median_clearance_hours===undefined?'Insufficient':`${summary.median_clearance_hours}h`}</b><p>Calculated from recorded report-to-verification times.</p></div></div></div>
   <section className="panel stream-panel"><div className="panel-header"><div><h2>Waste-stream tracking</h2><p>Unknown and mixed waste remain explicit; streams are never silently inferred.</p></div><span className="stream-count">4 streams + unknown</span></div><div className="stream-grid">{streams.map((s,i)=><div className={`stream-card stream-${i}`} key={s.name}><div className="stream-icon">{s.name==='WET'?<Leaf size={19}/>:s.name==='DRY'?<Recycle size={19}/>:s.name==='SANITARY'?<ShieldCheck size={19}/>:s.name==='SPECIAL_CARE'?<AlertTriangle size={19}/>:<CircleHelp size={19}/>}</div><span>{nice(s.name)}</span><b>{s.count}</b><small>{s.subtitle}</small></div>)}</div></section>
   <section className="panel handoff-panel"><div className="panel-header"><div><h2>Receiver / MRF handoffs</h2><p>Handoff is not proof of recycling unless receipt evidence/status exists.</p></div>{user.role==='admin'&&<button className="btn btn-primary btn-small" onClick={()=>setCreateOpen(v=>!v)}><Plus size={15}/>{createOpen?'Cancel':'Record handoff'}</button>}</div>
    {createOpen&&<form className="handoff-form" onSubmit={e=>{e.preventDefault();onCreate({task_id:Number(taskId),stream,receiver_name:receiver,quantity:quantity?Number(quantity):null,unit,status:'PENDING',notes});setCreateOpen(false)}}><label>Collection task<select value={taskId} onChange={e=>{const id=Number(e.target.value);setTaskId(id);const t=tasks.find(x=>x.id===id);if(t&&t.stream!=='MIXED_UNKNOWN')setStream(t.stream)}}>{tasks.map(t=><option value={t.id} key={t.id}>{t.code} · {t.hotspot_code} · {nice(t.stream)}</option>)}</select></label><label>Waste stream<select value={stream} onChange={e=>setStream(e.target.value)}>{STREAMS.map(s=><option value={s} key={s}>{nice(s)}</option>)}</select></label><label>Receiver / MRF name<input value={receiver} onChange={e=>setReceiver(e.target.value)} required/></label><div className="form-row"><label>Quantity (measured only)<input type="number" min="0" step="0.1" value={quantity} onChange={e=>setQuantity(e.target.value)} placeholder="Optional"/></label><label>Unit<select value={unit} onChange={e=>setUnit(e.target.value)}><option value="kg">kg</option><option value="tonne">tonne</option><option value="bags">bags</option><option value="items">items</option></select></label></div><label>Handoff notes<input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Receipt ID or handling note"/></label><button className="btn btn-primary" disabled={busy}><PackageCheck size={15}/> Save pending handoff</button></form>}
    <div className="section-toolbar compact-toolbar"><div className="filter-pills"><button className={filter==='ALL'?'filter-pill-active':''} onClick={()=>setFilter('ALL')}>All</button>{['PENDING','RECEIVED','REJECTED','FAILED'].map(s=><button key={s} className={filter===s?'filter-pill-active':''} onClick={()=>setFilter(s)}>{nice(s)}</button>)}</div></div>
    <div className="table-wrap"><table className="data-table handoff-table"><thead><tr><th>Task / hotspot</th><th>Stream</th><th>Receiver</th><th>Quantity</th><th>Status</th><th>Action</th></tr></thead><tbody>{filtered.map(h=><tr key={h.id}><td><b>{h.task_code} · {h.hotspot_code}</b><small>{fmtDate(h.created_at)}</small></td><td>{nice(h.stream)}</td><td>{h.receiver_name}</td><td>{h.quantity===null?'—':`${h.quantity} ${h.unit}`}</td><td><StatusPill value={h.status}/></td><td>{h.status==='PENDING'&&user.role==='receiver'&&<button className="btn btn-primary btn-small" disabled={busy} onClick={()=>onUpdate(h.id,{status:'RECEIVED',notes:'Received confirmation submitted by recovery partner.'})}>Confirm receipt</button>}{h.status==='PENDING'&&user.role==='admin'&&<div className="row-actions"><button className="btn btn-secondary btn-small" disabled={busy} onClick={()=>onUpdate(h.id,{status:'RECEIVED',notes:'Receipt verified by authorised supervisor.'})}>Received</button><button className="btn btn-quiet btn-small" disabled={busy} onClick={()=>onUpdate(h.id,{status:'REJECTED',notes:'Receiver rejected this handoff; follow-up required.'})}>Reject</button></div>}{h.status==='RECEIVED'&&<span className="evidence-present"><CheckCircle2 size={14}/> Confirmed</span>}</td></tr>)}{filtered.length===0&&<tr><td colSpan={6}><Empty title="No handoffs here" text="Choose another status or record a new handoff."/></td></tr>}</tbody></table></div>
   </section>
   <div className="analytics-note"><ShieldCheck size={18}/><div><b>Measurement integrity</b><span>{summary?.note||'Synthetic data only. Metrics are computed from records and declared observation windows.'}</span></div></div>
 </div>
}

function ReportModal({hotspots,selected,pilot,onClose,onSubmit,busy}:{hotspots:Hotspot[];selected:Hotspot|null;pilot:PilotConfig;onClose:()=>void;onSubmit:(form:FormData)=>void;busy:boolean}){
 const [issue,setIssue]=useState('DUMPING');const [description,setDescription]=useState('');const [ward,setWard]=useState(selected?.ward||pilot.default_ward);const [lat,setLat]=useState(String(selected?.latitude??pilot.latitude));const [lng,setLng]=useState(String(selected?.longitude??pilot.longitude));const [accuracy,setAccuracy]=useState('');const [attach,setAttach]=useState(false);const [hotspotId,setHotspotId]=useState('');const [photo,setPhoto]=useState<File|null>(null);const [photoError,setPhotoError]=useState('');const [consent,setConsent]=useState(true);const [geoLoading,setGeoLoading]=useState(false);const [locationMessage,setLocationMessage]=useState('Select a point on the map or enter coordinates manually.');const [focusKey,setFocusKey]=useState(0);const [nearbyCandidates,setNearbyCandidates]=useState<HotspotCandidate[]>([]);const [candidateLoading,setCandidateLoading]=useState(false);const [candidateMessage,setCandidateMessage]=useState('')

 const distKm = useMemo(() => {
   const la = Number(lat), lo = Number(lng);
   if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
   const R = 6371;
   const dLat = (la - pilot.latitude) * Math.PI / 180;
   const dLon = (lo - pilot.longitude) * Math.PI / 180;
   const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
             Math.cos(pilot.latitude * Math.PI / 180) * Math.cos(la * Math.PI / 180) *
             Math.sin(dLon / 2) * Math.sin(dLon / 2);
   const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
   return R * c;
 }, [lat, lng, pilot]);
 const isOutside = distKm !== null && distKm > pilot.radius_km;

 function useCurrentLocation(){if(!navigator.geolocation){setLocationMessage('Location is unavailable in this browser. Use the map pin or coordinate fields.');return}setGeoLoading(true);navigator.geolocation.getCurrentPosition(pos=>{setLat(pos.coords.latitude.toFixed(6));setLng(pos.coords.longitude.toFixed(6));setAccuracy(String(Math.round(pos.coords.accuracy)));setLocationMessage(`Device location captured · accuracy ±${Math.round(pos.coords.accuracy)} m`);setFocusKey(v=>v+1);setGeoLoading(false)},err=>{setLocationMessage(err.code===1?'Location permission was denied. You can still place the pin manually.':'Could not read device location. You can still place the pin manually.');setGeoLoading(false)},{enableHighAccuracy:true,timeout:10000,maximumAge:30000})}
 function updatePhoto(file:File|null){if(!file){setPhoto(null);setPhotoError('');return}if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setPhoto(null);setPhotoError('Use a JPG, PNG or WebP image.');return}if(file.size>5*1024*1024){setPhoto(null);setPhotoError('Image exceeds 5 MB. Choose a smaller file.');return}setPhoto(file);setPhotoError('')}
 useEffect(()=>{
   const la=Number(lat),lo=Number(lng)
   if(!lat||!lng||!Number.isFinite(la)||!Number.isFinite(lo)||la < -90||la > 90||lo < -180||lo > 180){
     setNearbyCandidates([]);setCandidateMessage('Enter valid coordinates to check nearby canonical locations.');return
   }
   let active=true
   const timer=window.setTimeout(()=>{
     setCandidateLoading(true)
     api.hotspotCandidates(la,lo,100).then(rows=>{
       if(!active)return
       setNearbyCandidates(rows)
       setCandidateMessage(rows.length?'Review candidates before linking. Distance alone never merges reports.':'No current hotspot within 100 m. A new location identity will be created.')
     }).catch(()=>{
       if(active){setNearbyCandidates([]);setCandidateMessage('Candidate lookup unavailable; manual location entry is still available.')}
     }).finally(()=>{if(active)setCandidateLoading(false)})
   },350)
   return()=>{active=false;window.clearTimeout(timer)}
 },[lat,lng])
 return <div className="modal-backdrop" onClick={onClose}><section className="report-modal" onClick={e=>e.stopPropagation()}><div className="modal-header"><div><div className="eyebrow green">CITIZEN REPORTING</div><h2>Report a waste issue</h2><p>Photo and pin improve follow-up quality. GPS denial is not a blocker.</p></div><button className="icon-btn" onClick={onClose}><X size={19}/></button></div><form className="report-form" onSubmit={e=>{e.preventDefault();const form=new FormData();form.append('issue_type',issue);form.append('description',description);form.append('ward',ward);form.append('lat',lat);form.append('lng',lng);if(accuracy)form.append('gps_accuracy_m',accuracy);if(attach&&hotspotId)form.append('hotspot_id',hotspotId);if(photo)form.append('photo',photo);onSubmit(form)}}>
   <div className="report-form-grid"><label>Issue type<select value={issue} onChange={e=>setIssue(e.target.value)}>{ISSUES.map(s=><option key={s} value={s}>{nice(s)}</option>)}</select></label><label>Ward / area<input value={ward} onChange={e=>setWard(e.target.value)} required/></label></div>
   <label>What did you observe?<textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Describe the waste, missed pickup or segregation issue…" rows={3} maxLength={2000} required/></label>
   <div className="location-editor"><div className="location-editor-head"><div><MapPin size={16}/><b>Location pin</b></div><button type="button" className="btn btn-secondary btn-small" onClick={useCurrentLocation} disabled={geoLoading}><LocateFixed size={14}/>{geoLoading?'Locating…':'Use my location'}</button></div><p className="location-help">{locationMessage}</p><LocationPicker latitude={Number(lat)||pilot.latitude} longitude={Number(lng)||pilot.longitude} defaultCenter={[pilot.latitude, pilot.longitude]} focusKey={focusKey} onPick={(la,lo)=>{setLat(la.toFixed(6));setLng(lo.toFixed(6));setLocationMessage('Pin placed manually on the map.');setAccuracy('')}}/><div className="report-form-grid"><label>Latitude<input type="number" step="any" min="-90" max="90" value={lat} onChange={e=>{setLat(e.target.value);setAccuracy('')}} required/></label><label>Longitude<input type="number" step="any" min="-180" max="180" value={lng} onChange={e=>{setLng(e.target.value);setAccuracy('')}} required/></label></div>{isOutside&&<div className="pilot-boundary-alert"><AlertTriangle size={15}/><span><b>Location is outside primary pilot boundary</b> ({distKm!.toFixed(1)} km from {pilot.name} center; pilot boundary radius is {pilot.radius_km} km). The report will be recorded and flagged for pilot triage.</span></div>}<div className="candidate-review"><div className="candidate-review-head"><b>Nearby canonical locations</b><span>{candidateLoading?'CHECKING…':'100 M REVIEW RADIUS'}</span></div><p>{candidateMessage||'Checking whether this report may belong to an existing hotspot…'}</p>{nearbyCandidates.length>0&&<div className="candidate-list">{nearbyCandidates.slice(0,4).map(candidate=><div className={`candidate-item ${attach&&hotspotId===String(candidate.id)?'candidate-selected':''}`} key={candidate.id}><div className="candidate-icon"><MapPin size={14}/></div><div className="candidate-copy"><b>{candidate.code} · {candidate.label}</b><small>{candidate.ward} · {candidate.distance_m.toFixed(0)} m away · {nice(candidate.status)}</small></div><button type="button" className="btn btn-secondary btn-small" onClick={()=>{setAttach(true);setHotspotId(String(candidate.id));const matched=hotspots.find(h=>h.id===candidate.id);if(matched){setLat(String(matched.latitude));setLng(String(matched.longitude))}setWard(candidate.ward);setLocationMessage('Candidate selected for explicit human-reviewed association.');setFocusKey(v=>v+1)}}>Link</button></div>)}</div>}</div><label>GPS accuracy in metres <input type="number" min="0" step="1" value={accuracy} onChange={e=>setAccuracy(e.target.value)} placeholder="Leave blank for manual pin"/></label></div>
   <div className="photo-drop"><Camera size={20}/><div><b>{photo?photo.name:'Add a photo (recommended)'}</b><small>JPG, PNG or WebP · max 5 MB</small></div><label className="btn btn-secondary btn-small">Choose<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>updatePhoto(e.target.files?.[0]||null)}/></label></div>{photoError&&<p className="file-error">{photoError}</p>}
   <div className="association-box"><label className="checkbox-line"><input type="checkbox" checked={attach} onChange={e=>{const checked=e.target.checked;setAttach(checked);if(checked&&selected){setLat(String(selected.latitude));setLng(String(selected.longitude));setHotspotId(String(selected.id));setWard(selected.ward);setFocusKey(v=>v+1)}else if(!checked)setHotspotId('')}}/><span><b>Associate with an existing hotspot</b><small>Choose only when this is the same canonical location. Nearby distance alone is not proof.</small></span></label>{attach&&<select value={hotspotId} onChange={e=>{setHotspotId(e.target.value);const h=hotspots.find(x=>String(x.id)===e.target.value);if(h){setLat(String(h.latitude));setLng(String(h.longitude));setWard(h.ward)}}}><option value="">Select hotspot…</option>{hotspots.map(h=><option key={h.id} value={h.id}>{h.code} · {h.label}</option>)}</select>}</div>
   <label className="checkbox-line consent-line"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>I confirm this report describes an observed waste issue and consent to the provided location/photo being used for case handling.</span></label>
   <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy||!consent||!lat||!lng||(attach&&!hotspotId)}><Plus size={16}/>{busy?'Saving…':'Submit report'}</button></div>
 </form></section></div>
}

function ReportsPage({reports,user,onSelectHotspot,onOpenReport}:{reports:Report[];user:User;onSelectHotspot:(id:number)=>void;onOpenReport:()=>void}){
  return <div className="reports-page">
    <div className="section-toolbar">
      <div>
        <h2>Submitted Incident Reports ({reports.length})</h2>
        <p className="muted-text">Real-world operational reports submitted by citizens and field staff.</p>
      </div>
      <button className="btn btn-primary" onClick={onOpenReport}><Plus size={16}/> New report</button>
    </div>
    <div className="table-wrap">
      <table className="data-table reports-page-table">
        <thead>
          <tr>
            <th>Report ID</th>
            <th>Date & Time</th>
            <th>Issue / Description</th>
            <th>Ward / Coordinates</th>
            <th>Precision / Pilot</th>
            <th>Evidence</th>
            <th>Hotspot</th>
          </tr>
        </thead>
        <tbody>
          {reports.map(r => (
            <tr key={r.id}>
              <td><b>#{r.id}</b>{r.is_demo && <span className="demo-tag-mini">Demo</span>}</td>
              <td>{fmtTime(r.created_at)}</td>
              <td>
                <b>{nice(r.issue_type)}</b>
                <p className="report-desc">{r.description || 'No description provided'}</p>
              </td>
              <td>
                <b>{r.ward || '—'}</b>
                <small>{r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}</small>
              </td>
              <td>
                <span className="precision-pill">{nice(r.location_precision)}</span>
                {r.outside_pilot_area && <span className="outside-flag">Outside pilot</span>}
              </td>
              <td>
                {r.photo_key ? <EvidenceThumb label="Incident photo" keyName={r.photo_key}/> : <span className="muted-text">None</span>}
              </td>
              <td>
                {r.hotspot_id ? (
                  <button className="text-link" onClick={() => onSelectHotspot(r.hotspot_id)}>
                    {r.hotspot_code || `Hotspot #${r.hotspot_id}`}
                  </button>
                ) : <span className="muted-text">—</span>}
              </td>
            </tr>
          ))}
          {reports.length === 0 && (
            <tr>
              <td colSpan={7}>
                <Empty title="No incident reports" text="Submit a real citizen report using the 'New report' button."/>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
}
