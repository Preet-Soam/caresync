export type AvailabilityRow = { id: string; weekday: number | null; available_on: string | null; start_time: string; end_time: string; slot_duration: number; availability_status: 'available' | 'blocked' | 'leave' }
const key = (doctorId: string) => `caresync-demo-availability-${doctorId}`
const timezoneKey = (doctorId: string) => `caresync-demo-timezone-${doctorId}`

export function readDemoTimezone(doctorId: string) {
  try { return localStorage.getItem(timezoneKey(doctorId)) || 'Asia/Kolkata' } catch { return 'Asia/Kolkata' }
}

export function writeDemoTimezone(doctorId: string, value: string) {
  try { localStorage.setItem(timezoneKey(doctorId), value) } catch { /* browser-only demonstration */ }
}

export function localDateTimeToIso(date: string, time: string, timeZone: string): string | null {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.slice(0, 5).split(':').map(Number)
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null
  const target = Date.UTC(year, month - 1, day, hour, minute)
  let instant = target
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    for (let attempt = 0; attempt < 3; attempt++) {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]))
      const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute))
      instant += target - represented
    }
    const verify = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]))
    if (Number(verify.year) !== year || Number(verify.month) !== month || Number(verify.day) !== day || Number(verify.hour) !== hour || Number(verify.minute) !== minute) return null
    return new Date(instant).toISOString()
  } catch { return null }
}

export function generateSlots(row: AvailabilityRow, visitDate: string, timeZone: string, allRows: AvailabilityRow[] = [row]) {
  if (row.availability_status !== 'available') return []
  const weekday = new Date(`${visitDate}T00:00:00Z`).getUTCDay()
  if (row.available_on ? row.available_on !== visitDate : row.weekday !== weekday) return []
  const start = row.start_time.slice(0, 5), end = row.end_time.slice(0, 5)
  const [startHour, startMinute] = start.split(':').map(Number), [endHour, endMinute] = end.split(':').map(Number)
  const begin = startHour * 60 + startMinute, finish = endHour * 60 + endMinute, duration = Math.max(10, row.slot_duration)
  const result: { time: string; startsAt: string }[] = []
  for (let mins = begin; mins + duration <= finish; mins += duration) {
    const time = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
    const startsAt = localDateTimeToIso(visitDate, time, timeZone)
    const blocked = allRows.some(exception => {
      if (exception.availability_status === 'available') return false
      const matchesDate = exception.available_on ? exception.available_on === visitDate : exception.weekday === weekday
      if (!matchesDate) return false
      const blockStart = Number(exception.start_time.slice(0, 2)) * 60 + Number(exception.start_time.slice(3, 5))
      const blockEnd = Number(exception.end_time.slice(0, 2)) * 60 + Number(exception.end_time.slice(3, 5))
      return mins < blockEnd && mins + duration > blockStart
    })
    if (startsAt && !blocked && new Date(startsAt).getTime() > Date.now()) result.push({ time, startsAt })
  }
  return result
}

export function readDemoSchedule(doctorId: string): AvailabilityRow[] {
  try {
    const stored = localStorage.getItem(key(doctorId))
    if (stored) return JSON.parse(stored) as AvailabilityRow[]
  } catch { /* use the fictional starter schedule */ }
  return [1, 2, 3, 4, 5].map(weekday => ({ id: `sample-${doctorId}-${weekday}`, weekday, available_on: null, start_time: '09:00:00', end_time: '17:00:00', slot_duration: 30, availability_status: 'available' }))
}

export function writeDemoSchedule(doctorId: string, rows: AvailabilityRow[]) {
  try { localStorage.setItem(key(doctorId), JSON.stringify(rows)) } catch { /* browser-only demonstration */ }
  window.dispatchEvent(new Event(`caresync-schedule-${doctorId}`))
}

export function subscribeDemoSchedule(doctorId: string, callback: () => void) {
  const eventName = `caresync-schedule-${doctorId}`
  window.addEventListener(eventName, callback)
  return () => window.removeEventListener(eventName, callback)
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++ }
    else if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) { row.push(cell.trim()); cell = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(cell.trim()); cell = ''
      if (row.some(value => value)) rows.push(row)
      row = []
    } else cell += char
  }
  row.push(cell.trim())
  if (row.some(value => value)) rows.push(row)
  return rows
}

