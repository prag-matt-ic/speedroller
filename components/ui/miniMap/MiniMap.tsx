import { useMediaQuery } from '@mantine/hooks'
import Image from 'next/image'
import { type FC, forwardRef, useEffect, useRef, useState } from 'react'
import { twJoin } from 'tailwind-merge'

import { useGameStore, useGameStoreAPI } from '@/components/GameProvider'
import { usePlayerPosition } from '@/hooks/usePlayerPosition'
import { PLATFORM_VERSION } from '@/resources/rowsData'
import { GameMode, InputType } from '@/stores/types'
import { COLUMNS, TILE_SIZE } from '@/utils/tiles'

const MINI_MAP_ASSET_BASE = `/maps/${PLATFORM_VERSION}`
const MINI_MAP_ASSET_PATHS: Record<GameMode, string> = {
  [GameMode.LEARN]: `${MINI_MAP_ASSET_BASE}/learn.svg`,
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
  const gameStoreAPI = useGameStoreAPI()
  const mode = useGameStore((s) => s.mode)
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
    progressStartRow,
    progressRange,
  } = getProgressWindow(totalRows)

  // const totalRowsRef = useRef(totalRows)
  const rowsToPixelsRef = useRef(
    totalRows === 0 ? 0 : (mapTileSizePx * totalRows) / Math.max(1, initialMaxRowIndex),
  )
  const maxRowIndexRef = useRef(initialMaxRowIndex)
  const progressStartRowRef = useRef(progressStartRow)
  const progressRangeRef = useRef(progressRange)

  const miniMapAsset = MINI_MAP_ASSET_PATHS[mode] ?? MINI_MAP_ASSET_PATHS[GameMode.LEARN]

  const progressRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<HTMLImageElement | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)

  const { playerPosition } = usePlayerPosition()

  useEffect(() => {
    const {
      maxRowIndex,
      progressRange: newProgressRange,
      progressStartRow: newProgressStartRow,
    } = getProgressWindow(totalRows)
    const denominator = Math.max(1, maxRowIndex)
    rowsToPixelsRef.current = totalRows === 0 ? 0 : (mapTileSizePx * totalRows) / denominator
    maxRowIndexRef.current = maxRowIndex
    progressStartRowRef.current = newProgressStartRow
    progressRangeRef.current = newProgressRange
  }, [mapTileSizePx, totalRows])

  useEffect(() => {
    let currentRow = gameStoreAPI.getState().currentRow
    let lastXRef = 0
    let lastYRef = 0
    let lastProgressRef = -1

    const updateProgress = (row: number) => {
      if (!progressRef.current) return
      const rowsProgress = Math.min(
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

    const unsubscribe = gameStoreAPI.subscribe(
      (s) => s.currentRow,
      (newCurrentRow) => {
        currentRow = newCurrentRow
        updateProgress(newCurrentRow)
      },
    )

    return () => {
      unsubscribe()
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
        width: COLUMNS * mapTileSizePx,
        height: isExpanded ? '100%' : (COLUMNS + 8) * mapTileSizePx,
      }}>
      <Image
        src={miniMapAsset}
        ref={mapRef}
        alt="Mini Map"
        width={mapTileSizePx * COLUMNS}
        height={mapTileSizePx * totalRows}
        className="pointer-events-none absolute bottom-0 opacity-35 transition-transform duration-100 ease-linear will-change-transform select-none"
        style={{
          transform: 'translate3d(0,0,0)',
        }}
      />
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
    className="pointer-events-none absolute inset-x-4 bottom-4 z-10 h-1.5! overflow-hidden rounded-full bg-teal-800"
    style={{ height }}>
    <div
      ref={forwardedRef}
      className="relative h-1.5 w-full rounded-full bg-teal-300 will-change-transform"
      style={{
        transform: 'translate3d(-100%,0,0)',
      }}
    />
  </div>
))

ProgressBar.displayName = 'ProgressBar'
