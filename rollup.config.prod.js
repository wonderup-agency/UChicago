import { readdirSync, accessSync, readFileSync } from 'node:fs'
import { defineConfig } from 'rollup'
import del from 'rollup-plugin-delete'
import terser from '@rollup/plugin-terser'
import resolve from '@rollup/plugin-node-resolve'
import postcss from 'rollup-plugin-postcss'
import postcssPresetEnv from 'postcss-preset-env'
import commonjs from '@rollup/plugin-commonjs'

function getPageEntries() {
  try {
    return Object.fromEntries(
      readdirSync('src/pages', { recursive: true })
        .filter((f) => f.endsWith('.js'))
        .map((f) => {
          const normalized = f.replace(/\\/g, '/')
          return [normalized.replace(/\.js$/, ''), `src/pages/${normalized}`]
        })
    )
  } catch {
    return {}
  }
}

function checkGlobalJs() {
  return {
    name: 'check-global-js',
    buildStart() {
      try {
        accessSync('src/components/global.js')
      } catch {
        this.warn(
          'src/components/global.js not found. Global initialization will be skipped at runtime.'
        )
      }
    },
  }
}

// Emits src/data/*.json as dist/data/*.json (fetched at runtime, kept out of the bundle)
function copyData() {
  return {
    name: 'copy-data',
    generateBundle() {
      let files = []
      try {
        files = readdirSync('src/data').filter((f) => f.endsWith('.json'))
      } catch {
        return
      }
      files.forEach((f) => {
        this.addWatchFile(`src/data/${f}`)
        this.emitFile({
          type: 'asset',
          fileName: `data/${f}`,
          source: readFileSync(`src/data/${f}`),
        })
      })
    },
  }
}

export default defineConfig({
  input: {
    main: 'src/main.js',
    ...getPageEntries(),
  },
  output: {
    dir: 'dist',
    format: 'es',
    entryFileNames: '[name].js',
    chunkFileNames: '[name]-[hash].js',
    sourcemap: false,
  },
  plugins: [
    del({ targets: 'dist/*' }),
    checkGlobalJs(),
    copyData(),
    resolve(),
    commonjs(),
    postcss({
      plugins: [postcssPresetEnv({ stage: 2 })],
      extract: 'styles.css',
      minimize: true,
      sourceMap: false,
    }),
    terser({
      compress: {
        drop_console: true,
      },
      output: {
        comments: false,
      },
    }),
  ],
})
