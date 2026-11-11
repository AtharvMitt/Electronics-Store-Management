"""Render the project's Markdown subset to print HTML using only the standard library.

Export: libreoffice -env:UserInstallation=file:///tmp/techzone-doc-profile
  --headless --convert-to pdf --outdir docs/specifications
  /tmp/techzone-specifications/*.html
"""
from html import escape
from pathlib import Path
import re


def inline(text):
    text = escape(text)
    text = re.sub(r'`([^`]+)`', r'<code>\1</code>', text)
    text = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', text)
    return re.sub(r'\[([^]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', text)


def render(source):
    output, code, table = [], False, False
    for line in source.splitlines():
        if line.startswith('<!--'):
            continue
        if line.startswith('```'):
            if table:
                output.append('</tbody></table>')
                table = False
            output.append('</code></pre>' if code else '<pre><code>')
            code = not code
            continue
        if code:
            output.append(escape(line) + '\n')
            continue
        if line.startswith('|'):
            cells = [cell.strip() for cell in line.strip('|').split('|')]
            if all(re.fullmatch(r':?-+:?', cell) for cell in cells):
                continue
            tag = 'td' if table else 'th'
            if not table:
                output.append('<table><tbody>')
                table = True
            formatted = []
            for cell in cells:
                attributes = ' nowrap="nowrap" width="100"' if cell.startswith('TC-') else ''
                formatted.append(f'<{tag}{attributes}>{inline(cell)}</{tag}>')
            output.append('<tr>' + ''.join(formatted) + '</tr>')
            continue
        if table:
            output.append('</tbody></table>')
            table = False
        heading = re.match(r'^(#{1,6}) (.+)$', line)
        if heading:
            level = len(heading[1])
            output.append(f'<h{level}>{inline(heading[2])}</h{level}>')
        elif line.strip():
            output.append('<p>' + inline(line) + '</p>')
    if table:
        output.append('</tbody></table>')
    return '\n'.join(output)


root = Path(__file__).resolve().parent.parent
case_table = (root / 'docs/testing/test-cases.md').read_text().split('| TC ID |', 1)[1]
plan = root / 'docs/specifications/software-test-plan.md'
plan.write_text(plan.read_text().split('<!-- GENERATED CASE TABLE -->')[0] + '<!-- GENERATED CASE TABLE -->\n\n| TC ID |' + case_table)
destination = Path('/tmp/techzone-specifications')
destination.mkdir(exist_ok=True)
css = '''@page { size: A4 landscape; margin: 14mm; }
body { font: 10pt "Liberation Sans", sans-serif; color: #182c25; }
h1 { font-size: 22pt; } h2 { font-size: 15pt; margin-top: 20pt; }
h3 { font-size: 12pt; } h1,h2,h3 { page-break-after: avoid; }
p { line-height: 1.35; } table { border-collapse: collapse; width: 100%; margin: 10pt 0; font-size: 8pt; }
th,td { border: 1px solid #a8b8b0; padding: 5pt; vertical-align: top; overflow-wrap: anywhere; }
th { background: #dce9e1; } tr { page-break-inside: avoid; }
pre { background: #eff3f0; padding: 8pt; font-size: 8pt; white-space: pre-wrap; }
code { font-family: "Liberation Mono", monospace; font-size: 8pt; } a { color: #214e42; }
'''
for document in (root / 'docs/specifications').glob('*.md'):
    title = document.read_text().splitlines()[0].lstrip('# ')
    html = '<!doctype html><html><head><meta charset="utf-8"><title>' + escape(title) + '</title><style>' + css + '</style></head><body>' + render(document.read_text()) + '</body></html>'
    (destination / (document.stem + '.html')).write_text(html)
print(f'Rendered three documents to {destination}; export HTML to PDF with LibreOffice.')
