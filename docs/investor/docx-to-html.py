"""Converts a docx built by build-*.js into clean HTML for upload to Drive as a
Google Doc (Drive converts text/html to a native document). Keeps the JS as the
single source of the words.

    python3 docs/investor/docx-to-html.py in.docx out.html
"""
import sys, zipfile, html
import xml.etree.ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
src, out = sys.argv[1], sys.argv[2]
z = zipfile.ZipFile(src)
doc = ET.fromstring(z.read("word/document.xml"))
body = doc.find(W + "body")

STYLE = """
body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1F2A37;line-height:1.35}
h1{font-size:15pt;color:#0C2A47;margin:18pt 0 6pt}
h2{font-size:12pt;color:#0C2A47;margin:12pt 0 4pt}
p{margin:0 0 6pt}
table{border-collapse:collapse;width:100%;margin:6pt 0 10pt;font-size:9.5pt}
th{background:#0C2A47;color:#fff;text-align:left;padding:4pt 6pt;border:1px solid #D9D6CD}
td{padding:4pt 6pt;border:1px solid #D9D6CD;vertical-align:top}
.callout{background:#F3F1EA;border-left:6px solid #C69E3C;padding:8pt 10pt;margin:8pt 0}
.eyebrow{color:#C69E3C;font-weight:bold;letter-spacing:2pt;font-size:9pt}
.title{font-size:20pt;font-weight:bold;color:#0C2A47}
.sub{font-size:13pt;color:#5B6470}
.fine{font-size:9.5pt;color:#5B6470;font-style:italic}
"""

def runs_html(p):
    parts = []
    for r in p.iter(W + "r"):
        rpr = r.find(W + "rPr")
        def on(tag):
            e = rpr.find(W + tag) if rpr is not None else None
            return e is not None and e.get(W + "val") not in ("0", "false")
        bold, ital = on("b"), on("i")
        sz = rpr.find(W + "sz") if rpr is not None else None
        color = rpr.find(W + "color") if rpr is not None else None
        text = "".join(t.text or "" for t in r.iter(W + "t"))
        if not text:
            continue
        t = html.escape(text)
        if bold: t = f"<b>{t}</b>"
        if ital: t = f"<i>{t}</i>"
        size = int(sz.get(W + "val")) if sz is not None else 22
        col = color.get(W + "val") if color is not None else None
        if size >= 40: t = f'<span class="title">{t}</span>'
        elif size == 26 and col == "5B6470": t = f'<span class="sub">{t}</span>'
        elif col == "C69E3C" and bold: t = f'<span class="eyebrow">{t}</span>'
        elif size == 19 and ital: t = f'<span class="fine">{t}</span>'
        parts.append(t)
    return "".join(parts)

def para_info(p):
    ppr = p.find(W + "pPr")
    style = num = None
    if ppr is not None:
        ps = ppr.find(W + "pStyle")
        if ps is not None: style = ps.get(W + "val")
        npr = ppr.find(W + "numPr")
        if npr is not None:
            num = npr.find(W + "numId").get(W + "val")
    return style, num

# numbering: which numId is the bullet list
numbering = ET.fromstring(z.read("word/numbering.xml"))
bullet_ids = set()
abstract_is_bullet = {}
for a in numbering.iter(W + "abstractNum"):
    lvl = a.find(W + "lvl")
    fmt = lvl.find(W + "numFmt").get(W + "val") if lvl is not None else ""
    abstract_is_bullet[a.get(W + "abstractNumId")] = (fmt == "bullet")
for n in numbering.iter(W + "num"):
    aid = n.find(W + "abstractNumId").get(W + "val")
    if abstract_is_bullet.get(aid): bullet_ids.add(n.get(W + "numId"))

out_parts = [f"<html><head><meta charset='utf-8'><style>{STYLE}</style></head><body>"]
open_list = None  # (tag, numId)

def close_list():
    global open_list
    if open_list:
        out_parts.append(f"</{open_list[0]}>")
        open_list = None

for el in body:
    tag = el.tag.replace(W, "")
    if tag == "p":
        style, num = para_info(el)
        inner = runs_html(el)
        if num:
            t = "ul" if num in bullet_ids else "ol"
            if open_list != (t, num):
                close_list(); out_parts.append(f"<{t}>"); open_list = (t, num)
            out_parts.append(f"<li>{inner}</li>")
            continue
        close_list()
        if el.find(f".//{W}br[@{W}type='page']") is not None and not inner:
            out_parts.append('<p style="page-break-before:always"></p>'); continue
        if not inner:
            continue
        if style == "Heading1": out_parts.append(f"<h1>{inner}</h1>")
        elif style == "Heading2": out_parts.append(f"<h2>{inner}</h2>")
        else: out_parts.append(f"<p>{inner}</p>")
    elif tag == "tbl":
        close_list()
        rows = el.findall(W + "tr")
        cells0 = rows[0].findall(W + "tc")
        if len(rows) == 1 and len(cells0) == 1:
            paras = [runs_html(p) for p in cells0[0].findall(W + "p")]
            out_parts.append('<div class="callout">' + "".join(f"<p>{x}</p>" for x in paras if x) + "</div>")
            continue
        out_parts.append("<table>")
        for i, tr in enumerate(rows):
            trpr = tr.find(W + "trPr")
            is_head = trpr is not None and trpr.find(W + "tblHeader") is not None
            cells = tr.findall(W + "tc")
            texts = ["<br>".join(runs_html(p) for p in tc.findall(W + "p")) for tc in cells]
            if is_head and all(t == "" for t in texts):
                continue  # the cover table has an empty header row
            tcpr_bold = any(tc.find(W + "tcPr") is not None and tc.find(W + "tcPr").find(W + "shd") is not None and tc.find(W + "tcPr").find(W + "shd").get(W + "fill") == "F3F1EA" for tc in cells)
            ctag = "th" if is_head else "td"
            style = ' style="font-weight:bold;background:#F3F1EA"' if tcpr_bold else ""
            out_parts.append("<tr>" + "".join(f"<{ctag}{style}>{t}</{ctag}>" for t in texts) + "</tr>")
        out_parts.append("</table>")
close_list()
out_parts.append("</body></html>")
open(out, "w", encoding="utf-8").write("\n".join(out_parts))
print("written", out, len("\n".join(out_parts)))
