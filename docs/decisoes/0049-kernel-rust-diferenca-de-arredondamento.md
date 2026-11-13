# 0049 — Diferença de arredondamento entre bibliotecas (kernel Rust)

Data: 2026-11-02. Decisão do dono. Generaliza a 0048 (pintor da A2) e fecha a parada do A3c (regiões e silhueta).

## Contexto

O TypeScript usa `polygon-clipping` e Clipper; o Rust usa `i_overlay`. Quando duas bibliotecas diferentes quantizam em inteiros
(1 µm, ou 1 nm no pintor), os vértices de interseção caem em pontos ligeiramente diferentes. Em uma operação isolada o desvio é
menor que 1 µm por vértice; ao somar dezenas de peças (união dos cortes em regiões por material e silhueta) a área final difere em
1e-4 a 3e-4 m² em regiões de 5 a 20 m². Perseguir igualdade abaixo disso exigiria portar a biblioteca do TS (e junto o seu defeito).

## Regra

Uma diferença entre o Rust e a referência TS **não é divergência** quando valem as quatro condições:

1. **Causa só de arredondamento.** Cada lado fica a menos de 1 µm por vértice do resultado exato, ou a diferença encolhe ao usar
   escala mais fina. Registra-se como a causa foi verificada.
2. **Topologia igual nos componentes significativos.** Mesma identidade e ordem de itens; mesmo número de peças e furos entre os
   componentes com área acima do limiar de fiapo (`1e-4 m²` por padrão; ajustável só com medição registrada). Componentes menores
   (fiapos de arredondamento, frestas que o fechamento preenche de um lado e não do outro) são contados à parte, e sua área já
   entra no limite do item 3. Se algum componente acima do limiar não tiver par, é divergência.
3. **Dentro de um limite medido e documentado.** O erro de arredondamento cresce com o comprimento do contorno (cada aresta desloca
   até ~1 grade), não com a área: o limite é `1e-5 + K × perímetro × 1e-6` m², com `K` medido (maior razão observada no estresse,
   fora das exceções nomeadas, com folga de 1,5×) e registrado. O limite não é escolhido para fazer o teste passar.
4. **Guarda de erro grosseiro.** Qualquer valor muito acima do limite reprova (garante que um defeito real não passe por
   "arredondamento").

Fora dessas condições a tolerância geral continua: 1 µm de coordenada e 1e-6 m² / m³. Cada nova aplicação desta regra registra a
medição no ADR da sub-etapa; não há exceção implícita.

## Aplicação ao A3c

- Regiões por material e silhueta (`cluster_resolvido`, `resolver_nivel`): limite `1e-5 + K × perímetro × 1e-6` (K medido; a medição do A3d
  mostrou que o limite por área falha em regiões pequenas de contorno longo, como a do fixture da casa de 2 quartos, 0,083 m²,
  simétrica 6,7e-5 contra limite 5,2e-5, com diferença de área de 2,2e-7), topologia nos componentes acima do fiapo, guarda de erro
  grosseiro de `1e-2 m²`.
- O caso da semente 1, nível 0, material 2 (o `unionClipper` do TS infla a região em 3,5e-3 m² e preenche um entalhe de 3 × 12 cm
  junto a uma parede curva) é defeito do TS: o Rust (2,382905) está a 2e-6 m² da união exata (2,382907). Segue a pendência de
  correção do TS, separada, e o caso fica numa lista de exceções nomeadas do harness (não no limite geral).
- Faixas, `fragment`, `cut` e `raw` não usam esta regra (continuam sob 0048 e as tolerâncias gerais), com uma exceção: a propriedade
  "faixa dentro do bruto" (sobra de cada faixa fora do bruto da camada), que usa a regra na seção "Extensão às faixas" (2026-11-12).

## Exceções nomeadas (defeitos do TS, não arredondamento)

Cada exceção é um caso identificado no harness, reproduzível, e só vale se o Rust concordar com a geometria exata (a área do Rust
bate com a união ou interseção exata a 1e-6 m²). Lista inicial:

