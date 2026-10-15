export type Role = 'patient' | 'doctor' | 'administrator'
export type AppointmentStatus = 'confirmed' | 'pending' | 'completed' | 'cancelled'

export interface Doctor {
  id: string; name: string; specialty: string; department: string; experience: string
  rating: string; fee: number; initials: string; color: string; nextSlot: string
  clinicName?: string; address?: string; city?: string; state?: string; postalCode?: string; country?: string
  latitude?: number | null; longitude?: number | null
  qualifications?: string; ratingCount?: number; clinicRating?: string; clinicRatingCount?: number
}
export interface Review {
  id: string; doctorComment: string; clinicComment: string
  doctorRating: number; clinicRating: number; createdAt: string
}
export interface ReviewQueueItem extends Review {
  doctorId: string; doctorName: string; specialty: string
}
export interface Appointment {
  id: string; doctor: string; specialty: string; date: string; time: string
  status: AppointmentStatus; type: string; initials: string; color: string
}
