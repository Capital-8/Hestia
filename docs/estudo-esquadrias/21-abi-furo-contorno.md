# ABI do furo por contorno: `furo_contorno_furar`

Data: 2026-11-17. Continua `19-spike-rust-furo.md`. Marcas: [V] verificado nesta sessão (teste rodado ou checagem de compilação); [I] inferência minha, a validar.

## 1. O que foi feito

- `crates/geom-wasm/src/furo_contorno_abi.rs`: exportação `furo_contorno_furar` e accessors de saída e erro. O núcleo é `furar_planos(&Entradas)`, puro, sobre slices; os wrappers `extern "C"` só convertem ponteiros em slices.
- `crates/geom-wasm/src/furo_contorno_abi_testes.rs`: 14 testes.
- `crates/geom-wasm/src/lib.rs`: só duas linhas de `mod` (`pub mod furo_contorno_abi;` e `#[cfg(test)] mod furo_contorno_abi_testes;`).
- Não foram alterados: `abi2.rs`, `Cargo.toml`, `packages/geom/assets`. Não rodei `npm run build:wasm`.

## 2. Modelo de memória (igual à ABI v2, `abi2.rs`)

- Ponteiros são `u32` na memória linear, little-endian, alvo `wasm32-unknown-unknown`.
- **Entrada**: o JS reserva cada buffer com `abi2_alocar(bytes)` (alinhado a 8, zerado), escreve, chama `furo_contorno_furar` e libera com `abi2_liberar(ptr, bytes)`. O wasm não guarda ponteiro de entrada depois de retornar. Antes de escrever, o JS reconstrói as views a partir de `memory.buffer`.
- **Saída**: o wasm é dono dos arrays. `furo_saida_n()` dá o número de arrays; `furo_saida_tipo(i)` (1 = u32, 3 = f64), `furo_saida_ptr(i)` e `furo_saida_len(i)` (nº de **elementos**). Valem até a próxima `furo_contorno_furar` ou `furo_saida_liberar()`. O JS copia o que quiser guardar e nunca libera saída com `abi2_liberar`.
- **Estado separado**: a ABI tem estado próprio. Ela usa `furo_saida_*` e `furo_erro_*`, não `saida_*` e `erro_*` da v2, porque o `Nucleo` da v2 é privado e a v2 não foi alterada.
- **Só wasm32**: como em `abi2::fatia`, ponteiros fora de wasm32 são recusados (exceto `n = 0`). Os testes nativos cobrem `furar_planos` e `Estado`.

## 3. Exportações

| Função | Assinatura (wasm) | Retorno |
|---|---|---|
| `furo_abi_versao` | `() -> u32` | `1` (versão deste layout) |
| `furo_contorno_furar` | `(n_vaos u32, n_pontos u32, ptr_pontos u32, ptr_vaos u32, ptr_x u32, ptr_soleira u32, n_camadas u32, ptr_espessuras u32, comprimento f64, altura f64) -> u32` | código de erro |
| `furo_saida_n` | `() -> u32` | nº de arrays de saída (0 depois de erro) |
| `furo_saida_tipo` / `furo_saida_ptr` / `furo_saida_len` | `(i u32) -> u32` | tipo, endereço, nº de elementos |
| `furo_saida_liberar` | `()` | |
| `furo_erro_ptr` / `furo_erro_len` | `() -> u32` | texto UTF-8 do último erro (vazio após sucesso) |

## 4. Layout dos buffers de entrada

Todos são arrays planos, little-endian, cada um alocado separadamente (alinhado a 8).

