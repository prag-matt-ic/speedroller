'use client'

import { Flag, Joystick, Keyboard, Palette } from 'lucide-react'
import { type FC } from 'react'

import { useGameStore } from '@/components/GameProvider'
import { InputType } from '@/stores/types'

/** Input-specific lobby hints; movement guidance never overlaps the bottom controls. */
const LobbyGuidance: FC = () => {
  const inputType = useGameStore((s) => s.inputType)
  const isJoystick = inputType === InputType.JOYSTICK
  const InputIcon = isJoystick ? Joystick : Keyboard
  const movementHint = isJoystick
    ? 'Use the joystick to move.'
    : 'Move with WASD or arrow keys.'

  return (
    <section
      aria-label="Lobby guidance"
      className="flex w-full max-w-72 flex-col gap-1.5 rounded-2xl bg-black/40 px-3 py-2.5 text-white ring ring-teal-200/10 xl:max-w-80 xl:px-4 xl:py-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <InputIcon className="size-4 shrink-0 text-teal-300" strokeWidth={1.75} />
        <span>{movementHint}</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-white/70">
        <Palette className="size-3.5 shrink-0 text-amber-300" strokeWidth={1.75} />
        <span>Hold on a colour tile to choose your ball.</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-white/70">
        <Flag className="size-3.5 shrink-0 text-emerald-300" strokeWidth={1.75} />
        <span>Roll to START when ready.</span>
      </div>
    </section>
  )
}

export default LobbyGuidance
