'use client'

import { Canvas, type CanvasProps, type RootState } from '@react-three/fiber/webgpu'
import { type FC, type PropsWithChildren, Suspense, useCallback } from 'react'
import { NoToneMapping } from 'three'
import type { WebGPURendererParameters } from 'three/src/renderers/webgpu/WebGPURenderer.Nodes.js'

export type WebGPUCanvasProps = PropsWithChildren<
  Omit<CanvasProps, 'children' | 'gl' | 'renderer'> & {
    rendererProps?: Omit<WebGPURendererParameters, 'canvas'>
  }
>

const DEFAULT_RENDERER_PROPS: Omit<WebGPURendererParameters, 'canvas'> = {
  forceWebGL: false,
  powerPreference: 'high-performance',
  antialias: true,
  stencil: false,
}

const WebGPUCanvas: FC<WebGPUCanvasProps> = ({
  children,
  dpr = [1, 2],
  rendererProps,
  onCreated,
  ...canvasProps
}) => {
  // R3F's WebGPU canvas defaults the renderer to ACES filmic tone mapping. The scene pass owns the
  // final image — Effects.tsx turns the pipeline's colour transform off — so the canvas must pass
  // the rendered colour through untouched.
  const handleCreated = useCallback(
    (state: RootState) => {
      state.renderer.toneMapping = NoToneMapping
      onCreated?.(state)
    },
    [onCreated],
  )

  return (
    <Canvas
      {...canvasProps}
      dpr={dpr}
      onCreated={handleCreated}
      fallback={
        <p data-guide-canvas-state="loading" role="status">
          Loading...
        </p>
      }
      onContextMenu={(event) => event.preventDefault()}
      renderer={{
        ...DEFAULT_RENDERER_PROPS,
        ...rendererProps,
      }}>
      <Suspense fallback={null}>{children}</Suspense>
    </Canvas>
  )
}

export default WebGPUCanvas
