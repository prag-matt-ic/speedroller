import { notFound } from 'next/navigation'

import SceneryInspection from '@/components/debug/SceneryInspection'

export default function SceneryInspectionPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <SceneryInspection />
}