| Buffer | Tipo e tamanho | Conteúdo |
|---|---|---|
| `ptr_pontos` | f64 × `2 * n_pontos` | x, z intercalados de todos os contornos, concatenados por vão. Coordenadas em metros, relativas à origem do vão (meio da base), anti-horário, aberto. |
| `ptr_vaos` | u32 × `n_vaos + 1` | Índice do primeiro ponto de cada vão. Vão `i` é `pontos[vaos[i] .. vaos[i+1]]`. Exige `vaos[0] = 0`, `vaos[n_vaos] = n_pontos` e não decrescente. |
| `ptr_x` | f64 × `n_vaos` | Posição x da origem de cada vão, ao longo da parede. |
| `ptr_soleira` | f64 × `n_vaos` | Cota z da origem de cada vão (soleira ou peitoril). |
| `ptr_espessuras` | f64 × `n_camadas` | Espessura de cada camada, em y crescente (camada 0 ocupa `[0, e0]`). |
| `comprimento`, `altura` | f64 (argumentos) | Dimensões da parede. |

Referencial: x ao longo da parede, y através da espessura, z para cima, como no spike (doc 19 §1).

Vão sem contorno: `n_vaos = 0`, `ptr_vaos` aponta para um único `0`, e `n_pontos = 0`. O resultado é a placa inteira.

## 5. Layout das saídas

`furo_contorno_furar` devolve sempre 5 arrays nesta ordem. `C` é o nº de camadas, `V_i` e `T_i` os vértices e índices da camada `i`.

| Índice | Tipo | Len (elementos) | Conteúdo |
|---|---|---|---|
| 0 | f64 | `4C` | Por camada: `y0, y1, volume, volume_sem_furo`. |
| 1 | u32 | `2C` | Por camada: `n_vertices, n_indices` (`n_indices = 3 * triângulos`). |
| 2 | f64 | `3 * sum(V_i)` | x, y, z intercalados de todas as camadas, em ordem. |
| 3 | u32 | `sum(T_i)` | Índices de todas as camadas, em ordem, **locais à camada** (0-based). |
| 4 | f64 | `2` | `volume_total, volume_removido`. |

Para ler a camada `i`, o JS soma os `n_vertices` e `n_indices` das camadas anteriores para achar o início em `saida 2` (÷3 para vértices) e em `saida 3`.

## 6. Códigos e erros

| Código | Nome | Quando |
|---|---|---|
| 0 | OK | Sucesso. |
| 3 | ENTRADA | Ponteiro inválido; buffers de tamanhos incoerentes; offsets de contorno fora do padrão; parede sem camada; espessura, comprimento ou altura não positivos ou não finitos; contorno com menos de 3 pontos, coordenada não finita, horário, de área nula ou colinear; contorno com pontos repetidos consecutivos; contorno auto-intersectado; vão que sai da parede. |
| 5 | LIMITE | Mais de `LIMITE_VAOS` (1024) vãos, `LIMITE_PONTOS` (65 536) pontos somados, `LIMITE_PONTOS_POR_VAO` (4096) pontos num único vão ou `LIMITE_CAMADAS` (32) camadas. |
| 6 | INTERNO | Falha do kernel `manifold-rust` (`ErroFuro::Manifold`). |

Em qualquer erro, as saídas anteriores são descartadas (`furo_saida_n() = 0`) e `furo_erro_*` traz o texto, como `entrada invalida: vao 0 sai da parede`.

### 6.1 Validação do contorno (antes da booleana)

Cada contorno é validado no núcleo puro, antes de qualquer chamada ao `manifold-rust`, porque o kernel pode entrar em panic com contorno não simples e o produto compila com `panic = "abort"`. Na ordem:

1. menos de 3 pontos, ou coordenada não finita (NaN, inf): `contorno invalido` (ENTRADA);
2. dois vértices consecutivos iguais, ou a menos de 1 nm (1e-9 m), contando o último com o primeiro: `contorno com pontos repetidos consecutivos` (ENTRADA);
3. todos os pontos colineares (anel reduzido a um segmento): `contorno invalido` (ENTRADA), área nula;
4. auto-interseção: arestas não consecutivas que se cruzam ou se tocam (inclusive vértice sobre aresta), ou arestas consecutivas que se sobrepõem além do vértice comum (espícula de ida e volta): `contorno auto-intersectado` (ENTRADA);
5. área com sinal menor ou igual a 1e-12 m² (horário ou degenerado): `contorno invalido` (ENTRADA);
6. só então, caixa envolvente dentro da parede: `vao sai da parede` (ENTRADA).

