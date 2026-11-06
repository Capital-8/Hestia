# Changelog das referências de render (crates/render-engine/tests/fixtures)

Cada entrada registra por que uma referência PNG foi regenerada, a diferença medida contra a
referência antiga e quantos pixels mudaram. Tolerâncias não foram alteradas por nenhuma entrada.

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