1. Semente 1, nível 0, material 2 (`unionClipper` infla a região em 3,5e-3 m² e preenche um entalhe de 3 × 12 cm junto a parede
   curva): a exceção cobre a região **e a silhueta do mesmo grupo**, que é derivada da mesma união.
2. Estresse retas, semente 101, parede 18, camada 4 (`polygon-clipping` em `intersection`, no recorte pelo perfil: devolve fatias que
   somam 0,0570 m² num polígono de 0,0494; o Rust soma 0,0494). É o mesmo tipo de defeito da 0048, com ganho de área em vez de perda.

Ambos seguem como pendência separada de correção no TS (subir `VERSAO_MOTOR_GEOMETRIA`).

## Contenção de partes após arredondamento à grade

Data: 2026-11-05. Aplica-se ao teste de contenção de `tests/kernel-b3.wasm.test.ts` ("partes sem sobreposição e volume conservado"),
sementes 31 a 33. A tolerância base de 1e-6 m² não muda.

- Origem: as alturas de corte da junção B3 são arredondadas à grade EPS_Z = 1e-6 m. Cada coordenada pode então deslocar-se até
  EPS_Z / 2 (meio micrômetro), e a borda de uma parte pode sair da borda da original nessa medida.
- Critério: excesso de área fora da original ≤ 1e-6 + perímetro_da_peça × EPS_Z / 2, com o perímetro e a área calculados pelas
  mesmas primitivas do teste (`perimetroDaForma`, `areaDaForma`).
- Fica igual: o volume conservado (com seu limite próprio por K), as cotas em ordem e as demais asserções.

## Topologia equivalente por região (2026-11-05)

Aplica-se à comparação de regiões (B1 em `kernelComparaB.ts`, regra com `k0049`; e as regiões/silhuetas de A3c em `kernelComparaA3c.ts`,
`regiao0049`). A tolerância base de 1e-6 m² e o limite por perímetro não mudam.

- Origem: na semente 43 o TypeScript devolve um anel único que toca a si mesmo (representação inválida, com a fenda do furo no contorno), e o
  Rust devolve o contorno externo com o furo (válido). A região é a mesma: a área líquida bate a 5e-7 m² ou menos. A regra "sem par, furo
  acima do fiapo" falhava por causa da representação, não da região.
- Regra: quando a topologia (nº de peças e de furos significativos) diferir entre o Rust e o TypeScript, a comparação passa a ser pela
  REGIÃO. A diferença simétrica da região já precisa estar dentro do limite da 0049 (`1e-5 + K x perímetro x 1e-6`, com K = 6, o mesmo que o
  comparador aplica); se estiver, a diferença de topologia é aceita como REPRESENTAÇÃO. Se não estiver, a falha permanece.
- Condição: a regra só vale se o resultado do Rust for VÁLIDO (`resultadoRustValido`): cada anel é simples (sem vértice repetido fora de sequência no
  mesmo anel, sem aresta tocando outra não adjacente do mesmo anel, nem cruzamento próprio entre anéis do mesmo polígono; vértices
  repetidos seguidos são aresta de comprimento zero e não contam), e cada furo está dentro do
  anel externo (teste de ponto num ponto interior do furo). Se o Rust for inválido, a falha permanece e a mensagem diz "resultado do Rust
  inválido".
- Não se aplica: quando as topologias são iguais (a regra geral e a equivalência por componente continuam como estavam), nem quando a
  diferença simétrica passa do limite. Nenhuma tolerância é relaxada.

## Altura de faixa medida só com peças de área real (2026-11-05)

Aplica-se à medida de altura (cota z) das faixas de parede no comparador: `diffCelula` do diagnóstico (`tmp-equiv-junc/comum.ts`) e
as cotas de `compararB3` em `kernelComparaB3.ts`. O limite de 1e-6 m² e as demais tolerâncias não mudam.

