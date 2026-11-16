# Diagnóstico X1: encontro no meio do eixo (T) e cruzamento (X) com arco inclinado

Gerado por `packages/render/src/model3d/wallTiltX1.test.ts` (`HESTIA_X1_TABELA=1 HESTIA_X1_SAIDA=arquivo`). H = 3 m, hospedeira em arco R = 5 (centro (4, 0), meio do eixo em (-1, 0)) ou reta; ramo reta ou arco; camada única de 0,2 m ("0,2") e parede multicamada padrão ("alv14"). Cotas z = 0,01 | 0,497·H | H−0,01 (o meio fica fora dos níveis da malha). Valores em mm (fresta / sobreposição da tampa do ramo contra a hospedeira); cobertura em cm² contra a soma das paredes sozinhas (`vazio` = existia sozinha e não existe na junção; `exc` = a junção estende o ramo até a hospedeira, esperado).

## Causa confirmada
A hipótese inicial (T com anfitrião em arco não detectado) foi REFUTADA: `tiltRelations` já emite `tee` com arco e `levelSet`/`buttAgainst` já cortam o ramo pela face do anfitrião em cada nível (camada única: fresta e sobreposição ≤ 1,1 mm, a sagitta da corda da tampa). O defeito do dono é o **X (cruzamento)**: o pintor vertical (`paint`, resolve.ts) faz uma das paredes ceder a área do cruzamento à outra NA PLANTA DA BASE; com inclinação cada parede se desloca d(z)=z·tanθ para um lado diferente, e o furo de uma não é mais coberto pela outra (vazio de 0,04 a 0,06 m² por cota, a parede fica ABERTA, em desencontro). Defeitos secundários do T em arco com multicamada: (a) a reamostragem angular de `alinharNivel` mantinha as pontas de corda da hospedeira quase paradas enquanto o ramo desliza ao longo da face (bolsão de acabamento de 11 a 23 mm); (b) as faces da hospedeira não partiam nas cotas dos níveis do ramo; (c) a chave de cache do sólido não via os níveis da vizinha.

