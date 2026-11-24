import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import { uiMessages } from '@thekestongroup/ui'
import App from './App.vue'
import { router } from './router'
import './style.css'

// Keston UI's own words. (createKestonI18n would remember the language in
// localStorage; this site stores nothing, so it uses vue-i18n directly.)
const i18n = createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages: uiMessages })

createApp(App).use(router).use(i18n).mount('#app')
