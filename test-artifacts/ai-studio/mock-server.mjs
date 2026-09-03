import http from 'node:http'

const PORT = Number(process.env.MOCK_PORT || 8000)
const SEED = 'studio-row-20260718'
const PAPER_SEED = 'paper-studio-row-20260718'
const PREVIOUS_PAPERS_SEED = 'pr6-pyq-20260725'
const GENERATED_PAPER_ID = '60000000-0000-4000-8000-000000000001'
const PREVIOUS_PAPER_ID = '91000000-0000-4000-8000-000000000001'
const PREVIOUS_ATTEMPT_PAPER_ID = '92000000-0000-4000-8000-000000000001'
const EXAM_WORKSPACE_SEED = 'b2b-exams-20260725'
const TEACHER_EXAM_ID = '96000000-0000-4000-8000-000000000001'
const TEACHER_PAPER_DONE_ID = '96100000-0000-4000-8000-000000000001'
const TEACHER_PAPER_OPEN_ID = '96100000-0000-4000-8000-000000000002'
const PRACTICE_PAPER_DONE_ID = '96200000-0000-4000-8000-000000000001'
const PRACTICE_PAPER_OPEN_ID = '96200000-0000-4000-8000-000000000002'
const conversations = [
    {
        id: '10000000-0000-4000-8000-000000000001',
        title: 'Rotational dynamics doubt',
        last_message_at: '2026-07-18T05:50:00.000Z',
        created_at: '2026-07-18T05:45:00.000Z',
        updated_at: '2026-07-18T05:50:00.000Z',
    },
    {
        id: '10000000-0000-4000-8000-000000000002',
        title: 'Analyze mock-test score',
        last_message_at: '2026-07-18T04:00:00.000Z',
        created_at: '2026-07-18T03:56:00.000Z',
        updated_at: '2026-07-18T04:00:00.000Z',
    },
    {
        id: '10000000-0000-4000-8000-000000000003',
        title: 'JEE revision plan',
        last_message_at: '2026-07-15T10:00:00.000Z',
        created_at: '2026-07-15T09:52:00.000Z',
        updated_at: '2026-07-15T10:00:00.000Z',
    },
]

const historyMessages = {
    '10000000-0000-4000-8000-000000000001': [
        {
            id: '20000000-0000-4000-8000-000000000001',
            conversation_id: '10000000-0000-4000-8000-000000000001',
            role: 'user',
            content: 'Why does angular momentum stay conserved here?',
            created_at: '2026-07-18T05:45:00.000Z',
        },
        {
            id: '20000000-0000-4000-8000-000000000002',
            conversation_id: '10000000-0000-4000-8000-000000000001',
            role: 'assistant',
            content: '### Start with external torque\n\nThe net external torque is zero, so `dL/dt = 0` and angular momentum remains constant.\n\nInternal forces can redistribute motion, but they cannot change the total for the complete system.',
            created_at: '2026-07-18T05:50:00.000Z',
        },
    ],
}

const failureAttempts = new Map()
const paperGenerationAttempts = new Map()
let generatedPaper = null
let previousPapersMode = 'ready'
let previousPapersFailureCount = 0
let previousCheckingPollCount = 0
let paperDetailMode = 'checking'
let paperDetailDeleted = false
let questionVisualMode = 'ready'
let examWorkspaceMode = 'ready'
let syntheticRole = 'b2c_student'
let schoolPreviousPapersMode = 'ready'
let scanUploadMode = 'ready'
let attendanceMode = 'ready'
let attendanceRevision = 7
let studentAttendanceCorrection = null
let leaderAttendanceCorrectionStatus = 'pending'
let attendanceReopened = false
let announcementsMode = 'ready'
let studentProfileMode = 'ready'
const announcementClasses = [
    { id: 'b1000000-0000-4000-8000-000000000001', standard: '10', division: 'A', student_count: 28 },
    { id: 'b1000000-0000-4000-8000-000000000002', standard: '10', division: 'B', student_count: 27 },
]
let announcements = [
    {
        id: 'b2000000-0000-4000-8000-000000000001', teacher_id: 'b3000000-0000-4000-8000-000000000001', teacher_name: 'Meera Subramaniam',
        announcement_type: 'announcement', target_scope: 'class', class_section_id: announcementClasses[0].id,
        class_label: 'Std 10 - A', title: 'Library hours during project week',
        body: 'The library will remain open until 5:30 PM from Wednesday to Friday. Bring your school ID and review the project research guide at https://school.example.test/library-guide before arriving.\n\nStudents using the media room should check in with the librarian first.',
        recipient_count: 28,
        attachments: [{ id: 'b4000000-0000-4000-8000-000000000001', file_name: 'Project-week-library-guide.pdf', content_type: 'application/pdf', file_size: 184320, url: '/api/v1/communication/attachments/b4000000-0000-4000-8000-000000000001' }],
        publish_state: 'published', published_at: '2026-08-19T16:40:00.000Z', archived_at: null,
        updated_at: '2026-08-19T16:40:00.000Z', created_at: '2026-08-19T16:30:00.000Z', is_read: false,
    },
    {
        id: 'b2000000-0000-4000-8000-000000000002', teacher_id: 'b3000000-0000-4000-8000-000000000001', teacher_name: 'Meera Subramaniam',
        announcement_type: 'announcement', target_scope: 'all_classes', class_section_id: null,
        class_label: null, title: 'Friday assembly location', body: 'This Friday’s assembly will be held in the indoor court because of the weather forecast.',
        recipient_count: 55, attachments: [], publish_state: 'published', published_at: '2026-08-18T14:00:00.000Z', archived_at: null,
        updated_at: '2026-08-18T14:00:00.000Z', created_at: '2026-08-18T13:50:00.000Z', is_read: true,
    },
    {
        id: 'b2000000-0000-4000-8000-000000000003', teacher_id: 'b3000000-0000-4000-8000-000000000001', teacher_name: 'Meera Subramaniam',
        announcement_type: 'home_work', target_scope: 'class', class_section_id: announcementClasses[0].id,
        class_label: 'Std 10 - A', title: 'Science observation journal', body: 'Complete the observation table before Monday.',
        recipient_count: 0, attachments: [], publish_state: 'draft', published_at: null, archived_at: null,
        updated_at: '2026-08-19T17:05:00.000Z', created_at: '2026-08-19T17:05:00.000Z', is_read: null,
    },
]
const announcementSeed = JSON.stringify(announcements)
const examWorkspaceAudit = []

const attendanceRecords = Array.from({ length: 12 }, (_, index) => ({
    id: `a1000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    student_id: `a2000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    student_name: ['Aarav Jain', 'Diya Menon', 'Kabir Shah', 'Meera Iyer', 'Reyansh Gupta', 'Saanvi Rao', 'Vihaan Patel', 'Anaya Bose', 'Arjun Nair', 'Ishita Singh', 'Rohan Das', 'Zoya Khan'][index],
    student_code: `ST-${String(index + 1).padStart(3, '0')}`,
    standard: '10',
    division: 'A',
    status: index === 3 ? 'absent' : index === 6 ? 'late' : index === 9 ? 'half_day' : index === 11 ? 'excused' : 'present',
    note: null,
    is_override: false,
    updated_by_user_id: 'a3000000-0000-4000-8000-000000000001',
    updated_by_role: 'teacher',
    updated_at: '2026-08-19T15:30:00.000Z',
}))

function attendanceSummary() {
    return {
        total_students: attendanceRecords.length,
        present_count: attendanceRecords.filter((row) => row.status === 'present').length,
        absent_count: attendanceRecords.filter((row) => row.status === 'absent').length,
        late_count: attendanceRecords.filter((row) => row.status === 'late').length,
        half_day_count: attendanceRecords.filter((row) => row.status === 'half_day').length,
        excused_count: attendanceRecords.filter((row) => row.status === 'excused').length,
        scheduled_count: attendanceRecords.filter((row) => row.status !== 'excused').length,
    }
}

function attendanceSheet(status = 'draft') {
    return {
        id: 'a4000000-0000-4000-8000-000000000001',
        school_id: 'a5000000-0000-4000-8000-000000000001',
        branch_id: 'a6000000-0000-4000-8000-000000000001',
        class_section_id: 'a7000000-0000-4000-8000-000000000001',
        attendance_date: '2026-08-19',
        standard: '10', division: 'A', status, revision: attendanceRevision,
        marked_by_teacher_id: 'a3000000-0000-4000-8000-000000000001',
        submitted_at: status === 'submitted' ? '2026-08-19T16:00:00.000Z' : null,
        reopened_at: null, reopened_reason: null, locked_at: null,
        class_note: null,
        records: attendanceMode === 'empty' ? [] : attendanceRecords,
        summary: attendanceMode === 'empty' ? { total_students: 0, present_count: 0, absent_count: 0, late_count: 0, half_day_count: 0, excused_count: 0, scheduled_count: 0 } : attendanceSummary(),
    }
}

const teacherExams = [
    {
        id: TEACHER_EXAM_ID,
        name: 'Unit Test 4 · Electrostatics',
        teacher_id: '96300000-0000-4000-8000-000000000001',
        teacher_name: 'Ms. Sharma',
        subject_id: '80000000-0000-4000-8000-000000000001',
        subject_name: 'Physics',
        standard: '12',
        division: 'A',
        category: 'Unit Test',
        exam_date: '2026-07-31T09:00:00.000Z',
        duration_minutes: 60,
        auto_grade_enabled: true,
        results_published: true,
        created_at: '2026-07-20T09:00:00.000Z',
        updated_at: '2026-07-20T09:00:00.000Z',
        papers: [
            {
                id: TEACHER_PAPER_DONE_ID,
                title: 'Electrostatics · Paper A',
                total_marks: 40,
                status: 'published',
                is_submitted_by_me: true,
                created_at: '2026-07-20T09:00:00.000Z',
            },
            {
                id: TEACHER_PAPER_OPEN_ID,
                title: 'Current Electricity · Paper B',
                total_marks: 30,
                status: 'published',
                is_submitted_by_me: false,
                created_at: '2026-07-21T09:00:00.000Z',
            },
        ],
    },
]

