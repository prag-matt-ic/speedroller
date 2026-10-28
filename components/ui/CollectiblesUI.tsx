'use client'
import { GemIcon, LockIcon, XIcon } from 'lucide-react'
import { type CSSProperties, type FC, useEffect, useRef, useState } from 'react'
import { twJoin } from 'tailwind-merge'

import { useGameStore } from '@/components/GameProvider'
import { COLLECTIBLE_IDS, CollectibleID } from '@/model/schema'
import { GEMS_COLOURS_BY_ID } from '@/resources/colours'
import { COLLECTIBLES_CONTENT } from '@/resources/content'
import FloatingMenu from '@/components/ui/FloatingMenu'

const CollectiblesUI: FC = () => {
  const collectedCollectibles = useGameStore((s) => s.collectedCollectibles)
  const seenCollectibles = useGameStore((s) => s.seenCollectibles)
  const markCollectibleSeen = useGameStore((s) => s.markCollectibleSeen)
  return (
    <>
      {COLLECTIBLE_IDS.map((id) => {
        return (
          <CollectibleIcon
            key={id}
            id={id}
            isCollected={collectedCollectibles.includes(id)}
            hasSeen={!!seenCollectibles[id]}
            markSeen={markCollectibleSeen}
          />
        )
      })}
    </>
  )
}

export default CollectiblesUI

export const CollectibleIcon: FC<{
  id: CollectibleID
  isCollected: boolean
  hasSeen: boolean
  markSeen: (collectibleId: CollectibleID) => void
}> = ({ id, isCollected, hasSeen, markSeen }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const setMenuOpenRef = useRef<((open: boolean) => void) | null>(null)

  const collectedColour = GEMS_COLOURS_BY_ID[id]?.colour
  const ContentIcon = COLLECTIBLES_CONTENT[id].Icon

  useEffect(() => {
    if (!isCollected || hasSeen || isMenuOpen) return
    // Auto-open once when just unlocked.
    const timeout = setTimeout(() => {
      setMenuOpenRef.current?.(true)
    }, 1000)
    return () => clearTimeout(timeout)
  }, [hasSeen, isCollected, isMenuOpen])

  return (
    <FloatingMenu
      placement="bottom"
      onOpenChange={(open) => {
        setIsMenuOpen(open)
        if (!open && isCollected && !hasSeen) {
          markSeen(id)
        }
      }}
      menuProps={{
        className: 'flex items-center gap-3 xl:gap-4',
        childrenClassName: 'contents',
      }}
      trigger={({ ref, getReferenceProps, setIsOpen }) => {
        setMenuOpenRef.current = setIsOpen
        return (
          <div
            style={
              {
                '--icon-colour': collectedColour,
              } as CSSProperties
            }
            ref={ref}
            {...getReferenceProps()}
            className={twJoin('pointer-events-auto relative cursor-pointer')}>
            {/* Colour */}
            <GemIcon
              size={40}
              strokeWidth={0}
              className={twJoin(
                'absolute inset-0 size-7 text-transparent transition-opacity xl:size-10',
                isCollected ? 'scale-120 fill-(--icon-colour)/60' : '',
              )}
            />
            {/* Border */}
            <GemIcon
              size={40}
              strokeWidth={0.75}
              className={twJoin(
                'relative size-7 text-white xl:size-10',
                isCollected ? 'scale-120 opacity-100' : 'opacity-35',
              )}
            />
          </div>
        )
      }}>
      <div
        style={
          {
            '--icon-colour': collectedColour,
          } as CSSProperties
        }
        className="flex items-center gap-3 xl:gap-4">
        <button
          type="button"
          aria-label="Close collectible info"
          onClick={(event) => {
            event.stopPropagation()
            setMenuOpenRef.current?.(false)
          }}
          className="absolute top-0 right-0 p-4 text-neutral-400 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:outline-none">
          <XIcon className="size-4 xl:size-4.5" strokeWidth={1.5} />
        </button>
        {isCollected ? (
          <ContentIcon
            strokeWidth={1}
            className="size-8 shrink-0 text-(--icon-colour) xl:size-10"
          />
        ) : (
          <LockIcon strokeWidth={1} className="size-5 shrink-0 text-neutral-500 xl:size-6" />
        )}
        <p className="block flex-1 overflow-hidden">
          <span className="mb-1 text-xs font-medium tracking-wider text-neutral-500 uppercase xl:text-sm">
            Bonus
          </span>
          {isCollected ? (
            <span className="block">{COLLECTIBLES_CONTENT[id].content}</span>
          ) : (
            <span className="block text-sm font-semibold lg:text-base">
              Unlock the gem to learn more
            </span>
          )}
        </p>
      </div>
    </FloatingMenu>
  )
}
