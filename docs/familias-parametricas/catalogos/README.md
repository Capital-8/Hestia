# Catálogos de fabricante (fase 2, ficha P3)

Dimensões de tubos e conexões como **dado**, não como número escrito dentro de cada família. Formato e funções: `packages/model/src/familia/catalogoMep.ts` (validação, conferência, `busca` para as famílias) e `catalogoMepCsv.ts` (criar ou levar tabelas à mão por CSV).

## Fontes obtidas (2026-11-24)
| Fabricante | Documento | Situação |
|---|---|---|
| Krona | Catálogo Técnico Esgoto 2025 (53 páginas) | Transcrito: 64 tabelas, 327 linhas (`catalogosMep/kronaEsgoto.ts`). URL e SHA-256 do PDF na fonte do arquivo. Títulos tirados da mesma coluna do desenho (o pdftotext intercala os rótulos); uma tabela ficou sem título legível (código 1413). |
| Krona | Catálogo Técnico Linha Soldável 2025 (12 páginas) | Transcrito: 17 itens, 200 linhas (`catalogosMep/kronaSoldavel.ts`); `A` é o diâmetro externo, então a parede sai de (A − D) / 2. |
| Krona | Catálogo Técnico Linha Elétrica 2026 (47 páginas) | Transcrito: 22 tabelas, 71 linhas, páginas 6 a 11 (eletrodutos rígidos e corrugados, curvas, luvas, caixas de luz) (`catalogosMep/kronaEletrica.ts`). Fora desta rodada: quadros e DIN/NEMA (páginas 22 a 26), caixas de passagem e de piso (31 a 37), proteção (41 a 46), fita isolante (11) e o dimensionamento dos eletrodutos (3 a 5). Todas com cotas no PDF. |
| Tigre | Catálogo Predial 2025 (75 páginas) | Sem cotas (só código, bitola e quantidade). A transcrição veio das fichas técnicas por produto: ver a seção Tigre abaixo. |
| Tigre | Fichas técnicas (7 PDFs) | Transcritas: 7 catálogos, 68 itens em `catalogosMep/tigre*.ts` (ficha D5). Ver a seção Tigre. |
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

## Peças pendentes da Krona esgoto (ficha D3, 2026-11-25)
PDF baixado de novo e conferido: SHA-256 `10c24aa8…adb33` (igual ao registrado). Todas as peças abaixo **já estavam transcritas** em `catalogosMep/kronaEsgoto.ts` antes desta rodada, com URL, SHA-256 e página; as cotas batem com o texto do PDF (173 de 174 linhas; a exceção é a anomalia do código 1440, abaixo). **Nenhuma tinha família**, e nenhuma receita de `kronaReceitas.ts` serve a elas. Por isso a D3 não criou família: só o dado (já existente) e esta nota.

| Peça | Itens do catálogo (códigos) | Pág. | Família | Por que não há família |
|---|---|---|---|---|
| Tê de inspeção (normal) | `te_de_inspecao_esgoto` (0728) | 17 | não | o ramal termina em tampa (T); o catálogo não dá bolsa do ramal, e `te` exige essa bolsa |
| Tê de inspeção (reforçada) | `te_de_inspecao_esgoto_serie_reforcada` (1467–1469) | 35 | não | igual ao de cima |
| Junção 45° dupla | `juncao_45_esgoto_dupla_primario` (0708, 0710) | 15 | não | dois ramais a 45° para o mesmo lado da corrida; `te(45)` tem um ramal só |
| Junção dupla reforçada | `juncao_dupla_esgoto_serie_reforcada` (1426) | 32 | não | mesma forma da dupla normal |
| Junção 45° invertida | `juncao_45_esgoto_invertida_primario` (0704, 0709) | 15 | não | o desenho não deixa claro se Z1 ou Z2 vai à bolsa da corrida; `te(45)` tem Z como bolsa da corrida, o que não bate |
| Joelho 90° com visita | `joelho_90_esgoto_com_visita` (0622); `joelho_90_visita_esgoto_serie_reforcada` (1472) | 14, 35 | não | três extremidades (ponta, bolsa de cada lado mais a visita de Ø102); `joelho` tem duas |
| Curva 90° pé de coluna (reforçada) | `curva_90_curta_pe_coluna_esgoto_serie_reforcada` (1409–1411) | 31 | não | A1 ≠ A2 (99,3 / 96,7; 125 / 120); `curvaBolsas` usa a mesma perna nos dois lados |
| Anéis de vedação SN e SR | `aneis_de_vedacao_esgoto_sn_e_sr` (0670–0674, 0678) | 17 | não | não é conexão: é um anel de vedação (seção d); a receita de anel não existe |
| Válvula de retenção | `valvula_de_retencao_esgoto` (0668, 0669) | 18 | não | três ramais e tampa; nenhuma receita |
| Terminal de ventilação | `terminal_de_ventilacao_esgoto` (1165–1167) | 18 | não | corpo cônico com ØA, ØB, ØC e alturas D e E; nenhuma receita |

