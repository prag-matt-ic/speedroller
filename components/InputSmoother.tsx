'use client'

import { type FC, useEffect, useRef } from 'react'

import { useGameStore } from '@/components/GameProvider'
import { useGameFrame } from '@/hooks/useGameFrame'
import { usePlayerInput, usePlayerInputIntent } from '@/hooks/usePlayerInput'
import { type PlayerInput } from '@/stores/types'
import { EPSILON } from '@/utils/tiles'

const INPUT_RAMP_UP_S = 0.24
const INPUT_RAMP_DOWN_S = 0.12

const RAMP_UP_RATE = 1 / INPUT_RAMP_UP_S
const RAMP_DOWN_RATE = 1 / INPUT_RAMP_DOWN_S

const AXES = ['up', 'down', 'left', 'right'] as const satisfies Array<keyof PlayerInput>

const copyInput = (source: PlayerInput, target: PlayerInput) => {
  target.up = source.up
  target.down = source.down
  target.left = source.left
  target.right = source.right
}

const zeroInput = (target: PlayerInput) => {
  target.up = 0
  target.down = 0
  target.left = 0
  target.right = 0
}

const isZeroInput = (input: PlayerInput): boolean =>
  input.up === 0 && input.down === 0 && input.left === 0 && input.right === 0

const InputSmoother: FC = () => {
  const { inputIntent } = usePlayerInputIntent()
  const { input } = usePlayerInput()
  const smoothedInput = useRef<PlayerInput>({ up: 0, down: 0, left: 0, right: 0 })
  const attemptId = useGameStore((s) => s.attemptId)
  const setPlayerInput = useGameStore((s) => s.setPlayerInput)

  const buffers = useRef<[PlayerInput, PlayerInput]>([
    { up: 0, down: 0, left: 0, right: 0 },
    { up: 0, down: 0, left: 0, right: 0 },
  ])
  const activeBufferIndex = useRef(0)

  // Attempt resets clear the slice but not this component's buffered ramp. Discard it so a retry
  // cannot inherit residual movement from the previous run.
  useEffect(() => {
    zeroInput(smoothedInput.current)
    zeroInput(buffers.current[0])
    zeroInput(buffers.current[1])
    activeBufferIndex.current = 0
    setPlayerInput(buffers.current[0])
  }, [attemptId, setPlayerInput])

  useGameFrame((_, delta) => {
    const intent = inputIntent.current
    const smoothed = smoothedInput.current
    const storedInput = input.current
    const hasIntent = !isZeroInput(intent)

    // Hard reset when intent and stored input are already zero (e.g., disable input).
    if (!hasIntent && isZeroInput(storedInput)) {
      if (!isZeroInput(smoothed)) {
        zeroInput(smoothed)
        const nextBufferIndex = activeBufferIndex.current ^ 1
        const nextBuffer = buffers.current[nextBufferIndex]
        copyInput(smoothed, nextBuffer)
        activeBufferIndex.current = nextBufferIndex
        setPlayerInput(nextBuffer)
      }
      return
    }

    const rampUpStep = RAMP_UP_RATE * delta
    const rampDownStep = RAMP_DOWN_RATE * delta
    let hasChanged = false

    for (let i = 0; i < AXES.length; i += 1) {
      const axis = AXES[i]
      const currentValue = smoothed[axis]
      const targetValue = intent[axis]
      const deltaToTarget = targetValue - currentValue

      if (Math.abs(deltaToTarget) < EPSILON.TINY) continue

      const direction = deltaToTarget > 0 ? 1 : -1
      const step = direction > 0 ? rampUpStep : rampDownStep
      const nextValue =
        Math.abs(deltaToTarget) <= step ? targetValue : currentValue + direction * step

      if (nextValue === currentValue) continue

      smoothed[axis] = nextValue
      hasChanged = true
    }

    if (!hasChanged) return

    const nextBufferIndex = activeBufferIndex.current ^ 1
    const nextBuffer = buffers.current[nextBufferIndex]
    copyInput(smoothed, nextBuffer)
    activeBufferIndex.current = nextBufferIndex
    setPlayerInput(nextBuffer)
  })

  return null
}

export default InputSmoother
