import { useEffect, useState, type ChangeEvent } from 'react'
import { ArrowDownToLine, CalendarDays, ExternalLink, FilePlus2, FileText, Pill, ReceiptText, ShieldCheck, Upload, WalletCards } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getDemoConsultations, getDemoPrescriptions, subscribeDemoAppointments } from '../lib/demoStore'
import '../medicine-links.css'

type PatientProps = { userId?: string; isDemo: boolean; onNotice: (message: string) => void }
type MedicalDocument = { id: string; document_type: string; storage_path: string; description: string | null; created_at: string }
type Medicine = { id: string; medication_name: string; dosage: string; route: string; frequency: string; duration: string; instructions: string | null }
type Prescription = { id: string; status: string; issued_at: string | null; created_at: string; doctor_id: string; items: Medicine[]; doctorName: string }
type Invoice = { id: string; amount: number; currency: string; payment_status: string; created_at: string }
type VisitSummary = { id:string; doctorName:string; clinical_notes:string; diagnosis:string|null; treatment_plan:string|null; follow_up_date:string|null; created_at:string }

const date = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const money = (amount: number, currency: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 2 }).format(amount)
const demoDocuments: MedicalDocument[] = [
  { id: 'sample-labs', document_type: 'Lab report', storage_path: '', description: 'Fictional example · routine blood panel', created_at: '2026-08-12T10:00:00Z' },
  { id: 'sample-visit', document_type: 'Visit summary', storage_path: '', description: 'Fictional example · general check-up', created_at: '2026-07-20T10:00:00Z' },
]
const demoPrescriptions: Prescription[] = [{ id: 'sample-prescription', status: 'finalized', issued_at: '2026-08-12T10:00:00Z', created_at: '2026-08-12T10:00:00Z', doctor_id: '', doctorName: 'Dr. Shreya · sample', items: [{ id: 'sample-medicine', medication_name: 'Example medicine', dosage: 'As directed by your clinician', route: '—', frequency: 'See clinician instructions', duration: 'See clinician instructions', instructions: 'Fictional example only. This is not a real prescription or medication recommendation.' }] }]
const sharedPrescriptions = (patientId?:string): Prescription[] => (patientId?getDemoPrescriptions(patientId):[]).map(rx=>({id:rx.id,status:'finalized',issued_at:rx.issuedAt,created_at:rx.issuedAt,doctor_id:'',doctorName:rx.doctorName,items:rx.items.map((item,index)=>({...item,id:`${rx.id}-${index}`}))}))
const demoInvoices: Invoice[] = [{ id: 'sample-invoice', amount: 750, currency: 'INR', payment_status: 'paid', created_at: '2026-08-12T10:00:00Z' }, { id: 'sample-invoice-2', amount: 500, currency: 'INR', payment_status: 'pending', created_at: '2026-07-20T10:00:00Z' }]

function Banner({ children }: { children: React.ReactNode }) { return <div className="health-banner"><ShieldCheck size={17} /><span>{children}</span></div> }
function HealthHeading({ eyebrow, title, text, icon }: { eyebrow: string; title: string; text: string; icon: React.ReactNode }) { return <div className="health-heading"><span className="health-heading-icon">{icon}</span><div><span className="health-eyebrow">{eyebrow}</span><h2>{title}</h2><p>{text}</p></div></div> }
function HealthEmpty({ children }: { children: React.ReactNode }) { return <div className="health-empty"><FileText size={22} /><span>{children}</span></div> }

