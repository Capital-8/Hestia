# Spike Rust: furo de contorno livre com `manifold-rust`

Data: 2026-11-17. Continua `10-plano-booleana.md` e `11-rust-booleana-bibliotecas-e-medicao.md`. Marcas: [V] verificado nesta sessão (teste rodado ou medição); [I] inferência minha, a validar.

## 1. O que foi feito

- `crates/geom-wasm/src/furo_contorno.rs`: função pura `furar_parede(vaos, espessuras, comprimento, altura) -> Result<ResultadoFuro, ErroFuro>`. Não é exportada na ABI do wasm e nada existente a chama.
- `crates/geom-wasm/src/furo_contorno_testes.rs`: 8 testes.
- `lib.rs`: só `pub mod furo_contorno;` e `#[cfg(test)] mod furo_contorno_testes;`. `Cargo.toml`: `manifold-rust = "=0.19.2"` (a mesma versão do bench, fixada com `=`).
- Referencial: x ao longo da parede, y na espessura (camada 0 em `[0, e0]`, as demais empilhadas), z para cima. O contorno `[x, z]` (anti-horário, aberto) é posto em `(x do vão, soleira)`.
- Cada camada: `cube` menos a união dos cortadores de todos os vãos. O cortador é `Manifold::extrude` do contorno, girado 90 graus em x e transladado; cobre a camada com folga de 5 cm em y de cada lado. A união é em árvore balanceada, uma subtração por camada.
- Saída por camada: `y0`, `y1`, vértices (x, y, z intercalados, f64), índices (u32), volume e volume sem furo. No total: volume e volume removido.
- Erros tipados: parede inválida, espessura inválida, contorno inválido (menos de 3 pontos, não finito, horário, colinear ou de área nula), pontos repetidos consecutivos, auto-interseção, vão fora da parede, falha do kernel. Todos são checados antes da booleana, para que o kernel não receba contorno não simples.

## 2. Testes (`cargo test --lib furo_contorno` dentro de `crates/geom-wasm`: os 16 de `furo_contorno_testes.rs` passam, junto com os de quant e ABI) [V]

| Teste | Invariante |
|---|---|
| gravata borboleta (simétrica, área zero; e assimétrica, área positiva) | recusada com `AutoInterseccao(0)` |
| pontos repetidos (no meio, último igual ao primeiro, quase iguais a 1e-12) | recusados com `PontoRepetido(0)` |
| menos de 3 pontos; NaN e inf (x, z, origem do vão); colineares; quadrado de 0,5 µm | recusados com `ContornoInvalido(0)` |
| espícula de ida e volta; vértice sobre aresta não consecutiva | recusados com `AutoInterseccao(0)` |
| L côncavo simples (área 0,75 m2) | aceito; volume removido = área x espessura |
| meia-lua 0,9 x 1,4 (24 e 64 cordas) | volume removido = área do polígono x espessura (erro relativo menor que 1e-9); contra a meia-lua analítica o erro é menor que 0,1% |
| arco abatido 1,2 x 1,5, flecha 0,2 (48 cordas; raio 1,0 m) | idem |
| parede de 5 camadas (0,015; 0,02; 0,09; 0,02; 0,015) | por camada: removido = área x espessura; `y0`/`y1` empilham certo; removido/espessura é igual em todas |
| malha fechada (em todos os casos) | toda aresta orientada aparece uma vez e tem a oposta; volume pela divergência dos triângulos = volume do kernel (1e-9); característica de Euler dá genus 0 (meia-lua que toca o piso) e genus 1 (janela fechada com peitoril 0,9) |
| dois vãos | união dos cortadores: removido = soma das áreas |
| dois cortadores idênticos | a união não conta o furo duas vezes |
| sem vão | devolve a placa (12 triângulos por camada) |
| entradas inválidas | os cinco erros acima |

Caso coplanar: a meia-lua tem a base em z = 0, coplanar com a face inferior da parede. O kernel tratou sem dar malha aberta [V pelos testes]. Os vãos tocam o piso mas não ultrapassam a parede, então o caso "cortador atravessa o piso acabado" do doc 10 §4 não foi exercitado.

## 3. Tamanho do `.wasm` [V]

