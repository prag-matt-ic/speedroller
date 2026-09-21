'use client'

import { useThree } from '@react-three/fiber/webgpu'
import { type RefObject, useEffect, useRef } from 'react'
import { type Camera, type Object3D, type PassNode, type WebGPURenderer } from 'three/webgpu'

/** Compile the actual draw target, including mounted off-camera content. */
const compileScene = async (
  renderer: WebGPURenderer,
  scene: Object3D,
  camera: Camera,
  scenePass?: PassNode,
) => {
  await renderer.init()

  const target = renderer.getRenderTarget()
  const cubeFace = renderer.getActiveCubeFace()
  const mipLevel = renderer.getActiveMipmapLevel()
  const mrt = renderer.getMRT()
  const objects: [Object3D, boolean, boolean][] = []

  try {
    renderer.setRenderTarget(scenePass?.renderTarget ?? null)
    renderer.setMRT(scenePass?.getMRT() ?? null)

    let compilation: Promise<void>
    try {
      scene.traverse((object) => {
        objects.push([object, object.visible, object.frustumCulled])
        object.visible = true
        object.frustumCulled = false
      })
      // In installed Three r185, an initialized renderer collects the entire render list before
      // its first await. Restore flags immediately so R3F's next onFramed pass sees real visibility.
      compilation = renderer.compileAsync(scene, camera)
    } finally {
      for (const [object, visible, frustumCulled] of objects) {
        object.visible = visible
        object.frustumCulled = frustumCulled
      }
    }
    await compilation
  } finally {
    renderer.setRenderTarget(target, cubeFace, mipLevel)
    renderer.setMRT(mrt)
  }
}

export type SceneWarmupOptions = {
  /** Content readiness ONLY: exclude warmup completion and keep true while compilation runs. */
  isSceneReady: boolean
  /** Omit for direct Canvas rendering. Null/empty ref waits for a custom pass. Publish a new ref
   * identity or change revision when assigning .current; ref writes alone do not trigger effects. */
  scenePassRef?: RefObject<PassNode | null> | null
  /** Called before the work is scheduled, so an owner can hold its readiness gate while it is pending. */
  onWarmupStart?: () => void
  /** Called once a warmup attempt settles, including on failure, so an owner can release its gate. */
  onWarmupComplete?: () => void
  /** Change to re-queue warmup for a rebuilt scene or pipeline configuration, e.g. a quality tier. */
  revision?: unknown
  /** Owner-supplied handle to the in-flight compilation, for pausing draws or deferring disposal. */
  compilationRef?: RefObject<Promise<void> | null>
}

/**
 * Compiles the Canvas scene or supplied postprocessing pass off the critical path, once content has
 * settled. Warmup is unsupported-renderer and failure tolerant: a compile that throws or rejects
 * is logged, never propagated, and still reports completion so a loading gate cannot stay closed.
 */
export const useSceneWarmup = ({
  compilationRef,
  isSceneReady,
  onWarmupComplete,
  onWarmupStart,
  revision,
  scenePassRef,
}: SceneWarmupOptions) => {
  const renderer = useThree((s) => s.renderer)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const get = useThree((s) => s.get)
  const internalCompilationRef = useRef<Promise<void> | null>(null)
  const pendingCompilationRef = compilationRef ?? internalCompilationRef

  // Latest-callback refs keep a caller's fresh inline callback from re-queueing an expensive compile.
  const onWarmupStartRef = useRef(onWarmupStart)
  const onWarmupCompleteRef = useRef(onWarmupComplete)

  useEffect(() => {
    onWarmupStartRef.current = onWarmupStart
    onWarmupCompleteRef.current = onWarmupComplete
  }, [onWarmupComplete, onWarmupStart])

  useEffect(() => {
    if (!isSceneReady || (scenePassRef !== undefined && !scenePassRef?.current)) return

    onWarmupStartRef.current?.()

    let isCancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let idleId: number | null = null

    const onRunWarmup = () => {
      if (isCancelled) return

      // Quality/pass changes queue behind the current compile; cancelled queued runs do no work.
      const compilation = (pendingCompilationRef.current ?? Promise.resolve()).then(
        async () => {
          if (isCancelled || (scenePassRef !== undefined && !scenePassRef?.current)) return
          const scenePass = scenePassRef?.current ?? undefined
          const frameloop = get().frameloop
          try {
            if (typeof renderer.compileAsync === 'function') {
              // The default Canvas has no custom draw callback to guard with compilationRef.
              if (!scenePass) get().setFrameloop('never')
              await compileScene(
                renderer,
                scenePass?.scene ?? scene,
                scenePass?.camera ?? camera,
                scenePass,
              )
            }
          } catch (error) {
            console.error('[useSceneWarmup] compileAsync warmup failed.', error)
          } finally {
            if (!scenePass) {
              get().setFrameloop(frameloop)
              get().invalidate()
            }
          }

          if (!isCancelled && (scenePassRef === undefined || scenePassRef?.current))
            onWarmupCompleteRef.current?.()
        },
      )
      pendingCompilationRef.current = compilation
      void compilation.then(() => {
        if (pendingCompilationRef.current === compilation) pendingCompilationRef.current = null
      })
    }

    // Prefer idle warmup so we don't compete with first paint/interactions.
    if (window.requestIdleCallback) {
      idleId = window.requestIdleCallback(() => void onRunWarmup(), { timeout: 1000 })
    } else {
      timeoutId = setTimeout(() => void onRunWarmup(), 50)
    }

    return () => {
      isCancelled = true
      if (timeoutId) clearTimeout(timeoutId)
      if (idleId !== null) window.cancelIdleCallback?.(idleId)
    }
  }, [
    camera,
    get,
    isSceneReady,
    pendingCompilationRef,
    renderer,
    revision,
    scene,
    scenePassRef,
  ])
}
