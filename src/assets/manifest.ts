// Every PNG dropped into this folder becomes an available layer asset automatically —
// no registration step. Run `npm run assets` after adding one to assets-source/ so it gets
// trimmed and downscaled first.

const pngs = import.meta.glob('./*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const jpgs = import.meta.glob('./*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

/** Transparent border, in texture pixels, added by scripts/prepare-assets.sh. */
export const ASSET_PAD = 8

export interface AssetInfo {
  key: string
  label: string
  url: string
}

function prettify(key: string): string {
  return key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export const ASSETS: AssetInfo[] = Object.entries(pngs)
  .map(([path, url]) => {
    const key = path.replace(/^\.\//, '').replace(/\.png$/, '')
    return { key, label: prettify(key), url }
  })
  .sort((a, b) => a.key.localeCompare(b.key))

export function assetUrl(key: string): string | undefined {
  return ASSETS.find((a) => a.key === key)?.url
}

/** The artist's original composition, used as a tracing ghost in edit mode. */
export const REFERENCE_URL: string | undefined = jpgs['./reference-composition.jpg']
