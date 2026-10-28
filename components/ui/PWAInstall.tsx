'use client'

import { DownloadIcon, PlusIcon, Share2Icon } from 'lucide-react'
import dynamic from 'next/dynamic'
import { type FC, useEffect, useState } from 'react'

import type { ButtonProps } from '@/components/ui/Button'
import { usePWA } from '@/hooks/usePWA'

const Button = dynamic<ButtonProps>(() => import('@/components/ui/Button'))

type Props = {
  isMobile: boolean
}

const PWAInstall: FC<Props> = ({ isMobile }) => {
  const { canInstall, isInstalled, isPrompting, isPromptSupported, promptInstall } = usePWA()
  const [isIOSDevice, setIsIOSDevice] = useState(false)

  useEffect(() => {
    if (!isMobile) return
    if (typeof navigator === 'undefined') return
    const ua = navigator.userAgent.toLowerCase()
    const isIOS = /iphone|ipad|ipod/.test(ua)
    if (isIOS) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsIOSDevice(true)
    }
  }, [isMobile])

  const showInstallButton = canInstall
  const showIOSInstallHint =
    isMobile && isIOSDevice && !isInstalled && !canInstall && !isPromptSupported

  const onInstallClick = () => {
    promptInstall()
  }

  if (!showInstallButton && !showIOSInstallHint) return null

  return (
    <>
      {showInstallButton && (
        <Button
          variant="secondary"
          aria-label="Install"
          onClick={onInstallClick}
          disabled={isPrompting}
          startIcon={DownloadIcon}>
          {isPrompting ? 'Requesting install…' : 'Install app'}
        </Button>
      )}

      {showIOSInstallHint && (
        <div className="flex max-w-sm items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-center text-sm text-white/80">
          <Share2Icon className="size-4 shrink-0 text-white" aria-hidden="true" />
          <span>
            On iOS, tap
            <span className="inline-flex items-center gap-1 px-1">
              <Share2Icon className="size-3" aria-hidden="true" />
              Share
            </span>
            then
            <span className="inline-flex items-center gap-1 px-1">
              <PlusIcon className="size-3" aria-hidden="true" />
              Add to Home Screen
            </span>
          </span>
        </div>
      )}
    </>
  )
}

export default PWAInstall
