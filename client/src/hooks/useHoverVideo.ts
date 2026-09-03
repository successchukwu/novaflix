import { useRef, useCallback, useEffect } from 'react'

interface UseHoverVideoOptions {
  delay?: number
  mediaQuery?: string
  resetOnLeave?: boolean
}

export function useHoverVideo(
  videoRef: React.RefObject<HTMLVideoElement>,
  options: UseHoverVideoOptions = {}
) {
  const { delay = 500, mediaQuery = '(min-width: 1024px)', resetOnLeave = true } = options
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mqRef = useRef<MediaQueryList | null>(null)

  // Use matchMedia for desktop guard
  const isDesktop = useCallback(() => {
    if (typeof window === 'undefined') return false
    if (!mqRef.current) mqRef.current = window.matchMedia(mediaQuery)
    return mqRef.current.matches
  }, [mediaQuery])

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const handleEnter = useCallback(() => {
    if (!isDesktop()) return
    clearTimer()
    timerRef.current = setTimeout(() => {
      const v = videoRef.current
      if (!v) return
      // Ensure muted for autoplay policy
      v.muted = true
      v.play().catch(() => {})
      v.closest('.group, .group\\/card')?.classList.add('playing')
      // Tailwind group playing state via class; also ensure scale via container
      const container = v.closest('.hover-video-container') as HTMLElement | null
      container?.classList.add('playing')
    }, delay)
  }, [delay, isDesktop, clearTimer, videoRef])

  const handleLeave = useCallback(() => {
    clearTimer()
    const v = videoRef.current
    if (!v) return
    v.pause()
    if (resetOnLeave) v.currentTime = 0
    v.closest('.group, .group\\/card')?.classList.remove('playing')
    const container = v.closest('.hover-video-container') as HTMLElement | null
    container?.classList.remove('playing')
  }, [clearTimer, resetOnLeave, videoRef])

  // Cleanup on unmount + pause on tab hidden + resize below breakpoint
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) handleLeave()
    }
    const onResize = () => {
      if (!isDesktop()) handleLeave()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('resize', onResize)
    return () => {
      clearTimer()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('resize', onResize)
      // Pause video if still exists
      const v = videoRef.current
      if (v) {
        v.pause()
        if (resetOnLeave) v.currentTime = 0
      }
    }
  }, [clearTimer, handleLeave, isDesktop, resetOnLeave, videoRef])

  return { onEnter: handleEnter, onLeave: handleLeave, isDesktop, clearTimer }
}
