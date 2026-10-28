'use client'

import { AlertTriangle, CheckCircle, UserIcon } from 'lucide-react'
import { type FC } from 'react'
import { twMerge } from 'tailwind-merge'

import { useGameStore } from '@/components/GameProvider'
import { Input } from '@/components/ui/input/Input'
import { useUsernameInput } from '@/components/ui/input/useUsernameInput'
import Panel from '@/components/ui/panel/Panel'
import { isAttemptLocked } from '@/stores/types'

type Props = {
  className?: string
}

export const UsernamePanel: FC<Props> = ({ className }) => {
  const speedRunStage = useGameStore((state) => state.speedRunStage)
  const inputProps = useUsernameInput()
  const isLocked = isAttemptLocked(speedRunStage)

  return (
    <Panel className={twMerge('flex h-full items-center gap-4', className)} strength={2}>
      <UserIcon className="size-6 text-amber-200/50" />
      <Input
        {...inputProps}
        disabled={isLocked}
        aria-disabled={isLocked}
        className="flex-1"
        endAdornment={
          <div className="flex h-full items-center justify-center px-4">
            {inputProps.isValid ? (
              <CheckCircle className="size-6 text-amber-400" strokeWidth={1.5} />
            ) : (
              <AlertTriangle className="size-6 text-amber-200 opacity-50" strokeWidth={1.5} />
            )}
          </div>
        }
      />
    </Panel>
  )
}
