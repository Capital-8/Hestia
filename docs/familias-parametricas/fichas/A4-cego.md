# Ficha A4-cego — Teste cego do caminho com curvas

Modelo: **Haiku 5.5** · Onda 1 · Depende de: rodar contra A4 · Base: `claude/lucid-euler-ddb7j6`

Leia primeiro `docs/familias-parametricas/REGRAS.md` (protocolo e portão) e `docs/familias-parametricas/CONTRATO.md` (semântica e números de aceitação). Vale o CONTRATO se algo aqui divergir dele.

## Contexto
Você NÃO pode ler `corposCaminho.ts`. Só CONTRATO.md §2.3 e `corposTipos.ts`.

## Faça
1. Escreva `corposCaminho.cego.test.ts` contra `filetarCaminho(pontos, raios, segmentosPorCurva)` (metros): comprimento total do eixo por soma dos segmentos (L-shape 0,5 m + 0,5 m, R = 0,1 m ⇒ 0,95708 m; 45° e 120° com R conhecido), tangência nos extremos do arco, distância ao centro constante, erros (sobreposição, retorno 180°, segmento nulo), e que o resultado é determinístico (duas chamadas iguais).
2. Ambiguidades: `it.skip` com `AMBIGUIDADE:`.

## Aceitação
Escrito; arbitragem pelo orquestrador.

## Arquivos permitidos
- `packages/engine/src/componentes/corposCaminho.cego.test.ts` (NOVO)

## Proibido
Qualquer arquivo fora da lista (os pontos de junção `index.ts`, `edicao.ts`, `validar.ts`, `i18n/areas/familias.ts` só aceitam linhas ADITIVAS), `crates/**` (salvo H3), `@hestia/geom`, `package.json`, testes existentes (só acrescentar), `docs/**` (salvo se listado).

## Parada
Contrato contraditório, teste que você acha errado, ou necessidade de mexer fora da lista: PARE, não improvise, e descreva no relatório.

## Entrega
Commits pequenos em português (`feat(familias): …`, `wip:` a cada marco) e o relatório de `REGRAS.md` §7 (última linha de cada comando de verificação).
