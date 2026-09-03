import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Icon from '../components/ui/Icon'
import { getToken, getMyProducts, createProduct, updateProduct } from '../lib/auth'
import { formatCurrency } from '../lib/currency'

export default function CreatorProducts() {
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [category, setCategory] = useState('general')

  useEffect(() => {
    const token = getToken()
    if (!token) { setLoading(false); return }
    getMyProducts(token).then(r => { if (r.success) setProducts(r.products); setLoading(false) })
  }, [])

  const handleSubmit = async () => {
    const token = getToken()
    if (!token || !title || !price) return
    const data = { title, description, price: parseFloat(price), imageUrl, category }
    if (editId) await updateProduct(token, editId, data)
    else await createProduct(token, data)
    resetForm()
    const r = await getMyProducts(token)
    if (r.success) setProducts(r.products)
  }

  const handleEdit = (p: any) => {
    setEditId(p.id); setTitle(p.title); setDescription(p.description || '')
    setPrice(String(p.price)); setImageUrl(p.image_url || ''); setCategory(p.category || 'general'); setShowForm(true)
  }

  const handleToggle = async (p: any) => {
    const token = getToken()
    if (!token) return
    await updateProduct(token, p.id, { active: !p.active })
    const r = await getMyProducts(token)
    if (r.success) setProducts(r.products)
  }

  const resetForm = () => {
    setShowForm(false); setEditId(null); setTitle(''); setDescription(''); setPrice(''); setImageUrl(''); setCategory('general')
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary-container" /></div>

  return (
    <div className="min-h-screen px-margin-mobile md:px-margin-desktop pt-6 md:pt-10 pb-nav">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-headline-lg font-bold text-on-surface">My Products</h1>
          <button onClick={() => { setShowForm(!showForm); if (!showForm) resetForm() }}
            className="flex items-center gap-2 px-4 py-2 bg-primary-container text-on-primary-container rounded-xl font-label-md">
            <Icon name="add" /> New Product
          </button>
        </div>

        {showForm && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-surface-container rounded-2xl p-6 mb-8">
            <h2 className="font-label-lg mb-4 text-on-surface">{editId ? 'Edit Product' : 'New Product'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Product title" className="bg-surface px-4 py-3 rounded-xl text-on-surface placeholder-on-surface-variant/50 border border-outline/20 focus:outline-none focus:border-primary-container/50" />
              <input value={price} onChange={e => setPrice(e.target.value)} type="number" placeholder="Price" className="bg-surface px-4 py-3 rounded-xl text-on-surface placeholder-on-surface-variant/50 border border-outline/20 focus:outline-none focus:border-primary-container/50" />
              <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="Image URL" className="bg-surface px-4 py-3 rounded-xl text-on-surface placeholder-on-surface-variant/50 border border-outline/20 focus:outline-none focus:border-primary-container/50" />
              <select value={category} onChange={e => setCategory(e.target.value)} className="bg-surface px-4 py-3 rounded-xl text-on-surface border border-outline/20 focus:outline-none focus:border-primary-container/50">
                <option value="general">General</option>
                <option value="T-Shirts">T-Shirts</option>
                <option value="Posters">Posters</option>
                <option value="Mugs">Mugs</option>
                <option value="Caps">Caps</option>
                <option value="Hoodies">Hoodies</option>
              </select>
            </div>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" rows={3} className="w-full bg-surface px-4 py-3 rounded-xl text-on-surface placeholder-on-surface-variant/50 border border-outline/20 focus:outline-none focus:border-primary-container/50 mb-4" />
            <div className="flex gap-3">
              <button onClick={handleSubmit} className="px-6 py-2.5 bg-primary-container text-on-primary-container rounded-xl font-label-md">{editId ? 'Update' : 'Create'}</button>
              <button onClick={resetForm} className="px-6 py-2.5 bg-outline/10 text-on-surface rounded-xl font-label-md">Cancel</button>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {products.map(p => (
            <div key={p.id} className={`bg-surface-container rounded-2xl overflow-hidden ${!p.active ? 'opacity-50' : ''}`}>
              <div className="aspect-square bg-surface flex items-center justify-center">
                {p.image_url ? <img src={p.image_url} className="w-full h-full object-cover" /> : <Icon name="inventory_2" className="text-4xl text-on-surface-variant/30" />}
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between gap-1">
                  <h3 className="font-label-md text-on-surface truncate">{p.title}</h3>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => handleEdit(p)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-outline/10" aria-label="Edit"><Icon name="edit" className="text-sm text-on-surface-variant" /></button>
                    <button onClick={() => handleToggle(p)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-outline/10" aria-label="Toggle"><Icon name={p.active ? 'visibility' : 'visibility_off'} className="text-sm text-on-surface-variant" /></button>
                  </div>
                </div>
                <p className="text-label-sm text-primary-container font-bold mt-1">{formatCurrency(parseFloat(p.price))}</p>
                <p className="text-label-xs text-on-surface-variant">{p.category}</p>
              </div>
            </div>
          ))}
          {products.length === 0 && (
            <div className="col-span-full text-center py-12">
              <Icon name="inventory_2" className="text-4xl text-on-surface-variant/30 mb-3" />
              <p className="text-body-md text-on-surface-variant">No products yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
