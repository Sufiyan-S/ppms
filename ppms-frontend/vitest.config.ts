import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    server: {
      fs: { allow: ['.', '../ppms-backend/src/main/java/com/ppms/audit'] },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      env: { TZ: 'UTC' },
      restoreMocks: true,
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx'],
        reporter: ['text-summary', 'text', 'html'],
      },
    },
  }),
)
