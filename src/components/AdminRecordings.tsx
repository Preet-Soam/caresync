import { useEffect, useState } from 'react'
import { CircleDot, Play, RefreshCw, ShieldCheck, Trash2, Video } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Recording = { id: string; appointment_id: string; created_by: string; storage_path: string; file_name: string; duration_seconds: number; size_bytes: number; recording_status: 'ready'|'deleted'; created_at: string; patient_name?: string; doctor_name?: string; scheduled_start?: string }
const prettyDuration = (seconds: number) => `${Math.floor(seconds / 60)}m ${seconds % 60}s`

export default function AdminRecordings({ isDemo, onNotice }: { isDemo: boolean; onNotice: (message: string) => void }) {
  const [rows, setRows] = useState<Recording[]>([])
  const [loading, setLoading] = useState(!isDemo)
  const [busyId, setBusyId] = useState('')
  const [player, setPlayer] = useState<{ name: string; url: string } | null>(null)
  const [problem, setProblem] = useState('')
  const load = async () => {
    if (isDemo || !supabase) { setRows([]); setLoading(false); return }
    setLoading(true); setProblem('')
    const { data, error } = await supabase.from('video_session_recordings').select('id,appointment_id,created_by,storage_path,file_name,duration_seconds,size_bytes,recording_status,created_at').order('created_at', { ascending: false }).limit(100)
    if (error) { setRows([]); setProblem('Recording management is unavailable. Apply the private recording migration and refresh.'); setLoading(false); return }
    const recordings = (data || []) as Recording[]
    const appointmentIds = [...new Set(recordings.map(row => row.appointment_id))]
    const { data: visits } = appointmentIds.length ? await supabase.from('appointments').select('id,patient_id,scheduled_start').in('id', appointmentIds) : { data: [] }
    const patients = (visits || []) as { id: string; patient_id: string; scheduled_start: string }[]
    const profileIds = [...new Set([...patients.map(visit => visit.patient_id), ...recordings.map(row => row.created_by)])]
    const { data: profiles } = profileIds.length ? await supabase.from('profiles').select('id,full_name').in('id', profileIds) : { data: [] }
    const profileNames = new Map((profiles || []).map(profile => [profile.id, profile.full_name]))
    const visitsById = new Map(patients.map(visit => [visit.id, visit]))
    setRows(recordings.map(row => ({ ...row, patient_name: profileNames.get(visitsById.get(row.appointment_id)?.patient_id || '') || 'Patient', doctor_name: profileNames.get(row.created_by) || 'Doctor', scheduled_start: visitsById.get(row.appointment_id)?.scheduled_start })))
    setLoading(false)
  }
  useEffect(() => { void load() }, [isDemo])
  const preview = async (row: Recording) => {
    if (!supabase) return
    const { data, error } = await supabase.storage.from('video-recordings').createSignedUrl(row.storage_path, 900)
    if (error || !data?.signedUrl) { onNotice('Could not open this recording. Check that the private video file is present.'); return }
    setPlayer({ name: row.file_name, url: data.signedUrl })
  }
  const remove = async (row: Recording) => {
    if (!supabase) return
    setBusyId(row.id)
    let statusError: { message: string } | null = null
    if (row.recording_status !== 'deleted') {
      const result = await supabase.from('video_session_recordings').update({ recording_status: 'deleted' }).eq('id', row.id)
      statusError = result.error
    }
    if (statusError) { setBusyId(''); onNotice('Could not revoke patient access. Refresh and try again.'); return }
    const storage = await supabase.storage.from('video-recordings').remove([row.storage_path])
    setBusyId('')
    await load()
    onNotice(storage.error ? 'Patient access is revoked, but the stored file could not be removed. Retry from this list.' : 'Recording access revoked and stored file removed.')
  }
  return <section className="admin-recordings admin-workspace">
    <div className="admin-overview-head"><div className="admin-page-heading"><div><span className="eyebrow">ADMINISTRATION</span><h1>Session recordings.</h1><p>Review private visit recordings, see who can access them, and revoke access or remove stored files.</p></div></div><button className="btn btn-light btn-sm" onClick={() => void load()}><RefreshCw size={14}/> Refresh</button></div>
    {isDemo && <div className="admin-demo-note"><ShieldCheck size={15}/> Demo sessions do not record real calls. Live recording management requires the private Supabase migration.</div>}
    {problem && <div className="admin-demo-note">{problem}</div>}
    <div className="admin-recordings-privacy"><ShieldCheck size={16}/><span>Recordings are private. Patients and their visit doctor can watch ready recordings; administrators can review and remove them. Every recording starts only after both people consent.</span></div>
    <div className="admin-panel admin-recording-list"><div className="admin-panel-head"><div><span className="eyebrow">RECORDING LIBRARY</span><h2>{rows.length} recent recordings</h2></div><span className="admin-count">Up to 100</span></div>
      {loading ? <div className="admin-workspace-empty">Loading recordings…</div> : rows.length ? <div className="admin-recording-rows">{rows.map(row => <article key={row.id}><span className="admin-recording-icon"><Video/></span><div className="admin-recording-main"><b>{row.patient_name} · {row.doctor_name}</b><span>{row.scheduled_start ? new Date(row.scheduled_start).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : new Date(row.created_at).toLocaleString()}</span><small>{prettyDuration(row.duration_seconds)} · {(row.size_bytes / 1048576).toFixed(1)} MB · {row.file_name}</small></div><span className={`admin-recording-status ${row.recording_status}`}>{row.recording_status}</span>{row.recording_status === 'ready' && <button className="btn btn-light btn-sm" onClick={() => void preview(row)}><Play size={14}/> Review</button>}<button className="admin-recording-remove" disabled={busyId === row.id} onClick={() => void remove(row)}><Trash2 size={14}/>{busyId === row.id ? 'Removing…' : row.recording_status === 'deleted' ? 'Retry file removal' : 'Revoke & remove'}</button></article>)}</div> : <div className="admin-workspace-empty"><CircleDot size={20}/><span>No online session recordings have been saved.</span></div>}
    </div>
    {player && <div className="modal-backdrop patient-recording-backdrop" onMouseDown={event => { if (event.currentTarget === event.target) setPlayer(null) }}><section className="patient-recording-player" role="dialog" aria-modal="true" aria-label="Review video recording"><header><div><span className="eyebrow">ADMIN PRIVATE REVIEW</span><b>{player.name}</b></div><button className="icon-button" onClick={() => setPlayer(null)} aria-label="Close recording">×</button></header><video controls autoPlay playsInline src={player.url}/><p><ShieldCheck size={14}/> Temporary admin viewing link expires in 15 minutes.</p></section></div>}
  </section>
}
