'use client'

import { type InputHTMLAttributes, type ReactNode, type Ref, forwardRef } from 'react'
import { twJoin, twMerge } from 'tailwind-merge'

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  className?: string
  endAdornment?: ReactNode
  error?: string | null
  isValid?: boolean
}

export const Input = forwardRef(function Input(
  { className, endAdornment = null, error, isValid, ...inputProps }: InputProps,
  ref: Ref<HTMLInputElement>,
) {
  return (
    <div className="relative w-full">
      <div
        className={twJoin(
          'relative flex h-fit items-center overflow-hidden rounded-xl bg-black/80 ring ring-amber-200/30 transition-colors focus-within:ring-2',
          isValid ? 'focus-within:ring-amber-500' : 'focus-within:ring-amber-500',
        )}>
        <input
          ref={ref}
          {...inputProps}
          className={twMerge(
            'flex-1 bg-transparent px-4 py-2.5 text-left text-lg font-semibold text-white outline-none placeholder:text-white/40 focus:outline-none xl:py-3 xl:text-xl',
            className,
          )}
        />
        {endAdornment}
      </div>
      {!!error && <p className="absolute -bottom-6 pt-2 text-xs text-neutral-400">{error}</p>}
    </div>
  )
})
