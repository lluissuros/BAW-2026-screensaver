import { collectionLink, routeLink, shareLink, submitIssueLink } from '../config/links'
import { deleteLocalPreset, localLooks, publishedLooks, type PresetEntry } from '../config/presets'
import { REPO } from '../config/site'
import type { Config } from '../config/types'
import type { ThumbnailRenderer } from '../engine/thumbnail'

/**
 * The gallery is how someone who has never opened a code editor uses this thing: move sliders,
 * save, and every version you tried is a card you can come back to and send to someone.
 *
 * Thumbnails are rendered by the real renderer, so a card is exactly what the screen will show.
 */

export interface GalleryHooks {
  onOpen: (config: Config, label: string) => void
  onSaveCurrent: () => void
  getCurrent: () => Config
  thumbnails: ThumbnailRenderer
}

export class Gallery {
  readonly el: HTMLElement
  private readonly grid: HTMLElement
  private readonly note: HTMLElement
  /** Looks arriving from a collection link — someone else's saves, not ours. */
  private received: PresetEntry[] = []

  constructor(parent: HTMLElement, private readonly hooks: GalleryHooks) {
    this.el = document.createElement('div')
    this.el.id = 'gallery'
    this.el.className = 'hidden'

    const head = document.createElement('header')
    head.innerHTML = `
      <div>
        <h2>Looks</h2>
        <p>Move the sliders, save what you like, send anyone the link. Nothing to install.</p>
      </div>`
    const actions = document.createElement('div')
    actions.className = 'row'
    actions.append(
      btn('Save this look', 'btn primary', () => this.hooks.onSaveCurrent()),
      btn('Close', 'btn', () => this.close()),
    )
    head.append(actions)

    this.note = document.createElement('div')
    this.note.className = 'gallery-note'

    this.grid = document.createElement('div')
    this.grid.className = 'gallery-body'

    this.el.append(head, this.note, this.grid)
    parent.append(this.el)
  }

  get isOpen(): boolean {
    return !this.el.classList.contains('hidden')
  }

  open(received: Config[] = []): void {
    if (received.length > 0) {
      this.received = received.map((config, i) => ({
        name: config.name || `shared ${i + 1}`,
        slug: `shared-${i + 1}`,
        source: 'local',
        config,
      }))
    }
    this.el.classList.remove('hidden')
    this.refresh()
  }

  close(): void {
    this.el.classList.add('hidden')
  }

  refresh(): void {
    this.grid.replaceChildren()
    this.note.textContent = ''

    const published = publishedLooks()
    const mine = localLooks()

    this.grid.append(
      this.section(
        'Published',
        'Committed to the project, so each one has its own short address that always works.',
        published,
      ),
    )

    const mineSection = this.section(
      'Saved on this device',
      mine.length > 0
        ? 'These live in this browser only. Use “Copy link” to send one somewhere permanent.'
        : 'Nothing saved yet. Open the editor, move some sliders, then press “Save this look”.',
      mine,
    )
    this.grid.append(mineSection)

    if (mine.length > 1) {
      const row = document.createElement('div')
      row.className = 'row gallery-bulk'
      row.append(
        btn('Copy one link with all of them', 'btn', async () => {
          await copy(collectionLink(mine.map((entry) => entry.config)))
          this.say(`Copied a link containing all ${mine.length} of your looks.`)
        }),
      )
      mineSection.append(row)
    }

    if (this.received.length > 0) {
      this.grid.append(
        this.section('Shared with you', 'Came in on the link you opened. Save one to keep it.', this.received),
      )
    }
  }

  private section(title: string, blurb: string, entries: PresetEntry[]): HTMLElement {
    const section = document.createElement('section')
    const heading = document.createElement('h3')
    heading.textContent = title
    const description = document.createElement('p')
    description.textContent = blurb
    section.append(heading, description)

    if (entries.length > 0) {
      const grid = document.createElement('div')
      grid.className = 'cards'
      for (const entry of entries) grid.append(this.card(entry))
      section.append(grid)
    }
    return section
  }

  private card(entry: PresetEntry): HTMLElement {
    const card = document.createElement('article')
    card.className = 'card'

    const figure = document.createElement('div')
    figure.className = 'thumb'
    const img = document.createElement('img')
    img.alt = entry.name
    figure.append(img)
    void this.hooks.thumbnails
      .render(entry.config, `${entry.source}:${entry.slug}:${entry.name}`)
      .then((url) => {
        img.src = url
      })
      .catch(() => figure.classList.add('failed'))

    figure.addEventListener('click', () => this.openEntry(entry))

    const title = document.createElement('h4')
    title.textContent = entry.name
    if (entry.number !== undefined) {
      const badge = document.createElement('span')
      badge.className = 'badge'
      badge.textContent = `/${entry.number}`
      title.prepend(badge)
    }

    const actions = document.createElement('div')
    actions.className = 'row'
    actions.append(
      btn('Open', 'btn primary', () => this.openEntry(entry)),
      btn('Copy link', 'btn', async () => {
        const url = entry.number !== undefined ? routeLink(entry.number) : shareLink(entry.config)
        await copy(url)
        this.say(`Copied the link to “${entry.name}”.`)
      }),
    )
    if (entry.source === 'local' && !entry.slug.startsWith('shared-')) {
      actions.append(
        btn('Delete', 'btn', () => {
          if (!confirm(`Delete “${entry.name}”?`)) return
          deleteLocalPreset(entry.name)
          this.refresh()
        }),
      )
      actions.append(
        btn('Submit', 'btn', () => {
          window.open(submitIssueLink(REPO, entry.config), '_blank', 'noopener')
          this.say('Opened a submission — Lluis publishes it and it gets its own number.')
        }),
      )
    }

    card.append(figure, title, actions)
    return card
  }

  private openEntry(entry: PresetEntry): void {
    this.hooks.onOpen(structuredClone(entry.config), entry.name)
    this.close()
  }

  private say(message: string): void {
    this.note.textContent = message
  }
}

function btn(text: string, className: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = className
  el.textContent = text
  el.addEventListener('click', onClick)
  return el
}

export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Clipboard access needs a secure context and a gesture; fall back to a selectable prompt.
    prompt('Copy this link:', text)
    return false
  }
}
