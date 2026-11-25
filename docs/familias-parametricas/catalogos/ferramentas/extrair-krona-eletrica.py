#!/usr/bin/env python3
"""Extrai as tabelas dimensionais de eletrodutos e caixas de luz do Catálogo Técnico Linha Elétrica Krona 2026
(PDF -> texto com pdftotext -layout) para o mesmo JSON que extrair-krona.py gera.

Uso: extrair-krona-eletrica.py <arquivo.txt> <saida.json> <url> <sha256> [pagina_ini-pagina_fim]   (padrão: 6-11)

Por que um extrator NOVO: neste PDF o cabeçalho é 'Código Bitola B C D d' SEM a unidade entre parênteses (a unidade vem
na linha 'Dimensões (mm)' ou 'Dimensões (pol.)' acima), e há colunas de rosca ('1/2”') que não são número.

O que é automático: as linhas de dado (código, bitola, valores) e a contagem de colunas.
O que é MAPA MANUAL (TITULOS, abaixo): título, unidade impressa e série de cada tabela, lidos da página do PDF, indexados pelo
código do primeiro item. Motivo: o pdftotext intercala o rótulo do desenho com o título e a posição não basta para separá-los.
Convenções: '3m' vira 3000 (mm), como no catálogo de água fria; colunas de rosca (texto, contêm ”) saem do item;
linhas com número de valores diferente do cabeçalho vão para 'descartadas' (não se inventa valor).
Transcrição: TODA tabela sai com estado 'CONFERIR' até alguém comparar com o PDF."""
import json, re, sys

txt, saida, url, sha = sys.argv[1:5]
ini, fim = map(int, sys.argv[5].split('-')) if len(sys.argv) > 5 else (6, 11)
paginas = open(txt, encoding='utf-8').read().split('\f')

# codigo do 1o item -> (titulo como impresso, unidade impressa, série)
TITULOS = {
    '1100': ('Tubo Eletroduto de PVC Rígido Roscável 3m', 'pol.', 'Eletroduto rígido roscável'),
    '1200': ('Tubo Eletroduto de PVC Rígido Soldável 3m', 'mm', 'Eletroduto rígido soldável'),
    '1142': ('Curva 90 Curta para Eletroduto Roscável', 'pol.', 'Eletroduto rígido roscável'),
    '1151': ('Curva 90 Longa para Eletroduto Roscável', 'pol.', 'Eletroduto rígido roscável'),
    '1160': ('Curva 135° para Eletroduto Roscável', 'pol.', 'Eletroduto rígido roscável'),
    '1162': ('Curva 180° Curta para Eletroduto Roscável', 'pol.', 'Eletroduto rígido roscável'),
    '1218': ('Curva 90° para Eletroduto Soldável', 'mm', 'Eletroduto rígido soldável'),
    '1181': ('Luva para Eletroduto Roscável', 'pol.', 'Eletroduto rígido roscável'),
    '1207': ('Luva para Eletroduto Soldável', 'mm', 'Eletroduto rígido soldável'),
    '1225': ('Eletroduto de PVC Corrugado Flexível (Parede)', 'mm', 'Eletroduto corrugado'),
    '1235': ('Eletroduto de PVC Corrugado Reforçado Flexível (Laje)', 'mm', 'Eletroduto corrugado reforçado'),
    '1233': ('Eletroduto de PVC Corrugado Reforçado Flexível (VDI)', 'mm', 'Eletroduto corrugado reforçado'),
    '1250': ('Luva de Pressão para Eletroduto Corrugado Reforçado Flexível', 'mm', 'Eletroduto corrugado reforçado'),
    '1245': ('Luva de Pressão para Eletroduto Corrugado Flexível', 'mm', 'Eletroduto corrugado'),
    '1260': ('Prolongador para Caixa de Luz Octogonal', 'mm', 'Caixas de luz'),
    '1261': ('Prolongador Reforçado para Caixa de Luz para Laje', 'mm', 'Caixas de luz'),
    '1255': ('Caixa de Luz Octogonal com Fundo Móvel para Eletroduto Corrugado Flexível', 'mm', 'Caixas de luz'),
    '1254': ('Caixa de Luz Octogonal com Fundo Móvel para Eletroduto Corrugado Reforçado', 'mm', 'Caixas de luz'),
    '1265': ('Caixa de Luz Empilhável para Eletroduto Corrugado Flexível', 'mm', 'Caixas de luz'),
    '2369': ('Caixa de Luz para Eletroduto Corrugado Flexível', 'mm', 'Caixas de luz'),
    '1266': ('Caixa de Luz para Eletroduto Corrugado Flexível', 'mm', 'Caixas de luz'),
    '1256': ('Caixa de Luz para Laje', 'mm', 'Caixas de luz'),
}
# Nomes de coluna válidos em TypeScript (o PDF traz 'C(m)' e 'C(cm', este último sem o parêntese de fechamento)
NOMES_COLUNA = {'C(m)': 'Cm', 'C(cm': 'Ccm'}

