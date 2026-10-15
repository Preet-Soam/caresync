import { CalendarDays, Clock3, ShieldCheck, Video } from 'lucide-react'
import type { Appointment } from '../types'
import '../online-sessions.css'

export default function OnlineSessions({ appointments, onOpenBookings }: { appointments: Appointment[]; onOpenBookings: () => void }) {
  const visits=appointments.filter(item=>item.type.toLowerCase().includes('video')).sort((a,b)=>(a.scheduledStart||`${a.date} ${a.time}`).localeCompare(b.scheduledStart||`${b.date} ${b.time}`))
  const dateTime=(visit:Appointment)=>visit.scheduledStart?new Date(visit.scheduledStart).toLocaleString(undefined,{weekday:'long',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'}):`${visit.date} · ${visit.time}`
  return <section className="online-sessions"><header><span className="online-session-mark"><Video/></span><div><span className="eyebrow">VIRTUAL VISITS</span><h1>Online sessions.</h1><p>Keep your video appointment plans together and check the visit status.</p></div></header>
    <div className="online-session-note"><ShieldCheck size={17}/><span>CareSync organizes video visit appointments. A secure video room still needs to be provided by your clinic or connected video service. Follow the joining instructions from your care team.</span></div>
    {visits.length?<div className="online-session-list">{visits.map(visit=><article key={visit.id}><div className="online-session-date"><CalendarDays/><b>{dateTime(visit)}</b></div><div className="online-session-detail"><span><Video size={15}/>{visit.doctor}</span><span><Clock3 size={15}/>{visit.status==='pending'?'Waiting for doctor confirmation':visit.status==='confirmed'?'Confirmed video visit':visit.status==='completed'?'Visit completed':visit.status}</span></div><span className={`online-session-status ${visit.status}`}>{visit.status==='pending'?'Requested':visit.status}</span></article>)}</div>:<div className="online-session-empty"><Video size={22}/><b>No video appointments yet</b><span>When you request a video consultation, it will appear here.</span><button className="btn btn-primary btn-sm" onClick={onOpenBookings}>Find a doctor</button></div>}
  </section>
}
