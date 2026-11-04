# Gera as fichas de TESTE CEGO: outro modelo escreve os testes de cada função de encaixe só a partir da especificação.
import os

AQUI = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(AQUI, 'fichas')

ALVOS = {
    'core': ('encaixeArrasto', 'posarArrastado, facesDasParedes, corposDoNivel e caixaLocalDoComponente'),
    'parede': ('encaixeParede', 'encaixarNaParede'),
    'vizinho': ('encaixeVizinho', 'encaixarNoVizinho e guiasDeAlinhamento'),
    'colisao': ('encaixeColisao', 'colisoes e retanguloNoMundo'),
    'fila': ('encaixeFila', 'preencherVao, ajustarLarguras e posicoesDaFila'),
}

for chave, (arquivo, funcoes) in ALVOS.items():
    nome_ficha = 'F3-core' if chave == 'core' else f'F2-{chave}'
    origem = open(os.path.join(D, nome_ficha + '.md'), encoding='utf-8').read()
    # Só a parte de especificação: do "## Contexto" até "## Arquivos permitidos" (inclui os casos numéricos).
    inicio = origem.index('## Contexto')
    fim = origem.index('## Arquivos permitidos')
    spec = origem[inicio:fim]
    corpo = (
        f'# Ficha T-{nome_ficha} — testes CEGOS de `{funcoes}`\n\n'
        'Base: `feat/familias-interface`.   Modelo: definido pelo orquestrador\n\n'
        '## O que você faz\n'
        f'Outro executor está implementando `{funcoes}` em `packages/engine/src/componentes/{arquivo}.ts` e escrevendo os testes dele. '
        'VOCÊ escreve testes INDEPENDENTES, só a partir da especificação abaixo, para o orquestrador cruzar os dois. '
        f'NÃO leia, NÃO implemente e NÃO altere `{arquivo}.ts` (neste worktree ele só lança "não implementado": os seus testes vão falhar aqui, e isso é esperado). '
        'Seus testes são validados depois, contra a implementação do outro.\n\n'
        '## Regras\n'
        f'1. Escreva UM arquivo: `packages/engine/src/componentes/{arquivo}.cego.test.ts` (vitest; importe de `./{arquivo}.ts` e de `./encaixeTipos.ts`; para geometria pode usar `retanguloNoMundo` de `./encaixeColisao.ts`, que já está pronta).\n'
        '2. Cubra TODOS os casos numéricos da especificação e acrescente pelo menos 6 casos seus: bordas, simetria (espelhar a cena deve espelhar o resultado), idempotência, determinismo, entradas vazias, valores no limite da tolerância. '
        'Calcule os valores esperados À MÃO a partir da especificação e das convenções de `encaixeTipos.ts`, com a conta escrita num comentário curto ao lado de cada `expect`. Não calcule o esperado chamando a função testada.\n'
        '3. Se a especificação for ambígua num ponto, NÃO invente: escreva o teste com `it.skip` e o motivo no nome, e liste a ambiguidade no relatório.\n'
        '4. Rode `npx tsc -p tsconfig.json --noEmit` e `npx eslint --max-warnings 0 <seu arquivo>` e deixe verdes (o vitest vai falhar com "não implementado": diga isso no relatório e não tente "consertar").\n'
        f'5. Não altere nenhum outro arquivo. Textos em português. Máximo 420 linhas (se passar, divida em `{arquivo}.cego2.test.ts`).\n\n'
        '## Especificação (copiada da ficha do implementador; ignore as partes sobre implementar e sobre arquivos permitidos)\n\n'
        + spec +
        '\n## Arquivos permitidos\n'
        f'`packages/engine/src/componentes/{arquivo}.cego.test.ts` (NOVO) e, se passar de 420 linhas, `{arquivo}.cego2.test.ts` (NOVO).\n\n'
        '## Proibido\nQualquer outro arquivo, `crates/**`, `docs/**`, snapshots.\n\n'
        '## Critério de parada\nContradição na especificação: PARE e relate.\n\n'
        '## Entrega\nUm commit (`test(componentes): testes cegos de ' + funcoes + '`) e o relatório pedido nas regras, mais a lista de ambiguidades.\n'
    )
    with open(os.path.join(D, f'T-F3-core.md' if chave == 'core' else f'T-F2-{chave}.md'), 'w', encoding='utf-8') as arq:
        arq.write(corpo)
print('fichas cegas geradas')
