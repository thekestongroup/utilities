import { BookOpen, Printer, type LucideIcon } from '@lucide/vue'

export interface Tool {
  id: string
  title: string
  description: string
  path: string
  icon: LucideIcon
}

/** Every tool on the site. Add one here, add its route in router.ts, and it appears in the sidebar and on the home page. */
export const tools: Tool[] = [
  {
    id: 'totp-book',
    title: 'TOTP Code Book',
    description:
      'Print every 2FA code for the next month (or six) as a book. The least practical way to back up 2FA, done properly.',
    path: '/totp-book',
    icon: BookOpen
  },
  {
    id: 'manual-duplex',
    title: 'Manual duplex printing',
    description: 'Print on both sides with a printer that can\'t. Splits a PDF in two and shows how to turn the paper round between the runs.',
    path: '/manual-duplex',
    icon: Printer
  }
]
