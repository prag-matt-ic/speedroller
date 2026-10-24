import { useTexture } from '@react-three/fiber'
import { type StaticImageData } from 'next/image'
import { type FC, type RefObject, Suspense } from 'react'
import { Group } from 'three'

type Props = {
  ref: RefObject<Group | null>
  image: StaticImageData
  width: number
  height: number
}

const SurfaceImage: FC<Props> = ({ ref, height, width, image }) => {
  const texture = useTexture(image.src)

  return (
    <group ref={ref} position={[0, 0, 0]}>
      <Suspense>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial map={texture} transparent={true} />
        </mesh>
      </Suspense>
    </group>
  )
}

export default SurfaceImage
