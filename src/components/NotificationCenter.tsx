import { useEffect, useMemo, useState } from 'react'
import { Bell, Check, CheckCheck, ClipboardList, FileText, MessageSquareText, Pill, ShieldCheck, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { readDemoAudit, subscribeDemoAudit } from '../lib/demoAudit'
import type { Role } from '../types'
import '../notifications.css'

type Notice = { id: string; title: string; message: string; notification_type: string; related_appointment_id?: string | null; read_at: string | null; created_at: string }
type Props = { userId?: string; role: Role; onOpen: (section: string) => void }

const demoByRole: Record<Role, Omit<Notice, 'id' | 'read_at' | 'created_at'>[]> = {
  patient: [
    { title: 'Appointment update', message: 'Changes to your visit will appear here.', notification_type: 'appointment', related_appointment_id: null },
    { title: 'New prescription', message: 'Prescriptions issued by your doctor will appear here.', notification_type: 'prescription', related_appointment_id: null },
    { title: 'Visit records', message: 'A saved consultation will be ready in your medical records.', notification_type: 'consultation', related_appointment_id: null },
  ],
  doctor: [
    { title: 'New appointment request', message: 'New patient requests for your practice will appear here.', notification_type: 'appointment', related_appointment_id: null },
    { title: 'Practice profile', message: 'Updates about your provider profile and verification will appear here.', notification_type: 'account', related_appointment_id: null },
    { title: 'Schedule update', message: 'Changes to visits in your schedule will appear here.', notification_type: 'appointment', related_appointment_id: null },
  ],
  administrator: [
    { title: 'Doctor application', message: 'New provider applications awaiting review will appear here.', notification_type: 'admin', related_appointment_id: null },
    { title: 'Patient feedback', message: 'Reviews needing moderation will appear here.', notification_type: 'admin', related_appointment_id: null },
    { title: 'Platform activity', message: 'Important account and appointment events will appear here.', notification_type: 'admin', related_appointment_id: null },
  ],
}

const demoNotices = (role: Role): Notice[] => demoByRole[role].map((item, index) => ({ ...item, id: `demo-${role}-${index}`, read_at: null, created_at: new Date(Date.now() - index * 3600000).toISOString() }))
const demoReadKey = (role:Role) => `caresync-demo-notice-read-${role}`
const noticesFromActivity = (role:Role): Notice[] => {
  let seen:string[]=[];try{seen=JSON.parse(localStorage.getItem(demoReadKey(role))||'[]')}catch{}
  return readDemoAudit().flatMap(event=>{
    const action=event.action
    const relevant=role==='administrator'||(role==='patient'&&['appointment.requested','appointment.confirmed','appointment.rejected','consultation.created','prescription.issued'].includes(action))||(role==='doctor'&&['appointment.requested','appointment.confirmed','appointment.rejected','availability.created','availability.imported'].includes(action))
    if(!relevant)return[]
    const type=action.includes('prescription')?'prescription':action.includes('consultation')?'consultation':action.includes('review')?'review':action.includes('doctor')?'doctor_request':action.includes('appointment')?'appointment':'admin'
    const title=action==='appointment.requested'?(role==='doctor'?'New appointment request':'Appointment request received'):action==='appointment.confirmed'?'Appointment accepted':action==='appointment.rejected'?'Appointment update':action==='consultation.created'?'Visit summary available':action==='prescription.issued'?'Prescription ready':action==='availability.imported'?'Weekly timetable imported':action==='availability.created'?'Schedule updated':action==='review.submitted'?'Patient review submitted':action.replace(/[._]/g,' ').replace(/^\w/,letter=>letter.toUpperCase())
    const message=action==='appointment.requested'?(role==='doctor'?'A patient has requested a visit in your waiting list.':'Your visit request is waiting for the doctor’s response.'):action==='appointment.confirmed'?'Your appointment schedule has been updated.':action==='appointment.rejected'?'An appointment request was declined or cancelled.':action==='consultation.created'?'A consultation summary is available in medical records.':action==='prescription.issued'?'A new prescription is available in your patient workspace.':action.startsWith('availability.')?'Your practice availability was updated.':'A CareSync workspace activity was recorded.'
    return [{id:event.id,title,message,notification_type:type,related_appointment_id:event.resource_type==='appointment'?event.resource_id:null,read_at:seen.includes(event.id)?event.occurred_at:null,created_at:event.occurred_at}]
  })
}

const sectionFor = (type: string, role: Role) => {
  if (role === 'administrator') return type === 'review' ? 'Reviews' : type === 'doctor_request' ? 'Doctors' : type === 'appointment' ? 'Appointments' : 'Audit Log'
  if (role === 'doctor') return type === 'appointment' ? 'My schedule' : type === 'prescription' ? 'Prescriptions' : 'Practice profile'
  return type === 'prescription' ? 'Prescriptions' : type === 'consultation' ? 'Medical records' : 'Appointments'
}

export default function NotificationCenter({ userId, role, onOpen }: Props) {
  const [open, setOpen] = useState(false)
  const [notices, setNotices] = useState<Notice[]>(() => supabase && userId ? [] : demoNotices(role))
  const [busy, setBusy] = useState(false)
  const unread = useMemo(() => notices.filter(item => !item.read_at).length, [notices])

  useEffect(() => {
    if (!supabase || !userId) { const sync=()=>setNotices([...noticesFromActivity(role),...demoNotices(role)].slice(0,10));sync();return subscribeDemoAudit(sync) }
    let active = true
    const load = async () => {
      const { data, error } = await supabase!.from('notifications').select('id,title,message,notification_type,related_appointment_id,read_at,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(30)
      if (active && !error) setNotices((data || []) as Notice[])
    }
    void load()
    const channel = supabase.channel(`notifications-${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => { void load() }).subscribe()
    return () => { active = false; void supabase!.removeChannel(channel) }
  }, [userId, role])

  const markRead = async (items: Notice[]) => {
    const unreadItems = items.filter(item => !item.read_at)
    if (!unreadItems.length) return
    const now = new Date().toISOString()
    setNotices(current => current.map(item => unreadItems.some(row => row.id === item.id) ? { ...item, read_at: now } : item))
    if (supabase && userId) {
      const { error } = await supabase.from('notifications').update({ read_at: now }).in('id', unreadItems.map(item => item.id)).eq('user_id', userId)
      if (error) { setNotices(current => current.map(item => unreadItems.some(row => row.id === item.id) ? { ...item, read_at: null } : item)) }
    } else { try { const seen = new Set<string>(JSON.parse(localStorage.getItem(demoReadKey(role))||'[]'));unreadItems.forEach(item=>seen.add(item.id));localStorage.setItem(demoReadKey(role),JSON.stringify([...seen])) } catch {} }
  }

  const markAll = async () => { setBusy(true); await markRead(notices); setBusy(false) }
  const iconFor = (type: string) => type === 'prescription' ? <Pill size={16}/> : type === 'consultation' ? <FileText size={16}/> : type === 'review' ? <MessageSquareText size={16}/> : type === 'admin' || type === 'doctor_request' ? <ShieldCheck size={16}/> : <ClipboardList size={16}/>
  const roleName = role === 'administrator' ? 'admin' : role

  return <div className="notification-center">
    <button className={`notification-trigger ${open ? 'is-open' : ''}`} type="button" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <Bell size={18}/>{unread > 0 && <span className="notification-badge">{unread > 9 ? '9+' : unread}</span>}
    </button>
    {open && <><button className="notification-scrim" aria-label="Close notifications" onClick={() => setOpen(false)}/><section className="notification-popover" aria-label={`${roleName} notifications`}>
      <header className="notification-head"><div><span className="eyebrow">{roleName.toUpperCase()} INBOX</span><h2>Notifications</h2></div><div className="notification-head-actions">{unread > 0 && <button type="button" title="Mark all as read" disabled={busy} onClick={() => void markAll()}><CheckCheck size={16}/></button>}<button type="button" aria-label="Close notifications" onClick={() => setOpen(false)}><X size={17}/></button></div></header>
      {!supabase && <div className="notification-demo-label">Demo examples · {roleName} workspace</div>}
      <div className="notification-list">{notices.length ? notices.map(item => <button className={`notification-item ${item.read_at ? 'read' : 'unread'}`} key={item.id} onClick={() => { void markRead([item]); setOpen(false); onOpen(sectionFor(item.notification_type, role)) }}>
        <span className="notification-icon">{iconFor(item.notification_type)}</span><span className="notification-copy"><b>{item.title}</b><small>{item.message}</small><time>{new Date(item.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time></span>{!item.read_at && <i aria-label="Unread"/>}
      </button>) : <div className="notification-empty"><Bell size={21}/><b>You’re all caught up</b><span>Role-specific updates will appear here.</span></div>}</div>
      {notices.length > 0 && <footer className="notification-footer"><Check size={13}/> Only updates relevant to your role are shown.</footer>}
    </section></>}
  </div>
}
