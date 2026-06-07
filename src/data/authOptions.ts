import type { SelectOption } from '../components/ui/SelectField'

const indiaStates = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
]

const indiaUnionTerritories = [
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
]

export const schoolBoardOptions: SelectOption[] = [
  ...indiaStates,
  ...indiaUnionTerritories,
].map((state) => ({
  label: `State Board - ${state}`,
  value: `State Board - ${state}`,
})).concat([
  { label: 'CBSE', value: 'CBSE' },
  { label: 'ICSE', value: 'ICSE' },
  { label: 'IGCSE', value: 'IGCSE' },
  { label: 'Other', value: 'Other' },
])

export const schoolStandardOptions: SelectOption[] = Array.from({ length: 12 }, (_, index) => {
  const standard = `Std ${index + 1}`
  return { label: standard, value: standard }
})

export const scienceExamOptions = [
  { label: 'JEE Mains', value: 'jee_mains' },
  { label: 'JEE Advanced', value: 'jee_advanced' },
  { label: 'MH-CET', value: 'mh_cet' },
] as const

export type ScienceExam = (typeof scienceExamOptions)[number]['value']

export const optionLabel = (
  options: readonly { label: string; value: string }[],
  value?: string | null,
) => {
  if (!value) return ''
  return options.find((item) => item.value === value)?.label ?? value
}

export const normalizeListOptions = (values?: string[] | null): string[] => {
  const options: string[] = []
  ;(values ?? []).forEach((value) => {
    const trimmed = value.trim()
    if (!trimmed) return
    if (!options.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
      options.push(trimmed)
    }
  })
  return options
}

export const normalizeBoardOptions = (
  boards?: string[] | null,
  boardOther?: string | null,
): string[] => {
  const options: string[] = []
  const addOption = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    if (!options.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
      options.push(trimmed)
    }
  }
  const otherBoards = boardOther?.split(',').map((value) => value.trim()).filter(Boolean) ?? []

  ;(boards ?? []).forEach((board) => {
    if (board.trim().toLowerCase() === 'other') {
      otherBoards.forEach(addOption)
    } else {
      addOption(board)
    }
  })

  otherBoards.forEach(addOption)
  return options
}

export const normalizeStandardValue = (value?: string | null): string => {
  if (!value) return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.toLowerCase() === 'jee (mains & advanced)') return 'JEE Mains & Advanced'
  return trimmed
}

export const normalizeStandardList = (values: string[] = []): string[] => {
  const seen = new Set<string>()
  const output: string[] = []
  values.forEach((value) => {
    const normalized = normalizeStandardValue(value)
    if (!normalized) return
    const key = normalized.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    output.push(normalized)
  })
  return output
}

export const toSelectOptions = (values: string[]): SelectOption[] =>
  values.map((value) => ({ label: value, value }))
