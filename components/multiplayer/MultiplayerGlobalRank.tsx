'use client'

import { useQuery } from '@tanstack/react-query'
import { getSpeedrunPosition } from '@/app/actions'
import { useGameStore } from '@/components/GameProvider'
import { useRoomState } from './MultiplayerProvider'

export function MultiplayerGlobalRank() {
  const result = useGameStore(state => state.attemptResult)
  const savedRunId = useGameStore(state => state.savedRunId)
  const saveStatus = useGameStore(state => state.saveStatus)
  const raceId = useGameStore(state => state.multiplayerRaceId)
  const snapshot = useRoomState(state => state.snapshot)
  const self = snapshot?.entrants.find(entrant => entrant.id === snapshot.selfId)
  const accepted = snapshot?.raceId === raceId && self?.status === 'finished'
  const { data, isPending, isError } = useQuery({
    queryKey: ['multiplayer-global-rank', savedRunId, result?.inputType, result?.platformVersion, snapshot?.phase === 'results'],
    queryFn: async () => {
      const ranked = await getSpeedrunPosition(savedRunId!, result!.inputType, result!.platformVersion)
      if (!ranked || ranked.run.id !== savedRunId) throw new Error('Global rank unavailable')
      return ranked
    },
    enabled: accepted && saveStatus === 'saved' && savedRunId !== null && !!result,
    retry: false,
  })
  if (!result || !self || snapshot?.raceId !== raceId) return null
  let label = 'Waiting for finish confirmation…'
  if (self.status === 'dnf') label = 'DNF · time not saved to the global leaderboard.'
  else if (accepted) {
    if (saveStatus === 'failed') label = 'Time not saved to the global leaderboard.'
    else if (saveStatus !== 'saved') label = 'Saving…'
    else if (isError) label = 'Time saved · global rank unavailable.'
    else if (isPending) label = 'Time saved · loading global rank…'
    else label = `Global rank #${data.position} · ${result.inputType === 'keyboard' ? 'Keyboard' : 'Joystick'}`
  }
  return <p role="status" className="text-sm text-amber-200">{label}</p>
}
