import {
  AlertTriangleIcon,
  ArrowBigDownDashIcon,
  FlameIcon,
  LaughIcon,
  MoveIcon,
  RotateCcwIcon,
  SparklesIcon,
  TrendingUpIcon,
} from 'lucide-react'

import { type HudIndicatorConfig } from '@/components/GameProvider'
import { InputType, type OutOfBoundsEvent } from '@/stores/types'

export const MOVE_HUD_CONFIG: Record<InputType, HudIndicatorConfig> = {
  [InputType.KEYS]: {
    id: 'move-keys',
    autoDismissS: 4,
    Icon: MoveIcon,
    label: (
      <>
        <b>Arrow keys</b> to move
      </>
    ),
  },
  [InputType.JOYSTICK]: {
    id: 'move-joystick',
    autoDismissS: 4,
    Icon: MoveIcon,
    label: (
      <>
        <b>Touch joystick</b> to move
      </>
    ),
  },
}

export const OUT_OF_BOUNDS_HUD_CONFIG: HudIndicatorConfig[] = [
  {
    id: 'oob-1',
    autoDismissS: 3,
    Icon: AlertTriangleIcon,
    label: 'Nothing much down there!',
  },
  {
    id: 'oob-2',
    autoDismissS: 3,
    Icon: RotateCcwIcon,
    label: (
      <>
        You unlocked <b>1 free life</b>
      </>
    ),
  },
  {
    id: 'oob-3',
    autoDismissS: 3,
    Icon: SparklesIcon,
    label: (
      <>
        <b>No secrets</b> to see
      </>
    ),
  },
  {
    id: 'oob-4',
    autoDismissS: 3,
    Icon: ArrowBigDownDashIcon,
    label: <>Thanks for testing gravity!</>,
  },
  {
    id: 'oob-5',
    autoDismissS: 3,
    Icon: TrendingUpIcon,
    label: (
      <>
        Fall down 7 times, <b>stand up 8</b>
      </>
    ),
  },
  {
    id: 'oob-6',
    autoDismissS: 3,
    Icon: LaughIcon,
    label: 'Failure is not fatal',
  },
  {
    id: 'oob-7',
    autoDismissS: 3,
    Icon: FlameIcon,
    label: (
      <>
        <b>Rise.</b> Wiser than before.
      </>
    ),
  },
]

const OUT_OF_BOUNDS_MESSAGE_COUNT = OUT_OF_BOUNDS_HUD_CONFIG.length

export const getOutOfBoundsMessage = (
  events: OutOfBoundsEvent[],
): HudIndicatorConfig | null => {
  const seenHudIds = new Set<string>()
  for (let i = 0; i < events.length; i += 1) {
    const hudId = events[i].hudId
    if (!hudId) continue
    seenHudIds.add(hudId)
    if (seenHudIds.size === OUT_OF_BOUNDS_MESSAGE_COUNT) {
      return null
    }
  }

  const eventCount = events.length
  const messagePosition = eventCount % OUT_OF_BOUNDS_MESSAGE_COUNT
  const loopStartIndex = eventCount - messagePosition // start index of current loop

  // Track which HUD messages are already used in the current loop without allocating extra arrays.
  const usedHudIds = new Set<string>()
  for (let i = loopStartIndex; i < eventCount; i += 1) {
    const hudId = events[i].hudId
    if (!hudId) continue
    usedHudIds.add(hudId)
  }

  let selectedHud: HudIndicatorConfig | null = null
  let availableCount = 0

  for (let i = 0; i < OUT_OF_BOUNDS_MESSAGE_COUNT; i += 1) {
    const hud = OUT_OF_BOUNDS_HUD_CONFIG[i]
    if (usedHudIds.has(hud.id)) continue
    // Reservoir sampling to pick a random HUD without building an array.
    availableCount += 1
    if (Math.floor(Math.random() * availableCount) === 0) {
      selectedHud = hud
    }
  }
  if (!!selectedHud) return selectedHud
  // If everything was filtered out (should not happen), fall back to any random HUD.
  return OUT_OF_BOUNDS_HUD_CONFIG[Math.floor(Math.random() * OUT_OF_BOUNDS_MESSAGE_COUNT)]
}
