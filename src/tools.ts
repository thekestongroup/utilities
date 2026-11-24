import { BookOpen, ClockCheck, EyeOff, FilePen, Hash, KeyRound, QrCode, ShieldCheck, type LucideIcon } from '@lucide/vue'

export interface ToolPage {
  title: string
  description: string
  path: string
  icon: LucideIcon
}

/** A tool in the sidebar and on the home page: a page, or a group of pages. */
export interface Tool {
  id: string
  title: string
  description: string
  icon: LucideIcon
  /** A single page. */
  path?: string
  /** Or several pages that belong together. */
  pages?: ToolPage[]
}

/**
 * Every tool on the site. Add one here and in router.ts, and it appears in the sidebar and on the
 * home page.
 */
export const tools: Tool[] = [
  {
    id: 'totp',
    title: 'TOTP Tools',
    description: 'Check a setup key against your authenticator app, or print every code for a month as a book.',
    icon: ShieldCheck,
    pages: [
      {
        title: 'Code checker',
        description: 'Paste a setup key and see its code for right now, to compare with your app.',
        path: '/totp/checker',
        icon: ClockCheck
      },
      {
        title: 'Code book',
        description: 'Print every 2FA code for a month (or up to a year) as a book. The least practical way to back up 2FA, done properly.',
        path: '/totp/book',
        icon: BookOpen
      }
    ]
  },
  {
    id: 'pdf',
    title: 'PDF editor',
    description: 'Merge, reorder, rotate and delete pages, make a booklet, or print on both sides by hand. Save the result.',
    icon: FilePen,
    path: '/pdf'
  },
  {
    id: 'metadata',
    title: 'Metadata stripper',
    description: 'See what photos and PDFs give away (location, camera, author) and remove it.',
    icon: EyeOff,
    path: '/metadata'
  },
  {
    id: 'password',
    title: 'Password generator',
    description: 'Random passwords and passphrases made in your browser, with the options kept in the address.',
    icon: KeyRound,
    path: '/password'
  },
  {
    id: 'hash',
    title: 'Hash & checksum',
    description: 'MD5, SHA-1, SHA-256, SHA-384, SHA-512 and CRC-32 of a file or some text, and check it against the one you were given.',
    icon: Hash,
    path: '/hash'
  },
  {
    id: 'qr',
    title: 'QR code generator',
    description: 'Make a QR code for text, a link or a Wi-Fi network, as a crisp vector you can print or save.',
    icon: QrCode,
    path: '/qr'
  }
]
