# Furo sobre o prisma em planta da camada: `furar_prisma` e `furo_prisma_furar`

Data: 2026-11-17. Continua `19`, `21`, `22` e `24` (§6, passo 1 da fase 2). Marcas: [V] verificado nesta sessão (`cargo test --lib furo_contorno`, 54 testes verdes, dos quais 12 novos); [I] inferência minha, a validar. Não rodei `npm run build:wasm`; a exportação nova só foi compilada nativamente, não em wasm32.

## 1. Problema e solução

`furar_parede` (`furo_contorno.rs:232`) fura uma placa `L x e x H`. A camada real, depois da junção, é um polígono em planta (esquadrejado, com cantos em esquadria ou chanfro, às vezes vazado) extrudado entre `z0` e `z1` (doc 24 §4.2 passo 4). `furar_prisma` toma esse prisma como alvo da booleana 3D. O cortador é o contorno do vão ([x, z]) extrudado na direção s, atravessando a camada com folga de 5 cm de cada lado da caixa da planta. Sem faixas, sem colunas, sem aproximar o arco [V].

Referencial: u ao longo da parede, s na espessura, z para cima. Na malha de saída, x = u, y = s [V].

## 2. API Rust (`crates/geom-wasm/src/furo_contorno_prisma.rs`)

- `CamadaPrisma { poligonos: Vec<PoligonoPlanta>, z0, z1 }`; `PoligonoPlanta = Vec<Vec<[f64;2]>>` (primeiro anel externo, demais furos; [u, s] em metros). Orientação livre: o externo vira anti-horário e os furos horários internamente [V: teste com recorte invertido].
- `furar_prisma(&[CamadaPrisma], &[Vao]) -> Result<ResultadoPrisma, ErroPrisma>`. `Vao` é o de `furo_contorno` (contorno [x, z] anti-horário aberto, `x`, `soleira`).
- `ResultadoPrisma { camadas: Vec<MalhaPrisma>, volume, volume_removido }`; `MalhaPrisma { z0, z1, vertices (xyz), indices, volume, volume_sem_furo }`. `volume_sem_furo` = área líquida da planta x (z1 - z0), medida no próprio polígono.
- Mudanças em arquivos existentes (só visibilidade e um método): `furo_contorno.rs` (`validar_anel`, `segmentos_se_tocam`, `unir` passam a `pub(crate)`); `furo_contorno_abi.rs` (`Estado::guardar`, `estado()` e `fatia()` `pub(crate)`; `Estado::furar` passa a chamar `guardar`, comportamento igual); `lib.rs` (3 linhas de `mod` e um comentário).

## 3. ABI `furo_prisma_furar`

Mesmo modelo de memória do doc 21 (alocar com `abi2_alocar`, little-endian, o wasm é dono das saídas). Usa os mesmos accessors `furo_saida_n/tipo/ptr/len/liberar` e `furo_erro_ptr/len` de `furo_contorno_furar` (estado único: uma chamada de qualquer das duas apaga as saídas da outra). `furo_contorno_furar` não mudou [V]. `furo_prisma_abi_versao() -> 1`.

```
furo_prisma_furar(n_camadas, n_poligonos, n_aneis, n_pontos_planta,
                  ptr_pontos_planta, ptr_aneis, ptr_poligonos, ptr_camadas, ptr_z,
                  n_vaos, n_pontos, ptr_pontos, ptr_vaos, ptr_x, ptr_soleira) -> u32
```

| Buffer | Tipo e tamanho | Conteúdo |
|---|---|---|
| `ptr_pontos_planta` | f64 x `2 * n_pontos_planta` | u, s de todos os anéis de planta, em ordem |
| `ptr_aneis` | u32 x `n_aneis + 1` | índice do primeiro ponto de cada anel; último = `n_pontos_planta` |
| `ptr_poligonos` | u32 x `n_poligonos + 1` | índice do primeiro anel de cada polígono (o primeiro é o externo); último = `n_aneis` |
| `ptr_camadas` | u32 x `n_camadas + 1` | índice do primeiro polígono de cada camada; último = `n_poligonos` |
| `ptr_z` | f64 x `2 * n_camadas` | z0, z1 de cada camada |
| `ptr_pontos`, `ptr_vaos`, `ptr_x`, `ptr_soleira` | como em doc 21 §4 | vãos (contorno [x, z] relativo à origem do vão) |

Todos os offsets: começam em 0, não decrescem, terminam no total. Um buffer de offsets tem sempre um elemento a mais que o número de itens, mesmo com 0 itens (aponta para um `0`).

