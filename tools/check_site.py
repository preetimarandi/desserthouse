"""Static sanity check for the Dessert House static site.

Verifies, for every page:
  * the HTML comment structure is valid (no markup trapped inside a comment)
  * every non-void tag is closed, in the right order
  * js/main.js is loaded by a live (non-commented) <script> tag
  * the removed bottom navigation ("tabbar") is gone everywhere
"""
from html.parser import HTMLParser
import glob
import os
import sys

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

    def handle_starttag(self, tag, attrs):
        if tag == 'script':
            self.scripts.append(dict(attrs).get('src'))
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
