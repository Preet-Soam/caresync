import { useEffect, useState } from 'react'
import { CalendarDays, Clock3, ShieldCheck, Video } from 'lucide-react'
import type { Appointment } from '../types'
import VideoVisitRoom from './VideoVisitRoom'
import PatientVideoRecordings from './PatientVideoRecordings'
import '../online-sessions.css'

export default function OnlineSessions({ appointments, userId, onOpenBookings }: { appointments: Appointment[]; userId?: string; onOpenBookings: () => void }) {
  const [activeVisit, setActiveVisit] = useState<Appointment | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 15000); return () => window.clearInterval(timer) }, [])
  const visits=appointments.filter(item=>item.type.toLowerCase().includes('video')).sort((a,b)=>(a.scheduledStart||`${a.date} ${a.time}`).localeCompare(b.scheduledStart||`${b.date} ${b.time}`))
  const dateTime=(visit:Appointment)=>visit.scheduledStart?new Date(visit.scheduledStart).toLocaleString(undefined,{weekday:'long',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'}):`${visit.date} · ${visit.time}`
  const mayJoin=(visit:Appointment)=>Boolean(visit.status==='confirmed'&&visit.scheduledStart&&visit.scheduledEnd&&now>=new Date(visit.scheduledStart).getTime()-15*60000&&now<=new Date(visit.scheduledEnd).getTime()+60*60000)
  return <section className="online-sessions"><header><span className="online-session-mark"><Video/></span><div><span className="eyebrow">VIRTUAL VISITS</span><h1>Online sessions.</h1><p>Keep your video appointment plans together and check the visit status.</p></div></header>
    <div className="online-session-note"><ShieldCheck size={17}/><span>Join with camera and microphone in your browser. Recording is optional and needs your consent and the doctor’s consent. You can join 15 minutes before a confirmed appointment; session access closes 60 minutes after it ends.</span></div>
    {visits.length?<div className="online-session-list">{visits.map(visit=><article key={visit.id}><div className="online-session-date"><CalendarDays/><b>{dateTime(visit)}</b></div><div className="online-session-detail"><span><Video size={15}/>{visit.doctor}</span><span><Clock3 size={15}/>{visit.status==='pending'?'Waiting for doctor confirmation':visit.status==='confirmed'?'Confirmed video visit':visit.status==='completed'?'Visit completed':visit.status}</span></div><span className={`online-session-status ${visit.status}`}>{visit.status==='pending'?'Requested':visit.status}</span>{mayJoin(visit)&&!visit.id.startsWith('demo-')&&<button className="btn btn-primary btn-sm online-join-button" onClick={()=>setActiveVisit(visit)}><Video size={14}/> Join visit</button>}{visit.status==='confirmed'&&!mayJoin(visit)&&!visit.id.startsWith('demo-')&&<small className="online-join-window">Join window opens 15 minutes before the visit.</small>}</article>)}</div>:<div className="online-session-empty"><Video size={22}/><b>No video appointments yet</b><span>When you request a video consultation, it will appear here.</span><button className="btn btn-primary btn-sm" onClick={onOpenBookings}>Find a doctor</button></div>}
    <PatientVideoRecordings appointments={appointments} isDemo={!userId}/>
    {activeVisit&&<VideoVisitRoom appointmentId={activeVisit.id} userId={userId} role="patient" otherName={activeVisit.doctor} onClose={()=>setActiveVisit(null)}/>}
  </section>
}
