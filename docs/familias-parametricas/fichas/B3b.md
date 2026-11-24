# Ficha B3b — Planta aplica a inclinação 3D e o símbolo que substitui a geometria

Modelo: **Haiku 5.5** · Onda 4 · Depende de: B3, D2 · Base: `claude/lucid-euler-ddb7j6`

Leia primeiro `docs/familias-parametricas/REGRAS.md` e `CONTRATO.md` (§4, §7). Vale o CONTRATO se algo aqui divergir.

## Contexto
A silhueta dos corpos na planta (B3: `projetarCorposPlanta`, `planComponents*.ts`) usa o sistema da família e ignora `Component.inclinacao`; um tubo deitado (inclinação π/2) sairia com a silhueta de um tubo em pé. Além disso `Simbolo2D.substituiGeometria` (D2) não esconde a silhueta automática.

## Faça
1. Projete a malha dos corpos com a matriz 3D da instância: use `matrizDoComponente(c)` (model; 16 números em ordem de coluna) em vez de só `rotation`/espelho. Peças continuam como hoje (comportamento atual preservado quando `inclinacao` é ausente ou [0,0]).
2. Com `inclinacao` ≠ [0,0], a silhueta é a da malha transformada (tubo deitado em X ⇒ retângulo comprimento × diâmetro).
3. Quando algum símbolo resolvido da família tem `substituiGeometria` e `vistas` com `planta`, NÃO desenhe a silhueta automática nem a pegada (só os símbolos; o desenho dos símbolos é a ficha D2).
4. Testes acrescentados: tubo Ø50 × 1 m em pé inclinado 90° em torno de Y ⇒ retângulo 1 × 0,05; sem inclinação inalterado; símbolo substituindo geometria oculta a silhueta.

## Aceitação
Os três testes verdes; planta sem corpos e sem inclinação idêntica.

## Arquivos permitidos
- `packages/render/src/plan/planComponents.ts`
- `packages/render/src/plan/planComponentsGeo.ts`
- `packages/engine/src/componentes/projecaoCorposPlanta.ts`
- `packages/render/src/plan/planComponentsCorpos.test.ts` (só ACRESCENTAR)
- `packages/engine/src/componentes/projecaoCorposPlanta.test.ts` (só ACRESCENTAR)

## Proibido
Tudo fora da lista; `crates/**`; `docs/**`. Não chame ferramentas fora da ficha (nada de criar sessões ou agendar tarefas).

## Parada
Contrato contraditório ou necessidade de mexer fora da lista: PARE e relate.

## Entrega
Commits pequenos em português e o relatório de `REGRAS.md` §7.
