import { initialAppointments } from '../data/demo'
import type { Appointment } from '../types'

// Fictional in-memory demo data only. This store is never used for authenticated records.
let appointments = [...initialAppointments]
const listeners = new Set<() => void>()
export type DemoPrescription = { id:string; patientId:string; patientName:string; doctorName:string; issuedAt:string; items:{medication_name:string;dosage:string;route:string;frequency:string;duration:string;instructions:string}[] }
let prescriptions: DemoPrescription[] = []
export type DemoConsultation = { id:string; appointmentId:string; patientId:string; doctorName:string; createdAt:string; clinicalNotes:string; diagnosis:string|null; treatmentPlan:string|null; followUpDate:string|null }
let consultations: DemoConsultation[] = []

export function getDemoAppointments() { return appointments }
export function subscribeDemoAppointments(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function addDemoAppointment(appointment: Appointment) {
  appointments = [appointment, ...appointments]
  listeners.forEach(listener => listener())
}
export function updateDemoAppointment(id: string, update: Partial<Appointment>) {
  appointments = appointments.map(appointment => appointment.id === id ? { ...appointment, ...update } : appointment)
  listeners.forEach(listener => listener())
}
export function getDemoPrescriptions(patientId: string) { return prescriptions.filter(item => item.patientId === patientId) }
export function addDemoPrescription(prescription: DemoPrescription) { prescriptions = [prescription, ...prescriptions]; listeners.forEach(listener => listener()) }
export function getDemoConsultations(patientId: string) { return consultations.filter(item => item.patientId === patientId) }
export function addDemoConsultation(consultation: DemoConsultation) { consultations = [consultation, ...consultations.filter(item=>item.appointmentId!==consultation.appointmentId)]; listeners.forEach(listener => listener()) }
