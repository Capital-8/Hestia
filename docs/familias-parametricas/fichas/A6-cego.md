# Ficha A6-cego — Teste cego da varredura e da transição

Modelo: **Haiku 5.5** · Onda 2 · Depende de: rodar contra A6 · Base: `claude/lucid-euler-ddb7j6`

Leia primeiro `docs/familias-parametricas/REGRAS.md` (protocolo e portão) e `docs/familias-parametricas/CONTRATO.md` (semântica e números de aceitação). Vale o CONTRATO se algo aqui divergir dele.

## Contexto
Você NÃO pode ler `corposMalhaVarredura.ts`, `corposMalhaTransicao.ts`, `corposQuadro.ts`. Só CONTRATO.md (§2.3, N2, N4) e `corposTipos.ts`.

## Faça
1. Escreva `corposVarredura.cego.test.ts` contra `malhaVarredura(perfil, caminho)` e `malhaTransicao(a, b, comprimento, desvio)`: N2 e N4 por volume com as tolerâncias do contrato, estanqueidade, tubo oco, caminho reto equivale à extrusão (mesmo volume exato), bounding box do cotovelo (a seção final fica em x = 0,5 m), transição com desvio desloca a seção B.
2. Ambiguidades: `it.skip` + `AMBIGUIDADE:`.

## Aceitação
Escrito; arbitragem pelo orquestrador.

## Arquivos permitidos
- `packages/engine/src/componentes/corposVarredura.cego.test.ts` (NOVO)

## Proibido
Qualquer arquivo fora da lista (os pontos de junção `index.ts`, `edicao.ts`, `validar.ts`, `i18n/areas/familias.ts` só aceitam linhas ADITIVAS), `crates/**` (salvo H3), `@hestia/geom`, `package.json`, testes existentes (só acrescentar), `docs/**` (salvo se listado).

## Parada
Contrato contraditório, teste que você acha errado, ou necessidade de mexer fora da lista: PARE, não improvise, e descreva no relatório.

## Entrega
Commits pequenos em português (`feat(familias): …`, `wip:` a cada marco) e o relatório de `REGRAS.md` §7 (última linha de cada comando de verificação).
