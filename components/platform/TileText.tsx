'use client'

import { type FC, useMemo } from 'react'

import { useCourseSurface } from '@/hooks/useCourseSurface'
import type { TextCanvasOptions } from '@/hooks/useTextCanvas'
import type { CourseSurface } from '@/utils/platform/courseSurface'
import { createTileTextLayout } from '@/utils/platform/tileText'
import { TILE_SIZE } from '@/utils/tiles'

import { Text } from './Text'
import { UNBOUNDED_FONT_FAMILY } from './fonts'

const TILE_TEXT_SIZE = TILE_SIZE * 0.9

export type TileTextProps = {
  text: string
  rowIndex: number
  centerColumn: number
  surface?: CourseSurface
  textCanvasOptions?: Pick<TextCanvasOptions, 'color' | 'fontFamily' | 'fontWeight'>
}

/** One character per tile, with even-length words biased left when the centre falls on a tile. */
export const TileText: FC<TileTextProps> = ({
  text,
  rowIndex,
  centerColumn,
  surface,
  textCanvasOptions,
}) => {
  const courseSurface = useCourseSurface()
  const resolvedSurface = surface ?? courseSurface
  const characters = useMemo(
    () => createTileTextLayout(text, rowIndex, centerColumn, resolvedSurface.columns),
    [text, rowIndex, centerColumn, resolvedSurface.columns],
  )

  return characters.map(({ character, column, position }) => character === ' ' ? null : (
    <Text
      key={column}
      text={character}
      position={position}
      surface={resolvedSurface}
      width={TILE_TEXT_SIZE}
      height={TILE_TEXT_SIZE}
      textCanvasOptions={{
        color: '#ffffff',
        fontFamily: UNBOUNDED_FONT_FAMILY,
        ...textCanvasOptions,
      }}
    />
  ))
}
