# Telhado: dois testes que falhavam após #42 e ba185c0e

- roofs.test.ts (telhado em arco): o esqueleto reescrito (#42) devolve a cumeeira em y = 2,9999999999999276 (ruído ~7e-14); o teste comparava `=== 3`. Conferido: há uma só cumeeira (x 3 a 7,902, y = 3 por simetria) e todas as geratrizes do arco saem por `deArco`; não há espigão falso. Expectativa trocada para |y - 3| < 1e-9.
- instanciada3d.test.ts (realce): ba185c0e moveu o preenchimento do realce de renderOrder 5 para 10 (`ORDEM_REALCE_PREENCHIMENTO`, realceGpu3d.ts). O realce existe; o teste procurava 5. Expectativa trocada para 10.
- Nenhum código de produção foi alterado; nenhum Rust/wasm tocado.
- NÃO verificado visualmente: telhado em arco na planta (uma cumeeira, sem geratrizes) e o realce de seleção no 3D sobre massa/vidro.
