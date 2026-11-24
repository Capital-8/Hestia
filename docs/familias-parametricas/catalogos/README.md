# Catálogos de fabricante (fase 2, ficha P3)

Dimensões de tubos e conexões como **dado**, não como número escrito dentro de cada família. Formato e funções: `packages/model/src/familia/catalogoMep.ts` (validação, conferência, `busca` para as famílias) e `catalogoMepCsv.ts` (criar ou levar tabelas à mão por CSV).

## Fontes obtidas (2026-11-24)
| Fabricante | Documento | Situação |
|---|---|---|
| Krona | Catálogo Técnico Esgoto 2025 (53 páginas) | Transcrito: 64 tabelas, 327 linhas (`catalogosMep/kronaEsgoto.ts`). URL e SHA-256 do PDF na fonte do arquivo. Títulos tirados da mesma coluna do desenho (o pdftotext intercala os rótulos); uma tabela ficou sem título legível (código 1413). |
| Krona | Catálogo Técnico Linha Soldável 2025 (12 páginas) | Transcrito: 17 itens, 200 linhas (`catalogosMep/kronaSoldavel.ts`); `A` é o diâmetro externo, então a parede sai de (A − D) / 2. |
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

- Redução excêntrica (página 16), linha 0657 (150 x 100): o PDF traz d = 15,0 (erro de impressão evidente, deveria ser 101,6 ou 150). A família deixa essa linha de fora e o teste registra a exceção; o validador acusa D e d muito diferentes.
- Anéis de vedação, válvula de retenção, terminal de ventilação, luva com fixador, sifão e caixas sifonadas estão transcritos mas não têm geometria; o tê de inspeção, a junção dupla e invertida, o joelho com visita e a curva de pé de coluna também não.
- No tê de redução soldável, C1 é o comprimento da corrida e C2 o do ramal (o inverso do tê comum): a família troca as colunas, e o teste confere 60 mm de corrida e 29,9 mm de ramal (0463).
- A espessura da parede das conexões de esgoto NÃO consta do catálogo; usa-se a do tubo da maior bitola (CONFERIR). Nas conexões soldáveis ela vem de A: a parede do furo é limitada a 1/8 do diâmetro para uniões e tês com aba externa.

## Como criar o seu próprio (editor de famílias)
Faixa Propriedades > **Catálogo MEP** (ou Gerenciar > Catálogo MEP). Em "Meus catálogos": importar CSV (colunas `bitola`, `codigo` opcional e os ids de parâmetro B, Db, De, e, Z, C, C1, C2, Z2, B2, Db2), editar células, copiar um item do fabricante (as letras D, d, A viram Db, De, Aext), marcar como conferido (nome e data) e **Criar família** (escolha a peça e o sistema). A família sai com as fórmulas embutidas, em "Meus modelos" e aberta no editor. Os catálogos próprios ficam no navegador (como "Meus modelos").
