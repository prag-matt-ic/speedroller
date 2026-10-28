import { type RingIndex } from '@/stores/types'

export const getRingKey = (rowIndex: number, columnIndex: number): string =>
  `${rowIndex}:${columnIndex}`

export const ringIndexToKey = (ringIndex: RingIndex): string =>
  getRingKey(ringIndex[0], ringIndex[1])
