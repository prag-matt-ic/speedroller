import { notFound } from 'next/navigation'

import PodiumInspection from '@/components/debug/PodiumInspection'

export default function PodiumInspectionPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <PodiumInspection />
}
