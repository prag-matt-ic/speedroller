import { type LucideIcon } from 'lucide-react'
import { type FC, type ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'

type PanelHeaderProps = {
  icon: LucideIcon
  iconClassName?: string
  label: string
  children?: ReactNode
  className?: string
}

export const PanelHeader: FC<PanelHeaderProps> = ({
  icon: Icon,
  iconClassName,
  label,
  children,
  className,
}) => {
  return (
    <div className={twMerge('mb-3 flex w-full items-center gap-2 py-1 xl:mb-4', className)}>
      <Icon className={twMerge('size-4 text-neutral-400', iconClassName)} />
      <span className="text-xs font-medium tracking-widest text-neutral-400 uppercase">
        {label}
      </span>
      {!!children && <span className="ml-auto">{children}</span>}
    </div>
  )
}
