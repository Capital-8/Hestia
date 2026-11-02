# Decisão 0046 — Kernel Rust: contrato de execução e ABI v2

Decidido em 2026-11-01 com o dono. Estende a [0045](0045-kernel-rust-experimental.md) (kernel experimental de
booleanas) para um plano de migração gradual do motor geométrico para Rust/WebAssembly, **fatia por fatia, de baixo
para cima**, com o TypeScript como referência de correção e como plano B até cada fatia ser liberada.

## 1 — Ordem de execução (fixa)

| Fase | Entrega | Estado |
|---|---|---|
| 0 | Base: ABI v2, esquema único, instância recriável, índice espacial, harness por pavimento, CI | esta decisão |
| A | Resolução das paredes de um pavimento (quadros, junções, grupos, peças resolvidas) numa chamada só | depois da revisão da Fase 0 |
| B | Pisos, lajes, contornos de camada, cortadores e junção entre pavimentos | |
| C | Malha 3D: triangulação, extrusão com vãos, arestas; atualização só do elemento alterado | |
| D | Geometria da planta e `computeSection` | |
| E | BVH de picking, esqueleto do telhado, quantitativos, validações, exportações | |

Não migram: React, desenho do three.js, cola de editor e comandos.

## 2 — Contrato de execução (decisões confirmadas)

1. **Fronteira e dados.** O projeto entra no WASM **uma vez**, em seções de colunas (um array tipado por campo, ids
   internados em `u32`); mudanças entram como upsert/remoção de linhas; respostas voltam como arrays tipados. O formato
   é descrito por `crates/geom-wasm/schema/cena-v1.json` (fonte única, versionada). Um teste de contrato de cada lado
   (TS e Rust) lê esse JSON e confere as constantes.
2. **O estado do Rust é cache.** A fonte da verdade é o projeto no JavaScript. Toda instância, cena e saída pode ser
   descartada e reconstruída a partir dele. Isso é o que torna segura a recriação de instância.
3. **Falha.**
   - *Leve* (`ENTRADA`, `NAO_IMPLEMENTADO`, `LIMITE`): só aquela chamada é refeita em TypeScript; o kernel continua ligado.
   - *Grave* (`VERSAO`, `HANDLE`, `INTERNO`, trap do wasm): descarta a instância, recria, **reenvia a cena** e repete a
     chamada. **No máximo 3 recriações em 5 minutos**; ao exceder, o kernel desliga na sessão com o motivo visível.
   - O Rust nunca entra em `panic` por entrada do usuário: todo caminho valida antes de usar e devolve código.
4. **Equivalência.** Referência = TypeScript atual. Compara área, volume, contagem de peças e topologia com tolerância de
   **1 µm** (coordenada) e **1e-6 m²/m³** (área/volume), nunca texto de vértices. Cada fatia exige igualdade no projeto
   real (`edificio-dwg_v2`, 11 pavimentos), em sintéticos de 10 e 20 pavimentos e em testes de propriedade. **A tolerância
   não se afrouxa para passar.**
5. **Desempenho.** Cada fatia declara antes de começar um alvo medido **de ponta a ponta incluindo a travessia da
   fronteira**, no Node e no navegador. Fatia que não é mais rápida que o TypeScript no cenário real não é liberada.
6. **Liberação.** Cada fatia tem chave própria (`?kernelFatias=A,B` e `localStorage hestia:kernel:fatias`);
   `?kernel=rust` liga todas as fatias existentes (compatível com a 0045). O TypeScript é o caminho padrão e o fallback
   até a fatia passar nos testes **e** na validação visual do dono no projeto real. Só então o padrão muda, em decisão
   separada.
7. **Paralelismo.** Uma instância por worker; sem memória compartilhada nesta fase (exigiria COOP/COEP e outro build).
   O ABI não impede isso depois.
8. **Build.** O `.wasm` continua commitado (o deploy não tem Rust). O CI compila o Rust, roda os testes **contra o
   binário recém-compilado** e confere que o artefato commitado não está defasado por um **hash das fontes**
   (`geom_wasm.fonte.sha256`: `src/**/*.rs`, `schema/*.json`, `Cargo.toml`, `Cargo.lock`, versão do toolchain). Regra:
   só uma branch regenera o binário por vez; conflito de binário se resolve **recompilando**, nunca mesclando o arquivo.
   `rust-toolchain.toml` fixa a versão.
9. **Dependências.** Só crates em Rust puro compatíveis com `wasm32-unknown-unknown`, licença permissiva, registro em
   `NOTICE`.
10. **ABI v1** (booleanas com polígonos) continua exportada e funcionando até a fatia A cobrir o mesmo uso; depois sai.

## 3 — ABI v2

Alvo `wasm32-unknown-unknown`, sem `wasm-bindgen`, funções `extern "C"`, valores `u32`/`f64`. Little-endian. Os
ponteiros são `u32` (offsets na memória linear). **Depois de qualquer chamada ao wasm, o JS reconstrói as views a partir
de `memory.buffer`** (a memória pode ter crescido e destacado o buffer anterior).

### 3.1 Exportações