cab = re.compile(r'C[óo]digo\s+Bitola\s+(.*)$')
dado = re.compile(r'^\s*(?:[A-Za-z]{1,2}\s+)*(?:Injetada\s+)?(\d{4})\s+(\S+)\s+(.*)$')
numero = re.compile(r'^\d+(?:,\d+)?$')
metros = re.compile(r'^(\d+)m$')
rosca = '”'

tabelas = []
for pi in range(ini, fim + 1):
    linhas = paginas[pi - 1].split('\n')
    atual = None
    for ln in linhas:
        m = cab.search(ln)
        if m:
            cols, vistos = [], {}
            for c in m.group(1).split():
                c = NOMES_COLUNA.get(c, c)
                vistos[c] = vistos.get(c, 0) + 1
                cols.append(c if vistos[c] == 1 else f'{c}_{vistos[c]}')  # cabeçalho repetido: C C -> C, C_2
            atual = {'pagina': pi, 'colunas': cols, 'brutas': [], 'descartadas': []}
            tabelas.append(atual)
            continue
        if 'Código' in ln:  # outro quadro (ex.: fita isolante, 'Código Espessura'): fecha a tabela atual
            atual = None
            continue
        if atual is None:
            continue
        d = dado.match(ln.rstrip())
        if not d:
            continue
        codigo, bitola, resto = d.group(1), d.group(2), d.group(3).split()
        if len(resto) != len(atual['colunas']):
            atual['descartadas'].append(ln.strip())
            continue
        atual['brutas'].append((codigo, bitola, resto))

saida_tabelas = []
for t in tabelas:
    if not t['brutas']:
        continue
    primeiro = t['brutas'][0][0]
    if primeiro not in TITULOS:
        sys.exit(f'Sem título mapeado para o código {primeiro} (página {t["pagina"]}): complete TITULOS')
    titulo, unidade, serie = TITULOS[primeiro]
    # colunas-texto (rosca, ex.: '1/2”'): saem do item, com o nome registrado no JSON
    texto = {i for i in range(len(t['colunas'])) if any(rosca in r[2][i] for r in t['brutas'])}
    colunas = [c for i, c in enumerate(t['colunas']) if i not in texto]
    linhas = []
    for codigo, bitola, resto in t['brutas']:
        valores = {}
        for i, c in enumerate(t['colunas']):
            if i in texto: continue
            tok = resto[i]
            mt = metros.match(tok)
            if mt: valores[c] = float(mt.group(1)) * 1000  # '3m' -> 3000 mm
            elif numero.match(tok): valores[c] = float(tok.replace(',', '.'))
            else: raise SystemExit(f'Valor inesperado {tok!r} na linha {codigo} (página {t["pagina"]})')
        linhas.append({'codigo': codigo, 'bitola': bitola, 'valores': valores})
    saida_tabelas.append({'secao': serie, 'pagina': t['pagina'], 'titulo': titulo, 'unidadeDimensoes': unidade,
                          'colunasTexto': [t['colunas'][i] for i in sorted(texto)], 'colunas': colunas,
                          'linhas': linhas, 'descartadas': t['descartadas']})

json.dump({'fabricante': 'Krona', 'fonte': {'url': url, 'sha256': sha}, 'estado': 'CONFERIR', 'tabelas': saida_tabelas},
          open(saida, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(saida_tabelas), 'tabelas;', sum(len(t['linhas']) for t in saida_tabelas), 'linhas;',
      sum(len(t['descartadas']) for t in saida_tabelas), 'descartadas')
