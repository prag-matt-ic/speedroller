'use client'
import { type FC, type RefObject, useLayoutEffect, useRef } from 'react'

import { useGameStore } from '@/components/GameProvider'

const HtmlPortal: FC = () => {
  const setHtmlPortal = useGameStore((s) => s.setHtmlPortal)
  const container = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    if (!container.current) throw new Error('Container ref is null')
    setHtmlPortal(container as RefObject<HTMLDivElement>)
    return () => {
      setHtmlPortal(undefined)
    }
  }, [setHtmlPortal])

  return (
    <div
      id="html-portal"
      ref={container}
      className="pointer-events-none fixed inset-0 z-110 select-none"
    />
  )
}

export default HtmlPortal
