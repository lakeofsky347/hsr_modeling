#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Inject the per-character mechanics digests into the generated data sheets.

The data sheet (reports/<id>_<slug>.md) is produced by scripts/nanoka_extract.py and
carries a <!-- MECHANICS_PLACEHOLDER --> marker in section 八. This script replaces the
marker with the (heading-demoted) digest text so that each report is self-contained.
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REP = os.path.join(ROOT, 'reports')
DIG = os.path.join(ROOT, 'reports', 'mechanics')
MARK = '<!-- MECHANICS_PLACEHOLDER -->'

PAIRS = [('1506_silver_wolf_lv999.md', '银狼LV999.md'),
         ('1501_sparxie.md', '火花.md'),
         ('1503_pearl.md', '真珠.md'),
         ('1511_aeon_aha.md', '星神阿哈.md')]

for report, digest in PAIRS:
    rp = os.path.join(REP, report)
    dp = os.path.join(DIG, digest)
    if not (os.path.exists(rp) and os.path.exists(dp)):
        print('skip', report, '(missing report or digest)')
        continue
    body = open(rp, encoding='utf-8').read()
    if MARK not in body:
        print('skip', report, '(already assembled)')
        continue
    dig = open(dp, encoding='utf-8').read().splitlines()
    out = []
    n = 0
    for line in dig:
        if line.startswith('# '):
            continue
        if line.startswith('## '):
            n += 1
            title = line[3:].strip()
            for sep in ('、', '. ', ' '):
                head, found, tail = title.partition(sep)
                if found and len(head) <= 2:
                    title = tail.strip()
                    break
            out.append('### 8.%d %s' % (n, title))
        elif line.startswith('### '):
            out.append('#### ' + line[4:])
        else:
            out.append(line)
    text = '\n'.join(out).strip()
    body = body.replace(MARK, text)
    with open(rp, 'w', encoding='utf-8') as f:
        f.write(body)
    print('assembled', report, '<-', digest, '(%d chars)' % len(text))
