'use client'

import { useEffect, useRef, useState } from 'react'
import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three/webgpu'

export type TextTexture = {
  texture: CanvasTexture
  /** Width divided by height, for sizing a plane without distorting the glyphs. */
  aspect: number
}

const TEXTURE_FONT_SIZE = 96
const MIN_TEXTURE_FONT_SIZE = 32
const TEXTURE_FONT_STEP = 4
const TEXTURE_PADDING_X = 32
const TEXTURE_PADDING_Y = 20
const MAX_TEXTURE_WIDTH = 640
const TEXT_LINE_HEIGHT = 1.2
const FONT_FAMILY = 'Nunito Sans, system-ui, sans-serif'
const FONT_WEIGHT = 700

const setCanvasFont = (context: CanvasRenderingContext2D, fontSize: number): void => {
  context.font = `${FONT_WEIGHT} ${fontSize}px ${FONT_FAMILY}`
}

const measureTextWidth = (
  context: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
): number => {
  setCanvasFont(context, fontSize)
  return context.measureText(text).width
}

const fitFontSize = (context: CanvasRenderingContext2D, text: string): number => {
  const maxTextWidth = MAX_TEXTURE_WIDTH - TEXTURE_PADDING_X * 2
  let fontSize = TEXTURE_FONT_SIZE

  while (fontSize > MIN_TEXTURE_FONT_SIZE) {
    if (measureTextWidth(context, text, fontSize) <= maxTextWidth) break
    fontSize -= TEXTURE_FONT_STEP
  }

  return fontSize
}

const createTextTexture = (text: string, colour: string): TextTexture | null => {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return null

  const fontSize = fitFontSize(context, text)
  const textWidth = measureTextWidth(context, text, fontSize)
  canvas.width = Math.ceil(textWidth + TEXTURE_PADDING_X * 2)
  canvas.height = Math.ceil(fontSize * TEXT_LINE_HEIGHT + TEXTURE_PADDING_Y * 2)

  // Resizing the canvas resets its drawing state, so configure it afterwards.
  context.clearRect(0, 0, canvas.width, canvas.height)
  setCanvasFont(context, fontSize)
  context.fillStyle = colour
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, canvas.width / 2, canvas.height / 2)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.generateMipmaps = false
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter

  return { texture, aspect: canvas.width / canvas.height }
}

/**
 * Renders one line of text into a canvas-backed texture for an in-scene label.
 *
 * The texture is created in an animation frame so Strict Mode's mount replay can cancel it before
 * any GPU resource is committed, and the previous texture is disposed of when the text changes.
 */
export const useTextTexture = (text: string, colour: string): TextTexture | null => {
  const [textTexture, setTextTexture] = useState<TextTexture | null>(null)
  const textTextureRef = useRef<TextTexture | null>(null)

  useEffect(() => {
    let isDisposed = false
    let frame = 0

    const commit = () => {
      if (isDisposed) return
      const next = createTextTexture(text, colour)
      if (!next) return
      textTextureRef.current?.texture.dispose()
      textTextureRef.current = next
      setTextTexture(next)
    }

    frame = requestAnimationFrame(commit)
    // The first frame can run before the Next font has loaded, which would bake in the fallback
    // face. Redraw once the font set settles.
    void document.fonts.ready.then(() => {
      if (isDisposed) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(commit)
    })

    return () => {
      isDisposed = true
      cancelAnimationFrame(frame)
    }
  }, [text, colour])

  useEffect(
    () => () => {
      textTextureRef.current?.texture.dispose()
      textTextureRef.current = null
    },
    [],
  )

  return textTexture
}
