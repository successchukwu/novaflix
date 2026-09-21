import { useRef, useState } from 'react'
import Icon from '../ui/Icon'
import type { CastMember, CrewMember } from '../../lib/api'
import { Link } from 'react-router-dom'

const IMG_BASE = 'https://image.tmdb.org/t/p/w185'

type Person = { id: number | string; name: string; profile_path: string | null; detail: string; linked?: boolean; userId?: string }

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase()
}

function PersonCard({ person }: { person: Person }) {
  const isLinked = person.linked
  const profileUrl = isLinked && person.userId ? `/profile/${person.userId}` : null

  return (
    <div className="flex-shrink-0 w-[116px] snap-start">
      <div className="relative">
        {person.profile_path ? (
          <div className="w-full aspect-square overflow-hidden rounded-full bg-surface-container-high border border-white/5 mb-3">
            <img
              src={`${IMG_BASE}${person.profile_path}`}
              alt={person.name}
              loading="lazy"
              className="w-full h-full object-cover"
              onError={(e) => { (e.currentTarget.parentElement as HTMLElement).classList.add('hidden') }}
            />
          </div>
        ) : (
          <div className="w-full aspect-square rounded-full bg-surface-container-high border border-white/5 mb-3 flex flex-col items-center justify-center gap-1 text-on-surface-variant/70">
            <Icon name="person" className="text-3xl" />
            <span className="text-xs font-bold tracking-wide text-on-surface-variant">{initials(person.name)}</span>
          </div>
        )}
        {isLinked && (
          <span className="absolute top-1 right-1 bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
            <Icon name="verified" size="sm" className="inline" /> Creator
          </span>
        )}
      </div>
      {profileUrl ? (
        <Link to={profileUrl} className="block">
          <p className="text-sm font-semibold text-on-surface leading-tight text-center truncate" title={person.name}>
            {person.name}
          </p>
          <p className="text-xs text-on-surface-variant/80 leading-tight text-center truncate mt-0.5" title={person.detail}>
            {person.detail}
          </p>
        </Link>
      ) : (
        <>
          <p className="text-sm font-semibold text-on-surface leading-tight text-center truncate" title={person.name}>
            {person.name}
          </p>
          <p className="text-xs text-on-surface-variant/80 leading-tight text-center truncate mt-0.5" title={person.detail}>
            {person.detail}
          </p>
        </>
      )}
    </div>
  )
}

interface CastCrewProps {
  cast: CastMember[]
  crew: CrewMember[]
  linkedCreators?: Record<number, string>
}

export default function CastCrew({ cast, crew, linkedCreators = {} }: CastCrewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showLeft, setShowLeft] = useState(false)
  const [showRight, setShowRight] = useState(true)

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return
    const amount = scrollRef.current.clientWidth * 0.75
    scrollRef.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' })
  }

  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
    setShowLeft(scrollLeft > 10)
    setShowRight(scrollLeft < scrollWidth - clientWidth - 10)
  }

  const people = [
    ...cast.map((c) => ({ id: c.id, name: c.name, profile_path: c.profile_path, detail: c.character, linked: !!linkedCreators[c.id], userId: linkedCreators[c.id] })),
    ...crew.map((c) => ({ id: `c-${c.id}-${c.job}`, name: c.name, profile_path: c.profile_path, detail: c.job, linked: false })),
  ]

  if (people.length === 0) return null

  return (
    <div className="pt-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-headline-md">Cast & Crew</h3>
        <div className="flex items-center gap-2">
          {showLeft && (
            <button
              onClick={() => scroll('left')}
              aria-label="Scroll left"
              className="p-1.5 rounded-full bg-white/5 border border-white/10 text-on-surface hover:bg-white/10 transition-colors"
            >
              <Icon name="chevron_left" className="text-lg" />
            </button>
          )}
          {showRight && (
            <button
              onClick={() => scroll('right')}
              aria-label="Scroll right"
              className="p-1.5 rounded-full bg-white/5 border border-white/10 text-on-surface hover:bg-white/10 transition-colors"
            >
              <Icon name="chevron_right" className="text-lg" />
            </button>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-4 overflow-x-auto scrollbar-none pb-2 snap-x"
      >
        {people.map((p) => (
          <PersonCard key={p.id} person={p} />
        ))}
      </div>
    </div>
  )
}