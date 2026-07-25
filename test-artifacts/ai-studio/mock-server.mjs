import http from 'node:http'

const PORT = 8000
const SEED = 'studio-row-20260718'
const PAPER_SEED = 'paper-studio-row-20260718'
const PREVIOUS_PAPERS_SEED = 'pr6-pyq-20260725'
const GENERATED_PAPER_ID = '60000000-0000-4000-8000-000000000001'
const PREVIOUS_PAPER_ID = '91000000-0000-4000-8000-000000000001'
const PREVIOUS_ATTEMPT_PAPER_ID = '92000000-0000-4000-8000-000000000001'
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
        question_count: 90,
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
        question_count: 90,
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
        question_count: 54,
        subjects: ['Physics', 'Chemistry', 'Mathematics'],
        has_solutions: true,
    },
]

const previousChapters = Array.from({ length: 8 }, (_, index) => ({
    previous_paper_id: PREVIOUS_PAPER_ID,
    subject: 'Physics',
    branch: null,
    chapter_id: `93000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    chapter_title: [
        'Electrostatics',
        'Kinematics',
        'Current Electricity',
        'Ray and Wave Optics',
        'Modern Physics',
        'Rotational Motion',
        'Thermodynamics and Kinetic Theory',
        'Electromagnetic Induction and Alternating Current',
    ][index],
    topic_slug: `synthetic-chapter-${index + 1}`,
    question_count: 8 - index,
}))

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
        question_text: 'A point charge +q is placed at the centre of a cube. Determine the electric flux through one face when the surrounding medium has permittivity ε₀, and choose the expression that follows from Gauss’s law.',
        options: [
            { id: 'A', label: 'A', text: 'q / ε₀' },
            { id: 'B', label: 'B', text: 'q / 6ε₀' },
            { id: 'C', label: 'C', text: 'q / 3ε₀' },
            { id: 'D', label: 'D', text: '6q / ε₀' },
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
]

const previousAttemptStartedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString()
const previousAttemptPaper = {
    id: PREVIOUS_ATTEMPT_PAPER_ID,
    school_id: '70000000-0000-4000-8000-000000000001',
    created_by: '00000000-0000-4000-8000-000000000018',
    subject_id: '80000000-0000-4000-8000-000000000001',
    title: 'Recovered Electrostatics PYQ practice',
    subtitle: `Synthetic handoff proof · ${PREVIOUS_PAPERS_SEED}`,
    course: 'JEE Main',
    category: 'Previous-year practice',
    standard: '12',
    total_marks: 8,
    duration_minutes: 180,
    instructions: 'Choose the best answer. Your newest unfinished attempt is restored automatically.',
    status: 'published',
    published_at: '2026-07-25T10:00:00.000Z',
    created_at: '2026-07-25T09:55:00.000Z',
    questions: previousQuestions.map((question, index) => ({
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
    })),
}

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
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')

    if (request.method === 'OPTIONS') {
        response.writeHead(204)
        response.end()
        return
    }

    const url = new URL(request.url, `http://${request.headers.host}`)
    const path = url.pathname

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

    if (request.method === 'POST' && path === '/api/v1/auth/login') {
        const payload = await readBody(request)
        const previousPapersJourney = String(payload.identifier || payload.email || '').includes('pr6')
        json(response, 200, {
            access_token: `synthetic-${SEED}`,
            token_type: 'bearer',
            user: {
                id: '00000000-0000-4000-8000-000000000018',
                display_name: 'Aarav Test',
                identifier: `aarav.${SEED}@example.test`,
                role: 'b2c_student',
                profile_completed: true,
                is_email_verified: true,
                b2c_education_level: previousPapersJourney ? 'school' : 'competitive_exams',
                b2c_target_exam: previousPapersJourney ? null : 'JEE Main + Advanced',
                b2c_subjects: ['Physics', 'Mathematics', 'Chemistry'],
            },
        })
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
            json(response, 503, { detail: 'Synthetic paper library interruption. Retry keeps the learner on this page.' })
            return
        }
        json(response, 200, previousPapers)
        return
    }

    if (request.method === 'GET' && path === '/api/v1/previous-papers/chapters') {
        if (previousPapersMode === 'chapters-error') {
            json(response, 503, { detail: 'Synthetic chapter index interruption.' })
            return
        }
        const subject = url.searchParams.get('subject')
        json(response, 200, subject && subject !== 'Physics' ? [] : previousChapters)
        return
    }

    if (request.method === 'GET' && path === '/api/v1/previous-papers/questions') {
        if (previousPapersMode === 'questions-error') {
            json(response, 503, { detail: 'Synthetic question preview interruption.' })
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
            json(response, 503, { detail: 'Synthetic assembly interruption. Your paper filters are preserved.' })
            return
        }
        const reused = previousPapersMode === 'reused' && payload.attempt_action !== 'new'
        json(response, 200, {
            paper_id: reused ? PREVIOUS_ATTEMPT_PAPER_ID : PREVIOUS_ATTEMPT_PAPER_ID,
            question_count: previousQuestions.length,
            redirect_path: `/papers/${PREVIOUS_ATTEMPT_PAPER_ID}/attempt`,
            title: reused ? 'Recovered Electrostatics PYQ practice' : 'Fresh Electrostatics PYQ practice',
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
        json(response, 200, { items: previousAttempts })
        return
    }

    if (request.method === 'POST' && path === `/api/v1/papers/${PREVIOUS_ATTEMPT_PAPER_ID}/attempts`) {
        json(response, 201, previousAttempts.at(-1))
        return
    }

    if (request.method === 'GET' && path === `/api/v1/papers/${PREVIOUS_ATTEMPT_PAPER_ID}/submission`) {
        json(response, 404, { detail: 'No completed synthetic submission yet.' })
        return
    }

    if (request.method === 'POST' && path === `/api/v1/papers/${PREVIOUS_ATTEMPT_PAPER_ID}/submit`) {
        const payload = await readBody(request)
        json(response, 200, {
            ...previousAttempts.at(-1),
            answers: payload.answers || [],
            submitted_at: new Date().toISOString(),
            grading_status: 'submitted',
            mode: payload.mode,
            time_taken_seconds: payload.time_taken_seconds,
        })
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
        json(response, 200, {
            items: [
                { id: '50000000-0000-4000-8000-000000000001', title: 'JEE Mechanics Diagnostic', subject_name: 'Physics', total_marks: 100, duration_minutes: 90, status: 'published', created_at: '2026-07-17T09:00:00.000Z', question_count: 30 },
                { id: '50000000-0000-4000-8000-000000000002', title: 'Coordinate Geometry Repair Set', subject_name: 'Mathematics', total_marks: 60, duration_minutes: 45, status: 'published', created_at: '2026-07-16T09:00:00.000Z', question_count: 18 },
            ],
            total: 2,
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

    json(response, 404, { detail: `Synthetic route not found: ${request.method} ${path}` })
})

server.listen(PORT, '0.0.0.0', () => {
    console.log(`AI Studio synthetic server (${SEED}) listening on http://localhost:${PORT}`)
})
