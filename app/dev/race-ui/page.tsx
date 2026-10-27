import { notFound } from 'next/navigation'

import RaceUIInspection from '@/components/debug/RaceUIInspection'

export default function RaceUIPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <RaceUIInspection />
}
