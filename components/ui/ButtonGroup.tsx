import { type LucideIcon } from 'lucide-react'
import { twJoin } from 'tailwind-merge'

type BaseButtonGroupItem<T> = {
  value: T
  Icon?: LucideIcon
}

type LabeledButtonGroupItem<T> = BaseButtonGroupItem<T> & {
  label: string
  ariaLabel?: string
}

type IconOnlyButtonGroupItem<T> = BaseButtonGroupItem<T> & {
  label: null
  ariaLabel: string
}

export type ButtonGroupItem<T> = LabeledButtonGroupItem<T> | IconOnlyButtonGroupItem<T>

type ButtonGroupProps<T> = {
  items: ButtonGroupItem<T>[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
}

export const ButtonGroup = <T extends string | number>({
  items,
  value,
  onChange,
  disabled = false,
}: ButtonGroupProps<T>) => {
  return (
    <div
      className={twJoin(
        'relative flex items-center gap-1 rounded-xl border border-amber-200/10 p-1 text-white',
        disabled && 'pointer-events-none opacity-30',
      )}>
      {items.map((item) => {
        const isActive = value === item.value
        const Icon = item.Icon

        return (
          <button
            key={String(item.value)}
            type="button"
            aria-pressed={isActive}
            aria-label={item.ariaLabel ?? item.label ?? undefined}
            disabled={disabled}
            onClick={() => onChange(item.value)}
            className={twJoin(
              'group pointer-events-auto flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium normal-case transition-colors',
              'hover:text-white',
              isActive
                ? 'bg-amber-200/10 text-white ring-amber-200/20'
                : 'text-white/60 hover:bg-amber-200/10',
            )}>
            {!!Icon && (
              <Icon
                className={twJoin(
                  'size-4 xl:size-5',
                  isActive ? 'text-white' : 'text-white/60 group-hover:text-white',
                )}
                strokeWidth={1.5}
              />
            )}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
