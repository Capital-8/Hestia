# Changelog das referências de render (crates/render-engine/tests/fixtures)

Cada entrada registra por que uma referência PNG foi regenerada, a diferença medida contra a
referência antiga e quantos pixels mudaram. Tolerâncias não foram alteradas por nenhuma entrada.

## 2026-11-06 — sombras em cascata (CSM), três cascatas

- **Commit de causa:** WIP em `render/integracao-teste` que adiciona `cascatas.rs` (divisão, janelas, matrizes e
  buffer de cascatas) e altera `shader.wgsl` (`fator_sombra`, `sombra_cascata`, mistura entre cascatas, binding 9
  e 10), `motor.rs` (cascatas por câmera, com cache), `pipeline.rs` (array de profundidade e layouts),
  `iluminacao.rs` (sem `luz_vp`), `uniformes.rs` (256 bytes, antes 320) e `perfil.rs` (três mapas).
- **Motivo:** o mapa único de 2048 px cobria a esfera inteira da cena. Com a câmera perto da fachada, cada texel
  cobre mais que o necessário. As três cascatas dividem o volume de visão (λ = 0,75, de 0,14 m até a
  profundidade da caixa dos projetores), e cada uma tem a janela presa à menor entre a esfera do seu subfrustum
  e a caixa dos projetores. Onde a câmera está longe da caixa, a janela é a mesma de antes (texel de 1,13 cm).
  O piso da penumbra e da busca de bloqueadores passa a ser o texel da cascata; o teto continua na penumbra física
  de antes.
- **Efeito medido (referências h1, 640x360, comparadas com a versão anterior do arquivo):**

| Arquivo | Teste | Diferença máxima | Pixels com diferença > 0 | > 2 | > 3 | > 10 | Tolerância |
|---|---|---|---|---|---|---|---|
| `ref-h1-640x360.png` (1 amostra) | `motor::sem_msaa_bate_a_referencia_estrita` | 26 | 1519 | 230 | 159 | 18 | 2 (inalterada) |
| `ref-h1-msaa4-640x360.png` (MSAA x4) | `motor::imagem_inteira_igual_a_api_antiga_e_a_referencia`, `materiais::cena_h1_lida_como_v1_tem_tipo_zero_e_bate_a_referencia` | 26 | 1524 | 231 | 159 | 18 | 2 e 3 (inalteradas) |

  Total de pixels: 230400. A luminância média não muda (138,83 antes e depois, Rec. 709 sobre o sRGB). As
  diferenças estão só nas bordas da sombra do beiral no telhado e na parede, e da sombra da casa no chão (mapa de
  diferenças verificado). A linha de base reproduz a referência anterior com diferença 0.
- **Tiles e oclusão:** os testes de tiles (`tiles_com_msaa4_igualam_a_imagem_inteira`,
  `tiles_sem_msaa_igualam_a_imagem_inteira`) e `oclusao_escurece_a_base_da_parede_e_poupa_a_face_plana`
  passam sem mudança de constante ou de tolerância.
- **Regeneração:** `renderizar_hstr cena-h1.hstr ref-h1-640x360.png 640 360 1 0` e
  `renderizar_hstr cena-h1.hstr ref-h1-msaa4-640x360.png 640 360 4 0` (EV 0, 6500 K), com o build deste commit.

## 2026-11-05 — tone mapping AgX, balanço de branco e exposição automática (lote B)

- **Commit de causa:** alterações em `shader.wgsl` (`tonemapear`, `agx_contraste`, `AGX_*` no lugar de
  `aces`; uniforme `balanco`), `cor.rs` (`agx`, `ganhos_balanco_branco`, `exposicao_automatica`,
  `luminancia_media_da_cena`), `uniformes.rs` (`balanco`, 320 bytes), `iluminacao.rs` (`aplicar_camera`
  recebe os ganhos), `motor.rs` (`com_temperatura`, 6500 K por padrão), `renderizador.rs`
  (`renderizar_com_exposicao_automatica`, desligada por padrão) e o exemplo `renderizar_hstr`.
- **Motivo:** a curva ACES fixa cortava matizes saturados e deixava a luz branca amarelada; a exposição era
  só manual e não havia balanço de branco. A curva é AgX (Troy Sobotka, versão de Blender e three.js), com
  a mesma exposição em EV (2^EV antes da curva). A exposição padrão (EV 0) não mudou.
- **Medidas, vista padrão da casa (1280x720, MSAA x4), antes e depois:**

