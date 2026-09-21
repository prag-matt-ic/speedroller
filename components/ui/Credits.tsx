'use client'

import type { FC } from 'react'
import { twMerge } from 'tailwind-merge'

type Props = {
  className?: string
  show: boolean
}

const Credits: FC<Props> = ({ className, show }) => {
  return (
    <div
      className={twMerge(
        'flex w-full flex-wrap justify-center gap-2 text-sm leading-3 tracking-wide text-teal-50/70 opacity-0 transition-opacity duration-1000 xl:bottom-8',
        show && 'opacity-100 delay-500',
        className,
      )}>
      <span className="text-teal-50/50">Built by</span>
      <a
        href="https://threenix.io"
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold hover:text-teal-100">
        Threenix.io
      </a>
      <span className="text-teal-50/50">|</span>
      <a href="https://github.com/prag-matt-ic/speedroller"
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold hover:text-teal-100">
        Github
      </a>
    </div>
  )
}

export default Credits
