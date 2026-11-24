# Keston Utilities

Small tools that run entirely in your browser. Vue 3, TypeScript and Vite, built with
[Keston UI](https://ui.keston.co) (`@thekestongroup/ui`), deployed to GitHub Pages.

**Every tool is fully client-side: no server, no API, no network requests to anywhere else. (The PDF editor's page-preview code, pdf.js, is a separate file from this site that is fetched when you open the editor.)**
Production builds carry a Content-Security-Policy with `connect-src 'none'` and only `'self'` for
scripts, styles, fonts and workers (see [`vite.config.ts`](vite.config.ts)), so the browser itself
blocks anything else. The one extra allowance is `blob:` frames, which the manual duplex tool uses to
print a PDF it has just made in your browser.

## Tools

| Tool | Path | |
|---|---|---|
| TOTP Tools | `#/totp/checker`, `#/totp/book` | Check a setup key against your authenticator app; print every code for a month (or up to a year) as a book |
| PDF editor | `#/pdf` | Merge, reorder, rotate and delete pages; make a booklet; print or save; print on both sides by hand with a step-by-step guide |
| Metadata stripper | `#/metadata` | Show and remove what photos (EXIF, GPS) and PDFs (author, tool, dates) give away |
| Password generator | `#/password` | Random passwords and passphrases (EFF word list), with the options in the address |
| Hash & checksum | `#/hash` | MD5, SHA-1/256/384/512 and CRC-32 of text or a file, and compare with a checksum you were given |
| QR code generator | `#/qr` | QR codes for text, links or Wi-Fi, as SVG, PNG or an exact-size PDF to print |

Older links (`#/totp-book`, `#/manual-duplex`) are redirected.

### What each tool keeps

- **The address** (after the `#`, which browsers never send to a server) holds a tool's options, so a link can be bookmarked or shared. The TOTP tools also keep the setup key there, on purpose; treat that link like the key. Passwords, files and Wi-Fi passwords are never put in the address.
- **Saved defaults (a cookie).** "Save these options as my defaults" stores a tool's *harmless* options in a cookie (`ku-<tool>`), and a new link with no options starts from them. Each tool lists exactly which options may be saved ([`lib/defaults.ts`](src/lib/defaults.ts) filters everything else out, and has tests): never a setup key, label, password or file. Cookies are sent to the server with page requests, which is why they hold nothing sensitive.
- **Kept PDFs (IndexedDB).** The PDF editor can, only if you turn on "Keep my PDFs on this device", store the files you add and your page order in this browser's IndexedDB (a cookie is far too small). Nothing is uploaded; turning the switch off deletes it ([`tools/pdf/store.ts`](src/tools/pdf/store.ts)).
- Nothing else is stored: no localStorage, sessionStorage or analytics.

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
2. Add a route in [`src/router.ts`](src/router.ts) and an entry in [`src/tools.ts`](src/tools.ts) (a single page, or a group of pages).
   It then appears in the sidebar and on the home page.
3. For options kept in the address and saved as defaults, use [`useUrlOptions`](src/lib/useUrlOptions.ts) and the `DefaultsBar` component, listing the options that are safe to save.

Routing uses the hash (`#/totp-book`) so GitHub Pages needs no redirect tricks and tool settings
never reach a server.

## Deploying

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs type checks and tests on every
push and pull request, and deploys to GitHub Pages on pushes to `main`. In the repository settings,
set **Pages → Source** to **GitHub Actions** once.

## Third-party material

- Passphrases use the [EFF large word list](https://www.eff.org/dice) (CC BY 3.0 US), in [`eff_large_wordlist.txt`](src/tools/password/eff_large_wordlist.txt).
- [`pdf-lib`](https://pdf-lib.js.org) (MIT) edits PDFs, [`pdfjs-dist`](https://mozilla.github.io/pdf.js/) (Apache-2.0) draws the page previews, and [`qrcode-generator`](https://github.com/kazuhikoarase/qrcode-generator) (MIT) makes QR codes. "QR Code" is a registered trademark of DENSO WAVE INCORPORATED.

## Missing from Keston UI

Built locally here; candidates for the library:

- **Dark mode tokens** ([`src/style.css`](src/style.css)): the theme only has light values.
- **Disclosure / accordion**: "Advanced" is a native `<details>`.
- **Opt-out of storage in `createKestonI18n`**: it saves the language in localStorage. This site
  uses `vue-i18n` with `uiMessages` directly because it must store nothing.