| Medida | Original (antes do lote A) | Lote A (ACES) | Lote B (AgX, EV 0) |
|---|---|---|---|
| Luminância média linear do quadro | 0,1734 | 0,2953 | 0,2335 |
| Pixels com R = G = B = 255 (céu e chão) | 0 | 0 | 0 |

  A vista com horizonte e o Sol de frente também não têm pixel em 255 nos três canais (pico do disco
  do Sol: 229, 231, 234).
- **Exposição automática (`auto`):** a estimativa da luminância média da cena (a partir da imagem
  tonemapeada, por inversa tabelada do AgX) deu 0,2340 e EV -0,379. O quadro final ficou com média linear
  0,1929. A estimativa é aproximada (não há HDR de volta), por isso o alvo não é exato.
- **Balanço de branco:** 6500 K é idêntico ao padrão (diferença zero). Em 3000 K o quadro fica mais azul
  (média RGB 127/126/133 para 131/144/168), o que compensa a luz quente, como no controle de temperatura
  de editores de foto.
- **Referências h1 (640x360):** a curva muda todos os pixels da imagem (inclusive a casa), porque é um
  mapeamento de tons global. Diferença máxima 32 (MSAA x4) e 31 (1 amostra); pixels com diferença acima de
  0: 230400 de 230400 nas duas. Luminância média linear 0,3857 para 0,2863. A tolerância de 2 falhava
  com a referência do lote A; por isso as duas foram regeneradas.

| Arquivo | Teste | Diferença máxima | Pixels com diferença > 0 | Pixels com diferença > 2 | Tolerância |
|---|---|---|---|---|---|
| `ref-h1-640x360.png` (1 amostra) | `motor::sem_msaa_bate_a_referencia_estrita` | 31 | 230400 | 230400 | 2 (inalterada) |
| `ref-h1-msaa4-640x360.png` (MSAA x4) | `motor::imagem_inteira_igual_a_api_antiga_e_a_referencia`, `materiais::cena_h1_lida_como_v1_tem_tipo_zero_e_bate_a_referencia` | 32 | 230400 | 230370 | 2 e 3 (inalteradas) |

Regeneração: `renderizar_hstr cena-h1.hstr ref-h1-640x360.png 640 360 1 0` e
`renderizar_hstr cena-h1.hstr ref-h1-msaa4-640x360.png 640 360 4 0` (EV 0, 6500 K).
- **Constantes de `oclusao_escurece_a_base_da_parede_e_poupa_a_face_plana` recalibradas** (não é a
  referência PNG, mas é a mesma medida absoluta): a base sem SSAO ia de 126,86 (ACES) para 119,58 e a face
  plana de 126,83 para 119,60 (AgX). Medidas com o SSAO desligado no sombreador, na mesma imagem H1 e pela
  mesma definição do teste. Com SSAO, a base cai 5,05% (limite de 5%, antes 7,0%) e a face plana varia
  0,02% (limite de 3%). A tolerância e as asserções não mudaram; a queda da base ficou perto do limite.

## 2026-11-05 — céu de fundo com horizonte e névoa de distância (lote A)

- **Commit de causa:** alterações em `shader.wgsl` (`fs_ceu`, `vs_ceu`, `fator_nevoa`, `fs_principal`),
  `ceu.rs` (`fator_nevoa`, `NEVOA_INICIO_M`, `NEVOA_FIM_M`), `iluminacao.rs` (`aplicar_camera` passa a
  preencher `inversa_vp`), `uniformes.rs` (`inversa_vp`, 304 bytes), `pipeline.rs` (pipeline `ceu`) e
  `motor.rs` (passe do céu antes do opaco).
- **Motivo:** o fundo era uma cor única (`Cena.fundo`), e o chão de render (até ~90 m nesta cena) ficava
  com uma borda seca contra ele. Agora o céu de fundo usa `radiancia_ceu` (o mesmo gradiente que já
  alimentava a irradiância SH e os reflexos, sem cor nova) com o horizonte abaixo de z = 0, e o chão
  recebe névoa de distância de 40 m a 85 m que o funde com a cor do horizonte. A casa fica entre 19 m e
  37 m, então a névoa não a alcança. O disco do Sol já existia em `radiancia_ceu`; o halo novo
  (`HALO_SOL`, `HALO_SOL_EXPOENTE`) só entra no fundo.
