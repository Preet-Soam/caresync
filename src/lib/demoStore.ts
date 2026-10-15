import { initialAppointments } from '../data/demo'
import type { Appointment } from '../types'

// Fictional in-memory demo data only. This store is never used for authenticated records.
let appointments = [...initialAppointments]
const listeners = new Set<() => void>()

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
