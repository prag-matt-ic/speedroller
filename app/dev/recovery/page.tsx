import { notFound } from 'next/navigation'
import RecoveryInspection from '@/components/debug/RecoveryInspection'

export default function RecoveryInspectionPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <RecoveryInspection />
}
