import { readFileSync } from 'node:fs'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Compile only the TypeScript modules exercised by the tests, in memory. This keeps the native Node
// runner usable without another runtime dependency, emitted files, or a browser/React test stack.
export function loadTypeScript(relativePath, overrides = {}, cache = new Map()) {
  const filename = path.resolve(projectRoot, relativePath)
  if (cache.has(filename)) return cache.get(filename).exports
  const loaded = new Module(filename)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  cache.set(filename, loaded)
  const nativeRequire = createRequire(filename)
  loaded.require = (specifier) => {
    if (Object.hasOwn(overrides, specifier)) return overrides[specifier]
    if (specifier.startsWith('@/')) {
      return loadTypeScript(`${specifier.slice(2)}.ts`, overrides, cache)
    }
    return nativeRequire(specifier)
  }
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  })
  loaded._compile(outputText, filename)
  return loaded.exports
}
