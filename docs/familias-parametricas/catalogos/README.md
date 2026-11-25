# Catálogos de fabricante (fase 2, ficha P3)

Dimensões de tubos e conexões como **dado**, não como número escrito dentro de cada família. Formato e funções: `packages/model/src/familia/catalogoMep.ts` (validação, conferência, `busca` para as famílias) e `catalogoMepCsv.ts` (criar ou levar tabelas à mão por CSV).

## Fontes obtidas (2026-11-24)
| Fabricante | Documento | Situação |
|---|---|---|
| Krona | Catálogo Técnico Esgoto 2025 (53 páginas) | Transcrito: 64 tabelas, 327 linhas (`catalogosMep/kronaEsgoto.ts`). URL e SHA-256 do PDF na fonte do arquivo. Títulos tirados da mesma coluna do desenho (o pdftotext intercala os rótulos); uma tabela ficou sem título legível (código 1413). |
| Krona | Catálogo Técnico Linha Soldável 2025 (12 páginas) | Transcrito: 17 itens, 200 linhas (`catalogosMep/kronaSoldavel.ts`); `A` é o diâmetro externo, então a parede sai de (A − D) / 2. |
| Krona | Catálogo Técnico Linha Elétrica 2026 (47 páginas) | Transcrito: 22 tabelas, 71 linhas, páginas 6 a 11 (eletrodutos rígidos e corrugados, curvas, luvas, caixas de luz) (`catalogosMep/kronaEletrica.ts`). Fora desta rodada: quadros e DIN/NEMA (páginas 22 a 26), caixas de passagem e de piso (31 a 37), proteção (41 a 46), fita isolante (11) e o dimensionamento dos eletrodutos (3 a 5). Todas com cotas no PDF. |
| Tigre | Catálogo Predial 2025 (75 páginas) | **Sem cotas**: só código, bitola e quantidade. As cotas estão em fichas técnicas por produto, ainda não localizadas. |
| Amanco / Wavin | — | O site não respondeu daqui (conexão recusada). Nada obtido. |

Os PDFs **não** entram no repositório (material do fabricante): só os dados transcritos, a URL, a página e o hash. Para refazer: baixe o PDF, `pdftotext -layout`, rode `ferramentas/extrair-krona.py` e `ferramentas/gerar-ts.py`. A elétrica usa `ferramentas/extrair-krona-eletrica.py` (layout de cabeçalho diferente; títulos num mapa `TITULOS` por código) e `gerar-ts.py ... eletroduto`; depois os rótulos das colunas foram trocados à mão (ver abaixo).

## Fidelidade
- Todo item nasce `CONFERIR`. A conferência é por LINHA (`conferirLinha`, caixa 'Conferida' na tabela, também nos catálogos do fabricante; a do fabricante fica no navegador e é ignorada se o SHA-256 do catálogo mudar). O item vira `conferido` quando todas as linhas estão conferidas (`conferirItem` marca todas de uma vez); editar qualquer número volta a linha e o item para `CONFERIR`. O diálogo traz o link para o PDF na página do item e 'Exportar conferências'.
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

