# -*- coding: utf-8 -*-
"""Parser del formato sorgente del manuale (.mf) -> lista di token."""
import re, os, glob

BOX_KINDS = {
    'def':  ('DEFINIZIONE', 'def'),
    'err':  ('ERRORE DA EVITARE', 'err'),
    'rule': ('REGOLA OPERATIVA', 'rule'),
    'note': ('INTEGRAZIONE DIDATTICA', 'note'),
    'key':  ('DA RICORDARE', 'key'),
    'warn': ('ATTENZIONE', 'warn'),
    'flow': ('', 'flow'),
}

def parse(text):
    toks = []
    lines = text.split('\n')
    i = 0
    buf = []

    def flush():
        if buf:
            t = ' '.join(x.strip() for x in buf).strip()
            if t:
                toks.append(('p', t))
            buf.clear()

    while i < len(lines):
        ln = lines[i]
        s = ln.strip()
        if not s:
            flush(); i += 1; continue
        # direttive
        m = re.match(r'^\[\[(\w+)(?::([^\]]+))?\]\]$', s)
        if m:
            flush()
            toks.append(('cmd', m.group(1), m.group(2)))
            i += 1; continue
        # box
        m = re.match(r'^:::(\w+)\s*(.*)$', s)
        if m and m.group(1) in BOX_KINDS:
            flush()
            kind = m.group(1); title = m.group(2).strip()
            body = []
            i += 1
            while i < len(lines) and lines[i].strip() != ':::':
                body.append(lines[i])
                i += 1
            i += 1
            toks.append(('box', kind, title, parse('\n'.join(body))))
            continue
        # heading
        m = re.match(r'^(#{1,4})\s+(.*)$', s)
        if m:
            flush()
            toks.append(('h', len(m.group(1)), m.group(2).strip()))
            i += 1; continue
        # tabella
        if s.startswith('|') and s.endswith('|'):
            flush()
            rows = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                r = lines[i].strip().strip('|')
                cells = [c.strip() for c in r.split('|')]
                if not all(re.match(r'^:?-{2,}:?$', c) for c in cells if c):
                    rows.append(cells)
                i += 1
            toks.append(('table', rows))
            continue
        # checklist
        if s.startswith('[] '):
            flush()
            items = []
            while i < len(lines) and lines[i].strip().startswith('[] '):
                items.append(lines[i].strip()[3:].strip())
                i += 1
            toks.append(('cl', items))
            continue
        # bullet
        m = re.match(r'^([-*])\s+(.*)$', s)
        if m:
            flush()
            items = []
            lvl_marker = None
            while i < len(lines):
                mm = re.match(r'^(\s*)([-*])\s+(.*)$', lines[i])
                if not mm:
                    if lines[i].strip() and items and not re.match(r'^(#{1,4}|:::|\||\[\[)', lines[i].strip()):
                        items[-1] = (items[-1][0], items[-1][1] + ' ' + lines[i].strip())
                        i += 1; continue
                    break
                sub = 1 if mm.group(2) == '*' else 0
                items.append((sub, mm.group(3).strip()))
                i += 1
            toks.append(('ul', items))
            continue
        # numerata
        m = re.match(r'^(\d+)\.\s+(.*)$', s)
        if m:
            flush()
            items = []
            while i < len(lines):
                mm = re.match(r'^\s*(\d+)\.\s+(.*)$', lines[i])
                if not mm:
                    if lines[i].strip() and items and not re.match(r'^(#{1,4}|:::|\||\[\[|[-*]\s)', lines[i].strip()):
                        items[-1] = (items[-1][0], items[-1][1] + ' ' + lines[i].strip())
                        i += 1; continue
                    break
                items.append((mm.group(1), mm.group(2).strip()))
                i += 1
            toks.append(('ol', items))
            continue
        buf.append(s)
        i += 1
    flush()
    return toks

def load_all(srcdir):
    text = []
    for f in sorted(glob.glob(os.path.join(srcdir, '*.mf'))):
        text.append(open(f, encoding='utf-8').read())
    return parse('\n\n'.join(text))
