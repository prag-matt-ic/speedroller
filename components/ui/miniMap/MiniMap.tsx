import { useCourseSurface } from '@/hooks/useCourseSurface'
import { useMediaQuery } from '@mantine/hooks'
import Image from 'next/image'
import { type FC, forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { twJoin } from 'tailwind-merge'

import { useGameStore, useGameStoreAPI } from '@/components/GameProvider'
import { usePlayerCoursePosition } from '@/hooks/usePlayerCoursePosition'
import { PLATFORM_VERSION } from '@/resources/rowsData'
import { GameMode, InputType, SpeedRunStage } from '@/stores/types'
import { getFinishRowIndex, getStartRowIndex } from '@/utils/platform/raceMarkers'
import { TILE_SIZE } from '@/utils/tiles'

const MINI_MAP_ASSET_BASE = `/maps/${PLATFORM_VERSION}`
const MINI_MAP_ASSET_PATHS: Record<GameMode, string> = {
  [GameMode.SPEEDRUN]: `${MINI_MAP_ASSET_BASE}/speedrun.svg`,
  [GameMode.DEV]: `${MINI_MAP_ASSET_BASE}/dev.svg`,
}

const BASE_PLAYER_SIZE_PX = 8
const BASE_PLAYER_INDICATOR_Y_OFFSET_PX = BASE_PLAYER_SIZE_PX * 8
const BASE_MAP_TILE_SIZE_PX = 4
const PROGRESS_PADDING_ROWS = 5

type ProgressWindow = {
  maxRowIndex: number
  progressStartRow: number
  progressRange: number
}

const getProgressWindow = (totalRows: number): ProgressWindow => {
  const maxRowIndex = Math.max(0, totalRows - 1)
  const hasFullPadding = maxRowIndex + 1 > PROGRESS_PADDING_ROWS * 2
  const progressStartRow = hasFullPadding ? PROGRESS_PADDING_ROWS : 0
  const progressEndRow = hasFullPadding ? maxRowIndex - PROGRESS_PADDING_ROWS + 1 : maxRowIndex
  return {
    maxRowIndex,
    progressStartRow,
    progressRange: Math.max(1, progressEndRow - progressStartRow),
  }
}

const MiniMap: FC = () => {
  const surface = useCourseSurface()
  const COLUMNS = surface.columns
  const gameStoreAPI = useGameStoreAPI()
  const mode = useGameStore((s) => s.mode)
  const rowsData = useGameStore((s) => s.rowsData)
  const totalRows = useGameStore((s) => s.totalCounts.rows)
  const isUsingJoystick = useGameStore((s) => s.inputType === InputType.JOYSTICK)
  const joystickIsOnLeft = useGameStore((s) => s.joystickPosition === 'left')
  const isMapOnRight = isUsingJoystick && joystickIsOnLeft

  const isXL = useMediaQuery('(min-width: 1280px)', true)
  const sizeScale = isXL ? 1.25 : 1
  const playerSizePx = BASE_PLAYER_SIZE_PX * sizeScale
  const playerIndicatorYOffsetPx = BASE_PLAYER_INDICATOR_Y_OFFSET_PX * sizeScale
  const mapTileSizePx = BASE_MAP_TILE_SIZE_PX * sizeScale

  const {
    maxRowIndex: initialMaxRowIndex,
    progressStartRow: fallbackProgressStartRow,
    progressRange: fallbackProgressRange,
  } = getProgressWindow(totalRows)

  const raceProgressWindow = useMemo(() => {
    const finishRowIndex = getFinishRowIndex(rowsData)
    const startRow = getStartRowIndex(rowsData)
    if (finishRowIndex === null || startRow === null) {
      return { startRow: fallbackProgressStartRow, range: fallbackProgressRange }
    }
    return { startRow, range: Math.max(1, finishRowIndex - startRow) }
  }, [fallbackProgressRange, fallbackProgressStartRow, rowsData])

  // const totalRowsRef = useRef(totalRows)
  const rowsToPixelsRef = useRef(
    totalRows === 0 ? 0 : (mapTileSizePx * totalRows) / Math.max(1, initialMaxRowIndex),
  )
  const maxRowIndexRef = useRef(initialMaxRowIndex)
  const progressStartRowRef = useRef(raceProgressWindow.startRow)
  const progressRangeRef = useRef(raceProgressWindow.range)

  const miniMapAsset = MINI_MAP_ASSET_PATHS[mode] ?? MINI_MAP_ASSET_PATHS[GameMode.SPEEDRUN]

  const progressRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<HTMLDivElement | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)

  const { playerPosition } = usePlayerCoursePosition()

  useEffect(() => {
    const { maxRowIndex } = getProgressWindow(totalRows)
    const denominator = Math.max(1, maxRowIndex)
    rowsToPixelsRef.current = totalRows === 0 ? 0 : (mapTileSizePx * totalRows) / denominator
    maxRowIndexRef.current = maxRowIndex
    progressStartRowRef.current = raceProgressWindow.startRow
    progressRangeRef.current = raceProgressWindow.range
  }, [mapTileSizePx, raceProgressWindow, totalRows])

  useEffect(() => {
    let currentRow = gameStoreAPI.getState().currentRow
    let lastXRef = 0
    let lastYRef = 0
    let lastProgressRef = -1

    const updateProgress = (row: number) => {
      if (!progressRef.current) return
      const { speedRunStage } = gameStoreAPI.getState()
      const isFinished =
        speedRunStage === SpeedRunStage.SUBMITTING || speedRunStage === SpeedRunStage.END
      const rowsProgress = isFinished
        ? 1
        : Math.min(
            1,
            Math.max(
              0,
              (row - progressStartRowRef.current) / Math.max(1, progressRangeRef.current),
            ),
          )
      if (rowsProgress === lastProgressRef) return
      lastProgressRef = rowsProgress
      const translatePercent = (rowsProgress - 1) * 100
      progressRef.current.style.transform = `translate3d(${translatePercent}%,0,0)`
    }

    const updateMapTransform = (row: number, playerX: number) => {
      if (!mapRef.current) return

      const clampedRow = Math.min(maxRowIndexRef.current, Math.max(0, row))
      const translateY = clampedRow * rowsToPixelsRef.current - playerIndicatorYOffsetPx
      const xPositionInTileUnits = playerX / TILE_SIZE
      const translateX = -xPositionInTileUnits * mapTileSizePx

      if (translateX === lastXRef && translateY === lastYRef) return
      lastXRef = translateX
      lastYRef = translateY

      mapRef.current.style.transform = `translate3d(${translateX}px, ${translateY}px, 0)`
    }

    let animationFrameId: number

    const loop = () => {
      updateMapTransform(currentRow, playerPosition.current[0])
      animationFrameId = requestAnimationFrame(loop)
    }

    updateProgress(currentRow)
    loop()

    const unsubscribeCurrentRow = gameStoreAPI.subscribe(
      (s) => s.currentRow,
      (newCurrentRow) => {
        currentRow = newCurrentRow
        updateProgress(newCurrentRow)
      },
    )

    // Finishing can happen before the ball reaches the marker centre, so force a full bar when
    // the result phase starts.
    const unsubscribeStage = gameStoreAPI.subscribe(
      (s) => s.speedRunStage,
      () => updateProgress(currentRow),
    )

    return () => {
      unsubscribeCurrentRow()
      unsubscribeStage()
      cancelAnimationFrame(animationFrameId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameStoreAPI, mapTileSizePx, playerIndicatorYOffsetPx])

  return (
    <aside
      id="mini-map"
      onClick={() => setIsExpanded((prev) => !prev)}
      className={twJoin(
        'mini-map-fade-mask pointer-events-auto fixed bottom-0 z-20 flex max-h-full cursor-pointer items-center justify-center',
        isMapOnRight ? 'right-0' : 'left-0',
        isExpanded
          ? 'overflow-visible bg-linear-0 from-black/50 from-20% to-black/5'
          : 'overflow-hidden bg-black/50',
      )}
      style={{
        width: 33 * mapTileSizePx,
        height: isExpanded ? '100%' : 41 * mapTileSizePx,
      }}>
      <div
        ref={mapRef}
        className="pointer-events-none absolute bottom-0 will-change-transform"
        style={{ width: COLUMNS * mapTileSizePx, height: totalRows * mapTileSizePx }}>
        {(surface.topology === 'cylinder' ? [-1, 0, 1] : [0]).map(copy => (
          <Image
            key={copy}
            src={miniMapAsset}
            alt={copy === 0 ? 'Mini Map' : ''}
            width={mapTileSizePx * COLUMNS}
            height={mapTileSizePx * totalRows}
            className="absolute bottom-0 max-w-none opacity-35 select-none"
            style={{ left: copy * COLUMNS * mapTileSizePx }}
          />
        ))}
      </div>
      <div
        id="mini-map-player"
        className="absolute z-30 rounded-full bg-white"
        style={{
          bottom: playerIndicatorYOffsetPx - playerSizePx / 2,
          width: playerSizePx,
          height: playerSizePx,
        }}
      />
      <ProgressBar ref={progressRef} height={mapTileSizePx * totalRows} />
    </aside>
  )
}

export default MiniMap

type ProgressBarProps = {
  height: number
}

const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(({ height }, forwardedRef) => (
  <div
    className="pointer-events-none absolute inset-x-4 bottom-4 z-10 h-1.5! overflow-hidden rounded-full bg-amber-800"
    style={{ height }}>
    <div
      ref={forwardedRef}
      className="relative h-1.5 w-full rounded-full bg-amber-300 will-change-transform"
      style={{
        transform: 'translate3d(-100%,0,0)',
      }}
    />
  </div>
))

ProgressBar.displayName = 'ProgressBar'
