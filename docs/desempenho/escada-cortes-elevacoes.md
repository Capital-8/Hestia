# Escadas e guarda-corpos em cortes, elevações, planta e 3D: tempo e estabilidade

Pedido do dono: escada e guarda-corpo precisam desenhar nos cortes e elevações tão rápido quanto parede e laje, e não podem travar o 3D, os cortes e as
elevações num prédio com muitas escadas. Aqui estão a medição, as causas, as correções e a prova de estabilidade. Só agregados: nenhum projeto real
aparece neste documento.

## Como medir

- `scripts/bench-escada-vistas.mts` (`npx vite-node scripts/bench-escada-vistas.mts 1,10,50,100`; `BENCH_TIPOS=...` escolhe os tipos, `BENCH_REP` as repetições):
  projetos sintéticos com N elementos do tipo, espalhados em até 10 níveis de alturas iguais, kernel Rust ligado como no app (fatias A e B e guarda-corpo).
  Mediana de 3 repetições, em ms, em Node (sem GPU, sem pintura). Colunas: corte longitudinal, corte transversal e elevação (motor + lista de desenho,
  projeto novo, "frio"), redesenho da elevação sobre o mesmo projeto (pan, zoom, hover: "quente"), planta de um nível (frio) e cena 3D inteira (frio).
- `scripts/equiv-escada-vistas.mts`: fotografia determinística (cortes, elevação, quantitativos, avisos, corpo e acabamentos de cada escada). Gerada antes e depois
  das otimizações, saiu byte a byte igual (11 tipos de elemento, 6 de cada).

## Tempos antes e depois (ms)

Escada com acabamento = piso 1,5 cm, espelho 1 cm e bocel 2 cm. `+gc` = guarda-corpo hospedado dos dois lados; `gc-manual` = guarda-corpo manual de 5 m.
"Elevação" é a coluna principal; as demais mostram antes → depois.

