# Prancha 0.2.5: linha de base (antes das mudanças)

Prédio: template `predio10` ("Prédio, 10 pavimentos", 20 x 13 m, 2 cortes) + 4 elevações criadas pelo script; prancha A0 com
11 vistas: plantas dos pavimentos 1 a 4, planta do pavimento 10 (cobertura), cortes AA e BB, elevações Sul, Norte, Leste e Oeste, todas 1:100.
Script: `tests/perf/prancha-predio.mjs` (Chrome headless sem GPU, `vite preview` na 4300, arraste HTML5 real do Navegador com o mouse).
Commit medido: 5b4e6daf (integracao/0.2.5). Dados completos: `prancha-baseline.json`. Máquina com 7,7 GB, outro executor ativo.

Drop = do soltar do mouse até a vista visível (2 quadros depois do DOM com a vista), ms:

| Vista | ms |
|---|---|
| Planta Pav. 1 | 249 |
| Planta Pav. 2 | 395 |
| Planta Pav. 3 | 552 |
| Planta Pav. 4 | 636 |
| Planta pav. 10 (cobertura) | 683 |
| Corte AA | 2077 |
| Corte BB | 3065 |
| Elevação Sul | 3463 |
| Elevação Norte | 4196 |
| Elevação Leste | 4833 |
| Elevação Oeste | 5279 |

p50 = 2077 ms, p95 = 5279 ms. O tempo crescia a cada vista: o `buildSheetDrawList` recalculava TODAS as vistas já na prancha
(cortes inclusive) a cada edição, e o SVG chegava a 30219 nós.

Gestos com as 11 vistas dentro (tempo de quadro, ms):

| Gesto | quadros | p50 | p95 | máx | quadros > 100 ms |
|---|---|---|---|---|---|
| zoom (roda, 80 passos) | 424 | 16,7 | 66,7 | 183 | 1 |
| pan com a folha inteira | 251 | 100 | 216,6 | 250 | 125 |
| pan com zoom aproximado | 188 | 16,7 | 16,8 | 33 | 0 |
| mover vista | 182 | 16,7 | 83,3 | 217 | 2 |

Medição com a GPU de software (SwiftShader) fica muito pior (zoom p95 550 ms, mover p95 667 ms); os números acima usam `--disable-gpu`
(raster por CPU), que é o que o script usa por padrão com `PERF_CHROME_ARGS`.
