# Booleana 3D em Rust: bibliotecas e medição

Data: 2026-11-17. Complementa `10-plano-booleana.md`. Marcas: [V] verificado ou medido nesta sessão; [I] inferência.

## 1. Bibliotecas Rust consultadas (crates.io, 2026-11-17)

| Crate | Licença | O que é | Serve? |
|---|---|---|---|
| `manifold-rust` 0.19.2 | Apache-2.0 | Porte em **Rust puro** do Manifold (booleanas 3D, extrusão, cross-section, SDF), sem FFI. Tem motor "robusto" extra e feature `parallel` (rayon). Criado em 07/2026, 98 mil downloads, atualizado em 01/11/2026 [V] | **Sim, candidata principal** |
| `manifold-csg` / `-sys` | (bindings) | FFI para o manifold C++ | **Não**: exige C++, que o `Cargo.toml` do `geom-wasm` registra que não compila para wasm32 aqui [V] |
| `csgrs` 0.20 | MIT | CSG por árvores BSP em malhas | Não medida; BSP costuma ser menos robusto e mais lento que Manifold [I] |
| `i_overlay` (já usada) | MIT/Apache-2.0 | booleana e offset 2D | Continua para 2D; não faz 3D |
| `clipper2` e `clipper2-rust` | BSL-1.0 | Clipper2 em 2D | Dependência de `manifold-rust` (BSL-1.0 exige aviso no `NOTICE`) |

Dependências de `manifold-rust`: `clipper2-rust` (BSL-1.0), `dashu-int`/`dashu-ratio` (MIT ou Apache-2.0), `rustc-hash`, `num-traits`. Todas compatíveis com o MIT do Hestia; `NOTICE` precisa listá-las [V licenças; NOTICE não alterado].

## 2. Medição

Teste: parede com 5 camadas (1,5; 2; 9; 2; 1,5 cm; espessura 0,16 m; altura 2,8 m), aberturas em meia-lua de 0,9 m com 1,4 m de altura, espaçadas 1,5 m, uma subtração por camada com os cortadores unidos. Máquina deste container, um só núcleo, sem `parallel`. Código de teste fora do repositório (pasta de rascunho da sessão). Volume conferido: uma abertura = 0,7531 m³ (esperado 0,7531) [V].

| Caso | Rust nativo | Rust compilado para WASM (Node) | `manifold-3d` JS (C++ em WASM) |
|---|---|---|---|
| 24 cordas, 1 abertura | 2,9 ms | 5,3 a 7,0 ms | 9,1 a 10,4 ms |
| 64 cordas, 1 abertura | 7,0 ms | 10,0 ms | 15,3 ms |
| 24 cordas, 20 aberturas na mesma parede | n/m | 130 ms | 119 ms |
| 64 cordas, 20 aberturas | 300 ms | 377 a 399 ms | 212 a 265 ms |
| 256 cordas, 20 aberturas | 1984 ms | 2227 ms | 1450 ms |
| 24 cordas, 60 aberturas na mesma parede | n/m | 948 ms | 298 ms |

Leituras:
- **Rust em WASM e C++ em WASM têm a mesma ordem de grandeza.** Trocar de linguagem não é o que acelera. Em casos grandes o JS foi mais rápido, mas a comparação não é limpa: no meu teste o Rust unia os cortadores aos pares em sequência, e o JS usou a união em lote; o `manifold-rust` também tem união em lote, que não usei [V código; efeito [I]].
- **O custo domina pelo número de cordas e de aberturas na mesma parede**, não pela linguagem.
- **Cordas:** para uma meia-lua de 0,9 m, 24 cordas já dão erro de corda de cerca de 1 mm [I, conta de sagita]; passar de 24 para 64 mais que dobra o tempo sem ganho visível.
- Uma parede de 5 camadas com 1 a 4 aberturas em arco custa cerca de 5 a 45 ms em WASM [V]. Uma casa inteira reprocessada de uma vez pode chegar a segundos; por isso é preciso cache por parede.
- Não medi: paralelismo (`parallel` com rayon em WASM exige threads e SharedArrayBuffer, a validar [I]), paredes curvas, retorno do acabamento, e conversão de malha entre TypeScript e WASM.

## 3. Como deixar mais rápido

1. **Poucas cordas, adaptativas:** erro máximo de 1 mm dá 24 cordas na meia-lua de 0,9 m; usar menos durante arrasto.
2. **Só aberturas não retangulares** passam pela booleana 3D; as retangulares seguem no caminho atual.
3. **Cortador em cache por tipo:** extrudar uma vez e só transladar por instância.
4. **União em lote** dos cortadores de uma parede e **uma subtração por camada**.
5. **Cache por parede**, recalcular só a parede editada; fora da thread principal (Web Worker).
6. **Resolução em dois níveis:** malha grosseira enquanto arrasta, exata ao soltar.
7. **Rust dentro do kernel** evita copiar malhas entre TypeScript e WASM: a booleana viraria uma função do `geom-wasm`, recebendo só parâmetros (contorno, espessura, posição) e devolvendo a malha final.
8. Alternativa sem booleana: colunas verticais inclinadas em bandas 2D, que o `i_overlay` já resolve (ver `10`).

## 4. Riscos específicos do Rust

- Biblioteca jovem (criada em 07/2026, versão 0.19): maturidade e API podem mudar [V datas].
- Equivalência com o TypeScript: a regra "mesmas contas, mesma ordem" (decisão 0047 §7) não vale para essa booleana; exigiria teste por invariantes (volume, área), não por igualdade bit a bit.
- Tamanho do binário: o WASM de teste ficou com cerca de 1,4 MB antes de otimização de tamanho [V].
- Compila para `wasm32-unknown-unknown` com o toolchain do repositório (1.97.1) [V].

## 5. Recomendação

Se a booleana 3D for aprovada: usar `manifold-rust` dentro de `crates/geom-wasm`, com as otimizações 1 a 6, e medir de novo no spike com as paredes reais (curvas e acabamento). Se as colunas inclinadas servirem, a booleana não é necessária.