## ANTES (versão original; a coluna de cobertura de X era a única disponível; a cobertura de T não valia)
## T (fresta / sobreposição em mm; z = 0,01 | 0,497·H | H−0,01)
| Caso | Camadas | Tilts hosp/ramo | z baixo | z meio | z topo | Avisos |
|---|---|---|---|---|---|---|
| T1 reta→arco, lado convexo | 0,2 | 15/15 | 0.027 / 0.027 (vazio 0 cm², exc 0) | 0.310 / 0.778 (vazio 663 cm², exc 0) | 0.000 / 0.000 (vazio 1475 cm², exc 0) | - |
| T1 reta→arco, lado convexo | alv14 | 15/15 | 0.024 / 0.026 (vazio 0 cm², exc 0) | 0.313 / 0.350 (vazio 525 cm², exc 0) | 0.000 / 0.000 (vazio 1156 cm², exc 0) | - |
| T1 reta→arco, lado convexo | 0,2 | -10/-10 | 0.011 / 0.015 (vazio 0 cm², exc 0) | 0.142 / 0.949 (vazio 0 cm², exc 300) | 0.100 / 1.042 (vazio 0 cm², exc 894) | - |
| T1 reta→arco, lado convexo | alv14 | -10/-10 | 0.001 / 0.023 (vazio 0 cm², exc 0) | 0.208 / 0.485 (vazio 6 cm², exc 338) | 0.138 / 0.503 (vazio 0 cm², exc 788) | - |
| T1 reta→arco, lado convexo | 0,2 | 15/-10 | 0.012 / 0.012 (vazio 0 cm², exc 0) | 0.284 / 0.876 (vazio 600 cm², exc 0) | 0.000 / 0.000 (vazio 1369 cm², exc 0) | - |
| T1 reta→arco, lado convexo | alv14 | 15/-10 | 0.002 / 0.023 (vazio 0 cm², exc 0) | 0.308 / 0.378 (vazio 613 cm², exc 0) | 0.000 / 0.000 (vazio 1219 cm², exc 0) | - |
| T1 reta→arco, lado convexo | 0,2 | -20/30 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 1269) | 0.000 / 0.000 (vazio 0 cm², exc 3056) | - |
| T1 reta→arco, lado convexo | alv14 | -20/30 | 0.099 / 0.060 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 1031) | 0.000 / 0.000 (vazio 0 cm², exc 3081) | - |
| T1 reta→arco, lado convexo | 0,2 | 0/15 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.105 / 1.003 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | - |
| T1 reta→arco, lado convexo | alv14 | 0/15 | 0.027 / 0.026 (vazio 0 cm², exc 0) | 0.177 / 0.498 (vazio 0 cm², exc 0) | 0.276 / 0.011 (vazio 0 cm², exc 0) | - |
| T1 reta→arco, lado convexo | 0,2 | 15/0 | 0.001 / 0.000 (vazio 0 cm², exc 0) | 0.149 / 0.000 (vazio 600 cm², exc 0) | 0.000 / 0.000 (vazio 1400 cm², exc 0) | - |
| T1 reta→arco, lado convexo | alv14 | 15/0 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.029 / 0.007 (vazio 569 cm², exc 0) | 0.000 / 0.006 (vazio 1269 cm², exc 0) | - |
| T1 reta→arco, lado convexo | 0,2 | 0/0 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | - |
| T1 reta→arco, lado convexo | alv14 | 0/0 | 0.000 / 2.000 (vazio 0 cm², exc 0) | 0.000 / 2.000 (vazio 0 cm², exc 0) | 0.000 / 2.000 (vazio 0 cm², exc 0) | - |
| T1 reta→arco, lado côncavo | 0,2 | 15/15 | 0.028 / 0.028 (vazio 0 cm², exc 0) | 0.885 / 0.193 (vazio 0 cm², exc 663) | 0.000 / 0.000 (vazio 0 cm², exc 1475) | - |
| T1 reta→arco, lado côncavo | alv14 | 15/15 | 2.651 / 0.011 (vazio 0 cm², exc 0) | 0.000 / 0.312 (vazio 44 cm², exc 525) | 0.000 / 0.000 (vazio 44 cm², exc 1156) | - |
| T1 reta→arco, lado côncavo | 0,2 | -10/-10 | 0.013 / 0.012 (vazio 0 cm², exc 0) | 1.079 / 0.025 (vazio 306 cm², exc 0) | 1.091 / 0.137 (vazio 894 cm², exc 0) | - |
| T1 reta→arco, lado côncavo | alv14 | -10/-10 | 1.723 / 0.001 (vazio 0 cm², exc 0) | 0.000 / 0.246 (vazio 369 cm², exc 0) | 0.000 / 0.238 (vazio 819 cm², exc 0) | - |
| T1 reta→arco, lado côncavo | 0,2 | 15/-10 | 0.012 / 0.013 (vazio 0 cm², exc 0) | 0.810 / 0.303 (vazio 0 cm², exc 600) | 0.677 / 0.318 (vazio 0 cm², exc 1362) | - |
| T1 reta→arco, lado côncavo | alv14 | 15/-10 | 1.793 / 0.002 (vazio 0 cm², exc 0) | 0.000 / 0.299 (vazio 44 cm², exc 613) | 0.000 / 0.163 (vazio 44 cm², exc 1219) | - |
| T1 reta→arco, lado côncavo | 0,2 | -20/30 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 1275 cm², exc 31) | 0.000 / 0.000 (vazio 3056 cm², exc 0) | - |
| T1 reta→arco, lado côncavo | alv14 | -20/30 | 6.182 / 0.022 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 1063 cm², exc 0) | 0.000 / 0.000 (vazio 3112 cm², exc 0) | - |
| T1 reta→arco, lado côncavo | 0,2 | 0/15 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | - |
| T1 reta→arco, lado côncavo | alv14 | 0/15 | 0.552 / 0.000 (vazio 0 cm², exc 0) | 0.045 / 0.000 (vazio 38 cm², exc 0) | 0.019 / 0.286 (vazio 38 cm², exc 0) | - |
| T1 reta→arco, lado côncavo | 0,2 | 15/0 | 0.000 / 0.001 (vazio 0 cm², exc 0) | 0.000 / 0.159 (vazio 0 cm², exc 600) | 0.000 / 0.309 (vazio 0 cm², exc 1400) | - |
| T1 reta→arco, lado côncavo | alv14 | 15/0 | 0.049 / 0.001 (vazio 0 cm², exc 0) | 5.654 / 0.077 (vazio 13 cm², exc 569) | 11.377 / 0.150 (vazio 13 cm², exc 1269) | - |
| T1 reta→arco, lado côncavo | 0,2 | 0/0 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | - |
| T1 reta→arco, lado côncavo | alv14 | 0/0 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | - |
| T2 arco→reta, lado esquerdo | 0,2 | 15/15 | 0.000 / 0.000 (vazio 0 cm², exc 6) | 0.000 / 0.000 (vazio 575 cm², exc 13) | 0.000 / 0.000 (vazio 1412 cm², exc 0) | - |
| T2 arco→reta, lado esquerdo | alv14 | 15/15 | 0.143 / 0.000 (vazio 0 cm², exc 0) | 11.536 / 0.000 (vazio 569 cm², exc 0) | 0.000 / 0.000 (vazio 1344 cm², exc 0) | - |
| T2 arco→reta, lado esquerdo | 0,2 | -10/-10 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 6 cm², exc 300) | 0.000 / 0.000 (vazio 0 cm², exc 888) | - |
| T2 arco→reta, lado esquerdo | alv14 | -10/-10 | 0.071 / 0.000 (vazio 0 cm², exc 0) | 7.267 / 0.000 (vazio 6 cm², exc 300) | 0.156 / 0.000 (vazio 0 cm², exc 763) | - |
| T2 arco→reta, lado esquerdo | 0,2 | 15/-10 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 619 cm², exc 0) | 0.000 / 0.000 (vazio 1412 cm², exc 0) | - |
| T2 arco→reta, lado esquerdo | alv14 | 15/-10 | 5.701 / 0.000 (vazio 0 cm², exc 0) | 0.051 / 0.000 (vazio 650 cm², exc 6) | 0.000 / 0.000 (vazio 1400 cm², exc 0) | - |
| T2 arco→reta, lado esquerdo | 0,2 | -20/30 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 1100) | 0.000 / 0.000 (vazio 13 cm², exc 2350) | - |
| T2 arco→reta, lado esquerdo | alv14 | -20/30 | 0.277 / 0.034 (vazio 0 cm², exc 0) | 20.300 / 2.975 (vazio 6 cm², exc 906) | 0.000 / 0.000 (vazio 6 cm², exc 2237) | - |
| T2 arco→reta, lado esquerdo | 0,2 | 0/15 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 31 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | - |
| T2 arco→reta, lado esquerdo | alv14 | 0/15 | 0.000 / 0.011 (vazio 0 cm², exc 0) | 0.021 / 1.606 (vazio 0 cm², exc 0) | 0.005 / 3.218 (vazio 6 cm², exc 0) | - |
| T2 arco→reta, lado esquerdo | 0,2 | 15/0 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 581 cm², exc 0) | 0.000 / 0.000 (vazio 1387 cm², exc 0) | - |
| T2 arco→reta, lado esquerdo | alv14 | 15/0 | 5.015 / 0.000 (vazio 0 cm², exc 0) | 0.061 / 0.000 (vazio 619 cm², exc 0) | 0.113 / 0.000 (vazio 1356 cm², exc 13) | - |
| T2 arco→reta, lado esquerdo | 0,2 | 0/0 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | - |
| T2 arco→reta, lado esquerdo | alv14 | 0/0 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | - |
| T2 arco→reta, lado direito | 0,2 | 15/15 | 0.000 / 0.000 (vazio 0 cm², exc 6) | 0.000 / 0.000 (vazio 0 cm², exc 688) | 0.000 / 0.000 (vazio 0 cm², exc 1506) | - |
| T2 arco→reta, lado direito | alv14 | 15/15 | 0.168 / 0.020 (vazio 0 cm², exc 0) | 13.205 / 2.973 (vazio 6 cm², exc 575) | 0.000 / 0.000 (vazio 0 cm², exc 1331) | - |
| T2 arco→reta, lado direito | 0,2 | -10/-10 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 356 cm², exc 0) | 0.000 / 0.000 (vazio 906 cm², exc 0) | - |
| T2 arco→reta, lado direito | alv14 | -10/-10 | 0.085 / 0.000 (vazio 0 cm², exc 0) | 8.686 / 0.000 (vazio 350 cm², exc 0) | 0.000 / 0.000 (vazio 838 cm², exc 0) | - |
| T2 arco→reta, lado direito | 0,2 | 15/-10 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 13 cm², exc 550) | 0.000 / 0.000 (vazio 0 cm², exc 1394) | - |
| T2 arco→reta, lado direito | alv14 | 15/-10 | 5.671 / 0.015 (vazio 0 cm², exc 0) | 0.000 / 2.193 (vazio 38 cm², exc 606) | 0.000 / 4.074 (vazio 38 cm², exc 1281) | - |
| T2 arco→reta, lado direito | 0,2 | -20/30 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 981 cm², exc 0) | 0.000 / 0.000 (vazio 2206 cm², exc 0) | - |
| T2 arco→reta, lado direito | alv14 | -20/30 | 0.213 / 0.001 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 919 cm², exc 0) | 0.000 / 0.000 (vazio 2044 cm², exc 0) | - |
| T2 arco→reta, lado direito | 0,2 | 0/15 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | - |
| T2 arco→reta, lado direito | alv14 | 0/15 | 0.000 / 0.011 (vazio 0 cm², exc 0) | 0.021 / 1.606 (vazio 0 cm², exc 0) | 0.005 / 3.218 (vazio 6 cm², exc 0) | - |
| T2 arco→reta, lado direito | 0,2 | 15/0 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 575) | 0.000 / 0.000 (vazio 0 cm², exc 1381) | - |
| T2 arco→reta, lado direito | alv14 | 15/0 | 4.988 / 0.020 (vazio 0 cm², exc 0) | 0.000 / 2.616 (vazio 38 cm², exc 550) | 0.000 / 4.930 (vazio 38 cm², exc 1281) | - |
| T2 arco→reta, lado direito | 0,2 | 0/0 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | - |
| T2 arco→reta, lado direito | alv14 | 0/0 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | - |
| T3 arco→arco, lado convexo | 0,2 | 15/15 | 0.026 / 0.027 (vazio 0 cm², exc 6) | 0.180 / 0.980 (vazio 475 cm², exc 0) | 0.000 / 0.000 (vazio 1144 cm², exc 0) | - |
| T3 arco→arco, lado convexo | alv14 | 15/15 | 2.154 / 0.016 (vazio 0 cm², exc 0) | 0.232 / 0.489 (vazio 494 cm², exc 0) | 0.000 / 0.000 (vazio 1094 cm², exc 0) | - |
| T3 arco→arco, lado convexo | 0,2 | -10/-10 | 0.013 / 0.014 (vazio 0 cm², exc 0) | 0.116 / 0.984 (vazio 6 cm², exc 256) | 0.260 / 0.847 (vazio 0 cm², exc 763) | - |
| T3 arco→arco, lado convexo | alv14 | -10/-10 | 1.475 / 0.017 (vazio 0 cm², exc 0) | 0.192 / 0.445 (vazio 44 cm², exc 250) | 0.261 / 0.273 (vazio 38 cm², exc 731) | - |
| T3 arco→arco, lado convexo | 0,2 | 15/-10 | 0.027 / 0.026 (vazio 0 cm², exc 0) | 0.294 / 0.864 (vazio 681 cm², exc 0) | 0.000 / 0.000 (vazio 1525 cm², exc 0) | - |
| T3 arco→arco, lado convexo | alv14 | 15/-10 | 2.309 / 0.017 (vazio 0 cm², exc 0) | 0.315 / 0.351 (vazio 663 cm², exc 0) | 0.000 / 0.000 (vazio 1450 cm², exc 0) | - |
| T3 arco→arco, lado convexo | 0,2 | -20/30 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 1525) | 0.000 / 0.000 (vazio 0 cm², exc 3762) | - |
| T3 arco→arco, lado convexo | alv14 | -20/30 | 0.125 / 0.172 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 44 cm², exc 1437) | 0.000 / 0.000 (vazio 31 cm², exc 3531) | - |
| T3 arco→arco, lado convexo | 0,2 | 0/15 | 0.000 / 0.000 (vazio 0 cm², exc 6) | 0.002 / 0.023 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 13 cm², exc 188) | - |
| T3 arco→arco, lado convexo | alv14 | 0/15 | 0.560 / 0.022 (vazio 0 cm², exc 0) | 0.205 / 0.008 (vazio 50 cm², exc 0) | 0.243 / 0.015 (vazio 44 cm², exc 188) | - |
| T3 arco→arco, lado convexo | 0,2 | 15/0 | 0.010 / 0.008 (vazio 0 cm², exc 0) | 1.073 / 0.907 (vazio 594 cm², exc 0) | 0.000 / 0.000 (vazio 1425 cm², exc 0) | - |
| T3 arco→arco, lado convexo | alv14 | 15/0 | 0.551 / 0.005 (vazio 0 cm², exc 0) | 23.311 / 0.428 (vazio 613 cm², exc 0) | 0.000 / 0.198 (vazio 1400 cm², exc 0) | - |
| T3 arco→arco, lado convexo | 0,2 | 0/0 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | - |
| T3 arco→arco, lado convexo | alv14 | 0/0 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | - |
| T3 arco→arco, lado côncavo | 0,2 | 15/15 | 0.028 / 0.028 (vazio 0 cm², exc 0) | 0.798 / 0.291 (vazio 0 cm², exc 675) | 0.000 / 0.000 (vazio 0 cm², exc 1506) | - |
| T3 arco→arco, lado côncavo | alv14 | 15/15 | 2.955 / 0.010 (vazio 0 cm², exc 0) | 0.000 / 0.305 (vazio 31 cm², exc 619) | 0.000 / 0.000 (vazio 31 cm², exc 1462) | - |
| T3 arco→arco, lado côncavo | 0,2 | -10/-10 | 0.026 / 0.025 (vazio 0 cm², exc 0) | 0.920 / 0.263 (vazio 413 cm², exc 0) | 0.000 / 0.076 (vazio 1081 cm², exc 0) | - |
| T3 arco→arco, lado côncavo | alv14 | -10/-10 | 1.958 / 0.013 (vazio 0 cm², exc 0) | 0.000 / 0.264 (vazio 475 cm², exc 0) | 0.000 / 0.226 (vazio 1075 cm², exc 6) | - |
| T3 arco→arco, lado côncavo | 0,2 | 15/-10 | 0.020 / 0.022 (vazio 0 cm², exc 0) | 0.710 / 0.265 (vazio 6 cm², exc 531) | 0.756 / 0.333 (vazio 0 cm², exc 1250) | - |
| T3 arco→arco, lado côncavo | alv14 | 15/-10 | 1.478 / 0.013 (vazio 0 cm², exc 0) | 0.000 / 0.218 (vazio 44 cm², exc 506) | 0.000 / 0.335 (vazio 75 cm², exc 1206) | - |
| T3 arco→arco, lado côncavo | 0,2 | -20/30 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 969 cm², exc 31) | 0.000 / 0.000 (vazio 2581 cm², exc 0) | - |
| T3 arco→arco, lado côncavo | alv14 | -20/30 | 1.233 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 944 cm², exc 38) | 0.000 / 0.000 (vazio 2381 cm², exc 144) | - |
| T3 arco→arco, lado côncavo | 0,2 | 0/15 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | 1.042 / 0.061 (vazio 6 cm², exc 0) | - |
| T3 arco→arco, lado côncavo | alv14 | 0/15 | 0.552 / 0.000 (vazio 0 cm², exc 0) | 0.018 / 0.274 (vazio 19 cm², exc 6) | 0.024 / 0.264 (vazio 31 cm², exc 50) | - |
| T3 arco→arco, lado côncavo | 0,2 | 15/0 | 0.004 / 0.007 (vazio 0 cm², exc 0) | 0.409 / 0.762 (vazio 0 cm², exc 581) | 0.478 / 1.009 (vazio 0 cm², exc 1387) | - |
| T3 arco→arco, lado côncavo | alv14 | 15/0 | 0.359 / 0.004 (vazio 0 cm², exc 0) | 11.274 / 0.438 (vazio 13 cm², exc 575) | 10.955 / 0.544 (vazio 6 cm², exc 1344) | - |
| T3 arco→arco, lado côncavo | 0,2 | 0/0 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | - |
| T3 arco→arco, lado côncavo | alv14 | 0/0 | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | 0.000 / 0.000 (vazio 0 cm², exc 0) | - |

