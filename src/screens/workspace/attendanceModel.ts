import type { AttendanceRecord, AttendanceRecordUpdate, AttendanceStatus } from '../../api/attendance'

export interface AttendanceDraftValue {
  status: AttendanceStatus
  note: string
}

export type AttendanceDraft = Record<string, AttendanceDraftValue>

export interface StoredAttendanceDraft {
  sheetId: string
  revision: number
  classNote: string
  statuses: AttendanceDraft
}

export function statusesFromRecords(records: AttendanceRecord[]): AttendanceDraft {
  return Object.fromEntries(records.map((record) => [record.id, {
    status: record.status,
    note: record.note ?? '',
  }]))
}

export function changedAttendanceRecords(
  records: AttendanceRecord[],
  statuses: AttendanceDraft,
): AttendanceRecordUpdate[] {
  return records.flatMap((record) => {
    const draft = statuses[record.id]
    if (!draft) return []
    const nextNote = draft.note.trim()
    const currentNote = (record.note ?? '').trim()
    if (draft.status === record.status && nextNote === currentNote) return []
    return [{ record_id: record.id, status: draft.status, note: nextNote || null }]
  })
}

export function restoreAttendanceDraft(
  stored: StoredAttendanceDraft | null,
  records: AttendanceRecord[],
): AttendanceDraft {
  const fallback = statusesFromRecords(records)
  if (!stored?.statuses || typeof stored.statuses !== 'object') return fallback

  return Object.fromEntries(records.map((record) => {
    const saved = (stored.statuses as unknown as Record<string, AttendanceDraftValue | AttendanceStatus>)[record.id]
    if (typeof saved === 'string' && isAttendanceStatus(saved)) {
      return [record.id, { status: saved, note: record.note ?? '' }]
    }
    if (saved && typeof saved === 'object' && isAttendanceStatus(saved.status)) {
      return [record.id, { status: saved.status, note: typeof saved.note === 'string' ? saved.note : '' }]
    }
    return [record.id, fallback[record.id]]
  }))
}

function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return value === 'present' || value === 'absent' || value === 'late' || value === 'half_day' || value === 'excused'
}

export type AttendanceRosterFilter = 'all' | 'exceptions' | 'changed' | AttendanceStatus

export function filterAttendanceRecords(
  records: AttendanceRecord[],
  search: string,
  filter: AttendanceRosterFilter,
  originalRecords: AttendanceRecord[] = [],
  studentId?: string | null,
) {
  const query = search.trim().toLowerCase()
  const originalById = new Map(originalRecords.map((record) => [record.id, record]))
  return records.filter((record) => {
    if (studentId && record.student_id !== studentId) return false
    if (query && !`${record.student_name} ${record.student_code}`.toLowerCase().includes(query)) return false
    if (filter === 'all') return true
    if (filter === 'exceptions') return record.status !== 'present'
    if (filter === 'changed') {
      const original = originalById.get(record.id)
      return Boolean(original && (
        original.status !== record.status
        || (original.note ?? '').trim() !== (record.note ?? '').trim()
      ))
    }
    return record.status === filter
  })
}

export function todaySchoolDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function hasAttendanceChanges(
  records: AttendanceRecord[],
  statuses: AttendanceDraft,
  classNote: string,
  serverClassNote?: string | null,
) {
  return changedAttendanceRecords(records, statuses).length > 0
    || classNote.trim() !== (serverClassNote ?? '').trim()
}

export function formatSchoolDate(value?: string | null) {
  if (!value) return 'Today'
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const parsed = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
