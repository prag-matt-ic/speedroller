import { useEffect, useRef, useState } from 'react'
import { CanvasTexture, ClampToEdgeWrapping, DataTexture, LinearFilter, Texture } from 'three'

export type CanvasState = {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  texture: CanvasTexture
}

export type TextCanvasOptions = {
  width: number
  height: number
  color?: string
  fontFamily?: string
  fontWeight?: number | string
  fontSize?: number // in pixels (e.g. 24)
  scaleStep?: number // e.g. 0.9 (reduce by 10%)
  minScale?: number // e.g. 0.5 (50%)
  lineHeightMultiplier?: number
  paddingXFrac?: number // each side fraction (e.g. 0.08)
  paddingYFrac?: number // top/bottom fraction (e.g. 0.12)
  textAlign?: CanvasTextAlign
  textBaseline?: CanvasTextBaseline
}

export const TEXT_CANVAS_SCALE = 64

const DEFAULTS: Required<Omit<TextCanvasOptions, 'width' | 'height'>> = {
  color: '#ffffff',
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  fontWeight: 600,
  fontSize: 32,
  scaleStep: 0.95,
  lineHeightMultiplier: 1.5,
  minScale: 0.4,
  paddingXFrac: 0.1,
  paddingYFrac: 0.1,
  textAlign: 'center',
  textBaseline: 'middle',
}

function getLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = words[0]

  for (let i = 1; i < words.length; i++) {
    const word = words[i]
    const width = ctx.measureText(currentLine + ' ' + word).width
    if (width < maxWidth) {
      currentLine += ' ' + word
    } else {
      lines.push(currentLine)
      currentLine = word
    }
  }
  lines.push(currentLine)
  return lines
}

const transparentPixel = new Uint8Array([0, 0, 0, 0])

export const TRANSPARENT_TEXTURE: Texture = new DataTexture(transparentPixel, 1, 1)
TRANSPARENT_TEXTURE.generateMipmaps = false
TRANSPARENT_TEXTURE.needsUpdate = true
TRANSPARENT_TEXTURE.minFilter = LinearFilter
TRANSPARENT_TEXTURE.magFilter = LinearFilter
TRANSPARENT_TEXTURE.wrapS = ClampToEdgeWrapping
TRANSPARENT_TEXTURE.wrapT = ClampToEdgeWrapping

export function setupCanvasTexture(width: number, height: number): CanvasState {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.style.display = 'none'

  const context = canvas.getContext('2d', { alpha: true })
  if (!context) throw new Error('Failed to get canvas 2D context')

  const texture = new CanvasTexture(canvas)
  texture.generateMipmaps = false
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping

  return { canvas, context, texture }
}

export function writeTextToCanvas(
  context: CanvasRenderingContext2D,
  text: string,
  opts: TextCanvasOptions,
): void {
  const options = { ...DEFAULTS, ...opts }
  const { width, height, lineHeightMultiplier } = options

  // Clear + transparent background
  context.clearRect(0, 0, width, height)
  context.fillStyle = 'rgba(0,0,0,0)'
  context.fillRect(0, 0, width, height)

  const x = width / 2
  const maxTextWidth = width * (1 - options.paddingXFrac * 2)
  const maxTextHeight = height * (1 - options.paddingYFrac * 2)

  // Determine base font size
  let fontSize = options.fontSize
  const minFontSize = Math.floor(fontSize * options.minScale)

  const setFont = () => {
    context.font = `${options.fontWeight} ${fontSize}px ${options.fontFamily}`
  }
  setFont()

  // Get wrapped lines and calculate total height
  let lines = getLines(context, text, maxTextWidth)
  const lineHeight = fontSize * lineHeightMultiplier
  let totalTextHeight = lines.length * lineHeight

  // Scale down only if total height exceeds available height
  for (let i = 0; i < 10; i++) {
    if (totalTextHeight <= maxTextHeight) break
    const nextSize = Math.max(minFontSize, Math.floor(fontSize * options.scaleStep))
    if (nextSize === fontSize) break
    fontSize = nextSize
    setFont()

    // Recalculate lines and height with new font size
    lines = getLines(context, text, maxTextWidth)
    const newLineHeight = fontSize * lineHeightMultiplier
    totalTextHeight = lines.length * newLineHeight
  }

  // Draw each line
  context.textAlign = options.textAlign
  context.textBaseline = 'middle'
  context.fillStyle = options.color

  const actualLineHeight = fontSize * lineHeightMultiplier
  const startY = (height - totalTextHeight) / 2 + actualLineHeight / 2

  for (let i = 0; i < lines.length; i++) {
    const lineY = startY + i * actualLineHeight
    context.fillText(lines[i], x, lineY)
  }
}

export function useTextCanvas(text: string, options: TextCanvasOptions): CanvasState | null {
  const [state, setState] = useState<CanvasState | null>(null)
  const textureRef = useRef<CanvasTexture | null>(null)

  useEffect(() => {
    const cs = setupCanvasTexture(options.width, options.height)
    textureRef.current = cs.texture
    let disposed = false
    const frameId = requestAnimationFrame(() => {
      if (!disposed) {
        setState(cs)
      }
    })
    return () => {
      disposed = true
      cancelAnimationFrame(frameId)
      textureRef.current?.dispose()
      textureRef.current = null
    }
  }, [options.height, options.width])

  useEffect(() => {
    if (!state) return
    writeTextToCanvas(state.context, text, options)
    if (textureRef.current) {
      textureRef.current.needsUpdate = true
    }
  }, [state, text, options])

  return state
}