let practicePapers = [
    {
        id: PRACTICE_PAPER_DONE_ID,
        title: 'Organic Chemistry Repair Set · Aldehydes and Ketones',
        subject_name: 'Chemistry',
        total_marks: 60,
        duration_minutes: 45,
        status: 'published',
        is_submitted_by_me: true,
        created_at: '2026-07-23T09:00:00.000Z',
        question_count: 15,
    },
    {
        id: PRACTICE_PAPER_OPEN_ID,
        title: 'Calculus Sprint',
        subject_name: 'Mathematics',
        total_marks: 40,
        duration_minutes: 30,
        status: 'published',
        is_submitted_by_me: false,
        created_at: '2026-07-24T09:00:00.000Z',
        question_count: 10,
    },
]

const examWorkspaceAttempts = new Map([
    [TEACHER_PAPER_DONE_ID, [
        {
            id: '96400000-0000-4000-8000-000000000001',
            paper_id: TEACHER_PAPER_DONE_ID,
            student_id: '00000000-0000-4000-8000-000000000019',
            exam_id: TEACHER_EXAM_ID,
            attempt_number: 1,
            started_at: '2026-07-23T09:00:00.000Z',
            submitted_at: '2026-07-23T09:50:00.000Z',
            checked_at: '2026-07-23T10:00:00.000Z',
            answers: [],
            results: [],
            total_score: 32,
            max_score: 40,
            results_visible_to_student: true,
            grading_status: 'checked',
            created_at: '2026-07-23T09:00:00.000Z',
        },
    ]],
    [PRACTICE_PAPER_DONE_ID, [
        {
            id: '96400000-0000-4000-8000-000000000002',
            paper_id: PRACTICE_PAPER_DONE_ID,
            student_id: '00000000-0000-4000-8000-000000000019',
            attempt_number: 1,
            started_at: '2026-07-24T09:00:00.000Z',
            submitted_at: '2026-07-24T09:35:00.000Z',
            checked_at: '2026-07-24T09:45:00.000Z',
            answers: [],
            results: [],
            total_score: 48,
            max_score: 60,
            results_visible_to_student: true,
            grading_status: 'checked',
            created_at: '2026-07-24T09:00:00.000Z',
        },
    ]],
])

const previousPapers = [
    {
        id: PREVIOUS_PAPER_ID,
        title: 'JEE Main 2024 · Paper 1',
        exam_family: 'jee_main',
        exam: 'JEE Main',
        year: 2024,
        session_label: 'Session 1',
        shift_label: 'Shift 1',
        paper_label: 'Paper 1',
        question_count: 8,
        subjects: ['Physics', 'Chemistry', 'Mathematics'],
        has_solutions: true,
    },
    {
        id: '91000000-0000-4000-8000-000000000002',
        title: 'JEE Main 2023 · Paper 2 with an intentionally long title for compact-phone wrapping',
        exam_family: 'jee_main',
        exam: 'JEE Main',
        year: 2023,
        session_label: 'Session 2',
        shift_label: 'Shift 2',
        paper_label: 'Paper 2',
        question_count: 8,
        subjects: ['Physics', 'Chemistry', 'Mathematics'],
        has_solutions: true,
    },
    {
        id: '91000000-0000-4000-8000-000000000003',
        title: 'JEE Advanced 2023 · Paper 1',
        exam_family: 'jee_advanced',
        exam: 'JEE Advanced',
        year: 2023,
        session_label: null,
        shift_label: null,
        paper_label: 'Paper 1',
        question_count: 8,
        subjects: ['Physics', 'Chemistry', 'Mathematics'],
        has_solutions: true,
    },
]

const previousChapters = [
    {
        previous_paper_id: PREVIOUS_PAPER_ID,
        subject: 'Physics',
        branch: null,
        chapter_id: '93000000-0000-4000-8000-000000000001',
        chapter_title: 'Electrostatics',
        topic_slug: 'electrostatics',
        question_count: 2,
    },
    {
        previous_paper_id: PREVIOUS_PAPER_ID,
        subject: 'Physics',
        branch: null,
        chapter_id: '93000000-0000-4000-8000-000000000002',
        chapter_title: 'Kinematics',
        topic_slug: 'kinematics',
        question_count: 2,
    },
    {
        previous_paper_id: PREVIOUS_PAPER_ID,
        subject: 'Chemistry',
        branch: null,
        chapter_id: '93000000-0000-4000-8001-000000000001',
        chapter_title: 'Atomic Structure',
        topic_slug: 'atomic-structure',
        question_count: 1,
    },
    {
        previous_paper_id: PREVIOUS_PAPER_ID,
        subject: 'Chemistry',
        branch: null,
        chapter_id: '93000000-0000-4000-8001-000000000002',
        chapter_title: 'Chemical Bonding',
        topic_slug: 'chemical-bonding',
        question_count: 1,
    },
    {
        previous_paper_id: PREVIOUS_PAPER_ID,
        subject: 'Mathematics',
        branch: null,
        chapter_id: '93000000-0000-4000-8001-000000000003',
        chapter_title: 'Quadratic Equations',
        topic_slug: 'quadratic-equations',
        question_count: 1,
    },
    {
        previous_paper_id: PREVIOUS_PAPER_ID,
        subject: 'Mathematics',
        branch: null,
        chapter_id: '93000000-0000-4000-8001-000000000004',
        chapter_title: 'Coordinate Geometry',
        topic_slug: 'coordinate-geometry',
        question_count: 1,
    },
]

const previousQuestions = [
    {
        id: '94000000-0000-4000-8000-000000000001',
        previous_paper_id: PREVIOUS_PAPER_ID,
        question_number: 1,
        subject: 'Physics',
        branch: null,
        chapter_id: previousChapters[0].chapter_id,
        chapter_title: previousChapters[0].chapter_title,
        topic_slug: 'electric-flux',
        question_text: 'A point charge +q is placed at the centre of a cube. Determine the electric flux through one face when the surrounding medium has permittivity \\(\\epsilon_0\\).',
        options: [
            { id: 'A', label: 'A', text: '\\(\\frac{q}{\\epsilon_0}\\)' },
            { id: 'B', label: 'B', text: '\\(\\frac{q}{6\\epsilon_0}\\)' },
            { id: 'C', label: 'C', text: '\\(\\frac{q}{3\\epsilon_0}\\)' },
            { id: 'D', label: 'D', text: '\\(\\frac{6q}{\\epsilon_0}\\)' },
        ],
        answer_key: 'B',
        solution_text: 'The total flux is q/ε₀ and symmetry distributes it equally over the six faces.',
        question_figure_urls: [],
        solution_figure_urls: [],
        question_type: 'mcq',
        exam_session: 'JEE Main 2024 Session 1',
    },
    {
        id: '94000000-0000-4000-8000-000000000002',
        previous_paper_id: PREVIOUS_PAPER_ID,
        question_number: 2,
        subject: 'Physics',
        branch: null,
        chapter_id: previousChapters[0].chapter_id,
        chapter_title: previousChapters[0].chapter_title,
        topic_slug: 'electric-dipole',
        question_text: 'Charges +4 μC and −4 μC are separated by 0.2 m. Enter the magnitude of the electric dipole moment in μC·m.',
        options: null,
        answer_key: '0.8',
        solution_text: 'Dipole moment is charge multiplied by separation.',
        question_figure_urls: [],
        solution_figure_urls: [],
        question_type: 'numeric',
        exam_session: 'JEE Main 2024 Session 1',
    },
    {
        id: '94000000-0000-4000-8000-000000000003',
        previous_paper_id: PREVIOUS_PAPER_ID,
        question_number: 3,
        subject: 'Physics',
        branch: null,
        chapter_id: previousChapters[1].chapter_id,
        chapter_title: previousChapters[1].chapter_title,
        topic_slug: 'uniform-acceleration',
        question_text: 'A car starts from rest and accelerates uniformly at 2 m/s² for 5 s. What speed does it reach?',
        options: [
            { id: 'A', label: 'A', text: '5 m/s' },
            { id: 'B', label: 'B', text: '10 m/s' },
            { id: 'C', label: 'C', text: '15 m/s' },
            { id: 'D', label: 'D', text: '20 m/s' },
        ],
        answer_key: 'B',
        solution_text: 'Using v = u + at gives v = 0 + 2 × 5 = 10 m/s.',
        question_figure_urls: [],
        solution_figure_urls: [],
        question_type: 'mcq',
        exam_session: 'JEE Main 2024 Session 1',
    },
    {
        id: '94000000-0000-4000-8000-000000000004',
        previous_paper_id: PREVIOUS_PAPER_ID,
        question_number: 4,
        subject: 'Physics',
        branch: null,
        chapter_id: previousChapters[1].chapter_id,
        chapter_title: previousChapters[1].chapter_title,
        topic_slug: 'projectile-motion',
        question_text: 'For a projectile launched on level ground, which launch angle gives the maximum range?',
        options: [
            { id: 'A', label: 'A', text: '30°' },
            { id: 'B', label: 'B', text: '45°' },
            { id: 'C', label: 'C', text: '60°' },
            { id: 'D', label: 'D', text: '90°' },
        ],
        answer_key: 'B',
        solution_text: 'Range is proportional to sin 2θ, which is maximum when θ = 45°.',
        question_figure_urls: [],
        solution_figure_urls: [],
        question_type: 'mcq',
        exam_session: 'JEE Main 2024 Session 1',
    },
    ...[
        ['Chemistry', 'Atomic Structure', 'The maximum number of electrons in the n = 3 shell is:', '18'],
        ['Chemistry', 'Chemical Bonding', 'Which bond is formed by sharing an electron pair?', 'Covalent bond'],
        ['Mathematics', 'Quadratic Equations', 'The roots of x² − 5x + 6 = 0 are:', '2 and 3'],
        ['Mathematics', 'Coordinate Geometry', 'The slope of the line y = 3x + 2 is:', '3'],
    ].map(([subject, chapterTitle, questionText, answer], index) => ({
        id: `94000000-0000-4000-8000-${String(index + 5).padStart(12, '0')}`,
        previous_paper_id: PREVIOUS_PAPER_ID,
        question_number: index + 5,
        subject,
        branch: null,
        chapter_id: `93000000-0000-4000-8001-${String(index + 1).padStart(12, '0')}`,
        chapter_title: chapterTitle,
        topic_slug: chapterTitle.toLowerCase().replaceAll(' ', '-'),
        question_text: questionText,
        options: null,
        answer_key: answer,
        solution_text: `The correct result is ${answer}.`,
        question_figure_urls: [],
        solution_figure_urls: [],
        question_type: 'numeric',
        exam_session: 'JEE Main 2024 Session 1',
    })),
]

const previousAttemptStartedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString()
const buildPreviousAttemptPaper = (
    questions = previousQuestions,
    title = 'Electrostatics practice',
    durationMinutes = 180,
) => {
    const selectedSubjects = new Set(questions.map(question => question.subject).filter(Boolean))
    return {
    id: PREVIOUS_ATTEMPT_PAPER_ID,
    school_id: '70000000-0000-4000-8000-000000000001',
    created_by: '00000000-0000-4000-8000-000000000018',
    subject_id: selectedSubjects.size === 1 ? '80000000-0000-4000-8000-000000000001' : null,
    title,
    subtitle: 'Previous Paper Practice',
    course: 'JEE Main',
    category: 'Previous-year practice',
    standard: '12',
    total_marks: questions.length * 4,
    duration_minutes: durationMinutes,
    instructions: 'Choose the best answer. Your newest unfinished attempt is restored automatically.',
    status: 'published',
    published_at: '2026-07-25T10:00:00.000Z',
    created_at: '2026-07-25T09:55:00.000Z',
    questions: questions.map((question, index) => ({
        id: question.id,
        question_number: question.question_number,
        section: 'Physics',
        question_text: question.question_text,
        question_type: question.question_type === 'numeric' ? 'short_answer' : 'mcq',
        difficulty: index === 0 ? 'medium' : 'hard',
        marks: 4,
        options: question.options?.map(option => ({ id: option.id, text: option.text })),
        topic_name: question.topic_slug,
        subject_name: question.subject,
        chapter_id: question.chapter_id,
        chapter_title: question.chapter_title,
        ...(index === 0 ? {
            visual_payload: {
                kind: 'document_figure',
                asset_url: '/api/v1/documents/visuals/electric-flux-cube.svg',
                asset_urls: [
                    '/api/v1/documents/visuals/electric-flux-cube.svg',
                    '/api/v1/documents/visuals/gaussian-surface.svg',
                ],
                alt_text: 'Electric flux through a cube surrounding a point charge',
                captions: [
                    'Point charge at the centre of a cube',
                    'Gaussian surface and outward flux',
                ],
            },
        } : {}),
    })),
    }
}

let previousAttemptPaper = buildPreviousAttemptPaper()

const previousAttempts = [
    {
        id: '95000000-0000-4000-8000-000000000001',
        paper_id: PREVIOUS_ATTEMPT_PAPER_ID,
        b2c_student_id: '00000000-0000-4000-8000-000000000018',
        attempt_number: 1,
        started_at: '2026-07-25T09:00:00.000Z',
        answers: [{ question_id: previousQuestions[0].id, response: 'A' }],
        results: [],
        results_visible_to_student: false,
        grading_status: 'in_progress',
        created_at: '2026-07-25T09:00:00.000Z',
    },
    {
        id: '95000000-0000-4000-8000-000000000002',
        paper_id: PREVIOUS_ATTEMPT_PAPER_ID,
        b2c_student_id: '00000000-0000-4000-8000-000000000018',
        attempt_number: 2,
        started_at: '2026-07-25T09:30:00.000Z',
        submitted_at: '2026-07-25T09:50:00.000Z',
        answers: [{ question_id: previousQuestions[0].id, response: 'C' }],
        results: [],
        results_visible_to_student: false,
        grading_status: 'submitted',
        created_at: '2026-07-25T09:30:00.000Z',
    },
    {
        id: '95000000-0000-4000-8000-000000000003',
        paper_id: PREVIOUS_ATTEMPT_PAPER_ID,
        b2c_student_id: '00000000-0000-4000-8000-000000000018',
        attempt_number: 3,
        started_at: previousAttemptStartedAt,
        answers: [{ question_id: previousQuestions[0].id, response: 'B' }],
        results: [],
        results_visible_to_student: false,
        grading_status: 'in_progress',
        created_at: previousAttemptStartedAt,
    },
]

const buildPreviousCheckedPaper = () => {
    const submittedAttempt = [...previousAttempts]
        .reverse()
        .find(attempt => Boolean(attempt.submitted_at))
    if (!submittedAttempt) return null
    return {
        id: submittedAttempt.id,
        student_id: submittedAttempt.b2c_student_id,
        teacher_id: '00000000-0000-4000-8000-000000000040',
        exam_id: null,
        ocr_text: '',
        identifier_text: 'Synthetic previous-paper submission',
        status: 'graded',
        total_score: 8,
        max_score: 12,
        checking_progress_percent: 100,
        grading_feedback: 'Two questions are secure. Review the final concept once more.',
        grading_results: previousQuestions.map((question, index) => ({
            question_id: question.id,
            question_number: index + 1,
            question_text: question.question_text,
            question_type: question.question_type,
            response: submittedAttempt.answers?.find(answer => answer.question_id === question.id)?.response || '',
            expected_answer: question.answer_key,
            score: index < 2 ? 4 : 0,
            max_score: 4,
            feedback: index < 2 ? 'Correct.' : 'Review the key relationship and try again.',
        })),
        needs_review: false,
        is_teacher_override: false,
        manual_review_requested: false,
        student_name: 'Synthetic learner',
        exam_name: previousAttemptPaper.title,
        subject_name: 'Physics',
        created_at: submittedAttempt.submitted_at,
        updated_at: submittedAttempt.submitted_at,
    }
}

