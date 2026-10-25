'use client'

import { useRef } from 'react'
import type { Mesh } from 'three'
import { Marble } from '@/components/player/marble/Marble'
import { RemoteRacers } from './RemoteRacers'

// Only a resource source: no local body, controller, sensors, or HUD.
export function SpectatorScene() {
  const marble = useRef<Mesh>(null)
  return <>
    <group visible={false}><Marble ref={marble} /></group>
    <RemoteRacers localMesh={marble} />
  </>
}
