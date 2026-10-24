import { useEffect, useState } from 'react'

/** Tracks document visibility without subscribing the whole tree to a global event. */
export function usePageHidden(): boolean {
  const [isHidden, setIsHidden] = useState(
    () => typeof document !== 'undefined' && document.hidden,
  )

  useEffect(() => {
    const onVisibilityChange = () => setIsHidden(document.hidden)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  return isHidden
}

export default usePageHidden
