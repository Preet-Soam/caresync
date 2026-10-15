import { ArrowRight, CalendarDays, CheckCircle2, FileText, MapPin, Pill, ShieldCheck, Stethoscope, Users, X } from 'lucide-react'
import type { Role } from '../types'
import '../setup-guide.css'

type GuideStep = { icon: React.ReactNode; title: string; text: string; area: string }

export default function SetupGuide({ role, onClose, onOpenArea }: { role: Extract<Role, 'patient' | 'doctor'>; onClose: () => void; onOpenArea: (area: string) => void }) {
  const patientSteps: GuideStep[] = [
    { icon: <MapPin/>, title: 'Find care near you', text: 'Search doctors by specialty, clinic, city, or postal code. Share your location only if you want results sorted by distance.', area: 'Find a doctor' },
    { icon: <CalendarDays/>, title: 'Choose an available appointment', text: 'Pick an open date and time, then send a visit request. Your doctor must accept it before it is confirmed.', area: 'Find a doctor' },
    { icon: <FileText/>, title: 'Keep visit information together', text: 'Review medical documents, consultation summaries, and billing details in their workspace sections.', area: 'Medical records' },
    { icon: <Pill/>, title: 'Review prescriptions', text: 'See medication instructions issued by your doctor, with links to look up the medicine at a pharmacy.', area: 'Prescriptions' },
    { icon: <ShieldCheck/>, title: 'Stay in control', text: 'Use notifications for visit updates. Emergo can prepare your location to share, but it does not contact or dispatch emergency services.', area: 'Appointments' },
  ]
  const doctorSteps: GuideStep[] = [
    { icon: <Stethoscope/>, title: 'Complete your practice profile', text: 'Add qualifications, specialty, clinic or hospital details, address, and practice time zone so patients can review your listing.', area: 'Practice profile' },
    { icon: <CalendarDays/>, title: 'Publish your timetable', text: 'Set weekly hours, one-day openings, blocked time, holidays, and leave. Patients can request only open slots.', area: 'My schedule' },
    { icon: <Users/>, title: 'Respond to appointment requests', text: 'Review your waiting list and accept or decline each request. Accepted visits appear in your schedule.', area: 'My schedule' },
    { icon: <FileText/>, title: 'Document consultations', text: 'Complete a visit, save its consultation summary, and keep the patient record concise and relevant.', area: 'Consultations' },
    { icon: <Pill/>, title: 'Issue prescriptions', text: 'Create medicine instructions for a completed consultation. Patients can then review the prescription in their account.', area: 'Prescriptions' },
  ]
  const steps = role === 'patient' ? patientSteps : doctorSteps
  const go = (area: string) => { onClose(); onOpenArea(area) }
  return <div className="setup-guide-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="setup-guide" role="dialog" aria-modal="true" aria-labelledby="setup-guide-title">
      <button className="setup-guide-close" onClick={onClose} aria-label="Close setup guide"><X size={18}/></button>
      <div className="setup-guide-intro"><span className="setup-guide-icon">{role === 'patient' ? <Users/> : <Stethoscope/>}</span><div><span className="eyebrow">A QUICK TOUR OF YOUR WORKSPACE</span><h2 id="setup-guide-title">{role === 'patient' ? 'Your care, step by step.' : 'Set up your practice, step by step.'}</h2><p>{role === 'patient' ? 'Here are the main tools you can use as you plan and manage care.' : 'Here is how to set up your profile and work through patient visits.'}</p></div></div>
      <div className="setup-guide-steps">{steps.map((step, index) => <article className="setup-guide-step" key={step.title}><span className="setup-guide-step-icon">{step.icon}</span><div><small>STEP {String(index + 1).padStart(2, '0')}</small><h3>{step.title}</h3><p>{step.text}</p></div><button onClick={() => go(step.area)} aria-label={`Open ${step.area}`}><ArrowRight size={16}/></button></article>)}</div>
      <footer><p><CheckCircle2 size={15}/> You can find this guide again in Settings.</p><button className="btn btn-primary btn-sm" onClick={onClose}>Got it</button></footer>
    </section>
  </div>
}
