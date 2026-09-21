import { type FC, type RefObject, useCallback, useEffect, useImperativeHandle } from 'react'

import compassIcon from '@/assets/icons/info-compass.png'
import infoIcon from '@/assets/icons/info-general.png'
import ideaIcon from '@/assets/icons/info-idea.png'
import techIcon from '@/assets/icons/info-technologies.png'
import { useGameStore } from '@/components/GameProvider'
import { InfoZone, type InfoZoneProps } from '@/components/platform/infoZones/infoZone/InfoZone'
import useDynamicRigidBodies from '@/components/platform/useDynamicRigidBodies'
import { INFO_ZONES_CARD_CONTENT } from '@/resources/content'
import { type RowData } from '@/utils/tiles'

export type InfoZonesHandle = {
  moveElements: (zStep: number) => void
  positionElementsIfNeeded: (row: RowData, rowZ: number) => void
  hideElementsIfNeeded: (row: RowData) => void
}

type Props = {
  ref: RefObject<InfoZonesHandle | null>
  onReadyChange: (isReady: boolean) => void
}

const InfoZones: FC<Props> = ({ ref, onReadyChange }) => {
  const totalCount = useGameStore((s) => s.totalCounts.infoZones)

  const { refs, isVisibleStates, translation, applyPlacement, hideRigidBodyAtIndex } =
    useDynamicRigidBodies(totalCount)

  const positionElementsIfNeeded = useCallback(
    (row: RowData, rowZ: number) => {
      if (!row.infoZonePlacements?.length) return
      row.infoZonePlacements.forEach((placement) => {
        applyPlacement(placement, rowZ)
      })
    },
    [applyPlacement],
  )

  const hideElementsIfNeeded = useCallback(
    (row: RowData) => {
      const placements = row.infoZonePlacements
      if (!placements?.length) return
      placements.forEach((placement) => {
        const contentIndex = placement[3]
        if (contentIndex == null) return
        hideRigidBodyAtIndex(contentIndex)
      })
    },
    [hideRigidBodyAtIndex],
  )

  const moveElements = useCallback(
    (zStep: number) => {
      if (zStep === 0) return
      isVisibleStates.forEach((isVisible, index) => {
        if (!isVisible) return
        const body = refs[index]
        if (!body?.current) return
        const currentPosition = body.current.translation()
        translation.current.x = currentPosition.x
        translation.current.y = currentPosition.y
        translation.current.z = currentPosition.z + zStep
        body.current.setTranslation(translation.current, true)
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

  // Has to be inside to access the store hooks.
  function getContentForPlacementIndex(placementIndex: number) {
    return INFO_ZONES_CARD_CONTENT[placementIndex]
  }

  return (
    <>
      {refs.map((ref, index) => {
        return (
          <InfoZone
            key={`info-zone-${index}`}
            zoneKey={`infoZone${index}`}
            ref={ref}
            isVisible={isVisibleStates[index]}
            {...getInfoZoneProps(index)}>
            {getContentForPlacementIndex(index)}
          </InfoZone>
        )
      })}
    </>
  )
}

export default InfoZones

const ICONS = [compassIcon, ideaIcon, techIcon, infoIcon]

function getInfoZoneProps(
  index: number,
): Pick<
  InfoZoneProps,
  'infoContainerClassName' | 'iconSrc' | 'infoContentHtmlProps' | 'infoPositionOffset'
> {
  return {
    infoContainerClassName: 'w-[360px] xl:w-[480px]',
    iconSrc: ICONS[index % ICONS.length].src,
  }
}

// const pad = (value: number): string => value.toString().padStart(2, '0')

// const timeContainer = useRef<HTMLDivElement | null>(null)

// const onTimeChange = useCallback(
//   (elapsedSeconds: number) => {
//     if (!isVisibleStates[3]) return
//     if (!timeContainer.current) return
//     timeContainer.current.textContent = formatTotalTime(elapsedSeconds)
//   },
//   [isVisibleStates],
// )

// const totalTime = useTotalTime(onTimeChange)
// const startSpeedRun = useGameStore((s) => s.startSpeedRun)

// const formatTotalTime = (elapsedSeconds: number): string => {
//   const totalSeconds = Math.floor(elapsedSeconds)
//   const hours = Math.floor(totalSeconds / 3600)
//   const minutes = Math.floor(totalSeconds / 60)
//   const seconds = totalSeconds % 60
//   if (hours > 0) {
//     const remainingMinutes = minutes % 60
//     return `${pad(hours)}:${pad(remainingMinutes)}:${pad(seconds)}`
//   }
//   return `${pad(minutes)}:${pad(seconds)}`
// }

// type TotalTimeDisplayProps = {
//   initialValue: RefObject<number>
//   timeContainer: RefObject<HTMLDivElement | null>
// }

// const TotalTimeDisplay: FC<TotalTimeDisplayProps> = ({ initialValue, timeContainer }) => {
//   return (
//     <section className="relative flex flex-col items-center justify-center gap-3 py-5 text-center">
//       <div>
//         <p className="text-sm font-medium text-white/80">TOTAL TIME</p>
//         <div ref={timeContainer} aria-live="polite" className="text-5xl font-bold sm:text-6xl">
//           {formatTotalTime(initialValue.current ?? 0)}
//         </div>
//       </div>

//       <div className="h-px w-40 bg-white/20" />

//       <div>
//         <p className="text-sm font-medium text-white/80">AVERAGE TIME ON A WEBSITE</p>
//         <p className="text-3xl font-bold">00:53</p>
//       </div>
//     </section>
//   )
// }
