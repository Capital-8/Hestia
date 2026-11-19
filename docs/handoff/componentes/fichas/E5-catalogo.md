# Ficha E5-catalogo — catálogo de chapas, fitas e ferragens

Base: branch `feat/familias-interface`.   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
Marcenaria trabalha com chapas (material + espessura + chapa bruta + refilo + veio), fitas de borda e ferragens, com custos. O catálogo é editável pelo usuário e viaja em arquivo. Os tipos e os dados padrão já estão prontos em `packages/model/src/familia/catalogo.ts`; as funções ainda não. Leia: `catalogo.ts` (cada função tem a especificação completa em comentário: siga literalmente), `catalogo.test.ts` (aceite), `arquivo.ts` (já pronto: bom modelo de importação defensiva com chaves proibidas e cópia profunda).

## Faça
1. Implemente `validarCatalogo`, `chapaPorId`, `fitaPorId`, `opcoesDeChapa`, `areaUtilDaChapa`, `exportarCatalogo`, `importarCatalogo` e `mesclarCatalogo` mantendo assinaturas, constantes e comentários. Divida em arquivos de apoio com prefixo `catalogo` se passar de 420 linhas (por exemplo `catalogoValidar.ts`, `catalogoArquivo.ts`).
2. Nunca lance em `validarCatalogo` (lixo vira problema). `importarCatalogo` só lança nos casos fatais da especificação.
3. Cópia profunda com `structuredClone` depois da varredura de chaves proibidas (recursiva, com limite de profundidade 64: acima disso o item é ignorado com motivo "aninhamento excessivo").

## Arquivos permitidos
`packages/model/src/familia/catalogo.ts` e novos `packages/model/src/familia/catalogo*.ts` (sem `.test.ts`).

## Proibido
`catalogo.test.ts`, `index.ts` e todo o resto (não mude os dados de `CATALOGO_PADRAO` nem os tipos).

## Aceite (o orquestrador roda)
`npx vitest run packages/model/src/familia/catalogo.test.ts` verde, `tsc`, `eslint --max-warnings 0`, `check-boundaries`.

## Critério de parada
Teste que pareça contradizer a especificação: PARE e relate. Não altere testes.

## Entrega
Commits pequenos (`feat(familia): …`) e o relatório pedido nas regras.
