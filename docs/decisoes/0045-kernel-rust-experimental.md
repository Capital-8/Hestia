# Decisão 0045 — Kernel geométrico experimental (Rust → WebAssembly)

Decidido em 2026-10-31. O núcleo geométrico continua sendo **TypeScript** (`packages/geom/src/boolean.ts`, intocado);
passa a existir um caminho opcional em Rust compilado para WebAssembly, **desligado por padrão**, ativável em
"Experimentais". Complementa a decisão 1 do [0001](0001-decisoes-iniciais.md) (migrar pontos lentos só depois de medir)
e segue o padrão de recurso experimental por URL da [0003](0003-gpu-e-publicacao.md). Fontes:
`packages/geom/src/operacoesKernel.ts` (seam e disjuntor), `packages/geom/src/kernel/` (contrato e carregador),
`crates/geom-wasm/src/lib.rs` (ABI), `crates/geom-wasm/src/ops.rs` (geometria),
`apps/web/src/editor/preferenciasKernel.ts` (flag da aplicação) e `apps/web/src/ui/dialogs/ExperimentosDialog.tsx`.

## 1 — Decisões

| # | Decisão | Motivo |
|---|---|---|
| 1 | **Experimental e desligado por padrão.** Sem nada ligado, as operações chamam literalmente as funções de `boolean.ts` de sempre | A implementação Rust ainda não passou pelo diferencial em projeto real; um caminho novo não vira padrão sem essa prova |
| 2 | **O flag é da aplicação, nunca do projeto.** Fica em `localStorage` (`hestia:kernel`) e não entra em `Project.settings` nem no arquivo `.hestia` | Abrir o projeto de outra pessoa não pode mudar a geometria por causa de uma preferência de quem abriu |
| 3 | **Mesmo resultado do TypeScript.** A referência de equivalência é o caminho Clipper do `boolean.ts` (`unionClipper`, `differenceClipper`, `offsetMulti`): quantização a 1 µm e preenchimento non-zero | É o caminho que o próprio `boolean.ts` documenta como plano B confiável, que não perde área em silêncio; é o que dá para reproduzir em Rust sem copiar o `polygon-clipping` |
| 4 | **Disjuntor.** Qualquer erro de chamada, código de retorno diferente de 0 ou trap do wasm desativa o kernel pelo resto da sessão e refaz a operação em TypeScript | Recurso experimental não pode derrubar sessão, perder geometria nem deixar o usuário sem resposta |
| 5 | **Nada de wasm no bundle com o kernel desligado.** O binário é um asset separado, buscado só na ativação | O custo do recurso desligado fica em alguns KB de carregador, não no tamanho nem no tempo de carga do app |

## 2 — Arquitetura

- **Seam de um arquivo.** `packages/geom/src/index.ts` reexporta `union`, `difference`, `intersection`,
  `unionClipper`, `differenceClipper` e `offsetMulti` de `packages/geom/src/operacoesKernel.ts`; todo o resto de
  `boolean.ts` (`asMulti`, `booleanStats`, `closeGaps`, …) continua saindo direto de lá. Nenhum chamador mudou:
  o dispatcher vive no mesmo caminho síncrono de antes.
- **`boolean.ts` intocado.** As funções TypeScript são a referência e o plano B; o seam só decide quem atende e
  mede o custo (`medicaoOperacoes()`).
- **Dispatcher síncrono.** `operacoesKernel.ts` resolve `implKernel()` e chama a implementação ativa dentro de
  `noKernel(...)`; se não há kernel, chama a função TypeScript. A ativação é assíncrona (carregar + instanciar o
  wasm), mas acontece **antes** de qualquer operação: o caminho quente nunca espera promessa.
- **ABI de arrays** (`crates/geom-wasm/src/lib.rs`). O JS reserva a arena com `preparar_entrada(n_vertices, n_aneis,
  n_poligonos, n_args)`, que devolve o ponteiro base, **escreve depois da chamada** (a memória linear pode crescer
  durante ela e invalidar views antigas) e chama `executar(op, n_args, param)`. O resultado sai na mesma
  codificação, lido por `saida_*_ptr`/`saida_*_len` (válidos até a próxima chamada), com `saida_area()` como atalho.
  Códigos: `0` ok, `1` operação desconhecida, `2` entrada inválida, `3` erro interno; qualquer um diferente de 0
  faz o JS voltar para o TypeScript. Ponteiros são `u32` porque o alvo é `wasm32-unknown-unknown`.
- **Carga como asset separado.** O binário fica em `packages/geom/assets/geom_wasm.wasm`, commitado, gerado por
  `scripts/build-wasm.mjs` (`npm run build:wasm`) com o blob em `geom_wasm.sha256`. O carregador
  (`kernel/carregador.ts`) busca o arquivo só quando o usuário liga o recurso; com ele desligado, o wasm não é
  baixado nem importado dinamicamente.
