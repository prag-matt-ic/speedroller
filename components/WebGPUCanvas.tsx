'use client'

import { Canvas, type CanvasProps } from '@react-three/fiber/webgpu'
import { type FC, type PropsWithChildren, Suspense } from 'react'
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
  ...canvasProps
}) => {
  return (
    <Canvas
      {...canvasProps}
      dpr={dpr}
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
