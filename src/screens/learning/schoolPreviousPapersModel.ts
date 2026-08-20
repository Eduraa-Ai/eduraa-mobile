import type { SchoolPreviousPaper } from '../../api/previousPapers'
import type { PaperListItem, Role } from '../../types'

export type SchoolPaperSource = 'practice' | 'shared'
export type SchoolPaperAction = 'attempt' | 'open_details' | 'open_pdf'

export interface SchoolPreviousPaperFilters {
  search: string
  subject: string | null
  standard: string | null
  year: string | null
  status: string | null
}

function normalized(value?: string | null) {
  return String(value ?? '').trim().toLocaleLowerCase()
}

function uniqueSorted(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))]
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
}

export function schoolPaperYear(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : String(date.getFullYear())
}

export function getSchoolPreviousPaperFilters(
  sharedPapers: readonly SchoolPreviousPaper[],
  practicePapers: readonly PaperListItem[],
) {
  const years = uniqueSorted([
    ...sharedPapers.map((paper) => schoolPaperYear(paper.published_at || paper.created_at)),
    ...practicePapers.map((paper) => schoolPaperYear(paper.created_at)),
  ]).sort((left, right) => Number(right) - Number(left))

  return {
    subjects: uniqueSorted([
      ...sharedPapers.map((paper) => paper.subject_label),
      ...practicePapers.map((paper) => paper.subject_name),
    ]),
    standards: uniqueSorted([
      ...sharedPapers.map((paper) => paper.standard),
      ...practicePapers.map((paper) => paper.standard),
    ]),
    years,
    statuses: uniqueSorted(sharedPapers.map((paper) => paper.status)),
  }
}

export function filterSharedSchoolPapers(
  papers: readonly SchoolPreviousPaper[],
  filters: SchoolPreviousPaperFilters,
) {
  const search = normalized(filters.search)
  return papers.filter((paper) => {
    if (filters.subject && normalized(paper.subject_label) !== normalized(filters.subject)) return false
    if (filters.standard && normalized(paper.standard) !== normalized(filters.standard)) return false
    if (filters.year && schoolPaperYear(paper.published_at || paper.created_at) !== filters.year) return false
    if (filters.status && normalized(paper.status) !== normalized(filters.status)) return false
    if (
      search &&
      !normalized([
        paper.title,
        paper.description,
        paper.subject_label,
        paper.class_label,
        paper.standard,
        paper.division,
        paper.teacher_name,
        paper.original_filename,
      ].filter(Boolean).join(' ')).includes(search)
    ) {
      return false
    }
    return true
  })
}

export function filterPracticeSchoolPapers(
  papers: readonly PaperListItem[],
  filters: Omit<SchoolPreviousPaperFilters, 'status'>,
) {
  const search = normalized(filters.search)
  return papers.filter((paper) => {
    if (filters.subject && normalized(paper.subject_name) !== normalized(filters.subject)) return false
    if (filters.standard && normalized(paper.standard) !== normalized(filters.standard)) return false
    if (filters.year && schoolPaperYear(paper.created_at) !== filters.year) return false
    if (
      search &&
      !normalized([
        paper.title,
        paper.subject_name,
        paper.standard,
        paper.division,
        paper.category,
      ].filter(Boolean).join(' ')).includes(search)
    ) {
      return false
    }
    return true
  })
}

export function schoolPaperActions(
  role: Role,
  source: SchoolPaperSource,
): SchoolPaperAction[] {
  if (role === 'student') return source === 'practice' ? ['attempt'] : ['open_pdf']
  if (role === 'teacher') return source === 'practice' ? ['open_details'] : ['open_pdf']
  return []
}

export function schoolPaperContextLabel(values: Array<string | null | undefined>) {
  return values.map((value) => value?.trim()).filter(Boolean).join(' · ')
}

export function schoolPaperFilename(paper: SchoolPreviousPaper) {
  const title = paper.title.trim() || paper.original_filename || `school-paper-${paper.id}`
  return title.toLocaleLowerCase().endsWith('.pdf') ? title : `${title}.pdf`
}
