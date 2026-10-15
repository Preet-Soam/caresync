import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowRight, CalendarDays, Clock3, MapPin, ShieldCheck, Video, X } from 'lucide-react'
import type { Doctor } from '../types'
import { supabase } from '../lib/supabase'
import { generateSlots, readDemoSchedule, readDemoTimezone, subscribeDemoSchedule, type AvailabilityRow } from '../lib/schedule'
import '../slot-booking.css'

export default function AppointmentBooking({ doctor, isDemo, onClose, onRequest }: { doctor: Doctor; isDemo: boolean; onClose: () => void; onRequest: (startsAt: string, visitType: 'in_person'|'video'|'phone') => void }) {
  const [date, setDate] = useState(() => { const value = new Date(); value.setDate(value.getDate() + 1); return value.toISOString().slice(0, 10) })
  const [visitType, setVisitType] = useState<'in_person'|'video'|'phone'>('in_person')
  const [rows, setRows] = useState<AvailabilityRow[]>([])
  const [timeZone, setTimeZone] = useState(doctor.timeZone || 'Asia/Kolkata')
  const [selectedSlot, setSelectedSlot] = useState('')
  const [loading, setLoading] = useState(!isDemo)
  const [error, setError] = useState('')
  const slots = useMemo(() => [...new Map(rows.flatMap(row => generateSlots(row, date, timeZone, rows)).sort((a,b) => a.startsAt.localeCompare(b.startsAt)).map(slot => [slot.startsAt, slot])).values()], [rows, date, timeZone])

  useEffect(() => {
    setSelectedSlot(''); setError('')
    if (isDemo) {
      setTimeZone(readDemoTimezone(doctor.id)); setRows(readDemoSchedule(doctor.id)); setLoading(false)
      return subscribeDemoSchedule(doctor.id, () => setRows(readDemoSchedule(doctor.id)))
    }
    if (!supabase) { setRows([]); setLoading(false); return }
    let active = true
    setLoading(true)
    void supabase.from('doctor_availability').select('id,weekday,available_on,start_time,end_time,slot_duration,availability_status').eq('doctor_id', doctor.id).eq('availability_status','available').then(({data,error:queryError}) => {
      if (!active) return
      if (queryError) setError('Could not load this doctor’s schedule. Try again shortly.')
      setRows((data || []) as AvailabilityRow[]); setLoading(false)
    })
    return () => { active = false }
  }, [doctor.id, date, isDemo])

  const submit = (event: FormEvent) => { event.preventDefault(); const slot = slots.find(item => item.startsAt === selectedSlot); if (!slot) { setError('Select an available time before continuing.'); return } onRequest(slot.startsAt, visitType) }
  const prettyTime = (time: string) => new Date(`1970-01-01T${time}:00Z`).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit',timeZone:'UTC'})
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className="booking-modal slot-booking-modal" role="dialog" aria-modal="true" aria-labelledby="slot-booking-title"><div className="modal-heading"><div><div className="eyebrow">NEW APPOINTMENT</div><h2 id="slot-booking-title">Choose an available time</h2></div><button className="icon-button" onClick={onClose} aria-label="Close appointment booking"><X/></button></div><div className="booking-doctor"><span className="slot-doctor-icon"><CalendarDays size={17}/></span><div><b>{doctor.name}</b><small>{doctor.specialty} · {doctor.clinicName}</small>{doctor.address&&<small><MapPin size={12}/>{doctor.address}, {doctor.city}</small>}</div></div><form className="slot-booking-form" onSubmit={submit}><label>Date<input type="date" min={new Date().toISOString().slice(0,10)} max={new Date(Date.now()+180*86400000).toISOString().slice(0,10)} value={date} onChange={e=>setDate(e.target.value)} required/></label><label>Visit type<select value={visitType} onChange={e=>setVisitType(e.target.value as typeof visitType)}><option value="in_person">At the clinic</option><option value="video">Online session</option><option value="phone">Phone consultation</option></select></label><div className="slot-time-heading"><div><span className="eyebrow">AVAILABLE TIMES</span><small>Practice time · {timeZone}</small></div>{!loading&&<span>{slots.length} {slots.length===1?'slot':'slots'}</span>}</div>{loading?<div className="slot-empty"><Clock3 size={17}/>Checking availability…</div>:error&&rows.length===0?<div className="slot-error" role="alert">{error}</div>:slots.length?<div className="slot-choice-grid">{slots.map(slot=><button type="button" key={slot.startsAt} className={selectedSlot===slot.startsAt?'selected':''} onClick={()=>{setSelectedSlot(slot.startsAt);setError('')}}>{prettyTime(slot.time)}</button>)}</div>:<div className="slot-empty"><Clock3 size={17}/>No open slots on this date. Try another date.</div>}{error&&rows.length>0&&<div className="slot-error" role="alert">{error}</div>}<p className="slot-booking-note"><ShieldCheck size={15}/>{isDemo?'Fictional schedule preview. No real visit is created.':'The request is checked against the doctor’s schedule when you submit. The visit is confirmed only after the doctor accepts it.'}</p><button className="btn btn-primary span-2" disabled={!selectedSlot||loading} type="submit">{visitType==='video'?<Video size={15}/>:<CalendarDays size={15}/>}Request {visitType==='video'?'online session':'appointment'} <ArrowRight size={15}/></button></form></section></div>
}
