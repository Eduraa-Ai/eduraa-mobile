import { colors } from '../../theme'
import type { CompetitiveChapterOption, CompetitiveStandard, CompetitiveWorkspacePayload, StudyPackKey } from '../../api/competitiveExam'
import type { AccountMinimal } from '../../types'

export const fallbackCompetitiveSubjects = ['Physics', 'Chemistry', 'Mathematics']
export const studyPackKeys: StudyPackKey[] = ['formula_sheet', 'hacks', 'real_life', 'revision_notes']

export function isCompetitiveLearner(user?: AccountMinimal | null) {
  return user?.role === 'b2c_student' && user.b2c_education_level === 'competitive_exams'
}

export function profileSubjects(userSubjects?: string[] | null) {
  const clean = (userSubjects ?? []).map((item) => item.trim()).filter(Boolean)
  return fallbackCompetitiveSubjects.map((fallback, index) => clean[index] ?? fallback)
}

export function subjectTone(subject: string) {
  const key = subject.toLowerCase()
  if (key.includes('physics')) return colors.warning
  if (key.includes('chemistry')) return colors.success
  if (key.includes('math')) return colors.info
  if (key.includes('biology')) return colors.danger
  return colors.accent
}

export function subjectSymbol(subject: string) {
  const key = subject.toLowerCase()
  if (key.includes('physics')) return 'P'
  if (key.includes('chemistry')) return 'C'
  if (key.includes('math')) return 'M'
  if (key.includes('biology')) return 'B'
  return subject.trim().charAt(0).toUpperCase() || 'S'
}

export function subjectSupportCopy(subject: string) {
  const key = subject.toLowerCase()
  if (key.includes('physics')) return 'Mechanics, numericals, and concept drills'
  if (key.includes('chemistry')) return 'Reactions, memory blocks, and quick revision'
  if (key.includes('math')) return 'Problem solving, speed work, and accuracy'
  if (key.includes('biology')) return 'Recall-heavy topics, diagrams, and fact revision'
  return 'Focused practice and revision for this subject'
}

export function normalizeSubjectName(value?: string | null) {
  return String(value || '').trim().toLowerCase()
}

