import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

/**
 * Content-Security-Policy for production builds. Nothing may leave the page
 * (connect-src 'none') and everything loads from our own origin. It is
 * only added to builds: the dev server needs inline styles and a websocket.
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "worker-src 'self'",
  // The manual duplex tool prints a PDF it has just made, from a blob: URL in a hidden frame.
  "frame-src blob:",
  "object-src blob:",
  "img-src 'self'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

function csp(): Plugin {
  return {
    name: 'keston-utilities:csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }
    ]
  }
}

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves a project site from /<repo>/. The deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  plugins: [vue(), tailwindcss(), csp()],
  worker: { format: 'es' },
  build: {
    // Never inline assets as data: URIs: the CSP only allows our own origin.
    assetsInlineLimit: 0,
    target: 'es2022'
  },

})
