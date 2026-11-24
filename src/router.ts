import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import TotpBookView from './tools/totp-book/TotpBookView.vue'
import ManualDuplexView from './tools/manual-duplex/ManualDuplexView.vue'

// Hash history: the part after # is never sent to the server, which matters
// because the TOTP tool keeps its settings (including the setup key) there.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { title: 'Keston Utilities' } },
    {
      path: '/totp-book',
      name: 'totp-book',
      component: TotpBookView,
      meta: { title: 'TOTP Code Book' }
    },
    {
      path: '/manual-duplex',
      name: 'manual-duplex',
      component: ManualDuplexView,
      meta: { title: 'Manual duplex printing' }
    },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ],
  scrollBehavior: () => ({ top: 0 })
})

router.afterEach((to) => {
  document.title = to.meta.title === 'Keston Utilities' ? 'Keston Utilities' : `${to.meta.title} · Keston Utilities`
})
