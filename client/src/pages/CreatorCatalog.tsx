import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Icon from '../components/ui/Icon'
import Skeleton from '../components/ui/Skeleton'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'
import { getToken, getCreatorUploads, updateCreatorUpload, deleteCreatorUpload } from '../lib/auth'
import { subscribeCreator } from '../lib/creatorLive'
import PromoteContentModal from '../components/features/PromoteContentModal'

const NAV = [
  { path: '/creator', label: 'Dashboard', icon: 'dashboard' },
  { path: '/creator/analytics', label: 'Analytics', icon: 'monitoring' },
  { path: '/creator/catalog', label: 'Catalog', icon: 'movie' },
  { path: '/creator/wallet', label: 'Wallet', icon: 'account_balance_wallet' },
  { path: '/creator/ppm', label: 'PPM', icon: 'tune' },
  { path: '/creator/onboarding', label: 'Onboarding', icon: 'rocket_launch' },
  { path: '/creator/go-live', label: 'Go Live', icon: 'podcasts' },
]

export default function CreatorCatalog() {
  const nav = useNavigate()
  const loc = useLocation()
  const toast = useToast()
  const [uploads, setUploads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<any>(null)
  const [editForm, setEditForm] = useState({ title: '', description: '', genre: '' })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [promoteContent, setPromoteContent] = useState<any>(null)

  const load = async () => {
    const token = getToken()
    if (!token) return
    const r = await getCreatorUploads(token)
    if (r.success) setUploads(r.uploads || r.items || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return subscribeCreator('content', (msg) => {
      if (msg.action === 'deleted') {
        setUploads(prev => prev.filter(u => u.id !== msg.id))
      } else if (msg.action === 'ppm-updated') {
        // ignore, not content list related
      }
    })
  }, [])

  const filtered = uploads.filter(u => {
    const q = query.toLowerCase()
    const matchQ = !q || (u.title || '').toLowerCase().includes(q) || (u.genre || '').toLowerCase().includes(q)
    const matchStatus = statusFilter === 'all' || u.status === statusFilter || u.visibility === statusFilter
    return matchQ && matchStatus
  })

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (filtered.length > 0 && filtered.every(u => selected.has(u.id))) setSelected(new Set())
    else setSelected(new Set(filtered.map(u => u.id)))
  }

  const openEdit = (u: any) => {
    setEditing(u)
    setEditForm({ title: u.title || '', description: u.description || '', genre: u.genre || '' })
  }

  const saveEdit = async () => {
    const token = getToken()
    if (!token || !editing) return
    setSaving(true)
    const r = await updateCreatorUpload(token, editing.id, editForm)
    setSaving(false)
    if (r.success) { toast.success('Content updated'); setEditing(null); load() }
    else toast.error(r.error || 'Failed to update')
  }

  const handleDelete = async () => {
    const token = getToken()
    if (!token) return
    const ids = deleting ? [deleting] : [...selected]
    let ok = true
    for (const id of ids) {
      const r = await deleteCreatorUpload(token, id)
      if (!r.success) ok = false
    }
    if (ok) toast.success(ids.length === 1 ? 'Content deleted' : `${ids.length} items deleted`)
    else toast.error('Some items could not be deleted')
    setDeleting(null)
    setSelected(new Set())
    load()
  }

  const totalViews = uploads.reduce((a, u) => a + Number(u.views || 0), 0)
  const totalMinutes = uploads.reduce((a, u) => a + Number(u.minutes_watched || 0), 0)

  return (
    <div className="min-h-screen px-margin-mobile md:px-margin-desktop pt-6 md:pt-10 pb-nav">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Icon name="video_library" className="w-7 h-7 text-primary-container" />
            <div>
              <h1 className="text-headline-md font-bold">Content Catalog</h1>
              <p className="text-on-surface-variant/60 text-xs mt-0.5">Manage all your films and performance</p>
            </div>
          </div>
          <button onClick={() => nav('/upload')} className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl bg-primary-container text-on-primary-container hover:opacity-90 transition-opacity">
            <Icon name="add" size="sm" /> Upload new
          </button>
        </div>

        <nav className="flex gap-1 overflow-x-auto mb-6 pb-1">
          {NAV.map(n => (
            <button key={n.path} onClick={() => nav(n.path)} className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl whitespace-nowrap transition-colors ${loc.pathname === n.path ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:text-on-surface hover:bg-white/5'}`}>
              <Icon name={n.icon as any} size="sm" /> {n.label}
            </button>
          ))}
        </nav>

        <div className="grid grid-cols-3 gap-gutter mb-6">
          <div className="bg-surface-container-high border border-white/5 rounded-xl p-4">
            <p className="text-xs text-on-surface-variant">Total items</p>
            <p className="text-2xl font-bold text-on-surface">{uploads.length}</p>
          </div>
          <div className="bg-surface-container-high border border-white/5 rounded-xl p-4">
            <p className="text-xs text-on-surface-variant">Total views</p>
            <p className="text-2xl font-bold text-on-surface">{totalViews.toLocaleString()}</p>
          </div>
          <div className="bg-surface-container-high border border-white/5 rounded-xl p-4">
            <p className="text-xs text-on-surface-variant">Watch (hrs)</p>
            <p className="text-2xl font-bold text-on-surface">{Math.round(totalMinutes / 60).toLocaleString()}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-[180px]">
            <Icon name="search" size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your catalog…"
              className="w-full bg-surface-variant/20 border border-outline/30 rounded-xl pl-9 pr-4 py-2.5 text-sm placeholder-on-surface-variant/50 focus:outline-none focus:border-primary-container"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-surface-variant/20 border border-outline/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary-container"
          >
            <option value="all">All statuses</option>
            <option value="published">Published</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="failed">Failed</option>
          </select>
          {selected.size > 0 && (
            <button onClick={handleDelete} className="flex items-center gap-1.5 px-4 py-2.5 text-sm rounded-xl bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors">
              <Icon name="delete" size="sm" /> Delete ({selected.size})
            </button>
          )}
        </div>

        <div className="bg-surface-container-high border border-white/5 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-5 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} variant="text" className="h-10" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-14">
              <Icon name="video_library" className="w-10 h-10 text-on-surface-variant/40 mx-auto mb-3" />
              <p className="text-sm text-on-surface-variant">No content found</p>
              {uploads.length === 0 && <p className="text-xs text-on-surface-variant/60 mt-1">Upload your first film to get started</p>}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-on-surface-variant/60 text-xs border-b border-white/5">
                  <th className="py-3 pl-4 w-8"><input type="checkbox" checked={filtered.length > 0 && filtered.every(u => selected.has(u.id))} onChange={toggleAll} className="accent-primary" /></th>
                  <th className="py-3 pr-4 font-medium">Title</th>
                  <th className="py-3 pr-4 font-medium">Genre</th>
                  <th className="py-3 pr-4 font-medium text-right">Views</th>
                  <th className="py-3 pr-4 font-medium text-right">Revenue</th>
                  <th className="py-3 pr-4 font-medium">Status</th>
                  <th className="py-3 pr-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                    <td className="py-3 pl-4"><input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleSelect(u.id)} className="accent-primary" /></td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        {u.thumbnail_url ? <img src={u.thumbnail_url} alt="" className="w-10 h-14 object-cover rounded-lg shrink-0" /> : <div className="w-10 h-14 rounded-lg bg-white/10 flex items-center justify-center shrink-0"><Icon name="movie" size="sm" className="text-on-surface-variant/50" /></div>}
                        <div className="min-w-0">
                          <p className="text-on-surface truncate">{u.title || 'Untitled'}</p>
                          <p className="text-xs text-on-surface-variant/60 truncate">{u.description || 'No description'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-on-surface-variant capitalize">{u.genre || '—'}</td>
                    <td className="py-3 pr-4 text-right">{Number(u.views || 0).toLocaleString()}</td>
                    <td className="py-3 pr-4 text-right">${parseFloat(u.revenue || 0).toFixed(2)}</td>
                    <td className="py-3 pr-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${(u.status === 'published' || u.visibility === 'public') ? 'bg-primary-container/10 text-primary-container' : 'bg-white/10 text-on-surface-variant'}`}>
                        {u.visibility || u.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setPromoteContent(u)} title="Promote this video" className="p-2 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 transition-colors"><Icon name="campaign" size="sm" /></button>
                        <button onClick={() => openEdit(u)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs transition-colors"><Icon name="edit" size="sm" /> Edit</button>
                        <button onClick={() => setDeleting(u.id)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-white/10 text-xs transition-colors"><Icon name="delete" size="sm" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Edit Content">
        {editing && (
          <div className="space-y-4">
            <div>
              <label className="text-on-surface-variant text-sm mb-1.5 block">Title</label>
              <Input value={editForm.title} onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))} placeholder="Movie title" />
            </div>
            <div>
              <label className="text-on-surface-variant text-sm mb-1.5 block">Genre</label>
              <select value={editForm.genre} onChange={(e) => setEditForm(f => ({ ...f, genre: e.target.value }))} className="w-full bg-surface-variant/20 border border-outline/30 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary-container">
                <option value="">Select genre</option>
                {['action', 'comedy', 'drama', 'horror', 'sci-fi', 'documentary', 'animation'].map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="text-on-surface-variant text-sm mb-1.5 block">Description</label>
              <textarea value={editForm.description} onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))} rows={4} placeholder="Tell users about this content…" className="w-full bg-surface-variant/20 border border-outline/30 rounded-xl px-4 py-3 text-sm placeholder-on-surface-variant/50 focus:outline-none focus:border-primary-container resize-none" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={saveEdit} loading={saving}>Save changes</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="Delete content?">
        <p className="text-sm text-on-surface-variant mb-6">This action cannot be undone. The selected item will be permanently removed from your catalog.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
          <Button className="bg-red-500/20 text-red-300" onClick={handleDelete}>Delete</Button>
        </div>
      </Modal>

      <PromoteContentModal open={!!promoteContent} onClose={()=>setPromoteContent(null)} content={promoteContent} onCreated={()=>{ setPromoteContent(null); toast.success('Promotion submitted — awaiting admin approval') }} />
    </div>
  )
}
