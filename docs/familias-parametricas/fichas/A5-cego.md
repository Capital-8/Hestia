# Ficha A5-cego — Teste cego das malhas de extrusão e revolução

Modelo: **Haiku 5.5** · Onda 2 · Depende de: rodar contra A5 · Base: `claude/lucid-euler-ddb7j6`

Leia primeiro `docs/familias-parametricas/REGRAS.md` (protocolo e portão) e `docs/familias-parametricas/CONTRATO.md` (semântica e números de aceitação). Vale o CONTRATO se algo aqui divergir dele.

## Contexto
Você NÃO pode ler `corposMalha*.ts`. Só CONTRATO.md §2.3, N1, N3, N5 e `malha.ts` (o tipo `Malha`).

## Faça
1. Escreva `corposMalha.cego.test.ts` contra `malhaExtrusao(perfil, comprimento)` e `malhaRevolucao(perfil, anguloRad, segmentos)`: volume por tetraedros assinados (N1, N3, N5 e anel), estanqueidade, normais para fora (o centróide da malha fica do lado oposto da normal de cada tampa), 180° de revolução com tampas (volume = metade), bounding box.
2. Ambiguidades: `it.skip` + `AMBIGUIDADE:`.

## Aceitação
Escrito; arbitragem pelo orquestrador.

## Arquivos permitidos
- `packages/engine/src/componentes/corposMalha.cego.test.ts` (NOVO)

## Proibido
Qualquer arquivo fora da lista (os pontos de junção `index.ts`, `edicao.ts`, `validar.ts`, `i18n/areas/familias.ts` só aceitam linhas ADITIVAS), `crates/**` (salvo H3), `@hestia/geom`, `package.json`, testes existentes (só acrescentar), `docs/**` (salvo se listado).

## Parada
Contrato contraditório, teste que você acha errado, ou necessidade de mexer fora da lista: PARE, não improvise, e descreva no relatório.

## Entrega
Commits pequenos em português (`feat(familias): …`, `wip:` a cada marco) e o relatório de `REGRAS.md` §7 (última linha de cada comando de verificação).
