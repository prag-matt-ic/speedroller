'use client'

import { RapierRigidBody } from '@react-three/rapier'
import {
  type FC,
  type RefObject,
  createRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Mesh, type Vector3Tuple } from 'three'

import { useGameStore } from '@/components/GameProvider'
import { PALETTE_COUNT } from '@/components/palette'
import { Text } from '@/components/platform/Text'
import ColourTile, {
  type ColourTileOption,
} from '@/components/platform/colourPicker/ColourTile'
import { UNBOUNDED_FONT_FAMILY } from '@/components/platform/fonts'
import { type ColourTileUserData } from '@/model/schema'
import { HIDDEN_POSITION, ON_TILE_Y, type RowData, TILE_SIZE } from '@/utils/tiles'

export type ColourPickerHandle = {
  moveElements: (zStep: number) => void
  positionElementsIfNeeded: (row: RowData, rowZ: number) => void
  hideElementsIfNeeded: (row: RowData) => void
}

type Props = {
  ref: RefObject<ColourPickerHandle | null>
  onReadyChange: (isReady: boolean) => void
}

const OPTION_X_OFFSETS = [-4.5, -1.5, 1.5, 4.5].map((offset) => offset * TILE_SIZE)
const COLOUR_PICKER_Z_OFFSET = -TILE_SIZE * 0.5

const COLOUR_PICKER_TEXT_WIDTH = 5
const COLOUR_PICKER_TEXT_HEIGHT = 2
const COLOUR_PICKER_TEXT_Y_OFFSET = 0.005
const COLOUR_PICKER_TEXT_Z_OFFSET = COLOUR_PICKER_Z_OFFSET + COLOUR_PICKER_TEXT_HEIGHT
const COLOUR_PICKER_TEXT_LABEL = 'Paint Shop'

const createOptions = (x: number, y: number, z: number): ColourTileOption[] =>
  OPTION_X_OFFSETS.map((offset, index) => ({
    index,
    position: [x + offset, y, z + COLOUR_PICKER_Z_OFFSET] as Vector3Tuple,
    relativeZ: 0,
    userData: {
      type: 'colour-tile',
      paletteIndex: index,
    } satisfies ColourTileUserData,
  }))

const ColourPickerRow: FC<Props> = ({ ref, onReadyChange }) => {
  const paletteIndex = useGameStore((s) => s.paletteIndex)
  const [options, setOptions] = useState<ColourTileOption[]>(() =>
    createOptions(HIDDEN_POSITION[0], HIDDEN_POSITION[1], HIDDEN_POSITION[2]),
  )

  const optionRefs = useMemo<RefObject<RapierRigidBody | null>[]>(
    () => Array.from({ length: PALETTE_COUNT }, () => createRef<RapierRigidBody | null>()),
    [],
  )
  const textRef: RefObject<Mesh | null> = useRef(null)
  const textPosition = useRef<Vector3Tuple>([...HIDDEN_POSITION])

  const translation = useRef({
    x: HIDDEN_POSITION[0],
    y: HIDDEN_POSITION[1],
    z: HIDDEN_POSITION[2],
  })

  const isOutOfView = useRef(true)

  const updateTextPosition = useCallback((x: number, y: number, z: number) => {
    textPosition.current[0] = x
    textPosition.current[1] = y
    textPosition.current[2] = z
    if (!textRef.current) return
    textRef.current.position.set(x, y, z)
  }, [])

  const positionText = useCallback(
    (x: number, y: number, targetZ: number) => {
      const nextY = y + COLOUR_PICKER_TEXT_Y_OFFSET
      const nextZ = targetZ + COLOUR_PICKER_TEXT_Z_OFFSET
      updateTextPosition(x, nextY, nextZ)
    },
    [updateTextPosition],
  )

  const positionElementsIfNeeded = useCallback(
    (row: RowData, rowZ: number) => {
      const placement = row.colourPickerPlacement
      if (!placement) return
      const [x, y, relativeZ] = placement
      const targetZ = rowZ + relativeZ

      setOptions(createOptions(x, y, targetZ))
      positionText(x, y, targetZ)

      optionRefs.forEach((bodyRef, index) => {
        const body = bodyRef.current
        if (!body) return
        translation.current.x = x + OPTION_X_OFFSETS[index]
        translation.current.y = y
        translation.current.z = targetZ + COLOUR_PICKER_Z_OFFSET
        body.setTranslation(translation.current, true)
      })

      isOutOfView.current = false
    },
    [optionRefs, positionText],
  )

  const hideElementsIfNeeded = useCallback(
    (row: RowData) => {
      if (!row.colourPickerPlacement) return
      optionRefs.forEach((bodyRef) => {
        const body = bodyRef.current
        if (!body) return
        translation.current.x = HIDDEN_POSITION[0]
        translation.current.y = HIDDEN_POSITION[1]
        translation.current.z = HIDDEN_POSITION[2]
        body.setTranslation(translation.current, true)
      })
      updateTextPosition(HIDDEN_POSITION[0], HIDDEN_POSITION[1], HIDDEN_POSITION[2])
      setOptions(createOptions(HIDDEN_POSITION[0], HIDDEN_POSITION[1], HIDDEN_POSITION[2]))
      isOutOfView.current = true
    },
    [optionRefs, updateTextPosition],
  )

  const moveElements = useCallback(
    (zStep: number) => {
      if (zStep === 0 || isOutOfView.current) return
      optionRefs.forEach((bodyRef) => {
        const body = bodyRef.current
        if (!body) return
        const currentPosition = body.translation()
        translation.current.x = currentPosition.x
        translation.current.y = currentPosition.y
        translation.current.z = currentPosition.z + zStep
        body.setTranslation(translation.current, true)
      })
      const currentTextZ = textPosition.current[2]
      const nextTextZ = currentTextZ + zStep
      updateTextPosition(textPosition.current[0], textPosition.current[1], nextTextZ)
    },
    [optionRefs, updateTextPosition],
  )

  useImperativeHandle(
    ref,
    () => ({
      moveElements,
      positionElementsIfNeeded,
      hideElementsIfNeeded,
    }),
    [hideElementsIfNeeded, moveElements, positionElementsIfNeeded],
  )

  useEffect(() => {
    onReadyChange(true)
    return () => {
      onReadyChange(false)
    }
  }, [onReadyChange])

  return (
    <group>
      {options.map((option) => (
        <ColourTile
          ref={optionRefs[option.index]}
          key={option.index}
          option={option}
          isActive={option.index === paletteIndex}
        />
      ))}
      <Text
        ref={textRef}
        text={COLOUR_PICKER_TEXT_LABEL}
        position={HIDDEN_POSITION}
        width={COLOUR_PICKER_TEXT_WIDTH}
        height={COLOUR_PICKER_TEXT_HEIGHT}
        textCanvasOptions={{ fontFamily: UNBOUNDED_FONT_FAMILY }}
      />
    </group>
  )
}

export default ColourPickerRow
