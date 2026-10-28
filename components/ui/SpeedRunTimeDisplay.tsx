'use client'
import { type FC, useRef } from 'react'

import { useSpeedRunTime } from '@/hooks/useTime'

const formatSpeedRunTime = (elapsedSeconds: number): string => {
  const totalSeconds = Math.floor(elapsedSeconds)
  const hundredths = Math.floor((elapsedSeconds - totalSeconds) * 100)
  return `${totalSeconds}.${hundredths.toString().padStart(2, '0')}`
}

type TimeDisplayBaseProps = {
  className?: string
}

export const SpeedRunTimeDisplay: FC<TimeDisplayBaseProps> = ({ className }) => {
  const container = useRef<HTMLDivElement | null>(null)

  const { speedRunTime } = useSpeedRunTime((elapsedSeconds: number) => {
    if (!container.current) return
    container.current.textContent = formatSpeedRunTime(elapsedSeconds)
  })

  return (
    <div aria-live="polite" ref={container} className={className}>
      {formatSpeedRunTime(speedRunTime.current)}
    </div>
  )
}
