# -*- coding: utf-8 -*-
import re, sys, os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
                                Table, TableStyle, PageBreak, KeepTogether, CondPageBreak, Flowable)
from reportlab.platypus.tableofcontents import TableOfContents
from parser import parse, load_all, BOX_KINDS

FD = '/usr/share/fonts/truetype/liberation/'
pdfmetrics.registerFont(TTFont('Serif', FD+'LiberationSerif-Regular.ttf'))
pdfmetrics.registerFont(TTFont('Serif-B', FD+'LiberationSerif-Bold.ttf'))
pdfmetrics.registerFont(TTFont('Serif-I', FD+'LiberationSerif-Italic.ttf'))
pdfmetrics.registerFont(TTFont('Serif-BI', FD+'LiberationSerif-BoldItalic.ttf'))
pdfmetrics.registerFont(TTFont('Sans', FD+'LiberationSans-Regular.ttf'))
pdfmetrics.registerFont(TTFont('Sans-B', FD+'LiberationSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('Sans-I', FD+'LiberationSans-Italic.ttf'))
pdfmetrics.registerFont(TTFont('Sans-BI', FD+'LiberationSans-BoldItalic.ttf'))
from reportlab.pdfbase.pdfmetrics import registerFontFamily
registerFontFamily('Serif', normal='Serif', bold='Serif-B', italic='Serif-I', boldItalic='Serif-BI')
registerFontFamily('Sans', normal='Sans', bold='Sans-B', italic='Sans-I', boldItalic='Sans-BI')

INK   = colors.HexColor('#1a1a1a')
GREY  = colors.HexColor('#5a5a5a')
LINE  = colors.HexColor('#9a9a9a')
LITE  = colors.HexColor('#f0f0f0')
LITE2 = colors.HexColor('#e4e4e4')
DARK  = colors.HexColor('#333333')

PW, PH = A4
LM, RM, TM, BM = 22*mm, 18*mm, 24*mm, 22*mm

def esc(t):
    t = t.replace('->', '\u2192').replace('=>', '\u21d2')
    t = t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)
    t = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'<i>\1</i>', t)
    return t

S = {}
S['body'] = ParagraphStyle('body', fontName='Serif', fontSize=10.2, leading=14.6, alignment=TA_JUSTIFY,
                           textColor=INK, spaceAfter=4.5, allowWidows=0, allowOrphans=0, hyphenationLang='')
S['h1'] = ParagraphStyle('h1', fontName='Sans-B', fontSize=21, leading=25, textColor=INK,
                         spaceBefore=0, spaceAfter=2, keepWithNext=1)
S['h2'] = ParagraphStyle('h2', fontName='Sans-B', fontSize=15, leading=19, textColor=INK,
                         spaceBefore=2, spaceAfter=7, keepWithNext=1)
S['h3'] = ParagraphStyle('h3', fontName='Sans-B', fontSize=11.4, leading=15, textColor=DARK,
                         spaceBefore=9, spaceAfter=3.5, keepWithNext=1)
S['h4'] = ParagraphStyle('h4', fontName='Sans-BI', fontSize=10.2, leading=13.5, textColor=DARK,
                         spaceBefore=6, spaceAfter=2, keepWithNext=1)
S['li'] = ParagraphStyle('li', parent=S['body'], alignment=TA_LEFT, spaceAfter=2.2)
S['boxT'] = ParagraphStyle('boxT', fontName='Sans-B', fontSize=8.6, leading=11, textColor=INK, spaceAfter=3.5)
S['boxB'] = ParagraphStyle('boxB', parent=S['body'], fontSize=9.7, leading=13.6, spaceAfter=3)
S['boxLi'] = ParagraphStyle('boxLi', parent=S['boxB'], alignment=TA_LEFT, spaceAfter=1.8)
S['flowS'] = ParagraphStyle('flowS', fontName='Sans-B', fontSize=9.2, leading=12, alignment=TA_CENTER,
                            textColor=INK, spaceAfter=0)
