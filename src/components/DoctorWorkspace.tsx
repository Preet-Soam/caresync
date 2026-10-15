import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CalendarDays, Check, CheckCircle2, FileSpreadsheet, FileText, Plus, Save, ShieldCheck, Stethoscope, Upload, UserRound, Video, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { recordDemoActivity } from '../lib/demoAudit'
import { addDemoConsultation, addDemoPrescription, getDemoAppointments, subscribeDemoAppointments, updateDemoAppointment } from '../lib/demoStore'
import VideoVisitRoom from './VideoVisitRoom'
import { downloadScheduleTemplate, readDemoSchedule, readDemoTimezone, readScheduleSpreadsheet, writeDemoSchedule, writeDemoTimezone, type AvailabilityRow } from '../lib/schedule'
import '../doctor-schedule.css'

type DoctorAppointment = { id: string; patientId: string; patientName: string; scheduledStart: string; scheduledEnd: string; status: string; appointmentType: string; reason: string; consultationId?: string | null; clinicalNotes?: string | null; diagnosis?: string | null; treatmentPlan?: string | null; followUpDate?: string | null }
type Medicine = { medication_name: string; dosage: string; route: string; frequency: string; duration: string; instructions: string }
type DoctorPrescription = { id: string; patientId: string; patientName: string; issuedAt: string | null; items: Medicine[] }
type Props = { section: 'My schedule' | 'Online sessions' | 'Patients' | 'Consultations' | 'Prescriptions'; userId?: string; doctorId?: string; isDemo: boolean; onNotice: (message: string) => void }
const stamp = (value: string) => new Date(value).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const day = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const blankMedicine = (): Medicine => ({ medication_name: '', dosage: '', route: '', frequency: '', duration: '', instructions: '' })
function seedDemoAppointments(): DoctorAppointment[] {
  const future = (days: number, hour: number) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d.toISOString() }
  const past = (days: number, hour: number) => { const d = new Date(); d.setDate(d.getDate() - days); d.setHours(hour, 0, 0, 0); return d.toISOString() }
  return [
    { id: 'demo-wait-a', patientId: 'demo-patient-a', patientName: 'Taylor Morgan · sample', scheduledStart: future(1, 10), scheduledEnd: future(1, 10.5), status: 'requested', appointmentType: 'in_person', reason: 'Routine consultation · fictional request' },
    { id: 'demo-wait-b', patientId: 'demo-patient-b', patientName: 'Jordan Rivera · sample', scheduledStart: future(2, 14), scheduledEnd: future(2, 14.5), status: 'requested', appointmentType: 'video', reason: 'Follow-up · fictional request' },
    { id: 'demo-confirmed', patientId: 'demo-patient-c', patientName: 'Alex Kim · sample', scheduledStart: future(3, 11), scheduledEnd: future(3, 11.5), status: 'confirmed', appointmentType: 'in_person', reason: 'Fictional sample visit' },
    { id: 'demo-completed', patientId: 'demo-patient-d', patientName: 'Casey Shah · sample', scheduledStart: past(2, 12), scheduledEnd: past(2, 12.5), status: 'completed', appointmentType: 'phone', reason: 'Fictional sample visit' },
  ]
}
let demoDoctorAppointments = seedDemoAppointments()
let demoDoctorPrescriptions: DoctorPrescription[] = []
function SectionHeader({ kicker, title, text }: { kicker: string; title: string; text: string }) { return <header className="doctor-page-heading"><div><span className="eyebrow">{kicker}</span><h1>{title}</h1><p>{text}</p></div></header> }
function PrivacyNote({ children }: { children: React.ReactNode }) { return <div className="doctor-privacy-note"><ShieldCheck size={15}/>{children}</div> }

