import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Bot, CircleHelp, LifeBuoy, MessageCircle, Send, ShieldCheck, UserRound, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Role } from '../types'
import '../support-center.css'

type Status = 'open' | 'in_progress' | 'resolved' | 'closed'
type Ticket = { id: string; user_id: string; user_name?: string; user_role: string; category: string; status: Status; assigned_admin_id?: string | null; assigned_admin_name?: string; created_at: string; updated_at: string; last_message_at?: string }
type ChatMessage = { id: string; conversation_id: string; sender_id: string | null; sender_name?: string; sender_role: string; message: string; created_at: string }
type DemoState = { tickets: Ticket[]; messages: ChatMessage[] }
const demoKey = 'caresync-support-demo-v1'
const botReply = (question: string) => {
  const text = question.toLowerCase()
  if (/password|sign.?in|login|mobile|phone|otp|account/.test(text)) return 'For account access, sign in with the email or verified mobile number used to create your account. If you cannot sign in, use “Forgot password?” for email accounts. Mobile sign-in requires SMS verification to be configured.'
  if (/appointment|book|slot|schedule|cancel|reschedule/.test(text)) return 'Open Appointments to review requests and visit times. Patients can find open times under Find a doctor. Doctors can accept or decline requests in My schedule. If a confirmed time needs changing, contact the clinic directly.'
  if (/record|video|online session|session|camera|microphone/.test(text)) return 'Open Online sessions to join a confirmed video visit. Recording is optional and starts only after both people consent. Saved recordings appear in the patient’s Online sessions library. Check browser camera and microphone permissions if the call cannot connect.'
  if (/prescription|medicine|pharmacy/.test(text)) return 'Open Prescriptions in your patient workspace to review prescriptions issued by your doctor. A prescription is not a substitute for advice from your healthcare professional.'
  if (/bill|billing|payment|invoice/.test(text)) return 'Open Billing to view invoice details and payment status. CareSync does not currently process payments; contact the clinic about paying an invoice.'
  if (/doctor|qualification|verify|approval|profile/.test(text)) return 'Doctor accounts remain unavailable until an administrator reviews the application and uploaded qualification documents. You can see the application status after signing in once the application has been submitted.'
  if (/clinic|hospital|location|address|nearby/.test(text)) return 'Open Find a doctor to search approved provider profiles and see saved clinic or hospital addresses. Allow location access if you want results sorted by distance.'
  return 'I can help with CareSync accounts, appointments, video sessions, prescriptions, billing, and provider profiles. I could not match that question to a help article. You can ask another way or connect this chat to an administrator.'
}
function readDemo(): DemoState { try { return JSON.parse(localStorage.getItem(demoKey) || '{"tickets":[],"messages":[]}') as DemoState } catch { return { tickets: [], messages: [] } } }
function writeDemo(value: DemoState) { try { localStorage.setItem(demoKey, JSON.stringify(value)); window.dispatchEvent(new Event('caresync-support-updated')) } catch {} }
const statusLabel = (status: Status) => status === 'in_progress' ? 'In progress' : status === 'open' ? 'Waiting for admin' : status[0].toUpperCase() + status.slice(1)
const when = (value: string) => new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function SupportCenter({ userId, userName, role, isDemo = false }: { userId: string; userName: string; role: Role; isDemo?: boolean }) {
  const isAdmin = role === 'administrator'
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [botMessages, setBotMessages] = useState<{ id: string; sender: 'bot' | 'user'; body: string }[]>([{ id: 'welcome', sender: 'bot', body: 'Hi! I’m the CareSync help bot. Ask me about using the website and I’ll try to help. I can connect you to an administrator if I can’t resolve it.' }])
  const [botDraft, setBotDraft] = useState('')
  const [issue, setIssue] = useState('')
  const [category, setCategory] = useState('General help')
  const [reply, setReply] = useState('')
  const selected = tickets.find(ticket => ticket.id === selectedId) || null

  const loadTickets = useCallback(async () => {
    if (isDemo) {
      const all = readDemo().tickets.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      setTickets(isAdmin ? all : all.filter(item => item.user_id === userId))
      return
    }
    if (!supabase) return
    let query = supabase.from('support_conversations').select('id,user_id,user_role,category,status,assigned_admin_id,created_at,updated_at,last_message_at').order('updated_at', { ascending: false }).limit(isAdmin ? 100 : 20)
    if (!isAdmin) query = query.eq('user_id', userId)
    const { data, error: loadError } = await query
    if (loadError) { setError('Support is not available yet. Apply the latest support migration and refresh.'); return }
    const rows = (data || []) as Ticket[]
    const ids = [...new Set([...rows.map(item => item.user_id), ...rows.flatMap(item => item.assigned_admin_id ? [item.assigned_admin_id] : [])])]
    const { data: profiles } = ids.length ? await supabase.from('profiles').select('id,full_name').in('id', ids) : { data: [] }
    const names = new Map((profiles || []).map(profile => [profile.id, profile.full_name]))
    setTickets(rows.map(item => ({ ...item, user_name: names.get(item.user_id) || (item.user_id === userId ? userName : 'CareSync member'), assigned_admin_name: item.assigned_admin_id ? names.get(item.assigned_admin_id) || 'Administrator' : undefined })))
  }, [isDemo, isAdmin, userId, userName])

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!conversationId) { setMessages([]); return }
    if (isDemo) { setMessages(readDemo().messages.filter(item => item.conversation_id === conversationId).sort((a, b) => a.created_at.localeCompare(b.created_at))); return }
    if (!supabase) return
    const { data, error: loadError } = await supabase.from('support_messages').select('id,conversation_id,sender_id,sender_role,message,created_at').eq('conversation_id', conversationId).order('created_at').limit(300)
    if (loadError) { setError('Could not load this support conversation.'); return }
    const rows = (data || []) as ChatMessage[]
    const ids = [...new Set(rows.flatMap(item => item.sender_id ? [item.sender_id] : []))]
    const { data: profiles } = ids.length ? await supabase.from('profiles').select('id,full_name').in('id', ids) : { data: [] }
    const names = new Map((profiles || []).map(profile => [profile.id, profile.full_name]))
    setMessages(rows.map(item => ({ ...item, sender_name: item.sender_id === userId ? userName : item.sender_id ? names.get(item.sender_id) || (item.sender_role === 'administrator' ? 'CareSync Support' : 'CareSync member') : 'CareSync Help Bot' })))
  }, [isDemo, userId, userName])

  useEffect(() => { void loadTickets(); const timer = window.setInterval(() => { void loadTickets(); if (selectedId) void loadMessages(selectedId) }, 8000); const update = () => { void loadTickets(); if (selectedId) void loadMessages(selectedId) }; window.addEventListener('focus', update); window.addEventListener('storage', update); window.addEventListener('caresync-support-updated', update); return () => { window.clearInterval(timer); window.removeEventListener('focus', update); window.removeEventListener('storage', update); window.removeEventListener('caresync-support-updated', update) } }, [loadTickets, loadMessages, selectedId])
  useEffect(() => { void loadMessages(selectedId) }, [selectedId, loadMessages])

  const askBot = (event: FormEvent) => {
    event.preventDefault(); const body = botDraft.trim().slice(0, 1000); if (!body) return
    setBotMessages(current => [...current, { id: crypto.randomUUID(), sender: 'user', body }, { id: crypto.randomUUID(), sender: 'bot', body: botReply(body) }]); setBotDraft('')
  }
  const createTicket = async (event: FormEvent) => {
    event.preventDefault(); const transcript = botMessages.map(item => `${item.sender === 'user' ? userName : 'CareSync Help Bot'}: ${item.body}`).join('\n'); const initial = [`Member note: ${issue.trim()}`, `Help chat:\n${transcript}`].filter(value => !value.endsWith(': ')).join('\n\n').slice(0, 4000) || botMessages.filter(item => item.sender === 'user').slice(-1)[0]?.body || 'Please connect me with an administrator for help.'
    setBusy(true); setError('')
    if (isDemo) {
      const state = readDemo(), id = crypto.randomUUID(), stamp = new Date().toISOString()
      const ticket: Ticket = { id, user_id: userId, user_name: userName, user_role: role, category, status: 'open', created_at: stamp, updated_at: stamp, last_message_at: stamp }
      const message: ChatMessage = { id: crypto.randomUUID(), conversation_id: id, sender_id: userId, sender_name: userName, sender_role: role, message: initial, created_at: stamp }
      writeDemo({ tickets: [ticket, ...state.tickets], messages: [...state.messages, message] }); setSelectedId(id); setIssue(''); setBusy(false); return
    }
    if (!supabase) { setError('Support chat requires a connected account.'); setBusy(false); return }
    const { data, error: createError } = await supabase.rpc('create_support_conversation', { target_category: category, initial_message: initial })
    if (createError || !data) { setError(createError?.message || 'Could not contact an administrator. Please try again.'); setBusy(false); return }
    await loadTickets(); setSelectedId(data as string); setIssue(''); setBusy(false)
  }

  const sendReply = async (event: FormEvent) => {
    event.preventDefault(); const body = reply.trim().slice(0, 4000); if (!body || !selectedId) return
    setBusy(true); setError('')
    if (isDemo) {
      const state = readDemo(), stamp = new Date().toISOString(), ticket = state.tickets.find(item => item.id === selectedId)
      if (!ticket || ticket.status === 'closed') { setError('This conversation is closed.'); setBusy(false); return }
      const message: ChatMessage = { id: crypto.randomUUID(), conversation_id: selectedId, sender_id: userId, sender_name: userName, sender_role: role, message: body, created_at: stamp }
      writeDemo({ tickets: state.tickets.map(item => item.id === selectedId ? { ...item, status: isAdmin ? 'in_progress' : item.status === 'resolved' ? 'open' : item.status, assigned_admin_id: isAdmin ? userId : item.status === 'resolved' ? null : item.assigned_admin_id, updated_at: stamp, last_message_at: stamp } : item), messages: [...state.messages, message] })
      setReply(''); await loadTickets(); await loadMessages(selectedId); setBusy(false); return
    }
    if (!supabase) { setBusy(false); return }
    const { error: sendError } = await supabase.rpc('send_support_message', { target_conversation: selectedId, message_body: body })
    if (sendError) { setError(sendError.message.includes('closed') ? 'This conversation is closed.' : 'Your reply could not be sent.'); setBusy(false); return }
    setReply(''); await loadTickets(); await loadMessages(selectedId); setBusy(false)
  }

  const updateStatus = async (status: Status) => {
    if (!selectedId) return
    if (isDemo) { const state = readDemo(), stamp = new Date().toISOString(); writeDemo({ ...state, tickets: state.tickets.map(item => item.id === selectedId ? { ...item, status, assigned_admin_id: status === 'in_progress' ? userId : item.assigned_admin_id, assigned_admin_name: status === 'in_progress' ? userName : item.assigned_admin_name, updated_at: stamp } : item) }); await loadTickets(); return }
    if (!supabase) return
    const { error: statusError } = await supabase.rpc('admin_update_support_conversation', { target_conversation: selectedId, new_status: status })
    if (statusError) { setError('Could not update this conversation.'); return }
    await loadTickets()
  }

  const ticketList = <div className="support-ticket-list">{tickets.length ? tickets.map(ticket => <button key={ticket.id} className={`support-ticket ${selectedId === ticket.id ? 'selected' : ''}`} onClick={() => setSelectedId(ticket.id)}><span><b>{isAdmin ? ticket.user_name : ticket.category}</b><small>{isAdmin ? `${ticket.user_role} · ${ticket.category}` : `Updated ${when(ticket.updated_at)}`}</small></span><i className={`support-status ${ticket.status}`}>{statusLabel(ticket.status)}</i></button>) : <div className="support-no-tickets">{isAdmin ? 'No support conversations yet.' : 'Your administrator chats will appear here.'}</div>}</div>

  if (isAdmin) return <section className="support-admin"><header><span className="support-head-icon"><LifeBuoy/></span><div><span className="eyebrow">ADMINISTRATOR SUPPORT</span><h1>Support inbox.</h1><p>Take over conversations that the CareSync help bot could not resolve.</p></div></header><div className="support-admin-grid"><aside className="support-admin-list"><div className="support-panel-title"><b>Recent conversations</b><span>{tickets.filter(ticket => ticket.status === 'open' || ticket.status === 'in_progress').length} active</span></div>{ticketList}</aside>{selected ? <div className="support-thread"><div className="support-thread-head"><div><b>{selected.user_name}</b><span>{selected.user_role} · {selected.category} · started {when(selected.created_at)}</span></div><select value={selected.status} onChange={event => void updateStatus(event.target.value as Status)} aria-label="Conversation status"><option value="open">Waiting for admin</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></div><MessageList messages={messages} userId={userId}/>{error && <p className="support-error">{error}</p>}<form className="support-reply-form" onSubmit={sendReply}><input value={reply} onChange={event => setReply(event.target.value)} maxLength={4000} placeholder={selected.status === 'closed' ? 'This conversation is closed' : 'Reply to the member…'} disabled={selected.status === 'closed'}/><button disabled={!reply.trim() || busy || selected.status === 'closed'} aria-label="Send reply"><Send size={16}/></button></form><div className="support-thread-foot"><ShieldCheck size={13}/> Keep replies focused on using CareSync. Never request passwords or urgent medical details.</div></div> : <div className="support-admin-empty"><MessageCircle/><b>Select a conversation</b><span>Open a queue item to reply and update its status.</span></div>}</div></section>

  return <section className="support-user"><header><span className="support-head-icon"><CircleHelp/></span><div><span className="eyebrow">CARESYNC HELP DESK</span><h2>How can we help?</h2><p>Ask the help bot first. If it can’t resolve the issue, connect the chat to an administrator.</p></div></header>{tickets.length > 0 && <div className="support-existing"><div className="support-panel-title"><b>Your support conversations</b></div>{ticketList}</div>}
    {selected ? <div className="support-thread support-user-thread"><div className="support-thread-head"><div><b>{selected.category}</b><span>{statusLabel(selected.status)}{selected.assigned_admin_name ? ` · ${selected.assigned_admin_name}` : ''}</span></div><button className="support-back" onClick={() => setSelectedId('')}><ArrowLeft size={14}/> New help chat</button></div><MessageList messages={messages} userId={userId}/>{error && <p className="support-error">{error}</p>}<form className="support-reply-form" onSubmit={sendReply}><input value={reply} onChange={event => setReply(event.target.value)} maxLength={4000} placeholder={selected.status === 'closed' ? 'This conversation is closed' : 'Reply to the administrator…'} disabled={selected.status === 'closed'}/><button disabled={!reply.trim() || busy || selected.status === 'closed'} aria-label="Send reply"><Send size={16}/></button></form></div> : <><div className="support-bot-chat"><div className="support-bot-note"><Bot size={16}/> CareSync help bot · Website help only</div><div className="support-chat-messages">{botMessages.map(item => <div key={item.id} className={`support-chat-bubble ${item.sender}`}><span>{item.sender === 'bot' ? 'CareSync Help Bot' : 'You'}</span><p>{item.body}</p></div>)}</div><form className="support-reply-form" onSubmit={askBot}><input value={botDraft} onChange={event => setBotDraft(event.target.value)} maxLength={1000} placeholder="Ask about using CareSync…" aria-label="Ask the CareSync help bot"/><button disabled={!botDraft.trim()} aria-label="Send question"><Send size={16}/></button></form></div><div className="support-hand-off"><div><b>Still need help?</b><span>Send your question and chat history to the CareSync admin team.</span></div><form onSubmit={createTicket}><label>Topic<select value={category} onChange={event => setCategory(event.target.value)}>{['General help','Sign-in and account','Appointments and schedule','Online sessions and recordings','Prescriptions and records','Billing','Doctor profile and verification'].map(option => <option key={option}>{option}</option>)}</select></label><label>What should the administrator know?<textarea rows={2} maxLength={4000} value={issue} onChange={event => setIssue(event.target.value)} placeholder={botMessages.filter(item => item.sender === 'user').slice(-1)[0]?.body || 'Describe the issue you still need help with.'}/></label>{error && <p className="support-error">{error}</p>}<button className="btn btn-primary btn-sm" disabled={busy}><UserRound size={14}/>{busy ? 'Connecting…' : 'Connect me to an administrator'}</button></form></div></>}
    <p className="support-disclaimer"><X size={13}/> This help bot does not provide medical advice. For an emergency, call your local emergency number.</p>
  </section>
}

function MessageList({ messages, userId }: { messages: ChatMessage[]; userId: string }) { return <div className="support-thread-messages">{messages.map(item => <article key={item.id} className={`support-thread-message ${item.sender_id === userId ? 'mine' : item.sender_role === 'administrator' ? 'admin' : ''}`}><span>{item.sender_name || (item.sender_role === 'administrator' ? 'CareSync Support' : 'Member')} · {when(item.created_at)}</span><p>{item.message}</p></article>)}</div> }
