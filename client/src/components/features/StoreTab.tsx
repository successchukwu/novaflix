import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getCreatorProducts, type CreatorProduct } from '../../lib/api'
import ProductCard from './ProductCard'

export default function StoreTab() {
  const { id } = useParams<{ id: string }>()
  const [products, setProducts] = useState<CreatorProduct[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    const loadProducts = async () => {
      try {
        setLoading(true)
        const res = await getCreatorProducts(id)
        if (res.success) {
          setProducts(res.products || [])
        }
      } catch (err) {
        console.error('Failed to load products:', err)
      } finally {
        setLoading(false)
      }
    }
    loadProducts()
  }, [id])

  if (loading) {
    return (
      <div className="px-4 md:px-6 pb-8 animate-pulse space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="aspect-square bg-white/5 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="px-4 md:px-6 pb-8 text-center py-16">
        <svg className="w-16 h-16 text-on-surface-variant/30 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
        <p className="text-on-surface-variant/60 text-sm">No products in store yet</p>
      </div>
    )
  }

  return (
    <div className="px-4 md:px-6 pb-8">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  )
}