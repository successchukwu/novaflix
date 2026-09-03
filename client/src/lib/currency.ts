import { API_BASE } from './config'

const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: '₦',
  USD: '$',
  EUR: '€',
  GBP: '£',
  GHS: '₵',
  KES: 'KSh',
  ZAR: 'R',
  CAD: 'C$',
  AUD: 'A$',
  JPY: '¥',
  CNY: '¥',
  INR: '₹',
  BRL: 'R$',
  ZMW: 'ZK',
  UGX: 'USh',
  TZS: 'TSh',
  RWF: 'RF',
  XOF: 'CFA',
  XAF: 'FCFA',
  EGP: 'E£',
  MAD: 'MAD',
  NGN: '₦',
}

let cachedCurrency: string | null = null
let currencyPromise: Promise<string> | null = null

export async function getCurrency(): Promise<string> {
  if (cachedCurrency) return cachedCurrency
  if (currencyPromise) return currencyPromise

  currencyPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/payment/settings`)
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.currency) {
          cachedCurrency = data.currency
          return cachedCurrency
        }
      }
    } catch {}
    cachedCurrency = 'NGN'
    return cachedCurrency
  })()

  return currencyPromise
}

export function clearCurrencyCache() {
  cachedCurrency = null
  currencyPromise = null
}

export function getCurrencySymbol(currency?: string): string {
  const code = currency || cachedCurrency || 'NGN'
  return CURRENCY_SYMBOLS[code] || code
}

export function formatCurrency(amount: number, currency?: string, options?: Intl.NumberFormatOptions): string {
  const code = currency || cachedCurrency || 'NGN'
  const symbol = CURRENCY_SYMBOLS[code] || code
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      ...options,
    }).format(amount)
  } catch {
    return `${symbol}${amount.toLocaleString()}`
  }
}

export function formatCurrencyCompact(amount: number, currency?: string): string {
  const code = currency || cachedCurrency || 'NGN'
  const symbol = CURRENCY_SYMBOLS[code] || code
  if (amount >= 1_000_000) return `${symbol}${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `${symbol}${(amount / 1_000).toFixed(1)}K`
  return `${symbol}${amount.toLocaleString()}`
}