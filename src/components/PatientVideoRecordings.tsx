import { useEffect, useState } from 'react'
import { CalendarDays, CircleDot, Play, ShieldCheck, Video, X } from 'lucide-react'
import type { Appointment } from '../types'
import { supabase } from '../lib/supabase'

type Recording = { id: string; appointment_id: string; storage_path: string; file_name: string; duration_seconds: number; size_bytes: number; created_at: string }
const duration = (seconds: number) => `${Math.floor(seconds / 60)} min${seconds % 60 ? ` ${seconds % 60} sec` : ''}`
const size = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`

export default function PatientVideoRecordings({ appointments, isDemo }: { appointments: Appointment[]; isDemo: boolean }) {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [active, setActive] = useState<{ id: string; url: string; name: string } | null>(null)
  const [loading, setLoading] = useState(!isDemo)
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (isDemo || !supabase) { setRecordings([]); setLoading(false); return }
    let alive = true
    const load = async () => {
      const { data, error } = await supabase!.from('video_session_recordings').select('id,appointment_id,storage_path,file_name,duration_seconds,size_bytes,created_at').eq('recording_status', 'ready').order('created_at', { ascending: false }).limit(50)
      if (!alive) return
      setRecordings((data || []) as Recording[])
      if (error) setMessage('Recordings are unavailable. Apply the private recording migration and refresh.')
      setLoading(false)
    }
    void load()
    const timer = window.setInterval(() => void load(), 30000)
    window.addEventListener('focus', load)
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener('focus', load) }
  }, [isDemo])
  const play = async (recording: Recording) => {
    if (!supabase) return
    setMessage('Opening secure recording…')
    const { data, error } = await supabase.storage.from('video-recordings').createSignedUrl(recording.storage_path, 3600)
    if (error || !data?.signedUrl) { setMessage('This recording could not be opened. It may have been removed by an administrator.'); return }
    setMessage('')
    setActive({ id: recording.id, url: data.signedUrl, name: recording.file_name })
  }
  const appointmentById = new Map(appointments.map(item => [item.id, item]))
  return <section className="patient-recordings">
    <header><span className="patient-recordings-mark"><Video/></span><div><span className="eyebrow">PRIVATE VISIT LIBRARY</span><h2>Session recordings</h2><p>Watch a recording saved from an online visit after both participants agreed to record.</p></div></header>
    <div className="patient-recordings-privacy"><ShieldCheck size={17}/><span>Private to you, your doctor, and authorized CareSync administrators. A secure viewing link expires after one hour.</span></div>
    {message && <div className="patient-recordings-message" role="status">{message}</div>}
    {loading ? <div className="patient-recordings-empty">Loading your recordings…</div> : recordings.length ? <div className="patient-recordings-list">{recordings.map(item => {
      const visit = appointmentById.get(item.appointment_id)
      return <article key={item.id}><span className="patient-recordings-file"><Video/></span><div className="patient-recordings-copy"><b>{visit ? `Visit with ${visit.doctor}` : 'Online visit recording'}</b><span><CalendarDays size={13}/>{new Date(item.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span><small>{duration(item.duration_seconds)} · {size(item.size_bytes)}</small></div><button className="btn btn-light btn-sm" onClick={() => void play(item)}><Play size={14}/> Watch</button></article>
    })}</div> : <div className="patient-recordings-empty"><CircleDot size={20}/><b>No recordings available</b><span>When both participants consent and the doctor saves a visit recording, it will appear here.</span></div>}
    {active && <div className="modal-backdrop patient-recording-backdrop" onMouseDown={event => { if (event.currentTarget === event.target) setActive(null) }}><section className="patient-recording-player" role="dialog" aria-modal="true" aria-label="Online visit recording"><header><div><span className="eyebrow">PRIVATE VIDEO RECORDING</span><b>{active.name}</b></div><button className="icon-button" onClick={() => setActive(null)} aria-label="Close recording"><X/></button></header><video controls autoPlay playsInline src={active.url}/><p><ShieldCheck size={14}/> This signed viewing link expires in one hour. Do not share it.</p></section></div>}
  </section>
}
