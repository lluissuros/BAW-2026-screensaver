import { defineConfig } from 'vite'

export default defineConfig({
  // Relative base so a built dist/ works from a file server, a USB stick or GitHub Pages
  // without knowing the deploy path — the machine driving the festival screen might be any
  // of those.
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
})
