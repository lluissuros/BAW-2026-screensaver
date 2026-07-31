import { defineConfig } from 'vite'

export default defineConfig({
  // Relative, so a built dist/ works from a file server or a USB stick without knowing the
  // deploy path — the machine driving the festival screen might be either.
  //
  // The Pages build passes `--base=/<repo>/` instead (see scripts/build-site.mjs): the generated
  // `/1/`, `/calm/` route pages live in subdirectories, and relative asset URLs would resolve
  // against those rather than the site root.
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
})
