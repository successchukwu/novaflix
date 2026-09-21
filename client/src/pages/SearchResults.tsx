import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import Icon from '../components/ui/Icon'
import { searchAll, searchPerson, getPersonCredits, searchCreators, searchCategories, type Creator, type Category } from '../lib/api'
import type { Person, PersonCredit } from '../lib/api'
import { API_BASE } from '../lib/config'
import { useAuth } from '../lib/AuthContext'
import HoverCard from '../components/features/HoverCard'
import RecommendationGrid from '../components/features/RecommendationGrid'
import Skeleton from '../components/ui/Skeleton'
import type { MediaItem } from '../types'
import Button from '../components/ui/Button'

interface FilterChip {
  id: string
  label: string
  icon: string
  count: number
  active: boolean
}

const initialChips: FilterChip[] = [
  { id: 'all', label: 'All', icon: 'apps', count: 0, active: true },
  { id: 'movie', label: 'Movies', icon: 'movie', count: 0, active: false },
  { id: 'tv', label: 'TV Shows', icon: 'live_tv', count: 0, active: false },
  { id: 'people', label: 'People', icon: 'person', count: 0, active: false },
  { id: 'creators', label: 'Creators', icon: 'person_add', count: 0, active: false },
  { id: 'categories', label: 'Categories', icon: 'category', count: 0, active: false },
  { id: 'creator', label: 'Creator Content', icon: 'video_library', count: 0, active: false },
]

