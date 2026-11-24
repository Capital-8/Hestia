#!/usr/bin/env python3
"""Gera o arquivo TypeScript do catálogo a partir do JSON de extrair-krona.py.
Uso: gerar-ts.py <entrada.json> <saida.ts> <idCatalogo> <nomeConstante> <documento> <edicao>"""
import json, re, sys, unicodedata
ent, saida, cid, const, doc, edicao = sys.argv[1:7]
d = json.load(open(ent, encoding='utf-8'))
SIG = {'B': 'profundidade da bolsa', 'C': 'comprimento total', 'D': 'diâmetro interno da bolsa (CONFERIR)', 'd': 'diâmetro externo da ponta',
       'e': 'espessura da parede', 'Z': 'distância do centro à entrada da bolsa (CONFERIR)', 'A': 'altura (CONFERIR)', 'B1': 'bolsa 1', 'B2': 'bolsa 2',
       'C1': 'comprimento 1', 'C2': 'comprimento 2', 'Z1': 'Z do ramal 1', 'Z2': 'Z do ramal 2', 'E': 'E (CONFERIR)', 'D1': 'diâmetro 1', 'D2': 'diâmetro 2'}
def sem(s): return unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode()
def slug(s): return re.sub(r'[^a-z0-9]+', '_', sem(s).lower()).strip('_')
def tipo(t):
    t = sem(t).lower()
    achados = []
    for k, v in [('tubo', 'tubo'), ('joelho 90', 'joelho90'), ('joelho 45', 'joelho45'), ('curva 90', 'curva90'), ('curva 45', 'curva45'), ('juncao', 'juncao'), ('luva', 'luva'),
                 ('te ', 'te'), ('reducao', 'reducao'), ('bucha', 'bucha'), ('cap', 'cap'), ('caixa', 'caixa'), ('ralo', 'ralo'), ('sifao', 'sifao')]:
        i = (' ' + t).find(' ' + k)
        if i >= 0: achados.append((i, v))
    return min(achados)[1] if achados else 'outro'
def q(s): return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"
usados = {}
L = []
for t in d['tabelas']:
    if not t['linhas']: continue
    titulo = re.sub(r'\s+', ' ', re.sub(r'^[\^A-Za-z0-9¹²]{1,2}(\s{2,}[\^A-Za-z0-9¹²]{1,2})*\s{2,}', '', t['titulo'])).strip().lstrip('^ ')
    if not titulo: titulo = 'Item sem título (código ' + t['linhas'][0]['codigo'] + ')'
    base = slug(titulo) + ('_reforcada' if 'reforçada' in t['secao'] and 'reforcad' not in sem(titulo).lower() else '')
    n = usados.get(base, 0) + 1; usados[base] = n
    iid = base if n == 1 else f'{base}_{n}'
    cols = ', '.join(f"{k}: {q(SIG.get(k, k))}" for k in t['colunas'])
    L.append(f"  item({q(iid)}, {q(titulo)}, {q(tipo(titulo))}, {q(t['secao'])}, {t['pagina']}, {{ {cols} }}, [")
    for r in t['linhas']:
        v = ', '.join(f"{k}: {r['valores'][k]:g}" for k in t['colunas'])
        L.append(f"    [{q(r['codigo'])}, {q(r['bitola'])}, {{ {v} }}],")
    L.append('  ]),')
f = d['fonte']
out = f"""import {{ CATALOGO_MEP_FORMATO, CATALOGO_MEP_VERSAO, type CatalogoMep, type ItemCatalogo }} from '../catalogoMep.ts';

/*
 * GERADO por docs/familias-parametricas/catalogos/ferramentas (extrair-krona.py + gerar-ts.py) a partir do PDF indicado na fonte.
 * Transcrição AUTOMÁTICA do texto do PDF: todo item nasce CONFERIR. Compare com o documento antes de usar em projeto real.
 * As letras das colunas seguem o desenho do fabricante; o significado de D, Z, A e E é leitura nossa (CONFERIR).
 */

type Cols = Record<string, string>;
type Linha = readonly [string, string, Record<string, number>];

function item(id: string, nome: string, tipo: string, serie: string, pagina: number, colunas: Cols, linhas: Linha[]): ItemCatalogo {{
  return {{ id, nome, tipo, serie, colunas, pagina, estado: 'CONFERIR', linhas: linhas.map(([codigo, bitola, valores]) => ({{ codigo, bitola, valores }})) }};
}}

export const {const}: CatalogoMep = {{
  formato: CATALOGO_MEP_FORMATO,
  versao: CATALOGO_MEP_VERSAO,
  id: {q(cid)},
  nome: {q(doc)},
  dominio: 'esgoto',
  fonte: {{ fabricante: {q('Krona')}, documento: {q(doc)}, edicao: {q(edicao)}, url: {q(f['url'])}, sha256: {q(f['sha256'])} }},
  itens: [
{chr(10).join(L)}
  ],
}};
"""
open(saida, 'w', encoding='utf-8').write(out)
print(sum(1 for x in L if x.startswith('  item(')), 'itens;', len(out.splitlines()), 'linhas')