export default function DoctorWorkspace({ section, userId, doctorId, isDemo, onNotice }: Props) {
  const [appointments, setAppointments] = useState<DoctorAppointment[]>(isDemo ? demoDoctorAppointments : [])
  const [prescriptions, setPrescriptions] = useState<DoctorPrescription[]>(isDemo ? demoDoctorPrescriptions : [])
  const [loading, setLoading] = useState(!isDemo)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [selectedConsultation, setSelectedConsultation] = useState('')
  const [notes, setNotes] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [plan, setPlan] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [rxAppointment, setRxAppointment] = useState('')
  const [medicines, setMedicines] = useState<Medicine[]>([blankMedicine()])
  const [activeVideoVisit, setActiveVideoVisit] = useState<DoctorAppointment | null>(null)
  const [now, setNow] = useState(Date.now())
  const waiting = appointments.filter(a => a.status === 'requested').sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart))
  const upcoming = appointments.filter(a => a.status === 'confirmed').sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart))
  const patients = useMemo(() => { const unique = new Map<string, DoctorAppointment>(); appointments.forEach(a => { if (!unique.has(a.patientId)) unique.set(a.patientId, a) }); return [...unique.values()].sort((a, b) => b.scheduledStart.localeCompare(a.scheduledStart)) }, [appointments])
  const completedWithoutNote = appointments.filter(a => a.status === 'completed' && !a.consultationId)
  const completedWithNotes = appointments.filter(a => a.status === 'completed' && a.consultationId)
  const consultationOptions = appointments.filter(a => a.status === 'completed' && a.consultationId)
  const onlineAppointments = appointments.filter(a=>a.appointmentType==='video').sort((a,b)=>a.scheduledStart.localeCompare(b.scheduledStart))
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 15000); return () => window.clearInterval(timer) }, [])
  const mayJoinVideo = (visit: DoctorAppointment) => visit.status === 'confirmed' && now >= new Date(visit.scheduledStart).getTime() - 15 * 60000 && now <= new Date(visit.scheduledEnd).getTime() + 60 * 60000

  useEffect(() => {
    if (isDemo) {
      setLoading(false)
      const syncPatientRequests = () => {
        const shared = getDemoAppointments().filter(item => item.doctorId === doctorId && item.scheduledStart).map(item => ({ id:item.id, patientId:item.patientId||'demo-patient', patientName:item.patientName||'Patient', scheduledStart:item.scheduledStart!, scheduledEnd:item.scheduledEnd||new Date(new Date(item.scheduledStart!).getTime()+30*60000).toISOString(), status:item.status==='pending'?'requested':item.status, appointmentType:item.type==='Video consult'?'video':item.type==='Phone consultation'?'phone':'in_person', reason:'Patient appointment request' })) as DoctorAppointment[]
        setAppointments(current => [...shared, ...current.filter(item => !item.id.startsWith('demo-') || item.id.startsWith('demo-wait-') || item.id.startsWith('demo-confirmed') || item.id.startsWith('demo-completed'))].filter((item,index,array)=>array.findIndex(other=>other.id===item.id)===index))
      }
      syncPatientRequests()
      return subscribeDemoAppointments(syncPatientRequests)
    }
    if (!supabase || !userId || !doctorId) { setLoading(false); return }
    let active = true
    void (async () => {
      setLoading(true); setError('')
      const { data, error: workspaceError } = await supabase!.rpc('doctor_care_workspace')
      if (!active) return
      if (workspaceError) { setError(workspaceError.message.includes('approved doctor') ? 'This workspace is available after your doctor profile is approved.' : 'Could not load your care workspace. Apply the doctor workspace database migration and try again.'); setLoading(false); return }
      const rows = (data || []) as any[]
      const mapped: DoctorAppointment[] = rows.map(row => ({ id: row.appointment_id, patientId: row.patient_id, patientName: row.patient_name || 'Patient', scheduledStart: row.scheduled_start, scheduledEnd: row.scheduled_end, status: row.appointment_status, appointmentType: row.appointment_type, reason: row.visit_reason || '', consultationId: row.consultation_id, clinicalNotes: row.clinical_notes, diagnosis: row.diagnosis, treatmentPlan: row.treatment_plan, followUpDate: row.follow_up_date }))
      setAppointments(mapped)
      const { data: rxRows, error: rxError } = await supabase!.from('prescriptions').select('id,patient_id,issued_at,consultation_id').eq('doctor_id', doctorId).in('status', ['finalized', 'amended']).order('issued_at', { ascending: false, nullsFirst: false })
      if (!active) return
      if (rxError) { setError('Your appointments loaded, but prescription history could not be loaded.'); setLoading(false); return }
      const rxIds = (rxRows || []).map(row => row.id)
      const { data: itemRows, error: itemError } = rxIds.length ? await supabase!.from('prescription_items').select('prescription_id,medication_name,dosage,route,frequency,duration,instructions').in('prescription_id', rxIds) : { data: [], error: null }
      if (!active) return
      if (itemError) setError('Your appointments loaded, but prescription details could not be loaded.')
      setPrescriptions((rxRows || []).map(row => ({ id: row.id, patientId: row.patient_id, patientName: mapped.find(a => a.patientId === row.patient_id)?.patientName || 'Patient', issuedAt: row.issued_at, items: (itemRows || []).filter((item: any) => item.prescription_id === row.id).map((item: any) => ({ medication_name: item.medication_name, dosage: item.dosage, route: item.route, frequency: item.frequency, duration: item.duration, instructions: item.instructions || '' })) })))
      setLoading(false)
    })()
    const channel = supabase.channel(`doctor-care-sync-${doctorId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `doctor_id=eq.${doctorId}` }, () => {
      void supabase!.rpc('doctor_care_workspace').then(({ data }) => {
        if (!active || !data) return
        setAppointments((data as any[]).map(row => ({ id: row.appointment_id, patientId: row.patient_id, patientName: row.patient_name || 'Patient', scheduledStart: row.scheduled_start, scheduledEnd: row.scheduled_end, status: row.appointment_status, appointmentType: row.appointment_type, reason: row.visit_reason || '', consultationId: row.consultation_id, clinicalNotes: row.clinical_notes, diagnosis: row.diagnosis, treatmentPlan: row.treatment_plan, followUpDate: row.follow_up_date })))
      })
    }).subscribe()
    return () => { active = false; void supabase!.removeChannel(channel) }
  }, [userId, doctorId, isDemo])

  const updateStatus = async (appointment: DoctorAppointment, status: 'confirmed' | 'rejected') => {
    setBusyId(appointment.id)
    if (isDemo) { demoDoctorAppointments = demoDoctorAppointments.map(row => row.id === appointment.id ? { ...row, status } : row); setAppointments(demoDoctorAppointments); if(appointment.id.startsWith('demo-'))updateDemoAppointment(appointment.id,{status:status==='confirmed'?'confirmed':'cancelled'}); recordDemoActivity('doctor',status === 'confirmed' ? 'appointment.confirmed' : 'appointment.rejected','appointment',appointment.id); setBusyId(''); onNotice(status === 'confirmed' ? 'Appointment accepted and synced to the patient workspace.' : 'Appointment declined and synced to the patient workspace.'); return }
    if (!supabase) { setBusyId(''); onNotice('Connect a doctor account to manage appointment requests.'); return }
    const { data, error: updateError } = await supabase.from('appointments').update({ status }).eq('id', appointment.id).eq('status', 'requested').select('id').maybeSingle()
    setBusyId('')
    if (updateError || !data) { onNotice(updateError ? 'Could not update the appointment. Confirm your doctor profile is approved.' : 'This request was already updated. Refresh the schedule.'); return }
    setAppointments(current => current.map(row => row.id === appointment.id ? { ...row, status } : row))
    onNotice(status === 'confirmed' ? 'Appointment accepted and added to your schedule.' : 'Appointment declined.')
  }

  const beginConsultation = (appointment: DoctorAppointment) => { setSelectedConsultation(appointment.id); setNotes(appointment.clinicalNotes || ''); setDiagnosis(appointment.diagnosis || ''); setPlan(appointment.treatmentPlan || ''); setFollowUp(appointment.followUpDate || '') }
  const saveConsultation = async (event: FormEvent) => {
    event.preventDefault()
    const appointment = appointments.find(a => a.id === selectedConsultation)
    if (!appointment) return
    setBusyId(appointment.id)
    const payload = { clinical_notes: notes.trim(), diagnosis: diagnosis.trim() || null, treatment_plan: plan.trim() || null, follow_up_date: followUp || null }
    if (isDemo) {
      const consultationId=appointment.consultationId||`demo-consult-${appointment.id}`
      demoDoctorAppointments = demoDoctorAppointments.map(a => a.id === appointment.id ? { ...a, status: 'completed', consultationId, clinicalNotes: payload.clinical_notes, diagnosis: payload.diagnosis, treatmentPlan: payload.treatment_plan, followUpDate: payload.follow_up_date } : a)
      setAppointments(current=>current.map(a=>a.id===appointment.id?{...a,status:'completed',consultationId,clinicalNotes:payload.clinical_notes,diagnosis:payload.diagnosis,treatmentPlan:payload.treatment_plan,followUpDate:payload.follow_up_date}:a))
      updateDemoAppointment(appointment.id,{status:'completed'})
      addDemoConsultation({id:consultationId,appointmentId:appointment.id,patientId:appointment.patientId,doctorName:'CareSync demo doctor',createdAt:new Date().toISOString(),clinicalNotes:payload.clinical_notes,diagnosis:payload.diagnosis,treatmentPlan:payload.treatment_plan,followUpDate:payload.follow_up_date})
      setSelectedConsultation(''); recordDemoActivity('doctor','consultation.created','consultation',appointment.id); setBusyId(''); onNotice('Visit summary saved and synced to the patient record.'); return
    }
    if (!supabase || !doctorId) { setBusyId(''); onNotice('Your doctor profile is not available.'); return }
    if (appointment.consultationId) {
      const { error: saveError } = await supabase.from('consultations').update(payload).eq('id', appointment.consultationId)
      if (saveError) { setBusyId(''); onNotice('Could not update this consultation.'); return }
      setAppointments(current => current.map(a => a.id === appointment.id ? { ...a, clinicalNotes: payload.clinical_notes, diagnosis: payload.diagnosis, treatmentPlan: payload.treatment_plan, followUpDate: payload.follow_up_date } : a))
    } else {
      if (appointment.status !== 'completed') {
        const { data: completed, error: statusError } = await supabase.from('appointments').update({ status: 'completed' }).eq('id', appointment.id).eq('status', 'confirmed').select('id').maybeSingle()
        if (statusError || !completed) { setBusyId(''); onNotice(statusError ? 'Could not mark this visit complete.' : 'Only a confirmed visit can be completed. Refresh your schedule.'); return }
      }
      const { data: created, error: saveError } = await supabase.from('consultations').insert({ appointment_id: appointment.id, doctor_id: doctorId, patient_id: appointment.patientId, ...payload }).select('id').single()
      if (saveError || !created) { setAppointments(current => current.map(a => a.id === appointment.id ? { ...a, status: 'completed' } : a)); setBusyId(''); onNotice('The visit is complete, but the note could not be saved. Open it again to retry.'); return }
      setAppointments(current => current.map(a => a.id === appointment.id ? { ...a, status: 'completed', consultationId: created.id, ...{ clinicalNotes: payload.clinical_notes, diagnosis: payload.diagnosis, treatmentPlan: payload.treatment_plan, followUpDate: payload.follow_up_date } } : a))
    }
    setSelectedConsultation(''); setBusyId(''); onNotice('Consultation saved to the patient record.')
  }

  const issuePrescription = async (event: FormEvent) => {
    event.preventDefault()
    const appointment = appointments.find(a => a.id === rxAppointment && a.consultationId && a.status === 'completed')
    if (!appointment) { onNotice('Choose a completed visit with a saved consultation first.'); return }
    if (medicines.some(item => !item.medication_name.trim() || !item.dosage.trim() || !item.route.trim() || !item.frequency.trim() || !item.duration.trim())) { onNotice('Complete each medicine’s name, dosage, route, schedule, and duration.'); return }
    setBusyId(appointment.id)
    if (isDemo) {
      const issuedAt=new Date().toISOString();const prescription={id:`demo-rx-${Date.now()}`,patientId:appointment.patientId,patientName:appointment.patientName,issuedAt,items:medicines.map(item=>({...item}))};demoDoctorPrescriptions=[prescription,...demoDoctorPrescriptions];addDemoPrescription({...prescription,doctorName:'CareSync demo doctor'});setPrescriptions(demoDoctorPrescriptions)
      setMedicines([blankMedicine()]); setRxAppointment(''); recordDemoActivity('doctor','prescription.issued','prescription',appointment.id); setBusyId(''); onNotice('Fictional prescription added in demo memory only.'); return
    }
    if (!supabase) { setBusyId(''); onNotice('Connect a doctor account to issue prescriptions.'); return }
    const { data, error: issueError } = await supabase.rpc('issue_prescription', { target_appointment: appointment.id, items: medicines })
    setBusyId('')
    if (issueError || !data) { onNotice(issueError?.message.includes('approved doctor') ? 'Prescription access requires an approved doctor account.' : 'Could not issue the prescription. Apply the doctor workspace database migration and check the consultation.'); return }
    setPrescriptions(current => [{ id: data as string, patientId: appointment.patientId, patientName: appointment.patientName, issuedAt: new Date().toISOString(), items: medicines.map(item => ({ ...item })) }, ...current])
    setMedicines([blankMedicine()]); setRxAppointment(''); onNotice('Prescription issued to the patient record.')
  }

  if (section === 'My schedule') return <section className="doctor-workspace"><SectionHeader kicker="APPOINTMENTS & AVAILABILITY" title="My schedule." text="Review new requests, accept visits, and keep confirmed appointments together." />
    {isDemo && <PrivacyNote>Fictional demo patients and visits. Availability is saved in this browser for the demo.</PrivacyNote>}{error && <div className="doctor-workspace-error" role="status">{error}</div>}<AvailabilityManager doctorId={doctorId} userId={userId} isDemo={isDemo}/>
    <div className="doctor-schedule-stats"><div><small>Waiting list</small><b>{waiting.length}</b></div><div><small>Confirmed</small><b>{upcoming.length}</b></div><div><small>Patients</small><b>{patients.length}</b></div></div>
    <div className="doctor-workspace-card"><div className="doctor-workspace-card-heading"><div><span className="eyebrow">NEEDS YOUR RESPONSE</span><h2>Appointment requests</h2></div><span className="doctor-count-pill">{waiting.length} waiting</span></div>
      {loading ? <DoctorEmpty>Loading your schedule…</DoctorEmpty> : waiting.length ? <div className="doctor-appointment-list">{waiting.map(a => <article className="doctor-appointment-row" key={a.id}><div className="doctor-patient-avatar"><UserRound/></div><div className="doctor-appointment-main"><b>{a.patientName}</b><small>{stamp(a.scheduledStart)} · {appointmentType(a.appointmentType)}</small>{a.reason && <p>{a.reason}</p>}</div><div className="doctor-appointment-actions"><button className="doctor-accept" disabled={busyId===a.id} onClick={() => void updateStatus(a,'confirmed')}><Check size={14}/>Accept</button><button className="doctor-decline" disabled={busyId===a.id} onClick={() => void updateStatus(a,'rejected')}><X size={14}/>Decline</button></div></article>)}</div> : <DoctorEmpty>No appointment requests are waiting for your response.</DoctorEmpty>}
    </div>
    <div className="doctor-workspace-card"><div className="doctor-workspace-card-heading"><div><span className="eyebrow">YOUR VISITS</span><h2>Upcoming schedule</h2></div></div>{loading ? <DoctorEmpty>Loading appointments…</DoctorEmpty> : upcoming.length ? <div className="doctor-appointment-list">{upcoming.map(a => <article className="doctor-appointment-row" key={a.id}><div className="doctor-patient-avatar"><CalendarDays/></div><div className="doctor-appointment-main"><b>{a.patientName}</b><small>{stamp(a.scheduledStart)} · {appointmentType(a.appointmentType)}</small>{a.reason && <p>{a.reason}</p>}</div><span className="doctor-state confirmed">Confirmed</span></article>)}</div> : <DoctorEmpty>Your confirmed visits will appear here.</DoctorEmpty>}</div>
  </section>

  if (section === 'Online sessions') return <><section className="doctor-workspace"><SectionHeader kicker="VIRTUAL VISITS" title="Online sessions." text="Accept video appointments and join confirmed visits with patients." />{isDemo&&<PrivacyNote>Demo visits are fictional and cannot open a private call. Live video requires an authenticated CareSync account and the online-session migration.</PrivacyNote>}<div className="doctor-workspace-card"><div className="doctor-workspace-card-heading"><div><span className="eyebrow">VIDEO VISIT LIST</span><h2>{onlineAppointments.length} online {onlineAppointments.length===1?'session':'sessions'}</h2></div></div>{onlineAppointments.length?<div className="doctor-appointment-list">{onlineAppointments.map(visit=><article className="doctor-appointment-row" key={visit.id}><div className="doctor-patient-avatar"><CalendarDays/></div><div className="doctor-appointment-main"><b>{visit.patientName}</b><small>{stamp(visit.scheduledStart)} · Video consultation</small><p>{visit.status==='requested'?'Waiting for your response':visit.status==='confirmed'?'Accepted · patient can join during the session window':visit.status}</p></div>{visit.status==='requested'?<div className="doctor-appointment-actions"><button className="doctor-accept" disabled={busyId===visit.id} onClick={()=>void updateStatus(visit,'confirmed')}><Check size={14}/>Accept</button><button className="doctor-decline" disabled={busyId===visit.id} onClick={()=>void updateStatus(visit,'rejected')}><X size={14}/>Decline</button></div>:mayJoinVideo(visit)&&!isDemo?<button className="btn btn-primary btn-sm" onClick={()=>setActiveVideoVisit(visit)}><Video size={14}/> Join visit</button>:<span className={`doctor-state ${visit.status}`}>{visit.status==='confirmed'?'Join opens 15 min before':statusLabel(visit.status)}</span>}</article>)}</div>:<DoctorEmpty>Video appointment requests and confirmed online visits will appear here.</DoctorEmpty>}</div></section>{activeVideoVisit&&<VideoVisitRoom appointmentId={activeVideoVisit.id} userId={userId} role="doctor" otherName={activeVideoVisit.patientName} onClose={()=>setActiveVideoVisit(null)}/>}</>

  if (section === 'Patients') return <section className="doctor-workspace"><SectionHeader kicker="PATIENTS IN YOUR CARE" title="Patients." text="A private list of people connected to your appointment history." />{isDemo&&<PrivacyNote>Fictional sample patients only. Demo records are not saved.</PrivacyNote>}{error&&<div className="doctor-workspace-error">{error}</div>}<div className="doctor-workspace-card"><div className="doctor-workspace-card-heading"><div><span className="eyebrow">CARE TEAM</span><h2>Patient list</h2></div><span className="doctor-count-pill">{loading?'…':patients.length} patients</span></div>{loading?<DoctorEmpty>Loading patients…</DoctorEmpty>:patients.length?<div className="doctor-table-wrap"><table className="doctor-table"><thead><tr><th>PATIENT</th><th>LAST VISIT / REQUEST</th><th>VISIT TYPE</th><th>STATUS</th></tr></thead><tbody>{patients.map(a=><tr key={a.patientId}><td><div className="doctor-table-person"><span className="doctor-patient-avatar"><UserRound/></span><b>{a.patientName}</b></div></td><td>{day(a.scheduledStart)}</td><td>{appointmentType(a.appointmentType)}</td><td><span className={`doctor-state ${a.status}`}>{statusLabel(a.status)}</span></td></tr>)}</tbody></table></div>:<DoctorEmpty>Patients appear here when they request or attend an appointment with you.</DoctorEmpty>}</div></section>

  if (section === 'Consultations') return <section className="doctor-workspace"><SectionHeader kicker="VISIT NOTES" title="Consultations." text="Record clinical notes for completed visits and keep a concise treatment summary in the patient record." />{isDemo&&<PrivacyNote>Do not enter real patient information in demo mode. Notes stay in memory and clear when you reload.</PrivacyNote>}{error&&<div className="doctor-workspace-error">{error}</div>}
    {selectedConsultation ? <form className="doctor-workspace-card doctor-consult-form" onSubmit={saveConsultation}><div className="doctor-workspace-card-heading"><div><span className="eyebrow">{appointments.find(a=>a.id===selectedConsultation)?.patientName}</span><h2>Consultation note</h2></div><button type="button" className="doctor-close-button" onClick={()=>setSelectedConsultation('')} aria-label="Close">×</button></div><label>Clinical notes<textarea rows={4} maxLength={4000} required value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Record observations and relevant discussion"/></label><div className="doctor-form-grid"><label>Diagnosis <span>(optional)</span><input maxLength={500} value={diagnosis} onChange={e=>setDiagnosis(e.target.value)} /></label><label>Follow-up date <span>(optional)</span><input type="date" value={followUp} onChange={e=>setFollowUp(e.target.value)} /></label></div><label>Treatment plan <span>(optional)</span><textarea rows={3} maxLength={2000} value={plan} onChange={e=>setPlan(e.target.value)} placeholder="Plan and follow-up instructions"/></label><p className="doctor-form-hint">Saving a note completes this confirmed visit. Only you and the patient can access the saved consultation.</p><button className="btn btn-primary btn-sm" disabled={busyId===selectedConsultation}><Save size={14}/>{busyId===selectedConsultation?'Saving…':'Save consultation'}</button></form> : <div className="doctor-workspace-card"><div className="doctor-workspace-card-heading"><div><span className="eyebrow">COMPLETED VISITS</span><h2>Consultation notes</h2></div></div>{loading?<DoctorEmpty>Loading consultations…</DoctorEmpty>:completedWithoutNote.length||completedWithNotes.length?<div className="doctor-appointment-list">{[...completedWithoutNote,...completedWithNotes].map(a=><article className="doctor-consultation-row" key={a.id}><div className="doctor-patient-avatar"><FileText/></div><div className="doctor-appointment-main"><b>{a.patientName}</b><small>{day(a.scheduledStart)} · {a.consultationId?'Consultation saved':'Note needed'}</small>{a.consultationId&&<p>{a.diagnosis||a.clinicalNotes||'Clinical notes saved.'}</p>}</div><button className="btn btn-light btn-sm" onClick={()=>beginConsultation(a)}>{a.consultationId?'Edit note':'Record note'}</button></article>)}</div>:<DoctorEmpty>Complete a visit from your schedule. It will appear here so you can add consultation notes.</DoctorEmpty>}</div>}
  </section>

  return <section className="doctor-workspace"><SectionHeader kicker="MEDICATION ORDERS" title="Prescriptions." text="Create a prescription for a completed visit with a saved consultation. Patients see it after it is issued." />{isDemo&&<PrivacyNote>Demo prescriptions are fictional examples. Never enter real medication or patient information here.</PrivacyNote>}{error&&<div className="doctor-workspace-error">{error}</div>}
    <form className="doctor-workspace-card doctor-rx-form" onSubmit={issuePrescription}><div className="doctor-workspace-card-heading"><div><span className="eyebrow">NEW PRESCRIPTION</span><h2>Issue to a patient</h2></div></div><label>Completed visit<select value={rxAppointment} onChange={e=>setRxAppointment(e.target.value)} required><option value="">Choose a completed consultation</option>{consultationOptions.map(a=><option value={a.id} key={a.id}>{a.patientName} · {day(a.scheduledStart)}</option>)}</select></label>{medicines.map((medicine,index)=><fieldset className="doctor-medicine-fieldset" key={index}><legend>Medicine {index+1}</legend>{medicines.length>1&&<button className="doctor-remove-medicine" type="button" onClick={()=>setMedicines(current=>current.filter((_,i)=>i!==index))}>Remove</button>}<div className="doctor-medicine-grid"><label>Medicine name<input required maxLength={200} value={medicine.medication_name} onChange={e=>setMedicines(current=>current.map((m,i)=>i===index?{...m,medication_name:e.target.value}:m))}/></label><label>Dosage<input required maxLength={200} value={medicine.dosage} onChange={e=>setMedicines(current=>current.map((m,i)=>i===index?{...m,dosage:e.target.value}:m))}/></label><label>Route<input required maxLength={100} placeholder="e.g. oral" value={medicine.route} onChange={e=>setMedicines(current=>current.map((m,i)=>i===index?{...m,route:e.target.value}:m))}/></label><label>Schedule<input required maxLength={200} placeholder="As clinically prescribed" value={medicine.frequency} onChange={e=>setMedicines(current=>current.map((m,i)=>i===index?{...m,frequency:e.target.value}:m))}/></label><label>Duration<input required maxLength={100} value={medicine.duration} onChange={e=>setMedicines(current=>current.map((m,i)=>i===index?{...m,duration:e.target.value}:m))}/></label><label>Instructions <span>(optional)</span><input maxLength={1000} value={medicine.instructions} onChange={e=>setMedicines(current=>current.map((m,i)=>i===index?{...m,instructions:e.target.value}:m))}/></label></div></fieldset>)}<div className="doctor-rx-actions"><button type="button" className="btn btn-light btn-sm" onClick={()=>setMedicines(current=>[...current,blankMedicine()])}><Plus size={14}/> Add another medicine</button><button className="btn btn-primary btn-sm" disabled={loading||!!busyId||!consultationOptions.length}><CheckCircle2 size={14}/>{busyId?'Issuing…':'Issue prescription'}</button></div><p className="doctor-form-hint">Only issue medication instructions as the treating clinician. Issued prescriptions are visible to that patient.</p></form>
    <div className="doctor-workspace-card"><div className="doctor-workspace-card-heading"><div><span className="eyebrow">ISSUED BY YOU</span><h2>Prescription history</h2></div><span className="doctor-count-pill">{prescriptions.length}</span></div>{loading?<DoctorEmpty>Loading prescriptions…</DoctorEmpty>:prescriptions.length?<div className="doctor-prescription-list">{prescriptions.map(rx=><article className="doctor-prescription-card" key={rx.id}><div className="doctor-prescription-heading"><div><b>{rx.patientName}</b><small>Issued {rx.issuedAt?day(rx.issuedAt):'date unavailable'}</small></div><span className="doctor-state confirmed">Finalized</span></div>{rx.items.map((item,index)=><div className="doctor-prescription-item" key={`${rx.id}-${index}`}><b>{item.medication_name}</b><span>{item.dosage} · {item.route} · {item.frequency} · {item.duration}</span>{item.instructions&&<small>{item.instructions}</small>}</div>)}</article>)}</div>:<DoctorEmpty>No issued prescriptions yet. Save a consultation first, then create a prescription.</DoctorEmpty>}</div>
  </section>
}

function AvailabilityManager({ doctorId, userId, isDemo }: { doctorId?: string; userId?: string; isDemo: boolean }) {
  const [rows, setRows] = useState<AvailabilityRow[]>([])
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [scope, setScope] = useState<'weekly'|'date'>('weekly')
  const [weekday, setWeekday] = useState(1)
  const [dateValue, setDateValue] = useState(new Date().toISOString().slice(0, 10))
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('17:00')
  const [duration, setDuration] = useState(30)
  const [availabilityStatus, setAvailabilityStatus] = useState<AvailabilityRow['availability_status']>('available')
  const [allDay, setAllDay] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    if (!doctorId) return
    if (isDemo) { setRows(readDemoSchedule(doctorId)); setTimezone(readDemoTimezone(doctorId)); return }
    if (!supabase || !userId) return
    let active = true
    void Promise.all([
      supabase.from('doctor_availability').select('id,weekday,available_on,start_time,end_time,slot_duration,availability_status').eq('doctor_id', doctorId).order('available_on', { ascending: true, nullsFirst: true }).order('weekday'),
      supabase.from('doctor_profiles').select('time_zone').eq('id', doctorId).maybeSingle(),
    ]).then(([availability, profile]) => {
      if (!active) return
      if (availability.error) setMessage('Could not load availability. Apply the doctor schedule migration and confirm your profile is approved.')
      else setRows((availability.data || []) as AvailabilityRow[])
      if (profile.data?.time_zone) setTimezone(profile.data.time_zone)
    })
    return () => { active = false }
  }, [doctorId, userId, isDemo])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!doctorId || start >= end) { setMessage('Choose a valid doctor profile and an end time after the start.'); return }
    const payload = { doctor_id: doctorId, weekday: scope === 'weekly' ? weekday : null, available_on: scope === 'date' ? dateValue : null, start_time: start, end_time: end, slot_duration: duration, availability_status: availabilityStatus }
    setBusy(true); setMessage('')
    if (isDemo) {
      const row: AvailabilityRow = { ...payload, id: `demo-availability-${Date.now()}` }
      const next = [row, ...rows]; writeDemoSchedule(doctorId, next); setRows(next)
      recordDemoActivity('doctor','availability.created','doctor_availability',row.id)
    } else if (supabase) {
      const { data, error: saveError } = await supabase.from('doctor_availability').insert(payload).select('id,weekday,available_on,start_time,end_time,slot_duration,availability_status').single()
      if (saveError || !data) { setBusy(false); setMessage(saveError?.message.includes('approved doctor') ? 'Availability changes are available after your doctor profile is approved.' : 'Could not add this availability range. Check for a conflicting schedule and try again.'); return }
      setRows(current => [data as AvailabilityRow, ...current])
    }
    setBusy(false); setMessage('Availability saved. Patients can now request appointments in these slots.')
  }

  const changeTimezone = async (value: string) => {
    setTimezone(value); setMessage('')
    if (isDemo && doctorId) { writeDemoTimezone(doctorId, value); return }
    if (!supabase || !doctorId) return
    const { error: timezoneError } = await supabase.from('doctor_profiles').update({ time_zone: value }).eq('id', doctorId)
    if (timezoneError) setMessage('Could not save the time zone. Apply the schedule migration first.')
    else setMessage('Schedule time zone updated.')
  }

  const remove = async (row: AvailabilityRow) => {
    if (!doctorId) return
    if (isDemo) { const next = rows.filter(item => item.id !== row.id); writeDemoSchedule(doctorId, next); setRows(next); recordDemoActivity('doctor','availability.deleted','doctor_availability',row.id); return }
    if (!supabase) return
    const { error: removeError } = await supabase.from('doctor_availability').delete().eq('id', row.id)
    if (removeError) { setMessage('Could not remove this availability range.'); return }
    setRows(current => current.filter(item => item.id !== row.id))
  }
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const importSchedule = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !doctorId) return
    setImporting(true); setMessage('Reading timetable…')
    try {
      const grid = await readScheduleSpreadsheet(file)
      const headers = (grid.shift() || []).map(value => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' '))
      const column = (...names: string[]) => headers.findIndex(header => names.includes(header.trim()))
      const dayColumn = column('day','weekday'), dateColumn = column('date'), startColumn = column('start','start time'), endColumn = column('end','end time'), durationColumn = column('slot minutes','slot length minutes','duration minutes'), statusColumn = column('status','availability')
      if ((dayColumn < 0 && dateColumn < 0) || startColumn < 0 || endColumn < 0) throw new Error('Add the columns Day (or Date), Start, and End to your sheet. Download the sample timetable for the full format.')
      const excelDate = (value: string) => {
        const clean = value.trim()
        if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean
        if (/^\d{5}(\.\d+)?$/.test(clean)) return new Date(Date.UTC(1899,11,30) + Number(clean) * 86400000).toISOString().slice(0,10)
        const parsed = new Date(clean)
        return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0,10)
      }
      const clock = (value: string) => {
        const clean = value.trim()
        if (/^0?\.\d+$/.test(clean)) { const mins = Math.round(Number(clean) * 1440); return `${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}` }
        const match = clean.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i)
        if (!match) return ''
        let hour = Number(match[1]); const minute = Number(match[2]); const meridiem = match[3]?.toUpperCase()
        if (minute > 59 || hour > 23 || (meridiem && (hour < 1 || hour > 12))) return ''
        if (meridiem) hour = (hour % 12) + (meridiem === 'PM' ? 12 : 0)
        return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`
      }
      const rowsToImport: AvailabilityRow[] = grid.map((cells,index) => {
        const date = dateColumn < 0 ? '' : excelDate(cells[dateColumn] || '')
        const weekdayText = (cells[dayColumn] || '').trim().toLowerCase()
        const weekday = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].findIndex(day => day.startsWith(weekdayText))
        const statusText = (statusColumn < 0 ? 'available' : (cells[statusColumn] || 'available')).trim().toLowerCase()
        const status = statusText === 'holiday' || statusText === 'off' ? 'blocked' : statusText
        if (!['available','blocked','leave'].includes(status)) throw new Error(`Row ${index + 2}: Status must be available, blocked, leave, holiday, or off.`)
        if (!date && weekday < 0) throw new Error(`Row ${index + 2}: enter a valid weekday or a date in YYYY-MM-DD format.`)
        const allDay = status !== 'available' && !(cells[startColumn] || '').trim() && !(cells[endColumn] || '').trim()
        const from = allDay ? '00:00' : clock(cells[startColumn] || '')
        const to = allDay ? '23:59' : clock(cells[endColumn] || '')
        if (!from || !to || from >= to) throw new Error(`Row ${index + 2}: use valid start and end times, or leave both blank for a full-day closure.`)
        const minutes = durationColumn < 0 ? 30 : Number(cells[durationColumn] || 30)
        if (!Number.isInteger(minutes) || minutes < 10 || minutes > 240) throw new Error(`Row ${index + 2}: slot minutes must be between 10 and 240.`)
        return { id: `import-${Date.now()}-${index}`, weekday: date ? null : weekday, available_on: date || null, start_time: from, end_time: to, slot_duration: minutes, availability_status: status as AvailabilityRow['availability_status'] }
      }).filter(row => row.weekday !== null || row.available_on !== null)
      if (!rowsToImport.length) throw new Error('The sheet has no schedule rows to import.')
      setBusy(true)
      if (isDemo) {
        writeDemoSchedule(doctorId, rowsToImport); setRows(rowsToImport)
        recordDemoActivity('doctor','availability.imported','doctor_availability',null)
      } else if (supabase) {
        const payload = rowsToImport.map(({id: _id,...row}) => ({...row,doctor_id:doctorId}))
        const { data, error: importError } = await supabase.from('doctor_availability').insert(payload).select('id,weekday,available_on,start_time,end_time,slot_duration,availability_status')
        if (importError || !data) throw new Error('The timetable could not be saved. Check for overlapping ranges and confirm your doctor profile is approved.')
        setRows(current => [...(data as AvailabilityRow[]),...current])
      }
      setMessage(`${rowsToImport.length} schedule ranges imported. Review the weekly timetable and date exceptions below.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not import this timetable.') }
    finally { setBusy(false); setImporting(false) }
  }
  const weeklyRows = days.map((name, index) => ({name, rows: rows.filter(row => row.available_on === null && row.weekday === index).sort((a,b)=>a.start_time.localeCompare(b.start_time))}))
  const exceptions = rows.filter(row => row.available_on !== null).sort((a,b)=>(a.available_on||'').localeCompare(b.available_on||''))
  return <section className="doctor-availability-card"><header><div><span className="eyebrow">AVAILABILITY SETTINGS</span><h2>Weekly timetable & time off</h2><p>Set your regular hours, split shifts, holidays, and leave. Patients can request only open slots, and you still approve each request.</p></div><label className="doctor-timezone-label">Practice time zone<select value={timezone} onChange={e => void changeTimezone(e.target.value)}><option value="Asia/Kolkata">India · Kolkata</option><option value="America/New_York">US Eastern</option><option value="America/Chicago">US Central</option><option value="America/Denver">US Mountain</option><option value="America/Los_Angeles">US Pacific</option><option value="Europe/London">UK · London</option><option value="Europe/Paris">Central Europe · Paris</option><option value="Asia/Dubai">UAE · Dubai</option><option value="Asia/Singapore">Singapore</option><option value="Australia/Sydney">Australia · Sydney</option></select></label></header>
    <div className="doctor-timetable-tools"><div><b>Import a complete week</b><small>Upload .xlsx or .csv. Date rows let you add holidays, closures, or leave.</small></div><button className="btn btn-light btn-sm" type="button" onClick={downloadScheduleTemplate}><FileSpreadsheet size={14}/> Download sample</button><label className="btn btn-primary btn-sm"><Upload size={14}/>{importing?'Reading…':'Upload timetable'}<input type="file" accept=".xlsx,.csv" disabled={busy} onChange={event=>void importSchedule(event)} hidden/></label></div>
    <form className="doctor-availability-form" onSubmit={save}><label>Schedule repeats<select value={scope} onChange={e => setScope(e.target.value as 'weekly'|'date')}><option value="weekly">Every week</option><option value="date">One date only</option></select></label>{scope==='weekly'?<label>Weekday<select value={weekday} onChange={e => setWeekday(Number(e.target.value))}>{days.map((day,index)=><option key={day} value={index}>{day}</option>)}</select></label>:<label>Date<input type="date" min={new Date().toISOString().slice(0,10)} value={dateValue} onChange={e=>setDateValue(e.target.value)} required/></label>}<label>Start time<input type="time" value={start} onChange={e=>setStart(e.target.value)} required disabled={allDay}/></label><label>End time<input type="time" value={end} onChange={e=>setEnd(e.target.value)} required disabled={allDay}/></label><label>Visit length<select value={duration} onChange={e=>setDuration(Number(e.target.value))}><option value={15}>15 minutes</option><option value={20}>20 minutes</option><option value={30}>30 minutes</option><option value={45}>45 minutes</option><option value={60}>60 minutes</option></select></label><label>Time status<select value={availabilityStatus} onChange={e=>setAvailabilityStatus(e.target.value as AvailabilityRow['availability_status'])}><option value="available">Open for booking</option><option value="blocked">Blocked time</option><option value="leave">Leave</option></select></label>{scope==='date'&&availabilityStatus!=='available'&&<label className="doctor-all-day-label"><input type="checkbox" checked={allDay} onChange={event=>{setAllDay(event.target.checked);if(event.target.checked){setStart('00:00');setEnd('23:59')}}}/> Full day</label>}<button className="btn btn-primary btn-sm" disabled={busy}>{busy?'Saving…':'Add time range'}</button></form>{message&&<div className="doctor-availability-message" role="status">{message}</div>}
    <div className="doctor-timetable"><div className="doctor-timetable-heading"><div><span className="eyebrow">REPEATS EVERY WEEK</span><h3>Weekly timetable</h3></div><span>{rows.filter(row=>row.available_on===null&&row.availability_status==='available').length} open ranges</span></div><div className="doctor-week-grid">{weeklyRows.map(day=><article key={day.name}><b>{day.name}</b>{day.rows.length?day.rows.map(row=><div className={`doctor-week-range ${row.availability_status}`} key={row.id}><span>{row.start_time.slice(0,5)}–{row.end_time.slice(0,5)}</span><small>{row.availability_status==='available'?`${row.slot_duration} min visits`:row.availability_status==='leave'?'Leave':'Blocked'}</small><button onClick={()=>void remove(row)} aria-label={`Remove ${day.name} time range`}>×</button></div>):<p>Off</p>}</article>)}</div></div>
    <div className="doctor-availability-list"><div className="doctor-timetable-heading"><div><span className="eyebrow">ONE-TIME CHANGES</span><h3>Holidays, leave & extra hours</h3></div><span>{exceptions.length} dates</span></div>{exceptions.length?exceptions.map(row=><article key={row.id}><span className={`availability-marker ${row.availability_status}`}/><div><b>{new Date(`${row.available_on}T00:00:00`).toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric',year:'numeric'})}</b><small>{row.start_time.slice(0,5)}–{row.end_time.slice(0,5)} · {row.availability_status==='available'?`${row.slot_duration} min · extra opening`:row.availability_status==='leave'?'Leave':'Holiday / blocked'}</small></div><button type="button" onClick={()=>void remove(row)} aria-label="Remove date exception">Remove</button></article>):<p className="doctor-availability-empty">No holiday or leave dates set. Add a one-date range or import a timetable.</p>}</div></section>
}

function appointmentType(value: string) { return value === 'in_person' ? 'In person' : value === 'video' ? 'Video' : value === 'phone' ? 'Phone' : value }
function statusLabel(value: string) { return value === 'requested' ? 'Waiting' : value.charAt(0).toUpperCase() + value.slice(1) }
function DoctorEmpty({ children }: { children: React.ReactNode }) { return <div className="doctor-workspace-empty"><Stethoscope size={20}/><span>{children}</span></div> }
