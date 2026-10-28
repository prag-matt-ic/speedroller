import { notFound } from 'next/navigation'
import MarbleInspection from '@/components/debug/MarbleInspection'

export default function MarbleInspectionPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <MarbleInspection />
}
