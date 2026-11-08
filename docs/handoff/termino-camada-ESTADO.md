# Término por camada: estado (2026-11-08)

## Feito (commit f1bedea5, na feat/teste-lajes-3d)
- `limiteExterno` não sobrescreve mais o término por camada (TS: layerOutline.ts; Rust: b1.rs).
- Borda além da face oposta da parede passa a estender a camada (TS: terminoCamada.ts; Rust: b2.rs).
- Matriz de 143 casos (funções x lados x faces x cm, presets, limite, modos antigos; laje e piso; parede externa e interna), TS e Rust:
  tests/termino-camada-matriz.ts, packages/engine/src/terminoCamadaMatriz.test.ts, tests/kernel-b7-matriz.wasm.test.ts.
- `bordaEsperada` da matriz passou a aceitar as camadas da parede como parâmetro (alteração deste commit WIP).

## Gatilho provável do caso real do dono (achado, NÃO corrigido)
Projeto do dono: laje estática no nível 1 (faixa z 2,88 a 3,00), paredes no nível 0, parede de 18,4 cm (acab 0,2 / substrato 2 / bloco 14 / substrato 2 / acab 0,2 cm).
Algumas paredes externas não são cortadas: a laje estática tem um excesso minúsculo (largura média ~3e-7 m) para o outro lado da parede.
`regionCamada` (terminoCamada.ts, `presentes` com `AREA_MINIMA = 1e-9`) conta isso como presença do lado oposto; a regra desse lado
(`proprios = tira(borda, T+FOLGA)`) devolve a camada até a face oposta e anula o corte do lado verdadeiro. Mesmo defeito no Rust (b2.rs, `regiao_camada`, `AREA_MINIMA`).
Hipótese de correção: a presença de um lado só conta se a faixa colada for coberta de forma relevante (por exemplo, largura média da peça de presença
acima de uma fração da faixa de 5 cm), ou presença decidida por onde a laje de fato está (lado majoritário). Qualquer limiar novo deve ser relatado ao dono.
Paredes internas com laje dos dois lados: cada lado vai até o substrato distante, as duas se sobrepõem e a laje atravessa a parede inteira (por desenho da regra "distante"). Decidir com o dono se isso é o desejado.

## Falta
- Corrigir a presença do lado oposto (TS e Rust), acrescentar o caso (laje com excesso minúsculo) à matriz, regenerar o wasm (`node scripts/build-wasm.mjs`, depois `--check`, CARGO_TARGET_DIR=E:\hestia-target-termino).
- Ponta de ~10 cm na junção em T (extensão de canto `avanco` em regionCamada/regiao_camada passa do canto da parede interna): limitar a extensão e acrescentar o caso à matriz.
- Reconfirmar o caso real: a cópia do projeto foi apagada do scratch; copiar de novo (somente leitura) de Documents\pasta\Projeto sem título\projeto.hestia.json, fora do repositório. Verificação: aplicar o preset à camada de estrutura da laje e medir a borda em cada parede (esperado: face interna do substrato distante).

## Atualização (2026-11-08, depois do WIP)
- Presença do lado: lado de maior fração coberta da faixa de 5 cm (sem AREA_MINIMA); dois lados se a faixa está inteira coberta nos dois ou as frações são iguais (decisão 0054 atualizada). TS e Rust.
- Ponta do T: a extensão de canto (`avanco`) só vale na ponta da presença a menos de 2 espessuras do fim da zona da parede (parâmetro novo, relatado). TS e Rust.
- Matriz: cenários `excesso` (3e-7 m) e `t` em tests/termino-camada-matriz.ts (TS e wasm).
