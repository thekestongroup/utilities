import { createRouter, createWebHashHistory, type RouteLocationNormalized } from 'vue-router'
import HomeView from './views/HomeView.vue'
import TotpBookView from './tools/totp-book/TotpBookView.vue'
import TotpCheckerView from './tools/totp-book/TotpCheckerView.vue'
import PasswordView from './tools/password/PasswordView.vue'
import HashView from './tools/hash/HashView.vue'
import QrView from './tools/qr/QrView.vue'
import MetadataView from './tools/metadata/MetadataView.vue'

const title = (to: RouteLocationNormalized) => String(to.meta.title ?? 'Keston Utilities')

// Hash history: the part after # is never sent to a server, which matters
// because some tools keep their settings (including a TOTP setup key) there.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { title: 'Keston Utilities' } },
    { path: '/totp', redirect: '/totp/checker' },
    { path: '/totp/checker', name: 'totp-checker', component: TotpCheckerView, meta: { title: 'TOTP code checker' } },
    { path: '/totp/book', name: 'totp-book', component: TotpBookView, meta: { title: 'TOTP code book' } },
    // The PDF editor, with its pdf.js page previews, is only fetched when it is opened.
    { path: '/pdf', name: 'pdf', component: () => import('./tools/pdf/PdfEditorView.vue'), meta: { title: 'PDF editor' } },
    { path: '/metadata', name: 'metadata', component: MetadataView, meta: { title: 'Metadata stripper' } },
    { path: '/password', name: 'password', component: PasswordView, meta: { title: 'Password generator' } },
    { path: '/hash', name: 'hash', component: HashView, meta: { title: 'Hash & checksum' } },
    { path: '/qr', name: 'qr', component: QrView, meta: { title: 'QR code generator' } },
    // Links from the first version of the site.
    { path: '/totp-book', redirect: (to) => ({ path: '/totp/book', query: to.query }) },
    { path: '/manual-duplex', redirect: (to) => ({ path: '/pdf', query: { ...to.query, mode: 'duplex' } }) },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ],
  // New page: start at the top (or where Back left you). Same page with different options (the
  // tools rewrite their address as options change): stay where you are.
  scrollBehavior: (to, from, saved) => saved ?? (to.path !== from.path ? { top: 0 } : false)
})

router.afterEach((to) => {
  document.title = to.name === 'home' ? 'Keston Utilities' : `${title(to)} · Keston Utilities`
})