## X (diferença de volume com e sem a outra parede; malhas fechadas)
| Caso | Camadas | Tilts | Δ volume | Fechadas | Cobertura z baixo / meio / topo | Avisos |
|---|---|---|---|---|---|---|
| X reta×reta | 0,2 | 15/15 | 124233.1 cm³ | sim | vazio 0 cm² exc 0 / vazio 450 cm² exc 0 / vazio 450 cm² exc 0 | - |
| X reta×reta | alv14 | 15/15 | 85522.1 cm³ | sim | vazio 0 cm² exc 0 / vazio 306 cm² exc 0 / vazio 306 cm² exc 0 | - |
| X reta×reta | 0,2 | -10/-10 | 121851.2 cm³ | sim | vazio 0 cm² exc 0 / vazio 400 cm² exc 0 / vazio 400 cm² exc 0 | - |
| X reta×reta | alv14 | -10/-10 | 83882.4 cm³ | sim | vazio 0 cm² exc 0 / vazio 338 cm² exc 0 / vazio 306 cm² exc 0 | - |
| X reta×reta | 0,2 | 15/-10 | 121851.2 cm³ | sim | vazio 0 cm² exc 0 / vazio 400 cm² exc 0 / vazio 400 cm² exc 0 | - |
| X reta×reta | alv14 | 15/-10 | 83882.4 cm³ | sim | vazio 0 cm² exc 0 / vazio 338 cm² exc 0 / vazio 306 cm² exc 0 | - |
| X reta×reta | 0,2 | -20/30 | 138564.1 cm³ | sim | vazio 0 cm² exc 0 / vazio 500 cm² exc 0 / vazio 450 cm² exc 0 | - |
| X reta×reta | alv14 | -20/30 | 95387.5 cm³ | sim | vazio 0 cm² exc 0 / vazio 338 cm² exc 0 / vazio 338 cm² exc 0 | - |
| X reta×reta | 0,2 | 0/15 | 124233.1 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X reta×reta | alv14 | 0/15 | 85522.1 cm³ | sim | vazio 0 cm² exc 0 / vazio 63 cm² exc 0 / vazio 63 cm² exc 0 | - |
| X reta×reta | 0,2 | 15/0 | 120000.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 400 cm² exc 0 / vazio 400 cm² exc 0 | - |
| X reta×reta | alv14 | 15/0 | 82608.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 244 cm² exc 0 / vazio 244 cm² exc 0 | - |
| X reta×reta | 0,2 | 0/0 | 120000.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X reta×reta | alv14 | 0/0 | 82608.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X1 reta×arco | 0,2 | 15/15 | 124238.6 cm³ | sim | vazio 0 cm² exc 0 / vazio 450 cm² exc 0 / vazio 450 cm² exc 0 | - |
| X1 reta×arco | alv14 | 15/15 | 85525.6 cm³ | sim | vazio 0 cm² exc 0 / vazio 331 cm² exc 0 / vazio 331 cm² exc 0 | - |
| X1 reta×arco | 0,2 | -10/-10 | 121856.6 cm³ | sim | vazio 0 cm² exc 0 / vazio 400 cm² exc 0 / vazio 400 cm² exc 0 | - |
| X1 reta×arco | alv14 | -10/-10 | 83885.8 cm³ | sim | vazio 0 cm² exc 0 / vazio 338 cm² exc 0 / vazio 306 cm² exc 0 | - |
| X1 reta×arco | 0,2 | 15/-10 | 121856.6 cm³ | sim | vazio 0 cm² exc 0 / vazio 400 cm² exc 0 / vazio 400 cm² exc 0 | - |
| X1 reta×arco | alv14 | 15/-10 | 83885.8 cm³ | sim | vazio 0 cm² exc 0 / vazio 363 cm² exc 0 / vazio 331 cm² exc 0 | - |
| X1 reta×arco | 0,2 | -20/30 | 138570.2 cm³ | sim | vazio 0 cm² exc 0 / vazio 500 cm² exc 0 / vazio 450 cm² exc 0 | - |
| X1 reta×arco | alv14 | -20/30 | 95391.4 cm³ | sim | vazio 0 cm² exc 0 / vazio 338 cm² exc 0 / vazio 369 cm² exc 0 | - |
| X1 reta×arco | 0,2 | 0/15 | 124238.6 cm³ | NÃO | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 119 cm² exc 0 | - |
| X1 reta×arco | alv14 | 0/15 | 85525.6 cm³ | NÃO | vazio 0 cm² exc 0 / vazio 69 cm² exc 0 / vazio 138 cm² exc 0 | - |
| X1 reta×arco | 0,2 | 15/0 | 120005.3 cm³ | NÃO | vazio 0 cm² exc 0 / vazio 400 cm² exc 0 / vazio 400 cm² exc 0 | - |
| X1 reta×arco | alv14 | 15/0 | 83842.4 cm³ | sim | vazio 0 cm² exc 0 / vazio 244 cm² exc 0 / vazio 244 cm² exc 0 | - |
| X1 reta×arco | 0,2 | 0/0 | 120005.3 cm³ | NÃO | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X1 reta×arco | alv14 | 0/0 | 83842.4 cm³ | NÃO | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X arco×arco | 0,2 | 15/15 | 130122.5 cm³ | sim | vazio 0 cm² exc 0 / vazio 506 cm² exc 0 / vazio 506 cm² exc 0 | - |
| X arco×arco | alv14 | 15/15 | 89575.1 cm³ | sim | vazio 0 cm² exc 0 / vazio 325 cm² exc 0 / vazio 394 cm² exc 0 | - |
| X arco×arco | 0,2 | -10/-10 | 118070.3 cm³ | sim | vazio 0 cm² exc 0 / vazio 350 cm² exc 0 / vazio 350 cm² exc 0 | - |
| X arco×arco | alv14 | -10/-10 | 81278.7 cm³ | sim | vazio 0 cm² exc 0 / vazio 338 cm² exc 0 / vazio 306 cm² exc 0 | - |
| X arco×arco | 0,2 | 15/-10 | 118070.3 cm³ | sim | vazio 0 cm² exc 0 / vazio 350 cm² exc 0 / vazio 350 cm² exc 0 | - |
| X arco×arco | alv14 | 15/-10 | 81278.7 cm³ | sim | vazio 0 cm² exc 0 / vazio 356 cm² exc 0 / vazio 331 cm² exc 0 | - |
| X arco×arco | 0,2 | -20/30 | 152710.4 cm³ | sim | vazio 0 cm² exc 0 / vazio 563 cm² exc 0 / vazio 506 cm² exc 0 | - |
| X arco×arco | alv14 | -20/30 | 105123.2 cm³ | sim | vazio 0 cm² exc 0 / vazio 419 cm² exc 0 / vazio 481 cm² exc 0 | - |
| X arco×arco | 0,2 | 0/15 | 130122.5 cm³ | NÃO | vazio 0 cm² exc 0 / vazio 56 cm² exc 0 / vazio 175 cm² exc 0 | - |
| X arco×arco | alv14 | 0/15 | 89575.1 cm³ | NÃO | vazio 0 cm² exc 0 / vazio 69 cm² exc 0 / vazio 169 cm² exc 0 | - |
| X arco×arco | 0,2 | 15/0 | 120004.9 cm³ | NÃO | vazio 0 cm² exc 0 / vazio 400 cm² exc 0 / vazio 400 cm² exc 0 | - |
| X arco×arco | alv14 | 15/0 | 82610.6 cm³ | NÃO | vazio 0 cm² exc 0 / vazio 244 cm² exc 0 / vazio 263 cm² exc 0 | - |
| X arco×arco | 0,2 | 0/0 | 120004.9 cm³ | NÃO | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X arco×arco | alv14 | 0/0 | 82610.6 cm³ | NÃO | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |

