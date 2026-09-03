import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Icon from '../components/ui/Icon'
import { getCourses, getToken, enrollCourse, verifyCoursePayment, getMyEnrollments } from '../lib/auth'
import { formatCurrency } from '../lib/currency'

export default function Learn() {
  const [courses, setCourses] = useState<any[]>([])
  const [categories, setCategories] = useState<string[]>(['All'])
  const [activeCategory, setActiveCategory] = useState('All')
  const [enrollments, setEnrollments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [enrolling, setEnrolling] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [showMyCourses, setShowMyCourses] = useState(false)
  const token = getToken()

  useEffect(() => {
    getCourses().then(r => {
      if (r.success) {
        setCourses(r.courses)
        const cats = ['All', ...new Set(r.courses.map((c: any) => c.category))] as string[]
        setCategories(cats)
      }
      setLoading(false)
    })
    if (token) {
      getMyEnrollments(token).then(r => { if (r.success) setEnrollments(r.enrollments) })
    }
  }, [token])

  useEffect(() => {
    const ref = localStorage.getItem('pendingCourseRef')
    if (ref && token) {
      localStorage.removeItem('pendingCourseRef')
      verifyCoursePayment(token, ref).then(r => {
        if (r.success) setMsg('Enrolled successfully!')
        else setMsg(r.error || 'Verification failed')
        getMyEnrollments(token).then(r => { if (r.success) setEnrollments(r.enrollments) })
      })
    }
  }, [token])

  const filtered = activeCategory === 'All' ? courses : courses.filter((c: any) => c.category === activeCategory)
  const isEnrolled = (courseId: string) => enrollments.some(e => e.course_id === courseId)

  const handleEnroll = async (courseId: string) => {
    if (!token) return
    setEnrolling(courseId)
    const res = await enrollCourse(token, courseId)
    if (res.success && res.free) {
      setMsg('Enrolled! Start learning now.')
      getMyEnrollments(token).then(r => { if (r.success) setEnrollments(r.enrollments) })
    } else if (res.success && res.authorization_url) {
      localStorage.setItem('pendingCourseRef', res.reference)
      window.location.href = res.authorization_url
    } else {
      setMsg(res.error || 'Enrollment failed')
    }
    setEnrolling(null)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary-container" /></div>

  return (
    <div className="min-h-screen px-margin-mobile md:px-margin-desktop pt-6 md:pt-10 pb-nav">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <Icon name="school" className="w-8 h-8 text-primary-container" />
            <h1 className="text-headline-lg font-bold">E-Learning</h1>
          </div>
          {token && (
            <button onClick={() => setShowMyCourses(!showMyCourses)} className="flex items-center gap-1 text-label-sm text-on-surface-variant hover:text-on-surface">
              <Icon name="bookmark" /> My Courses ({enrollments.length})
            </button>
          )}
        </div>
        <p className="text-on-surface-variant/60 text-sm mb-6">Master the art of filmmaking</p>

        <div className="flex flex-wrap gap-2 mb-8">
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeCategory === cat ? 'bg-primary-container text-on-primary-container' : 'bg-surface-variant/20 border border-outline/20 text-on-surface-variant hover:text-on-surface'}`}>
              {cat}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((course: any, i: number) => {
            const enrolled = isEnrolled(course.id)
            return (
              <motion.div
                key={course.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-surface-container-high rounded-2xl overflow-hidden border border-white/5 hover:border-primary-container/30 transition-all"
              >
                <div className="relative aspect-video bg-gradient-to-br from-surface-container to-surface-container-high flex items-center justify-center overflow-hidden">
                  {course.image_url ? (
                    <img src={course.image_url} alt={course.title} className="w-full h-full object-cover" />
                  ) : (
                    <Icon name="play_circle" className="w-16 h-16 text-on-surface-variant/30" />
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-primary-container/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                      <Icon name="play_arrow" className="text-on-primary-container text-2xl" />
                    </div>
                  </div>
                  <span className="absolute top-3 left-3 text-label-xs bg-surface/80 text-on-surface px-2 py-1 rounded-md backdrop-blur-sm">{course.category}</span>
                  {parseFloat(course.price) > 0 && (
                    <span className="absolute top-3 right-3 bg-primary-container text-on-primary-container text-label-xs px-2 py-1 rounded-md font-bold">{formatCurrency(parseFloat(course.price))}</span>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-label-lg text-on-surface mb-2 line-clamp-2">{course.title}</h3>
                  <p className="text-label-sm text-on-surface-variant mb-1">{course.creator_name}</p>
                  <div className="flex items-center gap-4 text-label-xs text-on-surface-variant mb-3">
                    <span className="flex items-center gap-1"><Icon name="menu_book" className="text-sm" />{course.lessons_count} lessons</span>
                    <span className="flex items-center gap-1"><Icon name="schedule" className="text-sm" />{course.duration}</span>
                    <span className="flex items-center gap-1"><Icon name="star" className="text-sm text-yellow-500" />{parseFloat(course.rating).toFixed(1)}</span>
                  </div>
                  <p className="text-body-sm text-on-surface-variant line-clamp-2 mb-3">{course.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-label-sm text-on-surface-variant"><Icon name="people" className="text-sm inline mr-1" />{course.students_count} students</span>
                    {enrolled ? (
                      <span className="flex items-center gap-1 text-label-sm text-green-400"><Icon name="check_circle" className="text-sm" />Enrolled</span>
                    ) : (
                      <button
                        onClick={() => handleEnroll(course.id)}
                        disabled={enrolling === course.id}
                        className="px-4 py-2 bg-primary-container text-on-primary-container rounded-xl font-label-sm disabled:opacity-50"
                      >
                        {enrolling === course.id ? '...' : parseFloat(course.price) > 0 ? 'Enroll Now' : 'Free'}
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>

        {courses.length === 0 && (
          <div className="text-center py-16">
            <Icon name="school" className="text-5xl text-on-surface-variant/20 mb-4" />
            <p className="text-body-lg text-on-surface-variant">No courses available yet</p>
          </div>
        )}

        {/* My Courses panel */}
        {showMyCourses && (
          <motion.div initial={{ opacity: 0, x: 300 }} animate={{ opacity: 1, x: 0 }} className="fixed right-0 top-0 h-full w-full max-w-md bg-surface-container-lowest border-l border-white/5 z-50 shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="font-label-lg text-on-surface">My Courses ({enrollments.length})</h2>
              <button onClick={() => setShowMyCourses(false)} className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-outline/10" aria-label="Close"><Icon name="close" /></button>
            </div>
            <div className="p-6 overflow-auto" style={{ height: 'calc(100% - 80px)' }}>
              {enrollments.length === 0 ? (
                <div className="text-center py-12">
                  <Icon name="bookmark" className="text-4xl text-on-surface-variant/20 mb-3" />
                  <p className="text-body-md text-on-surface-variant">No enrollments yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {enrollments.map((e: any) => (
                    <div key={e.id} className="bg-surface-container rounded-xl p-4">
                      <h3 className="font-label-md text-on-surface mb-1">{e.course_title}</h3>
                      <p className="text-label-sm text-on-surface-variant mb-2">{e.creator_name}</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
                          <div className="h-full bg-primary-container rounded-full transition-all" style={{ width: `${e.progress}%` }} />
                        </div>
                        <span className="text-label-xs text-on-surface-variant">{e.progress}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {msg && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-surface-container-high border border-outline/20 rounded-xl px-6 py-3 shadow-xl text-label-md text-on-surface">
            {msg}
            <button onClick={() => setMsg('')} className="ml-4 text-on-surface-variant"><Icon name="close" /></button>
          </div>
        )}
      </div>
    </div>
  )
}
