# Ficha A2b — Renomear e excluir parâmetro enxergam as fórmulas dos corpos

Modelo: **Haiku 5.5** · Onda 2 · Depende de: A2 · Base: `claude/lucid-euler-ddb7j6`

Leia primeiro `docs/familias-parametricas/REGRAS.md` e `CONTRATO.md` (§2). Vale o CONTRATO se algo aqui divergir.

## Contexto
A ficha A2 não conseguiu cobrir esta parte porque `percorrerFamilia` em `packages/model/src/familia/edicaoApoio.ts` (usado por renomear e excluir parâmetro em `edicaoParametros.ts`) só enxerga peças, aninhados e ferragens. Os corpos (`Familia.corpos`: perfil, caminho, quadro, `repetir`, `quando`, `material`) têm fórmulas que referenciam parâmetros. A validação dos corpos já existe em `validarCorpos.ts` (campos de fórmula por forma; reaproveite a lista de campos).

## Faça
1. Faça `percorrerFamilia` (e o que mais as operações de renomear e excluir parâmetro/plano usarem) visitar TODAS as fórmulas dos corpos: `quadro.origem`, `quadro.rotacao`, `repetir`, `quando`, e por forma: `extrusao.comprimento`, `revolucao.angulo/segmentos/afastamento`, `varredura.caminho.pontos/raios/segmentosPorCurva`, `transicao.comprimento/desvio`, e os campos de cada tipo de `Perfil`. Reaproveite `camposDoCorpo` de `grafo.ts`/`validarCorpos.ts` em vez de duplicar a lista; se a lista não for exportável com pouca mudança, exporte-a.
2. Renomear parâmetro reescreve as referências dentro dessas fórmulas (mesma rotina que já reescreve as de peças); excluir parâmetro recusa quando alguma fórmula de corpo ainda o usa, com o motivo em português no estilo atual (cite o corpo).
3. Testes acrescentados em `edicao.test.ts` ou novo `edicaoCorposParametros.test.ts` (NOVO): renomear `D` para `DN` atualiza perfil circular, caminho e `repetir`; excluir parâmetro usado em corpo é recusado; família sem corpos não muda; desfazer volta.

4. Reserve o identificador `PI` (e os nomes das funções novas `sin cos tan asin acos atan atan2 pow busca`) em `RESERVADOS` de `edicaoApoio.ts` e na lista fixa de `validarEstrutura.ts`: renomear um parâmetro para esses nomes é recusado, com teste.

## Aceitação
Os quatro testes acima verdes; suíte `packages/model/src/familia` sem regressão.

## Arquivos permitidos
- `packages/model/src/familia/edicaoApoio.ts`
- `packages/model/src/familia/edicaoParametros.ts`
- `packages/model/src/familia/grafo.ts` (só exportar a lista de campos, se preciso)
- `packages/model/src/familia/validarCorpos.ts` (só exportar, se preciso)
- `packages/model/src/familia/validarEstrutura.ts` (só a lista de nomes reservados)
- `packages/model/src/familia/edicaoCorposParametros.test.ts` (NOVO)

## Proibido
Qualquer arquivo fora da lista, `crates/**`, testes existentes (só acrescentar), `docs/**`.

## Parada
Contrato contraditório ou necessidade de mexer fora da lista: PARE e relate.

## Entrega
Commits pequenos em português e o relatório de `REGRAS.md` §7.
