import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/domain/**/*.test.js', 'src/pages/**/*.test.jsx', 'src/utils/**/*.test.js'],
  },
})