- **Efeito colateral documentado:** `Cena.fundo` não aparece mais no céu visível. Ele continua sendo a cor
  de limpeza do passe, que o céu cobre. Quem quiser um céu de cor única precisará de outro caminho.
- **Medida (vista com horizonte, 1280x720, coluna x = 40, mesma câmera com inclinação de 7,8 graus):** a
  transição céu-chão ia de 1 px (degrau de 109 níveis sRGB) para 121 px (10% a 90%). A vista padrão da
  cena (câmera a 29 graus para baixo) não enquadra o horizonte; por isso a medida usa a variante.
- **Medida (referência h1, 640x360, sem alterar tolerância):** diferença máxima 17 nas duas
  referências. Pixels com diferença acima de 0: 81211 (1 amostra) e 81479 (MSAA x4), de 230400. A
  diferença está no céu de fundo e no chão distante (névoa). O telhado, as paredes e as esquadrias da
  casa não mudam: a imagem tem diferença zero dentro da silhueta da casa (verificado no mapa de
  diferenças). A tolerância de 2 falhava com a referência antiga; por isso as duas foram regeneradas.

| Arquivo | Teste | Diferença máxima | Pixels com diferença > 0 | Pixels com diferença > 2 | Tolerância |
|---|---|---|---|---|---|
| `ref-h1-640x360.png` (1 amostra) | `motor::sem_msaa_bate_a_referencia_estrita` | 17 | 81211 | 81211 | 2 (inalterada) |
| `ref-h1-msaa4-640x360.png` (MSAA x4) | `motor::imagem_inteira_igual_a_api_antiga_e_a_referencia`, `materiais::cena_h1_lida_como_v1_tem_tipo_zero_e_bate_a_referencia` | 17 | 81479 | 81479 | 2 e 3 (inalteradas) |

Regeneração: `renderizar_hstr cena-h1.hstr ref-h1-640x360.png 640 360 1` e
`renderizar_hstr cena-h1.hstr ref-h1-msaa4-640x360.png 640 360 4` (exemplo do render-engine, com
`Motor::nativo_com_amostras`). A saída é determinística.

## 2026-11-05 — sombra do Sol dimensionada pelos projetores

- **Commit de causa:** `d03af5ef` (sombra do Sol dimensionada pelos projetores, sem a margem do chão).
  Alterações em `geometria.rs` (`caixa_dos_projetores`), `iluminacao.rs` (`esfera_da_sombra`) e `motor.rs`.
- **Motivo:** o volume de sombra passou a ajustar o raio à cena real (a margem do chão de render
  deixou de entrar). Cada texel do mapa de sombra ficou mais fino e a borda da sombra ficou mais nítida.
- **Medida:** luminância média da imagem 152,51 (referência antiga) para 152,37 (atual).
- **Onde a diferença está:** só nas bordas da sombra projetada no chão (casa, arbusto, laje do acesso)
  e na linha de sombra do beiral sobre o telhado. Verificado com o termo direto do Sol (imagem com o
  Sol normal menos a mesma cena com intensidade 0): todos os pixels com diferença acima de 2 estão a
  até 3 px de um ponto em que esse termo varia mais de 5 unidades (janela 7x7). Com o critério mais
  estrito (raio 2, variação acima de 20), 67 dos 2323 pixels ficam de fora; os inspecionados estão na
  borda direita da sombra no chão, com diferença entre 3 e 6. Faces, telhado iluminado e céu não mudaram.

| Arquivo | Teste | Diferença máxima | Pixels com diferença > 0 | Pixels com diferença > 2 | Tolerância |
|---|---|---|---|---|---|
| `ref-h1-640x360.png` (1 amostra) | `motor::sem_msaa_bate_a_referencia_estrita` | 116 | 3478 | 2212 | 2 (inalterada) |
| `ref-h1-msaa4-640x360.png` (MSAA x4) | `motor::imagem_inteira_igual_a_api_antiga_e_a_referencia`, `materiais::cena_h1_lida_como_v1_tem_tipo_zero_e_bate_a_referencia` | 113 | 3599 | 2323 | 2 e 3 (inalteradas) |

Total de pixels da imagem: 230400 (640x360). Os pixels com diferença acima de 2 correspondem a cerca
de 1% da imagem.

Regeneração: `Motor::nativo_com_amostras(1)` e `Motor::nativo()` (MSAA x4) sobre `cena-h1.hstr`,
codificados por `png_saida::codificar`. A saída é determinística: duas execuções geram o mesmo PNG.
