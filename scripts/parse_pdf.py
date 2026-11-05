import pypdf
import json

reader = pypdf.PdfReader('docs/reference/Brahm_Kshatriya_Gotra_Nukh_List_English.pdf')

def split_nukhs(text):
    result = []
    current = []
    depth = 0
    for char in text:
        if char == '(':
            depth += 1
            current.append(char)
        elif char == ')':
            depth -= 1
            current.append(char)
        elif char == ',' and depth == 0:
            item = ''.join(current).strip()
            if item:
                result.append(item)
            current = []
        else:
            current.append(char)
    if current:
        item = ''.join(current).strip()
        if item:
            result.append(item)
    return result

def parse_page(page):
    text = page.extract_text()
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    content_lines = []
    for l in lines:
        if 'BRAHM KSHATRIYA' in l or 'English transliteration' in l or l == 'GOTRA' or l == 'NUKH':
            continue
        content_lines.append(l)
    pairs = []
    i = 0
    while i < len(content_lines):
        gotra = content_lines[i]
        nukhs_str = content_lines[i+1] if i+1 < len(content_lines) else ''
        pairs.append((gotra, nukhs_str))
        i += 2
    return pairs

all_pairs = parse_page(reader.pages[0]) + parse_page(reader.pages[1])
data = {}
for g, n_str in all_pairs:
    nukhs = split_nukhs(n_str)
    data[g] = nukhs

print(json.dumps(data, indent=2, ensure_ascii=False))
