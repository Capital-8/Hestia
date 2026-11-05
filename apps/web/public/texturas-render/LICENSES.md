# Texturas PBR - licenças e origem

Todas as texturas foram baixadas do Poly Haven (polyhaven.com), em resolução 1K, formato JPG.
Licença confirmada na página de cada material: **CC0** (domínio público, sem obrigação de atribuição).
Data de download: 2026-11-05.

| Material (pasta) | Arquivos | URL da página | Licença | Autor(es) | Data de publicação (API) | Data de download |
|---|---|---|---|---|---|---|
| tijolo_vermelho | albedo.jpg, normal.jpg, roughness.jpg (1024x1024) | https://polyhaven.com/a/large_red_bricks | CC0 | Rob Tuytel | 2019-05-04 | 2026-11-05 |
| reboco_estuque | albedo.jpg, normal.jpg, roughness.jpg (1024x1024) | https://polyhaven.com/a/white_stucco_02 | CC0 | Dimitrios Savva | 2026-10-05 (ver nota) | 2026-11-05 |
| madeira_tabua | albedo.jpg, normal.jpg, roughness.jpg (1024x1024) | https://polyhaven.com/a/brown_planks_03 | CC0 | Rob Tuytel | 2018-06-22 | 2026-11-05 |
| telha_argila | albedo.jpg, normal.jpg, roughness.jpg (1024x1024) | https://polyhaven.com/a/clay_roof_tiles_02 | CC0 | Amal Kumar | 2024-07-04 | 2026-11-05 |
| pedra_arenito | albedo.jpg, normal.jpg, roughness.jpg (1024x1024) | https://polyhaven.com/a/large_sandstone_blocks | CC0 | Rob Tuytel | 2021-10-19 | 2026-11-05 |
| concreto_parede | albedo.jpg, normal.jpg, roughness.jpg (1024x1024) | https://polyhaven.com/a/concrete_wall_008 | CC0 | Dario Barresi (processing), Charlotte Baglioni (photography) | 2023-01-31 | 2026-11-05 |
| metal_chapa | albedo.jpg, normal.jpg, roughness.jpg, metalness.jpg (1024x1024) | https://polyhaven.com/a/metal_plate_02 | CC0 | Rob Tuytel | 2024-08-15 | 2026-11-05 |
| piso_ceramico | albedo.jpg, normal.jpg, roughness.jpg (1024x1024) | https://polyhaven.com/a/large_grey_tiles | CC0 | Rob Tuytel | 2019-06-12 | 2026-11-05 |

Fontes dos arquivos (padrão de URL, 1K JPG): https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/<slug>/<slug>_{diff|nor_gl|rough|metal}_1k.jpg

Notas:
- Mapas de normal no formato OpenGL (nor_gl), conforme a convenção do Poly Haven.
- Os arquivos de roughness e metalness são monocromáticos (modo L), exceto concreto_parede, cujo roughness está em RGB.
- Materiais sem mapa de metalness usam só albedo, normal e roughness.
- Nota sobre datas: a data de publicação de reboco_estuque (2026-10-05) vem do campo date_published da API e não bate com o texto "1 day ago" lido na página. Confirmar na página antes de usar a data como registro formal.
- Tamanho total: 14,52 MB (13,85 MiB). Maior conjunto: reboco_estuque com 2,38 MB.

## Nomes publicados no Hestia

- Arquivos copiados como `<material>_albedo.jpg`, `<material>_normal.jpg`, `<material>_roughness.jpg` e, só em `metal_chapa`, `metal_chapa_metalness.jpg`. Os mapas de normal continuam em JPEG (o original já era JPEG); não foram convertidos para PNG para manter o conjunto dentro do limite de 15 MB.
- Os arquivos `.jpg` de normal do Poly Haven são o mapa OpenGL (`nor_gl`), conforme as notas acima.
- Redução: o carregador do app limita o lado maior a 1024 px antes de gerar os mips (ver `apps/web/src/editor/render/texturaRender.ts`).
