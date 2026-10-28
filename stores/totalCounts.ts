export type TotalCounts = {
  rows: number
  rings: number
  headings: number
  infoZones: number
  collectibles: number
  confetti: number
  colourPickers: number
  startLines: number
  finishLines: number
  decorations: number
}

export const createTotalCounts = (): TotalCounts => ({
  rows: 0,
  rings: 0,
  headings: 0,
  infoZones: 0,
  collectibles: 0,
  confetti: 0,
  colourPickers: 0,
  startLines: 0,
  finishLines: 0,
  decorations: 0,
})
