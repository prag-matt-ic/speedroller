'use client'
import { useMediaQuery } from '@mantine/hooks'
import {
  ArrowLeft,
  ArrowRight,
  Joystick,
  Keyboard,
  PlayIcon,
  RotateCcwIcon,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { type FC, useState } from 'react'
import { twJoin } from 'tailwind-merge'

import { useGameStore } from '@/components/GameProvider'
import { useSoundStore } from '@/components/SoundProvider'
import Button from '@/components/ui/Button'
import { ButtonGroup } from '@/components/ui/ButtonGroup'
import { PointerProvider } from '@/components/ui/PointerProvider'
import Panel from '@/components/ui/panel/Panel'
import { InputType } from '@/stores/types'

type Props = {
  isLoaded: boolean
  isMobile: boolean
  onStart: () => void
}

const LandingControls: FC<Props> = ({ isLoaded, isMobile, onStart }) => {
  const INPUT_TYPE_OPTIONS = [
    { label: 'Keyboard', value: InputType.KEYS, Icon: Keyboard },
    { label: 'Joystick', value: InputType.JOYSTICK, Icon: Joystick },
  ]

  const isMuted = useSoundStore((s) => s.isMuted)
  const setIsMuted = useSoundStore((s) => s.setIsMuted)
  const inputType = useGameStore((s) => s.inputType)
  const setInputType = useGameStore((s) => s.setInputType)
  const joystickPosition = useGameStore((s) => s.joystickPosition)
  const setJoystickPosition = useGameStore((s) => s.setJoystickPosition)

  const isLandscape = useMediaQuery('(orientation: landscape)', true)
  const [startMuted, setStartMuted] = useState(isMuted)
  const isMobileLandscape = isMobile && isLandscape

  const canStart = isLoaded && (!isMobile || isMobileLandscape)
  const showRotateHint = isMobile && !isMobileLandscape

  const onStartClick = () => {
    setIsMuted(startMuted)
    onStart()
  }

  return (
    <>
      {isMobile && (
        <span
          className={twJoin(
            'fixed inset-x-0 top-0 px-6 py-4 text-center text-sm font-medium text-amber-200/50 transition-opacity delay-500 duration-500 ease-out motion-reduce:transition-none',
            isLoaded ? 'opacity-100' : 'opacity-0',
          )}>
          Hide the toolbar for a fullscreen experience!
        </span>
      )}

      <PointerProvider isMobile={isMobile}>
        <Panel
          strength={1}
          className={twJoin(
            'relative mx-auto flex w-fit flex-wrap items-center justify-center gap-3 self-start rounded-full pl-6 transition-opacity duration-500 ease-out motion-reduce:transition-none xl:gap-4 xl:pl-8',
            isLoaded ? 'opacity-100 delay-200' : 'opacity-0',
          )}>
          <ButtonGroup
            value={startMuted ? 'off' : 'on'}
            onChange={(val) => setStartMuted(val === 'off')}
            items={[
              { label: null, ariaLabel: 'Sound on', value: 'on', Icon: Volume2 },
              { label: null, ariaLabel: 'Sound off', value: 'off', Icon: VolumeX },
            ]}
          />
          <ButtonGroup
            value={inputType}
            onChange={setInputType}
            items={INPUT_TYPE_OPTIONS.map(({ value, Icon, label }) => ({
              value,
              Icon,
              label: null,
              ariaLabel: label,
            }))}
          />
          <ButtonGroup
            value={joystickPosition}
            onChange={setJoystickPosition}
            disabled={inputType !== InputType.JOYSTICK}
            items={[
              { label: null, ariaLabel: 'Joystick on left', value: 'left', Icon: ArrowLeft },
              { label: null, ariaLabel: 'Joystick on right', value: 'right', Icon: ArrowRight },
            ]}
          />
          <Button
            variant="primary"
            aria-label="Enter"
            disabled={!canStart}
            onClick={onStartClick}
            endIcon={showRotateHint ? RotateCcwIcon : PlayIcon}>
            {showRotateHint ? 'Rotate device' : 'Enter'}
          </Button>
        </Panel>
      </PointerProvider>
    </>
  )
}

export default LandingControls
