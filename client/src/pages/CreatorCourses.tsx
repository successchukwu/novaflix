import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Icon from '../components/ui/Icon'
import { getToken, getMyCourses, createCourse, updateCourse } from '../lib/auth'
import { formatCurrency } from '../lib/currency'

export default function CreatorCourses() {
  const [courses, setCourses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [category, setCategory] = useState('general')
  const [duration, setDuration] = useState('')
  const [lessonsCount, setLessonsCount] = useState('')

  useEffect(() => {
    const token = getToken()
    if (!token) { setLoading(false); return }
    getMyCourses(token).then(r => { if (r.success) setCourses(r.courses); setLoading(false) })
  }, [])

  const handleSubmit = async () => {
    const token = getToken()
    if (!token || !title || !price) return
    const data = { title, description, price: parseFloat(price), imageUrl, category, duration, lessonsCount: parseInt(lessonsCount) || 0 }
    if (editId) await updateCourse(token, editId, data)
    else await createCourse(token, data)
    resetForm()
    const r = await getMyCourses(token)
    if (r.success) setCourses(r.courses)
  }

  const handleEdit = (c: any) => {
    setEditId(c.id); setTitle(c.title); setDescription(c.description || '')
    setPrice(String(c.price)); setImageUrl(c.image_url || ''); setCategory(c.category || 'general')
    setDuration(c.duration || ''); setLessonsCount(String(c.lessons_count || '')); setShowForm(true)
  }

  const handleToggle = async (c: any) => {
    const token = getToken()
    if (!token) return
    await updateCourse(token, c.id, { active: !c.active })
    const r = await getMyCourses(token)
    if (r.success) setCourses(r.courses)
  }

  const resetForm = () => {
    setShowForm(false); setEditId(null); setTitle(''); setDescription(''); setPrice('')
    setImageUrl(''); setCategory('general'); setDuration(''); setLessonsCount('')
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary-container" /></div>

  return (
    <div className="min-h-screen px-margin-mobile md:px-margin-desktop pt-6 md:pt-10 pb-nav">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-headline-lg font-bold text-on-surface">My Courses</h1>
          <button onClick={() => { setShowForm(!showForm); if (!showForm) resetForm() }}
            className="flex items-center gap-2 px-4 py-2 bg-primary-container text-on-primary-container rounded-xl font-label-md">
            <Icon name="add" /> New Course
          </button>
        </div>

        {showForm && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-surface-container rounded-2xl p-6 mb-8">
            <h2 className="font-label-lg mb-4 text-on-surface">{editId ? 'Edit Course' : 'New Course'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Course title" className="bg-surface px-4 py-3 rounded-xl text-on-surface placeholder-on-surface-variant/50 border border-outline/20 focus:outline-none focus:border-primary-container/50" />
              <input value={price} onChange={e => setPrice(e.target.value)} type="number" placeholder="Price — 0 for free" className="bg-surface px-4 py-3 rounded-xl text-on-surface placeholder-on-surface-variant/50 border border-outline/20 focus:outline-none focus:border-primary-container/50" />
              <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="Image URL" className="bg-surface px-4 py-3 rounded-xl text-on-surface placeholder-on-surface-variant/50 border border-outline/20 focus:outline-none focus:border-primary-container/50" />
              <select value={category} onChange={e => setCategory(e.target.value)} className="bg-surface px-4 py-3 rounded-xl text-on-surface border border-outline/20 focus:outline-none focus:border-primary-container/50">
                <option value="general">General</option>
                <option value="Cinematography">Cinematography</option>
                <option value="Sound">Sound</option>
                <option value="Writing">Writing</option>
                <option value="Post-Production">Post-Production</option>
                <option value="Directing">Directing</option>
                <option value="Design">Design</option>
                <option value="Acting">Acting</option>
              </select>
              <input value={duration} onChange={e => setDuration(e.target.value)} placeholder="Duration (e.g. 4h 30m)" className="bg-surface px-4 py-3 rounded-xl text-on-surface placeholder-on-surface-variant/50 border border-outline/20 focus:outline-none focus:border-primary-container/50" />
              <input value={lessonsCount} onChange={e => setLessonsCount(e.target.value)} type="number" placeholder="Number of lessons" className="bg-surface px-4 py-3 rounded-xl text-on-surface placeholder-on-surface-variant/50 border border-outline/20 focus:outline-none focus:border-primary-container/50" />
            </div>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" rows={3} className="w-full bg-surface px-4 py-3 rounded-xl text-on-surface placeholder-on-surface-variant/50 border border-outline/20 focus:outline-none focus:border-primary-container/50 mb-4" />
            <div className="flex gap-3">
              <button onClick={handleSubmit} className="px-6 py-2.5 bg-primary-container text-on-primary-container rounded-xl font-label-md">{editId ? 'Update' : 'Create'}</button>
              <button onClick={resetForm} className="px-6 py-2.5 bg-outline/10 text-on-surface rounded-xl font-label-md">Cancel</button>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map(c => (
            <div key={c.id} className={`bg-surface-container rounded-2xl overflow-hidden ${!c.active ? 'opacity-50' : ''}`}>
              <div className="aspect-video bg-surface flex items-center justify-center">
                {c.image_url ? <img src={c.image_url} className="w-full h-full object-cover" /> : <Icon name="school" className="text-4xl text-on-surface-variant/30" />}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-label-md text-on-surface">{c.title}</h3>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => handleEdit(c)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-outline/10" aria-label="Edit"><Icon name="edit" className="text-sm text-on-surface-variant" /></button>
                    <button onClick={() => handleToggle(c)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-outline/10" aria-label="Toggle"><Icon name={c.active ? 'visibility' : 'visibility_off'} className="text-sm text-on-surface-variant" /></button>
                  </div>
                </div>
                <p className="text-label-sm text-primary-container font-bold mt-1">
                  {parseFloat(c.price) > 0 ? formatCurrency(parseFloat(c.price)) : 'Free'}
                </p>
                <div className="flex items-center gap-3 text-label-xs text-on-surface-variant mt-2">
                  <span>{c.lessons_count} lessons</span>
                  <span>{c.duration}</span>
                  <span>{c.students_count} students</span>
                </div>
                <p className="text-label-xs text-on-surface-variant mt-1">{c.category}</p>
              </div>
            </div>
          ))}
          {courses.length === 0 && (
            <div className="col-span-full text-center py-12">
              <Icon name="school" className="text-4xl text-on-surface-variant/30 mb-3" />
              <p className="text-body-md text-on-surface-variant">No courses yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
