# Catálogos de fabricante (fase 2, ficha P3)

Dimensões de tubos e conexões como **dado**, não como número escrito dentro de cada família. Formato e funções: `packages/model/src/familia/catalogoMep.ts` (validação, conferência, `busca` para as famílias) e `catalogoMepCsv.ts` (criar ou levar tabelas à mão por CSV).

## Fontes obtidas (2026-11-24)
| Fabricante | Documento | Situação |
|---|---|---|
| Krona | Catálogo Técnico Esgoto 2025 (53 páginas) | Transcrito: 64 tabelas, 327 linhas (`catalogosMep/kronaEsgoto.ts`). URL e SHA-256 do PDF na fonte do arquivo. |
| Krona | Catálogo Técnico Linha Soldável 2025 (12 páginas) | Baixado; **ainda não transcrito**. |
| Tigre | Catálogo Predial 2025 (75 páginas) | **Sem cotas**: só código, bitola e quantidade. As cotas estão em fichas técnicas por produto, ainda não localizadas. |
| Amanco / Wavin | — | O site não respondeu daqui (conexão recusada). Nada obtido. |

Os PDFs **não** entram no repositório (material do fabricante): só os dados transcritos, a URL, a página e o hash. Para refazer: baixe o PDF, `pdftotext -layout`, rode `ferramentas/extrair-krona.py` e `ferramentas/gerar-ts.py`.

## Fidelidade
- Todo item nasce `CONFERIR`. Vira `conferido` só com `conferirItem(item, quem, quando)`; editar qualquer número volta para `CONFERIR`.
- A transcrição é automática (texto do PDF). O significado das letras vem do desenho do fabricante; **D, Z, A e E são leitura nossa** e estão marcados.
- `validarCatalogoMep` pega erro de digitação (espessura que não cabe, bolsa maior que o comprimento, bitola repetida, B + Z ≠ C no joelho). Não pega valor errado porém plausível: isso é conferência humana.

## Anomalias conhecidas do PDF da Krona (mantidas como impressas)
- Página 31, tubo da série reforçada: as linhas 0135 e 0136 saem ambas como bitola "50" (a 0135 tem D = 40). O validador acusa; o teste lista essa exceção de propósito.
- Linhas descartadas pelo extrator por número de colunas diferente do cabeçalho: caixa sifonada quadrada com sete entradas (página 27, código 0912) e joelho 45° reforçado (página 32, código 1415, só 2 valores). Precisam de transcrição manual.
- Cabeçalhos repetidos no PDF (ex.: joelho 90° "Z2 Z2"): a segunda ocorrência virou `Z2_2`.
- No tubo normal, D = d; na série reforçada, D ≠ d (D parece ser a bolsa). O significado de D por série precisa de conferência com o fabricante.
