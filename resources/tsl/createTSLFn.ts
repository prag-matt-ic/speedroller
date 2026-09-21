import { Fn } from 'three/tsl'

type TSLFnLayout = {
  name: string
  type: string
  inputs: { name: string; qualifier?: 'in' | 'out' | 'inout'; type: string }[]
}

// `Fn`'s inferred type does not expose `setLayout`, which every helper here uses to name the
// generated GLSL/WGSL function and declare its signature. This mirrors the Threenix
// `packages/ui/src/tslColours.ts` helper so the two codebases read the same way.
export type TSLFn<TArgs extends readonly unknown[], TReturn> = ((
  ...args: TArgs
) => TReturn) & {
  setLayout: (layout: TSLFnLayout) => TSLFn<TArgs, TReturn>
}

export const createTSLFn = Fn as unknown as <TArgs extends readonly unknown[], TReturn>(
  callback: (args: TArgs) => TReturn,
) => TSLFn<TArgs, TReturn>
