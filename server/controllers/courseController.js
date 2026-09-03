import { v4 as uuidv4 } from 'uuid'
import {
  createCourse, updateCourse, getCourses, getCourseById, getCoursesByCreator,
  createEnrollment, getUserEnrollments, getEnrollment,
  createTransaction, getTransactionByReference, updateTransactionByReference,
} from '../db.js'
import pool from '../config/database.js'

let _paystack = null
async function getPaystack() {
  if (_paystack) return _paystack
  if (!process.env.PAYSTACK_SECRET_KEY) return null
  try {
    const paystackModule = await import('paystack-api')
    const PaystackAPI = paystackModule.default || paystackModule
    _paystack = new PaystackAPI(process.env.PAYSTACK_SECRET_KEY)
    return _paystack
  } catch { return null }
}

const CALLBACK_URL = process.env.PAYSTACK_CALLBACK_URL || 'http://localhost:3000'

// Course CRUD (creator)
export async function createCourseHandler(req, res) {
  try {
    const { title, description, price, imageUrl, category, duration, lessonsCount, rating } = req.body
    if (!title || price === undefined) return res.status(400).json({ error: 'Title and price required' })
    const course = await createCourse({
      id: uuidv4(), creatorId: req.userId, title, description, price, imageUrl,
      category, duration, lessonsCount, rating,
    })
    res.json({ success: true, course })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function updateCourseHandler(req, res) {
  try {
    const course = await updateCourse(req.params.id, req.userId, req.body)
    if (!course) return res.status(404).json({ error: 'Course not found' })
    res.json({ success: true, course })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function listCourses(req, res) {
  try {
    const courses = await getCourses(req.query.category)
    res.json({ success: true, courses })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function getCourse(req, res) {
  try {
    const course = await getCourseById(req.params.id)
    if (!course) return res.status(404).json({ error: 'Course not found' })
    if (req.userId) {
      const enrollment = await getEnrollment(req.userId, req.params.id)
      course.enrolled = !!enrollment
      course.enrollmentProgress = enrollment ? enrollment.progress : 0
    }
    res.json({ success: true, course })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function myCourses(req, res) {
  try {
    const courses = await getCoursesByCreator(req.userId)
    res.json({ success: true, courses })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

// Enrollment
export async function enroll(req, res) {
  try {
    const { courseId } = req.body
    if (!courseId) return res.status(400).json({ error: 'Course ID required' })
    const course = await getCourseById(courseId)
    if (!course) return res.status(404).json({ error: 'Course not found' })
    if (!course.active) return res.status(400).json({ error: 'Course not available' })

    const existing = await getEnrollment(req.userId, courseId)
    if (existing) return res.status(400).json({ error: 'Already enrolled' })

    if (parseFloat(course.price) <= 0) {
      const enrollment = await createEnrollment({
        id: uuidv4(), userId: req.userId, courseId, transactionId: null, progress: 0, completed: false,
      })
      return res.json({ success: true, enrollment, free: true })
    }

    const paystack = await getPaystack()
    if (!paystack) return res.status(500).json({ error: 'Paystack not configured' })

    const reference = `CRS-${uuidv4().split('-')[0]}-${Date.now()}`

    await createTransaction({
      userId: req.userId, reference, type: 'course', amount: parseFloat(course.price), status: 'pending',
      metadata: { courseId, courseTitle: course.title },
    })

    const response = await paystack.transaction.initialize({
      email: req.user.email,
      amount: parseFloat(course.price) * 100,
      reference,
      callback_url: `${CALLBACK_URL}/learn/success?reference=${reference}`,
      metadata: { userId: req.userId, courseId, type: 'course' },
    })

    res.json({ success: true, authorization_url: response.data.authorization_url, reference })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function verifyEnrollment(req, res) {
  try {
    const { reference } = req.query
    if (!reference) return res.status(400).json({ error: 'Reference required' })
    const paystack = await getPaystack()
    if (!paystack) return res.status(500).json({ error: 'Paystack not configured' })

    const response = await paystack.transaction.verify({ reference })
    if (response.data.status === 'success') {
      const tx = await getTransactionByReference(reference)
      if (!tx || tx.status !== 'pending') {
        return res.json({ success: false, error: 'Transaction not found or already processed' })
      }
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const { rows } = await client.query(`UPDATE transactions SET status='success' WHERE reference=$1 AND status='pending' RETURNING id`, [reference])
        if (rows.length === 0) { await client.query('ROLLBACK'); return res.json({ success: false, error: 'Transaction already processed' }) }
        const courseId = tx.metadata?.courseId
        // Get course creator
        const { rows: courseRows } = await client.query(`SELECT creator_id, price FROM courses WHERE id=$1`, [courseId])
        const creatorId = courseRows[0]?.creator_id || tx.creator_id
        const enrollment = await createEnrollment({
          id: uuidv4(), userId: tx.user_id, courseId,
          transactionId: tx.id, progress: 0, completed: false,
        })
        // Credit 80% to creator
        const gross = parseFloat(tx.amount) || parseFloat(courseRows[0]?.price) || 0
        const platformFee = Math.round(gross * 0.20 * 100) / 100
        const creatorShare = Math.round((gross - platformFee) * 100) / 100
        if (creatorId && creatorShare > 0) {
          const { rows: balRows } = await client.query(`UPDATE creator_profiles SET wallet_balance_ngn = wallet_balance_ngn + $1 WHERE user_id=$2 RETURNING wallet_balance_ngn`, [creatorShare, creatorId])
          const bal = balRows[0]?.wallet_balance_ngn || creatorShare
          await client.query(`INSERT INTO creator_wallet_transactions (creator_id, type, amount_ngn, balance_after_ngn, metadata) VALUES ($1,'course',$2,$3,$4)`, [creatorId, creatorShare, bal, JSON.stringify({ reference, courseId, gross, platformFee })])
        }
        await client.query('COMMIT')
        res.json({ success: true, enrollment })
      } catch (e) { try { await client.query('ROLLBACK') } catch {}; throw e } finally { client.release() }
      return
    } else {
      res.json({ success: false, error: 'Payment not completed' })
    }
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function myEnrollments(req, res) {
  try {
    const enrollments = await getUserEnrollments(req.userId)
    res.json({ success: true, enrollments })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function updateProgress(req, res) {
  try {
    const { courseId, progress } = req.body
    if (!courseId || progress === undefined) return res.status(400).json({ error: 'Course ID and progress required' })
    const enrollment = await getEnrollment(req.userId, courseId)
    if (!enrollment) return res.status(404).json({ error: 'Not enrolled' })
    const updated = await updateEnrollmentProgress(req.userId, courseId, progress)
    res.json({ success: true, enrollment: updated })
  } catch (err) { res.status(500).json({ error: err.message }) }
}
