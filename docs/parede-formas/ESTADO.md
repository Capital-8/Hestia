# Parede com formas, inclinada e com perfil: estado

Branch `frente/parede-formas` (sobre `integracao/massa-suplementos`). Manual: [METODOLOGIA.md](METODOLOGIA.md). Modelos: só haiku 5.5 high ou sonnet 5.5 medium (nunca fable/opus sem aprovação do dono). O dono delegou as decisões ao fiscal: sempre a opção mais profissional, registrada aqui.

## Spikes
| Spike | Resultado | Decisão |
|---|---|---|
| S2 arcos tangentes | aprovado (13 testes); área com tol 5e-4 (discretização em cordas, medido 1,3e-4) | sem F1.5; junção `butt` e tipos diferentes ficam para os testes da F1.6 |
| S3 ajuste a arcos | aprovado 9/9; elipse 16 arcos, desvio 4,94 mm; spline de 8 pontos com r ≥ 1 m usa 32 arcos (a Catmull-Rom se afasta do círculo ~8,5 mm/m) | `fitArcs` promovido a definitivo (F1.1 feita). Círculo e elipse usam forma própria, spline é só "pelos pontos clicados" |
| S4 abertura inclinada | parcial: modo inclinado ok; vertical dá recuo negativo | decisão E1 abaixo |
| S1 junção inclinada | reta×reta aprovado (20 testes; volume exato 1,7e-15; 0,4 a 0,7 ms/par); arco reprovado (erro de volume até 6,7%; nenhum N ≤ 32 garante < 1 mm) | decisão E4 abaixo |

## Decisões (E = emenda)
- **E1 (S4):** modo "inclinado" em reta e em arco dentro de w² ≤ 0,4·R (fora: aviso e modo vertical); modo "vertical" com o caixilho ANCORADO NA FACE da parede (recuo ≥ 0 por construção); teste de recuo ≥ 0 nos dois modos. Padrão: janela inclinada, porta vertical.
- **E2:** junções existem em TS (`joins.ts`) e em Rust (`juncoes.rs`, porte); mudança de junção vale nas duas, com teste de paridade. O corte do vão é TS (`openingCut.ts`), o Rust só espelha.
- **E4 (S1):** junção inclinada exata em reta×reta (dois níveis + faces regradas). Arco inclinado: plano B, corte de topo simples com aviso `arcoInclinadoSemJuncao`; a junção exata cone×plano em arco vira ficha de dívida D1 depois da Fase 2. Validação obrigatória na F2.1/F2.4: tilt×altura×comprimento, porque 26% dos pares retos do fuzz têm o cruzamento dos eixos fora da parede (inviáveis); o comando recusa com mensagem traduzida em vez de gerar geometria inválida.
- **E3:** o dono não quer aceites intermediários; o fiscal segue as fases sem parar, relatando só marcos e problemas reais.

## Fichas
| Ficha | Estado |
|---|---|
| F1.1 `fitArcs` | feita (spike S3 mesclado) |
| F1.2 formas → paredes | feita |
| F1.3 modos no `wallTool` | feita |
| F1.4 barra de opções, faixa, i18n | |
| F1.6 matriz de modificar | |
| F1.7 portas, IFC, e2e | |

## F1.2/F1.3
- `wallShapes.ts` (puro): polígono (3 a 64 lados, inscrito/circunscrito), círculo (2 arcos, |sag|=r), elipse e spline via `fitArcs`; contornos fechados saem HORÁRIOS (face externa à esquerda de a→b, `flipped=false`), diferente do retângulo (anti-horário + `flipped`). Degenerado devolve `[]`.
- Modos `polygon|circle|ellipse|spline` em `wallShape`; opções novas opcionais `wallPolygonSides` (6), `wallPolygonCircumscribed` (false), `wallFitTol` (0,005); a F1.4 liga a barra a elas.
- Cada forma = UMA transação (um desfazer); qualquer lado curto (<1 cm) ou sobreposto recusa a forma inteira (decisão 0044). Esc cancela; elipse = centro, ponta do semieixo, ponto do outro semieixo; spline = cliques, Enter termina aberta, clique no 1º ponto fecha.
- Prévia de spline usa tol >= 2 cm e 16 arcos (o ajuste final custa ~1 s); mensagens novas em português literal, sem chaves i18n (F1.4).
- Fora do escopo: `packages/geom/src/index.ts` ganhou `export * from './curveFit.ts'` (fitArcs não era exportado).
