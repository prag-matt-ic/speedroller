'use client'

import { type CreatorState, useLocalNodes } from '@react-three/fiber/webgpu'
import { type Vector3Tuple } from 'three'
import { type InstancedRigidBodyProps } from '@react-three/rapier'
import { type FC, memo, useCallback, useRef } from 'react'

import { Stage, useGameStore } from '@/components/GameProvider'
import { CORE_UNIFORM_SCOPE, type CoreUniforms } from '@/components/coreUniforms'
import FloatingTiles, {
  type FloatingTilesHandle,
} from '@/components/floatingTiles/FloatingTiles'
import Collectibles, {
  type CollectiblesHandle,
} from '@/components/platform/collectibles/Collectibles'
import ColourPickerRow, {
  type ColourPickerHandle,
} from '@/components/platform/colourPicker/ColourPickerRow'
import ConfettiRows, { type ConfettiHandle } from '@/components/platform/confetti/ConfettiRows'
import FloatingHeadings, {
  type FloatingHeadingsHandle,
} from '@/components/platform/floatingHeadings/FloatingHeadings'
import InfoZones, { type InfoZonesHandle } from '@/components/platform/infoZones/InfoZones'
import Rings, { type RingsHandle } from '@/components/platform/rings/Rings'
import { PlatformTiles, type TilesHandle } from '@/components/platform/tiles/Tiles'
import { useGameFrame } from '@/hooks/useGameFrame'
import { usePlayerInput } from '@/hooks/usePlayerInput'
import { usePlayerPosition } from '@/hooks/usePlayerPosition'
import usePlayerSpeed from '@/hooks/usePlayerSpeed'
import useStage from '@/hooks/useStage'
import { GameMode } from '@/stores/types'
import {
  COLUMNS,
  EPSILON,
  ROWS_RENDERED,
  ROW_VISIBILITY_HALF_SPAN,
  type RowData,
  TILE_PLAYER_FADE_FULL_RADIUS,
  TILE_PLAYER_FADE_MIN_ALPHA,
  TILE_PLAYER_FADE_MIN_RADIUS,
  TILE_SIZE,
  clamp,
  colToX,
  lerp,
  raisedMaskToY,
} from '@/utils/tiles'

import SpeedRunElements, { type SpeedRunElementsHandle } from './speedRun/SpeedRunElements'
import { EMPTY_ROW_INDEX, usePlayerRespawn } from './usePlayerRespawn'
import useReadyState, { type ReadyState, type ReadyStateKey } from './useReadyState'

const IS_DEV_ENV = process.env.NODE_ENV !== 'production'

const EMPTY_ROW_DATA: RowData = {
  isRaised: Array.from({ length: COLUMNS }, () => 0),
  stage: Stage.OBSTACLES,
  isSectionStart: false,
  isSectionEnd: false,
  rowIndex: EMPTY_ROW_INDEX,
}

const FADE_FULL_RADIUS_SQ = TILE_PLAYER_FADE_FULL_RADIUS * TILE_PLAYER_FADE_FULL_RADIUS
const FADE_MIN_RADIUS_SQ = TILE_PLAYER_FADE_MIN_RADIUS * TILE_PLAYER_FADE_MIN_RADIUS
const ROW_FADE_DENOM = Math.max(EPSILON.SMALL, FADE_MIN_RADIUS_SQ - FADE_FULL_RADIUS_SQ)
const ROW_CYCLE_DISTANCE = ROWS_RENDERED * TILE_SIZE
const ROWS_COVERAGE_HALF_SPAN = (ROWS_RENDERED - 1) * TILE_SIZE * 0.5
const VISIBILITY_WINDOW_SPAN = ROW_VISIBILITY_HALF_SPAN * 2
const INITIAL_ROW_BACK_OFFSET_ROWS = 16
const INITIAL_ROW_BACK_OFFSET = INITIAL_ROW_BACK_OFFSET_ROWS * TILE_SIZE

const warnVisibilityCoverageIfNeeded = (() => {
  let hasWarned = false
  return () => {
    if (hasWarned || !IS_DEV_ENV) return
    if (VISIBILITY_WINDOW_SPAN > ROW_CYCLE_DISTANCE) {
      console.warn(
        `[Platform] Visibility span (${VISIBILITY_WINDOW_SPAN.toFixed(
          2,
        )}) exceeds instanced coverage (${ROW_CYCLE_DISTANCE.toFixed(
          2,
        )}). Expect reduced buffer or inc rease ROWS_RENDERED.`,
      )
    }
    hasWarned = true
  }
})()