async function readXlsx(file: File): Promise<string[][]> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const signature = (offset: number) => view.getUint32(offset, true)
  let eocd = -1
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (signature(offset) === 0x06054b50) { eocd = offset; break }
  }
  if (eocd < 0) throw new Error('This .xlsx file could not be read. Save it again as an Excel workbook and retry.')
  const entries = view.getUint16(eocd + 10, true), centralStart = view.getUint32(eocd + 16, true)
  const zipFiles = new Map<string, { method: number; size: number; offset: number }>()
  let cursor = centralStart
  for (let index = 0; index < entries; index++) {
    if (signature(cursor) !== 0x02014b50) throw new Error('This Excel workbook has an unsupported file structure.')
    const method = view.getUint16(cursor + 10, true), size = view.getUint32(cursor + 20, true)
    const nameLength = view.getUint16(cursor + 28, true), extraLength = view.getUint16(cursor + 30, true), commentLength = view.getUint16(cursor + 32, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const name = new TextDecoder().decode(bytes.slice(cursor + 46, cursor + 46 + nameLength))
    zipFiles.set(name, { method, size, offset: localOffset })
    cursor += 46 + nameLength + extraLength + commentLength
  }
  const decoder = new TextDecoder()
  const readEntry = async (name: string) => {
    const entry = zipFiles.get(name)
    if (!entry) return ''
    const local = entry.offset
    const nameLength = view.getUint16(local + 26, true), extraLength = view.getUint16(local + 28, true)
    const start = local + 30 + nameLength + extraLength
    const compressed = bytes.slice(start, start + entry.size)
    if (entry.method === 0) return decoder.decode(compressed)
    if (entry.method !== 8) throw new Error('This Excel workbook uses an unsupported compression format.')
    try {
      const Decompressor = DecompressionStream as unknown as new (format: string) => TransformStream<Uint8Array, Uint8Array>
      const stream = new Blob([compressed]).stream().pipeThrough(new Decompressor('deflate-raw'))
      return await new Response(stream).text()
    } catch { throw new Error('This browser cannot open compressed .xlsx files. Save the workbook as CSV and import that instead.') }
  }
  const [sheetXml, stringsXml] = await Promise.all([readEntry('xl/worksheets/sheet1.xml'), readEntry('xl/sharedStrings.xml')])
  if (!sheetXml) throw new Error('The first worksheet is missing. Put the timetable on the first sheet and try again.')
  const parser = new DOMParser()
  const sheet = parser.parseFromString(sheetXml, 'application/xml')
  if (sheet.querySelector('parsererror')) throw new Error('The Excel worksheet could not be parsed.')
  const stringsDoc = stringsXml ? parser.parseFromString(stringsXml, 'application/xml') : null
  const sharedStrings = stringsDoc ? Array.from(stringsDoc.getElementsByTagName('si')).map(item => Array.from(item.getElementsByTagName('t')).map(text => text.textContent || '').join('')) : []
  const rows: string[][] = []
  for (const xmlRow of Array.from(sheet.getElementsByTagName('row'))) {
    const cells = Array.from(xmlRow.getElementsByTagName('c'))
    const row: string[] = []
    for (const cell of cells) {
      const address = cell.getAttribute('r') || ''
      const letters = address.match(/^[A-Z]+/i)?.[0] || ''
      let column = 0
      for (const letter of letters.toUpperCase()) column = column * 26 + letter.charCodeAt(0) - 64
      const type = cell.getAttribute('t')
      const value = cell.getElementsByTagName('v')[0]?.textContent || ''
      const inline = Array.from(cell.getElementsByTagName('t')).map(text => text.textContent || '').join('')
      row[Math.max(0, column - 1)] = type === 's' ? sharedStrings[Number(value)] || '' : type === 'inlineStr' ? inline : value
    }
    rows.push(row.map(value => value || ''))
  }
  return rows
}

export async function readScheduleSpreadsheet(file: File) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv')) return parseCsv(await file.text())
  if (name.endsWith('.xlsx')) return readXlsx(file)
  throw new Error('Choose an .xlsx Excel workbook or a .csv timetable.')
}

export function downloadScheduleTemplate() {
  const csv = [
    'Day,Date,Start,End,Slot minutes,Status',
    'Monday,,09:00,12:00,30,available',
    'Monday,,13:00,17:00,30,available',
    'Tuesday,,09:00,17:00,30,available',
    'Wednesday,,09:00,17:00,30,available',
    'Thursday,,09:00,17:00,30,available',
    'Friday,,09:00,17:00,30,available',
    'Saturday,,,,30,blocked',
    'Sunday,,,,30,blocked',
    ',2026-12-25,,,30,holiday',
    ',2026-12-26,,,30,leave',
  ].join('\r\n')
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = 'caresync-weekly-timetable-template.csv'; anchor.click()
  URL.revokeObjectURL(url)
}