| Tipo | N | Elevação antes | Elevação depois | Corte long. antes → depois | Corte transv. antes → depois | Redesenho (quente) antes → depois | Planta antes → depois | 3D antes → depois | Elevação ms/elemento (depois) |
|---|---|---|---|---|---|---|---|---|---|
| parede | 1 | 6 | 4 | 5 → 3 | 5 → 3 | 1 → 1 | 9 → 5 | 11 → 7 | 3.8 |
| parede | 10 | 25 | 15 | 36 → 12 | 23 → 15 | 6 → 5 | 15 → 8 | 57 → 25 | 1.5 |
| parede | 50 | 77 | 31 | 69 → 34 | 55 → 33 | 19 → 11 | 44 → 25 | 99 → 39 | 0.6 |
| parede | 100 | 101 | 56 | 122 → 69 | 89 → 53 | 40 → 16 | 76 → 42 | 188 → 71 | 0.6 |
| laje | 1 | 3 | 2 | 3 → 2 | 2 → 2 | 1 → 0 | 5 → 4 | 7 → 5 | 2.4 |
| laje | 10 | 9 | 7 | 6 → 7 | 4 → 5 | 3 → 1 | 7 → 5 | 22 → 14 | 0.7 |
| laje | 50 | 15 | 10 | 25 → 17 | 11 → 13 | 8 → 7 | 9 → 8 | 35 → 26 | 0.2 |
| laje | 100 | 44 | 16 | 56 → 35 | 14 → 8 | 16 → 8 | 11 → 8 | 53 → 28 | 0.2 |
| reta | 1 | 11 | 4 | 10 → 4 | 8 → 3 | 3 → 1 | 12 → 5 | 29 → 14 | 3.8 |
| reta | 10 | 52 | 19 | 54 → 21 | 32 → 15 | 12 → 9 | 8 → 6 | 126 → 67 | 1.9 |
| reta | 50 | 198 | 73 | 288 → 97 | 175 → 50 | 72 → 25 | 20 → 8 | 466 → 205 | 1.5 |
| reta | 100 | 336 | 131 | 535 → 259 | 281 → 101 | 104 → 55 | 30 → 12 | 1222 → 435 | 1.3 |
| L | 1 | 7 | 3 | 7 → 3 | 8 → 3 | 2 → 1 | 9 → 4 | 18 → 8 | 2.6 |
| L | 10 | 26 | 30 | 39 → 37 | 25 → 17 | 15 → 8 | 5 → 5 | 86 → 60 | 3.0 |
| L | 50 | 239 | 89 | 263 → 125 | 143 → 59 | 96 → 39 | 20 → 9 | 517 → 204 | 1.8 |
| L | 100 | 537 | 309 | 836 → 410 | 417 → 223 | 191 → 132 | 41 → 24 | 1372 → 571 | 3.1 |
| livre | 1 | 4 | 7 | 5 → 8 | 7 → 6 | 1 → 2 | 5 → 7 | 13 → 13 | 7.0 |
| livre | 10 | 25 | 45 | 30 → 38 | 20 → 26 | 9 → 29 | 4 → 7 | 83 → 90 | 4.5 |
| livre | 50 | 130 | 176 | 205 → 217 | 96 → 105 | 72 → 84 | 11 → 13 | 415 → 355 | 3.5 |
| livre | 100 | 554 | 319 | 674 → 512 | 311 → 230 | 132 → 144 | 32 → 26 | 1194 → 772 | 3.2 |
| reta+acab | 1 | 26 | 21 | 31 → 35 | 22 → 18 | 10 → 8 | 13 → 14 | 62 → 47 | 21.1 |
| reta+acab | 10 | 301 | 167 | 211 → 178 | 161 → 105 | 112 → 69 | 16 → 11 | 508 → 353 | 16.7 |
| reta+acab | 50 | 910 | 709 | 1165 → 1017 | 560 → 420 | 577 → 320 | 30 → 42 | 2057 → 1739 | 14.2 |
| reta+acab | 100 | 2961 | 1348 | 2480 → 2468 | 962 → 788 | 2410 → 655 | 96 → 84 | 6601 → 3333 | 13.5 |
| L+acab | 1 | 19 | 13 | 25 → 16 | 33 → 16 | 15 → 5 | 15 → 11 | 97 → 33 | 13.5 |
| L+acab | 10 | 233 | 115 | 208 → 230 | 181 → 84 | 136 → 50 | 13 → 11 | 593 → 285 | 11.5 |
| L+acab | 50 | 1463 | 635 | 1368 → 819 | 771 → 422 | 1005 → 306 | 54 → 43 | 3176 → 1684 | 12.7 |
| L+acab | 100 | 4582 | 1347 | 3486 → 1858 | 1708 → 910 | 3424 → 606 | 101 → 87 | 6494 → 3278 | 13.5 |
| livre+acab | 1 | 49 | 29 | 55 → 22 | 24 → 19 | 12 → 5 | 25 → 15 | 164 → 41 | 28.9 |
| livre+acab | 10 | 185 | 125 | 224 → 138 | 135 → 86 | 123 → 49 | 16 → 11 | 575 → 316 | 12.5 |
| livre+acab | 50 | 1449 | 613 | 2781 → 756 | 1463 → 418 | 1752 → 275 | 54 → 38 | 4207 → 1401 | 12.3 |
| livre+acab | 100 | 3860 | 663 | 3140 → 1162 | 1474 → 446 | 3122 → 255 | 180 → 37 | 6090 → 1538 | 6.6 |
| reta+gc | 1 | 10 | 5 | 10 → 7 | 10 → 6 | 2 → 1 | 12 → 9 | 105 → 50 | 5.1 |
| reta+gc | 10 | 58 | 42 | 62 → 31 | 46 → 23 | 12 → 7 | 36 → 11 | 656 → 126 | 4.2 |
| reta+gc | 50 | 427 | 104 | 353 → 165 | 240 → 80 | 51 → 36 | 176 → 55 | 3150 → 874 | 2.1 |
| reta+gc | 100 | 541 | 189 | 653 → 315 | 473 → 141 | 134 → 65 | 405 → 95 | 13296 → 1774 | 1.9 |
| L+gc | 1 | 16 | 8 | 13 → 6 | 10 → 4 | 3 → 1 | 15 → 8 | 268 → 32 | 7.8 |
| L+gc | 10 | 67 | 25 | 77 → 37 | 57 → 17 | 23 → 14 | 47 → 15 | 1991 → 290 | 2.5 |
| L+gc | 50 | 410 | 114 | 576 → 202 | 327 → 84 | 188 → 53 | 201 → 63 | 10415 → 1319 | 2.3 |
| L+gc | 100 | 1010 | 244 | 1003 → 316 | 550 → 137 | 451 → 133 | 405 → 117 | 20895 → 2646 | 2.4 |
| gc-manual | 1 | 6 | 2 | 12 → 3 | 7 → 3 | 1 → 0 | 9 → 8 | 58 → 9 | 2.4 |
| gc-manual | 10 | 11 | 6 | 11 → 8 | 8 → 6 | 3 → 1 | 8 → 4 | 549 → 48 | 0.6 |
| gc-manual | 50 | 24 | 10 | 23 → 9 | 11 → 7 | 10 → 3 | 14 → 5 | 2364 → 270 | 0.2 |
| gc-manual | 100 | 25 | 12 | 20 → 11 | 17 → 9 | 7 → 4 | 14 → 6 | 4909 → 636 | 0.1 |