function getRowAlpha(rowZ: number, playerZ: number): number {
  // Rows in front of the player (z >= 0) are either behind the camera or immediately adjacent,
  // so skip distance-based fading to save per-frame math.
  if (rowZ > 0) return 1
  const dz = rowZ - playerZ
  const distSq = dz * dz
  const fadeT = clamp((distSq - FADE_FULL_RADIUS_SQ) / ROW_FADE_DENOM, 0, 1)
  return lerp(1, TILE_PLAYER_FADE_MIN_ALPHA, fadeT)
}

// The core uniforms as `GameUniforms` registered them. Module scope keeps the creator identity
// stable, so `useLocalNodes` only re-runs it when the registry itself changes.
const readCoreUniforms = ({ uniforms }: CreatorState) => {
  const { uScrollZ, uPlayerWorldPos } = uniforms.scope<CoreUniforms>(CORE_UNIFORM_SCOPE)
  return { uScrollZ, uPlayerWorldPos }
}

const Platform: FC = () => {
  const resetPlatformTick = useGameStore((s) => s.resetPlatformTick)
  const isPlatformReady = useGameStore((s) => s.isPlatformReady)
  const setIsPlatformReady = useGameStore((s) => s.setIsPlatformReady)
  const goToStage = useGameStore((s) => s.goToStage)
  const setCurrentRow = useGameStore((s) => s.setCurrentRow)
  const mode = useGameStore((s) => s.mode)
  const isSpeedRunMode = mode === GameMode.SPEEDRUN
  const rowsData = useGameStore((s) => s.rowsData)
  const stageRef = useStage()

  usePlayerPosition((newPosition: Vector3Tuple) => {
    coreUniforms.uPlayerWorldPos.value.set(newPosition[0], newPosition[1], newPosition[2])
  })

  const { input } = usePlayerInput()
  const { speedUnits: playerSpeedUnits } = usePlayerSpeed()

  // Owns the per-frame world state the tile, floating-tile and heading graphs read.
  //
  // Read through `CreatorState` rather than `useUniforms(scope)`. The reader form only sees the
  // committed store, and `GameUniforms` stages the core scope until its layout effect runs, so a
  // reader here comes back empty on the first render — which `usePlayerPosition`'s mount callback
  // would then be handed. `CreatorState` overlays the staged registry, so the nodes exist already.
  const coreUniforms = useLocalNodes(readCoreUniforms)

  // Deterministic scrolling state
  const currentScrollPosition = useRef(0)
  const baseZByRow = useRef<number[]>([])
  const wrapCountByRow = useRef<number[]>([])
  const rowZByIndex = useRef<number[]>([])
  const rowBaseWithoutScroll = useRef<number[]>([])
  const rowIsVisible = useRef<boolean[]>([])
  const xByBodyIndex = useRef<number[]>([])
  const yByBodyIndex = useRef<number[]>([])

  const translation = useRef<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 })

  // Precomputed row sequence
  const rowsDataRef = useRef<RowData[]>([])
  const nextRowDataIndex = useRef(0)
  const activeRowsData = useRef<RowData[]>([])
  const nextAbsoluteRowIndex = useRef(0)

  const tiles = useRef<TilesHandle | null>(null)
  const ringsHandle = useRef<RingsHandle | null>(null)
  const floatingHeadings = useRef<FloatingHeadingsHandle | null>(null)
  const collectibles = useRef<CollectiblesHandle | null>(null)
  const infoZones = useRef<InfoZonesHandle | null>(null)
  const speedRunElements = useRef<SpeedRunElementsHandle | null>(null)
  const floatingTilesHandle = useRef<FloatingTilesHandle | null>(null)
  const confettiHandle = useRef<ConfettiHandle | null>(null)
  const colourPickerHandle = useRef<ColourPickerHandle | null>(null)

  const setupInitialRowsAndTiles = useCallback(() => {
    const tilesHandle = tiles.current

    if (!tilesHandle) {
      console.error('[Platform] Missing tiles handle when initializing platform.')
      return
    }

    // Reset state
    rowsDataRef.current = rowsData
    nextAbsoluteRowIndex.current = 0
    nextRowDataIndex.current = 0
    activeRowsData.current = []
    baseZByRow.current = []
    wrapCountByRow.current = []
    rowZByIndex.current = []
    rowBaseWithoutScroll.current = []
    rowIsVisible.current = []
    xByBodyIndex.current = []
    yByBodyIndex.current = []
    currentScrollPosition.current = 0

    const tileInstances: InstancedRigidBodyProps[] = []

    const playerZ = 0
    const initialHalfSpan = Math.min(ROW_VISIBILITY_HALF_SPAN, ROWS_COVERAGE_HALF_SPAN)
    const nextStartZ = playerZ + initialHalfSpan - INITIAL_ROW_BACK_OFFSET
    if (IS_DEV_ENV) {
      console.warn(
        `[Platform] Initializing rows around playerZ=${playerZ.toFixed(
          2,
        )} with startZ=${nextStartZ.toFixed(2)} (halfSpan=${initialHalfSpan.toFixed(2)}).`,
      )
    }
    warnVisibilityCoverageIfNeeded()

    let nextRowZ = nextStartZ

    const tilesVisibility = tilesHandle.visibilityData
    const tilesSeed = tilesHandle.seedData
    const tilesHighlighted = tilesHandle.highlightedData

    if (!tilesVisibility || !tilesSeed || !tilesHighlighted) {
      console.error('[Platform] Missing tile instance attributes data.')
      return
    }

    for (let rowIndex = 0; rowIndex < ROWS_RENDERED; rowIndex++) {
      const rowData = rowsDataRef.current[rowIndex] ?? EMPTY_ROW_DATA
      activeRowsData.current[rowIndex] = rowData
      baseZByRow.current[rowIndex] = nextRowZ
      rowZByIndex.current[rowIndex] = nextRowZ
      rowBaseWithoutScroll.current[rowIndex] = nextRowZ
      wrapCountByRow.current[rowIndex] = 0
      rowIsVisible.current[rowIndex] = false
      floatingTilesHandle.current?.setRowData(rowIndex, rowData)

      for (let columnIndex = 0; columnIndex < COLUMNS; columnIndex++) {
        const x = colToX(columnIndex)
        const z = nextRowZ
        const raisedMask = (rowData.isRaised[columnIndex] ?? 0) as 0 | 1
        const y = raisedMaskToY(raisedMask)
        const bodyIndex = rowIndex * COLUMNS + columnIndex
        xByBodyIndex.current[bodyIndex] = x
        yByBodyIndex.current[bodyIndex] = y

        tilesVisibility![bodyIndex] = raisedMask
        tilesSeed![bodyIndex] = Math.random()
        tilesHighlighted![bodyIndex] = rowData.isHighlighted?.[columnIndex] ?? 0

        tileInstances.push({
          key: `tile-${rowIndex}-${columnIndex}`,
          position: [x, y, z],
          userData: { type: 'tile', rowIndex, colIndex: columnIndex },
        })
      }

      nextRowZ -= TILE_SIZE
    }

    tilesHandle.setTileInstances(tileInstances)
    floatingTilesHandle.current?.setRowWorldPositions(rowBaseWithoutScroll.current)
    nextRowDataIndex.current = ROWS_RENDERED
    markInstanceAttributesDirty()
    setIsPlatformReady(true)
  }, [rowsData, setIsPlatformReady])

  const checkReady = useCallback(
    (currentReadyState: ReadyState) => {
      if (isPlatformReady || rowsData.length === 0) return
      const isSpeedRunMode = mode === GameMode.SPEEDRUN

      const shouldSkipReadyCheck = (key: ReadyStateKey): boolean => {
        if (isSpeedRunMode && key === 'headings') return true
        if (isSpeedRunMode && key === 'collectibles') return true
        if (isSpeedRunMode && key === 'infoZones') return true
        if (isSpeedRunMode && key === 'colourPicker') return true
        return false
      }

      const areElementsReady = (
        Object.entries(currentReadyState) as unknown as Array<[ReadyStateKey, boolean]>
      ).every(([key, value]) => {
        if (shouldSkipReadyCheck(key)) return true
        return value
      })

      if (!areElementsReady) return
      setupInitialRowsAndTiles()
    },
    [isPlatformReady, rowsData, mode, setupInitialRowsAndTiles],
  )

  const { readyChangeHandlers } = useReadyState(checkReady, [resetPlatformTick, rowsData])

  const { targetScrollPosition, onRespawnScrollComplete } = usePlayerRespawn({
    activeRowsData,
    rowZByIndex,
    currentScrollPosition,
    isPlatformReady,
  })

  function updateInstanceAttributesForRow(rowIndex: number, newRowData?: RowData) {
    const data = newRowData ?? EMPTY_ROW_DATA
    const visibilityData = tiles.current?.visibilityData
    const highlightedData = tiles.current?.highlightedData
    if (!visibilityData || !highlightedData) return
    activeRowsData.current[rowIndex] = data
    floatingTilesHandle.current?.setRowData(rowIndex, data)

    for (let columnIndex = 0; columnIndex < COLUMNS; columnIndex++) {
      const bodyIndex = rowIndex * COLUMNS + columnIndex
      const raisedMask = (data.isRaised[columnIndex] ?? 0) as 0 | 1
      const y = raisedMaskToY(raisedMask)
      yByBodyIndex.current[bodyIndex] = y
      visibilityData[bodyIndex] = raisedMask
      highlightedData[bodyIndex] = data.isHighlighted?.[columnIndex] ?? 0
    }
  }

  function markInstanceAttributesDirty() {
    if (tiles.current?.visibilityAttribute) {
      tiles.current.visibilityAttribute.needsUpdate = true
    }
    if (tiles.current?.highlightedAttribute) {
      tiles.current.highlightedAttribute.needsUpdate = true
    }
  }

  function hideElements(rowIndex: number) {
    const row = activeRowsData.current[rowIndex]
    if (!row) return
    floatingHeadings.current?.hideElementsIfNeeded(row)
    infoZones.current?.hideElementsIfNeeded(row)
    collectibles.current?.hideElementsIfNeeded(row)
    confettiHandle.current?.hideElementsIfNeeded(row)
    ringsHandle.current?.hideElementsIfNeeded(row)
    speedRunElements.current?.hideElementsIfNeeded(row)
    colourPickerHandle.current?.hideElementsIfNeeded(row)
  }

  function positionElements(rowIndex: number, rowZ: number) {
    const row = activeRowsData.current[rowIndex]
    if (!row) return
    floatingHeadings.current?.positionElementsIfNeeded(row, rowZ)
    infoZones.current?.positionElementsIfNeeded(row, rowZ)
    collectibles.current?.positionElementsIfNeeded(row, rowZ)
    confettiHandle.current?.positionElementsIfNeeded(row, rowZ)
    ringsHandle.current?.positionElementsIfNeeded(row, rowZ)
    speedRunElements.current?.positionElementsIfNeeded(row, rowZ)
    colourPickerHandle.current?.positionElementsIfNeeded(row, rowZ)
  }

  function getRowIndexClosestToOrigin() {
    let bestIndex = -1
    let smallestAbsZ = Infinity

    for (let rowIndex = 0; rowIndex < ROWS_RENDERED; rowIndex++) {
      const rowZ = rowZByIndex.current[rowIndex]
      if (typeof rowZ !== 'number') continue
      const absZ = Math.abs(rowZ)
      if (absZ < smallestAbsZ) {
        smallestAbsZ = absZ
        bestIndex = rowIndex
      }
    }

    return bestIndex
  }

  function updateCurrentRowState(rowIndex: number) {
    const currentRowIndex = activeRowsData.current[rowIndex]?.rowIndex ?? 0
    setCurrentRow(currentRowIndex)
  }

  function applyStageForRow(rowIndex: number) {
    const row = activeRowsData.current[rowIndex]
    if (!row) return

    if (row.stage === Stage.HOME && stageRef.current !== Stage.HOME) {
      goToStage(Stage.HOME)
      return
    }

    if (row.stage === Stage.INFO && stageRef.current !== Stage.INFO) {
      goToStage(Stage.INFO)
      return
    }

    if (row.stage === Stage.OBSTACLES && stageRef.current !== Stage.OBSTACLES) {
      goToStage(Stage.OBSTACLES)
      return
    }

    if (row.stage === Stage.CTA && stageRef.current !== Stage.CTA) {
      goToStage(Stage.CTA)
      return
    }

    if (row.stage === Stage.SPEED_RUN_FINISH && stageRef.current !== Stage.CTA) {
      goToStage(Stage.CTA)
      return
    }
  }

  function applyForwardRowWraps(rowIndex: number, wrapsToApply: number): void {
    if (wrapsToApply <= 0) return
    let wrapsApplied = 0

    for (; wrapsApplied < wrapsToApply; wrapsApplied++) {
      hideElements(rowIndex)
      rowIsVisible.current[rowIndex] = false
      const newRowData = rowsDataRef.current[nextRowDataIndex.current] ?? EMPTY_ROW_DATA
      updateInstanceAttributesForRow(rowIndex, newRowData)
      nextRowDataIndex.current++
    }

    if (wrapsApplied > 0) {
      markInstanceAttributesDirty()
    }
  }

  function applyBackwardRowWraps(rowIndex: number, wrapsToApply: number): void {
    if (wrapsToApply <= 0) return
    let wrapsApplied = 0

    for (; wrapsApplied < wrapsToApply; wrapsApplied++) {
      hideElements(rowIndex)
      rowIsVisible.current[rowIndex] = false
      nextRowDataIndex.current = Math.max(0, nextRowDataIndex.current - 1)
      const earliestRowIndex = nextRowDataIndex.current - ROWS_RENDERED
      const newRowData =
        earliestRowIndex >= 0 ? rowsDataRef.current[earliestRowIndex] : EMPTY_ROW_DATA
      updateInstanceAttributesForRow(rowIndex, newRowData)
    }

    if (wrapsApplied > 0) {
      markInstanceAttributesDirty()
    }
  }

  function setTileTranslations(rowIndex: number, rowZ: number) {
    const firstBodyIndex = rowIndex * COLUMNS
    const rigidBodies = tiles.current?.rigidBodies
    if (!rigidBodies) return

    for (let columnIndex = 0; columnIndex < COLUMNS; columnIndex++) {
      const body = rigidBodies[firstBodyIndex + columnIndex]
      if (!body) continue

      const bodyIndex = firstBodyIndex + columnIndex
      translation.current.x = xByBodyIndex.current[bodyIndex]
      const baseY = yByBodyIndex.current[bodyIndex]
      translation.current.y = baseY
      translation.current.z = rowZ
      body.setTranslation(translation.current, false)
    }
  }

  function updateTiles() {
    if (!tiles.current?.rigidBodies) return
    const cycleDistance = ROW_CYCLE_DISTANCE
    const maxZ = ROW_VISIBILITY_HALF_SPAN
    const minZ = -ROW_VISIBILITY_HALF_SPAN
    let rowBasesChanged = false

    for (let rowIndex = 0; rowIndex < ROWS_RENDERED; rowIndex++) {
      let rowZ = baseZByRow.current[rowIndex] + currentScrollPosition.current
      let wraps = 0

      while (rowZ >= maxZ) {
        rowZ -= cycleDistance
        wraps++
      }

      while (rowZ < minZ) {
        rowZ += cycleDistance
        wraps--
      }

      const previousWraps = wrapCountByRow.current[rowIndex]
      if (wraps > previousWraps) {
        applyForwardRowWraps(rowIndex, wraps - previousWraps)
      } else if (wraps < previousWraps) {
        applyBackwardRowWraps(rowIndex, previousWraps - wraps)
      }
      wrapCountByRow.current[rowIndex] = wraps

      setTileTranslations(rowIndex, rowZ)
      rowZByIndex.current[rowIndex] = rowZ
      const rowBase = rowZ - currentScrollPosition.current
      if (rowBaseWithoutScroll.current[rowIndex] !== rowBase) {
        rowBaseWithoutScroll.current[rowIndex] = rowBase
        rowBasesChanged = true
      }

      const wasVisible = rowIsVisible.current[rowIndex] === true
      const rowAlpha = getRowAlpha(rowZ, 0)
      const isVisible = rowAlpha > TILE_PLAYER_FADE_MIN_ALPHA
      if (wasVisible !== isVisible) {
        rowIsVisible.current[rowIndex] = isVisible
        if (isVisible) {
          positionElements(rowIndex, rowZ)
        } else {
          hideElements(rowIndex)
        }
      }
    }

    const stageRowIndex = getRowIndexClosestToOrigin()
    if (stageRowIndex >= 0) {
      applyStageForRow(stageRowIndex)
      updateCurrentRowState(stageRowIndex)
    }

    if (rowBasesChanged) {
      floatingTilesHandle.current?.setRowWorldPositions(rowBaseWithoutScroll.current)
    }
  }

  useGameFrame((_, delta) => {
    if (!isPlatformReady) return
    if (!coreUniforms?.uScrollZ) return
    if (!ringsHandle.current || !confettiHandle.current) return
    if (!speedRunElements.current) return

    if (!isSpeedRunMode && !floatingHeadings.current) return
    if (!isSpeedRunMode && !collectibles.current) return
    if (!isSpeedRunMode && !infoZones.current) return

    coreUniforms.uScrollZ.value = currentScrollPosition.current

    const inputDirectionZ = input.current.up - input.current.down
    const speedUnits = playerSpeedUnits.current
    const zStep = inputDirectionZ * speedUnits * delta

    const previousScroll = currentScrollPosition.current

    currentScrollPosition.current += zStep

    // Scroll platform towards target position if set
    if (!!targetScrollPosition.current) {
      currentScrollPosition.current = lerp(
        currentScrollPosition.current,
        targetScrollPosition.current,
        10.0 * delta,
      )
      if (Math.abs(currentScrollPosition.current - targetScrollPosition.current) < 0.01) {
        currentScrollPosition.current = targetScrollPosition.current
        onRespawnScrollComplete()
      }
    }

    const totalScrollDelta = currentScrollPosition.current - previousScroll

    updateTiles()
    floatingTilesHandle.current?.step(delta)

    if (Math.abs(totalScrollDelta) < EPSILON.SMALL) return

    if (!isSpeedRunMode) {
      floatingHeadings.current!.moveElements(totalScrollDelta)
      collectibles.current!.moveElements(totalScrollDelta)
      infoZones.current!.moveElements(totalScrollDelta)
      colourPickerHandle.current?.moveElements(totalScrollDelta)
    }

    ringsHandle.current.moveElements(totalScrollDelta)
    confettiHandle.current.moveElements(totalScrollDelta)
    speedRunElements.current.moveElements(totalScrollDelta)
  })

  return (
    <group>
      <FloatingTiles
        ref={floatingTilesHandle}
        key={`floating-tiles-${resetPlatformTick}`}
        onReadyChange={readyChangeHandlers.floatingTiles}
      />

      <PlatformTiles
        ref={tiles}
        key={`platform-tiles-${resetPlatformTick}`}
        onReadyChange={readyChangeHandlers.tiles}
      />

      {!isSpeedRunMode && (
        <FloatingHeadings
          ref={floatingHeadings}
          key={`floating-headings-${resetPlatformTick}`}
          onReadyChange={readyChangeHandlers.headings}
        />
      )}

      <ConfettiRows
        ref={confettiHandle}
        key={`confetti-${resetPlatformTick}`}
        onReadyChange={readyChangeHandlers.confetti}
      />

      {!isSpeedRunMode && (
        <InfoZones
          ref={infoZones}
          key={`info-zones-${resetPlatformTick}`}
          onReadyChange={readyChangeHandlers.infoZones}
        />
      )}

      {!isSpeedRunMode && (
        <Collectibles
          ref={collectibles}
          key={`collectibles-${resetPlatformTick}`}
          onReadyChange={readyChangeHandlers.collectibles}
        />
      )}

      {!isSpeedRunMode && (
        <ColourPickerRow
          ref={colourPickerHandle}
          key={`colour-picker-${resetPlatformTick}`}
          onReadyChange={readyChangeHandlers.colourPicker}
        />
      )}

      <Rings
        ref={ringsHandle}
        key={`rings-${resetPlatformTick}`}
        onReadyChange={readyChangeHandlers.rings}
      />

      <SpeedRunElements
        ref={speedRunElements}
        key={`speedrun-elements-${resetPlatformTick}`}
        onReadyChange={readyChangeHandlers.speedRun}
      />
    </group>
  )
}

export default memo(Platform, () => true)
