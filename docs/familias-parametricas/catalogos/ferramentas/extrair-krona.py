#!/usr/bin/env python3
"""Extrai as tabelas dimensionais de um catálogo técnico Krona (PDF -> texto com pdftotext -layout) para JSON.
Uso: extrair-krona.py <arquivo.txt> <saida.json> <url> <sha256>
Cada linha de dado = código de 4 dígitos + bitola + valores numéricos. As colunas vêm da linha de cabeçalho "Código Bitola ...".
Transcrição automática: TODA tabela sai com estado 'CONFERIR' até alguém comparar com o PDF."""
import json, re, sys
txt, saida, url, sha = sys.argv[1:5]
paginas = open(txt, encoding='utf-8').read().split('\f')
num = r'\d+(?:[.,]\d+)?'
cab = re.compile(r'C[óo]digo\s+Bitola\s*\(([^)]*)\)\s*(.*)')
dado = re.compile(r'(?<!\d)(\d{4})\s+(\d{1,3}(?:\s*x\s*[\d./]+["”]?)?)\s+((?:' + num + r'\s*)+)$')
def titulo_acima(linhas, i):
    """Título = texto na MESMA COLUNA de 'Dimensões (mm)', logo acima do cabeçalho (o pdftotext intercala os rótulos do desenho)."""
    k = i - 1
    while k >= 0 and 'Dimens' not in linhas[k]: k -= 1
    if k < 0: return ''
    col = max(linhas[k].find('Dimens') - 3, 0)
    partes = []; j = k - 1; ultimo = None
    while j >= 0 and j > k - 40:
        seg = linhas[j][col:].strip()
        eh_dado = bool(re.match(r'^\d{4}\s', seg)) or 'Dimens' in seg or seg.startswith('Código')
        if seg and len(seg) > 5 and not eh_dado and re.match(r'^[A-Za-zÀ-ú^]', seg):
            if ultimo is None or ultimo - j <= 3:
                partes.insert(0, re.sub(r'\s{2,}.*$', '', seg)); ultimo = j
                if len(partes) == 2: break
            else: break
        elif eh_dado and ultimo is not None: break
        elif eh_dado: break
        j -= 1
    return ' '.join(partes)

tabelas = []
secao = sys.argv[5] if len(sys.argv) > 5 else 'Esgoto série normal'
for pi, pg in enumerate(paginas, 1):
    linhas = pg.split('\n'); titulo = ''; colunas = None; atual = None
    for i, ln in enumerate(linhas):
        s = ln.strip()
        ms = re.search(r'S[ÉE]RIE\s+(NORMAL|REFOR[ÇC]ADA)', ln)
        if ms and ln.strip().upper() == ln.strip() and len(ln.strip()) < 40: secao = 'Esgoto série normal' if ms.group(1) == 'NORMAL' else 'Esgoto série reforçada'
        m = cab.search(ln)
        if m:
            colunas = m.group(2).split()
            vistos = {}
            for k, c in enumerate(colunas):  # cabeçalho repetido no PDF (ex.: Z2 Z2): a segunda ocorrência vira Z2_2
                vistos[c] = vistos.get(c, 0) + 1
                if vistos[c] > 1: colunas[k] = f'{c}_{vistos[c]}'
            titulo = titulo_acima(linhas, i)
            atual = {'secao': secao, 'pagina': pi, 'titulo': titulo, 'unidadeBitola': m.group(1), 'colunas': colunas, 'linhas': []}
            tabelas.append(atual); continue
        if atual is None: continue
        d = dado.search(ln.rstrip())
        if d:
            vals = [float(v.replace(',', '.')) for v in d.group(3).split()]
            if len(vals) == len(atual['colunas']):
                atual['linhas'].append({'codigo': d.group(1), 'bitola': d.group(2).replace(' ', ''), 'valores': dict(zip(atual['colunas'], vals))})
            else:
                atual.setdefault('descartadas', []).append(ln.strip())
json.dump({'fabricante': 'Krona', 'fonte': {'url': url, 'sha256': sha}, 'estado': 'CONFERIR', 'tabelas': [t for t in tabelas if t['linhas'] or t.get('descartadas')]}, open(saida, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(tabelas), 'tabelas;', sum(len(t['linhas']) for t in tabelas), 'linhas;', sum(len(t.get('descartadas', [])) for t in tabelas), 'descartadas')
