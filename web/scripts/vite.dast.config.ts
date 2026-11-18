import { defineConfig } from 'vite'
import baseConfig from '../vite.config.ts'


export default defineConfig({
  ...baseConfig,
  preview: {
    proxy: baseConfig.server?.proxy,
  },
})
