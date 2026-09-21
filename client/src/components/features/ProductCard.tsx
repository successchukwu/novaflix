import { Link } from 'react-router-dom'
import Icon from '../ui/Icon'

interface ProductCardProps {
  product: {
    id: string
    name: string
    description: string
    price: number
    currency: string
    image_url: string | null
    product_type: 'physical' | 'digital'
  }
}

export default function ProductCard({ product }: ProductCardProps) {
  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', minimumFractionDigits: 0 }).format(price)
  }

  return (
    <Link to={`/store/product/${product.id}`} className="group block">
      <div className="aspect-square bg-surface-container-high rounded-xl overflow-hidden relative mb-3">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-surface-container">
            <Icon name="shopping_bag" className="w-12 h-12 text-on-surface-variant/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
        <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-primary-container text-on-primary-container text-[10px] font-medium capitalize">
          {product.product_type}
        </span>
      </div>
      <p className="text-sm font-medium text-on-surface line-clamp-1">{product.name}</p>
      <p className="text-sm font-bold text-primary-container mt-1">{formatPrice(product.price, product.currency)}</p>
    </Link>
  )
}