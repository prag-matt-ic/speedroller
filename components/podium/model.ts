export type PodiumPlace = 1 | 2 | 3

/** One winner's public presentation: their name and the marble colour they raced with. */
export type PodiumWinner = {
  username: string
  paletteIndex: number
}

/** Index 0 is first place, index 1 second, index 2 third. */
export type PodiumWinners = readonly (PodiumWinner | null)[]
