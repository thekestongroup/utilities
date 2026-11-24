# Keston Utilities

Small tools that run entirely in your browser. Vue 3, TypeScript and Vite, built with
[Keston UI](https://ui.keston.co) (`@thekestongroup/ui`), deployed to GitHub Pages.

**Every tool is fully client-side: no server, no API, no network requests after the page loads.**
Production builds carry a Content-Security-Policy with `connect-src 'none'` and only `'self'` for
scripts, styles, fonts and workers (see [`vite.config.ts`](vite.config.ts)), so the browser itself
blocks anything else. The one extra allowance is `blob:` frames, which the manual duplex tool uses to
print a PDF it has just made in your browser.

## Tools

| Tool | Path | |
|---|---|---|
| TOTP Code Book | `#/totp-book` | Print every 2FA code for a month (or six) as a book |
| Manual duplex printing | `#/manual-duplex` | Split a PDF into fronts and backs, then print each one and follow a step-by-step guide to turning the paper round (PDF handling: [`lib/split.ts`](src/tools/manual-duplex/lib/split.ts), all in the browser with `pdf-lib`) |

### TOTP Code Book: where the key goes

The setup key never leaves your browser. All of it happens in code you can read:

- [`lib/base32.ts`](src/tools/totp-book/lib/base32.ts) decodes the key.
- [`lib/totp.ts`](src/tools/totp-book/lib/totp.ts) imports it once as a non-extractable Web Crypto
  `CryptoKey` and computes RFC 6238 codes (HMAC via `crypto.subtle`). No OTP library.
- [`generate.worker.ts`](src/tools/totp-book/generate.worker.ts) does the work off the main thread
  and wipes the key bytes as soon as the `CryptoKey` exists.
- [`TotpBookView.vue`](src/tools/totp-book/TotpBookView.vue) is the form. The key is cleared from
  memory by the Clear button and on `pagehide`.
- Nothing is stored: no localStorage, sessionStorage, IndexedDB or cookies.

**The key is in the URL, on purpose.** To make a link per account that you can bookmark, the form's
settings (including `key`) live in the part of the address after `#`. Browsers never send that part
to a server, but it does sit in your history and bookmarks, so treat the link like the key itself.
"Clear key and codes" removes the key from the address bar too.

## Development

```sh
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # RFC 6238 vectors, base32, otpauth://, time zones, DST, URL state
pnpm typecheck
pnpm build      # BASE_PATH=/<repo>/ for GitHub Pages
```

### Adding a tool

1. Put it in `src/tools/<id>/`.
2. Add a route in [`src/router.ts`](src/router.ts) and an entry in [`src/tools.ts`](src/tools.ts).
   It then appears in the sidebar and on the home page.

Routing uses the hash (`#/totp-book`) so GitHub Pages needs no redirect tricks and tool settings
never reach a server.

## Deploying

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs type checks and tests on every
push and pull request, and deploys to GitHub Pages on pushes to `main`. In the repository settings,
set **Pages → Source** to **GitHub Actions** once.

## Missing from Keston UI

Built locally here; candidates for the library:

- **Dark mode tokens** ([`src/style.css`](src/style.css)): the theme only has light values.
- **Disclosure / accordion**: "Advanced" is a native `<details>`.
- **Opt-out of storage in `createKestonI18n`**: it saves the language in localStorage. This site
  uses `vue-i18n` with `uiMessages` directly because it must store nothing.
