import { useMemo, useRef } from 'react'

export type ReadyState = {
  tiles: boolean
  rings: boolean
  headings: boolean
  collectibles: boolean
  infoZones: boolean
  confetti: boolean
  speedRun: boolean
  floatingTiles: boolean
  colourPicker: boolean
}
export type ReadyStateKey = keyof ReadyState

type ReadyChangeHandler = (isReady: boolean) => void

const INITIAL_READY_STATE: ReadyState = {
  tiles: false,
  rings: false,
  headings: false,
  collectibles: false,
  infoZones: false,
  confetti: false,
  speedRun: false,
  floatingTiles: false,
  colourPicker: false,
}

const READY_STATE_KEYS = Object.keys(INITIAL_READY_STATE) as ReadyStateKey[]

/** A fresh set of callbacks owns each layout's readiness, including Strict Mode remounts. */
export default function useReadyState(
  onStateChange: (readyState: ReadyState) => void,
  revision: unknown,
) {
  const readyState = useRef({ revision, values: INITIAL_READY_STATE })
  const readyChangeHandlers = useMemo(() => {
    return Object.fromEntries(READY_STATE_KEYS.map((key) => [key, (isReady: boolean) => {
      const previous = readyState.current.revision === revision
        ? readyState.current.values
        : INITIAL_READY_STATE
      if (previous[key] === isReady) return
      const values = { ...previous, [key]: isReady }
      readyState.current = { revision, values }
      onStateChange(values)
    }])) as Record<ReadyStateKey, ReadyChangeHandler>
    // A layout replacement needs its own readiness even if its callback is unchanged.
  }, [onStateChange, revision])

  return { readyChangeHandlers }
}