export function PatientMedicalRecords({ userId, isDemo, onNotice }: PatientProps) {
  const [documents, setDocuments] = useState<MedicalDocument[]>(isDemo ? demoDocuments : [])
  const [summaries, setSummaries] = useState<VisitSummary[]>([])
  const [kind, setKind] = useState('Lab report')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(!isDemo)
  useEffect(() => {
    if (isDemo || !supabase || !userId) { setLoading(false); return }
    let active = true
    void supabase.from('medical_documents').select('id,document_type,storage_path,description,created_at').eq('patient_id', userId).order('created_at', { ascending: false }).then(({ data, error }) => {
      if (!active) return
      if (error) onNotice('Could not load medical records. Check your account access and database setup.')
      else setDocuments((data || []) as MedicalDocument[])
      setLoading(false)
    })
    return () => { active = false }
  }, [userId, isDemo])
  useEffect(() => {
    if (isDemo) {
      const sync=()=>setSummaries((userId?getDemoConsultations(userId):[]).map(item=>({id:item.id,doctorName:item.doctorName,clinical_notes:item.clinicalNotes,diagnosis:item.diagnosis,treatment_plan:item.treatmentPlan,follow_up_date:item.followUpDate,created_at:item.createdAt})))
      sync();return subscribeDemoAppointments(sync)
    }
    if(!supabase||!userId)return
    let active=true
    void (async()=>{
      const {data,error}=await supabase!.from('consultations').select('id,doctor_id,clinical_notes,diagnosis,treatment_plan,follow_up_date,created_at').eq('patient_id',userId).order('created_at',{ascending:false}).limit(100)
      if(!active)return
      if(error){onNotice('Could not load visit summaries. Check your account access and database setup.');return}
      const rows=(data||[]) as (Omit<VisitSummary,'doctorName'> & {doctor_id:string})[]
      const doctorIds=[...new Set(rows.map(row=>row.doctor_id))]
      if(!doctorIds.length){setSummaries([]);return}
      const {data:doctorRows}=await supabase!.from('doctor_profiles').select('id,user_id').in('id',doctorIds)
      const userIds=(doctorRows||[]).map(row=>row.user_id)
      const {data:profiles}=userIds.length?await supabase!.from('profiles').select('id,full_name').in('id',userIds):{data:[] as any[]}
      if(!active)return
      setSummaries(rows.map(row=>{const doctor=(doctorRows||[]).find(item=>item.id===row.doctor_id);return {...row,doctorName:(profiles||[]).find(item=>item.id===doctor?.user_id)?.full_name||'Care team'}}))
    })()
    return()=>{active=false}
  },[userId,isDemo])
  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] || null)
  const upload = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!file) { onNotice('Choose a PDF, JPG, or PNG file first.'); return }
    if (file.size > 10 * 1024 * 1024) { onNotice('Choose a file smaller than 10 MB.'); return }
    if (isDemo) { onNotice('Demo mode does not save medical files. Connect a patient account to upload privately.'); return }
    if (!supabase || !userId) { onNotice('Sign in to a patient account to upload records.'); return }
    setBusy(true)
    const extension = file.name.split('.').pop()?.toLowerCase() || ''
    if (!['pdf', 'jpg', 'jpeg', 'png'].includes(extension)) { setBusy(false); onNotice('Only PDF, JPG, and PNG files are supported.'); return }
    const path = `${userId}/${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await supabase.storage.from('medical-documents').upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) { setBusy(false); onNotice('Upload failed. Check your connection and try again.'); return }
    const { data, error } = await supabase.from('medical_documents').insert({ patient_id: userId, uploaded_by: userId, document_type: kind, storage_path: path, description: description.trim() || null }).select('id,document_type,storage_path,description,created_at').single()
    if (error) {
      await supabase.storage.from('medical-documents').remove([path])
      setBusy(false); onNotice('The file could not be added to your record. Try again.'); return
    }
    setDocuments((current) => [data as MedicalDocument, ...current]); setFile(null); setDescription(''); setBusy(false); onNotice('Medical record uploaded securely.')
  }
  const open = async (document: MedicalDocument) => {
    if (isDemo || !supabase) { onNotice('This fictional demo record has no file attached.'); return }
    const { data, error } = await supabase.storage.from('medical-documents').createSignedUrl(document.storage_path, 60)
    if (error || !data?.signedUrl) { onNotice('This file could not be opened. Check your account access.'); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }
  return <section className="patient-health"><HealthHeading eyebrow="YOUR HEALTH RECORD" title="Medical records." text="Keep reports, visit summaries, and documents together in your private patient record." icon={<FileText />} />
    {isDemo ? <Banner>Fictional examples only. Demo mode does not upload or save medical files. Do not add real health information here.</Banner> : <Banner>Files are stored in a private bucket and opened with a short-lived secure link.</Banner>}
    {summaries.length>0&&<section className="health-card visit-summary-list"><div className="health-card-title"><CalendarDays size={18}/><div><b>Visit summaries from your care team</b><small>Consultation notes your doctor has shared with your record</small></div></div>{summaries.map(item=><article className="visit-summary-card" key={item.id}><header><b>{item.doctorName}</b><time>{date(item.created_at)}</time></header>{item.diagnosis&&<p><strong>Diagnosis</strong>{item.diagnosis}</p>}<p><strong>Consultation notes</strong>{item.clinical_notes}</p>{item.treatment_plan&&<p><strong>Plan</strong>{item.treatment_plan}</p>}{item.follow_up_date&&<p><strong>Follow-up</strong>{date(`${item.follow_up_date}T00:00:00`)}</p>}</article>)}</section>}
    <div className="health-columns"><form className="health-card health-upload" onSubmit={upload}><div className="health-card-title"><FilePlus2 size={18}/><div><b>Add a record</b><small>PDF, JPG, or PNG · up to 10 MB</small></div></div><label>Record type<select value={kind} onChange={e => setKind(e.target.value)}><option>Lab report</option><option>Imaging</option><option>Visit summary</option><option>Referral</option><option>Other</option></select></label><label>File<input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={chooseFile} /><small className="health-file-name">{file?.name || 'No file selected'}</small></label><label>Description <span className="health-optional">(optional)</span><textarea rows={2} maxLength={500} value={description} onChange={e => setDescription(e.target.value)} placeholder="A short note to help identify this record" /></label><button className="btn btn-primary btn-sm" disabled={busy || isDemo}><Upload size={14}/>{busy ? 'Uploading…' : 'Upload privately'}</button>{isDemo && <small className="health-hint">Sign in with a connected patient account to use uploads.</small>}</form>
      <div className="health-card"><div className="health-card-title"><FileText size={18}/><div><b>Your records</b><small>{loading ? 'Loading your private records…' : `${documents.length} ${documents.length === 1 ? 'record' : 'records'}`}</small></div></div>{loading ? <HealthEmpty>Loading records…</HealthEmpty> : documents.length ? <div className="health-list">{documents.map(item => <article className="health-list-row" key={item.id}><span className="health-file-icon"><FileText size={17}/></span><div className="health-list-main"><b>{item.document_type}</b><small>{item.description || 'No description'} · {date(item.created_at)}</small></div><button className="health-icon-button" onClick={() => void open(item)} aria-label={`Open ${item.document_type}`}><ArrowDownToLine size={16}/></button></article>)}</div> : <HealthEmpty>No records yet. Upload a report or visit document when ready.</HealthEmpty>}</div></div>
  </section>
}

export function PatientPrescriptions({ userId, isDemo }: PatientProps) {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>(isDemo ? [...sharedPrescriptions(userId),...demoPrescriptions] : [])
  const [loading, setLoading] = useState(!isDemo)
  const [error, setError] = useState('')
  useEffect(() => {
    if (isDemo) { const sync=()=>setPrescriptions([...sharedPrescriptions(userId),...demoPrescriptions]);sync();setLoading(false);return subscribeDemoAppointments(sync) }
    if (!supabase || !userId) { setLoading(false); return }
    let active = true
    void (async () => {
      const { data, error: queryError } = await supabase!.from('prescriptions').select('id,status,issued_at,created_at,doctor_id').eq('patient_id', userId).in('status', ['finalized', 'amended']).order('issued_at', { ascending: false, nullsFirst: false })
      if (!active) return
      if (queryError) { setError('Prescriptions could not be loaded. Check your account access and database setup.'); setLoading(false); return }
      const rows = data || []
      const ids = rows.map(row => row.id)
      const doctorIds = [...new Set(rows.map(row => row.doctor_id))]
      const [{ data: items }, { data: doctors }] = await Promise.all([
        ids.length ? supabase!.from('prescription_items').select('id,prescription_id,medication_name,dosage,route,frequency,duration,instructions').in('prescription_id', ids) : Promise.resolve({ data: [] as any[] }),
        doctorIds.length ? supabase!.from('doctor_profiles').select('id,profiles!inner(full_name)').in('id', doctorIds) : Promise.resolve({ data: [] as any[] }),
      ])
      if (!active) return
      setPrescriptions(rows.map(row => ({ ...row, doctorName: (doctors || []).find((doctor: any) => doctor.id === row.doctor_id)?.profiles?.full_name || 'Care team', items: (items || []).filter((item: any) => item.prescription_id === row.id) })))
      setLoading(false)
    })()
    return () => { active = false }
  }, [userId, isDemo])
  return <section className="patient-health"><HealthHeading eyebrow="MEDICATION PLAN" title="Prescriptions." text="Review instructions your care team has issued. Contact the prescriber or pharmacist if anything is unclear. Pharmacy links are optional search shortcuts; confirm the exact strength and formulation before purchase." icon={<Pill />} />
    {isDemo && <Banner>Fictional example only. It is not a real prescription or medication recommendation.</Banner>}
    {error && <div className="health-error" role="alert">{error}</div>}
    {loading ? <div className="health-card"><HealthEmpty>Loading prescriptions…</HealthEmpty></div> : prescriptions.length ? <div className="prescription-list">{prescriptions.map(rx => <article className="health-card prescription-card" key={rx.id}><div className="prescription-header"><span className="health-file-icon"><Pill size={17}/></span><div><b>{rx.doctorName}</b><small>Issued {date(rx.issued_at || rx.created_at)}</small></div><span className={`health-status ${rx.status}`}>{rx.status === 'amended' ? 'Updated' : 'Final'}</span></div>{rx.items.length ? rx.items.map(item => <div className="medicine-row" key={item.id}><div className="medicine-name"><b>{item.medication_name}</b><span>{item.dosage} · {item.route}</span></div><div><small>Schedule</small><b>{item.frequency}</b></div><div><small>Duration</small><b>{item.duration}</b></div>{item.instructions && <p>{item.instructions}</p>}<div className="medicine-buy-links"><span>Find this medicine</span><a href={`https://www.apollopharmacy.in/search-medicines/${encodeURIComponent(item.medication_name.trim().toLowerCase().replace(/\s+/g,'-'))}`} target="_blank" rel="noopener noreferrer">Apollo Pharmacy <ExternalLink size={12}/></a><a href={`https://www.1mg.com/search/all?name=${encodeURIComponent(item.medication_name)}`} target="_blank" rel="noopener noreferrer">Tata 1mg <ExternalLink size={12}/></a></div></div>) : <HealthEmpty>No medication details are attached to this prescription.</HealthEmpty>}</article>)}</div> : <div className="health-card"><HealthEmpty>Your care team has not added a finalized prescription.</HealthEmpty></div>}
  </section>
}