### Custo por elemento (elevação, N = 100, depois)

- parede 0,6 ms, laje 0,2 ms;
- escada reta 1,3 ms, em L 3,1 ms, livre 3,2 ms (mesma ordem de grandeza da parede);
- escada com acabamento 7 a 13 ms (antes 30 a 46 ms): ainda 10 a 20 vezes a parede, porque cada piso, espelho e bocel é um bloco próprio no corte e passa pela oclusão. Cresce
  linear com N (sem a explosão quadrática de antes) e 50 escadas acabadas desenham a elevação em cerca de 0,6 s, abaixo da meta de 2 s;
- escada com guarda-corpo 1,9 a 2,4 ms; guarda-corpo manual 0,1 ms.

## Causas encontradas e correções (todas na origem, geometria idêntica)

| Causa | Onde | Correção |
|---|---|---|
| A oclusão do corte comparava cada item com TODAS as partes visíveis anteriores (O(n²) em caixas); com acabamentos são milhares de peças por vista. | `engine/sectionOcclusion.ts` | Grade espacial por caixa (mesmo conjunto e mesma ordem de oclusores). Teste de equivalência contra a varredura original (`sectionOcclusionGrade.test.ts`). |
| O modelo de acabamentos (`stairFinishModel`) tem cache por IDENTIDADE da escada resolvida; o desenho cria uma cópia rasa (sem os erros de norma) e o cache errava a cada vista (corte, elevação, 3D, planta). | `engine/stairFinish.ts`, `stairBody.ts` | A cópia aponta para a escada original (`declararCopiaDeEscada`); o corpo de desenho também ganha cache por escada e parâmetros. |
| Editar qualquer coisa (até uma parede distante) re-resolvia todas as escadas do projeto, pois o cache era por objeto de projeto. | `engine/stairs.ts` | Cache pela identidade do objeto `Stair` mais tipo, cotas e nível de topo (o Immer mantém o objeto do que não mudou): a escada resolvida continua a MESMA. |
| O validador de norma calculava o volume do corpo e dos acabamentos só para ler o piso médio de cada lance. | `engine/stairQuantities.ts`, `stairIssues.ts` | `stairRunQuantities` (só degraus e espelhos). |
| Validação do croqui comparava todos os pares de espelhos com distância exata de polilinhas. | `engine/stairSketchValidate.ts` | Descarta pares cujas caixas estão a mais que a tolerância (a distância nunca é menor que a das caixas). |
| `THREE.EdgesGeometry` (hash em texto por vértice e aresta) levava segundos nas arestas do guarda-corpo (~9 mil triângulos por guarda-corpo) e dos lotes; a juntada dos lotes fazia milhões de `push`. | `render/model3d/arestasRapidas3d.ts`, `lotesMalha3d.ts` | Mesmo critério e mesma saída (testado contra o three em `arestasRapidas3d.test.ts`), com tabelas numéricas; juntada com vetores do tamanho final. 3D com 100 escadas em L com guarda-corpo: 20,9 s → 2,6 s. |
| `splitRingEdges` do 3D da escada varria todos os vértices por aresta. | `render/model3d/stairSolids.ts` | Grade de vértices, mesma ordem (`splitRingEdges.test.ts` compara com a varredura completa). |
| No prédio de teste, uma elevação com escadas em vários níveis levava 8 s: a diferença do kernel Rust com dezenas de oclusores cheios de frestas finas custa 150 a 250 ms por peça (os mesmos oclusores em lotes de 4 custam 3 ms). | `engine/sectionOcclusion.ts` | Subtração em lotes de 4 acima de 8 oclusores; a região é a mesma (testado); só a ordem dos vértices pode mudar. Elevação do prédio com 28 escadas inseridas: 8 s → 2 s (a mesma elevação sem escadas: 0,8 s). Pendência: o ideal é corrigir a passada única no kernel (`crates/geom-wasm/src/ops.rs`, `diferenca`), que exige recompilar o wasm. |

