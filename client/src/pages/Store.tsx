import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Icon from '../components/ui/Icon'
import { getProducts, getToken, checkoutStore, verifyStoreOrder, getMyOrders } from '../lib/auth'
import { formatCurrency } from '../lib/currency'

export default function Store() {
  const [products, setProducts] = useState<any[]>([])
  const [categories, setCategories] = useState<string[]>(['All'])
  const [activeCategory, setActiveCategory] = useState('All')
  const [loading, setLoading] = useState(true)
  const [cart, setCart] = useState<Record<string, number>>({})
  const [cartOpen, setCartOpen] = useState(false)
  const [purchasing, setPurchasing] = useState(false)
  const [msg, setMsg] = useState('')
  const [orders, setOrders] = useState<any[]>([])
  const [showOrders, setShowOrders] = useState(false)
  const token = getToken()

  useEffect(() => {
    getProducts().then(r => {
      if (r.success) {
        setProducts(r.products)
        const cats = ['All', ...new Set(r.products.map((p: any) => p.category))] as string[]
        setCategories(cats)
      }
      setLoading(false)
    })
    if (token) {
      getMyOrders(token).then(r => { if (r.success) setOrders(r.orders) })
    }
  }, [token])

  // Check pending order verification
  useEffect(() => {
    const ref = localStorage.getItem('pendingStoreRef')
    if (ref && token) {
      localStorage.removeItem('pendingStoreRef')
      verifyStoreOrder(token, ref).then(r => {
        if (r.success) setMsg('Order placed successfully!')
        else setMsg(r.error || 'Verification failed')
      })
    }
  }, [token])

  const filtered = activeCategory === 'All' ? products : products.filter((p: any) => p.category === activeCategory)

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0)
  const cartTotal = Object.entries(cart).reduce((sum, [id, qty]) => {
    const p = products.find(p => p.id === id)
    return sum + (p ? parseFloat(p.price) * qty : 0)
  }, 0)

  const handleCheckout = async () => {
    if (!token) return
    setPurchasing(true)
    const items = Object.entries(cart).map(([productId, quantity]) => ({ productId, quantity }))
    const res = await checkoutStore(token, items)
    if (res.success && res.free) {
      setMsg('Order placed! (Free items)')
      setCart({})
    } else if (res.success && res.authorization_url) {
      localStorage.setItem('pendingStoreRef', res.reference)
      window.location.href = res.authorization_url
    } else {
      setMsg(res.error || 'Checkout failed')
    }
    setPurchasing(false)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary-container" /></div>

  return (
    <div className="min-h-screen px-margin-mobile md:px-margin-desktop pt-6 md:pt-10 pb-nav">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <Icon name="storefront" className="w-8 h-8 text-primary-container" />
            <h1 className="text-headline-lg font-bold">Merch Store</h1>
          </div>
          <div className="flex items-center gap-3">
            {token && <button onClick={() => setShowOrders(!showOrders)} className="flex items-center gap-1 text-label-sm text-on-surface-variant hover:text-on-surface"><Icon name="receipt" />Orders</button>}
            <button onClick={() => setCartOpen(!cartOpen)} className="relative flex items-center gap-1 px-3 py-2 bg-surface-container rounded-xl text-label-md">
              <Icon name="shopping_cart" />
              {cartCount > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary-container text-on-primary-container text-[10px] rounded-full flex items-center justify-center font-bold">{cartCount}</span>}
              Cart
            </button>
          </div>
        </div>
        <p className="text-on-surface-variant/60 text-sm mb-6">Wear your love for cinema</p>

        <div className="flex flex-wrap gap-2 mb-8">
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeCategory === cat ? 'bg-primary-container text-on-primary-container' : 'bg-surface-variant/20 border border-outline/20 text-on-surface-variant hover:text-on-surface'}`}>
              {cat}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-gutter">
          {filtered.map((product: any, i: number) => {
            const inCart = (cart[product.id] || 0) > 0
            return (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="group bg-surface-container-high border border-white/5 rounded-xl overflow-hidden hover:border-primary-container/30 transition-colors"
              >
                <div className="aspect-square bg-gradient-to-br from-surface-container to-surface-container-high flex items-center justify-center overflow-hidden">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.title} className="w-full h-full object-cover" />
                  ) : (
                    <Icon name="checkroom" className="w-16 h-16 text-on-surface-variant/40 group-hover:text-primary-container/50 transition-colors" />
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-label-md text-label-md text-on-surface truncate">{product.title}</h3>
                    {product.popular && <span className="shrink-0 text-[10px] bg-accent/20 text-accent px-2 py-0.5 rounded-full font-medium">Popular</span>}
                  </div>
                  <p className="text-on-surface-variant/60 text-sm mt-1">{product.category}</p>
                  {product.creator_name && <p className="text-on-surface-variant/40 text-xs">by {product.creator_name}</p>}
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-lg font-bold text-primary-container">{formatCurrency(parseFloat(product.price))}</span>
                  </div>
                  <button
                    onClick={() => {
                      if (inCart) {
                        setCart(prev => { const c = { ...prev }; delete c[product.id]; return c })
                      } else {
                        setCart(prev => ({ ...prev, [product.id]: 1 }))
                      }
                    }}
                    className={`w-full mt-3 py-2 rounded-xl font-label-sm transition-colors ${inCart ? 'bg-outline/20 text-on-surface' : 'bg-primary-container text-on-primary-container'}`}
                  >
                    {inCart ? 'Remove' : 'Add to Cart'}
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>

        {products.length === 0 && (
          <div className="text-center py-16">
            <Icon name="storefront" className="text-5xl text-on-surface-variant/20 mb-4" />
            <p className="text-body-lg text-on-surface-variant">No products available yet</p>
          </div>
        )}

        {/* Cart panel */}
        {cartOpen && (
          <motion.div initial={{ opacity: 0, x: 300 }} animate={{ opacity: 1, x: 0 }} className="fixed right-0 top-0 h-full w-full max-w-md bg-surface-container-lowest border-l border-white/5 z-50 shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="font-label-lg text-on-surface">Cart ({cartCount})</h2>
              <button onClick={() => setCartOpen(false)} className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-outline/10" aria-label="Close cart"><Icon name="close" /></button>
            </div>
            <div className="p-6 flex-1 overflow-auto" style={{ height: 'calc(100% - 140px)' }}>
              {Object.entries(cart).length === 0 ? (
                <div className="text-center py-12">
                  <Icon name="shopping_cart" className="text-4xl text-on-surface-variant/20 mb-3" />
                  <p className="text-body-md text-on-surface-variant">Your cart is empty</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(cart).map(([id, qty]) => {
                    const p = products.find(p => p.id === id)
                    if (!p) return null
                    return (
                      <div key={id} className="flex items-center gap-4 bg-surface-container rounded-xl p-3">
                        <div className="w-16 h-16 rounded-lg bg-surface flex items-center justify-center overflow-hidden shrink-0">
                          {p.image_url ? <img src={p.image_url} className="w-full h-full object-cover" /> : <Icon name="checkroom" className="text-2xl text-on-surface-variant/40" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-label-md text-on-surface truncate">{p.title}</p>
                          <p className="text-label-sm text-on-surface-variant">{formatCurrency(parseFloat(p.price))} × {qty}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setCart(prev => ({ ...prev, [id]: Math.max(0, prev[id] - 1) }))} className="w-8 h-8 flex items-center justify-center rounded-lg bg-outline/10 text-on-surface-variant" aria-label="Decrease quantity"><Icon name="remove" /></button>
                          <span className="w-8 text-center text-label-md text-on-surface">{qty}</span>
                          <button onClick={() => setCart(prev => ({ ...prev, [id]: prev[id] + 1 }))} className="w-8 h-8 flex items-center justify-center rounded-lg bg-outline/10 text-on-surface-variant" aria-label="Increase quantity"><Icon name="add" /></button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            {cartCount > 0 && (
              <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-white/5 bg-surface-container-lowest">
                <div className="flex items-center justify-between mb-4">
                  <span className="font-label-lg text-on-surface">Total</span>
                  <span className="text-headline-sm font-bold text-primary-container">{formatCurrency(cartTotal)}</span>
                </div>
                <button onClick={handleCheckout} disabled={purchasing} className="w-full py-3 bg-primary-container text-on-primary-container rounded-xl font-label-md disabled:opacity-50">
                  {purchasing ? 'Processing...' : 'Checkout'}
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* Orders panel */}
        {showOrders && (
          <motion.div initial={{ opacity: 0, x: 300 }} animate={{ opacity: 1, x: 0 }} className="fixed right-0 top-0 h-full w-full max-w-md bg-surface-container-lowest border-l border-white/5 z-50 shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="font-label-lg text-on-surface">My Orders</h2>
              <button onClick={() => setShowOrders(false)} className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-outline/10" aria-label="Close orders"><Icon name="close" /></button>
            </div>
            <div className="p-6 overflow-auto" style={{ height: 'calc(100% - 80px)' }}>
              {orders.length === 0 ? (
                <div className="text-center py-12">
                  <Icon name="receipt" className="text-4xl text-on-surface-variant/20 mb-3" />
                  <p className="text-body-md text-on-surface-variant">No orders yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.map((o: any) => (
                    <div key={o.id} className="bg-surface-container rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-label-xs px-2 py-0.5 rounded-full ${o.status === 'paid' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{o.status}</span>
                        <span className="text-label-sm text-on-surface-variant">{formatCurrency(parseFloat(o.total))}</span>
                      </div>
                      <p className="text-label-xs text-on-surface-variant">{new Date(o.created_at).toLocaleDateString()}</p>
                      {o.items && o.items.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {o.items.map((item: any) => (
                            <p key={item.product_id} className="text-label-sm text-on-surface-variant">{item.title || 'Product'} × {item.quantity}</p>
                          ))}
                        </div>
                      )}
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
