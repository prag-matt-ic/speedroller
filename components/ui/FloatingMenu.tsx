'use client'

import {
  FloatingPortal,
  offset,
  shift,
  type Placement,
  safePolygon,
  useClick,
  useDismiss,
  useFloating,
  useHover,
  useInteractions,
  useTransitionStatus,
} from '@floating-ui/react'
import type { CSSProperties, FC, ReactNode } from 'react'
import { useState } from 'react'
import { twJoin } from 'tailwind-merge'

type FloatingMenuClassNames = {
  className?: string
  childrenClassName?: string
}

export type FloatingMenuProps = {
  trigger: (props: {
    isOpen: boolean
    setIsOpen: (open: boolean) => void
    ref: (node: HTMLElement | null) => void
    getReferenceProps: ReturnType<typeof useInteractions>['getReferenceProps']
  }) => ReactNode
  children: ReactNode
  placement?: Placement
  menuProps?: FloatingMenuClassNames
  onOpenChange?: (open: boolean) => void
}

/**
 * Floating dropdown that manages its own open state and exposes a render-prop trigger.
 *
 * Example:
 * <FloatingMenu
 *   trigger={({ ref, getReferenceProps }) => (
 *     <button ref={ref} {...getReferenceProps()}>Open</button>
 *   )}
 *   menuProps={{ className: 'w-64' }}>
 *   <div>Menu content</div>
 * </FloatingMenu>
 */
const FloatingMenu: FC<FloatingMenuProps> = ({
  trigger,
  children,
  placement = 'bottom-start',
  menuProps,
  onOpenChange,
}) => {
  const [isOpen, setIsOpen] = useState(false)

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: (open) => {
      setIsOpen(open)
      onOpenChange?.(open)
    },
    placement,
    middleware: [offset(12), shift({ padding: 8 })],
  })

  const { isMounted, status } = useTransitionStatus(context)
  const hover = useHover(context, { handleClose: safePolygon() })
  const click = useClick(context, { toggle: true })
  const dismiss = useDismiss(context)
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, click, dismiss])

  return (
    <>
      {trigger({
        isOpen,
        setIsOpen,
        ref: refs.setReference,
        getReferenceProps,
      })}
      {isMounted ? (
        <FloatingPortal>
          <div
            // eslint-disable-next-line react-hooks/refs
            ref={refs.setFloating}
            style={floatingStyles as CSSProperties}
          {...getFloatingProps()}
          className="absolute z-500">
          <div
            data-status={status}
            className={twJoin(
              'relative w-fit max-w-lg origin-top overflow-hidden rounded-xl bg-black p-4 shadow-2xl outline outline-white/5 xl:p-6',
              'data-[status=initial]:scale-90 data-[status=initial]:opacity-0',
              'data-[status=open]:scale-100 data-[status=open]:opacity-100 data-[status=open]:duration-240',
              'data-[status=close]:scale-90 data-[status=close]:opacity-0 data-[status=close]:duration-200',
              menuProps?.className,
            )}>
              <div className={menuProps?.childrenClassName ?? 'flex flex-col gap-3'}>{children}</div>
            </div>
          </div>
        </FloatingPortal>
      ) : null}
    </>
  )
}

export default FloatingMenu
