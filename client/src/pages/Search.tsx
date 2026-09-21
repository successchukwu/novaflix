import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import Icon from '../components/ui/Icon'
import { searchMedia, getNowPlaying, getTrendingFeed, getDiscover, searchPerson, getPersonCredits, searchCreators, searchCategories, type Creator, type Category } from '../lib/api'
import type { Person, PersonCredit } from '../lib/api'
import { useStore } from '../store/useStore'
import Tabs from '../components/ui/Tabs'
import FilterChips from '../components/ui/FilterChips'
import Badge from '../components/ui/Badge'
import Skeleton from '../components/ui/Skeleton'
import HoverCard from '../components/features/HoverCard'
import type { MediaItem } from '../types'
import Button from '../components/ui/Button'

const primaryTabs = [
  { id: 'movie', label: 'Movies' },
  { id: 'tv', label: 'TV Shows' },
]

const filterChips = [
  { id: 'creators', label: 'Creators' },
  { id: 'categories', label: 'Categories' },
  { id: 'people', label: 'People' },
]

interface CategorySection {
  title: string
  key: string
  link?: string
}

const categorySections: CategorySection[] = [
  { title: 'Now Playing', key: 'nowPlaying', link: '/discover?sort=trending' },
  { title: 'Trending Movies', key: 'trendingMovies', link: '/discover?sort=trending' },
  { title: 'Trending TV Shows', key: 'trendingTV', link: '/tv-shows' },
  { title: 'Top Rated Movies', key: 'topRated', link: '/discover?sort=top_rated' },
  { title: 'Action Movies', key: 'action', link: '/discover?sort=popular' },
  { title: 'Comedy Movies', key: 'comedy', link: '/discover?sort=popular' },
  { title: 'Popular TV Shows', key: 'popularTV', link: '/tv-shows' },
]

function CategoryRow({ title, link, items, loading }: { title: string; link?: string; items: MediaItem[]; loading: boolean }) {
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-headline-sm text-on-surface flex items-center gap-1.5">
          {title}
          <Icon name="chevron_right" className="text-primary" />
        </h2>
        {link && (
          <Link to={link} className="text-label-sm text-primary hover:underline transition-colors">
            View All
          </Link>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2 snap-x">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex-shrink-0 w-[140px] md:w-[160px]">
                <Skeleton variant="poster" className="w-full" />
              </div>
            ))
          : items.slice(0, 10).map((item, i) => (
              <HoverCard key={`${item.id}-${item.type}`} item={item} index={i} />
            ))}
      </div>
    </section>
  )
}

