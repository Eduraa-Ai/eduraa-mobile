import http from 'node:http'

const PORT = 8000
const SEED = 'studio-row-20260718'
const PAPER_SEED = 'paper-studio-row-20260718'
const GENERATED_PAPER_ID = '60000000-0000-4000-8000-000000000001'
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

    if (request.method === 'POST' && path === '/api/v1/auth/login') {
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
                b2c_education_level: 'competitive_exams',
                b2c_target_exam: 'JEE Main + Advanced',
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