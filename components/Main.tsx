'use client'
import { type FC } from 'react'

import Game from '@/components/Game'
import { PerformanceProvider } from '@/components/PerformanceProvider'
import RaceAudio from '@/components/RaceAudio'
import Timer from '@/components/Timer'
import DebugControls from '@/components/debug/DebugControls'
import HtmlPortal from '@/components/ui/HtmlPortal'
import UI from '@/components/ui/UI'

type Props = {
  isMobile: boolean
  isDebug: boolean
}

const Main: FC<Props> = ({ isMobile, isDebug }) => {
  return (
    <PerformanceProvider isMobile={isMobile}>
      <Game isDebug={isDebug} isMobile={isMobile} />
      <UI isMobile={isMobile} />
      <HtmlPortal />
      <Timer />
      <RaceAudio />
      {isDebug && <DebugControls />}
    </PerformanceProvider>
  )
}

export default Main
