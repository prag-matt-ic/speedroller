import { useCourseSurface } from '@/hooks/useCourseSurface'
import { useEffect, useMemo } from 'react'

import { PLAYER_INITIAL_POSITION, useGameStore } from '@/components/GameProvider'
import { usePlayerCoursePosition } from '@/hooks/usePlayerCoursePosition'
import { SpeedRunStage } from '@/stores/types'
import { type RespawnRowRange, findSafeRespawnPosition } from '@/utils/platform/playerRespawn'
import { getLobbyRowRange } from '@/utils/platform/raceMarkers'
import type { RowData } from '@/utils/tiles'

export function usePlayerRespawn({
  rows,
  isPlatformReady,
}: {
  rows: readonly RowData[]
  isPlatformReady: boolean
}) {
  const surface = useCourseSurface()
  const respawnPlayer = useGameStore((s) => s.respawnPlayer)
  const speedRunStage = useGameStore((s) => s.speedRunStage)
  const playerStatus = useGameStore((s) => s.playerStatus)
  const { playerPosition } = usePlayerCoursePosition()

  // A lobby fall must stay inside the lobby, so falling near the exit cannot drop the player
  // beyond the start line without an attempt.
  const rowRange = useMemo<RespawnRowRange | undefined>(
    () => (speedRunStage === SpeedRunStage.LOBBY ? (getLobbyRowRange(rows) ?? undefined) : undefined),
    [rows, speedRunStage],
  )

  useEffect(() => {
    if (!isPlatformReady || playerStatus !== 'out-of-bounds') return
    const position = findSafeRespawnPosition(
      rows,
      playerPosition.current[0],
      playerPosition.current[2],
      PLAYER_INITIAL_POSITION[1],
      rowRange,
      surface,
    )
    if (position) respawnPlayer(position)
  }, [isPlatformReady, playerPosition, playerStatus, respawnPlayer, rows, rowRange, surface])
}
