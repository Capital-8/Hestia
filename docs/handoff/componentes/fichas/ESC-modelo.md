# Ficha ESC-modelo — conectores e escolhas na família: validação e edição

Base: `feat/familias-interface`.   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
O contrato está em `packages/model/src/familia/tipos.ts` (`Conector`, `LadoConector`, `Escolha`; `Familia.conectores?`, `Familia.escolhas?`). Faltam validação e operações de edição (puras, sobre o rascunho, retornam `null` em sucesso ou o motivo da recusa em português, como as de `edicaoPecas.ts` e `edicaoTipos.ts`). Leia `validar.ts` e `validarEstrutura.ts` (como se acrescentam problemas, `nivel`, `onde`), `edicao.ts`, `edicaoApoio.ts`, `edicaoParametros.ts` (`renomearParametro`: como as referências são atualizadas) e `edicao.test.ts`. Use `clonarSeguro` de `dependencias.ts` se precisar clonar dentro de edição.

## Faça
1. **Validação** (arquivo novo `validarEncaixe.ts`, chamado de `validar.ts` com uma linha): conectores com id único e não vazio, `lado` válido, `etiqueta` não vazia, `folga` (se houver) fórmula válida que só referencia parâmetros existentes (mesmo tratamento das outras fórmulas); escolhas com id único, `parametro` existente e de tipo `enum`, `booleano` ou `inteiro`, `zona` igual ao `grupo` de ao menos uma peça (erro se nenhuma peça tem essa zona). Problemas com `onde: 'conector:<id>'` / `'escolha:<id>'`.
2. **Edição** (arquivo novo `edicaoEncaixe.ts`, exportado em `edicao.ts`): `adicionarConector(f, c)`, `editarConector(f, id, patch)`, `excluirConector(f, id)`, `adicionarEscolha(f, e)`, `editarEscolha(f, id, patch)`, `excluirEscolha(f, id)`. Recusam id duplicado/inexistente. Renomear um parâmetro (`renomearParametro`) deve atualizar `escolhas[].parametro` e as referências de `folga` dos conectores; excluir um parâmetro usado por uma escolha é RECUSADO (a mensagem cita a escolha).
3. **Biblioteca**: NÃO mexa na biblioteca (é do orquestrador).
4. Testes em `encaixe.test.ts` (NOVO, dentro de `packages/model/src/familia/`): cada validação com um caso que falha e um que passa; cada operação de edição (sucesso, recusas); renomear parâmetro acompanha escolhas e folga; excluir parâmetro em uso recusado; as operações funcionam por dentro de `HistoricoFamilia.exec` (rascunho do immer) com desfazer/refazer.
5. Gates: `npx tsc -p tsconfig.json --noEmit`, `npx eslint --max-warnings 0` nos arquivos tocados, `node scripts/check-boundaries.mjs`, `node scripts/check-units.mjs`, e os testes da ficha. Nada acima de 420 linhas; textos em português; sem `any`/`eslint-disable`; sem dependência nova. Mais `npx vitest run packages/model` verde SEM regressão.

## Arquivos permitidos
`packages/model/src/familia/validarEncaixe.ts` (NOVO), `packages/model/src/familia/edicaoEncaixe.ts` (NOVO), `packages/model/src/familia/validar.ts` (uma chamada), `packages/model/src/familia/edicao.ts` (exports), `packages/model/src/familia/edicaoParametros.ts` (só o necessário para renomear/excluir), `packages/model/src/familia/encaixe.test.ts` (NOVO).

## Proibido
`tipos.ts`, `biblioteca/**`, testes existentes, `packages/engine/**`, `apps/**`, `crates/**`, `docs/**`.

## Critério de parada
Teste contraditório com a especificação, ou necessidade de mudar arquivo fora da lista: PARE e relate.

## Entrega
Commits pequenos (`feat(componentes): …`) e o relatório pedido nas regras (últimas linhas dos comandos, decisões, o que ficou de fora).
