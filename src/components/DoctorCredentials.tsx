import { useEffect, useState, type FormEvent } from 'react'
import { ArrowDownToLine, BadgeCheck, FileText, LoaderCircle, ShieldCheck, Upload, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import '../doctor-credentials.css'

type Credential = { id: string; storage_path: string; file_name: string; credential_type: string; review_status: 'pending'|'verified'|'rejected'; review_note: string|null; created_at: string }
const maxBytes = 10 * 1024 * 1024
const allowedTypes = ['application/pdf','image/jpeg','image/png']
const allowedExtensions = ['pdf','jpg','jpeg','png']

export function DoctorCredentials({ userId, isDemo, qualifications, onSaveQualifications, onNotice }: { userId?: string; isDemo: boolean; qualifications: string; onSaveQualifications: (value: string) => Promise<void>; onNotice: (message: string) => void }) {
  const [value, setValue] = useState(qualifications)
  const [kind, setKind] = useState('Medical degree')
  const [files, setFiles] = useState<Credential[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [openFile, setOpenFile] = useState('')
  const [problem, setProblem] = useState('')
  useEffect(() => setValue(qualifications), [qualifications])
  const load = async () => {
    if (!supabase || !userId || isDemo) return
    setLoading(true); setProblem('')
    const { data, error } = await supabase.from('doctor_credential_documents').select('id,storage_path,file_name,credential_type,review_status,review_note,created_at').eq('user_id', userId).order('created_at', { ascending: false })
    if (error) setProblem('Credential uploads need the doctor credential database migration.')
    else setFiles((data || []) as Credential[])
    setLoading(false)
  }
  useEffect(() => { void load() }, [userId, isDemo])
  const save = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try { await onSaveQualifications(value.trim()); onNotice('Professional qualifications saved to your provider profile.') }
    catch { /* The parent displays a specific save error. */ }
    finally { setSaving(false) }
  }
  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase || !userId || isDemo) { onNotice('Secure document uploads are available after a doctor account is connected to CareSync.'); return }
    const form = event.currentTarget
    const input = form.elements.namedItem('credential-file') as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    const extension = file.name.split('.').pop()?.toLowerCase() || ''
    if (file.size <= 0 || file.size > maxBytes || (!allowedTypes.includes(file.type) && !allowedExtensions.includes(extension))) { onNotice('Choose a PDF, JPG, or PNG file up to 10 MB.'); return }
    setUploading(true); setProblem('')
    const safeName = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-100) || `credential.${extension}`
    const path = `${userId}/${crypto.randomUUID()}-${safeName}`
    const { error: uploadError } = await supabase.storage.from('doctor-credentials').upload(path, file, { contentType: allowedTypes.includes(file.type) ? file.type : extension === 'pdf' ? 'application/pdf' : extension === 'png' ? 'image/png' : 'image/jpeg', upsert: false })
    if (uploadError) { setUploading(false); setProblem(uploadError.message.includes('Bucket not found') ? 'Apply the doctor credential migration before uploading.' : 'The private upload failed. Check your connection and try again.'); return }
    const { error: metadataError } = await supabase.from('doctor_credential_documents').insert({ user_id: userId, storage_path: path, file_name: safeName, credential_type: kind })
    if (metadataError) {
      await supabase.storage.from('doctor-credentials').remove([path])
      setUploading(false); setProblem('The file could not be registered for review. Try again after checking the database migration.'); return
    }
    input.value = ''; setUploading(false); await load(); onNotice('Qualification document uploaded privately for administrator review.')
  }
  const preview = async (credential: Credential) => {
    if (!supabase) return
    setOpenFile(credential.id)
    const { data, error } = await supabase.storage.from('doctor-credentials').createSignedUrl(credential.storage_path, 60)
    setOpenFile('')
    if (error || !data?.signedUrl) { onNotice('The private document link could not be created.'); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  return <section className="doctor-credential-card"><header><span className="settings-icon"><ShieldCheck/></span><div><h2>Professional credentials</h2><p>Add your qualifications and submit supporting documents for administrator review.</p></div></header>
    <form className="doctor-qualification-form" onSubmit={event=>void save(event)}><label>Qualifications shown on your profile<textarea rows={3} maxLength={1000} value={value} onChange={event=>setValue(event.target.value)} placeholder="For example: MBBS, MD (Internal Medicine)" required/><small>Use accurate details. Documents are reviewed before a credential is marked verified.</small></label><button className="btn btn-light btn-sm" disabled={saving||value.trim()===qualifications.trim()}>{saving?'Saving…':'Save qualifications'}</button></form>
    <form className="doctor-credential-upload" onSubmit={event=>void upload(event)}><label>Document type<select value={kind} onChange={event=>setKind(event.target.value)}><option>Medical degree</option><option>Specialty qualification</option><option>Professional registration</option><option>Board certification</option><option>Other qualification</option></select></label><label className="credential-file-field">Choose credential document<input name="credential-file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" disabled={isDemo||uploading}/><small>PDF, JPG, or PNG · up to 10 MB · private to you and CareSync administrators</small></label><button className="btn btn-primary btn-sm" disabled={isDemo||uploading||!userId}>{uploading?<LoaderCircle className="credential-spin" size={14}/>:<Upload size={14}/>} {uploading?'Uploading…':'Upload for review'}</button></form>
    {isDemo&&<p className="doctor-credential-privacy"><ShieldCheck size={14}/>Demo profiles do not accept real identity or qualification documents. Connect Supabase to enable secure private uploads.</p>}
    {problem&&<p className="credential-error" role="alert"><X size={14}/>{problem}</p>}
    <div className="doctor-credential-list"><div className="doctor-credential-list-head"><b>Your submitted documents</b>{!isDemo&&<button type="button" onClick={()=>void load()}>Refresh</button>}</div>{loading?<div className="credential-empty">Loading credential documents…</div>:files.length?files.map(file=><article key={file.id}><span className="credential-file-icon"><FileText size={16}/></span><div><b>{file.file_name}</b><small>{file.credential_type} · {new Date(file.created_at).toLocaleDateString()}</small>{file.review_note&&<small className="credential-review-note">Reviewer note: {file.review_note}</small>}</div><span className={`credential-status ${file.review_status}`}>{file.review_status==='verified'?<BadgeCheck size={13}/>:null}{file.review_status}</span><button type="button" className="credential-open" disabled={openFile===file.id} onClick={()=>void preview(file)} aria-label={`Open ${file.file_name}`}>{openFile===file.id?<LoaderCircle className="credential-spin" size={15}/>:<ArrowDownToLine size={15}/>}</button></article>):<div className="credential-empty">Uploaded qualifications and their review status will appear here.</div>}</div>
  </section>
}