- Regra: a altura de uma faixa é o mínimo de z0 e o máximo de z1 SOMENTE entre as peças com área maior que 1e-6 m² (`areaDaForma`). No comparador de faixas (`compararB3`), as cotas que definem as amostras verticais só entram quando a peça tem área real. Se não houver peça acima de 1e-6 m², a faixa não tem altura medida e não compara.
- Motivo: resíduos de arredondamento de área menor que 1e-6 m² não são material. Uma peça de área zero (ou de 1e-7 m²) com cota diferente da peça real (por exemplo 3,00 x 2,88) fazia a medida usar uma cota que não existe na região; foi a origem dos 24 casos de "0,12 m" nos projetos sem-titulo-8, -9 e -10.
- Não muda: a comparação de REGIÃO e de VOLUME continua com todas as peças, inclusive as de área menor. Só a medida de altura muda.

## Atualização 2026-11-06: só Rust, correção I3 e volume exato

Data: 2026-11-06. Decisões do dono. Registra o que mudou no kernel Rust (fatias A e B) nesta data.

### Decisão "só Rust"

- O Rust calcula as partes de A e B e as quantidades (parede, piso, laje e forro).
- Falha do Rust vira erro explícito (`ErroKernel`), nunca cálculo em TypeScript no lugar.
- O TypeScript fica só como oráculo de teste (comparações nos testes e modo sombra).
- Estado do código: o despacho já não devolve o cálculo do TypeScript (ver a atualização 2026-11-06 (2)); `ErroKernelLeve` em
  `packages/geom/src/kernel/v2/cena.ts` ainda existe como tipo de erro.

### Correção I3 (commit 688a96e7)

- Faixas de junção vindas do TS com vértices a menos de 1e-9 m passam por `normalizar_na_grade` (grade de 1 µm,
  `ESCALA_FINA`) em `crates/geom-wasm/src/b3.rs`, antes da montagem do anel.
- O flag `cut` só é ligado acima de área × `Z_EPS`.
- Corrige a falha do I3 na semente 1 (teste `faixa_de_juncao_com_vertices_a_menos_de_1e_9_nao_sai_com_anel_que_toca_a_si_mesmo`).

### Volume exato

- `volume_exato_afim` (`crates/geom-wasm/src/volume_sobreposicao.rs`): volume da interseção quando as alturas são afins.
- `volume_por_trechos` com `Span::Perfil`: recorte em trechos quando a altura é um perfil. Tolerância da média de perfil: ≤ 1e-6.
- `overlap_volume`: ponto de entrada que escolhe o método para duas peças.
- Casos analíticos (retângulo, forma não convexa, topos cruzados, rampa 4×1, face não afim) ficam em `volume_sobreposicao.rs`.

### Decisões do dono (2026-11-06)

- O Rust exato vale onde a triangulação do TS aproximava: `VERSAO_MOTOR_GEOMETRIA` sobe (hoje 4, em
  `apps/web/src/editor/geometriaAbertura.ts`) e a diferença é registrada.
- Média de perfil ≤ 1e-6.
- A grade de 1 µm vale também para as quantidades.
- O forro migra.

### Verificação nova

- `tests/kernel-invariantes-rust.wasm.test.ts`: teste de invariantes I1 (contenção), I2 (sem sobreposição), I3 (anéis
  válidos), I4 (volume não negativo e cotas ordenadas) e I5 (conservação), com anexos true e false, nas sementes listadas
  em `SEMENTES` do arquivo (hoje 1 a 4).
- `cargo test` em `crates/geom-wasm`.

## Atualização 2026-11-06 (2): Rust sempre ligado, "calculando…" e critério por camada

Data: 2026-11-06. Decisões do dono.

### Rust sempre ligado

- O Rust é o ÚNICO caminho de produção das fatias A e B e das quantidades, sempre ligado. Não existe opção de desligar A ou B em produção.
- `configDoDespacho` (`apps/web/src/editor/preferenciasKernel.ts`) devolve A e B ligadas sempre e o wasm é sempre carregado no boot.
- `?kernel=ts`, `?kernelFatias=...` e a fatia desligada só funcionam em build de desenvolvimento (`import.meta.env.DEV`) ou nos testes. Em produção
  são ignorados, assim como o `hestia:kernel:fatias` do `localStorage`.
