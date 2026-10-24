/**
 * Resolution policy for the game canvas.
 *
 * The stored value is a cap, not a forced ratio: `resolveCanvasDpr` takes the smaller of the device
 * ratio and the cap, so a 1x display still renders at 1x.
 *
 * The default sits below the ceiling because the frame budget goes to the effects. The automatic
 * ladder can lower the cap to `MIN_AUTO_DPR`; `MAX_DPR` is the hard ceiling that browser zoom or a
 * 3x phone cannot push past.
 */
export const DEFAULT_MAX_DPR = 1.5
export const MAX_DPR = 2
export const MIN_AUTO_DPR = 1
export const DPR_STEP = 0.5

export const resolveCanvasDpr = (maxDpr: number): number => {
  if (typeof window === 'undefined') return 1
  const devicePixelRatio = window.devicePixelRatio ?? 1
  return Math.min(devicePixelRatio, maxDpr, MAX_DPR)
}

/** One step down the automatic ladder, never below the 1x floor. */
export const stepMaxDprDown = (maxDpr: number): number =>
  Math.max(MIN_AUTO_DPR, maxDpr - DPR_STEP)
