'use client'

import { startTransition, useLayoutEffect, useState } from 'react'

import { useGameStore } from '@/components/GameProvider'
import { speedRunSubmissionSchema } from '@/model/schema'

import { type InputProps } from './Input'

const usernameSchema = speedRunSubmissionSchema.shape.username
const errorMessage = 'Username must be 6-12 characters long'

export function useUsernameInput(): InputProps {
  const username = useGameStore((s) => s.username)
  const setUsername = useGameStore((s) => s.setUsername)

  const [value, setValue] = useState(username ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isValid, setIsValid] = useState<boolean>(false)

  useLayoutEffect(() => {
    const validValue = usernameSchema.safeParse(username ?? '')
    const isValid = validValue.success
    const error = !isValid ? errorMessage : null
    if (value.length > 2) setError(error)
    setIsValid(isValid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const trimmedUsername = e.target.value.trim()
    setValue(trimmedUsername)

    startTransition(() => {
      const validValue = usernameSchema.safeParse(trimmedUsername)
      const isValid = validValue.success
      const error = !isValid ? errorMessage : null
      setError(error)
      setIsValid(isValid)
      if (isValid) setUsername(trimmedUsername)
    })
  }

  return {
    value,
    onChange,
    error,
    isValid,
    placeholder: 'Enter a username...',
    maxLength: 12,
  }
}