- O diálogo Experimentais e `preferenciasKernel.ts` ficam só com o modo sombra (comparar com o TypeScript) e o diagnóstico do despacho.

### "calculando…" no carregamento

- Enquanto o wasm não carregou, o resultado de A, B e quantidades é `KernelPendente` (`packages/engine/src/kernelPendente.ts`): o editor mostra
  "calculando…" e recalcula quando o Rust fica pronto. Nunca devolve o resultado do TypeScript no lugar.
- Falha do Rust é erro explícito. O modo sombra devolve sempre o resultado do Rust (o TypeScript só é comparado).

### Critério de comparação por camada (aprovado pelo dono em 2026-11-06)

- Diferença por camada ≤ 1e-6 + 1e-6 × Σ(perímetro × cota), com a soma sobre as faces da camada. É o limite derivado da grade de 1 µm: cada aresta
  desloca até uma grade, e o volume acompanha a cota. Substitui o limite fixo de 2e-5 do teste B6 (commit 00c05368). Nenhuma tolerância base muda.

### Correções do Rust (commit d71830a2)

- Furo que sai do contorno não vira região: um polígono é o contorno menos os furos; com a regra NonZero a parte do furo fora do contorno contava
  como região (enrolamento -1) e inflava o corte em 1,6e-4 m² num piso do estresse (furo de escada 1 mm além da borda). `preparar` refaz o polígono
  como contorno menos furos (`crates/geom-wasm/src/ops.rs`).
- `laje_cobre_piso` na grade de 1 µm, sem escala própria: a camada entra na grade de 1 µm antes de comparar (o viés da área solta contra a
  arredondada era o falso negativo) e o fiapo restante tem limite derivado da grade, perímetro / ESCALA, mais AREA_EPS
  (`crates/geom-wasm/src/quantidades.rs`).

## Desempenho final (2026-11-07)

- **Correções:** cache do nível resolvido na cena; reenvio de seção idêntica não invalida caches, e a invalidação passa a ser por seção; `sincronizarB` reaproveita as seções; o TS não manda mais as faixas da junção B3 (o Rust usa o próprio resolver); `build-wasm.mjs` respeita `CARGO_TARGET_DIR`.
- **Medição em projetos reais** (razão Rust/TS; abaixo de 1, o Rust é mais rápido):

| Projeto | Frio | DXF | IFC |
|---|---|---|---|
| P1 | 0,47 | 0,93 | 0,73 |
| P2 | 0,84 | 1,25 (8 contra 10 ms, ruído) | 0,89 |
| P3 | 0,56 | 0,99 | 0,58 |
| P10 | 0,42 | 0,72 | 0,38 |

- **Sementes do b6 (quantidades):** 0,78, 0,95, 0,86 e 0,38.
- **Critério aprovado:** 11 projetos com 0 erros e 0 violações.
- **Pendente:** DXF e IFC de P6 a P11, e o bench do kernel v1.

## Pendente

- Verificação completa nos 11 projetos, só com agregados (sem nomes nem conteúdo dos projetos).
- Medição de desempenho: feita, ver "Desempenho final (2026-11-07)"; falta DXF/IFC de P6 a P11 e o bench do kernel v1.
- Validação visual pelo dono (roteiro em `docs/handoff/fatia-b-validacao-e-resumo.md`).
- Subir `VERSAO_MOTOR_GEOMETRIA` e registrar a diferença medida.
- Migrar o forro.

## Extensão às faixas (propriedade "faixa dentro do bruto", A3c)

Data: 2026-11-12. Decisão do dono (opção a). Estende a regra desta ADR à propriedade "faixa dentro do bruto" de
`tests/kernel-a3c.wasm.test.ts`: a sobra de cada faixa fora do bruto da camada (descontados os vãos da parede) tem o limite
`1e-5 + K × perímetro × 1e-6` m², com K medido abaixo, e a guarda de erro grosseiro de `1e-2` m².

