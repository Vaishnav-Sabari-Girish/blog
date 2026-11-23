#!/usr/bin/env python3
"""Convert Zola <=0.22 shortcode calls {{ name(k="v", ...) }} to 0.23 component calls
{{ <name k="v" /> }} for image_row, img, video. Usage: convert_shortcodes.py content/*.md"""
import re, sys
NAMES = ("image_row", "img", "video")
CALL = re.compile(r'\{\{\s*(%s)\s*\((.*?)\)\s*\}\}' % "|".join(NAMES), re.S)
ARG = re.compile(r'\s*(\w+)\s*=\s*("(?:[^"\\]|\\.)*"|[^,\s)]+)\s*(?:,|$)', re.S)

def conv_args(raw):
    out, pos, raw = [], 0, raw.strip()
    while pos < len(raw):
        m = ARG.match(raw, pos)
        if not m:
            raise ValueError("cannot parse args: " + raw[pos:pos+60])
        k, v = m.group(1), m.group(2)
        pos = m.end()
        if v == '""':            # empty-string arg: component default covers it
            continue
        out.append('%s=%s' % (k, v if v.startswith('"') else '{%s}' % v))
    return " ".join(out)

def conv(text):
    # leave fenced code blocks alone
    parts = re.split(r'(^```.*?^```)', text, flags=re.S | re.M)
    for i in range(0, len(parts), 2):
        parts[i] = CALL.sub(lambda m: '{{ <%s %s /> }}' % (m.group(1), conv_args(m.group(2))), parts[i])
    return "".join(parts)

for path in sys.argv[1:]:
    s = open(path, encoding="utf-8").read()
    n = conv(s)
    if n != s:
        open(path, "w", encoding="utf-8").write(n)
        print("converted", path)
