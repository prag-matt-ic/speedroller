import { compilePlatform } from './platformCompiler'
import { replaceFiles } from '../utils/editor/replaceFiles'

compilePlatform().then(replaceFiles).then(() => console.warn('Platform rebuilt')).catch(error => {
  console.error(error)
  process.exitCode = 1
})