- **Disjuntor.** `noKernel(...)` captura a exceção, chama `registrarFalhaKernel()`, `desativarKernel(motivo)` e
  refaz a mesma operação pelas funções TypeScript. O motivo e o contador de falhas aparecem em `estadoKernel()`,
  que o diálogo "Experimentais" mostra. Uma vez fora, o kernel não volta sozinho na sessão.
- **Licenças.** A crate é **Rust puro** e depende só de `i_overlay` (+ `i_shape`, `i_float`, `i_tree`, `i_key_sort`,
  `libm`), todas **MIT OR Apache-2.0**. Nada de C++: `clipper2` foi descartado porque exige clang/LLVM + sysroot para
  `wasm32-unknown-unknown`, o que não existe no ambiente do projeto. A atribuição está em `NOTICE`; o código do Hestia
  continua MIT.

## 3 — Semântica

O kernel implementa o **caminho Clipper**, não o `polygon-clipping`: `ops.rs` quantiza a 1 µm (escala 1e6,
arredondamento igual ao `Math.round` do JS) e preenche com a regra **non-zero**. É uma escolha consciente: o
`boolean.ts` chama o Clipper de plano B que não perde área em silêncio, e o `polygon-clipping` é a tentativa exata
que cai nele quando lança. Reimplementar em Rust o comportamento numérico do `polygon-clipping` seria copiar o
caminho frágil.

Consequência aceita e documentada: `unionClipper`, `differenceClipper` e `offsetMulti` devem bater com o TypeScript
de perto; `union`, `difference` e `intersection` (que no TS tentam `polygon-clipping` primeiro) podem divergir do
padrão em até ~1 µm de coordenada e, em casos degenerados, na contagem/ordem de vértices e anéis. O critério do
diferencial é **topológico e de área com tolerância de 1 µm**, nunca igualdade byte a byte. Divergência maior que
isso é defeito, não ruído.

O flag nunca é persistido no projeto; a geometria que o kernel produz, sim, como qualquer geometria — por isso a
exigência de equivalência.

**Offset também está implementado**, com miter: `i_overlay::mesh::float::outline::offset::OutlineOffset` com
`OutlineStyle::new(delta_em_µm).line_join(LineJoin::Miter(π/3)).miter_min_turn(0.0)`. O ângulo interno mínimo de π/3
equivale ao `miter_limit = 2` do Clipper; `arc_tolerance` não se aplica a miter. O pior desvio medido no offset foi
6,9e-6 m² de área — dentro da tolerância do diferencial.

Uma diferença deliberada de contrato: entrada degenerada (anel com menos de 3 pontos, NaN/infinito, delta inválido)
devolve `Err(ERRO_ENTRADA)` e o seam refaz a operação em TypeScript. Antes, o caminho TS podia devolver `[]` para alguns
desses casos; agora quem decide é o TS, o que preserva o comportamento antigo.

## 4 — Como ligar e desligar

- **URL:** `?kernel=rust` liga; `?kernel=ts` desliga. O parâmetro vence o `localStorage` (`lerFlagDaUrl()` em
  `preferenciasKernel.ts`), o que permite medir os dois caminhos sem mexer na preferência salva.
- **Interface:** diálogo "Experimentais" liga e desliga; a escolha é gravada em `hestia:kernel` e vale para as
  próximas sessões do navegador. Recarregar a página garante estado limpo; a troca em quente é feita pelo carregador.
- **Desligar:** o mesmo diálogo, `?kernel=ts`, ou remover a preferência. Falha de carga/instanciação também deixa o
  kernel desligado, com o motivo visível no diálogo — o TypeScript atende tudo.

## 5 — Riscos

| Risco | Mitigação |
|---|---|
| Drift entre as duas implementações (uma corrige um caso que a outra não) | Diferencial em `packages/geom/src/kernel/equivalencia.test.ts`, rodado por `npm run test:wasm` e no job `wasm` do CI |
| Trap do wasm (panic, memória, entrada inválida) | Disjuntor em `operacoesKernel.ts` volta ao TypeScript na mesma chamada; `glue.test.ts` cobre o caminho de falha; `ops.rs` valida índices antes de usá-los |
| Deriva numérica de 1 µm | O kernel nunca é padrão; o flag não entra no `.hestia`; a tolerância do diferencial é explícita e não se afrouxa |
| Artefato commitado desatualizado ou corrompido | `npm run wasm:check` confere existência, assinatura `\0asm`, tamanho e o blob de `git hash-object`; roda no CI |
| Peso/velocidade de carga quando ligado | O `.wasm` é asset separado e só é buscado na ativação; o modo desligado não muda o bundle funcional |

## 6 — Critérios de saída

- **Sucesso:** redução de **≥ 25%** em `wallSolidBuildAllCold` e/ou `resolveAllWarm` (bench de Node, 20 pavimentos)
  com o diferencial verde. Aí o kernel pode ser candidato a padrão — decisão nova, não esta.
- **Empate:** arquivar a crate (sai da interface e do CI bloqueante) e **manter o harness** (diferencial,
  `wasm:check`, `perf-kernel`) para a próxima tentativa.
- **Falha:** divergência topológica sem explicação → revisar o algoritmo (quantização, colineares, furos).
  **Nunca afrouxar o teste** para o kernel passar.

