"""Static sanity check for the Dessert House static site.

Verifies, for every page:
  * the HTML comment structure is valid (no markup trapped inside a comment)
  * every non-void tag is closed, in the right order
  * js/main.js is loaded by a live (non-commented) <script> tag
  * the removed bottom navigation ("tabbar") is gone everywhere
  * the social-preview tags are complete, absolute and match the real image
"""
from html.parser import HTMLParser
import glob
import os
import sys

# The public address of the site. Every og:/twitter: URL has to sit under it,
# because a relative or protocol-less image URL is silently dropped by every
# link-preview crawler -- which is the whole bug this check exists to prevent.
SITE_ORIGIN = 'https://preetimarandi.github.io/desserthouse'

REQUIRED_OG = [
    'og:type', 'og:site_name', 'og:locale', 'og:url', 'og:title',
    'og:description', 'og:image', 'og:image:type', 'og:image:width',
    'og:image:height', 'og:image:alt',
]
REQUIRED_TWITTER = [
    'twitter:card', 'twitter:title', 'twitter:description',
    'twitter:image', 'twitter:image:alt',
]

VOID = {
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
    'meta', 'param', 'source', 'track', 'wbr', 'use', 'path', 'circle',
    'rect', 'polygon', 'line', 'polyline', 'ellipse',
}

# Markers that should never survive inside an HTML comment.
TRAPPED = ('<script', '<button', '<nav', '<div', '<aside', '<ul', '<li', '<form')


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.stack = []
        self.errors = []
        self.comments = []
        self.scripts = []
        self.metas = []
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == 'script':
            self.scripts.append(dict(attrs).get('src'))
        if tag == 'meta':
            self.metas.append(dict(attrs))
        if tag == 'link':
            self.links.append(dict(attrs))
        if tag not in VOID:
            self.stack.append((tag, self.getpos()))

    def handle_startendtag(self, tag, attrs):
        pass

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack:
            self.errors.append('stray </%s> at line %d' % (tag, self.getpos()[0]))
            return
        opened, pos = self.stack.pop()
        if opened != tag:
            self.errors.append(
                'mismatch: </%s> at line %d closes <%s> opened at line %d'
                % (tag, self.getpos()[0], opened, pos[0])
            )

    def handle_comment(self, data):
        self.comments.append((self.getpos()[0], data[:80]))


def jpeg_size(path):
    """(width, height) of a JPEG, or None if it isn't one.

    Reads the SOF frame header by hand so the checker keeps its promise of
    needing nothing but the standard library.
    """
    with open(path, 'rb') as fh:
        data = fh.read()
    if data[:2] != b'\xff\xd8':
        return None
    i = 2
    sof = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
           0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
    while i < len(data) - 9:
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker == 0xD8 or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        seg_len = int.from_bytes(data[i + 2:i + 4], 'big')
        if marker in sof:
            height = int.from_bytes(data[i + 5:i + 7], 'big')
            width = int.from_bytes(data[i + 7:i + 9], 'big')
            return width, height
        i += 2 + seg_len
    return None


def social_problems(page, tags, canonical):
    """Everything that would stop a link preview rendering correctly."""
    problems = []

    missing = [k for k in REQUIRED_OG if k not in tags]
    if missing:
        problems.append('missing Open Graph tags: %s' % ', '.join(missing))

    missing = [k for k in REQUIRED_TWITTER if k not in tags]
    if missing:
        problems.append('missing Twitter Card tags: %s' % ', '.join(missing))

    if not canonical:
        problems.append('no <link rel="canonical">')
    elif not canonical.startswith(SITE_ORIGIN):
        problems.append('canonical URL is not on %s: %s' % (SITE_ORIGIN, canonical))

    # A relative or protocol-less image URL is dropped without a word.
    for key in ('og:url', 'og:image', 'twitter:image'):
        val = tags.get(key)
        if val and not val.startswith('https://'):
            problems.append('%s must be an absolute https:// URL, got %r' % (key, val))

    if tags.get('og:url') and canonical and tags['og:url'] != canonical:
        problems.append('og:url (%s) does not match canonical (%s)' % (tags['og:url'], canonical))

    if tags.get('og:image') and tags.get('og:image') != tags.get('twitter:image'):
        problems.append('og:image and twitter:image point at different files')

    if tags.get('twitter:card') != 'summary_large_image':
        problems.append('twitter:card should be summary_large_image, got %r' % tags.get('twitter:card'))

    # The image has to exist, and the size we advertise has to be the real one.
    image = tags.get('og:image', '')
    if image.startswith(SITE_ORIGIN + '/'):
        local = image[len(SITE_ORIGIN) + 1:]
        if not os.path.exists(local):
            problems.append('og:image points at a missing file: %s' % local)
        else:
            real = jpeg_size(local)
            declared = (tags.get('og:image:width'), tags.get('og:image:height'))
            if real and declared != (str(real[0]), str(real[1])):
                problems.append('og:image:width/height says %sx%s but %s is really %dx%d'
                                % (declared[0], declared[1], local, real[0], real[1]))

    # Generous limits -- these only trip on copy that has genuinely run away
    # and would be hard-truncated mid-sentence.
    if len(tags.get('og:title', '')) > 110:
        problems.append('og:title is %d characters, it will be truncated'
                        % len(tags['og:title']))
    if len(tags.get('og:description', '')) > 300:
        problems.append('og:description is %d characters, it will be truncated'
                        % len(tags['og:description']))

    return problems


def main():
    # tools/ -> project root
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)
    pages = sorted(glob.glob('*.html'))
    if not pages:
        print('no HTML pages found')
        return 1

    failures = 0
    for page in pages:
        src = open(page, encoding='utf-8').read()
        p = PageParser()
        p.feed(src)
        p.close()

        unclosed = [t for t, _ in p.stack]
        trapped = [c for c in p.comments if any(k in c[1] for k in TRAPPED)]
        live_script = 'js/main.js' in [s for s in p.scripts if s]
        has_tabbar = 'tabbar' in src

        # Flatten the head's <meta> tags, accepting either the og: ("property")
        # or twitter: ("name") spelling, into one lookup.
        tags = {}
        for meta in p.metas:
            key = meta.get('property') or meta.get('name')
            if key:
                tags[key] = meta.get('content', '')
        canonical = next(
            (l.get('href') for l in p.links if l.get('rel') == 'canonical'), None)

        problems = []
        if trapped:
            problems.append('markup trapped inside comments: %s' % [c[0] for c in trapped])
        if unclosed:
            problems.append('unclosed tags: %s' % unclosed)
        if p.errors:
            problems.append('nesting errors: %s' % p.errors)
        if not live_script:
            problems.append('js/main.js is NOT loaded by a live <script> tag')
        if has_tabbar:
            problems.append('bottom navigation ("tabbar") still present')
        problems.extend(social_problems(page, tags, canonical))

        status = 'OK  ' if not problems else 'FAIL'
        print('%s %-14s comments=%d scripts=%s' % (status, page, len(p.comments), p.scripts))
        for prob in problems:
            print('       - %s' % prob)
        if problems:
            failures += 1

    print('')
    print('%d page(s) checked, %d with problems.' % (len(pages), failures))
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