S['flowA'] = ParagraphStyle('flowA', fontName='Sans', fontSize=10, leading=13, alignment=TA_CENTER,
                            textColor=GREY, spaceAfter=1, spaceBefore=1)
S['th'] = ParagraphStyle('th', fontName='Sans-B', fontSize=8.8, leading=11.5, textColor=INK)
S['td'] = ParagraphStyle('td', fontName='Serif', fontSize=8.9, leading=11.8, textColor=INK)
S['toc1'] = ParagraphStyle('toc1', fontName='Sans-B', fontSize=10.6, leading=16, spaceBefore=7, textColor=INK)
S['toc2'] = ParagraphStyle('toc2', fontName='Serif', fontSize=9.8, leading=13.4, leftIndent=10, textColor=INK)
S['toc3'] = ParagraphStyle('toc3', fontName='Serif', fontSize=9.2, leading=12.4, leftIndent=22, textColor=GREY)
S['cvT'] = ParagraphStyle('cvT', fontName='Sans-B', fontSize=32, leading=37, alignment=TA_CENTER, textColor=INK)
S['cvS'] = ParagraphStyle('cvS', fontName='Sans', fontSize=13.5, leading=19, alignment=TA_CENTER, textColor=DARK)
S['cvX'] = ParagraphStyle('cvX', fontName='Serif-I', fontSize=10.5, leading=15, alignment=TA_CENTER, textColor=GREY)

class Rule(Flowable):
    def __init__(self, w=None, th=0.7, col=LINE, sp=2):
        Flowable.__init__(self); self.w = w; self.th = th; self.col = col; self.sp = sp
    def wrap(self, aw, ah):
        self._w = self.w or aw
        return (self._w, self.th + self.sp*2)
    def draw(self):
        self.canv.setStrokeColor(self.col); self.canv.setLineWidth(self.th)
        self.canv.line(0, self.sp, self._w, self.sp)

class NoteLines(Flowable):
    """Righe per appunti personali."""
    def __init__(self, n=6, gap=8.2*mm, title=None):
        Flowable.__init__(self); self.n = n; self.gap = gap; self.title = title
    def wrap(self, aw, ah):
        self._w = aw
        self._h = self.n*self.gap + (12 if self.title else 0)
        return (self._w, self._h)
    def draw(self):
        c = self.canv; y = self._h
        if self.title:
            c.setFont('Sans-B', 8); c.setFillColor(GREY)
            c.drawString(0, y-8, self.title.upper()); y -= 12
        c.setStrokeColor(colors.HexColor('#c9c9c9')); c.setLineWidth(0.5)
        c.setDash(1, 0)
        for i in range(self.n):
            yy = y - (i+1)*self.gap + 2
            c.line(0, yy, self._w, yy)

class Bookmark(Flowable):
    def __init__(self, key, title, level):
        Flowable.__init__(self); self.key = key; self.title = title; self.level = level
    def wrap(self, aw, ah): return (0, 0)
    def draw(self):
        self.canv.bookmarkPage(self.key)
        self.canv.addOutlineEntry(self.title[:110], self.key, self.level, 0)

BOXCOL = {
    'flow': (colors.HexColor('#f4f4f4'), colors.HexColor('#666666')),
    'def':  (colors.HexColor('#eef1f5'), colors.HexColor('#2f3a46')),
    'err':  (colors.HexColor('#f5f0ee'), colors.HexColor('#5b3a30')),
    'rule': (colors.HexColor('#eef3ef'), colors.HexColor('#2f4a38')),
    'note': (colors.HexColor('#f4f2ec'), colors.HexColor('#5a5030')),
    'key':  (colors.HexColor('#eff0f2'), colors.HexColor('#3a3a44')),
    'warn': (colors.HexColor('#f2f2f2'), colors.HexColor('#444444')),
}