- **Causa, verificada como arredondamento.** A semente 405 (parede 14, faixa [1,5; 2,15]) tem 1,59e-6 m² fora do bruto ao longo
  de uma borda diagonal de ~4,5 m, igual no TS e no Rust. A grade de 1 µm desloca cada aresta no máximo uma grade, então a sobra
  cresce com o perímetro, não com a área. Verificação: a razão área / (perímetro × 1e-6) fica abaixo de 1 em todas as faixas
  medidas, nos dois motores. Se passasse de 1, a sobra não seria só arredondamento e a regra não se aplicaria.
- **Medição.** Mesma guarda da propriedade (camada sem `faixa`, faixa com polígono e bruto); sobra = faixa menos bruto, menos os
  vãos da parede (`aberturas_geom`); perímetro = perímetro da faixa (`perimetroDaForma`). Feita com instrumentação temporária, não
  commitada, sobre o Rust (`cluster_resolvido`, opções padrão) e sobre a referência TS (`referenciaA3c`). 22 sementes em 39 projetos:

| Conjunto (Rust) | Projetos | Faixas | Com sobra | Razão máx. | Onde |
|---|---|---|---|---|---|
| Estresse 1..12 (16 paredes, 2 pavimentos, com tipos de retorno) | 12 | 4523 | 1708 | 0,2047 | semente 4, parede 16 |
| Retas 100 e 101 | 2 | 473 | 77 | 0,0433 | semente 100, parede 4 |
| Arcos 100 e 101 | 2 | 239 | 135 | 0,0124 | semente 101, parede 2 |
| Propriedade 400..407, parede isolada | 8 | 82 | 22 | 0,0465 | semente 402, parede 1 |
| Propriedade 400..407, 14 paredes com arcos | 8 | 1297 | 393 | 0,1704 | semente 405, parede 14 |
| Demais (sementes 3, 5, 7 e 11) | 4 | 912 | 385 | 0,1038 | semente 3, parede 8 |
| Sintéticos de 10 e 20 pavimentos; casa de 2 quartos | 3 | 5097 | 10 | 0,0266 | casa, parede 9 |
| **Total** | **39** | **12623** | **2730** | **0,2047** | estresse, semente 4, parede 16 |

- **Acima de 1e-6 (Rust).** Três faixas: duas na semente 405 (1,585e-6 m² cada) e uma no estresse, semente 4 (3,2e-6 m², razão
  0,2047). A semente 4 não entra na propriedade hoje (ela só verifica 400..407); a regra cobre as duas situações.
- **Razões (Rust).** Máxima 0,2047 (estresse, semente 4, parede 16, faixa [0; 2,1], sobra 3,2e-6 m², perímetro 15,67 m). Média de
  0,00137 sobre todas as faixas verificadas e de 0,00632 sobre as 2730 com sobra (p50 0,0015; p90 0,019; p99 0,040).
  Sensibilidade: com o perímetro da sobra em vez do da faixa, a máxima seria 0,301, ainda abaixo de 0,5.
- **TS (referência).** 12655 faixas, 1635 com sobra, 13 acima de 1e-6 (máximo 2,9e-6 m²); razão máxima 0,2313 (semente 9, parede 3).
  Os dois motores têm a mesma ordem de grandeza da sobra, o que confirma a causa de arredondamento.
- **Exceções nomeadas.** Nenhuma faixa foi excluída. As exceções desta ADR (semente 1, nível 0, material 2; semente 101, parede 18,
  camada 4) são de região e silhueta e não se aplicam às faixas.
- **K.** Máxima 0,2047 × 1,5 = 0,307, abaixo do piso de 0,5 da regra: **K = 0,5**. Limite:
  `1e-5 + 0,5 × perímetro × 1e-6` m²; guarda `1e-2` m².
- **Nota.** A nota antiga da semente 405 (K = 0,35) usava só a borda diagonal de 4,5 m. Pelo perímetro da faixa, como manda a regra,
  a razão dela é 0,170.