export function decodeRouteParam(value?: string) {
  if (!value) return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function standardVariants(value: CompetitiveStandard): string[] {
  return value === '11th' ? ['11th', 'Std 11'] : ['12th', 'Std 12']
}

export function splitDistinctValues(value?: string | null): string[] {
  return Array.from(
    new Set(
      String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  )
}

export function chapterIdentity(chapter: CompetitiveChapterOption, fallbackIndex: number) {
  return chapter.id || `${chapter.title}-${fallbackIndex}`
}

export function dedupeChapters(chapters: CompetitiveChapterOption[]): CompetitiveChapterOption[] {
  const unique = new Map<string, CompetitiveChapterOption>()
  chapters.forEach((chapter) => {
    const key =
      chapter.id ||
      `${String(chapter.document_title || '').trim().toLowerCase()}::${String(chapter.index ?? '')}::${chapter.title.trim().toLowerCase()}`
    if (!unique.has(key)) unique.set(key, chapter)
  })

  return Array.from(unique.values()).sort((a, b) => {
    const indexA = a.index ?? Number.MAX_SAFE_INTEGER
    const indexB = b.index ?? Number.MAX_SAFE_INTEGER
    if (indexA !== indexB) return indexA - indexB
    return a.title.localeCompare(b.title)
  })
}

export function studyTabLabel(key: StudyPackKey) {
  switch (key) {
    case 'formula_sheet':
      return 'Formula'
    case 'hacks':
      return 'Hacks'
    case 'real_life':
      return 'Real life'
    case 'revision_notes':
      return 'Revision'
  }
}

export function studyTabIcon(key: StudyPackKey) {
  switch (key) {
    case 'formula_sheet':
      return 'flask-outline' as const
    case 'hacks':
      return 'bulb-outline' as const
    case 'real_life':
      return 'planet-outline' as const
    case 'revision_notes':
      return 'reader-outline' as const
  }
}

export function diagramTitle(diagramKind?: string | null) {
  if (diagramKind === 'timeline') return 'Timeline'
  if (diagramKind === 'table') return 'Learning table'
  return 'Flowchart'
}

export function diagramSteps(textDiagram?: string | null) {
  return String(textDiagram || '')
    .split(/\n|->/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export function buildFallbackStudyPack(params: {
  subject: string
  chapter: string
  standard: CompetitiveStandard
}): CompetitiveWorkspacePayload {
  const { subject, chapter, standard } = params

  return {
    summary: `${chapter} study workspace for ${subject} with formulas, shortcuts, memory hooks, and quick revision structure.`,
    formula_sheet: [
      {
        title: `${chapter} core definitions`,
        detail: `Start with the base definitions, units, symbols, and standard notation used in ${chapter}.`,
      },
      {
        title: 'Must-remember equations',
        detail: `Write the 4 to 6 equations most frequently used in ${chapter} and mark the condition for each one.`,
      },
      {
        title: 'Variable mapping',
        detail: `Track what each symbol means before solving. In ${subject}, symbol confusion is a common error source.`,
      },
      {
        title: 'Exam-use checkpoint',
        detail: `Before applying a formula, check assumptions, units, sign convention, and whether the relation belongs to ${standard} scope.`,
      },
    ],
    hacks: [
      {
        title: 'Spot the pattern first',
        detail: `Classify the question type in the first 10 seconds. Most ${chapter} questions repeat a small number of patterns.`,
      },
      {
        title: 'Estimate before solving',
        detail: 'Predict the sign, magnitude, or trend first. This catches algebra mistakes early.',
      },
      {
        title: 'Use elimination shortcuts',
        detail: 'In MCQs, remove dimensionally wrong or conceptually impossible options before full calculation.',
      },
    ],
    real_life: [
      {
        title: `${chapter} in everyday systems`,
        detail: `Connect the chapter to motion, devices, materials, measurements, or engineered systems around you.`,
      },
      {
        title: 'Why the model matters',
        detail: `Ask where the idealized model of ${chapter} appears in labs, machines, transport, or infrastructure.`,
      },
    ],
    revision_notes: [
      {
        title: 'One-page revision',
        detail: `Reduce ${chapter} to formulas, trigger words, and 5 high-frequency ideas only.`,
      },
      {
        title: 'Mistake audit',
        detail: 'Review your recurring mistakes: sign errors, unit errors, skipped assumptions, or wrong formula selection.',
      },
    ],
    memory_tips: [
      `Say the ${chapter} solving order aloud once before practice.`,
      'Group formulas by use-case, not by chapter order.',
      'Revise trap patterns before long derivations.',
    ],
    diagram_kind: 'flowchart',
    text_diagram: [
      `${chapter}: start with the core idea`,
      'Identify what is given and what must be found',
      'Choose the correct rule, formula, or pattern',
      'Apply the condition and shortcut carefully',
      'Check unit, sign, and boundary case',
      'Match result with the exam pattern',
    ].join('\n'),
    source: 'fallback',
    generated_at: new Date().toISOString(),
  }
}

export function buildScopedTutorPrompt(params: {
  track: string
  subject: string
  standard: CompetitiveStandard
  chapter: string
  question: string
}) {
  return [
    'You are a competitive exam tutor helping a student on a chapter workspace.',
    `Track: ${params.track}`,
    `Subject: ${params.subject}`,
    `Standard: ${params.standard}`,
    `Active chapter: ${params.chapter}`,
    "Answer the student's request using this chapter context first.",
    'Be concise but clear. Give formulas, shortcuts, worked logic, and exam traps when useful.',
    `Student request: ${params.question}`,
  ].join('\n')
}
