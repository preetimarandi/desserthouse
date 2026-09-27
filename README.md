# Dessert House 🧁

Official website source code for **Dessert House** — a retro **cloud bakery kitchen** run by
**Preeti Marandi**. Custom cakes, cookies, cinnamon rolls, Korean cream cheese garlic buns,
small-batch ice-cream and baked cheesecakes, all baked to order and ordered over
WhatsApp or Instagram.

Built with plain **HTML, CSS and JavaScript** — no framework, no build step, no dependencies.

## Pages

| File | Page | Contents |
| --- | --- | --- |
| `index.html` | Home | Hero, menu (8 treats with filters), how ordering works, photo gallery, cloud-kitchen benefits, FAQ, call to action |
| `about.html` | About | Preeti's story, what the kitchen stands for, the journey, kitchen standards, FAQ |
| `contact.html` | Contact | WhatsApp / Instagram / email / phone cards, an order builder that composes a WhatsApp message, ordering info, FAQ |
| `terms.html` | Terms & Conditions | 13 plain-language sections: orders, custom cakes, pricing, cancellations, pickup/delivery, allergens, storage, liability |
| `privacy.html` | Privacy Policy | 13 sections: what information is collected, local storage, sharing, retention, security, your choices |

Every page shares the same header, footer and inline SVG icon sprite. Navigation lives in
two places: the **top nav** on desktop (Home · About · Contact) and a drop-down
**mobile menu** behind the header button (Home · About · Contact · Terms & Conditions ·
Privacy Policy). There is no fixed bottom navigation bar.

## Structure

```
index.html about.html contact.html terms.html privacy.html
css/
  style.css        # the whole design system (retro theme, one file)
js/
  main.js          # all behaviour + the contact-details config
asset/             # bakery photographs (.webp with a .jpg fallback)
  og/              # 1200x630 social-preview images (see "Link previews" below)
fonts/             # bundled webfonts (Bungee, Alfa Slab One, Nunito, Space Mono)
tools/
  check_site.py     # static markup + link-preview sanity check (no dependencies)
  browser_test.js   # live headless-Chrome test of the main.js behaviours
  og-template.html  # the social-preview card, as an HTML page
  make_og_images.js # renders og-template.html to asset/og/*.jpg
```

The old Bootstrap CSS was removed in this redesign — the theme is hand-written CSS.

## Checking the site

Two small test scripts live in `tools/`.

`check_site.py` parses every HTML file and fails on unbalanced tags, markup
accidentally trapped inside a comment, a missing script tag, leftover
bottom-navigation markup, or a broken set of link-preview tags (see
"Link previews" below). It needs nothing but Python 3.

```bash
python3 tools/check_site.py
```

`browser_test.js` drives headless Chrome over the DevTools Protocol and checks
the things `main.js` is responsible for — that the contact details are hydrated,
that the mobile menu opens and closes, that every menu filter chip shows exactly
its own cards, that the order bag stores items and builds a WhatsApp message, and
that no bottom navigation is in the DOM. It needs Node 18+ and a Chrome/Chromium
install, plus a static server running on port 8731.

```bash
python3 -m http.server 8731 &
node tools/browser_test.js
```

> The markup-trapped-in-a-comment check exists because that exact bug used to
> stop `js/main.js` from loading on four of the five pages, which silently killed
> the contact form, the order bag and the mobile menu.

## Link previews (Facebook, X, WhatsApp, LinkedIn, iMessage)

When someone pastes a `https://preetimarandi.github.io/desserthouse/` link into a
post, a story or a chat, the platform fetches the HTML and reads a block of
`<meta>` tags out of the `<head>` to build the rich card. Each page carries:

| Tag | Why it is there |
| --- | --- |
| `<link rel="canonical">` | the page's one true address |
| `og:url`, `og:title`, `og:description` | what gets printed on the card |
| `og:image` + `:type` `:width` `:height` `:alt` | the picture, and its size so the platform can lay the card out before the image loads |
| `og:site_name`, `og:locale`, `og:type` | the byline above the title |
| `twitter:card` = `summary_large_image` | tells X to use the big layout |

Two rules are worth knowing, because both fail *silently*:

1. **`og:image` and `og:url` must be absolute `https://` URLs.** A relative path
   like `asset/og/og-home.jpg` is simply ignored — the card renders as a bare
   blue link. Every URL in the `<head>` is therefore spelled out in full.
2. **The image has to be reachable without JavaScript** and reasonably small.
   The files in `asset/og/` are 1200x630 JPEGs, 85–175 KB each.

There are four images for five pages, because Terms and Privacy share one:

| File | Used by |
| --- | --- |
| `asset/og/og-home.jpg` | `index.html` |
| `asset/og/og-about.jpg` | `about.html` |
| `asset/og/og-contact.jpg` | `contact.html` |
| `asset/og/og-legal.jpg` | `terms.html`, `privacy.html` |

### Changing a preview image

The images are generated, not hand-drawn. `tools/og-template.html` is a normal
HTML page holding the card layout — it links the site's real webfonts and
reuses the `css/style.css` palette, so the card is typeset in Bungee and Space
Mono exactly like the site. `tools/make_og_images.js` renders it in headless
Chrome and screenshots it to JPEG:

```bash
node tools/make_og_images.js   # needs Node 18+ and a Chrome/Chromium install
```

It starts its own static server, so there is no Python step. To restyle a card,
edit the CSS or the `VARIANTS` block in `og-template.html` and re-run. The
generated JPEGs are committed, so a visitor never needs this script — it is only
for when the wording or the artwork changes.

> ⚠️ **Moving the site:** the absolute URLs and `SITE_ORIGIN` in
> `tools/check_site.py` both hard-code `preetimarandi.github.io`. If the site
> ever moves to a real domain, search-and-replace that string across the five
> HTML files and the checker, then re-run `python3 tools/check_site.py`.

> ⚠️ **Previews are cached hard.** Facebook, X and LinkedIn each cache by URL
> for days, so a corrected image will not show up on links people have already
> posted. Re-scrape with the
> [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
> or the [Card validator](https://cards-dev.twitter.com/validator), or append a
> `?v=2` query to the page URL to bust the cache while testing.

## Changing the contact details

Everything (WhatsApp links, order messages, email links, phone links, Instagram handle,
footer values) is generated from **one config block** at the top of `js/main.js`:

```js
const CONFIG = {
    whatsappNumber: '918292083443',    // digits only, including the country code
    phoneDisplay:   '+91 82920 83443', // how the number is written on the page
    instagramHandle: 'desserthouse_us',
    email:          'preetimarandi222@gmail.com',
    baker:          'Preeti Marandi',
    shopName:       'Dessert House'
};
```

> ⚠️ **Country code:** `whatsappNumber` is digits only — no `+`, spaces or dashes — because
> it is pasted straight into `wa.me` and `tel:` links. If the bakery is ever on a different
> country code, change `whatsappNumber` **and** `phoneDisplay` together (for example
> `'18292083443'` and `'+1 829 208 3443'` for the US). Every link and every order message on
> the site updates automatically.

## Running it locally

Any static server works; opening the files directly also works.

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Design notes

- **Retro kitchen theme:** cream paper with halftone dots, chocolate-brown text, mustard,
  tomato and teal accents, thick offset borders and hard drop shadows.
- **Type:** the four bundled webfonts — `Bungee` (display), `Alfa Slab One` (headings),
  `Nunito` (body) and `Space Mono` (labels, buttons and meta). All are SIL Open Font
  License 1.1 and self-hosted, so the site makes no third-party requests.
- **Icons:** a small inline SVG sprite (`<symbol>` + `<use href="#i-…">`), so there are no
  icon-font or SVG-file requests. The sprite block is intentionally identical on every
  page, which means a few symbols go unused on some pages — that is the trade for being
  able to copy the whole block between pages without editing it.
- **JavaScript features:** the "Order bag" (saved in `localStorage`) turns a list of treats into a
  pre-written WhatsApp message, and the contact form does the same for a single order. Plus menu
  filtering, the mobile menu, active-page highlighting, scroll reveals and copy-to-clipboard buttons.
- **Accessibility & manners:** skip link, visible focus outlines, ARIA states on navigation, support
  for `prefers-reduced-motion`, a print stylesheet for the legal pages, and no tracking scripts.

*The Terms and Privacy text is written in plain language for this bakery and is not legal advice —
have it reviewed if you need formally binding wording.*

