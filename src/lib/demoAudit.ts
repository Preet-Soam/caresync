export type DemoAuditEvent = { id: string; actor_role: 'patient' | 'doctor' | 'administrator'; action: string; resource_type: string; resource_id: string | null; occurred_at: string }
const storageKey = 'caresync-demo-audit'
const changeEvent = 'caresync-demo-audit-updated'

export function readDemoAudit(): DemoAuditEvent[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]')
    return Array.isArray(value) ? value.slice(0, 10) as DemoAuditEvent[] : []
  } catch { return [] }
}

export function recordDemoActivity(actor_role: DemoAuditEvent['actor_role'], action: string, resource_type: string, resource_id: string | null = null) {
  const event: DemoAuditEvent = { id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, actor_role, action, resource_type, resource_id, occurred_at: new Date().toISOString() }
  try { localStorage.setItem(storageKey, JSON.stringify([event, ...readDemoAudit()].slice(0, 10))) } catch { /* demo audit remains best-effort in browser storage */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(changeEvent))
}

export function subscribeDemoAudit(onUpdate: () => void) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(changeEvent, onUpdate)
  return () => window.removeEventListener(changeEvent, onUpdate)
}
