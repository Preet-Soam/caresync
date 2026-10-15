import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Camera, CameraOff, Clock3, LoaderCircle, MessageCircle, Mic, MicOff, PhoneOff, Send, ShieldCheck, Video, CircleDot, Check, X } from 'lucide-react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import '../video-visit.css'

type Props = { appointmentId: string; userId?: string; role: 'patient' | 'doctor'; otherName: string; onClose: () => void }
type SessionMessage = { id: string; sender: string; senderRole: string; body: string; sentAt: string }
type Signal = { sender: string; kind: 'offer' | 'answer' | 'ice' | 'chat' | 'end' | 'record-request' | 'record-response' | 'record-start' | 'record-stop'; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit; message?: SessionMessage; approved?: boolean }

const formatClock = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`

export default function VideoVisitRoom({ appointmentId, userId, role, otherName, onClose }: Props) {
  const [phase, setPhase] = useState<'ready' | 'joining' | 'waiting' | 'connected' | 'failed' | 'ended'>('ready')
  const [problem, setProblem] = useState('')
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [messages, setMessages] = useState<SessionMessage[]>([])
  const [draft, setDraft] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const [remotePresent, setRemotePresent] = useState(false)
  const [consentPrompt, setConsentPrompt] = useState(false)
  const [recordingRequested, setRecordingRequested] = useState(false)
  const [recordingApproved, setRecordingApproved] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [recordingBusy, setRecordingBusy] = useState(false)
  const [recordingMessage, setRecordingMessage] = useState('')
  const localVideo = useRef<HTMLVideoElement>(null)
  const remoteVideo = useRef<HTMLVideoElement>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([])
  const makingOfferRef = useRef(false)
  const didOfferRef = useRef(false)
  const phaseRef = useRef(phase)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingChunksRef = useRef<Blob[]>([])
  const recordingStartedAtRef = useRef(0)
  const discardRecordingRef = useRef(false)
  const captureFrameRef = useRef<number | null>(null)
  const captureStreamRef = useRef<MediaStream | null>(null)
  const captureContextRef = useRef<AudioContext | null>(null)
  const recordingRef = useRef(false)

  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { recordingRef.current = recording }, [recording])
  useEffect(() => { if (localVideo.current && localStreamRef.current) localVideo.current.srcObject = localStreamRef.current }, [phase])
  useEffect(() => { if (remoteVideo.current && remoteStreamRef.current) remoteVideo.current.srcObject = remoteStreamRef.current }, [remotePresent, phase])
  useEffect(() => {
    if (phase !== 'connected') return
    const timer = window.setInterval(() => setSeconds(value => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [phase])
  useEffect(() => {
    if (!recording) return
    const timer = window.setInterval(() => setRecordingSeconds(value => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [recording])

  const sendSignal = async (payload: Omit<Signal, 'sender'>) => {
    const channel = channelRef.current
    if (!channel || !userId) throw new Error('The session connection is not ready yet.')
    const result = await channel.send({ type: 'broadcast', event: 'signal', payload: { ...payload, sender: userId } })
    if (result !== 'ok') throw new Error('The session connection was interrupted. Try again.')
  }

  const persistRecording = async (blob: Blob, durationSeconds: number) => {
    if (!supabase || !userId || role !== 'doctor' || blob.size < 1 || blob.size > 268435456) {
      setRecordingMessage(blob.size > 268435456 ? 'This recording exceeded the 256 MB limit and was discarded.' : 'Recording could not be saved to this account.')
      return
    }
    setRecordingBusy(true)
    try {
      const extension = blob.type.includes('mp4') ? 'mp4' : 'webm'
      const path = `${appointmentId}/${userId}/${crypto.randomUUID()}.${extension}`
      const upload = await supabase.storage.from('video-recordings').upload(path, blob, { contentType: (blob.type || 'video/webm').split(';')[0], upsert: false })
      if (upload.error) throw upload.error
      const result = await supabase.from('video_session_recordings').insert({ appointment_id: appointmentId, created_by: userId, storage_path: path, file_name: `CareSync-video-visit-${new Date().toISOString().slice(0, 10)}.${extension}`, duration_seconds: Math.max(1, Math.round(durationSeconds)), size_bytes: blob.size })
      if (result.error) {
        await supabase.storage.from('video-recordings').remove([path])
        throw result.error
      }
      setRecordingMessage('Recording saved privately. The patient can now watch it in Online sessions.')
    } catch (cause) {
      setRecordingMessage(cause instanceof Error ? `Recording was not saved: ${cause.message}` : 'Recording could not be saved. Check the private storage setup.')
    } finally { setRecordingBusy(false) }
  }

  const stopRecording = (save: boolean) => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    discardRecordingRef.current = !save
    recorder.stop()
    captureFrameRef.current !== null && cancelAnimationFrame(captureFrameRef.current)
    captureFrameRef.current = null
  }

  const startRecording = async () => {
    if (role !== 'doctor' || !recordingApproved || !supabase || !userId || phase !== 'connected') return
    try {
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720
      const context = canvas.getContext('2d')
      if (!context) throw new Error('This browser cannot compose the recording video.')
      const draw = () => {
        context.fillStyle = '#172536'; context.fillRect(0, 0, canvas.width, canvas.height)
        const drawVideo = (video: HTMLVideoElement | null, x: number, y: number, w: number, h: number) => {
          if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return
          const scale = Math.max(w / video.videoWidth, h / video.videoHeight), sw = w / scale, sh = h / scale
          context.save(); context.translate(x + w, y); context.scale(-1, 1); context.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, 0, 0, w, h); context.restore()
        }
        drawVideo(remoteVideo.current, 0, 0, 1280, 720)
        drawVideo(localVideo.current, 930, 490, 320, 180)
        captureFrameRef.current = requestAnimationFrame(draw)
      }
      draw()
      const videoStream = canvas.captureStream(24)
      captureStreamRef.current = videoStream
      const audioContext = new AudioContext(); captureContextRef.current = audioContext
      const destination = audioContext.createMediaStreamDestination()
      for (const stream of [localStreamRef.current, remoteStreamRef.current]) {
        const tracks = stream?.getAudioTracks() || []
        if (tracks.length) audioContext.createMediaStreamSource(new MediaStream(tracks)).connect(destination)
      }
      if (audioContext.state === 'suspended') await audioContext.resume()
      const combined = new MediaStream([...videoStream.getVideoTracks(), ...destination.stream.getAudioTracks()])
      const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(value => MediaRecorder.isTypeSupported(value))
      if (!mimeType) throw new Error('This browser does not support a compatible recording format.')
      const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 450000, audioBitsPerSecond: 64000 })
      recordingChunksRef.current = []; discardRecordingRef.current = false; recordingStartedAtRef.current = Date.now()
      recorder.ondataavailable = event => { if (event.data.size) recordingChunksRef.current.push(event.data) }
      recorder.onstop = () => {
        const duration = (Date.now() - recordingStartedAtRef.current) / 1000
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'video/webm' })
        recordingChunksRef.current = []; mediaRecorderRef.current = null
        captureStreamRef.current?.getTracks().forEach(track => track.stop()); captureStreamRef.current = null
        void captureContextRef.current?.close(); captureContextRef.current = null
        setRecording(false); setRecordingSeconds(0)
        if (discardRecordingRef.current) { setRecordingMessage('Recording stopped and discarded after consent was withdrawn.'); return }
        void persistRecording(blob, duration)
      }
      mediaRecorderRef.current = recorder
      recorder.start(1000); setRecording(true); setRecordingMessage('')
      await sendSignal({ kind: 'record-start' })
      window.setTimeout(() => { if (recordingRef.current) { setRecordingMessage('The 45-minute recording limit was reached.'); stopRecording(true); setRecording(false); void sendSignal({ kind: 'record-stop' }).catch(() => undefined) } }, 45 * 60 * 1000)
    } catch (cause) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') stopRecording(false)
      captureFrameRef.current !== null && cancelAnimationFrame(captureFrameRef.current); captureFrameRef.current = null
      captureStreamRef.current?.getTracks().forEach(track => track.stop()); captureStreamRef.current = null
      void captureContextRef.current?.close(); captureContextRef.current = null
      setRecording(false); setRecordingBusy(false)
      setRecordingMessage(cause instanceof Error ? cause.message : 'Could not start the session recording.')
    }
  }

  const requestRecording = async () => {
    if (!supabase || !userId) return
    try {
      const { error } = await supabase.rpc('set_video_recording_consent', { target_appointment: appointmentId, allow_recording: true })
      if (error) throw error
      await sendSignal({ kind: 'record-request' }); setRecordingRequested(true); setRecordingMessage('Consent request sent. Recording remains off until the patient accepts and you start it.')
    } catch (cause) { setRecordingMessage(cause instanceof Error ? cause.message : 'Could not request recording consent.') }
  }

  const answerRecordingRequest = async (approved: boolean) => {
    if (!supabase || !userId) return
    try {
      const { error } = await supabase.rpc('set_video_recording_consent', { target_appointment: appointmentId, allow_recording: approved })
      if (error) throw error
      setConsentPrompt(false); setRecordingApproved(approved)
      await sendSignal({ kind: 'record-response', approved })
      setRecordingMessage(approved ? 'You agreed to recording. The doctor must start it; a recording indicator will stay visible.' : 'You declined recording. The session will not be recorded.')
    } catch (cause) { setRecordingMessage(cause instanceof Error ? cause.message : 'Could not save your recording choice.') }
  }

  const withdrawRecordingConsent = async () => {
    if (!supabase || !userId) return
    const { error } = await supabase.rpc('set_video_recording_consent', { target_appointment: appointmentId, allow_recording: false })
    if (error) { setRecordingMessage('Could not withdraw consent. Try again before leaving the visit.'); return }
    setRecording(false); setRecordingApproved(false); setConsentPrompt(false)
    await sendSignal({ kind: 'record-stop' }).catch(() => undefined)
    if (role === 'patient') setRecordingMessage('Recording stopped. The current recording was discarded because you withdrew consent.')
    else { stopRecording(false); setRecordingRequested(false); setRecordingMessage('Recording stopped and discarded.') }
  }

  const doctorStopRecording = async () => {
    stopRecording(true); setRecording(false); setRecordingApproved(false)
    await sendSignal({ kind: 'record-stop' }).catch(() => undefined)
    setRecordingMessage('Recording stopped and saved. The patient can watch it in Online sessions.')
  }

  const flushIce = async (peer: RTCPeerConnection) => {
    const queued = pendingIceRef.current.splice(0)
    for (const candidate of queued) await peer.addIceCandidate(new RTCIceCandidate(candidate))
  }

  const startPatientOffer = async () => {
    const peer = peerRef.current
    if (!peer || didOfferRef.current || makingOfferRef.current || !remotePresent) return
    makingOfferRef.current = true
    try {
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      await sendSignal({ kind: 'offer', description: peer.localDescription?.toJSON() })
      didOfferRef.current = true
      setPhase('waiting')
    } catch (cause) { setProblem(cause instanceof Error ? cause.message : 'Could not start this video session.') }
    finally { makingOfferRef.current = false }
  }

  useEffect(() => {
    if (role === 'patient' && remotePresent && phase !== 'ready' && phase !== 'failed' && phase !== 'ended') void startPatientOffer()
  }, [remotePresent, phase, role])

  const startSession = async () => {
    if (!supabase || !userId) { setProblem('Live video calls require a connected CareSync account. The demo workspace cannot create private sessions.'); setPhase('failed'); return }
    if (!navigator.mediaDevices?.getUserMedia) { setProblem('This browser does not support camera and microphone access. Open CareSync in a secure, up-to-date browser.'); setPhase('failed'); return }
    setProblem(''); setPhase('joining')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: 'user' } })
      localStreamRef.current = stream
      if (localVideo.current) localVideo.current.srcObject = stream
      const { data: room, error: roomError } = await supabase.rpc('get_video_session_room', { target_appointment: appointmentId })
      if (roomError || !room) throw new Error(roomError?.message || 'This video visit is not ready to join yet.')

      const iceServers: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }]
      const peer = new RTCPeerConnection({ iceServers })
      peerRef.current = peer
      const remoteStream = new MediaStream()
      remoteStreamRef.current = remoteStream
      if (remoteVideo.current) remoteVideo.current.srcObject = remoteStream
      stream.getTracks().forEach(track => peer.addTrack(track, stream))
      peer.ontrack = event => {
        event.streams[0]?.getTracks().forEach(track => { if (!remoteStream.getTracks().some(existing => existing.id === track.id)) remoteStream.addTrack(track) })
        setRemotePresent(true)
      }
      peer.onicecandidate = event => { if (event.candidate) void sendSignal({ kind: 'ice', candidate: event.candidate.toJSON() }).catch(error => setProblem(error.message)) }
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'connected') { setProblem(''); setPhase('connected') }
        else if (peer.connectionState === 'failed') { setProblem('Could not connect the call. Check your network, camera permissions, or TURN configuration, then try again.'); setPhase('failed') }
        else if (peer.connectionState === 'disconnected' && phaseRef.current === 'connected') { if (recordingRef.current) { stopRecording(false); setRecording(false); void sendSignal({ kind: 'record-stop' }).catch(() => undefined); setRecordingMessage('The connection dropped, so the in-progress recording was discarded.') } setPhase('waiting') }
      }

      const channel = supabase.channel(`caresync-video:${room}`, { config: { private: true, presence: { key: userId }, broadcast: { self: false } } })
      channelRef.current = channel
      channel.on('broadcast', { event: 'signal' }, async ({ payload }: { payload: Signal }) => {
        if (!payload || payload.sender === userId) return
        const currentPeer = peerRef.current
        if (!currentPeer) return
        try {
          if (payload.kind === 'offer' && role === 'doctor' && payload.description) {
            await currentPeer.setRemoteDescription(new RTCSessionDescription(payload.description))
            await flushIce(currentPeer)
            const answer = await currentPeer.createAnswer()
            await currentPeer.setLocalDescription(answer)
            await sendSignal({ kind: 'answer', description: currentPeer.localDescription?.toJSON() })
            setPhase('waiting')
          } else if (payload.kind === 'answer' && role === 'patient' && payload.description) {
            await currentPeer.setRemoteDescription(new RTCSessionDescription(payload.description))
            await flushIce(currentPeer)
          } else if (payload.kind === 'ice' && payload.candidate) {
            if (currentPeer.remoteDescription) await currentPeer.addIceCandidate(new RTCIceCandidate(payload.candidate))
            else pendingIceRef.current.push(payload.candidate)
          } else if (payload.kind === 'chat' && payload.message) {
            setMessages(current => [...current, payload.message!].slice(-80)); setChatOpen(true)
          } else if (payload.kind === 'record-request' && role === 'patient') {
            setConsentPrompt(true); setRecordingApproved(false)
          } else if (payload.kind === 'record-response' && role === 'doctor') {
            setRecordingApproved(Boolean(payload.approved)); setRecordingRequested(false)
            setRecordingMessage(payload.approved ? 'The patient consented. Start recording when ready.' : 'The patient declined. This session will not be recorded.')
          } else if (payload.kind === 'record-start') {
            setRecording(true); setRecordingSeconds(0); setRecordingMessage('This visit is being recorded with both participants’ consent.')
          } else if (payload.kind === 'record-stop') {
            if (role === 'doctor') stopRecording(false)
            setRecording(false); setRecordingApproved(false); setRecordingMessage('The recording stopped after consent was withdrawn.')
          } else if (payload.kind === 'end') {
            if (role === 'doctor' && recordingRef.current) stopRecording(true)
            setRecording(false)
            currentPeer.close(); setPhase('ended'); setProblem('The other participant left the session.')
          }
        } catch (cause) { setProblem(cause instanceof Error ? cause.message : 'The session signal could not be processed.') }
      })
      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState() as Record<string, { userId?: string; role?: string }[]>
        const other = Object.values(state).flat().find(member => member.userId !== userId && member.role !== role)
        setRemotePresent(Boolean(other))
      })
      await new Promise<void>((resolve, reject) => {
        channel.subscribe((status, error) => {
          if (status === 'SUBSCRIBED') resolve()
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') reject(error || new Error('Could not connect to the private video room. Apply the online-session migration and try again.'))
        })
      })
      const presenceStatus = await channel.track({ userId, role, joinedAt: new Date().toISOString() })
      if (presenceStatus !== 'ok') throw new Error('Could not publish your call presence to the other participant.')
      setPhase('waiting')
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : 'Could not join the video visit.')
      setPhase('failed')
      localStreamRef.current?.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
      const channel = channelRef.current
      if (channel) void supabase.removeChannel(channel)
      channelRef.current = null
      peerRef.current?.close(); peerRef.current = null
    }
  }

  const toggleMic = () => {
    const next = !muted
    localStreamRef.current?.getAudioTracks().forEach(track => { track.enabled = !next })
    setMuted(next)
  }
  const toggleCamera = () => {
    const next = !cameraOff
    localStreamRef.current?.getVideoTracks().forEach(track => { track.enabled = !next })
    setCameraOff(next)
  }
  const sendChat = async (event: FormEvent) => {
    event.preventDefault()
    const body = draft.trim().slice(0, 1000)
    if (!body || !userId) return
    const message: SessionMessage = { id: crypto.randomUUID(), sender: userId, senderRole: role, body, sentAt: new Date().toISOString() }
    setMessages(current => [...current, message].slice(-80)); setDraft('')
    try { await sendSignal({ kind: 'chat', message }) }
    catch (cause) { setProblem(cause instanceof Error ? cause.message : 'Could not send that message.') }
  }
  const leave = () => {
    if (role === 'doctor' && recordingRef.current) stopRecording(true)
    if (phase === 'connected' || phase === 'waiting') void sendSignal({ kind: 'end' }).catch(() => undefined)
    const channel = channelRef.current
    if (channel && supabase) void supabase.removeChannel(channel)
    channelRef.current = null
    peerRef.current?.close(); peerRef.current = null
    localStreamRef.current?.getTracks().forEach(track => track.stop()); localStreamRef.current = null
    remoteStreamRef.current?.getTracks().forEach(track => track.stop()); remoteStreamRef.current = null
    onClose()
  }

  return <div className="modal-backdrop video-room-backdrop" onMouseDown={event => { if (event.currentTarget === event.target) leave() }}><section className={`video-room ${chatOpen ? 'with-chat' : ''}`} role="dialog" aria-modal="true" aria-labelledby="video-room-title">
    <header className="video-room-header"><div><span className="eyebrow">CARESYNC ONLINE VISIT</span><h2 id="video-room-title">{phase === 'connected' ? 'You’re connected' : phase === 'ended' ? 'Session ended' : `Video visit with ${otherName}`}</h2><p><ShieldCheck size={14}/> Private room for the confirmed appointment</p></div><span className={`video-room-live ${phase}`}><i/>{phase === 'connected' ? formatClock(seconds) : phase === 'waiting' ? remotePresent ? 'Connecting' : 'Waiting' : phase === 'failed' ? 'Needs attention' : phase === 'ended' ? 'Ended' : 'Ready'}</span></header>
    <div className="video-room-body"><div className="video-stage"><div className={`video-tile remote ${remotePresent ? 'remote-present' : ''}`}><video ref={remoteVideo} autoPlay playsInline/><div className="video-placeholder"><Video size={25}/><b>{remotePresent ? 'Connecting to participant…' : `Waiting for ${otherName}`}</b><span>{remotePresent ? 'Keep this window open while the call connects.' : 'They can join from their Online sessions page.'}</span></div><span className="video-name-tag">{otherName}</span></div><div className={`video-tile local ${phase!=='ready'&&phase!=='failed'?'local-stream-ready':''} ${cameraOff?'camera-disabled':''}`}><video ref={localVideo} autoPlay playsInline muted/><div className="local-video-placeholder"><CameraOff size={17}/><span>Camera is off</span></div><span className="video-name-tag">You</span></div>
      {problem&&<div className="video-room-error" role="alert">{problem}</div>}
      {phase === 'ready' && <div className="video-prejoin"><div className="video-prejoin-icon"><Video/></div><b>Join your scheduled visit</b><span>CareSync will ask for camera and microphone access. You can mute or turn off video at any time.</span><button className="btn btn-primary" onClick={()=>void startSession()}><Video size={16}/> Join session</button></div>}
      {phase === 'failed' && <div className="video-prejoin video-retry"><button className="btn btn-primary" onClick={()=>void startSession()}><Video size={16}/> Try again</button></div>}
      {phase === 'waiting' && <div className="video-waiting-badge"><LoaderCircle size={15}/> {remotePresent ? 'Securing the connection…' : 'You’re in the room. Waiting for the other participant.'}</div>}
      {recording&&<div className="video-recording-banner"><CircleDot size={14}/> RECORDING <span>{formatClock(recordingSeconds)}</span><b>Both participants can stop at any time.</b></div>}
      {consentPrompt&&<div className="video-consent-overlay" role="dialog" aria-modal="true" aria-label="Recording consent"><div><span className="eyebrow">RECORDING CONSENT</span><h3>The doctor asked to record this visit</h3><p>Recording is optional and stays off unless you agree. The doctor will start it manually. If you withdraw consent, the in-progress recording is stopped and discarded. If saved, only you, the doctor, and CareSync administrators can access it.</p><div><button className="video-consent-decline" onClick={()=>void answerRecordingRequest(false)}><X size={15}/> Decline</button><button className="video-consent-accept" onClick={()=>void answerRecordingRequest(true)}><Check size={15}/> I agree</button></div></div></div>}
      {phase==='connected'&&role==='doctor'&&!recording&&<button className="video-record-control" disabled={recordingBusy||(!recordingApproved&&recordingRequested)} onClick={()=>recordingApproved?void startRecording():void requestRecording()}><CircleDot size={14}/>{recordingBusy?'Saving recording…':recordingApproved?'Start recording':recordingRequested?'Waiting for patient…':'Request recording consent'}</button>}
      {phase==='connected'&&role==='patient'&&recording&&<button className="video-record-control patient-stop" onClick={()=>void withdrawRecordingConsent()}><CircleDot size={14}/> Stop recording & withdraw consent</button>}
      {phase==='connected'&&role==='doctor'&&recording&&<button className="video-record-control patient-stop" onClick={()=>void doctorStopRecording()}><CircleDot size={14}/> Stop & save recording</button>}
      {recordingMessage&&<div className="video-recording-message" role="status">{recordingMessage}</div>}
      <footer className="video-controls"><button aria-label={muted?'Unmute microphone':'Mute microphone'} disabled={phase==='ready'||phase==='failed'} onClick={toggleMic}>{muted?<MicOff/>:<Mic/>}<span>{muted?'Unmute':'Mute'}</span></button><button aria-label={cameraOff?'Turn camera on':'Turn camera off'} disabled={phase==='ready'||phase==='failed'} onClick={toggleCamera}>{cameraOff?<CameraOff/>:<Camera/>}<span>{cameraOff?'Camera on':'Camera off'}</span></button><button aria-label="Open session chat" disabled={phase==='ready'||phase==='failed'||phase==='ended'} onClick={()=>setChatOpen(value=>!value)}><MessageCircle/><span>Chat</span>{messages.length>0&&<i>{messages.length}</i>}</button><button className="video-leave" onClick={leave}><PhoneOff/><span>Leave</span></button></footer></div>
      {chatOpen&&<aside className="video-chat"><div className="video-chat-heading"><div><b>Session chat</b><small>Messages disappear when you leave this room.</small></div><MessageCircle size={17}/></div><div className="video-chat-messages">{messages.length?messages.map(message=><div key={message.id} className={`video-chat-message ${message.sender===userId?'mine':''}`}><small>{message.sender===userId?'You':message.senderRole==='doctor'?'Doctor':'Patient'}</small><p>{message.body}</p></div>):<div className="video-chat-empty"><MessageCircle size={20}/><span>Send a message to the other participant.</span></div>}</div><form className="video-chat-form" onSubmit={event=>void sendChat(event)}><input value={draft} maxLength={1000} onChange={event=>setDraft(event.target.value)} placeholder="Write a message…" aria-label="Session chat message"/><button disabled={!draft.trim()||phase==='ended'} aria-label="Send message"><Send size={16}/></button></form></aside>}
    </div>
    <div className="video-room-footnote"><Clock3 size={13}/> Recording is optional and requires both participants’ consent. Saved recordings are private and visible to the patient, doctor, and CareSync administrators. For a medical emergency, contact your local emergency service.</div>
  </section></div>
}
