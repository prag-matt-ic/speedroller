'use client'

import { useCallback, useEffect, useRef } from 'react'

import type { OnJoystickMove } from '@/components/ui/controls/Joystick'

const MOVEMENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'])
const JOYSTICK_LEVELS = 10

export function useCylinderInput() {
  const input = useRef({ sideways: 0, forward: 0 })
  const pressed = useRef(new Set<string>())
  const touch = useRef({ sideways: 0, forward: 0 })

  const publish = useCallback(() => {
    const keys = pressed.current
    input.current.sideways = Math.max(-1, Math.min(1,
      Number(keys.has('KeyD') || keys.has('ArrowRight')) -
      Number(keys.has('KeyA') || keys.has('ArrowLeft')) + touch.current.sideways,
    ))
    input.current.forward = Math.max(-1, Math.min(1,
      Number(keys.has('KeyW') || keys.has('ArrowUp')) -
      Number(keys.has('KeyS') || keys.has('ArrowDown')) + touch.current.forward,
    ))
  }, [])

  const clearInput = useCallback(() => {
    pressed.current.clear()
    touch.current.sideways = 0
    touch.current.forward = 0
    publish()
  }, [publish])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!MOVEMENT_KEYS.has(event.code) || event.altKey || event.ctrlKey || event.metaKey) return
      event.preventDefault()
      pressed.current.add(event.code)
      publish()
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (!MOVEMENT_KEYS.has(event.code)) return
      event.preventDefault()
      pressed.current.delete(event.code)
      publish()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', clearInput)
    document.addEventListener('visibilitychange', clearInput)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', clearInput)
      document.removeEventListener('visibilitychange', clearInput)
    }
  }, [clearInput, publish])

  const onJoystickMove = useCallback((event: OnJoystickMove) => {
    touch.current.sideways = event.leveledX / JOYSTICK_LEVELS
    touch.current.forward = event.leveledY / JOYSTICK_LEVELS
    publish()
  }, [publish])

  return { input, onJoystickMove, clearInput }
}