export default function SearchResults() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const query = searchParams.get('q') || ''
  const typeParam = searchParams.get('type') || 'all'
  const [results, setResults] = useState<MediaItem[]>([])
  const [peopleResults, setPeopleResults] = useState<Person[]>([])
  const [creatorResults, setCreatorResults] = useState<Creator[]>([])
  const [categoryResults, setCategoryResults] = useState<Category[]>([])
  const [selectedPerson, setSelectedPerson] = useState<{ id: number; name: string } | null>(null)
  const [personCredits, setPersonCredits] = useState<{ cast: PersonCredit[]; crew: PersonCredit[] }>({ cast: [], crew: [] })
  const [creditsLoading, setCreditsLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [chips, setChips] = useState<FilterChip[]>(initialChips.map(c => ({ ...c, active: c.id === typeParam })))
  const [recs, setRecs] = useState<MediaItem[]>([])
  const { user } = useAuth()

  // Keep activeTab in sync for backward compat with openPerson/openCreator logic
  const activeTab = chips.find(c => c.active)?.id ?? 'all'
  const setActiveTab = useCallback((id: string) => {
    setChips(prev => prev.map(c => ({ ...c, active: c.id === id })))
  }, [])

  useEffect(() => {
    if (!query) return
    setLoading(true)
    const token = localStorage.getItem('novaflix-token') || ''

    // Parallel prefetch of all facets
    Promise.all([
      searchAll(query),
      searchPerson(query),
      searchCreators(query),
      searchCategories(query),
      user
        ? fetch(`${API_BASE}/recommendations/for-you`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
        : Promise.resolve({ data: [] }),
    ]).then(([searchRes, personRes, creatorRes, categoryRes, recRes]) => {
      if (searchRes.success) setResults(searchRes.data)
      if (personRes.success) setPeopleResults(personRes.data)
      if (creatorRes.success) setCreatorResults(creatorRes.creators)
      if (categoryRes.success) setCategoryResults(categoryRes.categories)
      if (recRes.success) {
        const shuffled = [...(recRes.data || [])].sort(() => Math.random() - 0.5)
        setRecs(shuffled.slice(0, 8))
      }

      // Update chip counts
      setChips(prev => prev.map(c => {
        if (c.id === 'all') return { ...c, count: (searchRes.data?.length ?? 0) + (personRes.data?.length ?? 0) + (creatorRes.creators?.length ?? 0) }
        if (c.id === 'movie') return { ...c, count: searchRes.data?.filter(r => r.type === 'movie' && r.source === 'tmdb').length ?? 0 }
        if (c.id === 'tv') return { ...c, count: searchRes.data?.filter(r => r.type === 'tv' && r.source === 'tmdb').length ?? 0 }
        if (c.id === 'people') return { ...c, count: personRes.data?.length ?? 0 }
        if (c.id === 'creators') return { ...c, count: creatorRes.creators?.length ?? 0 }
        if (c.id === 'categories') return { ...c, count: categoryRes.categories?.length ?? 0 }
        if (c.id === 'creator') return { ...c, count: searchRes.data?.filter(r => r.source === 'creator' || r.source === 'archive').length ?? 0 }
        return c
      }))

      setLoading(false)
    }).catch(() => {
      setLoading(false)
      // Still update counts to 0 on error
      setChips(prev => prev.map(c => ({ ...c, count: 0 })))
    })
  }, [query, user])

  const openPerson = async (person: Person) => {
    setSelectedPerson({ id: person.id, name: person.name })
    setCreditsLoading(true)
    setPersonCredits({ cast: [], crew: [] })
    try {
      const res = await getPersonCredits(String(person.id))
      if (res.success) setPersonCredits({ cast: res.cast || [], crew: res.crew || [] })
    } catch {}
    setCreditsLoading(false)
  }

  const openCreator = (creator: Creator) => {
    navigate(`/creators/${creator.id}`)
  }

  const filtered = activeTab === 'all' ? results : results.filter(r => {
    if (activeTab === 'creator') return r.source === 'creator' || r.source === 'archive'
    return r.type === activeTab && r.source === 'tmdb'
  })

  return (
    <div className="min-h-screen px-margin-mobile md:px-margin-desktop pt-6 md:pt-10 pb-nav">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/search" className="p-2 -ml-2 rounded-xl hover:bg-white/10 transition-colors">
            <Icon name="arrow_back" />
          </Link>
          <div>
            <h1 className="text-headline-md font-bold">Search Results</h1>
            <p className="text-on-surface-variant/60 text-sm mt-1">&ldquo;{query}&rdquo;</p>
          </div>
        </div>

        {/* Spotify-style Filter Chips */}
        <div className="flex flex-wrap gap-2 mb-6" role="tablist" aria-label="Search filters">
          {chips.map(chip => (
            <button
              key={chip.id}
              onClick={() => setActiveTab(chip.id)}
              role="tab"
              aria-selected={chip.active}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                chip.active
                  ? 'bg-primary-container text-on-primary-container shadow-sm'
                  : 'bg-surface-container-high border border-white/5 text-on-surface-variant hover:border-primary/40 hover:text-on-surface'
              }`}
            >
              <Icon name={chip.icon} className="w-4 h-4" />
              {chip.label}
              {chip.count > 0 && (
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-semibold ${
                  chip.active ? 'bg-on-primary-container/20 text-on-primary-container' : 'bg-white/5 text-on-surface-variant'
                }`}>
                  {chip.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {activeTab === 'people' && !selectedPerson ? (
            loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i}>
                    <Skeleton variant="poster" className="w-full" />
                    <Skeleton variant="text" className="w-3/4 mt-2" />
                  </div>
                ))}
              </div>
            ) : peopleResults.length === 0 ? (
              <div className="text-center py-16">
                <Icon name="search" className="w-16 h-16 text-on-surface-variant/40 mx-auto mb-4" />
                <h3 className="font-label-md text-label-md text-on-surface-variant mb-2">No people found</h3>
                <p className="text-on-surface-variant/60">Try a different search term</p>
              </div>
            ) : (
              <>
                <p className="text-on-surface-variant text-sm mb-4">{peopleResults.length} person{peopleResults.length !== 1 ? 's' : ''}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-6">
                  {peopleResults.map((person) => (
                    <button key={person.id} onClick={() => openPerson(person)} className="group text-left">
                      {person.profile_path ? (
                        <img src={person.profile_path} alt={person.name} className="w-full aspect-[2/3] rounded-xl object-cover bg-surface-container group-hover:opacity-90 transition-opacity" loading="lazy" />
                      ) : (
                        <div className="w-full aspect-[2/3] rounded-xl bg-surface-container flex items-center justify-center">
                          <Icon name="person" className="text-on-surface-variant/40" />
                        </div>
                      )}
                      <p className="mt-2 text-sm text-on-surface truncate group-hover:text-primary transition-colors">{person.name}</p>
                      {person.known_for_department && (
                        <p className="text-xs text-on-surface-variant truncate">{person.known_for_department}</p>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )
          ) : activeTab === 'creators' ? (
            loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i}>
                    <Skeleton variant="poster" className="w-full" />
                    <Skeleton variant="text" className="w-3/4 mt-2" />
                  </div>
                ))}
              </div>
            ) : creatorResults.length === 0 ? (
              <div className="text-center py-16">
                <Icon name="search" className="w-16 h-16 text-on-surface-variant/40 mx-auto mb-4" />
                <h3 className="font-label-md text-label-md text-on-surface-variant mb-2">No creators found</h3>
                <p className="text-on-surface-variant/60">Try a different search term</p>
              </div>
            ) : (
              <>
                <p className="text-on-surface-variant text-sm mb-4">{creatorResults.length} creator{creatorResults.length !== 1 ? 's' : ''}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-6">
                  {creatorResults.map((creator) => (
                    <button key={creator.id} onClick={() => openCreator(creator)} className="group text-left">
                      {creator.avatar ? (
                        <img src={creator.avatar} alt={creator.name} className="w-full aspect-[2/3] rounded-xl object-cover bg-surface-container group-hover:opacity-90 transition-opacity" loading="lazy" />
                      ) : (
                        <div className="w-full aspect-[2/3] rounded-xl bg-surface-container flex items-center justify-center">
                          <Icon name="person" className="text-on-surface-variant/40" />
                        </div>
                      )}
                      <p className="mt-2 text-sm text-on-surface truncate group-hover:text-primary transition-colors">{creator.name}</p>
                      {creator.known_for_department && (
                        <p className="text-xs text-on-surface-variant truncate">{creator.known_for_department}</p>
                      )}
                      <p className="text-xs text-primary mt-1">{creator.film_count} films</p>
                    </button>
                  ))}
                </div>
              </>
            )
          ) : activeTab === 'categories' ? (
            loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i}>
                    <Skeleton variant="poster" className="w-full" />
                    <Skeleton variant="text" className="w-3/4 mt-2" />
                  </div>
                ))}
              </div>
            ) : categoryResults.length === 0 ? (
              <div className="text-center py-16">
                <Icon name="search" className="w-16 h-16 text-on-surface-variant/40 mx-auto mb-4" />
                <h3 className="font-label-md text-label-md text-on-surface-variant mb-2">No categories found</h3>
                <p className="text-on-surface-variant/60">Try a different search term</p>
              </div>
            ) : (
              <>
                <p className="text-on-surface-variant text-sm mb-4">{categoryResults.length} categor{categoryResults.length !== 1 ? 'ies' : 'y'}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-6">
                  {categoryResults.map((cat) => (
                    <Link key={cat.id} to={cat.source === 'tmdb' ? `/discover?genre_id=${cat.id}&type=${cat.type}` : `/discover?sort=popular`} className="group text-left">
                      <div className="w-full aspect-[2/3] rounded-xl bg-surface-container flex items-center justify-center">
                        <Icon name={cat.source === 'creator' ? 'video_library' : 'category'} className="text-on-surface-variant/40 text-4xl group-hover:text-primary transition-colors" />
                      </div>
                      <p className="mt-2 text-sm text-on-surface truncate group-hover:text-primary transition-colors">{cat.name}</p>
                      <p className="text-xs text-on-surface-variant capitalize">{cat.source}</p>
                    </Link>
                  ))}
                </div>
              </>
            )
          ) : selectedPerson ? (
            <>
              <div className="flex items-center gap-3 mb-6">
                <button onClick={() => setSelectedPerson(null)} className="p-2 rounded-lg bg-surface-container-high border border-outline/20 hover:border-primary-container/50 transition-colors" aria-label="Back to people">
                  <Icon name="chevron_left" />
                </button>
                <h2 className="text-headline-sm text-on-surface font-bold">{selectedPerson.name}</h2>
              </div>
              {creditsLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-gutter">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i}>
                      <Skeleton variant="poster" className="w-full" />
                      <Skeleton variant="text" className="w-3/4 mt-2" />
                    </div>
                  ))}
                </div>
              ) : personCredits.cast.length === 0 && personCredits.crew.length === 0 ? (
                <p className="text-on-surface-variant text-sm py-8">No credits found.</p>
              ) : (
                <>
                  {personCredits.cast.length > 0 && (
                    <>
                      <h3 className="text-on-surface-variant font-label-md mb-3">Known For</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-gutter mb-8">
                        {personCredits.cast.map((item, i) => (
                          <HoverCard
                            key={`${item.id}-${item.type}`}
                            item={{
                              id: item.id,
                              title: item.title,
                              poster: item.poster,
                              backdrop: item.backdrop,
                              type: item.type,
                              year: item.year,
                              overview: item.overview,
                            }}
                            index={i}
                          />
                        ))}
                      </div>
                    </>
                  )}
                  {personCredits.crew.length > 0 && (
                    <>
                      <h3 className="text-on-surface-variant font-label-md mb-3">Crew</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-gutter">
                        {personCredits.crew.map((item, i) => (
                          <HoverCard
                            key={`${item.id}-${item.type}`}
                            item={{
                              id: item.id,
                              title: item.title,
                              poster: item.poster,
                              backdrop: item.backdrop,
                              type: item.type,
                              year: item.year,
                              overview: item.overview,
                            }}
                            index={i}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          ) : loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i}>
                  <Skeleton variant="poster" className="w-full" />
                  <Skeleton variant="text" className="w-3/4 mt-2" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <Icon name="search" className="w-16 h-16 text-on-surface-variant/40 mx-auto mb-4" />
              <h3 className="font-label-md text-label-md text-on-surface-variant mb-2">No results found</h3>
              <p className="text-on-surface-variant/60">Try a different search term</p>
            </div>
          ) : (
            <>
              <p className="text-on-surface-variant text-sm mb-4">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
                {filtered.map((item, i) => {
                  if (item.source === 'creator' || item.source === 'archive') {
                    const open = () => navigate(`/watch?id=${item.id}&type=movie`)
                    return (
                      <div key={`${item.source}-${item.id}`} onClick={open} role="button" tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter') open() }}
                        className="min-w-0 bg-surface-container-high rounded-xl overflow-hidden border border-white/5 cursor-pointer hover:border-primary-container/40 transition-colors">
                        <div className="aspect-[2/3] bg-surface-container relative">
                          {item.poster ? (
                            <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="flex items-center justify-center h-full text-on-surface-variant/40">
                              <Icon name="movie" className="w-10 h-10" />
                            </div>
                          )}
                          <div className="absolute top-2 left-2">
                            <span className="px-2 py-0.5 rounded-full bg-primary-container/80 text-on-primary-container text-[10px] font-bold uppercase tracking-wider">
                              {item.source === 'creator' ? 'Creator' : 'Archive'}
                            </span>
                          </div>
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity">
                            <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm">
                              <Icon name="play_circle" className="w-7 h-7 text-on-surface" />
                            </div>
                          </div>
                        </div>
                        <div className="p-3">
                          <p className="font-label-md text-label-md truncate">{item.title}</p>
                          {item.year && <p className="text-on-surface-variant/40 text-xs mt-1">{item.year}</p>}
                        </div>
                      </div>
                    )
                  }
                  return <HoverCard key={`${item.id}-${item.type}`} item={item} index={i} className="w-full min-w-0" />
                })}
              </div>
            </>
          )}
        </div>

        {!loading && filtered.length === 0 && recs.length > 0 && (
          <div className="mt-12 pt-8 border-t border-white/5">
            <RecommendationGrid
              title="You May Want to Check Out"
              subtitle="Personalized recommendations based on your watch history"
            >
              {recs.map((item, i) => (
                <div key={`rec-${item.id}-${item.type}`} className="min-w-0">
                  <HoverCard item={item} index={i} className="w-full min-w-0" />
                </div>
              ))}
            </RecommendationGrid>
          </div>
        )}
      </div>
    </div>
  )
}
