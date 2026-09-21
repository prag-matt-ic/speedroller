import { type FC, type RefObject, useCallback, useEffect, useImperativeHandle } from 'react'
import { type Vector3Tuple } from 'three'

import { useGameStore } from '@/components/GameProvider'
import { FloatingHeading } from '@/components/platform/floatingHeadings/floatingHeading/FloatingHeading'
import { HEADINGS_CONTENT } from '@/resources/content'
import { HEADING_HEIGHT, HEADING_POSITION_OFFSET_Z, HEADING_WIDTH } from '@/utils/platform/floatingHeading'
import { HIDDEN_POSITION, type RowData } from '@/utils/tiles'

import useDynamicMeshes from '../useDynamicMeshes'

export type FloatingHeadingsHandle = {
  moveElements: (zStep: number) => void
  positionElementsIfNeeded: (row: RowData, rowZ: number) => void
  hideElementsIfNeeded: (row: RowData) => void
}

type Props = {
  ref: RefObject<FloatingHeadingsHandle | null>
  onReadyChange: (isReady: boolean) => void
}

// Offset because the text is in a cylinder, causing it to appear further away that it should be.
const HEADING_POSITION_OFFSET: Vector3Tuple = [0, 0, HEADING_POSITION_OFFSET_Z]

const FloatingHeadings: FC<Props> = ({ ref, onReadyChange }) => {
  const totalCount = useGameStore((s) => s.totalCounts.headings)

  const { refs, isVisibleStates, translation, hideMeshAtIndex, applyPlacement } =
    useDynamicMeshes(totalCount, HEADING_POSITION_OFFSET)

  const positionElementsIfNeeded = useCallback(
    (row: RowData, rowZ: number) => {
      const placements = row.floatingHeadingPlacements
      if (!placements?.length) return
      placements.forEach((placement) => {
        applyPlacement(placement, rowZ)
      })
    },
    [applyPlacement],
  )

  const hideElementsIfNeeded = useCallback(
    (row: RowData) => {
      const placements = row.floatingHeadingPlacements
      if (!placements?.length) return
      placements.forEach((placement) => {
        const contentIndex = placement[3]
        if (contentIndex == null) return
        hideMeshAtIndex(contentIndex)
      })
    },
    [hideMeshAtIndex],
  )

  const moveElements = useCallback(
    (zStep: number) => {
      if (zStep === 0) return
      isVisibleStates.forEach((isVisible, index) => {
        if (!isVisible) return
        const mesh = refs[index]
        if (!mesh?.current) return
        const currentPosition = mesh.current.position
        translation.current.x = currentPosition.x
        translation.current.y = currentPosition.y
        translation.current.z = currentPosition.z + zStep
        mesh.current.position.set(
          translation.current.x,
          translation.current.y,
          translation.current.z,
        )
      })
    },
    [isVisibleStates, refs, translation],
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
    <>
      {refs.map((ref, contentIndex) => {
        const heading = HEADINGS_CONTENT[contentIndex]
        const text = heading?.text ?? ''
        return (
          <FloatingHeading
            key={`info-floating-heading-${contentIndex}`}
            ref={ref}
            text={text}
            position={HIDDEN_POSITION}
            width={HEADING_WIDTH}
            height={HEADING_HEIGHT}
            textCanvasOptions={heading?.textCanvasOptions}
            isVisible={isVisibleStates[contentIndex]}
          />
        )
      })}
    </>
  )
}

export default FloatingHeadings