const buildGeneratedPaper = (payload = {}) => {
    const questionCount = Math.max(1, Number(payload.count || payload.mcq_count || 10))
    const marks = Number(payload.question_marks || payload.marks_per_mcq || 1)
    const title = payload.title || payload.title_line_1 || 'Physics Default'
    return {
        id: GENERATED_PAPER_ID,
        school_id: '70000000-0000-4000-8000-000000000001',
        created_by: '00000000-0000-4000-8000-000000000018',
        subject_id: '80000000-0000-4000-8000-000000000001',
        title,
        subtitle: `Synthetic proof · ${PAPER_SEED}`,
        total_marks: questionCount * marks,
        duration_minutes: payload.duration_minutes || payload.timer_value || null,
        instructions: payload.additional_instructions || payload.instructions || null,
        status: 'draft',
        created_at: '2026-07-18T07:00:00.000Z',
        questions: Array.from({ length: questionCount }, (_, index) => ({
            id: `61000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
            question_number: index + 1,
            section: 'MCQ',
            question_text: `Synthetic Physics question ${index + 1}`,
            question_type: 'mcq',
            difficulty: 'medium',
            marks,
            options: [
                { id: 'A', text: 'Option A' },
                { id: 'B', text: 'Option B' },
                { id: 'C', text: 'Option C' },
                { id: 'D', text: 'Option D' },
            ],
        })),
    }
}

const buildWorkspacePaper = (paperId) => {
    const source = teacherExams
        .flatMap(exam => exam.papers)
        .concat(practicePapers)
        .find(paper => paper.id === paperId)
    const visual = source?.title || 'Exam workspace paper'
    return {
        id: paperId,
        school_id: '70000000-0000-4000-8000-000000000001',
        created_by: '00000000-0000-4000-8000-000000000019',
        subject_id: '80000000-0000-4000-8000-000000000001',
        title: visual,
        subtitle: `Synthetic B2B proof · ${EXAM_WORKSPACE_SEED}`,
        total_marks: source?.total_marks || 40,
        duration_minutes: 45,
        instructions: 'Complete this synthetic validation paper.',
        status: 'published',
        created_at: source?.created_at || '2026-07-23T09:00:00.000Z',
        questions: [
            {
                id: `96500000-0000-4000-8000-${paperId.slice(-12)}`,
                question_number: 1,
                section: 'MCQ',
                question_text: 'The electric field inside a conductor in electrostatic equilibrium is:',
                question_type: 'mcq',
                difficulty: 'medium',
                marks: 4,
                options: [
                    { id: 'A', text: 'Zero' },
                    { id: 'B', text: 'Uniform and non-zero' },
                    { id: 'C', text: 'Infinite' },
                    { id: 'D', text: 'Position dependent' },
                ],
            },
        ],
    }
}

const json = (response, status, body) => {
    response.writeHead(status, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify(body))
}

const readBody = async (request) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = Buffer.concat(chunks).toString('utf8')
    return body ? JSON.parse(body) : {}
}

const streamAnswer = (request, response, payload) => {
    const conversationId = payload.conversation_id || '10000000-0000-4000-8000-000000000099'
    const normalized = String(payload.message || '').toLowerCase()
    const shouldFailOnce = normalized.includes('seven-day plan')
    const attempt = (failureAttempts.get(payload.message) || 0) + 1
    failureAttempts.set(payload.message, attempt)

    const content = normalized.includes('moment of inertia')
        ? '### It measures rotational resistance.\n\nMoment of inertia plays the same role in rotation that mass plays in linear motion.\n\n1. Choose the axis of rotation.\n2. Measure how far each mass lies from that axis.\n3. Add every contribution using **mr²**.\n\n`I = Σmᵢrᵢ²`\n\n> **Exam check:** shifting mass farther from the axis increases I even when total mass stays unchanged.'
        : normalized.includes('seven-day plan')
            ? '### A realistic seven-day repair plan\n\nStart with concept repair, then move into timed PYQs, and finish with one full mock.\n\n- **Days 1–2:** Coordinate geometry setup\n- **Days 3–4:** Timed Physics PYQs\n- **Day 5:** Mixed practice\n- **Day 6:** Full mock\n- **Day 7:** Error-log revision'
            : '### Your first repair should be coordinate geometry.\n\nYou lost marks when diagrams had to become equations. The pattern suggests the issue is **setup, not calculation**.\n\n1. Redraw each diagram without labels.\n2. Define the origin and axes.\n3. Write one equation before substituting values.\n\n> Next action: solve three setup-only questions before attempting a timed set.'

    const segments = content.match(/.{1,52}(?:\s|$)/gs) || [content]
    response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    })
    response.write(`data: ${JSON.stringify({ type: 'metadata', conversation_id: conversationId, timestamp: '2026-07-18T06:00:00.000Z' })}\n\n`)

    let index = 0
    const timer = setInterval(() => {
        if (index < segments.length) {
            response.write(`data: ${JSON.stringify({ type: 'delta', delta: segments[index] })}\n\n`)
            index += 1
            if (shouldFailOnce && attempt === 1 && index === 3) {
                clearInterval(timer)
                response.write(`data: ${JSON.stringify({ type: 'error', error: 'Synthetic connection interruption. Retry from the preserved conversation.' })}\n\n`)
                response.end()
            }
            return
        }

        clearInterval(timer)
        response.write(`data: ${JSON.stringify({
            type: 'done',
            response: content,
            conversation_id: conversationId,
            message_id: `30000000-0000-4000-8000-${String(attempt).padStart(12, '0')}`,
            timestamp: '2026-07-18T06:00:05.000Z',
        })}\n\n`)
        response.end()
    }, 1500)

    request.on('close', () => clearInterval(timer))
}

const server = http.createServer(async (request, response) => {
    const origin = request.headers.origin || 'http://localhost:8081'
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Access-Control-Allow-Credentials', 'true')
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept')
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    response.setHeader('Access-Control-Expose-Headers', 'Content-Disposition')

    if (request.method === 'OPTIONS') {
        response.writeHead(204)
        response.end()
        return
    }

    const url = new URL(request.url, `http://${request.headers.host}`)
    const path = url.pathname

    if (request.method === 'POST' && path === '/__test__/attendance-mode') {
        const payload = await readBody(request)
        attendanceMode = String(payload.mode || 'ready')
        json(response, 200, { mode: attendanceMode, revision: attendanceRevision })
        return
    }

    if (request.method === 'POST' && path === '/__test__/announcements-mode') {
        const payload = await readBody(request)
        announcementsMode = String(payload.mode || 'ready')
        if (payload.reset === true) announcements = JSON.parse(announcementSeed)
        json(response, 200, { mode: announcementsMode })
        return
    }

    if (request.method === 'POST' && path === '/__test__/previous-papers-mode') {
        const payload = await readBody(request)
        previousPapersMode = String(payload.mode || 'ready')
        previousPapersFailureCount = 0
        json(response, 200, { seed: PREVIOUS_PAPERS_SEED, mode: previousPapersMode })
        return
    }

    if (request.method === 'GET' && path === '/__test__/previous-papers-mode') {
        json(response, 200, { seed: PREVIOUS_PAPERS_SEED, mode: previousPapersMode })
        return
    }

    if (request.method === 'POST' && path === '/__test__/exam-workspace-mode') {
        const payload = await readBody(request)
        examWorkspaceMode = String(payload.mode || 'ready')
        json(response, 200, { seed: EXAM_WORKSPACE_SEED, mode: examWorkspaceMode })
        return
    }

    if (request.method === 'GET' && path === '/__test__/exam-workspace-audit') {
        json(response, 200, { seed: EXAM_WORKSPACE_SEED, events: examWorkspaceAudit })
        return
    }

    if (request.method === 'POST' && path === '/__test__/paper-detail-mode') {
        const payload = await readBody(request)
        paperDetailMode = String(payload.mode || 'checking')
        if (payload.restore) paperDetailDeleted = false
        json(response, 200, { seed: PREVIOUS_PAPERS_SEED, mode: paperDetailMode, deleted: paperDetailDeleted })
        return
    }

    if (request.method === 'POST' && path === '/__test__/question-visual-mode') {
        const payload = await readBody(request)
        questionVisualMode = String(payload.mode || 'ready')
        json(response, 200, { mode: questionVisualMode })
        return
    }

    if (request.method === 'POST' && path === '/__test__/student-profile-mode') {
        const payload = await readBody(request)
        studentProfileMode = ['ready', 'loading', 'error', 'empty'].includes(payload.mode) ? payload.mode : 'ready'
        json(response, 200, { mode: studentProfileMode })
        return
    }

    if (request.method === 'POST' && path === '/api/v1/auth/login') {
        const payload = await readBody(request)
        const attendanceTeacherJourney = String(payload.identifier || payload.email || '').includes('attendance-teacher')
        const attendanceStudentJourney = String(payload.identifier || payload.email || '').includes('attendance-student')
        const attendanceLeaderJourney = String(payload.identifier || payload.email || '').includes('attendance-leader')
        const b2bExamJourney = String(payload.identifier || payload.email || '').includes('exam-b2b')
        const schoolStudentJourney = String(payload.identifier || payload.email || '').includes('school-student')
        const schoolTeacherJourney = String(payload.identifier || payload.email || '').includes('school-teacher')
        const previousPapersJourney = String(payload.identifier || payload.email || '').includes('pr6')
        const schoolRole = attendanceLeaderJourney ? 'principal' : (attendanceTeacherJourney || schoolTeacherJourney ? 'teacher' : (attendanceStudentJourney || b2bExamJourney || schoolStudentJourney ? 'student' : null))
        syntheticRole = schoolRole || 'b2c_student'
        json(response, 200, {
            access_token: `synthetic-${SEED}`,
            token_type: 'bearer',
            user: {
                id: b2bExamJourney
                    ? '00000000-0000-4000-8000-000000000019'
                    : '00000000-0000-4000-8000-000000000018',
                display_name: 'Aarav Test',
                identifier: `aarav.${SEED}@example.test`,
                role: schoolRole || 'b2c_student',
                profile_completed: true,
                is_email_verified: true,
                b2c_education_level: previousPapersJourney ? 'school' : 'competitive_exams',
                b2c_target_exam: previousPapersJourney ? null : 'JEE Main + Advanced',
                b2c_subjects: ['Physics', 'Mathematics', 'Chemistry'],
                standard: schoolRole === 'student' ? '10' : undefined,
                division: schoolRole === 'student' ? 'A' : undefined,
            },
        })
        return
    }

    if (request.method === 'GET' && path === '/api/v1/communication/teacher/classes') {
        if (syntheticRole !== 'teacher') return json(response, 403, { detail: 'Teacher access required.' })
        json(response, 200, announcementClasses)
        return
    }

    if (request.method === 'GET' && path === '/api/v1/communication/announcements') {
        if (announcementsMode === 'error') return json(response, 503, { detail: 'Announcements are temporarily unavailable.' })
        if (announcementsMode === 'loading') await new Promise(resolve => setTimeout(resolve, 2200))
        const visible = announcementsMode === 'empty'
            ? []
            : syntheticRole === 'teacher'
                ? announcements
                : announcements.filter(item => item.publish_state === 'published' && item.archived_at == null)
        json(response, 200, { items: visible })
        return
    }

    if (request.method === 'POST' && path === '/api/v1/communication/announcements') {
        if (syntheticRole !== 'teacher') return json(response, 403, { detail: 'Teacher access required.' })
        const payload = await readBody(request)
        const now = new Date().toISOString()
        const section = announcementClasses.find(item => item.id === payload.class_section_id)
        const item = {
            id: `b2000000-0000-4000-8000-${String(announcements.length + 10).padStart(12, '0')}`,
            teacher_id: 'b3000000-0000-4000-8000-000000000001', teacher_name: 'Aarav Test',
            announcement_type: payload.announcement_type, target_scope: payload.target_scope,
            class_section_id: payload.class_section_id, class_label: section ? `Std ${section.standard} - ${section.division}` : null,
            title: payload.title, body: payload.body, recipient_count: 0, attachments: [],
            publish_state: payload.publish_state || 'draft', published_at: payload.publish_state === 'published' ? now : null,
            archived_at: null, updated_at: now, created_at: now, is_read: null,
        }
        announcements = [item, ...announcements]
        json(response, 200, item)
        return
    }

    const announcementMatch = path.match(/^\/api\/v1\/communication\/announcements\/([^/]+)$/)
    if (announcementMatch && request.method === 'GET') {
        const item = announcements.find(entry => entry.id === announcementMatch[1])
        const visible = item && (syntheticRole === 'teacher' || (item.publish_state === 'published' && item.archived_at == null))
        if (!visible || announcementsMode === 'deleted') return json(response, 404, { detail: 'Announcement not found.' })
        if (announcementsMode === 'forbidden') return json(response, 403, { detail: 'This announcement is not for your enrollment.' })
        json(response, 200, item)
        return
    }

    if (announcementMatch && request.method === 'PUT') {
        if (syntheticRole !== 'teacher') return json(response, 403, { detail: 'Teacher access required.' })
        const index = announcements.findIndex(entry => entry.id === announcementMatch[1])
        if (index < 0) return json(response, 404, { detail: 'Announcement not found.' })
        const payload = await readBody(request)
        const section = announcementClasses.find(item => item.id === payload.class_section_id)
        announcements[index] = { ...announcements[index], ...payload, attachments: announcements[index].attachments, class_label: section ? `Std ${section.standard} - ${section.division}` : null, updated_at: new Date().toISOString() }
        json(response, 200, announcements[index])
        return
    }

    const announcementActionMatch = path.match(/^\/api\/v1\/communication\/announcements\/([^/]+)\/(publish|archive|read)$/)
    if (announcementActionMatch && request.method === 'POST') {
        const index = announcements.findIndex(entry => entry.id === announcementActionMatch[1])
        if (index < 0) return json(response, 404, { detail: 'Announcement not found.' })
        const action = announcementActionMatch[2]
        const now = new Date().toISOString()
        if (action === 'publish') announcements[index] = { ...announcements[index], publish_state: 'published', published_at: announcements[index].published_at || now, recipient_count: announcements[index].target_scope === 'class' ? 28 : 55, updated_at: now }
        if (action === 'archive') announcements[index] = { ...announcements[index], publish_state: 'archived', archived_at: now, updated_at: now }
        if (action === 'read') announcements[index] = { ...announcements[index], is_read: true }
        json(response, 200, announcements[index])
        return
    }

    if (request.method === 'GET' && path.startsWith('/api/v1/communication/attachments/')) {
        const bytes = Buffer.from('%PDF-1.4\n% Synthetic announcement attachment\n%%EOF\n')
        response.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': bytes.length })
        response.end(bytes)
        return
    }

    if (request.method === 'GET' && path === '/api/v1/attendance/teacher/today') {
        if (attendanceMode === 'error') return json(response, 503, { detail: 'The roster service is temporarily unavailable.' })
        const sheet = attendanceSheet(attendanceMode === 'submitted' ? 'submitted' : 'draft')
        json(response, 200, { class_section_id: sheet.class_section_id, attendance_date: sheet.attendance_date, sheet })
        return
    }

    if (request.method === 'GET' && path === '/api/v1/attendance/dashboard/teacher-summary') {
        const summary = attendanceMode === 'empty'
            ? { total_students: 0, present_count: 0, absent_count: 0, late_count: 0, half_day_count: 0, excused_count: 0, scheduled_count: 0 }
            : attendanceSummary()
        json(response, 200, { attendance_date: '2026-08-19', class_section_id: 'a7000000-0000-4000-8000-000000000001', standard: '10', division: 'A', status: attendanceMode === 'submitted' ? 'submitted' : 'draft', ...summary })
        return
    }

    if (request.method === 'GET' && path === '/api/v1/attendance/dashboard/leadership') {
        const classes = [
            { class_section_id: 'a7000000-0000-4000-8000-000000000001', standard: '10', division: 'A', class_teacher_name: 'Meera Subramaniam', class_teacher_id: 'a3000000-0000-4000-8000-000000000001', student_count: 12, status: attendanceReopened ? 'reopened' : 'submitted', submitted_at: '2026-08-19T16:00:00.000Z' },
            { class_section_id: 'a7000000-0000-4000-8000-000000000002', standard: '10', division: 'B', class_teacher_name: 'Ravi Menon', class_teacher_id: 'a3000000-0000-4000-8000-000000000002', student_count: 38, status: null, submitted_at: null },
        ]
        json(response, 200, { attendance_date: '2026-08-19', total_classes: 2, submitted_classes: attendanceReopened ? 0 : 1, pending_classes: 1, total_students: 50, present_count: 44, absent_count: 2, late_count: 2, half_day_count: 1, excused_count: 1, reopened_sheets: attendanceReopened ? 1 : 0, classes, pending: [classes[1]] })
        return
    }

    if (request.method === 'GET' && path.startsWith('/api/v1/attendance/classes/') && path.endsWith('/sheet')) {
        json(response, 200, attendanceSheet(attendanceReopened ? 'reopened' : 'submitted'))
        return
    }

    if (request.method === 'POST' && path.includes('/api/v1/attendance/sheets/') && path.endsWith('/reopen')) {
        attendanceRevision += 1
        attendanceReopened = true
        json(response, 200, { ...attendanceSheet('reopened'), reopened_at: '2026-08-19T17:00:00.000Z', reopened_reason: (await readBody(request)).reason })
        return
    }

    if (request.method === 'PATCH' && path.includes('/api/v1/attendance/sheets/') && path.endsWith('/records')) {
        const payload = await readBody(request)
        if (attendanceMode === 'conflict') return json(response, 409, { detail: 'Attendance changed on another device. Refresh before saving your draft.' })
        for (const update of payload.records || []) {
            const record = attendanceRecords.find((row) => row.id === update.record_id)
            if (record) record.status = update.status
        }
        attendanceRevision += 1
        json(response, 200, attendanceSheet())
        return
    }

    if (request.method === 'POST' && path.includes('/api/v1/attendance/sheets/') && path.endsWith('/submit')) {
        const payload = await readBody(request)
        for (const update of payload.records || []) {
            const record = attendanceRecords.find((row) => row.id === update.record_id)
            if (record) record.status = update.status
        }
        attendanceRevision += 1
        json(response, 200, attendanceSheet('submitted'))
        return
    }

    if (request.method === 'GET' && path === '/api/v1/attendance/students/me/summary') {
        json(response, 200, {
            month: '2026-08', attendance_percent: 92.5, present_equivalent: 18.5,
            scheduled_count: 20, absent_count: 1, excused_count: 1, latest_status: 'present',
            history: attendanceRecords.slice(0, 6).map((row, index) => ({ record_id: row.id, attendance_date: `2026-08-${String(19 - index).padStart(2, '0')}`, status: row.status, note: row.note, class_note: null, standard: '10', division: 'A' })),
        })
        return
    }

    if (request.method === 'GET' && path === '/api/v1/attendance/corrections') {
        json(response, 200, syntheticRole === 'principal'
            ? [{ id: 'a8000000-0000-4000-8000-000000000001', sheet_id: 'a4000000-0000-4000-8000-000000000001', record_id: attendanceRecords[3].id, student_id: attendanceRecords[3].student_id, requested_by_user_id: attendanceRecords[3].student_id, requested_by_role: 'student', reason: 'I was present after the school bus arrived late.', status: leaderAttendanceCorrectionStatus, resolved_by_user_id: leaderAttendanceCorrectionStatus === 'pending' ? null : 'leader', resolved_by_role: leaderAttendanceCorrectionStatus === 'pending' ? null : 'principal', resolved_at: leaderAttendanceCorrectionStatus === 'pending' ? null : '2026-08-19T17:10:00.000Z', resolution_note: leaderAttendanceCorrectionStatus === 'pending' ? null : 'Reviewed against the teacher register.' }]
            : studentAttendanceCorrection ? [studentAttendanceCorrection] : [])
        return
    }

    if (request.method === 'POST' && path.includes('/api/v1/attendance/corrections/') && path.endsWith('/resolve')) {
        const payload = await readBody(request)
        leaderAttendanceCorrectionStatus = payload.status
        json(response, 200, { id: path.split('/').at(-2), sheet_id: 'a4000000-0000-4000-8000-000000000001', record_id: attendanceRecords[3].id, student_id: attendanceRecords[3].student_id, requested_by_user_id: attendanceRecords[3].student_id, requested_by_role: 'student', reason: 'I was present after the school bus arrived late.', status: payload.status, resolved_by_user_id: 'leader', resolved_by_role: 'principal', resolved_at: '2026-08-19T17:10:00.000Z', resolution_note: payload.resolution_note })
        return
    }

    if (request.method === 'POST' && path === '/api/v1/attendance/corrections') {
        const payload = await readBody(request)
        studentAttendanceCorrection = { id: 'a8000000-0000-4000-8000-000000000001', sheet_id: 'a4000000-0000-4000-8000-000000000001', record_id: payload.record_id, student_id: 'a2000000-0000-4000-8000-000000000001', requested_by_user_id: null, requested_by_role: syntheticRole, reason: payload.reason, status: 'pending', resolved_by_user_id: null, resolved_by_role: null, resolved_at: null, resolution_note: null }
        json(response, 200, studentAttendanceCorrection)
        return
    }

    if (request.method === 'POST' && path === '/__test__/school-previous-papers-mode') {
        const payload = await readBody(request)
        schoolPreviousPapersMode = String(payload.mode || 'ready')
        json(response, 200, { mode: schoolPreviousPapersMode })
        return
    }

    if (request.method === 'GET' && path === '/api/v1/roster/student/master-profile') {
        if (studentProfileMode === 'loading') await new Promise(resolve => setTimeout(resolve, 3000))
        if (studentProfileMode === 'error') {
            json(response, 503, { detail: 'The institutional profile is temporarily unavailable.' })
            return
        }
        json(response, 200, {
            profile: {
                student_id: 'STU-2048',
                first_name: 'Aarav',
                last_name: 'Ramanathan',
                email: 'school-student@example.test',
                school_name: 'Eduraa International School — North Campus',
                branch_name: 'North Campus',
                board: 'CBSE',
                standard: '10',
                division: 'A',
            },
            class_teacher_name: 'Mrs. Meera Subramaniam',
            assignment_status: 'active',
            subjects: studentProfileMode === 'empty' ? [] : [
                { subject_name: 'Mathematics' },
                { subject_name: 'Science' },
                { subject_name: 'English Language and Literature' },
            ],
            teacher_subject_mappings: studentProfileMode === 'empty' ? [] : [
                { subject_name: 'Mathematics', teacher_id: 'teacher-2048', teacher_code: 'TCH-2048', teacher_name: 'Mrs. Meera Subramaniam', teacher_email: 'meera@example.test', is_class_teacher: true },
                { subject_name: 'Science', teacher_id: 'teacher-1024', teacher_code: 'TCH-1024', teacher_name: 'Mr. Arjun Nair', teacher_email: 'arjun@example.test', is_class_teacher: false },
            ],
            documents: studentProfileMode === 'empty' ? [] : [
                { document_id: 'document-maths-10', title: 'Mathematics Practice Book', file_name: 'mathematics-practice-book.pdf', subject_name: 'Mathematics', board: 'CBSE', standard: '10', page_count: 184, processing_status: 'ready' },
                { document_id: 'document-science-10', title: 'Science Lab Manual', file_name: 'science-lab-manual.pdf', subject_name: 'Science', board: 'CBSE', standard: '10', page_count: 96, processing_status: 'ready' },
            ],
        })
        return
    }

    if (request.method === 'GET' && path === '/api/v1/roster/teacher/master-profile') {
        json(response, 200, {
            profile: {
                first_name: 'Meera',
                last_name: 'Subramaniam',
                email: 'school-teacher@example.test',
                teacher_id: 'TCH-1024',
                school_id: 'school-north',
                school_name: 'Eduraa International School — North Campus',
                branch_id: 'branch-north',
                branch_name: 'North Campus',
                board: 'CBSE',
                standards_taught: ['9', '10'],
                divisions_taught: ['A', 'B'],
                subjects_taught: ['Mathematics', 'Science'],
                class_teacher_opt_in: true,
                class_teacher_standard: '10',
                class_teacher_division: 'A',
                is_approved: true,
                is_active: true,
            },
            assignment_status: 'active',
            subject_mappings: [],
            pending_update_request: null,
        })
        return
    }

    if (request.method === 'GET' && (path === '/api/v1/question-papers/student' || path === '/api/v1/question-papers/teacher')) {
        if (schoolPreviousPapersMode === 'loading') await new Promise(resolve => setTimeout(resolve, 2500))
        if (schoolPreviousPapersMode === 'error') {
            json(response, 503, { detail: 'The school paper library is temporarily unavailable.' })
            return
        }
        if (schoolPreviousPapersMode === 'forbidden') {
            json(response, 403, { detail: 'School paper permission is no longer active.' })
            return
        }
        const teacherView = path.endsWith('/teacher')
        const items = schoolPreviousPapersMode === 'empty' ? [] : [
            {
                id: '73000000-0000-4000-8000-000000000001',
                title: 'Mathematics Annual Examination — Complete Revision Paper',
                description: 'Original school paper with diagrams, formulae, and section-wise marks preserved.',
                original_filename: 'mathematics-annual-examination.pdf',
                content_type: 'application/pdf',
                file_size_bytes: 2480128,
                subject_id: '83000000-0000-4000-8000-000000000001',
                subject_label: 'Mathematics',
                target_scope: 'class',
                class_section_id: '93000000-0000-4000-8000-000000000001',
                class_label: 'Standard 10 · Division A',
                standard: '10',
                division: 'A',
                status: 'published',
                uploaded_by_teacher_id: '00000000-0000-4000-8000-000000000020',
                teacher_name: 'Mrs. Meera Subramaniam',
                view_url: '/api/v1/question-papers/73000000-0000-4000-8000-000000000001/view',
                download_url: '/api/v1/question-papers/73000000-0000-4000-8000-000000000001/download',
                published_at: '2025-03-14T09:00:00.000Z',
                archived_at: null,
                created_at: '2025-03-12T09:00:00.000Z',
                updated_at: '2025-03-14T09:00:00.000Z',
            },
            ...(teacherView ? [{
                id: '73000000-0000-4000-8000-000000000002',
                title: 'Science Midterm Paper',
                description: null,
                original_filename: 'science-midterm.pdf',
                content_type: 'application/pdf',
                file_size_bytes: 912000,
                subject_id: '83000000-0000-4000-8000-000000000002',
                subject_label: 'Science',
                target_scope: 'all_classes',
                class_section_id: null,
                class_label: null,
                standard: null,
                division: null,
                status: 'archived',
                uploaded_by_teacher_id: '00000000-0000-4000-8000-000000000020',
                teacher_name: 'Mrs. Meera Subramaniam',
                view_url: '/api/v1/question-papers/73000000-0000-4000-8000-000000000002/view',
                download_url: '/api/v1/question-papers/73000000-0000-4000-8000-000000000002/download',
                published_at: '2024-09-20T09:00:00.000Z',
                archived_at: '2025-06-01T09:00:00.000Z',
                created_at: '2024-09-18T09:00:00.000Z',
                updated_at: '2025-06-01T09:00:00.000Z',
            }] : []),
        ]
        json(response, 200, { items, total: items.length, page: 1, page_size: items.length })
        return
    }

    const visualMatch = path.match(/^\/api\/v1\/documents\/visuals\/(electric-flux-cube|gaussian-surface)\.svg$/)
    if (request.method === 'GET' && visualMatch) {
        if (!String(request.headers.authorization || '').startsWith('Bearer synthetic-')) {
            json(response, 401, { detail: 'Synthetic visual requires authorization.' })
            return
        }
        if (questionVisualMode === 'loading') {
            await new Promise(resolve => setTimeout(resolve, 6000))
        }
        if (questionVisualMode === 'error') {
            json(response, 503, { detail: 'Synthetic visual unavailable.' })
            return
        }
        const isCube = visualMatch[1] === 'electric-flux-cube'
        const svg = isCube
            ? `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="620" viewBox="0 0 960 620">
                <rect width="960" height="620" rx="32" fill="#f8f2e8"/>
                <path d="M250 180 555 115l165 150-305 66zM250 180v245l165 82V331M720 265v240l-305 2" fill="none" stroke="#18243a" stroke-width="12" stroke-linejoin="round"/>
                <circle cx="475" cy="311" r="42" fill="#f36c21"/>
                <text x="475" y="324" text-anchor="middle" font-family="Arial" font-size="38" font-weight="700" fill="white">+q</text>
                <path d="m475 250 0-75m65 99 80-48m-80 122 88 52m-153-27v86m-64-111-86 51m86-126-78-45" stroke="#a9401b" stroke-width="8" stroke-linecap="round"/>
                <text x="480" y="565" text-anchor="middle" font-family="Arial" font-size="30" font-weight="600" fill="#18243a">Equal flux through six faces</text>
              </svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="620" viewBox="0 0 960 620">
                <rect width="960" height="620" rx="32" fill="#f8f2e8"/>
                <ellipse cx="480" cy="305" rx="270" ry="195" fill="#dce9f3" stroke="#18243a" stroke-width="12" stroke-dasharray="22 14"/>
                <circle cx="480" cy="305" r="40" fill="#f36c21"/>
                <text x="480" y="318" text-anchor="middle" font-family="Arial" font-size="36" font-weight="700" fill="white">q</text>
                ${[0, 45, 90, 135, 180, 225, 270, 315].map(angle => {
                    const radians = angle * Math.PI / 180
                    const x1 = 480 + Math.cos(radians) * 70
                    const y1 = 305 + Math.sin(radians) * 70
                    const x2 = 480 + Math.cos(radians) * 235
                    const y2 = 305 + Math.sin(radians) * 165
                    return `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="#a9401b" stroke-width="8" stroke-linecap="round"/>`
                }).join('')}
                <text x="480" y="565" text-anchor="middle" font-family="Arial" font-size="30" font-weight="600" fill="#18243a">Closed Gaussian surface</text>
              </svg>`
        response.writeHead(200, {
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'no-store',
        })
        response.end(svg)
        return
    }

    if (request.method === 'GET' && path === '/api/v1/analytics/student-dashboard-lab') {
        json(response, 200, {
            student: { first_name: 'Aarav', last_name: 'Test', student_id: SEED, subjects: ['Physics', 'Mathematics', 'Chemistry'] },
            semesters: [],
            subjects: [{ id: null, name: 'Physics' }, { id: null, name: 'Mathematics' }, { id: null, name: 'Chemistry' }],
            submissions: [],
            exam_scores: [],
            question_type_performance: [],
            subject_question_types: {},
            exam_question_type_breakdown: [],
            summary: { total_submissions: 4, total_checked: 3, distinct_papers: 3, generated_papers: 2 },
            topic_mastery: [],
            chapter_mastery: [{ chapter: 'Coordinate geometry', subject: 'Mathematics', mastery: 42, topics_count: 4 }],
            upcoming_exams: [],
            ai_usage: [],
        })
        return
    }

    if (request.method === 'GET' && path === '/api/v1/previous-papers/published') {
        if (previousPapersMode === 'loading') await new Promise(resolve => setTimeout(resolve, 2200))
        if (previousPapersMode === 'empty') {
            json(response, 200, [])
            return
        }
        if (previousPapersMode === 'papers-error' || (previousPapersMode === 'papers-error-once' && previousPapersFailureCount++ === 0)) {
            json(response, 503, { detail: 'We could not reach the JEE paper archive. Your place is safe—please try again.' })
            return
        }
        json(response, 200, previousPapers)
        return
    }

    if (request.method === 'GET' && path === '/api/v1/previous-papers/chapters') {
        if (previousPapersMode === 'chapters-error') {
            json(response, 503, { detail: 'Those chapters could not be loaded. Please try again.' })
            return
        }
        const subject = url.searchParams.get('subject')
        json(response, 200, previousChapters.filter(chapter => !subject || chapter.subject === subject))
        return
    }

    if (request.method === 'GET' && path === '/api/v1/previous-papers/questions') {
        if (previousPapersMode === 'questions-error') {
            json(response, 503, { detail: 'This question preview could not be loaded. Your selection is unchanged.' })
            return
        }
        const subject = url.searchParams.get('subject')
        const chapterId = url.searchParams.get('chapter_id')
        const questions = previousQuestions.filter(question => (
            (!subject || question.subject === subject)
            && (!chapterId || question.chapter_id === chapterId)
        ))
        json(response, 200, questions)
        return
    }

    const previousPaperStartMatch = path.match(/^\/api\/v1\/previous-papers\/([^/]+)\/start-exam$/)
    if (request.method === 'POST' && previousPaperStartMatch) {
        const payload = await readBody(request)
        if (previousPapersMode === 'slow-start') await new Promise(resolve => setTimeout(resolve, 8000))
        if (previousPapersMode === 'start-error') {
            json(response, 503, { detail: 'We could not assemble this set right now. Your paper and filters are still selected.' })
            return
        }
        const reused = previousPapersMode === 'reused' && payload.attempt_action !== 'new'
        const selectedSubjects = Array.isArray(payload.subjects) && payload.subjects.length
            ? payload.subjects
            : payload.subject ? [payload.subject] : []
        const selectedChapterIds = Array.isArray(payload.chapter_ids) && payload.chapter_ids.length
            ? payload.chapter_ids
            : payload.chapter_id ? [payload.chapter_id] : []
        const selectedQuestions = previousQuestions.filter(question => (
            (!selectedSubjects.length || selectedSubjects.includes(question.subject))
            && (!selectedChapterIds.length || selectedChapterIds.includes(question.chapter_id))
        ))
        const selectionTitle = selectedChapterIds.length
            ? `${selectedChapterIds.length} chapter practice`
            : selectedSubjects.length
                ? `${selectedSubjects.join(' + ')} practice`
                : 'Full-paper practice'
        const attemptTitle = reused ? `Resume ${selectionTitle}` : selectionTitle
        const durationMinutes = payload.timer_enabled === false ? null : Number(payload.duration_minutes || 180)
        previousAttemptPaper = buildPreviousAttemptPaper(selectedQuestions, attemptTitle, durationMinutes)
        json(response, 200, {
            paper_id: PREVIOUS_ATTEMPT_PAPER_ID,
            question_count: selectedQuestions.length,
            redirect_path: `/papers/${PREVIOUS_ATTEMPT_PAPER_ID}/attempt`,
            title: attemptTitle,
            reused_existing: reused,
        })
        return
    }

    if (request.method === 'GET' && path === '/api/v1/ai/conversations') {
        json(response, 200, conversations)
        return
    }

    const messagesMatch = path.match(/^\/api\/v1\/ai\/conversations\/([^/]+)\/messages$/)
    if (request.method === 'GET' && messagesMatch) {
        json(response, 200, historyMessages[messagesMatch[1]] || [])
        return
    }

    const memoryMatch = path.match(/^\/api\/v1\/ai\/conversations\/([^/]+)\/memory$/)
    if (request.method === 'GET' && memoryMatch) {
        json(response, 200, {
            conversation_id: memoryMatch[1],
            active_domain: 'Physics · Rotational mechanics',
            active_task: 'Build exam-ready intuition',
            summary: 'The learner prefers a step-by-step explanation followed by an exam check.',
            recalled_chunk_count: 3,
        })
        return
    }

    if (request.method === 'GET' && path === '/api/v1/ai/memory/profile') {
        json(response, 200, [
            { id: '40000000-0000-4000-8000-000000000001', category: 'learning', memory_key: 'preferred_explanation', value_json: { value: 'Step-by-step with exam checks' }, status: 'confirmed', confidence: 0.97, observation_count: 4 },
            { id: '40000000-0000-4000-8000-000000000002', category: 'goal', memory_key: 'target_exam', value_json: { value: 'JEE Main + Advanced' }, status: 'confirmed', confidence: 1, observation_count: 2 },
        ])
        return
    }

    if (request.method === 'GET' && path === '/api/v1/papers/options') {
        json(response, 200, {
            courses: ['JEE Mains', 'JEE Advanced', 'CBSE'],
            standards: ['11', '12'],
            divisions: ['A', 'B'],
            subjects: [
                { id: '80000000-0000-4000-8000-000000000001', name: 'Physics' },
                { id: '80000000-0000-4000-8000-000000000002', name: 'Mathematics' },
                { id: '80000000-0000-4000-8000-000000000003', name: 'Chemistry' },
            ],
            exam_types: ['Practice'],
        })
        return
    }

    if (request.method === 'GET' && path === '/api/v1/ai/jee/syllabus') {
        const subject = url.searchParams.get('subject') || 'physics'
        json(response, 200, {
            exam_type: url.searchParams.get('exam_type') || 'jee_mains',
            subject,
            chapters: [
                { key: `${subject}-units`, title: '11th: Units and Measurements', standard: '11', subtopics: ['Dimensions', 'Measurement errors'] },
                { key: `${subject}-kinematics`, title: '11th: Kinematics', standard: '11', subtopics: ['Motion in one dimension', 'Projectile motion'] },
                { key: `${subject}-laws`, title: '11th: Laws of Motion', standard: '11', subtopics: ['Friction', 'Free-body diagrams'] },
                { key: `${subject}-work`, title: '11th: Work, Energy and Power', standard: '11', subtopics: ['Work-energy theorem', 'Collisions'] },
                { key: `${subject}-rotation`, title: '11th: Rotational Motion', standard: '11', subtopics: ['Torque', 'Angular momentum'] },
                { key: `${subject}-gravitation`, title: '11th: Gravitation', standard: '11', subtopics: ['Orbital velocity', 'Potential energy'] },
            ],
        })
        return
    }

    if (request.method === 'GET' && path === '/api/v1/chapters') {
        json(response, 200, [
            { id: '90000000-0000-4000-8000-000000000001', title: 'Indexed Mechanics', subject_id: url.searchParams.get('subject_id'), order: 1, subtopics: ['Forces', 'Energy'] },
            { id: '90000000-0000-4000-8000-000000000002', title: 'Indexed Rotational Dynamics', subject_id: url.searchParams.get('subject_id'), order: 2, subtopics: ['Torque', 'Angular momentum'] },
        ])
        return
    }

    if (request.method === 'POST' && path === '/api/v1/ai/jee/generate-form-paper') {
        const payload = await readBody(request)
        const attempts = (paperGenerationAttempts.get(payload.title) || 0) + 1
        paperGenerationAttempts.set(payload.title, attempts)
        if (String(payload.title).toLowerCase().includes('recovery') && attempts === 1) {
            json(response, 200, { paper_id: null, draft_id: PAPER_SEED, job_id: `${PAPER_SEED}-failed`, status: 'failed', failed_count: 1, error: 'Synthetic generation interruption. Retry from the preserved settings.' })
            return
        }
        generatedPaper = buildGeneratedPaper(payload)
        json(response, 200, { paper_id: GENERATED_PAPER_ID, draft_id: PAPER_SEED, job_id: `${PAPER_SEED}-success`, status: 'succeeded', failed_count: 0, error: null })
        return
    }

    if (request.method === 'POST' && path === '/api/v1/papers/generate') {
        const payload = await readBody(request)
        generatedPaper = buildGeneratedPaper(payload)
        json(response, 201, generatedPaper)
        return
    }

    if (request.method === 'GET' && path === `/api/v1/papers/${GENERATED_PAPER_ID}`) {
        json(response, 200, generatedPaper || buildGeneratedPaper())
        return
    }

    if (request.method === 'GET' && path === `/api/v1/papers/${GENERATED_PAPER_ID}/submission`) {
        json(response, 404, { detail: 'No synthetic submission yet.' })
        return
    }

    if (request.method === 'GET' && path === `/api/v1/papers/${PREVIOUS_ATTEMPT_PAPER_ID}`) {
        json(response, 200, previousAttemptPaper)
        return
    }

    if (request.method === 'GET' && path === `/api/v1/papers/${PREVIOUS_ATTEMPT_PAPER_ID}/attempts`) {
        const items = previousAttempts.map((attempt) => {
            if (attempt.id !== '95000000-0000-4000-8000-000000000002') return attempt
            return paperDetailMode === 'ready'
                ? {
                    ...attempt,
                    grading_status: 'checked',
                    checked_at: '2026-07-25T10:05:00.000Z',
                    checking_progress_percent: 100,
                    total_score: 8,
                    max_score: 12,
                    results_visible_to_student: true,
                }
                : {
                    ...attempt,
                    grading_status: 'checking',
                    checking_progress_percent: 62,
                    total_score: 0,
                    max_score: 12,
                    results_visible_to_student: false,
                }
        })
        json(response, 200, { items })
        return
    }

    if (request.method === 'POST' && path === `/api/v1/papers/${PREVIOUS_ATTEMPT_PAPER_ID}/attempts`) {
        const payload = await readBody(request)
        const nextAttemptNumber = previousAttempts.length + 1
        const nextAttempt = {
            id: `95000000-0000-4000-8000-${String(nextAttemptNumber).padStart(12, '0')}`,
            paper_id: PREVIOUS_ATTEMPT_PAPER_ID,
            b2c_student_id: '00000000-0000-4000-8000-000000000018',
            exam_id: payload.exam_id || null,
            attempt_number: nextAttemptNumber,
            started_at: new Date().toISOString(),
            answers: [],
            results: [],
            results_visible_to_student: false,
            grading_status: 'in_progress',
            created_at: new Date().toISOString(),
        }
        previousAttempts.push(nextAttempt)
        json(response, 201, nextAttempt)
        return
    }

    if (request.method === 'GET' && path === `/api/v1/papers/${PREVIOUS_ATTEMPT_PAPER_ID}/submission`) {
        const attemptId = url.searchParams.get('attempt_id')
        const submission = previousAttempts.find(attempt => attempt.id === attemptId)
        if (!submission || !submission.submitted_at) {
            json(response, 404, { detail: 'No completed synthetic submission yet.' })
            return
        }
        previousCheckingPollCount += 1
        const checkingProgress = [38, 67, 88, 100][Math.min(previousCheckingPollCount - 1, 3)]
        if (checkingProgress === 100) {
            json(response, 200, {
                ...submission,
                grading_status: 'checked',
                checking_progress_percent: 100,
                total_score: 8,
                max_score: 12,
                results_visible_to_student: true,
            })
            return
        }
        json(response, 200, {
            ...submission,
            grading_status: 'checking',
            checking_progress_percent: checkingProgress,
        })
        return
    }

    if (request.method === 'GET' && path === `/api/v1/papers/${PREVIOUS_ATTEMPT_PAPER_ID}/export/pdf`) {
        const bytes = Buffer.from('%PDF-1.4\\n% synthetic paper detail proof\\n%%EOF')
        response.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="synthetic-previous-paper.pdf"',
            'Content-Length': bytes.length,
        })
        response.end(bytes)
        return
    }

    if (request.method === 'DELETE' && path === `/api/v1/papers/${PREVIOUS_ATTEMPT_PAPER_ID}`) {
        paperDetailDeleted = true
        response.writeHead(204)
        response.end()
        return
    }

    if (request.method === 'GET' && path === '/api/v1/exams/student') {
        if (examWorkspaceMode === 'loading') await new Promise(resolve => setTimeout(resolve, 2200))
        if (examWorkspaceMode === 'teacher-error') {
            json(response, 503, { detail: 'Teacher exams are temporarily unavailable.' })
            return
        }
        json(response, 200, examWorkspaceMode === 'empty' ? [] : teacherExams)
        return
    }

    if (request.method === 'POST' && path === `/api/v1/papers/${PREVIOUS_ATTEMPT_PAPER_ID}/submit`) {
        const payload = await readBody(request)
        const attemptIndex = previousAttempts.findIndex(attempt => attempt.id === payload.attempt_id)
        const submittedAttempt = {
            ...(attemptIndex >= 0 ? previousAttempts[attemptIndex] : previousAttempts.at(-1)),
            answers: payload.answers || [],
            submitted_at: new Date().toISOString(),
            grading_status: 'submitted',
            checking_progress_percent: 12,
            mode: payload.mode,
            time_taken_seconds: payload.time_taken_seconds,
        }
        previousCheckingPollCount = 0
        if (attemptIndex >= 0) previousAttempts[attemptIndex] = submittedAttempt
        json(response, 200, {
            ...submittedAttempt,
        })
        return
    }

    const workspacePaperMatch = path.match(/^\/api\/v1\/papers\/(961[0-9a-f-]+|962[0-9a-f-]+)$/)
    if (request.method === 'GET' && workspacePaperMatch) {
        json(response, 200, buildWorkspacePaper(workspacePaperMatch[1]))
        return
    }

    const workspaceAttemptMatch = path.match(/^\/api\/v1\/papers\/(961[0-9a-f-]+|962[0-9a-f-]+)\/attempts$/)
    if (request.method === 'GET' && workspaceAttemptMatch) {
        const paperId = workspaceAttemptMatch[1]
        const examId = url.searchParams.get('exam_id')
        const attempts = (examWorkspaceAttempts.get(paperId) || [])
            .filter(attempt => !examId || attempt.exam_id === examId)
        json(response, 200, { items: attempts })
        return
    }

    if (request.method === 'POST' && workspaceAttemptMatch) {
        const paperId = workspaceAttemptMatch[1]
        const payload = await readBody(request)
        if (payload.reason !== 'retest') {
            json(response, 422, { detail: 'Synthetic retests require reason=retest.' })
            return
        }
        if (paperId === TEACHER_PAPER_DONE_ID && payload.exam_id !== TEACHER_EXAM_ID) {
            json(response, 422, { detail: 'Teacher retests must include the matching exam_id.' })
            return
        }
        const attempts = examWorkspaceAttempts.get(paperId) || []
        const nextAttempt = {
            id: `96600000-0000-4000-8000-${String(attempts.length + 1).padStart(12, '0')}`,
            paper_id: paperId,
            student_id: '00000000-0000-4000-8000-000000000019',
            exam_id: payload.exam_id || null,
            attempt_number: attempts.length + 1,
            started_at: new Date().toISOString(),
            answers: [],
            results: [],
            results_visible_to_student: false,
            grading_status: 'in_progress',
            created_at: new Date().toISOString(),
        }
        attempts.push(nextAttempt)
        examWorkspaceAttempts.set(paperId, attempts)
        examWorkspaceAudit.push({
            action: 'retest',
            paper_id: paperId,
            exam_id: payload.exam_id || null,
            reason: payload.reason,
            attempt_id: nextAttempt.id,
        })
        json(response, 201, nextAttempt)
        return
    }

    const workspaceDownloadMatch = path.match(/^\/api\/v1\/checked-papers\/(964[0-9a-f-]+)\/download$/)
    if (request.method === 'GET' && workspaceDownloadMatch) {
        examWorkspaceAudit.push({ action: 'download', attempt_id: workspaceDownloadMatch[1] })
        const bytes = Buffer.from('%PDF-1.4\n% Synthetic Eduraa checked paper\n%%EOF\n')
        response.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="checked-${workspaceDownloadMatch[1]}.pdf"`,
        })
        response.end(bytes)
        return
    }

    const workspaceDeleteMatch = path.match(/^\/api\/v1\/papers\/(962[0-9a-f-]+)$/)
    if (request.method === 'DELETE' && workspaceDeleteMatch) {
        const paperId = workspaceDeleteMatch[1]
        const index = practicePapers.findIndex(paper => paper.id === paperId)
        if (index < 0) {
            json(response, 404, { detail: 'Owned practice paper not found.' })
            return
        }
        practicePapers.splice(index, 1)
        examWorkspaceAttempts.delete(paperId)
        examWorkspaceAudit.push({ action: 'delete', paper_id: paperId })
        response.writeHead(204)
        response.end()
        return
    }

    const deleteMatch = path.match(/^\/api\/v1\/ai\/conversations\/([^/]+)$/)
    if (request.method === 'DELETE' && deleteMatch) {
        const index = conversations.findIndex(conversation => conversation.id === deleteMatch[1])
        if (index >= 0) conversations.splice(index, 1)
        response.writeHead(204)
        response.end()
        return
    }

    if (request.method === 'GET' && path === '/api/v1/papers') {
        if (url.searchParams.get('scope') === 'mine') {
            if (examWorkspaceMode === 'practice-error') {
                json(response, 503, { detail: 'Practice papers are temporarily unavailable.' })
                return
            }
            json(response, 200, {
                items: examWorkspaceMode === 'empty' ? [] : practicePapers,
                total: examWorkspaceMode === 'empty' ? 0 : practicePapers.length,
                skip: 0,
                limit: 200,
            })
            return
        }
        if (syntheticRole === 'student' || syntheticRole === 'teacher') {
            if (schoolPreviousPapersMode === 'loading') await new Promise(resolve => setTimeout(resolve, 2500))
            if (schoolPreviousPapersMode === 'error') {
                json(response, 503, { detail: 'Structured school papers are temporarily unavailable.' })
                return
            }
            if (schoolPreviousPapersMode === 'forbidden') {
                json(response, 403, { detail: 'Structured paper permission is no longer active.' })
                return
            }
            const items = [
                {
                    id: PREVIOUS_ATTEMPT_PAPER_ID,
                    title: previousAttemptPaper.title,
                    subject_name: 'Physics',
                    standard: '10',
                    division: 'A',
                    category: 'Previous Paper Practice',
                    total_marks: previousAttemptPaper.total_marks,
                    duration_minutes: previousAttemptPaper.duration_minutes,
                    status: 'published',
                    is_submitted_by_me: syntheticRole === 'student',
                    created_at: '2025-03-10T09:00:00.000Z',
                    question_count: previousAttemptPaper.questions.length,
                },
                {
                    id: '50000000-0000-4000-8000-000000000003',
                    title: 'Science Term II Practice Paper with Extended Response Sections',
                    subject_name: 'Science',
                    standard: '10',
                    division: 'A',
                    category: 'Term II',
                    total_marks: 100,
                    duration_minutes: null,
                    status: 'published',
                    is_submitted_by_me: false,
                    created_at: '2024-11-17T09:00:00.000Z',
                    question_count: 42,
                },
            ]
            const visibleItems = schoolPreviousPapersMode === 'empty' ? [] : items
            json(response, 200, { items: visibleItems, total: visibleItems.length, skip: 0, limit: 100 })
            return
        }
        json(response, 200, {
            items: [
                ...(!paperDetailDeleted ? [{
                    id: PREVIOUS_ATTEMPT_PAPER_ID,
                    title: previousAttemptPaper.title,
                    subject_name: 'Physics',
                    total_marks: previousAttemptPaper.total_marks,
                    duration_minutes: previousAttemptPaper.duration_minutes,
                    status: 'published',
                    is_submitted_by_me: true,
                    created_at: previousAttemptPaper.created_at,
                    question_count: previousAttemptPaper.questions.length,
                }] : []),
                { id: '50000000-0000-4000-8000-000000000001', title: 'JEE Mechanics Diagnostic', subject_name: 'Physics', total_marks: 100, duration_minutes: 90, status: 'published', created_at: '2026-07-17T09:00:00.000Z', question_count: 30 },
                { id: '50000000-0000-4000-8000-000000000002', title: 'Coordinate Geometry Repair Set', subject_name: 'Mathematics', total_marks: 60, duration_minutes: 45, status: 'published', created_at: '2026-07-16T09:00:00.000Z', question_count: 18 },
            ],
            total: paperDetailDeleted ? 2 : 3,
            skip: 0,
            limit: 8,
        })
        return
    }

    if (request.method === 'POST' && path === '/api/v1/ai/chat/stream') {
        const payload = await readBody(request)
        streamAnswer(request, response, payload)
        return
    }

    if (request.method === 'GET' && path === '/api/v1/checked-papers') {
        const checkedPaper = buildPreviousCheckedPaper()
        json(response, 200, checkedPaper ? [checkedPaper] : [])
        return
    }

    if (request.method === 'POST' && path === '/__test__/scan-upload-mode') {
        const payload = await readBody(request)
        scanUploadMode = String(payload.mode || 'ready')
        json(response, 200, { mode: scanUploadMode })
        return
    }

    if (request.method === 'GET' && path === '/api/v1/checked-papers/options') {
        json(response, 200, {
            exams: [{
                id: TEACHER_EXAM_ID,
                name: 'Grade 10 Mathematics Midterm — Algebra, Coordinate Geometry and Applied Reasoning',
                teacher_id: '00000000-0000-4000-8000-000000000018',
                subject_id: 'subject-mathematics',
                standard: '10',
                division: 'A',
                auto_grade_enabled: true,
                results_published: false,
                created_at: '2026-08-20T09:00:00.000Z',
                updated_at: '2026-08-20T09:00:00.000Z',
            }],
            papers: [{
                id: TEACHER_PAPER_OPEN_ID,
                title: 'Algebra and Coordinate Geometry Practice with Extended Applied-Reasoning Responses',
                source_type: 'custom_paper',
                subject_id: 'subject-mathematics',
                subject_name: 'Mathematics',
                standard: '10',
                division: 'A',
                created_at: '2026-08-21T09:00:00.000Z',
            }],
            subjects: [{
                id: 'subject-mathematics',
                name: 'Mathematics',
                code: 'MATH-10',
                created_at: '2026-07-01T09:00:00.000Z',
            }],
            students: [
                { id: 'student-aarav', first_name: 'Aarav', last_name: 'Ramanathan', student_id: 'STU-2048', standard: '10', division: 'A' },
                { id: 'student-meera', first_name: 'Meera Ananya', last_name: 'Kapoor Subramaniam', student_id: 'STU-2051', standard: '10', division: 'A' },
            ],
        })
        return
    }

    if (request.method === 'POST' && path === '/api/v1/checked-papers/scan') {
        request.resume()
        await new Promise((resolve) => setTimeout(resolve, scanUploadMode === 'slow' ? 20000 : 1800))
        if (scanUploadMode === 'error') {
            json(response, 503, { detail: 'The scan could not be received. Your draft is still safe on this device.' })
            return
        }
        json(response, 200, buildPreviousCheckedPaper())
        return
    }

    if (request.method === 'GET' && path.startsWith('/api/v1/checked-papers/')) {
        const checkedPaper = buildPreviousCheckedPaper()
        if (!checkedPaper || path !== `/api/v1/checked-papers/${checkedPaper.id}`) {
            json(response, 404, { detail: 'Synthetic checked paper not found.' })
            return
        }
        json(response, 200, checkedPaper)
        return
    }

    json(response, 404, { detail: `Synthetic route not found: ${request.method} ${path}` })
})

server.listen(PORT, '0.0.0.0', () => {
    console.log(`AI Studio synthetic server (${SEED}) listening on http://localhost:${PORT}`)
})
