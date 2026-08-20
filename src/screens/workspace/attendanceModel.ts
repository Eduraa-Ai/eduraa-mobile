import type { AttendanceRecord, AttendanceRecordUpdate, AttendanceStatus } from '../../api/attendance'

export type AttendanceDraft = Record<string, AttendanceStatus>

export interface StoredAttendanceDraft {
  sheetId: string
  revision: number
  classNote: string
  statuses: AttendanceDraft
}

export function statusesFromRecords(records: AttendanceRecord[]): AttendanceDraft {
  return Object.fromEntries(records.map((record) => [record.id, record.status]))
}

export function changedAttendanceRecords(
  records: AttendanceRecord[],
  statuses: AttendanceDraft,
): AttendanceRecordUpdate[] {
  return records.flatMap((record) => {
    const status = statuses[record.id]
    if (!status || status === record.status) return []
    return [{ record_id: record.id, status, note: record.note }]
  })
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
