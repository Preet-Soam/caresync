import { useEffect, useState } from 'react'
import { ArrowDownToLine, BadgeCheck, FileCheck2, LoaderCircle, ShieldAlert } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Credential = { id: string; user_id: string; storage_path: string; file_name: string; credential_type: string; review_status: 'pending'|'verified'|'rejected'; review_note: string|null; created_at: string; doctorName: string }

export default function AdminCredentialReview({ onNotice }: { onNotice: (message: string) => void }) {
  const [items, setItems] = useState<Credential[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [opening, setOpening] = useState('')
  const load = async () => {
    if (!supabase) { setLoading(false); return }
    setLoading(true); setError('')
    const { data, error: queryError } = await supabase.from('doctor_credential_documents').select('id,user_id,storage_path,file_name,credential_type,review_status,review_note,created_at').order('created_at', { ascending: false }).limit(100)
    if (queryError) { setError('Apply the doctor credential migration to review private uploads.'); setItems([]); setLoading(false); return }
    const rows = (data || []) as Omit<Credential, 'doctorName'>[]
    const userIds = [...new Set(rows.map(row => row.user_id))]
    const names = new Map<string,string>()
    if (userIds.length) {
      const { data: profiles } = await supabase.from('profiles').select('id,full_name').in('id', userIds)
      ;(profiles || []).forEach(profile => names.set(profile.id, profile.full_name || 'Doctor'))
    }
    setItems(rows.map(row => ({ ...row, doctorName: names.get(row.user_id) || 'Doctor' }))); setLoading(false)
  }
  useEffect(() => { void load() }, [])
  const openDocument = async (item: Credential) => {
    if (!supabase) return
    setOpening(item.id)
    const { data, error: signedError } = await supabase.storage.from('doctor-credentials').createSignedUrl(item.storage_path, 60)
    setOpening('')
    if (signedError || !data?.signedUrl) { onNotice('Could not open the private credential document.'); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }
  const review = async (item: Credential, status: 'verified'|'rejected') => {
    if (!supabase) return
    setBusy(item.id)
    const { error: updateError } = await supabase.from('doctor_credential_documents').update({ review_status: status, reviewed_at: new Date().toISOString() }).eq('id', item.id)
    setBusy('')
    if (updateError) { onNotice('Could not update this credential review.'); return }
    setItems(current => current.map(row => row.id === item.id ? { ...row, review_status: status } : row))
    onNotice(status === 'verified' ? 'Qualification document marked verified.' : 'Qualification document marked not verified.')
  }

  return <section className="admin-panel admin-credential-review"><div className="admin-panel-head"><div><span className="eyebrow">PRIVATE CREDENTIALS</span><h2>Qualification documents</h2></div><button className="admin-refresh" onClick={()=>void load()}>Refresh</button></div><p className="admin-credential-explainer"><ShieldAlert size={14}/>Documents are private. Review evidence before marking credentials verified; this action does not automatically approve a doctor account.</p>{error&&<div className="admin-demo-note">{error}</div>}{loading?<div className="admin-credential-empty">Loading credential uploads…</div>:items.length?<div className="admin-credential-list">{items.map(item=><article key={item.id}><div className="admin-credential-icon"><FileCheck2 size={16}/></div><div className="admin-credential-info"><b>{item.doctorName}</b><small>{item.credential_type} · {item.file_name}</small><small>Submitted {new Date(item.created_at).toLocaleDateString()}</small>{item.review_note&&<small>{item.review_note}</small>}</div><span className={`credential-status ${item.review_status}`}>{item.review_status==='verified'&&<BadgeCheck size={13}/>} {item.review_status}</span><button title="Open private document" className="credential-open" disabled={opening===item.id} onClick={()=>void openDocument(item)}>{opening===item.id?<LoaderCircle className="credential-spin" size={15}/>:<ArrowDownToLine size={15}/>}</button>{item.review_status==='pending'&&<div className="admin-credential-actions"><button disabled={busy===item.id} onClick={()=>void review(item,'rejected')}>Not verified</button><button className="verified-action" disabled={busy===item.id} onClick={()=>void review(item,'verified')}>{busy===item.id?'Saving…':'Mark verified'}</button></div>}</article>)}</div>:<div className="admin-credential-empty">No qualification documents have been submitted.</div>}</section>
}
