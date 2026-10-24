'use client'

import { type FC, useEffect } from 'react'

import { useGameStore } from '@/components/GameProvider'
import { useSoundStore } from '@/components/SoundProvider'
import { SpeedRunStage } from '@/stores/types'

const LOBBY_TRACK_STAGES = new Set<SpeedRunStage>([
  SpeedRunStage.LOBBY,
  SpeedRunStage.START,
])

/** Keeps background music aligned with the race lifecycle rather than the obsolete game mode. */
const RaceAudio: FC = () => {
  const speedRunStage = useGameStore((s) => s.speedRunStage)
  const switchBackgroundTrack = useSoundStore((s) => s.switchBackgroundTrack)

  useEffect(() => {
    switchBackgroundTrack(LOBBY_TRACK_STAGES.has(speedRunStage) ? 'lobby' : 'race')
  }, [speedRunStage, switchBackgroundTrack])

  return null
}

export default RaceAudio