class Renderer:
    def __init__(self):
        self.pending_cols = None
        self.story = []
        self.bm = 0
        self.chapters = []

    def add(self, f):
        self.story.append(f)

    def last_is_break(self):
        for f in reversed(self.story):
            if isinstance(f, Bookmark):
                continue
            return isinstance(f, PageBreak)
        return True

    def render(self, toks, inbox=False):
        out = []
        target = out if inbox else None
        for t in toks:
            fs = self.flow(t, inbox)
            if inbox:
                out.extend(fs)
            else:
                for f in fs:
                    self.add(f)
        return out

    def flow(self, t, inbox=False):
        k = t[0]
        if k == 'p':
            st = S['boxB'] if inbox else S['body']
            return [Paragraph(esc(t[1]), st)]
        if k == 'h':
            return self.heading(t[1], t[2])
        if k == 'ul':
            st = S['boxLi'] if inbox else S['li']
            fs = []
            for sub, txt in t[1]:
                b = '–' if sub else '•'
                p = ParagraphStyle('x', parent=st, leftIndent=(21 if sub else 11), bulletIndent=(11 if sub else 1),
                                   bulletFontName='Serif', bulletFontSize=st.fontSize, spaceAfter=st.spaceAfter)
                fs.append(Paragraph(esc(txt), p, bulletText=b))
            return fs
        if k == 'ol':
            st = S['boxLi'] if inbox else S['li']
            fs = []
            for n, txt in t[1]:
                p = ParagraphStyle('x', parent=st, leftIndent=16, bulletIndent=1,
                                   bulletFontName='Serif', bulletFontSize=st.fontSize)
                fs.append(Paragraph(esc(txt), p, bulletText=n+'.'))
            return fs
        if k == 'cl':
            st = S['boxLi'] if inbox else S['li']
            fs = []
            for txt in t[1]:
                p = ParagraphStyle('cx', parent=st, leftIndent=16, bulletIndent=0,
                                   bulletFontName='Sans', bulletFontSize=st.fontSize+1.2,
                                   spaceAfter=st.spaceAfter+3.4)
                fs.append(Paragraph(esc(txt), p, bulletText='\u2610'))
            return fs
        if k == 'table':
            return self.table(t[1], inbox)
        if k == 'box':
            return self.box(t[1], t[2], t[3])
        if k == 'cmd':
            return self.cmd(t[1], t[2])
        return []

    def heading(self, lvl, txt):
        fs = []
        key = 'bm%d' % self.bm; self.bm += 1
        if lvl <= 2:
            if lvl == 1 and not self.last_is_break():
                fs.append(PageBreak())
            if lvl == 2 and not self.last_is_break():
                fs.append(Spacer(1, 6*mm))
                fs.append(CondPageBreak(42*mm))
            fs.append(Bookmark(key, re.sub(r'<[^>]+>', '', txt), lvl-1))
            if lvl == 1:
                fs.append(Spacer(1, 6*mm))
                fs.append(Paragraph(esc(txt), S['h1']))
                fs.append(Rule(th=1.4, col=INK, sp=4))
                fs.append(Spacer(1, 5*mm))
            else:
                fs.append(Paragraph(esc(txt), S['h2']))
                fs.append(Rule(th=0.7, col=LINE, sp=2))
                fs.append(Spacer(1, 3*mm))
            self.chapters.append((lvl, re.sub(r'<[^>]+>', '', txt)))
        elif lvl == 3:
            fs.append(Bookmark(key, re.sub(r'<[^>]+>', '', txt), 2))
            fs.append(Paragraph(esc(txt), S['h3']))
        else:
            fs.append(Paragraph(esc(txt), S['h4']))
        return fs

    def table(self, rows, inbox=False):
        if not rows:
            return []
        ncol = max(len(r) for r in rows)
        data = []
        for ri, r in enumerate(rows):
            r = r + [''] * (ncol - len(r))
            st = S['th'] if ri == 0 else S['td']
            data.append([Paragraph(esc(c), st) for c in r])
        avail = PW - LM - RM - (18 if inbox else 0)
        if self.pending_cols and len(self.pending_cols) == ncol:
            tot = sum(self.pending_cols)
            cw = [avail*x/tot for x in self.pending_cols]
            self.pending_cols = None
        else:
            cw = [avail/ncol]*ncol
        first = [len(x) for x in rows[0]]
        tot = sum(max(6, len(rows[min(1,len(rows)-1)][i]) if i < len(rows[min(1,len(rows)-1)]) else 6) for i in range(ncol))
        t = Table(data, colWidths=cw, repeatRows=1, hAlign='LEFT')
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), LITE2),
            ('LINEBELOW', (0,0), (-1,0), 0.8, GREY),
            ('GRID', (0,0), (-1,-1), 0.35, colors.HexColor('#bdbdbd')),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('LEFTPADDING', (0,0), (-1,-1), 5), ('RIGHTPADDING', (0,0), (-1,-1), 5),
            ('TOPPADDING', (0,0), (-1,-1), 4), ('BOTTOMPADDING', (0,0), (-1,-1), 4),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f7f7f7')]),
        ]))
        return [Spacer(1, 2*mm), t, Spacer(1, 3.5*mm)]

    def box(self, kind, title, body):
        if kind == 'flow':
            return self.flowbox(title, body)
        label, _ = BOX_KINDS[kind]
        bg, bar = BOXCOL[kind]
        head = label if not title else '%s · %s' % (label, title)
        inner = [Paragraph(esc(head), S['boxT'])]
        inner += self.render(body, inbox=True)
        t = Table([[inner]], colWidths=[PW-LM-RM-2], hAlign='LEFT')
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), bg),
            ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#a8a8a8')),
            ('LINEBEFORE', (0,0), (0,-1), 3.2, bar),
            ('LEFTPADDING', (0,0), (-1,-1), 9), ('RIGHTPADDING', (0,0), (-1,-1), 9),
            ('TOPPADDING', (0,0), (-1,-1), 7), ('BOTTOMPADDING', (0,0), (-1,-1), 7),
        ]))
        return [Spacer(1, 2.5*mm), t, Spacer(1, 4*mm)]

    def flowbox(self, title, body):
        inner = []
        if title:
            inner.append(Paragraph(esc(title), S['boxT']))
            inner.append(Spacer(1, 1.5*mm))
        steps = [t[1] for t in body if t[0] == 'p']
        for i, st in enumerate(steps):
            if '|' in st:
                a, b = st.split('|', 1)
                txt = esc(a.strip()) + '<br/><font size=7.8 color="#5a5a5a"><i>' + esc(b.strip()) + '</i></font>'
            else:
                txt = esc(st)
            inner.append(Paragraph(txt, S['flowS']))
            if i < len(steps)-1:
                inner.append(Paragraph('\u2193', S['flowA']))
        t = Table([[inner]], colWidths=[PW-LM-RM-2], hAlign='LEFT')
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f4f4f4')),
            ('BOX', (0,0), (-1,-1), 0.6, colors.HexColor('#8f8f8f')),
            ('LEFTPADDING', (0,0), (-1,-1), 10), ('RIGHTPADDING', (0,0), (-1,-1), 10),
            ('TOPPADDING', (0,0), (-1,-1), 9), ('BOTTOMPADDING', (0,0), (-1,-1), 9),
        ]))
        return [Spacer(1, 2.5*mm), t, Spacer(1, 4*mm)]

    def cmd(self, name, arg):
        if name == 'pagebreak':
            return [PageBreak()]
        if name == 'hr':
            return [Spacer(1, 2*mm), Rule(th=0.5, col=LINE), Spacer(1, 2*mm)]
        if name == 'space':
            return [Spacer(1, float(arg or 5)*mm)]
        if name == 'notes':
            n = int(arg or 6)
            return [Spacer(1, 3*mm), NoteLines(n, title='Appunti personali'), Spacer(1, 3*mm)]
        if name == 'cols':
            self.pending_cols = [float(x) for x in (arg or '').split(',') if x.strip()]
            return []
        if name == 'toc':
            toc = TableOfContents()
            toc.levelStyles = [S['toc1'], S['toc2'], S['toc3']]
            toc.dotsMinLevel = 0
            return [toc]
        if name == 'cover':
            return self.cover()
        return []

    def cover(self):
        f = []
        f.append(Spacer(1, 30*mm))
        f.append(Rule(th=2.2, col=INK, sp=3))
        f.append(Spacer(1, 9*mm))
        f.append(Paragraph('MANUALE DI STUDIO<br/>DEL FOREX', S['cvT']))
        f.append(Spacer(1, 7*mm))
        f.append(Paragraph('Dalle basi alla lettura del mercato', S['cvS']))
        f.append(Spacer(1, 4*mm))
        f.append(Rule(th=0.8, col=LINE, sp=3))
        f.append(Spacer(1, 6*mm))
        f.append(Paragraph('Guida didattica costruita sul percorso video<br/><b>«Da Base a Pro» (E1–E24) di Giuliano</b><br/>25 lezioni · novembre–dicembre 2024', S['cvS']))
        f.append(Spacer(1, 52*mm))
        f.append(Rule(th=0.8, col=LINE, sp=3))
        f.append(Spacer(1, 5*mm))
        f.append(Paragraph('Documento di studio a uso personale.<br/>Non è consulenza finanziaria né un invito a investire.<br/>Il trading comporta il rischio di perdere il capitale.', S['cvX']))
        f.append(PageBreak())
        return f

