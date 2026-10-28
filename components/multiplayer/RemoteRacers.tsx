'use client'

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Mesh, Sprite, Vector3 } from 'three'
import { RemoteMarble } from '@/components/player/marble/RemoteMarble'
import { useTextCanvas, TRANSPARENT_TEXTURE } from '@/hooks/useTextCanvas'
import type { Entrant } from '@/shared/multiplayer/protocol.mts'
import type { RoomSession } from '@/utils/multiplayer/session'
import { useOptionalMultiplayer, useRoomState } from './MultiplayerProvider'

export function RemoteRacers() {
  const multiplayer = useOptionalMultiplayer()
  useFrame(() => multiplayer?.session?.updatePlayback(), -100)
  const snapshot = useRoomState(state => state.snapshot)
  const followId = useRoomState(state => state.followId)
  const self = snapshot?.members.find(member => member.id === snapshot.selfId)
  if (!multiplayer?.session || !snapshot?.raceId || !self) return null
  return snapshot.entrants.filter(entrant => self.role === 'spectator' || entrant.id !== snapshot.selfId).map(entrant =>
    <RemoteRacer key={`${snapshot.raceId}:${entrant.id}`} entrant={entrant} showName={self.role !== 'spectator' || entrant.id === followId} session={multiplayer.session!} />)
}

function RemoteRacer({ entrant, showName, session }: { entrant: Entrant; showName: boolean; session: RoomSession }) {
  const labelUp = useRef(new Vector3())
  const mesh = useRef<Mesh>(null)
  const label = useRef<Sprite>(null)
  const text = useTextCanvas(showName ? `${entrant.slot}. ${entrant.profile.name}${entrant.status === 'dnf' ? ' · DNF' : entrant.status === 'finished' ? ' · Finished' : ''}` : String(entrant.slot), {
    width: 384, height: 64, fontSize: 32, color: '#ffffff', fontWeight: 700,
  })
  useFrame(({ camera }) => {
    if (!mesh.current || !label.current) return
    const sampled = session.getRenderedPose(entrant.id)
    if (!sampled?.latest) {
      mesh.current.visible = false; label.current.visible = false; return
    }
    mesh.current.position.fromArray(sampled.position)
    mesh.current.quaternion.fromArray(sampled.rotation)
    mesh.current.visible = true; label.current.visible = true
    label.current.position.copy(mesh.current.position)
    labelUp.current.set(0, 1, 0).applyQuaternion(camera.quaternion)
    label.current.position.addScaledVector(labelUp.current, 1.1)
  })
  return <>
    <RemoteMarble ref={mesh} colour={entrant.profile.colour} />
    <sprite ref={label} scale={[3.2, 0.55, 1]} visible={false}>
      <spriteMaterial map={text?.texture ?? TRANSPARENT_TEXTURE} transparent depthWrite={false} />
    </sprite>
  </>
}
