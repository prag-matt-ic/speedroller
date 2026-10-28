'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type InstallPromptOutcome = 'accepted' | 'dismissed'

type BeforeInstallPromptEvent = Event & {
  readonly platforms: string[]
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: InstallPromptOutcome; platform: string }>
}

const supportsBeforeInstallPrompt = (): boolean =>
  typeof window !== 'undefined' && 'onbeforeinstallprompt' in window

const isStandaloneDisplay = (): boolean => {
  if (typeof window === 'undefined') return false
  const mediaStandalone = window.matchMedia(
    '(display-mode: standalone) or (display-mode: fullscreen)',
  ).matches
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean }
  return mediaStandalone || Boolean(navigatorWithStandalone?.standalone)
}

let serviceWorkerRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null

const registerServiceWorker = () => {
  if (typeof window === 'undefined') return null
  if (!('serviceWorker' in navigator)) return null

  if (!serviceWorkerRegistrationPromise) {
    serviceWorkerRegistrationPromise = navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((error) => {
        serviceWorkerRegistrationPromise = null
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[PWA] Service worker registration failed', error)
        }
        return null
      })
  }

  return serviceWorkerRegistrationPromise
}

const toError = (value: unknown): Error =>
  value instanceof Error ? value : new Error('Installation prompt failed')

export const usePWA = () => {
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null)
  const [isInstallable, setIsInstallable] = useState(false)
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneDisplay())
  const [isPromptSupported, setIsPromptSupported] = useState(() =>
    supportsBeforeInstallPrompt(),
  )
  const [isPrompting, setIsPrompting] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    registerServiceWorker()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      deferredPromptRef.current = event as BeforeInstallPromptEvent
      setIsInstallable(true)
      setError(null)
    }

    const handleAppInstalled = () => {
      deferredPromptRef.current = null
      setIsInstallable(false)
      setIsInstalled(true)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setIsInstalled(isStandaloneDisplay())
      }
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    setIsPromptSupported(supportsBeforeInstallPrompt())
    setIsInstalled(isStandaloneDisplay())

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const clearDeferredPrompt = useCallback(() => {
    deferredPromptRef.current = null
    setIsInstallable(false)
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferredPromptRef.current) return false
    setIsPrompting(true)

    try {
      await deferredPromptRef.current.prompt()
      const choice = await deferredPromptRef.current.userChoice
      clearDeferredPrompt()
      setError(null)
      return choice.outcome === 'accepted'
    } catch (err) {
      clearDeferredPrompt()
      const nextError = toError(err)
      setError(nextError)
      return false
    } finally {
      setIsPrompting(false)
    }
  }, [clearDeferredPrompt])

  const dismissPrompt = useCallback(() => {
    clearDeferredPrompt()
  }, [clearDeferredPrompt])

  const canInstall = useMemo(
    () => isPromptSupported && isInstallable && !isInstalled,
    [isInstallable, isInstalled, isPromptSupported],
  )

  return {
    canInstall,
    isInstallable,
    isInstalled,
    isPromptSupported,
    isPrompting,
    error,
    promptInstall,
    dismissPrompt,
  }
}

export type UsePWAResult = ReturnType<typeof usePWA>

export default usePWA
