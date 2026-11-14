# Parede com formas, inclinada e com perfil: estado

Branch `frente/parede-formas` (sobre `integracao/massa-suplementos`). Manual: [METODOLOGIA.md](METODOLOGIA.md). Modelos: só haiku 5.5 high ou sonnet 5.5 medium (nunca fable/opus sem aprovação do dono). O dono delegou as decisões ao fiscal: sempre a opção mais profissional, registrada aqui.

## Spikes
| Spike | Resultado | Decisão |
|---|---|---|
| S2 arcos tangentes | aprovado (13 testes); área com tol 5e-4 (discretização em cordas, medido 1,3e-4) | sem F1.5; junção `butt` e tipos diferentes ficam para os testes da F1.6 |
| S3 ajuste a arcos | aprovado 9/9; elipse 16 arcos, desvio 4,94 mm; spline de 8 pontos com r ≥ 1 m usa 32 arcos (a Catmull-Rom se afasta do círculo ~8,5 mm/m) | `fitArcs` promovido a definitivo (F1.1 feita). Círculo e elipse usam forma própria, spline é só "pelos pontos clicados" |
| S4 abertura inclinada | parcial: modo inclinado ok; vertical dá recuo negativo | decisão E1 abaixo |
| S1 junção inclinada | em andamento | |

## Decisões (E = emenda)
- **E1 (S4):** modo "inclinado" em reta e em arco dentro de w² ≤ 0,4·R (fora: aviso e modo vertical); modo "vertical" com o caixilho ANCORADO NA FACE da parede (recuo ≥ 0 por construção); teste de recuo ≥ 0 nos dois modos. Padrão: janela inclinada, porta vertical.
- **E2:** junções existem em TS (`joins.ts`) e em Rust (`juncoes.rs`, porte); mudança de junção vale nas duas, com teste de paridade. O corte do vão é TS (`openingCut.ts`), o Rust só espelha.
- **E3:** o dono não quer aceites intermediários; o fiscal segue as fases sem parar, relatando só marcos e problemas reais.

## Fichas
| Ficha | Estado |
|---|---|
| F1.1 `fitArcs` | feita (spike S3 mesclado) |
| F1.2 formas → paredes | |
| F1.3 modos no `wallTool` | |
| F1.4 barra de opções, faixa, i18n | |
| F1.6 matriz de modificar | |
| F1.7 portas, IFC, e2e | |
