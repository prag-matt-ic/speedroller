import type { Metadata } from 'next'

import CylinderPreview from '@/components/cylinder/CylinderPreview'

export const metadata: Metadata = {
  title: 'Cylinder prototype',
  robots: { index: false, follow: false },
}

export default function CylinderPage() {
  return <CylinderPreview />
}