| Função | Assinatura | Descrição |
|---|---|---|
| `abi2_versao` | `() -> u32` | `2` |
| `abi2_esquema_versao` | `() -> u32` | `versao` de `cena-v1.json` (`1`) |
| `abi2_alocar` | `(bytes: u32) -> u32` | ponteiro alinhado a 8 bytes, ou `0` em falha |
| `abi2_liberar` | `(ptr: u32, bytes: u32)` | libera uma alocação de `abi2_alocar` |
| `cena_criar` | `() -> u32` | handle `>= 1`, ou `0` em falha |
| `cena_destruir` | `(h: u32) -> u32` | código |
| `cena_definir_secao` | `(h, secao: u32, n_linhas: u32, ptr: u32) -> u32` | substitui **todas** as linhas da seção |
| `cena_upsert_linhas` | `(h, secao, n_linhas, ptr) -> u32` | insere ou substitui linhas pela chave da seção |
| `cena_remover_linhas` | `(h, secao, n_ids: u32, ptr_ids: u32) -> u32` | remove linhas pelos ids (`u32[]`) |
| `cena_executar` | `(h, consulta: u32, n_args: u32, ptr_args: u32) -> u32` | executa a consulta; `ptr_args` é `f64[n_args]` |
| `saida_n` | `() -> u32` | quantas saídas a última consulta produziu |
| `saida_tipo` / `saida_ptr` / `saida_len` | `(i: u32) -> u32` | código de tipo, ponteiro e **nº de elementos** da saída `i` |
| `saida_liberar` | `()` | libera as saídas (também liberadas na próxima `cena_executar`) |
| `erro_ptr` / `erro_len` | `() -> u32` | texto UTF-8 do último erro (diagnóstico) |
| `memoria_usada` | `() -> u32` | bytes vivos (diagnóstico e teste de vazamento) |

Códigos: `0` OK · `1` VERSAO · `2` HANDLE · `3` ENTRADA · `4` NAO_IMPLEMENTADO · `5` LIMITE · `6` INTERNO.

### 3.2 Layout de uma seção (`ptr`, `n_linhas`)

Colunas **na ordem do esquema**, cada uma contígua (**column-major**), `n_linhas * tamanho_do_tipo` bytes, cada coluna
preenchida até múltiplo de 8 bytes. Sem cabeçalho: `secao` e `n_linhas` vão nos argumentos. Chave duplicada na mesma
chamada ou chave ausente (`id_num = 0xFFFFFFFF`) → `ENTRADA`. `f64` não finito → `ENTRADA`.

### 3.3 Consultas

Os argumentos de qualquer consulta viajam num `Float64Array` (inteiros são exatos em `f64`). As saídas são arrays
tipados válidos **até a próxima `cena_executar` ou `saida_liberar`**; o JS copia o que quiser guardar. Resultados em ordem
determinística (a do esquema: ids crescentes / pares lexicográficos). Consulta desconhecida → `NAO_IMPLEMENTADO`.

### 3.4 Invariantes

- Mesma entrada → mesma saída, byte a byte (sem dependência de endereço, hash aleatório ou ordem de iteração de mapas).
- Toda geometria usa a quantização a 1 µm da 0045 (`floor(x*1e6+0.5)`).
- `memoria_usada()` volta ao valor inicial depois de `cena_destruir` (teste de vazamento).
- Limites do esquema (`limites`): linhas por seção e bytes por chamada; excesso → `LIMITE`.

## 4 — Lado TypeScript (`packages/geom/src/kernel/v2/`)

- **Gerenciador de instância**: compila o módulo uma vez por thread, instancia, valida `abi2_versao` e
  `abi2_esquema_versao`, aplica a política de recriação do item 3 e expõe o estado ao diálogo "Experimentais".
- **Cena** (`CenaV2`): `definirSecao`, `upsert`, `remover`, `consultar`, `destruir`. Mantém uma **fonte da cena**
  (função que reenvia tudo) para a recriação.
- **Codificação por esquema**: um único módulo gerado ou dirigido por `cena-v1.json`; o teste de contrato garante que
  tipos, ordem de colunas, ids de seção/consulta e códigos batem com o Rust.
- **Erros**: `ErroKernelLeve` (o chamador cai para o TypeScript naquela chamada) e `ErroKernelGrave` (já tratado pelo
  gerenciador; só chega ao chamador se desligou).
- **Fatias**: `kernelFatiaLigada('A'|'B'|…)` lê `?kernelFatias=` e `localStorage hestia:kernel:fatias`; `?kernel=rust` liga
  todas.

## 5 — Harness por pavimento

`scripts/kernel-harness.mts <projeto.json> [--sintetico N] [--wasm caminho]` roda cada consulta do esquema por
pavimento, compara a saída do Rust com uma implementação de referência em TypeScript (força bruta, no próprio harness),
reporta divergências e tempos **incluindo a travessia da fronteira**, e sai com código ≠ 0 se algo divergir. As fatias
seguintes acrescentam suas consultas ao esquema e suas referências ao harness.

## 6 — Critérios de aceite da Fase 0

1. `cargo test` nativo e `vitest --config vitest.wasm.config.ts` passam; teste de contrato do esquema nos dois lados.
2. ABI v2 completa (3.1) com: handles, seções, upsert/remoção, três consultas, índice espacial (grade) em Rust,
   `memoria_usada` estável após destruir cena.
3. Recriação de instância com o limite 3/5 min testada (injetando falha grave) e fallback leve testado.
4. Harness roda no projeto real e em sintético, 0 divergências, tempos reportados.
5. CI compila o Rust, testa contra o binário novo e falha se `geom_wasm.fonte.sha256` estiver defasado.
6. ABI v1 e todos os testes atuais do kernel continuam passando. Nada muda para o usuário (kernel segue desligado por
   padrão).
7. A fase **para** aqui para revisão do dono antes da fatia A.