Se uma dessas peças ganhar receita (por exemplo, a dupla como duas `te(45)` sobre a mesma corrida), o teste `biblioteca/kronaEsgotoPendentes.test.ts` confere as cotas do PDF e continua valendo.

**Anomalias desta rodada (D3):**
- **Anel de vedação**: o desenho marca a seção como `e` e a tabela como `d`; tomamos `d` como seção (CONFERIR). O gerador tinha dado a `d` o nome "diâmetro externo da ponta" e a `D` o de "diâmetro interno da bolsa", sem base no desenho: os rótulos foram trocados à mão por "diâmetro do anel" e "seção do anel" (CONFERIR). Os números não mudaram.
- **Terminal de ventilação e luva com fixador** (`ØA`, `ØB`, `ØC`, `F`, `ØG` no desenho): o gerador deu a `D` e `E` o nome de bolsa e altura. Os rótulos foram trocados para "letra D do desenho" e "letra E do desenho" (CONFERIR).
- **Código 1440 repetido** na luva simples de esgoto reforçada primária (página 33): o PDF traz o mesmo código para a bitola 75 e para a 100 (linhas com B1 44,4 e 45). Provável erro de impressão (1441?). Transcrito como impresso (CONFERIR).
- **Desenho não visto**: a junção dupla reforçada (1426, página 32) foi conferida só pela tabela; o desenho não foi lido.

## Peças da Krona esgoto montadas na ficha D3b (2026-11-26)
Receitas em `biblioteca/kronaReceitasEspeciais.ts`, famílias em `biblioteca/kronaEsgotoEspeciais.ts` (7, registradas em `BIBLIOTECA_MEP`; contexto esgoto, categoria `conexao_tubo` = Hidráulica > Conexões, PVC branco ou bege da série). Não entram no traçado automático (`tiposTubulacao.ts` intacto). **Todas com leitura de letras NÃO confirmada pelo fabricante (CONFERIR)**; nenhuma afirma conformidade.

| Família | Itens (códigos) | Leitura adotada (CONFERIR) |
|---|---|---|
| `fam_krona_esgoto_te_inspecao`, `..._reforcado_te_inspecao` | 0728; 1467–1469 | corrida de comprimento C1 (bolsa B em cima, ponta embaixo); ramal de inspeção a 90° do eixo até C2, de diâmetro externo T, fechado por tampa de espessura e (parede do tubo; o catálogo não dá a espessura); sem ligação no ramal |
| `fam_krona_esgoto_juncao45_dupla`, `..._reforcado_juncao45_dupla` | 0708, 0710; 1426 | corrida como a da junção simples e dois ramais a 45° saindo do MESMO cruzamento, um para cada lado (X+ e X−): o catálogo traz uma só Z e nenhuma distância entre ramais, então "mesmo lado" sobreporia os corpos |
| `fam_krona_esgoto_joelho90_visita`, `..._reforcado_joelho90_visita` | 0622; 1472 | perna vertical de comprimento total C (bolsa B1 embaixo a Z+B1 do cruzamento; visita em cima fechada por tampa, sem ligação) e perna horizontal com bolsa B2, diâmetro D2, a Z2+B2. Na 1472 o diâmetro da bolsa vertical é d (não há D1) e Z1 faz o papel de Z |
| `fam_krona_esgoto_reforcado_curva90_pe_coluna` | 1409–1411 | varredura única; A1 = cruzamento até a entrada da bolsa vertical e A2 = até a da horizontal (A1 ≠ A2); raio do arco = menor tangente (A − B), mínimo 0,55 do diâmetro externo; D2 (igual a D1 nas três linhas) não é lido |

**Ficaram de fora:**
- **Anéis de vedação (0670–0674, 0678):** não são conexão, e a receita de anel não existe.
- **Junção 45° invertida (0704, 0709):** ambígua; não está claro qual Z (Z1 = 19,1 ou Z2 = 93,6) vai à bolsa da corrida.
- **Válvula de retenção (0668, 0669):** C3, T e a relação entre C1/C2 e os três ramais não se leem sem o fabricante; um corpo simples não seria fiel às cotas.
- **Terminal de ventilação (1165–1167):** ØA/ØB/ØC e as alturas D e E sem significado confirmado; um cone simples seria chute.

## Como criar o seu próprio (editor de famílias)
Faixa Propriedades > **Catálogo MEP** (ou Gerenciar > Catálogo MEP). Em "Meus catálogos": importar CSV (colunas `bitola`, `codigo` opcional e os ids de parâmetro B, Db, De, e, Z, C, C1, C2, Z2, B2, Db2), editar células, copiar um item do fabricante (as letras D, d, A viram Db, De, Aext), marcar como conferido (nome e data) e **Criar família** (escolha a peça e o sistema). A família sai com as fórmulas embutidas, em "Meus modelos" e aberta no editor. Os catálogos próprios ficam no navegador (como "Meus modelos").