def build(srcdir, outfile):
    toks = load_all(srcdir)
    r = Renderer()
    r.render(toks)

    class Doc(BaseDocTemplate):
        def __init__(self, *a, **kw):
            BaseDocTemplate.__init__(self, *a, **kw)
            self.cur = {1: '', 2: ''}
        def afterFlowable(self, flowable):
            if isinstance(flowable, Paragraph):
                st = flowable.style.name
                txt = re.sub(r'<[^>]+>', '', flowable.getPlainText())
                if st == 'h1':
                    self.cur[1] = txt; self.cur[2] = ''
                    if txt.strip().upper() != 'INDICE':
                        self.notify('TOCEntry', (0, txt, self.page))
                elif st == 'h2':
                    self.cur[2] = txt
                    self.notify('TOCEntry', (1, txt, self.page))


    doc = Doc(outfile, pagesize=A4, leftMargin=LM, rightMargin=RM,
              topMargin=TM, bottomMargin=BM,
              title='Manuale di studio del Forex - Da Base a Pro',
              author='Guida di studio personale', subject='Forex / Price action / Smart Money')

    frame = Frame(LM, BM, PW-LM-RM, PH-TM-BM, id='n',
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)

    def deco(canv, d, plain=False):
        canv.saveState()
        pg = canv.getPageNumber()
        if pg > 1 and not plain:
            canv.setFont('Sans', 7.6); canv.setFillColor(GREY)
            canv.drawString(LM, PH-TM+7*mm, 'MANUALE DI STUDIO DEL FOREX · Da Base a Pro')
            right = (d.cur.get(2) or d.cur.get(1) or '')
            if len(right) > 58: right = right[:56] + '…'
            canv.drawRightString(PW-RM, PH-TM+7*mm, right)
            canv.setStrokeColor(LINE); canv.setLineWidth(0.5)
            canv.line(LM, PH-TM+5.6*mm, PW-RM, PH-TM+5.6*mm)
            canv.line(LM, BM-6.5*mm, PW-RM, BM-6.5*mm)
            canv.setFont('Sans', 7.6); canv.setFillColor(GREY)
            canv.drawString(LM, BM-11*mm, 'Uso personale · non è consulenza finanziaria')
            canv.setFont('Sans-B', 8.6); canv.setFillColor(INK)
            canv.drawCentredString(PW/2, BM-11*mm, '%d' % pg)
            canv.setFont('Sans', 7.6); canv.setFillColor(GREY)
            canv.drawRightString(PW-RM, BM-11*mm, 'E1–E24 · Giuliano')
        canv.restoreState()

    doc.addPageTemplates([PageTemplate(id='n', frames=[frame], onPageEnd=lambda c, d: deco(c, d))])
    doc.multiBuild(r.story)
    return outfile

if __name__ == '__main__':
    out = build(sys.argv[1], sys.argv[2])
    print('PDF:', out)
