'use client'

import { type FC, useCallback } from 'react'

import { Stage, useGameStore, useGameStoreAPI } from '@/components/GameProvider'
import { Lobby } from '@/components/platform/lobby/Lobby'
import FloatingTiles from '@/components/floatingTiles/FloatingTiles'
import Collectibles from '@/components/platform/collectibles/Collectibles'
import ColourPickerRow from '@/components/platform/colourPicker/ColourPickerRow'
import ConfettiRows from '@/components/platform/confetti/ConfettiRows'
import FloatingHeadings from '@/components/platform/floatingHeadings/FloatingHeadings'
import InfoZones from '@/components/platform/infoZones/InfoZones'
import Rings from '@/components/platform/rings/Rings'
import Pillars from '@/components/platform/scenery/Pillars'
import { PlatformTiles } from '@/components/platform/tiles/Tiles'
import { useGameFrame } from '@/hooks/useGameFrame'
import { useCourseSurface } from '@/hooks/useCourseSurface'
import { usePlayerPosition } from '@/hooks/usePlayerPosition'
import { GameMode } from '@/stores/types'
import { worldZToRowIndex } from '@/utils/tiles'

import SpeedRunElements from './speedRun/SpeedRunElements'
import { usePlayerRespawn } from './usePlayerRespawn'
import useReadyState, { type ReadyState, type ReadyStateKey } from './useReadyState'

const Course: FC = () => {
  const surface = useCourseSurface()
  const gameStore = useGameStoreAPI()
  const mode = useGameStore((s) => s.mode)
  const rows = useGameStore((s) => s.rowsData)
  const isPlatformReady = useGameStore((s) => s.isPlatformReady)
  const { playerPosition } = usePlayerPosition()

  const checkReady = useCallback((ready: ReadyState) => {
    const isReady = rows.length > 0 && (Object.keys(ready) as ReadyStateKey[]).every(
      (key) => ready[key],
    )
    const state = gameStore.getState()
    if (state.isPlatformReady !== isReady) state.setIsPlatformReady(isReady)
  }, [gameStore, rows])

  const { readyChangeHandlers } = useReadyState(checkReady, rows)
  usePlayerRespawn({ rows, isPlatformReady })

  useGameFrame(() => {
    if (!isPlatformReady) return
    const index = worldZToRowIndex(playerPosition.current[2], rows.length)
    const row = rows[index]
    if (!row) return
    const state = gameStore.getState()
    const currentRow = row.rowIndex ?? index
    const stage = row.stage === Stage.SPEED_RUN_FINISH ? Stage.CTA : row.stage
    if (state.currentRow !== currentRow) state.setCurrentRow(currentRow)
    if (state.stage !== stage) state.goToStage(stage)
  })

  return (
    <group>
      <FloatingTiles rows={rows} onReadyChange={readyChangeHandlers.floatingTiles} />
      <PlatformTiles rows={rows} onReadyChange={readyChangeHandlers.tiles} />
      <Pillars surface={surface} enabled={mode === GameMode.SPEEDRUN} onReadyChange={readyChangeHandlers.pillars} />
      <FloatingHeadings rows={rows} onReadyChange={readyChangeHandlers.headings} />
      <ConfettiRows rows={rows} onReadyChange={readyChangeHandlers.confetti} />
      <InfoZones rows={rows} onReadyChange={readyChangeHandlers.infoZones} />
      <Collectibles rows={rows} onReadyChange={readyChangeHandlers.collectibles} />
      <ColourPickerRow rows={rows} onReadyChange={readyChangeHandlers.colourPicker} />
      <Rings rows={rows} onReadyChange={readyChangeHandlers.rings} />
      {mode === GameMode.SPEEDRUN && surface.topology === 'cylinder' && <Lobby />}
      <SpeedRunElements rows={rows} onReadyChange={readyChangeHandlers.speedRun} />
    </group>
  )
}

const Platform: FC = () => {
  const resetPlatformTick = useGameStore((s) => s.resetPlatformTick)
  return <Course key={resetPlatformTick} />
}

export default Platform
