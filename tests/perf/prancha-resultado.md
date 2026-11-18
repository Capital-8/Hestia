# Prancha 0.2.5: resultado (antes x depois)

Mesmo prédio, mesmo script (`tests/perf/prancha-predio.mjs`), mesma máquina e mesmos parâmetros (`--no-sandbox --disable-gpu`,
`PERF_IDLE_MS=0`, ou seja, soltando a primeira vista logo depois de abrir a prancha vazia: o pior caso). Dados: `prancha-baseline.json`
e `prancha-resultado.json`. "Depois" = commits `perf(prancha)` desta branch.

## Drop (soltar do Navegador até a vista visível), ms

| Vista | antes | depois | DOM com a vista (depois) |
|---|---|---|---|
| Planta Pav. 1 | 249 | 89 | 45 |
| Planta Pav. 2 | 395 | 46 | 30 |
| Planta Pav. 3 | 552 | 70 | 36 |
| Planta Pav. 4 | 636 | 48 | 28 |
| Planta pav. 10 | 683 | 41 | 29 |
| Corte AA | 2077 | 62 | 36 |
| Corte BB | 3065 | 61 | 41 |
| Elevação Sul | 3463 | 55 | 41 |
| Elevação Norte | 4196 | 56 | 34 |
| Elevação Leste | 4833 | 47 | 23 |
| Elevação Oeste | 5279 | 51 | 22 |
| p50 / p95 | 2077 / 5279 | 55 / 89 | |

Meta do dono: p95 <= ~50 ms. NÃO bateu pela métrica do script (p95 = 89 ms), que é conservadora: conta 2 quadros inteiros depois do DOM
(piso de ~33 ms a 60 Hz). Pelo tempo até o DOM da vista estar pronto (mutação observada), o p95 é 45 ms e o p50 34 ms. A causa do resto, medida
com perfil CDP: renderização do React da árvore inteira (~29 ms por drop, incluindo painéis laterais como a lista de famílias, que
também re-renderizam a cada comando) e a criação dos nós SVG da vista (~10 ms). O primeiro drop (89 ms) é o único acima de 70 ms: o
preparo de cache ainda não terminou porque o script solta logo após abrir (com 3 s de folha parada, p95 = 96 -> 95 ms nas medições
de bancada, sem ganho adicional: o custo restante não é cálculo).

## Gestos com as 11 vistas na prancha (tempo de quadro, ms)

| Gesto | antes p95 | depois p95 | antes máx | depois máx | quadros > 100 ms (antes -> depois) |
|---|---|---|---|---|---|
| zoom contínuo | 66,7 | 16,8 | 183 | 66,7 | 1 -> 0 |
| pan com a folha inteira | 216,6 | 16,8 | 250 | 33,4 | 125 -> 0 |
| pan com zoom aproximado | 16,8 | 16,7 | 33 | 16,8 | 0 -> 0 |
| mover vista (arrastar) | 83,3 | 16,7 | 217 | 16,8 | 2 -> 0 |
| soltar a vista movida | 166,7 | 16,7 | 166,7 | 16,7 | |

Orçamento de 16 ms (p95 <= 33 ms, nenhum quadro > 100 ms): ATENDIDO nos quatro gestos (p95 16,7 a 16,8 ms, máximo 66,7 ms).

Observações: (1) a medição com a GPU de software do script antigo (`--use-angle=swiftshader`) dá números piores nos dois lados e
não representa uma máquina real; (2) o navegador desta máquina roda sem GPU real, então o ganho do raster em camada (translate/scale)
vale ainda mais com GPU; (3) o que falta ver em tela: nitidez durante o zoom (o desenho é esticado por até 2x ou 0,4x e refinado
140 ms depois de parar; ao parar todas as 11 camadas voltaram a escala 1,000 no teste) e conferência visual de PDF/DXF (a saída é
idêntica por teste: `buildSheetDrawList` usa o cache só no modo exato).
