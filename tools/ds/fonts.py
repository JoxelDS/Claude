#!/usr/bin/env python3
"""Self-hosted font kit for DS websites: python3 tools/ds/fonts.py
Downloads OFL families from the google/fonts GitHub repo (raw.githubusercontent.com — Google Fonts itself is blocked from
the build container), subsets each to Latin + Latin-1 + Latin Extended-A (English, Spanish, Haitian Creole, French) and
writes public/p/_fonts/<slug>.woff2 plus public/p/_fonts/fonts.json (family, file, style, weight range, category, role).
Sites link /Claude/p/_fonts/<slug>.woff2 with @font-face — no third-party font requests, fast first paint, works offline.
Needs: pip install fonttools brotli."""
import json, os, re, sys, urllib.parse, urllib.request
from io import BytesIO
from fontTools.ttLib import TTFont
from fontTools import subset

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'public', 'p', '_fonts')
RAW = 'https://raw.githubusercontent.com/google/fonts/main/ofl/'
# (directory in google/fonts/ofl, role, category) — display faces with character + quiet, legible body faces.
FAMILIES = [
    ('bricolagegrotesque', 'display', 'grotesque'), ('instrumentserif', 'display', 'serif'), ('instrumentsans', 'body', 'sans'),
    ('dmserifdisplay', 'display', 'serif'), ('dmsans', 'body', 'sans'), ('fraunces', 'display', 'serif'),
    ('playfairdisplay', 'display', 'serif'), ('bodonimoda', 'display', 'serif'), ('cormorantgaramond', 'display', 'serif'),
    ('youngserif', 'display', 'serif'), ('gloock', 'display', 'serif'), ('librecaslondisplay', 'display', 'serif'),
    ('anton', 'display', 'condensed'), ('bebasneue', 'display', 'condensed'), ('oswald', 'display', 'condensed'),
    ('bigshouldersdisplay', 'display', 'condensed'), ('archivo', 'both', 'grotesque'), ('archivoblack', 'display', 'grotesque'),
    ('unbounded', 'display', 'geometric'), ('syne', 'display', 'geometric'), ('shrikhand', 'display', 'script'),
    ('pacifico', 'display', 'script'), ('caveat', 'accent', 'script'), ('permanentmarker', 'accent', 'script'),
    ('bungee', 'display', 'signage'), ('cinzel', 'display', 'serif'), ('italiana', 'display', 'serif'), ('marcellus', 'display', 'serif'),
    ('figtree', 'body', 'sans'), ('plusjakartasans', 'body', 'sans'), ('hankengrotesk', 'body', 'sans'), ('outfit', 'body', 'geometric'),
    ('worksans', 'body', 'sans'), ('karla', 'body', 'sans'), ('manrope', 'body', 'sans'), ('onest', 'body', 'sans'),
    ('geist', 'body', 'sans'), ('geistmono', 'accent', 'mono'), ('inter', 'body', 'sans'), ('sora', 'both', 'geometric'),
    ('montserrat', 'both', 'geometric'), ('nunito', 'body', 'rounded'), ('tenorsans', 'display', 'sans'), ('courierprime', 'accent', 'mono'),
]
# Latin + Latin-1 Supplement + Latin Extended-A + punctuation, currency, arrows, a few symbols used on the sites.
UNICODES = list(range(0x20, 0x7F)) + list(range(0xA0, 0x180)) + [0x131, 0x152, 0x153, 0x2C6, 0x2DA, 0x2DC] \
    + list(range(0x2010, 0x2028)) + list(range(0x2030, 0x203B)) + [0x2044, 0x20AC, 0x2122, 0x2190, 0x2191, 0x2192, 0x2193, 0x2197, 0x2212, 0x2605, 0x2713]


def fetch(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


def files_of(d):
    meta = fetch(RAW + d + '/METADATA.pb').decode('utf8', 'replace')
    name = re.search(r'^name:\s*"([^"]+)"', meta, re.M).group(1)
    fonts = re.findall(r'fonts\s*\{(.*?)\n\}', meta, re.S)
    out = []
    for f in fonts:
        fn = re.search(r'filename:\s*"([^"]+)"', f).group(1)
        style = re.search(r'style:\s*"([^"]+)"', f).group(1)
        weight = int(re.search(r'weight:\s*(\d+)', f).group(1))
        out.append((fn, style, weight))
    axes = {a: (float(lo), float(hi)) for a, lo, hi in re.findall(r'axes\s*\{\s*tag:\s*"(\w+)"\s*min_value:\s*([\d.]+)\s*max_value:\s*([\d.]+)', meta)}
    return name, out, axes


def main():
    os.makedirs(OUT, exist_ok=True)
    only = set(sys.argv[1:])
    catalog, total = [], 0
    for d, role, cat in FAMILIES:
        if only and d not in only:
            continue
        try:
            name, files, axes = files_of(d)
        except Exception as e:
            print('SKIP', d, e)
            continue
        variable = any('[' in fn for fn, _, _ in files)
        seen = set()
        for fn, style, weight in files:
            if variable and '[' not in fn:
                continue
            key = (style, weight if not variable else 0)
            if key in seen:
                continue
            seen.add(key)
            try:
                data = fetch(RAW + d + '/' + urllib.parse.quote(fn))
            except Exception as e:
                print('FAIL', fn, e)
                continue
            font = TTFont(BytesIO(data))
            opts = subset.Options()
            opts.flavor = 'woff2'
            opts.layout_features = ['*']
            opts.name_IDs = ['*']
            opts.notdef_outline = True
            sub = subset.Subsetter(opts)
            sub.populate(unicodes=UNICODES)
            sub.subset(font)
            slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-') + ('-italic' if style == 'italic' else '') + ('' if variable else f'-{weight}')
            path = os.path.join(OUT, slug + '.woff2')
            font.flavor = 'woff2'
            font.save(path)
            size = os.path.getsize(path)
            total += size
            wr = [int(axes['wght'][0]), int(axes['wght'][1])] if variable and 'wght' in axes else [weight, weight]
            catalog.append({'family': name, 'file': slug + '.woff2', 'style': style, 'weight': wr, 'variable': variable,
                            'axes': {k: v for k, v in axes.items()} if variable else {}, 'role': role, 'category': cat, 'bytes': size})
            print(f'{slug:42s} {size // 1024:4d} KB  {style} {wr}')
    if not only:
        json.dump(catalog, open(os.path.join(OUT, 'fonts.json'), 'w'), indent=1)
    print('total', total // 1024, 'KB in', len(catalog), 'files')


if __name__ == '__main__':
    main()