export function PatientBilling({ userId, isDemo }: PatientProps) {
  const [invoices, setInvoices] = useState<Invoice[]>(isDemo ? demoInvoices : [])
  const [loading, setLoading] = useState(!isDemo)
  const [error, setError] = useState('')
  useEffect(() => {
    if (isDemo || !supabase || !userId) { setLoading(false); return }
    let active = true
    void supabase.from('invoices').select('id,amount,currency,payment_status,created_at').eq('patient_id', userId).order('created_at', { ascending: false }).then(({ data, error: queryError }) => {
      if (!active) return
      if (queryError) setError('Billing details could not be loaded. Check your account access and database setup.')
      else setInvoices((data || []).map(row => ({ ...row, amount: Number(row.amount) })))
      setLoading(false)
    })
    return () => { active = false }
  }, [userId, isDemo])
  const unpaid = invoices.filter(invoice => invoice.payment_status === 'pending').reduce((sum, invoice) => sum + invoice.amount, 0)
  const paid = invoices.filter(invoice => invoice.payment_status === 'paid').reduce((sum, invoice) => sum + invoice.amount, 0)
  return <section className="patient-health"><HealthHeading eyebrow="VISIT COSTS" title="Billing." text="Review invoices and payment status for your visits." icon={<WalletCards />} />
    {isDemo && <Banner>Fictional sample invoices. Payments are not connected in this demo.</Banner>}
    {error && <div className="health-error" role="alert">{error}</div>}
    <div className="health-billing-summary"><div className="health-card billing-metric"><span>Amount due</span><b>{loading ? '—' : money(unpaid, invoices[0]?.currency || 'INR')}</b><small>Pending invoices</small></div><div className="health-card billing-metric"><span>Paid</span><b>{loading ? '—' : money(paid, invoices[0]?.currency || 'INR')}</b><small>Recorded payments</small></div></div>
    <div className="health-card"><div className="health-card-title"><ReceiptText size={18}/><div><b>Invoices</b><small>{loading ? 'Loading invoices…' : `${invoices.length} ${invoices.length === 1 ? 'invoice' : 'invoices'}`}</small></div></div>{loading ? <HealthEmpty>Loading invoices…</HealthEmpty> : invoices.length ? <div className="health-list">{invoices.map(invoice => <article className="health-list-row invoice-row" key={invoice.id}><span className="health-file-icon"><ReceiptText size={17}/></span><div className="health-list-main"><b>{money(invoice.amount, invoice.currency)}</b><small>Visit invoice · {date(invoice.created_at)}</small></div><span className={`invoice-status ${invoice.payment_status}`}>{invoice.payment_status}</span><button className="health-icon-button" title="Invoice download is not available yet" aria-label="Invoice download unavailable" disabled><ArrowDownToLine size={16}/></button></article>)}</div> : <HealthEmpty>There are no invoices on your account yet.</HealthEmpty>}</div>
    <div className="health-payment-note"><CalendarDays size={16}/><span><b>Payments are not available here yet.</b><small>CareSync displays invoice status only. Contact your clinic for a copy, correction, or payment instructions.</small></span></div>
  </section>
}
