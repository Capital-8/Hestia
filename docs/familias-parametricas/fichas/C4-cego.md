# Ficha C4-cego — Teste cego da compatibilidade e do encaixe

Modelo: **Haiku 5.5** · Onda 4 · Depende de: rodar contra C4 · Base: `claude/lucid-euler-ddb7j6`

Leia primeiro `docs/familias-parametricas/REGRAS.md` (protocolo e portão) e `docs/familias-parametricas/CONTRATO.md` (semântica e números de aceitação). Vale o CONTRATO se algo aqui divergir dele.

## Contexto
Você NÃO pode ler `ligacoesEncaixe.ts`. Só CONTRATO.md §3 e N8.

## Faça
1. Escreva `ligacoesEncaixe.cego.test.ts` com os casos do N8, os limites das cinco regras (0,5 mm, 2,5°, 50 mm) e fluxo. Ambiguidades: `it.skip` + `AMBIGUIDADE:`.

## Aceitação
Escrito; arbitragem pelo orquestrador.

## Arquivos permitidos
- `packages/engine/src/componentes/ligacoesEncaixe.cego.test.ts` (NOVO)

## Proibido
Qualquer arquivo fora da lista (os pontos de junção `index.ts`, `edicao.ts`, `validar.ts`, `i18n/areas/familias.ts` só aceitam linhas ADITIVAS), `crates/**` (salvo H3), `@hestia/geom`, `package.json`, testes existentes (só acrescentar), `docs/**` (salvo se listado).

## Parada
Contrato contraditório, teste que você acha errado, ou necessidade de mexer fora da lista: PARE, não improvise, e descreva no relatório.

## Entrega
Commits pequenos em português (`feat(familias): …`, `wip:` a cada marco) e o relatório de `REGRAS.md` §7 (última linha de cada comando de verificação).
