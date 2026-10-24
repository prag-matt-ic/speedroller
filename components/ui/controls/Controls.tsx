'use client'

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, type LucideIcon, Move } from 'lucide-react'
import { type FC, useCallback, useEffect, useRef, useState } from 'react'
import { twJoin } from 'tailwind-merge'

import { type PlayerInput, useGameStore } from '@/components/GameProvider'
import Joystick, { type OnJoystickMove } from '@/components/ui/controls/Joystick'
import { usePageHidden } from '@/hooks/usePageVisibility'
import { InputType, Overlay, isManualMovementStage } from '@/stores/types'

const JOYSTICK_LEVELS = 10

const createZeroInput = (): PlayerInput => ({
  up: 0,
  down: 0,
  left: 0,
  right: 0,
})

const KEY_TO_INPUT: Record<string, keyof PlayerInput> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
}

function useControls() {
  const speedRunStage = useGameStore((s) => s.speedRunStage)
  const overlay = useGameStore((s) => s.overlay)
  const isPageHidden = usePageHidden()
  const isPlayerLocked = useGameStore((s) => s.playerStatus !== 'safe')
  const disableInput =
    isPageHidden ||
    isPlayerLocked ||
    overlay !== Overlay.NONE ||
    !isManualMovementStage(speedRunStage)

  const setPlayerInput = useGameStore((s) => s.setPlayerInput)
  const setPlayerInputIntent = useGameStore((s) => s.setPlayerInputIntent)

  return {
    disableInput,
    isPageHidden,
    setPlayerInput,
    setPlayerInputIntent,
  }
}

type KeyProps = {
  isActive: boolean
  Icon: LucideIcon
}

const Key: FC<KeyProps> = ({ Icon, isActive }) => {
  return (
    <div
      className={twJoin(
        'flex h-7 w-10 items-center justify-center rounded-md text-teal-100',
        isActive ? 'bg-black' : 'bg-black/40',
      )}>
      <Icon size={20} strokeWidth={3} />
    </div>
  )
}

const Keys: FC = () => {
  const { disableInput, isPageHidden, setPlayerInput, setPlayerInputIntent } = useControls()
  const playerInputIntent = useGameStore((s) => s.playerInputIntent)
  const pressedKeys = useRef<PlayerInput>(createZeroInput())

  const publishPressedKeys = useCallback(() => {
    setPlayerInputIntent({ ...pressedKeys.current })
  }, [setPlayerInputIntent])

  // Keep window listeners mounted while input is locked so a key held through the countdown
  // becomes active on GO instead of being lost with the control overlay.
  useEffect(() => {
    if (disableInput) {
      setPlayerInputIntent(createZeroInput())
      setPlayerInput(createZeroInput())
      return
    }
    publishPressedKeys()
  }, [disableInput, publishPressedKeys, setPlayerInput, setPlayerInputIntent])

  useEffect(() => {
    if (isPageHidden) pressedKeys.current = createZeroInput()
  }, [isPageHidden])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const inputKey = KEY_TO_INPUT[event.code]
      if (!inputKey) return
      if (pressedKeys.current[inputKey] === 1) return
      pressedKeys.current[inputKey] = 1
      if (!disableInput) publishPressedKeys()
    }

    const onKeyUp = (event: KeyboardEvent) => {
      const inputKey = KEY_TO_INPUT[event.code]
      if (!inputKey) return
      if (pressedKeys.current[inputKey] === 0) return
      pressedKeys.current[inputKey] = 0
      if (!disableInput) publishPressedKeys()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [disableInput, publishPressedKeys])

  return (
    <aside className="pointer-events-none fixed right-4 bottom-4 z-150 grid h-fit w-fit grid-cols-3 gap-1 place-self-end">
      <div />
      <Key Icon={ArrowUp} isActive={playerInputIntent.up > 0} />
      <div />
      <Key Icon={ArrowLeft} isActive={playerInputIntent.left > 0} />
      <Key Icon={ArrowDown} isActive={playerInputIntent.down > 0} />
      <Key Icon={ArrowRight} isActive={playerInputIntent.right > 0} />
    </aside>
  )
}

const MovementControls: FC = () => {
  const inputType = useGameStore((s) => s.inputType)
  const overlay = useGameStore((s) => s.overlay)
  if (overlay === Overlay.LANDING) return null

  if (inputType === InputType.JOYSTICK) return <Stick />
  return <Keys />
}

const Stick: FC = () => {
  const { disableInput, isPageHidden, setPlayerInput, setPlayerInputIntent } = useControls()
  const joystickPosition = useGameStore((s) => s.joystickPosition)
  const [hasMoved, setHasMoved] = useState(false)
  const lastIntent = useRef<PlayerInput>(createZeroInput())

  const publishLastIntent = useCallback(() => {
    setPlayerInputIntent({ ...lastIntent.current })
  }, [setPlayerInputIntent])

  useEffect(() => {
    if (disableInput) {
      setPlayerInputIntent(createZeroInput())
      setPlayerInput(createZeroInput())
      return
    }
    publishLastIntent()
  }, [disableInput, publishLastIntent, setPlayerInput, setPlayerInputIntent])

  useEffect(() => {
    if (isPageHidden) lastIntent.current = createZeroInput()
  }, [isPageHidden])

  const onJoystickMove = useCallback(
    (event: OnJoystickMove) => {
      setHasMoved(true)
      const intent: PlayerInput = {
        up: event.leveledY > 0 ? Math.min(event.leveledY / JOYSTICK_LEVELS, 1) : 0,
        down: event.leveledY < 0 ? Math.min(-event.leveledY / JOYSTICK_LEVELS, 1) : 0,
        left: event.leveledX < 0 ? Math.min(-event.leveledX / JOYSTICK_LEVELS, 1) : 0,
        right: event.leveledX > 0 ? Math.min(event.leveledX / JOYSTICK_LEVELS, 1) : 0,
      }
      lastIntent.current = intent
      if (disableInput) return
      setPlayerInputIntent(intent)
    },
    [disableInput, setPlayerInputIntent],
  )

  return (
    <Joystick
      position={joystickPosition}
      level={JOYSTICK_LEVELS}
      className="pointer-events-auto fixed z-150"
      x="72px"
      y="72px"
      onMove={onJoystickMove}>
      <div
        className={twJoin(
          'flex size-full items-center justify-center text-teal-600',
          hasMoved ? 'hidden' : 'animate-pulse',
        )}>
        <Move size={28} strokeWidth={1.5} />
      </div>
    </Joystick>
  )
}

export default MovementControls