export default function Search() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const typeParam = searchParams.get('type') || 'movie'
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [results, setResults] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(!!query)
  const addRecentSearch = useStore((s) => s.addRecentSearch)
  const recentlySearched = useStore((s) => s.recentlySearched)

  const [nowPlaying, setNowPlaying] = useState<MediaItem[]>([])
  const [trendingMovies, setTrendingMovies] = useState<MediaItem[]>([])
  const [trendingTV, setTrendingTV] = useState<MediaItem[]>([])
  const [topRated, setTopRated] = useState<MediaItem[]>([])
  const [actionMovies, setActionMovies] = useState<MediaItem[]>([])
  const [comedyMovies, setComedyMovies] = useState<MediaItem[]>([])
  const [popularTV, setPopularTV] = useState<MediaItem[]>([])
  const [catLoading, setCatLoading] = useState(true)

  const [mediaType, setMediaType] = useState<'movie' | 'tv' | 'people' | 'creators' | 'categories'>(typeParam as 'movie' | 'tv' | 'people' | 'creators' | 'categories')
  const [peopleResults, setPeopleResults] = useState<Person[]>([])
  const [creatorResults, setCreatorResults] = useState<Creator[]>([])
  const [categoryResults, setCategoryResults] = useState<Category[]>([])
  const [selectedPerson, setSelectedPerson] = useState<{ id: number; name: string } | null>(null)
  const [personCredits, setPersonCredits] = useState<{ cast: PersonCredit[]; crew: PersonCredit[] }>({ cast: [], crew: [] })
  const [creditsLoading, setCreditsLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<MediaItem[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMediaType(typeParam as 'movie' | 'tv' | 'people' | 'creators' | 'categories')
  }, [typeParam])

  useEffect(() => {
    async function loadCategories() {
      setCatLoading(true)
      const [npRes, trendRes, topRes, actionRes, comedyRes] = await Promise.all([
        getNowPlaying(),
        getTrendingFeed(),
        getDiscover({ sort_by: 'vote_average.desc', min_votes: 200, type: 'movie' }),
        getDiscover({ genre_id: '28', type: 'movie' }),
        getDiscover({ genre_id: '35', type: 'movie' }),
      ])
      if (npRes.success) setNowPlaying(npRes.data)
      if (trendRes.success) {
        setTrendingMovies(trendRes.data.movies)
        setTrendingTV(trendRes.data.tv)
      }
      if (topRes.success) setTopRated(topRes.data)
      if (actionRes.success) setActionMovies(actionRes.data)
      if (comedyRes.success) setComedyMovies(comedyRes.data)

      const popTVRes = await getDiscover({ type: 'tv', sort_by: 'popularity.desc' })
      if (popTVRes.success) setPopularTV(popTVRes.data)

      setCatLoading(false)
    }
    loadCategories()
  }, [])

  const doSearch = useCallback(async (q: string, type: 'movie' | 'tv' | 'people' | 'creators' | 'categories') => {
    if (!q.trim()) {
      setResults([])
      setPeopleResults([])
      setCreatorResults([])
      setCategoryResults([])
      setSearched(false)
      return
    }

    setLoading(true)
    setSearched(true)
    addRecentSearch(q.trim())

    try {
      if (type === 'people') {
        const res = await searchPerson(q.trim())
        if (res.success) {
          setPeopleResults(res.data)
          setResults([])
        } else {
          setPeopleResults([])
        }
      } else if (type === 'creators') {
        const res = await searchCreators(q.trim())
        if (res.success) {
          setCreatorResults(res.creators)
          setResults([])
        } else {
          setCreatorResults([])
        }
      } else if (type === 'categories') {
        const res = await searchCategories(q.trim())
        if (res.success) {
          setCategoryResults(res.categories)
          setResults([])
        } else {
          setCategoryResults([])
        }
      } else {
        const res = await searchMedia(q.trim(), type)
        if (res.success) {
          setResults(res.data)
          setPeopleResults([])
        } else {
          setResults([])
        }
      }
    } catch {
      setResults([])
      setPeopleResults([])
      setCreatorResults([])
      setCategoryResults([])
    }
    setLoading(false)
  }, [addRecentSearch])

  const openPerson = async (person: Person) => {
    setSelectedPerson({ id: person.id, name: person.name })
    setCreditsLoading(true)
    setPersonCredits({ cast: [], crew: [] })
    try {
      const res = await getPersonCredits(String(person.id))
      if (res.success) {
        setPersonCredits({ cast: res.cast || [], crew: res.crew || [] })
      }
    } catch {}
    setCreditsLoading(false)
  }

  const openCreator = (creator: Creator) => {
    navigate(`/creators/${creator.id}`)
  }

  useEffect(() => {
    if (query) {
      doSearch(query, mediaType)
    }
  }, [query, mediaType, doSearch])

  const fetchSuggestions = useCallback(async (q: string) => {
    if (!q.trim() || mediaType === 'people' || mediaType === 'creators' || mediaType === 'categories') { setSuggestions([]); setShowSuggestions(false); return }
    const res = await searchMedia(q.trim(), mediaType)
    if (res.success) setSuggestions(res.data.slice(0, 5))
    else setSuggestions([])
    setShowSuggestions(true)
  }, [mediaType])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    setSelectedPerson(null)
    setSearchParams(val ? { q: val, type: mediaType } : { type: mediaType })
    if (val.trim()) fetchSuggestions(val)
    else { setSuggestions([]); setShowSuggestions(false) }
  }

  const handleSuggestionClick = (item: MediaItem) => {
    setShowSuggestions(false)
    navigate(`/${item.type}/${item.id}`)
  }

  const handleTabChange = (id: string) => {
    if (id === 'movie' || id === 'tv') {
      setMediaType(id as 'movie' | 'tv')
      if (query) {
        setSearchParams({ q: query, type: id })
      } else {
        setSearchParams({ type: id })
      }
    } else {
      // For filter chips (creators, categories, people), update mediaType for search
      setMediaType(id as 'movie' | 'tv' | 'people' | 'creators' | 'categories')
      if (query) {
        setSearchParams({ q: query, type: id })
      } else {
        setSearchParams({ type: id })
      }
    }
    setSelectedPerson(null)
  }

  const handleRecentClick = (q: string) => {
    setQuery(q)
    setSearchParams({ q, type: mediaType })
  }

  const sections: { title: string; key: string; items: MediaItem[]; link?: string }[] = [
    { title: 'Now Playing', key: 'nowPlaying', items: nowPlaying, link: '/discover?sort=trending' },
    { title: 'Trending Movies', key: 'trendingMovies', items: trendingMovies, link: '/discover?sort=trending' },
    { title: 'Trending TV Shows', key: 'trendingTV', items: trendingTV, link: '/tv-shows' },
    { title: 'Top Rated Movies', key: 'topRated', items: topRated, link: '/discover?sort=top_rated' },
    { title: 'Action Movies', key: 'action', items: actionMovies, link: '/category/28' },
    { title: 'Comedy Movies', key: 'comedy', items: comedyMovies, link: '/category/35' },
    { title: 'Popular TV Shows', key: 'popularTV', items: popularTV, link: '/tv-shows' },
  ]

  return (
    <div className="min-h-screen px-margin-mobile md:px-margin-desktop pt-6 md:pt-10 pb-nav">
      <div className="max-w-4xl mx-auto">
        <div className="relative mb-6">
          <div className="flex items-center gap-3 bg-surface-container-high border border-outline/20 rounded-xl px-4 py-3 focus-within:border-primary-container/50 transition-colors">
            <Icon name="search" className="text-on-surface-variant shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleInputChange}
              onFocus={() => { if (suggestions.length) setShowSuggestions(true) }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Search movies, TV shows, people, creators, categories..."
              className="flex-1 bg-transparent text-on-surface placeholder-on-surface-variant/50 outline-none text-body-md"
              autoFocus
            />
            {query && (
              <button onClick={() => { setQuery(''); setSearchParams({ type: mediaType }); setSuggestions([]); setShowSuggestions(false); inputRef.current?.focus() }} className="text-on-surface-variant hover:text-on-surface">
                <Icon name="close" />
              </button>
            )}
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-surface-container-high border border-outline/20 rounded-xl overflow-hidden z-30 shadow-2xl">
              {suggestions.map((item) => (
                <button
                  key={`${item.id}-${item.type}`}
                  onMouseDown={() => handleSuggestionClick(item)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container-higher transition-colors text-left"
                >
                  {item.poster ? (
                    <img src={item.poster} alt="" className="w-8 h-12 rounded object-cover" />
                  ) : (
                    <div className="w-8 h-12 rounded bg-surface-variant flex items-center justify-center">
                      <Icon name="movie" className="text-on-surface-variant/40" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-body-md text-on-surface truncate">{item.title}</p>
                    <p className="text-label-sm text-on-surface-variant">{item.type === 'movie' ? 'Movie' : 'TV Show'}</p>
                  </div>
                  <Icon name="chevron_right" className="text-on-surface-variant/40 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mb-6">
          <Tabs tabs={primaryTabs} activeTab={mediaType} onChange={handleTabChange} />
        </div>

        <div className="mb-6">
          <FilterChips chips={filterChips} activeChip={mediaType} onChange={handleTabChange} />
        </div>

        {!searched && recentlySearched.length > 0 && (
          <div className="mb-8">
            <h3 className="text-on-surface-variant font-label-sm mb-3">Recent Searches</h3>
            <div className="flex flex-wrap gap-2">
              {recentlySearched.map((s) => (
                <button
                  key={s}
                  onClick={() => handleRecentClick(s)}
                  className="px-3 py-1.5 bg-surface-container-high border border-outline/20 rounded-lg text-sm text-on-surface-variant hover:border-primary-container/50 hover:text-on-surface transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-gutter">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i}>
                <Skeleton variant="poster" className="w-full" />
                <Skeleton variant="text" className="w-3/4 mt-2" />
                <Skeleton variant="text" className="w-1/2 mt-1" />
              </div>
            ))}
          </div>
        )}

        {!loading && searched && !selectedPerson && ((mediaType === 'people' && peopleResults.length === 0) || (mediaType === 'creators' && creatorResults.length === 0) || (mediaType === 'categories' && categoryResults.length === 0) || (mediaType !== 'people' && mediaType !== 'creators' && mediaType !== 'categories' && results.length === 0)) && (
          <div className="text-center py-16">
            <Icon name="search" className="w-16 h-16 text-on-surface-variant/40 mx-auto mb-4" />
            <h3 className="font-label-md text-label-md text-on-surface-variant mb-2">No results found</h3>
            <p className="text-on-surface-variant/60">Try a different search term</p>
          </div>
        )}

        {!loading && mediaType === 'people' && !selectedPerson && peopleResults.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-on-surface-variant text-sm">
                {peopleResults.length} person{peopleResults.length !== 1 ? 's' : ''}
              </p>
              <Badge variant="outline">People</Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {peopleResults.map((person) => (
                <button
                  key={person.id}
                  onClick={() => openPerson(person)}
                  className="group text-left"
                >
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
        )}

        {!loading && mediaType === 'creators' && creatorResults.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-on-surface-variant text-sm">
                {creatorResults.length} creator{creatorResults.length !== 1 ? 's' : ''}
              </p>
              <Badge variant="outline">Creators</Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {creatorResults.map((creator) => (
                <button
                  key={creator.id}
                  onClick={() => openCreator(creator)}
                  className="group text-left"
                >
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
        )}

        {!loading && mediaType === 'categories' && categoryResults.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-on-surface-variant text-sm">
                {categoryResults.length} categor{categoryResults.length !== 1 ? 'ies' : 'y'}
              </p>
              <Badge variant="outline">Categories</Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
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
        )}

        {!loading && selectedPerson && (
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
        )}

        {!loading && mediaType !== 'people' && !selectedPerson && results.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-on-surface-variant text-sm">
                {results.length} result{results.length !== 1 ? 's' : ''}
              </p>
              <Badge variant="outline">
                {mediaType === 'movie' ? 'Movies' : 'TV Shows'}
              </Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-gutter">
              {results.map((item, i) => (
                <HoverCard key={`${item.id}-${item.type}`} item={item} index={i} />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-10 space-y-6 max-w-container-max mx-auto">
        <div className="h-px bg-white/5 mb-6" />
        <h2 className="text-headline-md text-on-surface font-bold">Discover</h2>
        {sections.map((section) => (
          <CategoryRow
            key={section.key}
            title={section.title}
            link={section.link}
            items={section.items}
            loading={catLoading}
          />
        ))}
      </div>
    </div>
  )
}
