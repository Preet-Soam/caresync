import type { Appointment, ReviewQueueItem } from '../types'

// The demo intentionally stays local, but its role workspaces share the same
// persisted state so a patient action can be followed by a doctor or admin.
const storageKey = 'caresync-demo-workspace-v2'
const changeEvent = 'caresync-demo-workspace-updated'

export type DemoPrescription = { id:string; appointmentId:string; doctorId:string; patientId:string; patientName:string; doctorName:string; issuedAt:string; items:{medication_name:string;dosage:string;route:string;frequency:string;duration:string;instructions:string}[] }
export type DemoConsultation = { id:string; appointmentId:string; patientId:string; doctorName:string; createdAt:string; clinicalNotes:string; diagnosis:string|null; treatmentPlan:string|null; followUpDate:string|null }
export type DemoReview = ReviewQueueItem & { appointmentId:string; patientId:string; status:'pending'|'approved'|'hidden' }
type DemoState = { appointments:Appointment[]; prescriptions:DemoPrescription[]; consultations:DemoConsultation[]; reviews:DemoReview[] }
const emptyState = (): DemoState => ({ appointments:[], prescriptions:[], consultations:[], reviews:[] })

function readState(): DemoState {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || 'null') as Partial<DemoState> | null
    if (!value || typeof value !== 'object') return emptyState()
    return {
      appointments:Array.isArray(value.appointments)?value.appointments:[],
      prescriptions:Array.isArray(value.prescriptions)?value.prescriptions:[],
      consultations:Array.isArray(value.consultations)?value.consultations:[],
      reviews:Array.isArray(value.reviews)?value.reviews:[],
    }
  } catch { return emptyState() }
}

let state = readState()
const listeners = new Set<() => void>()
function notify() {
  listeners.forEach(listener => listener())
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(changeEvent))
}
function save(next:DemoState) {
  state = next
  try { localStorage.setItem(storageKey, JSON.stringify(state)) } catch { /* demo persistence is best-effort */ }
  notify()
}
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key === storageKey) { state = readState(); notify() }
})

export function getDemoAppointments() { return state.appointments }
export function subscribeDemoAppointments(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function addDemoAppointment(appointment: Appointment) {
  save({ ...state, appointments:[appointment,...state.appointments.filter(item=>item.id!==appointment.id)] })
}
export function updateDemoAppointment(id: string, update: Partial<Appointment>) {
  save({ ...state, appointments:state.appointments.map(appointment => appointment.id === id ? { ...appointment, ...update } : appointment) })
}
export function getDemoPrescriptions(patientId?: string, doctorId?:string) { return state.prescriptions.filter(item => (!patientId || item.patientId === patientId) && (!doctorId || item.doctorId === doctorId)) }
export function addDemoPrescription(prescription: DemoPrescription) { save({ ...state, prescriptions:[prescription,...state.prescriptions.filter(item=>item.id!==prescription.id)] }) }
export function getDemoConsultations(patientId?: string) { return state.consultations.filter(item => !patientId || item.patientId === patientId) }
export function addDemoConsultation(consultation: DemoConsultation) { save({ ...state, consultations:[consultation,...state.consultations.filter(item=>item.appointmentId!==consultation.appointmentId)] }) }
export function getDemoReviews(status?:DemoReview['status']) { return state.reviews.filter(item=>!status||item.status===status) }
export function addDemoReview(review:DemoReview) { save({ ...state, reviews:[review,...state.reviews.filter(item=>item.id!==review.id)] }) }
export function setDemoReviewStatus(id:string,status:DemoReview['status']) { save({ ...state, reviews:state.reviews.map(item=>item.id===id?{...item,status}:item) }) }
