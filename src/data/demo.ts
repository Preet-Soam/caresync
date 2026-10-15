import type { Appointment, Doctor, Review } from '../types'

export const doctors: Doctor[] = [
  { id: 'd1', name: 'Dr. Shreya', specialty: 'Cardiology', department: 'Heart & Vascular', experience: '12 years experience', rating: '4.9',ratingCount:128,clinicRating:'4.7',clinicRatingCount:214,qualifications:'MBBS · MD (General Medicine) · DM (Cardiology)', fee: 850, initials: 'S', color: 'lavender', nextSlot: 'Today, 4:30 PM',clinicName:'CareSync Demo Heart Clinic',address:'12 Connaught Place',city:'New Delhi',state:'Delhi',postalCode:'110001',country:'India',latitude:28.6315,longitude:77.2167 },
  { id: 'd2', name: 'Dr. Arjun Mehta', specialty: 'Dermatology', department: 'Skin & Wellness', experience: '8 years experience', rating: '4.8',ratingCount:96,clinicRating:'4.6',clinicRatingCount:174,qualifications:'MBBS · MD (Dermatology)', fee: 650, initials: 'AM', color: 'mint', nextSlot: 'Tomorrow, 10:00 AM',clinicName:'CareSync Demo Skin Clinic',address:'44 South Extension Part I',city:'New Delhi',state:'Delhi',postalCode:'110049',country:'India',latitude:28.5685,longitude:77.2201 },
  { id: 'd3', name: 'Dr. Sarah Thomas', specialty: 'Pediatrics', department: 'Children’s Health', experience: '10 years experience', rating: '4.9',ratingCount:142,clinicRating:'4.8',clinicRatingCount:188,qualifications:'MBBS · MD (Pediatrics)', fee: 700, initials: 'ST', color: 'peach', nextSlot: 'Today, 5:15 PM',clinicName:'CareSync Demo Children’s Clinic',address:'8 Karol Bagh',city:'New Delhi',state:'Delhi',postalCode:'110005',country:'India',latitude:28.6514,longitude:77.1907 },
  { id: 'd4', name: 'Dr. Neel Shah', specialty: 'Neurology', department: 'Brain & Nerves', experience: '15 years experience', rating: '4.7',ratingCount:81,clinicRating:'4.5',clinicRatingCount:121,qualifications:'MBBS · MD (Neurology) · DM (Neurology)', fee: 1000, initials: 'NS', color: 'blue', nextSlot: 'Fri, 11:30 AM',clinicName:'CareSync Demo Neuro Clinic',address:'26 Sector 12, Dwarka',city:'New Delhi',state:'Delhi',postalCode:'110078',country:'India',latitude:28.5921,longitude:77.0460 },
]

export const initialAppointments: Appointment[] = [
  { id: 'a1', doctor: 'Dr. Shreya', specialty: 'Cardiology', date: 'Today, Oct 15', time: '4:30 PM', status: 'confirmed', type: 'In person', initials: 'S', color: 'lavender' },
  { id: 'a2', doctor: 'Dr. Arjun Mehta', specialty: 'Dermatology', date: 'Oct 18, 2026', time: '10:00 AM', status: 'pending', type: 'Video consult', initials: 'AM', color: 'mint' },
  { id: 'a3', doctor: 'Dr. Sarah Thomas', specialty: 'Pediatrics', date: 'Oct 09, 2026', time: '11:15 AM', status: 'completed', type: 'In person', initials: 'ST', color: 'peach' },
]

export const demoReviews: Record<string, Review[]> = {
  d1: [{ id: 'demo-review-d1', doctorComment: 'Dr. Shreya explained each step clearly and answered all my questions.', clinicComment: 'The clinic was clean and the front desk helped me check in quickly.', doctorRating: 5, clinicRating: 5, createdAt: '2026-09-20T00:00:00Z' }],
  d2: [{ id: 'demo-review-d2', doctorComment: 'The doctor listened carefully and gave me a clear treatment plan.', clinicComment: 'Easy to find, with a comfortable waiting area.', doctorRating: 5, clinicRating: 4, createdAt: '2026-09-16T00:00:00Z' }],
  d3: [{ id: 'demo-review-d3', doctorComment: 'Kind and patient with my child. The visit felt reassuring.', clinicComment: 'We were seen on time and the staff were welcoming.', doctorRating: 5, clinicRating: 5, createdAt: '2026-09-12T00:00:00Z' }],
  d4: [{ id: 'demo-review-d4', doctorComment: 'The consultation was thorough and my questions were taken seriously.', clinicComment: 'Helpful staff, though the wait was a little longer than expected.', doctorRating: 4, clinicRating: 4, createdAt: '2026-09-08T00:00:00Z' }],
}

export const chartData = [
  { day: 'Mon', value: 34 }, { day: 'Tue', value: 49 }, { day: 'Wed', value: 42 },
  { day: 'Thu', value: 68 }, { day: 'Fri', value: 56 }, { day: 'Sat', value: 76 }, { day: 'Sun', value: 61 },
]