Comando: `cargo build --release --target wasm32-unknown-unknown` dentro de `crates/geom-wasm` (não existe workspace na raiz, então `-p geom-wasm` na raiz falha com "could not find Cargo.toml"; o artefato fica em `crates/geom-wasm/target/`, ignorado pelo git). Perfil release do repositório (lto, strip, opt-level 3, panic abort).

| Estado | Bytes |
|---|---|
| Antes (sem a dependência) | 2.646.958 |
| Depois, com o módulo e a dependência, nada exportado | 2.657.001 (+10 KB, +0,4%) |
| Depois, com o módulo realmente alcançável (sonda temporária exportando uma chamada de `furar_parede`, já removida) | 3.721.135 (+1.074.177 B, +40,6%) |
| Idem, gzip -9 | 1.079.242 (o gzip da versão sem a sonda não foi medido) |

Leitura: o custo de verdade é cerca de **+1,07 MB (+41%)**, e só aparece quando alguma exportação usa o módulo. Os +10 KB do caso "sem exportação" vêm de algo que o linker não eliminou; não investiguei o quê [I]. A sonda é uma subtração de meia-lua em 5 camadas, ou seja, o que for usado do `manifold-rust` já entra; mais usos (offset, `batch_boolean`) podem somar [I]. O bench do doc 11 media 1,4 MB para um wasm só com a booleana, e este número (1,07 MB) é coerente com ele [I].

## 4. O que é inferência [I] ou não foi verificado

- Desempenho: **não medido neste spike**. Os números do doc 11 (cerca de 5 a 45 ms para uma parede de 5 camadas com 1 a 4 vãos em WASM) continuam sendo a referência. Os testes rodaram em debug nativo.
- O wasm com a sonda **compila**, mas não foi **executado** (nem em Node nem no navegador). A execução em wasm do `manifold-rust` está verificada só pelo bench do doc 11.
- Equivalência com o TypeScript: não há; a comparação é por invariantes, como o doc 11 §4 já previa.
- Paredes curvas ou inclinadas, retorno do acabamento, folga entre camadas, vãos que atravessam várias paredes: fora do escopo.
- Tolerância geométrica do kernel (epsilon) não foi estudada; os testes mostram erro de volume menor que 1e-9 relativo nas medidas usadas, não um limite geral.
- Contorno não simples: o spike original validava só orientação, tamanho e finitude. Desde então a função recusa contorno com auto-interseção, pontos repetidos consecutivos e área degenerada, com `ErroFuro::AutoInterseccao`, `PontoRepetido` e `ContornoInvalido` (regras e ordem em `21-abi-furo-contorno.md` §6.1). Côncavo simples (L) é aceito e testado. Não foi medido se o kernel entrava em panic com esses casos antes da validação [I]. Tolerâncias: seno 1e-12 (relativo) e área mínima 1e-12 m².

## 5. Problemas encontrados

1. **A pasta `crates/geom-wasm` não é membro de workspace**: comandos `-p geom-wasm` só funcionam de dentro dela (o `cargo test -p geom-wasm furo_contorno` rodou lá).
2. **API do `manifold-rust`**: `extrude` recebe `&Vec<Vec<Vec2>>` e extruda em +z; o `rotate(90,0,0)` leva z a -y (conferido pelos testes de caixa em y). `batch_boolean` da biblioteca é sequencial par a par, não em lote real, por isso usei árvore balanceada própria [V lendo o código da versão 0.19.2].
3. **Dependências novas no binário**: `clipper2-rust` (BSL-1.0), `dashu-*`, `rustc-hash` etc. precisam entrar no `NOTICE` se a dependência for mantida (não alterei o `NOTICE`; tarefa fora do escopo).
4. **`Cargo.lock`** de `crates/geom-wasm` mudou com a nova dependência (já está num commit WIP automático; conferir antes de commitar).
5. O `edition = "2021"` do `geom-wasm` exige `#[no_mangle]` simples; o bench usa edição 2024 com `#[unsafe(no_mangle)]`.
6. O commit automático `849d683` ("WIP spike Rust") capturou um estado intermediário com a **sonda temporária `sonda_furo_tmp`** no fim de `furo_contorno.rs`. Ela foi removida na árvore de trabalho depois; quem for commitar deve usar a versão atual do arquivo.
