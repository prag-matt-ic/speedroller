'use client'

import { Html } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, BoxIcon, CompassIcon } from 'lucide-react'
import { Suspense, useMemo, useState } from 'react'
import { Quaternion, Vector3, type Vector3Tuple } from 'three'

import { getPodiumData } from '@/app/actions'
import compassIcon from '@/assets/icons/info-compass.png'
import techIcon from '@/assets/icons/info-technologies.png'
import { CameraPoseSensor } from '@/components/CameraPoseSensor'
import { useGameStore } from '@/components/GameProvider'
import { InfoZone } from '@/components/platform/infoZones/infoZone/InfoZone'
import { Podium } from '@/components/podium/Podium'
import PodiumFireworksParticles from '@/components/podium/PodiumFireworksParticles'
import Panel from '@/components/ui/panel/Panel'
import { PanelHeader } from '@/components/ui/panel/PanelHeader'
import { useCoursePlacement } from '@/hooks/useCoursePlacement'
import { useCourseSurface } from '@/hooks/useCourseSurface'
import { SpeedRunStage } from '@/stores/types'
import type { CameraPose } from '@/utils/camera/cameraPose'
import { LOBBY_INFO_ZONES, LOBBY_PODIUM, LOBBY_PODIUM_SENSOR, lobbyPosition } from '@/utils/platform/lobbyLayout'

const PODIUM_ELEVATION = 2.75
const PODIUM_PILLAR_EXTENSION = 48
const SENSOR_HALF_EXTENTS: Vector3Tuple = [2.5, 1, 1.5]
const LEGACY_PALETTES = [0, 3, 7]

export function Lobby() {
  const surface = useCourseSurface()
  const filter = useGameStore(state => state.leaderboardFilter)
  const levelId = useGameStore(state => state.platformVersion)
  const latestRunId = useGameStore(state => state.completedSpeedRuns[state.platformVersion]?.at(-1)?.id ?? null)
  const enabled = useGameStore(state => state.speedRunStage === SpeedRunStage.LOBBY && state.playerStatus === 'safe' && !state.isSpectating)
  const portal = useGameStore(state => state.htmlPortal)
  const [podiumActive, setPodiumActive] = useState(false)
  const aspect = useThree(state => state.size.width / state.size.height)
  const podiumPosition = lobbyPosition(LOBBY_PODIUM, surface.columns)
  podiumPosition[1] += PODIUM_ELEVATION
  const placement = useCoursePlacement(podiumPosition)
  const sensorPosition = lobbyPosition(LOBBY_PODIUM_SENSOR, surface.columns)
  const { data, isPending, isError } = useQuery({
    queryKey: ['podium', levelId, filter, latestRunId],
    queryFn: () => getPodiumData(filter, levelId),
    staleTime: 30_000,
  })
  const winners = useMemo(() => (data ?? []).map((entry, index) => ({
    username: entry.username,
    timeSeconds: entry.time,
    paletteIndex: entry.palette_index ?? LEGACY_PALETTES[index],
  })), [data])
  const pose = useMemo<CameraPose>(() => {
    const rotation = new Quaternion().setFromEuler(placement.rotation)
    const distanceScale = Math.max(1, 1.5 / aspect)
    const eye = new Vector3(0, 2 * distanceScale, 9 * distanceScale)
      .applyQuaternion(rotation).add(placement.position)
    return {
      position: eye.toArray(), target: placement.position.toArray(),
      up: new Vector3(0, 1, 0).applyQuaternion(rotation).toArray(), zoom: 1,
    }
  }, [aspect, placement])
  const status = isPending ? 'Loading racers…' : isError ? 'Leaderboard unavailable' :
    !data?.length ? 'Set a time to claim your place' : null

  return <>
    <CameraPoseSensor position={sensorPosition} halfExtents={SENSOR_HALF_EXTENTS}
      pose={pose} enabled={enabled} onActiveChange={setPodiumActive} />
    <Suspense fallback={null}>
      <group {...placement}>
        <group>
          <Podium winners={winners} pillarExtension={PODIUM_PILLAR_EXTENSION} billboardLabels={false} />
          <PodiumFireworksParticles active={podiumActive} />
          {podiumActive && status && <Html position={[0, 3, 0]} center portal={portal} pointerEvents="none">
            <div className="w-[min(22rem,90vw)] text-center text-white drop-shadow-lg">
              <p className="mt-1 text-xs" role="status">{status}</p>
            </div>
          </Html>}
        </group>
      </group>
    </Suspense>
    <InfoZone position={lobbyPosition(LOBBY_INFO_ZONES[0], surface.columns)} zoneKey="lobby-how-to-play"
      iconSrc={compassIcon.src} infoContainerClassName="w-[min(360px,88vw)] xl:w-[440px]">
      <Panel className="max-h-[65dvh] overflow-y-auto p-4 xl:p-6" strength={3}>
        <PanelHeader icon={CompassIcon} label="How to play" />
        <ul className="space-y-3 text-sm leading-relaxed">
          <li>Roll with WASD or the arrow keys. On mobile, use the joystick.</li>
          <li>Pause on a colour tile to choose your marble. Follow the side path for a full 360° practice loop.</li>
          <li>Cross the start line to race solo or invite friends to a multiplayer race.</li>
          <li>During a race, forward movement is automatic. Steer, brake with down, collect rings for a boost, and aim for the fastest time.</li>
        </ul>
      </Panel>
    </InfoZone>
    <InfoZone position={lobbyPosition(LOBBY_INFO_ZONES[1], surface.columns)} zoneKey="lobby-how-we-built-this"
      iconSrc={techIcon.src} infoContainerClassName="w-[min(360px,88vw)] xl:w-[440px]">
      <Panel className="max-h-[65dvh] overflow-y-auto p-4 xl:p-6" strength={3}>
        <PanelHeader icon={BoxIcon} label="How we built this" />
        <p className="text-sm leading-relaxed">React Three Fiber brings the scene to React. Three.js WebGPU and TSL power the materials and GPU particle effects; Rapier handles movement and sensors.</p>
        <p className="mt-3 text-sm leading-relaxed">Zustand keeps game state, Next.js serves the app, and Postgres stores race times.</p>
        <a href="https://github.com/prag-matt-ic/threenix-plugin" target="_blank" rel="noopener noreferrer"
          className="mt-4 flex items-center gap-2 rounded text-sm font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">
          Explore the Threenix plugin <ArrowUpRight aria-hidden className="size-4 shrink-0" />
        </a>
        <p className="mt-2 text-sm leading-relaxed text-white/75">Build your own scenes with components and AI development skills for Three.js, React Three Fiber, WebGPU, TSL, and performance reviews.</p>
      </Panel>
    </InfoZone>
  </>
}