## Anomalias conhecidas do PDF da Krona (elétrica)
PDF: 47 páginas, SHA-256 `53e4a8f9…d3a5e`. Transcrito só o trecho de eletrodutos e caixas de luz (páginas 6 a 11).
- **Página 8, eletroduto corrugado flexível (parede)**: a mesma bitola aparece em mais de uma linha (20 e 25 três vezes; 32 duas), uma para cada comprimento de rolo (C(m) = 10, 25 ou 50). Transcrito como impresso; o validador acusa as cinco repetições de propósito.
- **Página 6 e 7, tabela roscável**: o cabeçalho diz "Dimensões (pol.)", mas os valores (por exemplo D = 21,1 para a bitola 1/2”) foram lidos como **mm**. Conferir a unidade com o fabricante.
- **Luvas e curvas roscáveis (páginas 7 e 8)**: a coluna D traz a rosca em texto ("1/2”"), não um número. Essa coluna sai do item; a bitola já é a rosca.
- **Tubo de 3 m (página 6)**: o "3m" da coluna C vira 3000 mm, como no catálogo de água fria.
- **Curva 90 longa roscável (página 7)**: o rótulo "Injetada" aparece só nas linhas 1151 a 1153. O PDF não diz o que separa as outras seis linhas.
- **Página 10, código 2369**: a caixa de luz 4x4 flexível tem código fora da sequência 1254 a 1266 da mesma página, com as mesmas medidas da 1255.
- **Títulos repetidos**: "Caixa de Luz para Eletroduto Corrugado Flexível" aparece na página 10 (2369) e na página 11 (1266). Os dois itens ficam separados pelo código.
- **Página 9, cabeçalho "C(cm"**: sem o parêntese de fechamento; lido como centímetros (CONFERIR). Página 11: cabeçalho "C C" na caixa 1266: a segunda vira `C_2`.
- **Regra "B não pode passar de C"**: vale para tubo e conexão. Nas caixas de luz B é outra dimensão, então o validador acusa sete casos que não são erro real (listados no teste).
- **Rótulos das colunas** (`kronaEletrica.ts`): o gerador usa o dicionário de tubos de esgoto, que não vale para caixas. Os rótulos foram trocados à mão por "letra do desenho (CONFERIR)"; o significado de B, C, D, d, A, E, R, Cm e Ccm precisa vir do desenho do fabricante.
- **Tipo "outro"**: curvas de 135° e 180°, eletroduto corrugado e prolongador ficam como `outro`, porque o gerador só reconhece palavras de tubo e conexão.

### Famílias elétricas montadas (ficha C2, `biblioteca/kronaEletrica.ts`)
- Nove famílias: eletroduto soldável com bolsa e cortado, curva 90° soldável, luva soldável, luva de pressão para corrugado flexível (DN 20 a 32; a luva soldável tem DN 20 e 25) e caixas 4×2, 4×4 (códigos 1266 e 2369) e octogonal (1255), todas com geometria retangular.
- **Espessura da parede NÃO consta do catálogo.** Não se deriva de D e d (o significado dessas letras não está confirmado). Usa-se o parâmetro `e` de TIPO com valor fixo **provisório de 2 mm** em todos os tipos (`ESPESSURA_ELETRICA`), nome e descrição marcados "CONFERIR (não consta do catálogo)". Não é valor de norma.
- D é lido como diâmetro externo do tubo e da bolsa (CONFERIR). Caixas: L é a maior face, A a menor, P é a letra C (CONFERIR). Entradas: quatro de 20 mm, uma por face, suposição (o catálogo não diz quantas nem onde).
- IFC das caixas: `IFCJUNCTIONBOX` não existe em `ClasseIfc`; usa-se `IFCCABLECARRIERFITTING`/`OTHER`, como em `eletricaCaixas.ts`.
- Fora desta rodada: roscáveis (bitola em polegada, sem bolsa), curvas 135° e 180° (roscáveis, sem receita de geometria), curva 90° longa roscável, corrugados de parede e flexíveis em rolo (sem receita de tubo sem bolsa), caixas para laje e prolongadores.

## Como criar o seu próprio (editor de famílias)
Faixa Propriedades > **Catálogo MEP** (ou Gerenciar > Catálogo MEP). Em "Meus catálogos": importar CSV (colunas `bitola`, `codigo` opcional e os ids de parâmetro B, Db, De, e, Z, C, C1, C2, Z2, B2, Db2), editar células, copiar um item do fabricante (as letras D, d, A viram Db, De, Aext), marcar como conferido (nome e data) e **Criar família** (escolha a peça e o sistema). A família sai com as fórmulas embutidas, em "Meus modelos" e aberta no editor. Os catálogos próprios ficam no navegador (como "Meus modelos").
