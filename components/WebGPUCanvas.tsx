'use client'

import {
  Canvas,
  type CanvasProps,
  type DefaultRendererProps,
  type RendererProps,
  type WebGPURootState,
} from '@react-three/fiber'
import { type FC, type PropsWithChildren, Suspense, useCallback, useMemo } from 'react'
import { NeutralToneMapping } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import type { WebGPURendererParameters } from 'three/src/renderers/webgpu/WebGPURenderer.Nodes.js'

export type WebGPUCanvasProps = PropsWithChildren<
  Omit<CanvasProps, 'children' | 'gl' | 'renderer'> & {
    rendererProps?: Omit<WebGPURendererParameters, 'canvas'>
    /**
     * Opt in to a custom renderer. The factory runs after Fiber has resolved the canvas but before
     * the renderer is used, so installation like `renderer.lighting` lands ahead of the first render.
     */
    createRenderer?: (parameters: WebGPURendererParameters) => WebGPURenderer
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
  createRenderer,
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

  const renderer = useMemo<RendererProps>(() => {
    const parameters = { ...DEFAULT_RENDERER_PROPS, ...rendererProps }
    if (!createRenderer) return parameters
    return (defaults: DefaultRendererProps) =>
      // Fiber's OffscreenCanvas shim is narrower than Three's DOM type; every Canvas host here
      // supplies a browser canvas.
      createRenderer({ ...defaults, ...parameters } as WebGPURendererParameters)
  }, [createRenderer, rendererProps])

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
      renderer={renderer}>
      <Suspense fallback={null}>{children}</Suspense>
    </Canvas>
  )
}

export default WebGPUCanvas