## Tigre (ficha D5)
Arquivos: `catalogosMep/tigreComum.ts` (montagem: cada tabela impressa vira um item, uma lista de cotas por letra), `tigreEsgoto.ts` (séries normal e reforçada), `tigreSoldavel.ts`, `tigreRoscavel.ts`, `tigreEletrica.ts` (Tigreflex amarelo, Tigreflex reforçado, caixa de passagem de parede). Teste de amostra: `familia/catalogoMepTigre.test.ts`.

| Catálogo | Documento (ficha) | Edição impressa | SHA-256 do PDF |
|---|---|---|---|
| Esgoto série normal | FT Esgoto Série Normal (URL de 2023) | 03/2015 | `c9bd25d62ec26433b4c956f07b182f92e8c1ce2c5d962e58a429ee2bab45d43e` |
| Esgoto série reforçada | Esgoto Série Reforçada | 02/2015 | `15e0948b9a72b9d21e30df72805687336d148c3236adeee6d60884732e505c35` |
| Linha soldável | FT Linha Soldável | 07/2025 | `028a01d642092744377d1405556058c164603ccfc460c95b2d11c84662388b0d` |
| Linha roscável | Linha Roscável | 01/2014 | `fed95ca7b779392114eecb8c60a35fce248e32a06fe068e38e03ac06f3fcd665` |
| Tigreflex amarelo | FT Tigreflex Amarelo | 09/2025 | `e122867d181bc4ce1641618c1d00b98420c0edda0c63470598af3a24b63ad660` |
| Tigreflex reforçado | FT Tigreflex Reforçado | 10/2025 | `d883c5c14e4df79c45ad7cfe82500d6b33add58f562f661fe3d636a843a2372b` |
| Caixa de passagem de parede | FT Caixa de Passagem Elétrica de Parede | sem data legível | `bce96a380f469792b486f8e839aae26161fcaf315bd934927a28af7e4d0ba7f6` |

As páginas vêm da contagem de separadores de página do `pdftotext` (conferir no PDF). PDFs não entram no repositório.

**Transcrito:** os tubos das duas séries de esgoto (6 m e 3 m); os tubos soldável (3 m e 6 m) e roscável (6 m e 3 m); 26 conexões soldáveis e 19 roscáveis com título legível (além dos tubos); eletrodutos Tigreflex (amarelo e reforçado), luvas de pressão, caixas de luz 4×2 e 4×4, 3×3, octogonais e prolongador; caixas de passagem CPT 15 a 40 (embutir e sobrepor).

**Anomalias mantidas como impressas (marcadas com `nota` na linha):**
- Esgoto normal, 3 m: cabeçalho "1200" (lido como DN 200).
- Esgoto reforçado, DN 40: bolsa B = 40 (na normal, 26): é o que a ficha diz, não erro de leitura.
- Soldável: bucha curta 110×85 com A = 31 (menor que a de 85×75); bucha longa 50×25 com A = 31; cap 60 com D2 = 38,6 fora da sequência; cruzeta 20 com D = 25; curva 90 com R caindo entre 75 e 85; joelho 90 com D = 87,2 e 97,7; união 40 com B = 49; tê de redução 110×75 com D = 100.
- Roscável: pares da bucha de redução ilegíveis (ficou de fora); o "1.1/4" impresso lido como 1 1/4”.
- Caixa de passagem CPT 30: B = 525 (na sobrepor, 350) e E = 468 (maior que D = 313); CPT 40 com A = B = 447. Conferir.

**Ficou de fora (e por quê):**
- Conexões de esgoto (séries normal e reforçada): o pdftotext não trouxe o título da maioria das tabelas, então não dá para dizer a qual peça cada bloco pertence. Inclui o "Adaptador para máquina de lavar louça" (título presente, mas os blocos D1–D4 são ambíguos).
- Soldável: "curva de transposição" (rótulo "D A" ambíguo); adesivos, solução, fita veda-rosca (não são cotas).
- Roscável: colunas D em polegada (rosca) e a linha d das conexões com rosca, que não são medidas em mm; bucha de redução (fora, acima).
- Tigreflex: comprimento de rolo (50 m, 100 m), que não é cota; fitas isolantes (não são eletroduto).
- Não usado: o catálogo enviado pelo dono (`tigre-up/tigre.txt`) não existe na pasta do scratchpad, então não há lista de peças por bitola registrada. Fichas Aquatherm e caixa de inspeção estão na pasta mas fora do escopo da ficha D5.

**Conferência:** todo item nasce `CONFERIR`. A conferência com o PDF continua sendo humana: o teste de amostra prova só que 7 células batem com o texto extraído, não que o texto extraído bate com o PDF.

