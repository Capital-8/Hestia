# Ficha F-CSG — (Opcional) Subtração real de vazios nos corpos

Modelo: **Sonnet 5.5** · Onda 8 · Depende de: A6; só se a caixa de inspeção precisar · Base: `claude/lucid-euler-ddb7j6`

Leia primeiro `docs/familias-parametricas/REGRAS.md` (protocolo e portão) e `docs/familias-parametricas/CONTRATO.md` (semântica e números de aceitação). Vale o CONTRATO se algo aqui divergir dele.

## Contexto
Decisão D9: vazio é fantasma na v1. Faça só se a QA de F3/H1 mostrar que a ausência de furo real atrapalha o detalhamento.

## Faça
1. Subtração de corpo vazio cilíndrico (tubo) de parede plana (peça) por recorte do contorno da peça de parede no plano de entrada (caso específico e determinístico), em vez de CSG geral. Documente os limites.
2. Teste: parede 1 × 1 × 0,15 m com furo Ø0,1 em z = 0,3 ⇒ área do contorno = 1 − π·0,05² (±0,5 %).

## Aceitação
Furo real na parede da caixa, com corte e planta corretos.

## Arquivos permitidos
- `packages/engine/src/componentes/furoEmParede.ts` (NOVO)
- `packages/engine/src/componentes/furoEmParede.test.ts` (NOVO)

## Proibido
Qualquer arquivo fora da lista (os pontos de junção `index.ts`, `edicao.ts`, `validar.ts`, `i18n/areas/familias.ts` só aceitam linhas ADITIVAS), `crates/**` (salvo H3), `@hestia/geom`, `package.json`, testes existentes (só acrescentar), `docs/**` (salvo se listado).

## Parada
Contrato contraditório, teste que você acha errado, ou necessidade de mexer fora da lista: PARE, não improvise, e descreva no relatório.

## Entrega
Commits pequenos em português (`feat(familias): …`, `wip:` a cada marco) e o relatório de `REGRAS.md` §7 (última linha de cada comando de verificação).
