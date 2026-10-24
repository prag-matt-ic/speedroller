'use client'

import { Canvas, type CanvasProps, type WebGPURootState } from '@react-three/fiber'
import { type FC, type PropsWithChildren, Suspense, useCallback } from 'react'
import { NeutralToneMapping } from 'three'
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
  // Match Threenix landing: Neutral tone mapping before the pipeline's sRGB output conversion.
  const handleCreated = useCallback(
    (state: WebGPURootState) => {
      state.renderer.toneMapping = NeutralToneMapping
      state.renderer.toneMappingExposure = 1
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
