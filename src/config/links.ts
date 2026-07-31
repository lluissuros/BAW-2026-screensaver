import type { Config } from './types'
import { encodeConfig } from './store'

/**
 * Every look is reachable by URL, which is the whole storage story: no server, no account, no
 * file to email. Two shapes:
 *
 *  - a **share link** carries the look itself in the hash — anyone can make one by moving
 *    sliders, and it works the moment it is pasted anywhere.
 *  - a **route** is a short path (`/3/`) that the build generates for looks committed to the
 *    repo. Prettier, permanent, but only Lluis can mint one.
 */

/** The site root, e.g. `/BAW-2026-screensaver/` on GitHub Pages or `/` when developing. */
export function siteBase(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

function origin(): string {
  return `${location.origin}${siteBase()}`
}

export function shareLink(config: Config, options: { edit?: boolean } = {}): string {
  const query = options.edit ? '?edit=1' : ''
  return `${origin()}${query}#c=${encodeConfig(config)}`
}

export function routeLink(number: number): string {
  return `${origin()}${number}/`
}

/**
 * A single link carrying several looks, so someone can send everything they tried in one go
 * instead of a wall of URLs.
 */
export function collectionLink(configs: Config[]): string {
  return `${origin()}?gallery=1#cs=${configs.map((c) => encodeConfig(c)).join('.')}`
}

export function parseCollection(hash: string): string[] {
  return hash.split('.').filter(Boolean)
}

/**
 * Opens a pre-filled GitHub issue. Someone with a GitHub account can submit a look this way and
 * Lluis publishes it by adding one label from his phone — no backend, and nothing lands in the
 * repo unattended.
 */
export function submitIssueLink(repo: string, config: Config): string {
  const title = `look: ${config.name}`
  const body = [
    `Submitting a look for the BAW! screens.`,
    '',
    'Share link (do not edit this line — the workflow reads it):',
    '',
    shareLink(config),
    '',
  ].join('\n')
  return `https://github.com/${repo}/issues/new?labels=publish-look&title=${encodeURIComponent(
    title,
  )}&body=${encodeURIComponent(body)}`
}
