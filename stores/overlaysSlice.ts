import { type GameSliceCreator, Overlay, type OverlaysSlice } from './types'

export const createOverlaysSlice: GameSliceCreator<OverlaysSlice> = (set) => {
  return {
    overlay: Overlay.LANDING,
    setOverlay: (overlay: Overlay) => {
      // Phase transitions belong to the race lifecycle. The overlay only controls presentation.
      set({ overlay })
    },
  }
}
