'use client'

import structureData from '@/resources/courseStructures.json'
import pillarData from '@/resources/coursePillars.json'
import type { PillarPlacement } from '@/utils/platform/architecture'
import type { CourseSurface } from '@/utils/platform/courseSurface'
import { createPillarBlocks } from '@/utils/platform/pillarBlocks'

import StoneBlocks from './StoneBlocks'

const blocks = [...createPillarBlocks(pillarData as PillarPlacement[]), ...structureData as PillarPlacement[]]
type Props = { surface: CourseSurface; enabled?: boolean; fadeEnabled?: boolean; onReadyChange?: (ready: boolean) => void }

export default function Pillars(props: Props) {
  return <StoneBlocks blocks={blocks} {...props} />
}
