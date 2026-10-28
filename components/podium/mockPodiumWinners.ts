import type { PodiumWinners } from '@/components/podium/model'

/**
 * Stand-in leaderboard for the podium dev page. Palette indices map to
 * `PLAYER_BASE_COLOURS`, so each marble renders in that player's race colour.
 */
export const MOCK_PODIUM_WINNERS: PodiumWinners = [
  { username: 'NovaRider', paletteIndex: 5, timeSeconds: 57.23 },
  { username: 'PixelRoll', paletteIndex: 2, timeSeconds: 58.41 },
  { username: 'Marbelous', paletteIndex: 7, timeSeconds: 59.08 },
]
