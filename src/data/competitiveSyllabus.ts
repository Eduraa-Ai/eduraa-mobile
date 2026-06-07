export type CompetitiveStandard = '11th' | '12th'
export type CompetitiveSubjectKey = 'physics' | 'chemistry' | 'mathematics'

type TrackKey = 'jee' | 'mhcet'
type TrackCatalog = Record<CompetitiveStandard, Record<CompetitiveSubjectKey, string[]>>

const JEE_CATALOG: TrackCatalog = {
  '11th': {
    physics: [
      'Units and Measurements',
      'Kinematics',
      'Laws of Motion',
      'Work, Energy and Power',
      'Rotational Motion',
      'Gravitation',
      'Properties of Solids and Liquids',
      'Thermodynamics',
      'Kinetic Theory of Gases',
      'Oscillations and Waves',
    ],
    chemistry: [
      'Some Basic Concepts of Chemistry',
      'Structure of Atom',
      'Classification of Elements and Periodicity',
      'Chemical Bonding and Molecular Structure',
      'States of Matter',
      'Thermodynamics',
      'Equilibrium',
      'Redox Reactions',
      'Hydrogen',
      's-Block Elements',
      'Some p-Block Elements',
      'Organic Chemistry - Basic Principles and Techniques',
      'Hydrocarbons',
      'Environmental Chemistry',
    ],
    mathematics: [
      'Sets, Relations and Functions',
      'Complex Numbers and Quadratic Equations',
      'Permutations and Combinations',
      'Binomial Theorem',
      'Sequence and Series',
      'Trigonometry',
      'Coordinate Geometry',
      'Statistics and Probability',
      'Limits and Derivatives',
    ],
  },
  '12th': {
    physics: [
      'Electrostatics',
      'Current Electricity',
      'Magnetic Effects of Current and Magnetism',
      'Electromagnetic Induction and Alternating Currents',
      'Electromagnetic Waves',
      'Optics',
      'Dual Nature of Matter and Radiation',
      'Atoms and Nuclei',
      'Electronic Devices',
      'Experimental Skills',
    ],
    chemistry: [
      'Solid State',
      'Solutions',
      'Electrochemistry',
      'Chemical Kinetics',
      'Surface Chemistry',
      'General Principles and Processes of Isolation of Elements',
      'p-Block Elements',
      'd- and f-Block Elements',
      'Coordination Compounds',
      'Haloalkanes and Haloarenes',
      'Alcohols, Phenols and Ethers',
      'Aldehydes, Ketones and Carboxylic Acids',
      'Organic Compounds Containing Nitrogen',
      'Biomolecules',
      'Polymers',
      'Chemistry in Everyday Life',
    ],
    mathematics: [
      'Matrices and Determinants',
      'Inverse Trigonometric Functions',
      'Continuity and Differentiability',
      'Applications of Derivatives',
      'Integral Calculus',
      'Differential Equations',
      'Vector Algebra',
      'Three Dimensional Geometry',
      'Probability',
    ],
  },
}

function normalizeTrackKey(value?: string | null): TrackKey {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized.includes('mh-cet') || normalized.includes('mhcet')) return 'mhcet'
  return 'jee'
}

export function normalizeCompetitiveSubject(value?: string | null): CompetitiveSubjectKey | null {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized.includes('physics')) return 'physics'
  if (normalized.includes('chemistry')) return 'chemistry'
  if (normalized.includes('math')) return 'mathematics'
  return null
}

export function subjectDisplayName(subject: CompetitiveSubjectKey) {
  if (subject === 'mathematics') return 'Mathematics'
  return subject.charAt(0).toUpperCase() + subject.slice(1)
}

export function getCompetitiveSyllabus(trackLabel: string | null | undefined, subjectName: string, standard: CompetitiveStandard) {
  const trackKey = normalizeTrackKey(trackLabel)
  const subjectKey = normalizeCompetitiveSubject(subjectName)
  const catalog = trackKey === 'mhcet' ? JEE_CATALOG : JEE_CATALOG
  const chapters = subjectKey ? catalog[standard][subjectKey] ?? [] : []

  return {
    trackKey,
    trackLabel: trackKey === 'mhcet' ? 'MH-CET aligned chapter list' : 'JEE Main / JEE Advanced aligned chapter list',
    sourceSummary: 'Published JEE Main and JEE Advanced syllabus references mapped into 11th and 12th chapter groups.',
    chapters,
  }
}