## DEPOIS
## T (fresta / sobreposição em mm nas camadas de 5 mm ou mais, [todas as camadas]; z = 0,01 | 0,497·H | H−0,01; vazio e excesso em cm² contra a soma das paredes sozinhas)
| Caso | Camadas | Tilts hosp/ramo | z baixo | z meio | z topo | Avisos |
|---|---|---|---|---|---|---|
| T1 reta→arco, lado convexo | 0,2 | 15/15 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 13 exc 0 cm² | - |
| T1 reta→arco, lado convexo | alv14 | 15/15 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 13 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T1 reta→arco, lado convexo | 0,2 | -10/-10 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 306 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 894 cm² | - |
| T1 reta→arco, lado convexo | alv14 | -10/-10 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 338 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 788 cm² | - |
| T1 reta→arco, lado convexo | 0,2 | 15/-10 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 13 exc 0 cm² | - |
| T1 reta→arco, lado convexo | alv14 | 15/-10 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T1 reta→arco, lado convexo | 0,2 | -20/30 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 1269 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 3056 cm² | - |
| T1 reta→arco, lado convexo | alv14 | -20/30 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 6 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 1038 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 13 exc 3081 cm² | - |
| T1 reta→arco, lado convexo | 0,2 | 0/15 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T1 reta→arco, lado convexo | alv14 | 0/15 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T1 reta→arco, lado convexo | 0,2 | 15/0 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T1 reta→arco, lado convexo | alv14 | 15/0 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T1 reta→arco, lado convexo | 0,2 | 0/0 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T1 reta→arco, lado convexo | alv14 | 0/0 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T1 reta→arco, lado côncavo | 0,2 | 15/15 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 663 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 1481 cm² | - |
| T1 reta→arco, lado côncavo | alv14 | 15/15 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 525 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 1163 cm² | - |
| T1 reta→arco, lado côncavo | 0,2 | -10/-10 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T1 reta→arco, lado côncavo | alv14 | -10/-10 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T1 reta→arco, lado côncavo | 0,2 | 15/-10 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 600 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 1375 cm² | - |
| T1 reta→arco, lado côncavo | alv14 | 15/-10 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 613 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 1219 cm² | - |
| T1 reta→arco, lado côncavo | 0,2 | -20/30 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 6 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 44 cm² | - |
| T1 reta→arco, lado côncavo | alv14 | -20/30 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 6 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 13 cm² | - |
| T1 reta→arco, lado côncavo | 0,2 | 0/15 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T1 reta→arco, lado côncavo | alv14 | 0/15 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 13 cm² | - |
| T1 reta→arco, lado côncavo | 0,2 | 15/0 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 600 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 1406 cm² | - |
| T1 reta→arco, lado côncavo | alv14 | 15/0 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 569 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 1269 cm² | - |
| T1 reta→arco, lado côncavo | 0,2 | 0/0 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T1 reta→arco, lado côncavo | alv14 | 0/0 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T2 arco→reta, lado esquerdo | 0,2 | 15/15 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 6 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 13 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T2 arco→reta, lado esquerdo | alv14 | 15/15 | 0.536 / 0.000 [tudo 0.536 / 0.000] vazio 0 exc 0 cm² | 1.005 / 0.000 [tudo 1.005 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 13 exc 0 cm² | - |
| T2 arco→reta, lado esquerdo | 0,2 | -10/-10 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 300 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 888 cm² | - |
| T2 arco→reta, lado esquerdo | alv14 | -10/-10 | 0.003 / 0.000 [tudo 0.003 / 0.000] vazio 0 exc 0 cm² | 0.190 / 0.000 [tudo 0.190 / 0.000] vazio 6 exc 300 cm² | 0.123 / 0.000 [tudo 0.123 / 0.000] vazio 0 exc 763 cm² | - |
| T2 arco→reta, lado esquerdo | 0,2 | 15/-10 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T2 arco→reta, lado esquerdo | alv14 | 15/-10 | 0.039 / 0.000 [tudo 0.039 / 0.000] vazio 0 exc 0 cm² | 3.686 / 0.000 [tudo 3.686 / 0.000] vazio 6 exc 6 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T2 arco→reta, lado esquerdo | 0,2 | -20/30 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 1100 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 13 exc 2350 cm² | - |
| T2 arco→reta, lado esquerdo | alv14 | -20/30 | 0.000 / 0.004 [tudo 0.000 / 0.004] vazio 0 exc 0 cm² | 0.000 / 4.519 [tudo 0.000 / 4.519] vazio 6 exc 906 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 2237 cm² | - |
| T2 arco→reta, lado esquerdo | 0,2 | 0/15 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 31 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T2 arco→reta, lado esquerdo | alv14 | 0/15 | 0.000 / 0.011 [tudo 0.000 / 0.011] vazio 0 exc 0 cm² | 0.003 / 1.602 [tudo 0.003 / 1.602] vazio 0 exc 0 cm² | 0.005 / 3.218 [tudo 0.005 / 3.218] vazio 6 exc 0 cm² | - |
| T2 arco→reta, lado esquerdo | 0,2 | 15/0 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T2 arco→reta, lado esquerdo | alv14 | 15/0 | 0.032 / 0.000 [tudo 0.032 / 0.000] vazio 0 exc 0 cm² | 2.615 / 0.000 [tudo 2.615 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 13 cm² | - |
| T2 arco→reta, lado esquerdo | 0,2 | 0/0 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T2 arco→reta, lado esquerdo | alv14 | 0/0 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T2 arco→reta, lado direito | 0,2 | 15/15 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 6 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 688 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 1506 cm² | - |
| T2 arco→reta, lado direito | alv14 | 15/15 | 0.000 / 0.004 [tudo 0.000 / 0.004] vazio 0 exc 0 cm² | 0.000 / 2.667 [tudo 0.000 / 2.667] vazio 0 exc 575 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 1331 cm² | - |
| T2 arco→reta, lado direito | 0,2 | -10/-10 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T2 arco→reta, lado direito | alv14 | -10/-10 | 0.020 / 0.000 [tudo 0.020 / 0.000] vazio 0 exc 0 cm² | 2.619 / 0.000 [tudo 2.619 / 0.000] vazio 6 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T2 arco→reta, lado direito | 0,2 | 15/-10 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 13 exc 550 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 1394 cm² | - |
| T2 arco→reta, lado direito | alv14 | 15/-10 | 0.014 / 0.000 [tudo 0.014 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.003 [tudo 0.000 / 0.003] vazio 0 exc 606 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 1281 cm² | - |
| T2 arco→reta, lado direito | 0,2 | -20/30 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T2 arco→reta, lado direito | alv14 | -20/30 | 0.108 / 0.000 [tudo 0.108 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 13 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T2 arco→reta, lado direito | 0,2 | 0/15 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T2 arco→reta, lado direito | alv14 | 0/15 | 0.000 / 0.011 [tudo 0.000 / 0.011] vazio 0 exc 0 cm² | 0.003 / 1.602 [tudo 0.003 / 1.602] vazio 0 exc 0 cm² | 0.005 / 3.218 [tudo 0.005 / 3.218] vazio 6 exc 0 cm² | - |
| T2 arco→reta, lado direito | 0,2 | 15/0 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 569 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 1375 cm² | - |
| T2 arco→reta, lado direito | alv14 | 15/0 | 0.007 / 0.000 [tudo 0.007 / 0.000] vazio 0 exc 0 cm² | 0.000 / 1.067 [tudo 0.000 / 1.067] vazio 0 exc 544 cm² | 0.000 / 2.721 [tudo 0.000 / 2.721] vazio 0 exc 1275 cm² | - |
| T2 arco→reta, lado direito | 0,2 | 0/0 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T2 arco→reta, lado direito | alv14 | 0/0 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T3 arco→arco, lado convexo | 0,2 | 15/15 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 6 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 25 exc 6 cm² | - |
| T3 arco→arco, lado convexo | alv14 | 15/15 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 13 exc 6 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 6 cm² | - |
| T3 arco→arco, lado convexo | 0,2 | -10/-10 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 13 exc 256 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 763 cm² | - |
| T3 arco→arco, lado convexo | alv14 | -10/-10 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 250 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 731 cm² | - |
| T3 arco→arco, lado convexo | 0,2 | 15/-10 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T3 arco→arco, lado convexo | alv14 | 15/-10 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 13 exc 6 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 6 cm² | - |
| T3 arco→arco, lado convexo | 0,2 | -20/30 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 1525 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 3762 cm² | - |
| T3 arco→arco, lado convexo | alv14 | -20/30 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 6 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 1437 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 19 exc 3537 cm² | - |
| T3 arco→arco, lado convexo | 0,2 | 0/15 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 6 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 13 exc 188 cm² | - |
| T3 arco→arco, lado convexo | alv14 | 0/15 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 19 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 13 exc 188 cm² | - |
| T3 arco→arco, lado convexo | 0,2 | 15/0 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 6 cm² | - |
| T3 arco→arco, lado convexo | alv14 | 15/0 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 13 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 13 cm² | - |
| T3 arco→arco, lado convexo | 0,2 | 0/0 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T3 arco→arco, lado convexo | alv14 | 0/0 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T3 arco→arco, lado côncavo | 0,2 | 15/15 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 681 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 1506 cm² | - |
| T3 arco→arco, lado côncavo | alv14 | 15/15 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 619 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 1419 cm² | - |
| T3 arco→arco, lado côncavo | 0,2 | -10/-10 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T3 arco→arco, lado côncavo | alv14 | -10/-10 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 0 cm² | - |
| T3 arco→arco, lado côncavo | 0,2 | 15/-10 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 531 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 1263 cm² | - |
| T3 arco→arco, lado côncavo | alv14 | 15/-10 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 506 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 1206 cm² | - |
| T3 arco→arco, lado côncavo | 0,2 | -20/30 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 6 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 31 cm² | - |
| T3 arco→arco, lado côncavo | alv14 | -20/30 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 6 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T3 arco→arco, lado côncavo | 0,2 | 0/15 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 0 cm² | - |
| T3 arco→arco, lado côncavo | alv14 | 0/15 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 13 exc 6 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 19 cm² | - |
| T3 arco→arco, lado côncavo | 0,2 | 15/0 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 575 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 1381 cm² | - |
| T3 arco→arco, lado côncavo | alv14 | 15/0 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 569 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 6 exc 1337 cm² | - |
| T3 arco→arco, lado côncavo | 0,2 | 0/0 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |
| T3 arco→arco, lado côncavo | alv14 | 0/0 | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | 0.000 / 0.000 [tudo 0.000 / 0.000] vazio 0 exc 0 cm² | - |

## X (diferença de volume com e sem a outra parede; malhas fechadas; cobertura contra as paredes sozinhas)
| Caso | Camadas | Tilts | Δ volume | Fechadas | Cobertura z baixo / meio / topo | Avisos |
|---|---|---|---|---|---|---|
| X reta×reta | 0,2 | 15/15 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X reta×reta | alv14 | 15/15 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X reta×reta | 0,2 | -10/-10 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X reta×reta | alv14 | -10/-10 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X reta×reta | 0,2 | 15/-10 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X reta×reta | alv14 | 15/-10 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X reta×reta | 0,2 | -20/30 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X reta×reta | alv14 | -20/30 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X reta×reta | 0,2 | 0/15 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X reta×reta | alv14 | 0/15 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X reta×reta | 0,2 | 15/0 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X reta×reta | alv14 | 15/0 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X reta×reta | 0,2 | 0/0 | 120000.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X reta×reta | alv14 | 0/0 | 82608.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X1 reta×arco | 0,2 | 15/15 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X1 reta×arco | alv14 | 15/15 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X1 reta×arco | 0,2 | -10/-10 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X1 reta×arco | alv14 | -10/-10 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X1 reta×arco | 0,2 | 15/-10 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X1 reta×arco | alv14 | 15/-10 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X1 reta×arco | 0,2 | -20/30 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X1 reta×arco | alv14 | -20/30 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X1 reta×arco | 0,2 | 0/15 | 0.0 cm³ | NÃO | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X1 reta×arco | alv14 | 0/15 | 0.0 cm³ | NÃO | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X1 reta×arco | 0,2 | 15/0 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X1 reta×arco | alv14 | 15/0 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X1 reta×arco | 0,2 | 0/0 | 120005.3 cm³ | NÃO | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X1 reta×arco | alv14 | 0/0 | 83842.4 cm³ | NÃO | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X arco×arco | 0,2 | 15/15 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X arco×arco | alv14 | 15/15 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X arco×arco | 0,2 | -10/-10 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X arco×arco | alv14 | -10/-10 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X arco×arco | 0,2 | 15/-10 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X arco×arco | alv14 | 15/-10 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X arco×arco | 0,2 | -20/30 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X arco×arco | alv14 | -20/30 | 0.0 cm³ | sim | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X arco×arco | 0,2 | 0/15 | 0.0 cm³ | NÃO | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X arco×arco | alv14 | 0/15 | 0.0 cm³ | NÃO | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X arco×arco | 0,2 | 15/0 | 0.0 cm³ | NÃO | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X arco×arco | alv14 | 15/0 | 0.0 cm³ | NÃO | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X arco×arco | 0,2 | 0/0 | 120004.9 cm³ | NÃO | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |
| X arco×arco | alv14 | 0/0 | 82610.6 cm³ | NÃO | vazio 0 cm² exc 0 / vazio 0 cm² exc 0 / vazio 0 cm² exc 0 | - |

## X4 (arco × arco, cruzamento no meio dos dois eixos): Δ volume com e sem a outra / vazio em z baixo, meio e topo
| Caso | Camadas | Tilts | Δ volume (A / B) | vazio z baixo / meio / topo |
|---|---|---|---|---|
| X4 arco×arco | 0,2 | 15/-10 | 0.0 / 0.0 cm³ | 0 / 0 / 0 cm² |
| X4 arco×arco | alv14 | 15/-10 | 0.0 / 0.0 cm³ | 0 / 0 / 0 cm² |
| X4 arco×arco | 0,2 | 20/-20 | 0.0 / 0.0 cm³ | 0 / 0 / 0 cm² |
| X4 arco×arco | alv14 | 20/-20 | 0.0 / 0.0 cm³ | 0 / 0 / 0 cm² |
| X4 arco×arco | 0,2 | 30/15 | 0.0 / 0.0 cm³ | 0 / 0 / 0 cm² |
| X4 arco×arco | alv14 | 30/15 | 0.0 / 0.0 cm³ | 0 / 0 / 0 cm² |
| X4 arco×arco | 0,2 | 15/15 | 0.0 / 0.0 cm³ | 0 / 0 / 0 cm² |
| X4 arco×arco | alv14 | 15/15 | 0.0 / 0.0 cm³ | 0 / 0 / 0 cm² |
| X4 arco×arco | 0,2 | 0/0 | 0.0 / 120004.9 cm³ | 0 / 0 / 0 cm² |
| X4 arco×arco | alv14 | 0/0 | 18961.6 / 82610.6 cm³ | 0 / 0 / 0 cm² |

Tilts 0/0 (vertical): o pintor cede a área do cruzamento como hoje (Δ volume = área cedida, vazio 0 porque a outra parede a cobre); caminho idêntico ao anterior. Os demais: Δ volume 0,0 (cada parede igual a ela sozinha), vazio 0, malhas fechadas.