## 7 — Medição

- `node scripts/perf-kernel.mjs` roda o cenário de 20 pavimentos do navegador duas vezes — `?kernel=ts` e
  `?kernel=rust` —, imprime mediana e p95 das medidas do runner com o ganho percentual e grava
  `scripts/perf-baselines/kernel-rust-20-pav-<data>.json` com `{ ts, rust, deltaPct }`. Os JSONs brutos de cada
  lado ficam em `scripts/perf-baselines/browser-20-pav-<data>-kernel-<lado>.json`.
- `node scripts/perf-kernel.mjs --simular` exercita parsing e relatório com números inventados, sem navegador.
- Node (`wallSolidBuildAllCold`, `resolveAllWarm`): `npm run bench:interacao -- --save` grava
  `scripts/perf-baselines/node-<data>.json`.
- **Medição feita em 2026-11-01** (`node scripts/perf-kernel.mjs`, 20 pavimentos, Chrome 156 headless, build de produção,
  5 execuções por lado). Mediana em ms; ganho positivo = kernel mais rápido:

| Medida (20 pavimentos) | TypeScript | Rust/WASM | Ganho |
|---|---:|---:|---:|
| Edição de parede (planta) | 75,8 | 42,1 | **+44,5%** |
| Inserir porta | 228,3 | 149,6 | **+34,5%** |
| Inserir janela | 213,6 | 144,9 | **+32,2%** |
| Abrir projeto (até o 2º quadro) | 446,8 | 390,4 | **+12,6%** |
| Abrir 3D — 1º quadro | 1.723 | 1.550 | +10,0% |
| Abrir 3D — carga completa | 1.755 | 1.567 | +10,7% |
| Planta do nível do meio | 92,7 | 94,9 | −2,4% |
| Pan 3D | 25,4 | 16,4 | +35,4% (ruído) |
| Órbita 3D / pick 3D | 18,9 / 24,5 | 18,4 / 23,9 | +2,6% / +2,5% |

- **Micro-benchmark do seam** (`node scripts/wasm-equivalencia.mjs`, 189 operações em 21 fixtures):
  **3,1–3,3× no total** das booleanas/offset (union 6,6×, difference 6,8×, intersection 4,5×, unionClipper 2,8×,
  differenceClipper 2,0×, offsetMulti 1,8×), com pior Δárea de 6,9e-6 m² e pior Δperímetro de 4,9e-6 m.
- **Equivalência:** 189/189 operações medidas, **0 divergências**, 0 não implementadas.
- **Custo no boot:** a primeira medição mostrou FCP ~11% pior e "página até o app pronto" ~33% pior ao ativar no boot
  (baixar 358 kB + instanciar competia com a primeira pintura). Correção aplicada: a ativação é adiada para o navegador
  ficar ocioso (`requestIdleCallback` com fallback de 2,5 s), e enquanto não fica pronta o seam usa o TypeScript — o que
  já acontecia naturalmente (as primeiras ~400 chamadas da sessão são TS). Re-medir o boot depois dessa mudança.
- **Leitura honesta:** o ganho aparece onde há geometria de verdade (edição, aberturas, abrir projeto/3D) e é nulo onde
  o custo é desenho na GPU (órbita, zoom, pan), como previsto. A medição tem ruído relevante (pan 3D e "planta" com p95
  oscilando), então os números valem por ordem de grandeza, não na terceira casa.
- **O critério de sucesso da §6 não foi medido na métrica exata** (`wallSolidBuildAllCold`/`resolveAllWarm` no bench de
  Node); o proxy de latência de edição no navegador (+44,5%) supera os 25%, mas a decisão de virar padrão continua sendo
  outra decisão, com bench de Node e máquina livre.

- Referências de ferramenta: `node scripts/perf-kernel.mjs` (A/B no navegador), `node scripts/perf-kernel.mjs --simular`
  (parsing sem navegador), `node scripts/wasm-equivalencia.mjs` (diferencial + tempos), `npm run bench:interacao -- --save`
  (bench de Node).

## 8 — Verificação e arquivos

- `npm run build:wasm` — compila a crate e publica o `.wasm` + `.sha256` (exige Rust; só quem mexe no kernel roda).
- `npm run wasm:check` — `scripts/verificar-wasm.mjs`: artefato presente, módulo wasm válido, tamanho entre 10 kB e
  2 MB e blob igual ao de `git hash-object`.
- `npm run test:wasm` — `vitest.wasm.config.ts`: contrato, carregador, glue/ABI e diferencial contra o TypeScript,
  fora da suíte padrão.
- CI: job `wasm` (`.github/workflows/ci.yml`), com `continue-on-error` como o job `perf`, rodando `npm ci`,
  `node scripts/verificar-wasm.mjs` e `npx vitest run --config vitest.wasm.config.ts`. **Sem Rust no CI**: o
  artefato é commitado.
- `crates/*/target/` está no `.gitignore`; o `.wasm` publicado em `packages/geom/assets/` é versionado de propósito.