Saída: os mesmos 5 arrays do doc 21 §5, com uma diferença: no array 0, `[z0, z1, volume, volume_sem_furo]` por camada (no lugar de `y0, y1`). Índices locais à camada [V: teste de layout].

## 4. Erros

Retorno: `0` OK, `3` ENTRADA, `5` LIMITE, `6` INTERNO; texto em `furo_erro_*`.

| Código | Causa |
|---|---|
| ENTRADA | tamanhos ou offsets incoerentes; zero camadas; `z0/z1` não finitos ou `z1 <= z0`; camada sem polígono ou sem área; anel de planta não simples, com ponto repetido ou área nula (regras de `validar_anel`); furo fora do externo, ou aneis do mesmo polígono que se tocam ou se cruzam; contorno de vão inválido (horário, auto-intersectado, ponto repetido, NaN); vão fora do envelope do conjunto de camadas (u entre o mínimo e o máximo da planta, z entre o menor `z0` e o maior `z1`); ponteiro inválido |
| LIMITE | vãos > 1024; pontos de vão > 65 536; camadas > 32; polígonos > 1024; anéis > 4096; pontos de planta > 65 536; pontos por vão > 4096; pontos por anel de planta > 4096 |
| INTERNO | status de erro do `manifold-rust` |

Os limites são checados antes de ler ponteiros. A validação toda precede a booleana (o produto compila com `panic = "abort"`) [V pelos testes de validação; spike de panic com entradas hostis não foi feito, [I]].

## 5. O que os testes provam (`furo_contorno_prisma_testes.rs`)

O removido esperado é calculado sem o kernel: o prisma e o cortador são separáveis, então `removido = integral de T(u) W(u) du`, com `T(u)` o comprimento em s da planta na posição u e `W(u)` o comprimento em z do contorno (cruzamentos par-ímpar, 200 000 passos). [V]

1. Retangular: camadas 5 x (cubo) com meia-lua e janela, volume por camada, total e removido iguais aos de `furar_parede` (1e-10).
2. Esquadria (trapézio em planta, ponta a 45 graus, espessura 0,30) e meia-lua longe das pontas: removido = área do polígono x 0,30 (1e-9), = fórmula analítica da meia-lua x 0,30 (1e-3, erro de inscrição das cordas) e = integração (1e-6); malha fechada, gênero 0.
3. Vão sobre a ponta em esquadria (esquerda, direita, encostado no limite): removido = integração (1e-6) e estritamente menor que área x espessura cheia; vão que passa da ponta é recusado (`VaoForaDaParede`).
4. Recorte em planta (anel interno atravessando todo z): vão fora, dentro e cruzando o recorte: removido = integração (1e-6); gênero 1 com o vão longe; mesma resposta com o recorte em orientação invertida. Também dois polígonos disjuntos na mesma camada.
5. Paridade com o caminho retangular de `a3c.rs`: 5 camadas, 2 vãos retangulares (porta e janela com peitoril), volume líquido por camada = soma por faixa de `volume_faixa(furos_de(fragmento, retângulos))`, quebrando em z nos peitoris e topos (1e-9). Usei as funções reais `furos_de` e `volume_faixa`; não passei pela `Cena`, então a paridade é contra o cálculo por faixas, não contra `quantidades_paredes` ponta a ponta [I: falta o teste via `Cena`, doc 24 §6 passo 1].
6. Extras: `z0` deslocado, vão que não toca a camada, sem vãos, 8 casos de validação, layout e erros da ABI via `furar_prisma_planos` e `Estado` (não chamei os wrappers `extern "C"` para não disputar o estado global com os testes da ABI antiga).

## 6. Limites e pendências

- Anéis do mesmo polígono não podem se tocar (nem em um vértice): furo encostado no bordo precisa ser fundido ao externo pelo chamador [I].
- Polígonos diferentes da mesma camada devem ser disjuntos; não verifico [I].
- Não há tratamento de topo inclinado (`inclinacao` de `volume_faixa`): o prisma é plano em z0 e z1. Camada com topo inclinado precisa de outro alvo (por exemplo, intersecção do prisma com semiespaço) [I].
- O vão é validado contra o envelope das camadas, não contra cada uma; um vão acima de uma camada mais baixa só não remove nada nela.
- Complexidade da validação de planta O(n^2) por anel e O(n*m) por par de anéis; os limites de 4096 pontos a mantêm em milissegundos [I: não medi no wasm].
- Falta o cliente TS e o `build:wasm`; `furo_prisma_furar` só existe como código nativo testado pelo núcleo (`furar_prisma_planos`). O wrapper `extern "C"` segue a mesma leitura de ponteiros de `furo_contorno_furar`, mas não foi exercitado em wasm32 [I].
