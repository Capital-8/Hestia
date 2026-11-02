# 0048 — Tolerância do pintor da sub-etapa A2 (kernel Rust)

Data: 2026-11-02. Decisão do dono. Complementa a 0046 §2.4 e a 0047 §6.

## Contexto

A regra geral é 1e-6 m² para áreas. No pintor da A2 (`itens_pintados`), o fragmento de cada item é uma diferença booleana
de vários polígonos, comparada com o `polygon-clipping` do TS (exato, sem quantizar), que é o que o app usa hoje.
O Rust quantiza em inteiros. Medido:

- A 1 µm, ~16% dos itens passam de 1e-6 m² (até ~7e-6 m²).
- A 1 nm (`ESCALA_FINA` = 1e9) o erro cai três ordens de grandeza, mas sobra ruído topológico (peças que se encostam por uma
  aresta, vértices quase colineares) que o `polygon-clipping` mantém e o Rust funde.
- Trocar a referência por `differenceClipper` não resolve: Rust (i_overlay) e Clipper arredondam as interseções de forma
  diferente a 1 µm, e a diferença simétrica chega a 8,5e-6 m² (1,09e-5 m² contra o limite de 1,01e-5 m² da opção abaixo
  em 4 de 7 testes do wasm). Dois motores quantizados não chegam a 1e-6 m².

## Decisão

Para o fragmento do pintor da A2, e só para ele:

1. O critério bloqueante é a região: área líquida e área da diferença simétrica dentro de **1e-5 m² + 1e-6 × área**
   (as constantes do diferencial da 0045, `fixtures.ts`).
2. O pintor usa `ESCALA_FINA` = 1e9 (1 nm); as demais operações da ABI continuam a 1 µm.
3. O shape bruto continua comparado de forma estrita (1 µm de coordenada, 1e-6 m²).
4. Todos os demais campos (identidade, ordem, prioridade, espessuras, z) seguem exatos ou a 1e-6.
5. A igualdade estrita de peças e anéis é medida e reportada, sem bloquear.
6. A fração de itens em que o TS perde área em silêncio (`tsPerdeuArea`) segue contada à parte e limitada pelo teste.

Esta exceção não vale para outras operações nem para as próximas fatias: cada nova relaxação exige decisão própria.

## Pendência separada (não faz parte desta decisão)

`polygon-clipping` perde área em silêncio. Entrada mínima: `projetoDeEstresseA2(100, {paredes:60, pavimentos:1, curvas:0,
ruido:false})`, item 274 (parede 50, faixa 0): o TS perde 0,0203 m²; `differenceClipper` dá o mesmo que o Rust.
Corrigir no TS depois, em passo separado, subindo `VERSAO_MOTOR_GEOMETRIA`.