## Estabilidade

`tests/helpers/estabilidadeEscadas.ts` monta o cenário (sem projeto real) e é usado por:

- `tests/estabilidade-escadas.test.ts` (suíte padrão, cerca de 40 s) e `tests/kernel-gc-estabilidade.wasm.test.ts` (`npm run test:wasm`, Rust real com guarda-corpo, cerca de 40 s):
  prédio de 4 níveis de alturas diferentes; escadas retas, L, U e livres, com e sem acabamento e bocel, guarda-corpo hospedado dos dois lados, sobrepostas e ligando níveis
  não vizinhos; cada ciclo abre 3D (inteiro, ocultando metade, isolando um, voltando), plantas, 2 cortes longitudinais, 2 transversais e 4 elevações (completos e incrementais, com ocultos),
  move e copia 6 escadas com guarda-corpo, desfaz e refaz em lote, salva, reabre e exporta IFC. Confere: sem exceção, nenhum passo acima de 2 s, resumo de conteúdo idêntico em duas
  execuções, desfazer devolve o estado exato e heap estável depois de 5 ciclos (cerca de 104 MB, +1 MB).
- `scripts/estabilidade-predio.mts caminho/da/copia.json [ciclos] [escadasPorNivel]`: o mesmo cenário em escala cheia sobre uma CÓPIA de projeto real (imprime só agregados).

### Prédio real (cópia; 11 níveis, 2134 elementos, mais 28 escadas e 34 guarda-corpos inseridos por comando)

Nenhuma exceção em 3 ciclos completos; heap estável (405, 406, 406 MB); desfazer/refazer em lote exatos; arquivo salvo e reaberto com os mesmos elementos.
Maior tempo por passo (ms), antes e depois da correção da subtração em lotes (o mesmo prédio sem nenhuma escada nova, só as 8 originais, entre parênteses):

| Passo | Antes | Depois | Sem escadas novas |
|---|---|---|---|
| Elevação (uma das 4) | 10 700 | 1 900 a 2 200 | 1 000 a 1 150 |
| Corte incremental (uma linha) | 9 600 a 10 500 | 1 700 a 1 900 | 1 000 a 1 200 |
| Corte longitudinal ou transversal | 640 a 1 200 | 780 a 930 | 1 000 a 1 100 |
| 3D: abrir (já com o kernel quente) | 1 700 | 1 700 a 1 800 | 1 800 |
| 3D: ocultando metade / voltando | 2 700 a 3 100 / 2 400 a 2 800 | 2 600 a 3 100 / 2 400 a 2 800 | 2 100 a 2 800 / 2 000 |
| Planta (um nível) | 170 a 340 | 160 a 300 | 200 a 300 |
| Mover, copiar, desfazer, refazer, salvar, reabrir | menos de 30 | menos de 30 | menos de 30 |
| Exportar IFC | 4 500 a 5 200 | 3 700 a 4 600 | 2 700 a 3 200 |

A primeira abertura do 3D do processo (8 s) é o carregamento frio do módulo e do wasm, igual com e sem escadas novas.

Pendências que NÃO vêm das escadas (medidas no prédio sem escadas novas): ocultar e voltar no 3D de um prédio de 11 níveis levam 2 a 3 s e o IFC cerca de 3 s; a
elevação de 11 níveis, 1 s. As escadas novas somam cerca de 1 s à elevação e à exportação IFC. Escada com acabamento segue 10 a 20 vezes mais cara por elemento que
uma parede (um bloco por piso, espelho e bocel).

Limites desta rodada: medição em Node com o Rust real, sem GPU nem pintura; não houve validação com prints no navegador.
