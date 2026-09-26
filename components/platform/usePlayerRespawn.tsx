import { useEffect } from 'react'

import { PLAYER_INITIAL_POSITION, useGameStore } from '@/components/GameProvider'
import { usePlayerPosition } from '@/hooks/usePlayerPosition'
import { findSafeRespawnPosition } from '@/utils/platform/playerRespawn'
import type { RowData } from '@/utils/tiles'

export function usePlayerRespawn({
  rows,
  isPlatformReady,
}: {
  rows: readonly RowData[]
  isPlatformReady: boolean
}) {
  const respawnPlayer = useGameStore((s) => s.respawnPlayer)
  const playerStatus = useGameStore((s) => s.playerStatus)
  const { playerPosition } = usePlayerPosition()

  useEffect(() => {
    if (!isPlatformReady || playerStatus !== 'out-of-bounds') return
    const position = findSafeRespawnPosition(
      rows,
      playerPosition.current[0],
      playerPosition.current[2],
      PLAYER_INITIAL_POSITION[1],
    )
    if (position) respawnPlayer(position)
  }, [isPlatformReady, playerPosition, playerStatus, respawnPlayer, rows])
}
