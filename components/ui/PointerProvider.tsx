'use client'

import {
  type FC,
  type PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createStore, useStore } from 'zustand'

export type PointerPosition = {
  x: number
  y: number
}

type State = {
  position: PointerPosition
}

const createPointerStore = () => {
  return createStore<State>((set, get) => ({
    position: { x: 0, y: 0 },
  }))
}

type PointerStore = ReturnType<typeof createPointerStore>

const Context = createContext<PointerStore>(undefined!)

export const PointerProvider: FC<PropsWithChildren & { isMobile: boolean }> = ({
  children,
  isMobile,
}) => {
  const [store] = useState<PointerStore>(createPointerStore())

  useEffect(() => {
    if (isMobile) return
    const onPointerMove = (event: MouseEvent) => {
      const { clientX, clientY } = event
      const position: PointerPosition = { x: clientX, y: clientY }
      store.setState({ position })
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
    }
  }, [isMobile, store])

  return <Context value={store}>{children}</Context>
}

export function usePointerStore<T>(selector: (state: State) => T): T {
  const store = useContext(Context)
  if (!store) throw new Error('Missing PointerProvider in the tree')
  return useStore(store, selector)
}

export function usePointerStoreAPI(): PointerStore {
  const store = useContext(Context)
  if (!store) throw new Error('Missing PointerProvider in the tree')
  return store
}

export function usePointerPosition(onPositionChange?: (value: PointerPosition) => void) {
  const api = usePointerStoreAPI()

  // Capture current selected value in a ref to avoid re-renders
  const position = useRef<PointerPosition>(api.getState().position)

  useEffect(() => {
    // Subscribe to store updates and update ref only when selected value changes
    const unsubscribe = api.subscribe((state, prevState) => {
      if (state.position === prevState.position) return
      position.current = state.position
      onPositionChange?.(state.position)
    })
    return unsubscribe
  }, [api, onPositionChange])

  // Fire once on mount with the current value so consumers can initialize
  useEffect(() => {
    onPositionChange?.(position.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { value: position }
}

export function useOptionalPointerPosition(
  onPositionChange?: (value: PointerPosition) => void,
) {
  const store = useContext(Context)
  const position = useRef<PointerPosition | null>(store?.getState().position ?? null)

  useEffect(() => {
    if (!store || !onPositionChange) return
    const unsubscribe = store.subscribe((state, prevState) => {
      if (state.position === prevState.position) return
      position.current = state.position
      onPositionChange?.(state.position)
    })
    return unsubscribe
  }, [store, onPositionChange])

  useEffect(() => {
    if (!store || !position.current) return
    onPositionChange?.(position.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { hasPointerProvider: Boolean(store), value: position }
}