A gravata borboleta cai no passo 4 mesmo quando a área com sinal é zero, porque a checagem de auto-interseção vem antes da área. Côncavo simples (por exemplo, um L) é aceito.

Tolerâncias: o seno do ângulo entre dois braços abaixo de 1e-12 conta como colinear, então a tolerância é relativa e vale em qualquer escala. A checagem é O(n²) por contorno. Por isso existe o limite de 4096 pontos por vão. Sem ele, um contorno de 65 536 pontos (o máximo global) faria ~2e9 comparações dentro do wasm.

Os limites são escolhas minhas [I], sem medição de custo. Servem para que um JS mal-escrito não peça uma malha enorme. O de pontos por vão tem a razão de custo acima.

## 7. O que foi verificado

- 14 testes passam no arquivo `furo_contorno_abi_testes.rs`, rodados com `cargo test --lib furo_contorno` de dentro de `crates/geom-wasm` (o filtro pega os 42 testes de `furo_contorno*`, todos verdes) [V]:
  - layout de saídas e tipos (5 arrays, tipos 3,1,3,1,3, tamanhos);
  - meta e totais batem com as camadas (y empilhado, volume sem furo, removido = área x espessura total, erro < 1e-8) [V];
  - índices locais e válidos por camada, com múltiplo de 3 [V];
  - sem vão devolve a placa (8 vértices e 36 índices por camada) [V];
  - dois vãos iguais não furam duas vezes [V];
  - determinismo [V];
  - 10 entradas inválidas viram ENTRADA [V];
  - contornos não simples e degenerados (gravata borboleta, espícula, pontos repetidos, NaN, colineares, menos de 3 pontos) viram ENTRADA com o texto do erro [V];
  - contorno côncavo simples (L) passa, e o volume removido é a área do L x espessura [V];
  - limites viram LIMITE, inclusive 4097 pontos num vão [V];
  - `Estado`: saídas são limpas no erro e o erro é limpo no sucesso [V];
  - wrappers fora de wasm32 recusam ponteiros e respeitam o limite [V].
- `cargo check --lib --target wasm32-unknown-unknown` passa, o que cobre o ramo real de `fatia` e `memory_size` [V]. Não foi feito build de release nem medição de tamanho.

## 8. O que não foi verificado

- **Execução no wasm.** Nenhuma chamada foi feita de dentro de um wasm ou de Node. O caminho ponteiro → slice só foi checado por compilação [I].
- **Lado JS.** Não há cliente TypeScript para este layout. Não foi escrito nem testado em `packages/geom`.
- **Panic do kernel com contorno não simples.** Agora esses contornos são recusados por validação (§6.1), e os testes nativos cobrem os casos listados. Não rodei o kernel com eles para ver o panic que existia, então a garantia é a da validação, não uma medição. Também não há teste de quase-toque (vértice a poucos nm de aresta não consecutiva): a classificação segue a tolerância de §6.1 [I].
- **Custo da checagem de auto-interseção.** É O(n²) por contorno. Nenhum tempo foi medido, nem em debug nativo nem em wasm com 4096 pontos num vão [I].
- **Duplicação com `abi2.rs`.** `fatia` e a checagem de limite de memória foram copiados para não alterar `abi2.rs`. Vale unificar depois, tornando `fatia` `pub(crate)`.
- **`NOTICE`.** Continua pendente, como no doc 19 §5.3.

## 9. Próximos passos sugeridos

1. Decidir se a ABI de furo deve compartilhar o estado e os accessors da v2 (`saida_*`, `erro_*`) em vez de ter o próprio. Hoje está separada por escolha de escopo.
2. Escrever um teste em Node que carregue o `.wasm` e chame `furo_contorno_furar` com buffers reais, para cobrir o caminho de ponteiros.
3. Medir em wasm o custo da checagem O(n²) com 4096 pontos num vão, antes de expor a função no produto.
