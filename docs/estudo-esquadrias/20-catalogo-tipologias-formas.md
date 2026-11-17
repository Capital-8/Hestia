# 20. Catálogo de tipologias e formas: Lapin, fontes públicas e Hestia

Data: 2026-11-17. Escopo: portas, janelas, formas de contorno e portões. Base: coleta 13 (Lapin, leitura do código), coleta 15 (CBIC e fabricantes, só resumos de busca) e leitura do código do Hestia nesta sessão. Este arquivo não altera código nem outros documentos.

## 0. Legenda, fontes e limites

- **[V]**: verificado em código ou fonte aberta nesta sessão, ou copiado da coleta 13 com a âncora reconferida aqui (ver abaixo).
- **[I]**: inferência minha, ou dado que existe só em resumo de busca ou em fonte não aberta (coleta 15). Não usar como dimensão de projeto sem confirmação.
- **Origem Lapin**: `E:` = `/home/user/ciuntuc-bim-studio/lapin/engine/src/Modules/Architecture/Lapin.Architecture/`; `G:` = `engine/src/Geometry/Lapin.Geometry/`. Linhas copiadas da coleta 13.
- **Âncoras Lapin reconferidas aqui**: `E:Joinery.cs:251-269` (padrões de janela e porta), `E:Openings.cs:77` (`BareKinds`), `E:JoineryShapes.cs:67,72` (`Kinds`, `Headed`), `E:JoineryShapes.cs:125-139` (`Rise`), `E:JoineryShapes.cs:178-182` (ápice ogival), `E:GarageDoors.cs:44-49` (tamanhos), `E:Gates/GateKinds.cs:70` (`All`), `E:Gates/Gates.cs:397-404` (topo do portão), `E:BayWindows.cs:684` (estilos bay).
- **Lapin não é norma.** Os números são predefinições de software. Não confirmam tamanho padrão de mercado.
- **Dimensões oficiais não obtidas.** Os domínios da CBIC, do Corpo de Bombeiros e da Engenharia 360 estavam bloqueados na coleta 15 (ENOTFOUND). Todo valor vindo dela é [I].

---

## 1. Portas

### 1.1 Predefinições e famílias do Lapin

Dimensões em metros. "Vão" é a medida de abertura, como no Lapin; no Hestia a medida de porta é a da folha (ver seção 5.3).

| Tipologia (Lapin) | Parâmetros relevantes | Dimensões padrão (L x A) | Operação (símbolo) | Origem | Conf. |
|---|---|---|---|---|---|
| Porta de giro (padrão) | batente 0,10 prof., 0,05 face, 0,06 montante, 0,06 travessa; folha 0,10 x 0,06, esp. 0,04; soleira 0,02; sem peitoril | 0,9 x 2,1 | `swing-left` (triângulo, arco de giro só em planta) | `E:Joinery.cs:251-269`; predef. 1 em `E:Openings.cs:991-1098` | [V] |
| Porta dupla de giro | duas folhas, `Mullions=[0]`, encontro rebaixado, `double-acting` ativa direita | 1,5 x 2,1 (conjunto) | `swing-left` + `swing-right` | predef. 3 (`E:Openings.cs:991-1098`) | [V] |
| Porta de vidro sem moldura em mola de piso | `Frameless(floor-spring, HoldOpen 90)`, estilo `frameless-glass`, folha dupla-ação | 1,0 x 2,1 | `double-acting-left` | predef. 4 (`E:Openings.cs:991-1098`) | [V] |
| Porta com laterais e bandeira | laterais fixas 0,4; bandeira fixa 0,35; folha 0,10 x 0,06; vidro 4-16-4; externa | 1,9 x 2,5 | `swing-left` com laterais e bandeira fixas | predef. 11 (`E:Openings.cs:1034-1098`) | [V] |
| Portal elevar-e-correr (HS) | batente prof. 0,16, alumínio cinza, U 1,2, soleira 0; folha na trilha interna, painel fixo na externa | 3,0 x 2,2 | `lift-slide-left` | predef. 12 (`E:Openings.cs:1034-1098`) | [V] |
| Porta de varanda + janela (DW) | PVC, vidro 4-16-4, U 1,1; sem tábuas de peitoril, tábuas 0,20 e 0,05 em janela | 1,6 x 2,2 | `swing-left` (2 linhas, vidro), `fixed` sólido, `tilt-turn-right` | predef. 10 (`E:Openings.cs:1034-1098`) | [V] |
| Garagem seccionada | `sectional-overhead`; acabamento padrão | 2,4 x 2,1 (AU); 2,375 x 2,0 (EU) | seccionada | `E:GarageDoors.cs:44-49`; predef. 5 (`E:Openings.cs:1008-1032`) | [V] |
| Garagem enrolável | `roller`, espessura de lâmina 0,012; acabamento `flat` | 2,4 x 2,1 | enrolável | predef. 6 (`E:Openings.cs:1008-1032`) | [V] |
| Garagem basculante | `up-and-over` | 2,5 x 2,125 (EU) | basculante | predef. 7 (`E:Openings.cs:1008-1032`) | [V] |
| Garagem seccionada lateral | `sectional-side-left`; acabamento `v-groove` | 2,5 x 2,125 (EU) | seccionada lateral | predef. 8 (`E:Openings.cs:1008-1032`) | [V] |
| Garagem de duas folhas | derivada da porta dupla; batente 0,09, soleira 0 | 2,4 x 2,1 | conjunto de 2 folhas | predef. 9 (`E:Openings.cs:1008-1032`) | [V] |
| Garagem AU, tamanhos comuns | sem família própria; medidas usadas nas predef. 5 a 9 | 2,4; 2,7; 3,0; 4,8; 5,4 x 2,1 | n/a | `E:GarageDoors.cs:44-49` | [V] |
| Limites de garagem | largura 0,6 a 12 m; altura 1,5 a 7 m; uma coluna, uma linha, um painel; sem forma de contorno | n/a | n/a | `E:GarageDoors.cs:~78` (`GarageDoors.Problem`) | [V] |

Operações de porta no código, 16 ao todo: `swing-left/right`, `double-acting-left/right`, `door-sliding-left/right`, `folding-left/right`, cinco de garagem, `lift-slide-left/right`, `tilt-slide-left/right`. Fonte: `E:Joinery.cs:363-378` (coleta 13 §4.1). [V]

Em 3D, a operação de porta não muda a folha fechada. Exceções: elevar-e-correr e garagem. Fonte: coleta 13 §0.1 e §4.2. [V]

### 1.2 Dimensões de porta de fontes externas (coleta 15)

Nenhum destes valores foi confirmado em fonte primária. Servem de referência a checar.

| Valor | Fonte citada | Status | Conf. |
|---|---|---|---|
| Larguras de 0,60 a 1,20 m, altura de 2,10 m | Resumo atribuído à "NBR 10821" (que trata de janelas); a atribuição é inconsistente | não confirmado (coleta 15 §3) | [I] |
| Larguras de 0,60, 0,70, 0,80 e 0,90 m, altura de 2,10 m | Caderno técnico SINAPI (provável URL: https://jfpe.jus.br/images/stories/docs_pdf/documentoConcorrencia/ORCAMENTO/LUMINARIAS/SINAPI_CT_MT1_ESQUADRIAS_PORTAS_10_2020.pdf, vínculo não confirmado) | resumo de busca | [I] |
| Largura livre mínima de saída, 1,10 m (ocupações gerais) e 1,65 m (H-2 e H-3) | Corpo de Bombeiros MG, IT 08 (https://bombeiros.mg.gov.br/storage/files/shares/intrucoestecnicas/IT_08_2a_Ed_portaria_70.pdf) | **não confirmado**: o resumo se contradiz quanto à portaria. Não é tamanho de porta, é largura de passagem | [I] |
| Corredores para menos de 20 pessoas: 1,0 m; H-3 com "2,2 m" | Corpo de Bombeiros GO, NT 11 (URLs na coleta 15 §7) | resumo; o "2,2 m" é ambíguo (não confirmado se é altura de passagem) | [I] |

Regra comum citada (não verificada na íntegra): largura medida no ponto mais estreito da passagem; portas de rota de saída abrem no sentido da saída (coleta 15 §7).

---

## 2. Janelas

### 2.1 Predefinições e famílias do Lapin

| Tipologia (Lapin) | Parâmetros relevantes | Dimensões padrão (L x A, peitoril) | Operação (símbolo) | Origem | Conf. |
|---|---|---|---|---|---|
| Janela padrão | batente 0,07 prof., 0,06 face, 0,08 montante, 0,08 travessa; folha 0,07 x 0,08, esp. 0,04; vidro 0,024; grade `[1,1]` x `[1]`; tábua int. 0,20, ext. 0,05; U 1,1 | 1,20 x 1,50, peit. 0,90 | `tilt-turn-left` + `side-right` | `E:Joinery.cs:251-269`; predef. 2 em `E:Openings.cs:991-1098` | [V] |
| Janela francesa (FW) | PVC, sem tábuas | 1,40 x 2,20, peit. 0 | `tilt-turn-left` + `side-right` | predef. 13 (`E:Openings.cs:1034-1098`) | [V] |
| Janela maxim-ar, basculante, pivotante, veneziana, guilhotina, correr | Não há predefinição de dimensão no Lapin; o catálogo de operações tem as 12 de janela | n/a | 12 operações: `fixed`, `side-left/right`, `tilt-turn-left/right`, `bottom-hung`, `top-hung`, `pivot-horizontal`, `pivot-vertical`, `sliding-left/right`, `sliding-vertical` | `E:Joinery.cs:363-378` | [V] |
| Janela de correr (padrão do catálogo de Lapin) | sem predefinição; o símbolo é de correr, sem trilho 3D | n/a | `sliding-*` | `E:Joinery.cs:363-378` | [V] |

Predefinições de bay, bow, box e oriel (`E:BayWindows.cs:684-711`, [V]):

| Id | Nome | L x A (peit.) | Projeção, ângulo | Base | Cabeça |
|---|---|---|---|---|---|
| bay-45 | Bay 45° | 2,4 x 1,5 (0,6) | 0,6, 45° | none | hipped 0,12 / 0,10 / 30° |
| bay-30 | Bay 30° raso | 2,6 x 1,5 (0,6) | 0,45, 30° | none | lean-to, 20° |
| bay-60-floor | Bay 60° até o piso | 2,2 x 1,6 (0,5) | 0,7, 60° | floor (0,25, tijolo) | hipped 35°, telha |
| bow-5 | Bow 5 painéis | 3,0 x 1,6 (0,6) | 0,5 | corbel (3 mísulas), pedra | hipped 25° |
| bow-4 | Bow 4 painéis | 2,4 x 1,5 (0,7) | 0,4 | slab de concreto | flat |
| box-glazed | Box envidraçado | 2,0 x 1,5 (0,6) | 0,5, 90° | slab | flat |
| box-solid | Box com laterais sólidas (cozinha) | 1,4 x 1,1 (0,95) | 0,4, 90° | none | lean-to 15° |
| oriel | Oriel | 2,0 x 1,6 (0,8) | 0,6, 90° | corbel (3, pedra) | hipped 35°, telha |

Origem de todas: `E:BayWindows.cs:684-711`. Conf. [V]. Observação [I]: o estilo "bay-45" diz "three faces" e tem colunas `[1,1,1,1]`. Pela regra de colunas do centro, isso dá três faces com o centro partido em duas colunas.

### 2.2 Dimensões de janela de fontes externas (coleta 15)

| Valor | Fonte citada | Status | Conf. |
|---|---|---|---|
| Cozinha 0,60 x 0,80 m; banheiro 0,60 x 0,60 m. O resumo diz que janelas são "menos padronizadas" que portas | Engenharia 360 (https://engenharia360.com/modelos-e-medidas-de-portas-e-janelas/) | página bloqueada, só resumo | [I] |
| Maxim-ar 0,60 x 0,60 m, 1 seção | Telhanorte, Atlântica Magnum L25 | **produto de varejo, não padrão** | [I] |
| Maxim-ar 0,60 x 1,00 m, 1 folha | Telhanorte, Pratika / Sasazaki | produto de varejo | [I] |
| Veneziana de aço 1,00 x 1,20 m, 3 folhas | Telhanorte, Pratika / Sasazaki (só o título do produto) | produto de varejo | [I] |
| Correr, máximo avaliado: 1,20 x 1,50 m (3 folhas móveis, veneziana) e 1,00 x 1,50 m (2 folhas, 1 fixa) | Fichas PBQP-H (candidatas FAD-007-R01, FAD-012-R01, FAD-No-11-2, RT077; PDF não identificado) | valores máximos avaliados, não padrão | [I] |

### 2.3 Operações de janela no Hestia (para comparação)

Ver seção 5. O Hestia usa símbolos próprios (`PlanSymbol`, `packages/model/src/openingTypes.ts:8-11`), com 16 valores: `swing`, `double`, `sliding`, `pivot`, `fixed`, `tilt`, `casement`, `dblact`, `pocket`, `bifold`, `accordion`, `garage`, `hinged`, `hung`, `pivotwin`, `louver`. [V]

---

## 3. Formas de contorno

### 3.1 Lapin: `Rise`, faixas e padrões

Fonte: `E:JoineryShapes.cs:67` (`Kinds`), `:125-139` (`Rise`), e a coleta 13 §3. `Rise` é limitado a `Altura - 0,15` em todas as formas (`E:JoineryShapes.cs:138`). [V]

| Forma (Lapin) | Padrão de `Rise` | Faixa aceita | Parâmetros e geometria | Origem | Conf. |
|---|---|---|---|---|---|
| `rect` | 0 | n/a | retângulo | `E:JoineryShapes.cs:67` | [V] |
| `round` (arco pleno) | `w/2` | fixo (`w/2`) | semicírculo de raio `w/2` | `E:JoineryShapes.cs:125-139`; `Top` em `:159-160` | [V] |
| `segmental` (arco abatido) | `w/6` | 0,02 a `w/2` | arco entre as ombreiras | `E:JoineryShapes.cs:125-139`, `:195-253` | [V] |
| `elliptical` | `w/4` | 0,02 a `w` | meia-elipse de semieixo menor `f - inset` | `E:JoineryShapes.cs:132`; coleta 13 §3.3 | [V] |
| `radiused` (cantos arredondados) | 0,15 (raio do canto) | 0,01 a `w/2` | retângulo com cantos em quarto de círculo | `E:JoineryShapes.cs:125-139` | [V] |
| `pointed` (ogival) | `w·√3/2` (equilátero) | mínimo 0,05, sem teto próprio | dois arcos com centro no lado oposto, ápice em `x=0` | `E:JoineryShapes.cs:134`, `:178-182` | [V] |
| `gable` (frontão) | `w/4` | mínimo 0,02, sem teto próprio | triângulo sobre a cabeça | `E:JoineryShapes.cs:67,125-139` | [V] |
| `circle` (elipse completa, oculus) | n/a | n/a | elipse que preenche `L x A`; altura e largura mínimas `2·Frame.Width + 0,1` | `E:JoineryShapes.cs:67`; coleta 13 §3.6 | [V] |

Predefinições de estilo que usam forma (`E:` UI, `U:JoineryDialog.tsx:145-179`, [V]): Victorian (`segmental`, `rise w/6`); Romanesque (`round`); Arched casement (`segmental`, `rise w/4`, sem travessa); Gothic (`pointed` equilátero); Tudor (`pointed`, `rise 0,3·w`); Round window / oculus (`circle`, altura = largura). Os valores de Tudor e Gothic são razões de `w`, não medidas. Os "estilos" são pacotes de campos, não tipos novos do motor. [V]

#### Regra de cordas (Lapin, `G:Chords.cs`)

- Tolerância 1 mm (`Tolerance = 0.001`); passo máximo 15°; passo mínimo 0,5°. `Step(R) = clamp(2·acos(1 − 1 mm / R), 0,5°, 15°)`. [V]
- Mínimo de 32 peças por cabeça (`MinPieces = 32`, `E:JoineryShapes.cs:256`); 16 por canto em `radiused`; 48 em `circle`. [V]

### 3.2 Hestia: `OpeningShape` (`packages/model/src/openingShape.ts`)

Arquivo com o tipo `OpeningShape` e as funções `validateOpeningShape` e `outline`. Ver seção 5.4 para o estado de uso.

| Forma (Hestia) | Campos | Regra de validação | Origem | Conf. |
|---|---|---|---|---|
| `rect` | `width`, `height` | só dimensões positivas | `openingShape.ts:11`, `:45-46` | [V] |
| `round` (arco pleno; meia-lua quando `h = w/2`) | `width`, `height` | `height >= width/2` (senão `round-height-below-half`) | `openingShape.ts:12`, `:48-49` | [V] |
| `segmental` (arco abatido) | `width`, `height`, `rise` | `0 < rise <= width/2` e `rise <= height` | `openingShape.ts:14-15`, `:51-54` | [V] |
| `pointed` (ogival) | `width`, `height`, `rise` | `rise >= width/2` (senão `pointed-rise-below-half`) e `rise <= height` | `openingShape.ts:16-17`, `:55-63` | [V] |
| `circle` (elipse inscrita; círculo quando `w = h`) | `width`, `height` | nenhuma | `openingShape.ts:18-19`, `:46-47` | [V] |
| tolerância de corda | `CHORD_TOL = 0.001` m | n/a | `openingShape.ts:31` | [V] |
| testes | 25 casos `it(...)` | n/a | `packages/model/src/openingShape.test.ts` | [V] |

Dimensão padrão: o módulo não define nenhuma. Não há valor de `rise` padrão no Hestia. [V]

### 3.3 Defeito do Lapin que o Hestia já evita

A coleta 13 §3.4 descreve o problema. Eu refiz a conta:

- `r = (f² + w²/4) / w`. Com `f = 0,3·w` (preset Tudor): `r = 0,34·w`; `w/2 − r = 0,16·w`.
- No eixo: `top = zs + sqrt(r² − (0,16·w)²) = zs + 0,30·w`. Em `|x| = 0,16·w`: `top = zs + r = zs + 0,34·w`.
- Resultado: o arco sobe do eixo, tem um vale e passa 0,04·w acima de `f`. Conta confirmada, [V] para a aritmética e [I] para o efeito visual.

O Hestia exige `rise >= width/2` para `pointed` (`openingShape.ts:55-58`). Assim, o caso do Lapin é rejeitado na validação. Não há padrão Tudor no Hestia. [V]

Caso análogo em `round` do Lapin: com `H − 0,15 < w/2`, o topo fica em `w/2` fixo e sai `5 cm` acima da altura declarada (coleta 13 §3.5). O Hestia rejeita `round` com `height < width/2` (`openingShape.ts:48-49`). [V] para as fórmulas, [I] para a consequência.

### 3.4 Outras divergências entre fontes de forma

- **Portão arqueado no Lapin**: o comentário diz "a circle's segment" mas a fórmula é senoidal: `Altura + rise·sin(π·t)` (`E:Gates/Gates.cs:397-404`). Confirmado nesta sessão. [V] para a fórmula; [I] para dizer que é descuido.
- **Vão nu no Lapin não tem `pointed` nem `gable`** (`E:Openings.cs:77`, `BareKinds = rect, segmental, elliptical, round, radiused, circle`). O Hestia não tem essa restrição porque `pointed` está no `OpeningShape`, mas o Hestia não liga `OpeningShape` ao vão (seção 5.4). [V]

---

## 4. Portões

### 4.1 Lapin: `Gates` (entidade própria, não `JoinerySpec`)

Tipos (`E:Gates/GateKinds.cs:70-78`, `All`). Dimensões são do vão (largura útil). [V]

| Tipo | Operação IFC | L x A | Preenchimento | Pilar | Observação | Conf. |
|---|---|---|---|---|---|---|
| Portão de giro (`swing`) | `SINGLE_SWING_LEFT` | 2,5 x 1,6 | barras verticais | alvenaria | | [V] |
| De giro duplo (`doubleSwing`) | `DOUBLE_DOOR_SINGLE_SWING` | 3,6 x 1,6 | barras verticais | alvenaria | | [V] |
| De correr (`sliding`) | `SLIDING_TO_LEFT` | 4,0 x 1,6 | ripas horizontais | alvenaria | folga 0,08; motor ligado | [V] |
| De correr em balanço (`cantilever`) | `SLIDING_TO_LEFT` | 4,5 x 1,6 | barras verticais | aço | folga 0,10; motor ligado | [V] |
| Pedestre (`pedestrian`) | `SINGLE_SWING_LEFT` | 1,0 x 1,6 | barras verticais | alvenaria | | [V] |
| Duplo com porta lateral (`swingWicket`) | `USERDEFINED` | 3,6 x 1,6 | barras verticais | alvenaria | `wicketWidth 1,0` | [V] |
| Dobrável (`folding`) | `DOUBLE_DOOR_FOLDING` | 3,6 x 1,6 | sólido | aço | `panels 2` por lado | [V] |

Valores comuns (`E:Gates/GateKinds.cs:~57-62`): folga ao piso 0,05; moldura 0,06; espaçamento de barras 0,12; topo `flat`; `rise 0,25`; pilar 0,4 (alvenaria) ou 0,1 (aço); altura do pilar = altura + 0,2; abertura 90°. [V]

Faixas válidas (`E:Gates/GateKinds.cs:84-102`): largura 0,6 a 12 m; altura 0,6 a 3,5; folga 0 a 0,3; porta lateral 0,7 a 1,5; painéis 1 a 4 por lado; abertura 45 a 180°; moldura 0,03 a 0,15; espaçamento 0,05 a 0,4; `rise` 0,05 a 1,2; pilar 0,05 a 0,9; altura do pilar 0,5 a 4. [V]

Topos (`E:Gates/Gates.cs:397-404`): `flat`, `arched` (senoide, ver 3.4), `pointed` (V invertido, `Altura + rise·(1 − |2t − 1|)`, não ogival). Portão de correr ignora o topo. [V]

Estilos prontos (`E:Gates/Gates.cs:719-742`, 11 ao todo). Exemplos com medida: cercado de fazenda 3,6 x 1,2 (ripas 0,22); jardim em madeira altura 1,2 (`rise` 0,15); pedestre arqueado `rise` 0,25 e pilar 2,0. [V]

### 4.2 Hestia

Não há entidade de portão. Só há três itens de garagem no catálogo de portas, com `plan: 'garage'`:

- P-11 "Portão seccionado 300 x 220", `packages/model/src/defaults.ts:171`. [V]
- P-45 "Portão de garagem basculante 250 x 210", `packages/model/src/catalogoPortas.ts:131`. [V]
- P-46 "Portão de enrolar 280 x 225", `packages/model/src/catalogoPortas.ts:132`. [V]

Busca por `gate`, `portao` e `portão` em `packages/model/src` não achou entidade de portão (só falsos positivos). [V]

---

## 5. Catálogo atual do Hestia: 154 tipos

### 5.1 Onde está

- Lista consolidada: `openingTypeCatalog(lang)` em `packages/model/src/defaults.ts:189-190`, que concatena `baseOpeningTypes` (24 tipos, `defaults.ts:158-183`), `catalogoPortas` (67), `catalogoJanelas` (39) e `catalogoComposicoes` (24). [V]
- Blocos: `catalogoPortas.ts:82` (lista `CATALOGO_PORTAS_BR_PT`); `catalogoJanelas.ts:27`; `catalogoComposicoes.ts:74` (`portaC`) e `:82` (`janelaC`); `catalogoAberturasBase.ts:8` (`ot`). [V]
- Teste de contagem e ids preservados: `packages/model/src/catalogoAberturas.test.ts` (24 tipos antigos, ids e medidas). [V]

Contagem conferida por leitura das listas (a execução com `node --experimental-strip-types` não terminou no tempo disponível, por isso a conferência é estática):

| Bloco | Arquivo:linha | Portas | Janelas | Códigos |
|---|---|---|---|---|
| Padrões (`baseOpeningTypes`) | `defaults.ts:160-183` | 12 | 12 | P-01 a P-11, V-01; J-01 a J-11, V-02 |
| Portas de giro (1, 2 folhas), porta-balcão | `catalogoPortas.ts` | 5 + 4 + 3 = 12 | | P-12 a P-23 |
| Correr, embutir, pivotante, camarão, vai-e-vem, sanfonada PVC | `catalogoPortas.ts` | 2 + 2 + 2 + 2 + 3 + 4 = 15 | | P-24 a P-38 |
| Vidro temperado (blindex) 8 e 10 mm | `catalogoPortas.ts` | 6 | | P-39 a P-44 |
| Corta-fogo PF-30 a PF-120, folhas de 80 e 90 | `catalogoPortas.ts` | 8 | | códigos `PF-xx-80/90` |
| Garagem (basculante, enrolar) | `catalogoPortas.ts:131-132` | 2 | | P-45, P-46 |
| Variações de material (alumínio, PVC, vidro) | `catalogoPortas.ts` | 24 | | P-62 a P-85 |
| Composições (bandeira, laterais, combinadas) | `catalogoComposicoes.ts:88-124` | 15 | 9 | P-47 a P-61; J-51 a J-59 |
| Janelas (correr, maxim-ar, basculante, pivotante, guilhotina, abrir, fixas, veneziana, bandeira, banheiro) | `catalogoJanelas.ts:29-80` | | 39 | J-12 a J-50 |
| **Total** | | **94** | **60** | **154** |

Subtotal de `catalogoJanelas`: correr 8, maxim-ar 5, basculante 8, pivotante 4, guilhotina 3, abrir 4, fixas 2, veneziana 2, bandeira 2, banheiro 1 = 39. [V]

### 5.2 Familias de operação no catálogo

Pelos valores `plan` e `kind` do código: `swing`, `double`, `sliding`, `pivot`, `dblact`, `pocket`, `bifold`, `accordion`, `garage`, `fixed`, `casement`, `hinged`, `hung`, `pivotwin`, `louver`, `tilt`. [V]

### 5.3 Diferenças de referência de medida

- **Portas**: `nominalRef: 'leaf'`. A largura e a altura são da folha (para folha dupla, o conjunto), e o vão sai do motor. Comentário em `catalogoPortas.ts:6-7` cita NBR 15930 ("80 x 210" é a folha). A norma não foi lida. [I]
- **Janelas**: sem `nominalRef`, medida de vão (`catalogoJanelas.ts:3-4`). [V]
- **Lapin**: portas são vão. Comparar com o Hestia exige converter. [V]

### 5.4 Forma de contorno no Hestia

- `OpeningType` (`packages/model/src/openingTypes.ts:16`) não tem campo de forma. Busca por `shape`, `arch`, `pointed`, `circle` e `round` em `openingTypes.ts` e nos catálogos não achou nada. [V]
- `packages/model/src/openingShape.ts` tem `OpeningShape` com cinco formas. Busca por `openingShape` em `packages/` e `apps/` achou só o próprio arquivo e o teste. Nenhum tipo do catálogo o usa. [V]
- Estado: arquivo marcado como "WIP onda 1 ... em andamento" no commit `63dc97f`. [V]

### 5.5 Comparação com o Lapin

| Família | Hestia (qtd, códigos) | Lapin | Situação |
|---|---|---|---|
| Porta de giro 1 folha | 1 padrão + 5 de 60 a 100 (P-12 a P-16), variações, composições | padrão + predef. 1 | cobre |
| Porta dupla de giro | P-04, P-17 a P-20, variações | predef. 3 | cobre |
| Porta de correr | P-05, P-24, P-25, variações | operação `door-sliding` sem predef. | cobre |
| Porta de vidro sem moldura com mola de piso | blindex P-39 a P-44 (vidro, batente `block`, puxador); sem mola de piso nem dupla-ação de vidro | predef. 4 | parcial |
| Porta dobrável / camarão / sanfonada | P-09, P-10, P-30, P-31, P-35 a P-38 | operação `folding` (sem sanfonada) | Hestia tem mais |
| Porta com laterais e bandeira | P-49 a P-56, P-59 a P-61 (composições) | predef. 11 | cobre |
| Porta de varanda + janela (DW) | P-21 a P-23 (porta-balcão, veneziana e vidro 50 %) | predef. 10 | parcial |
| Portal elevar-e-correr (HS) 3,0 x 2,2 | nenhum | predef. 12, `lift-slide` | **falta** |
| Garagem: seccionada, enrolável, basculante, lateral, duas folhas | P-11, P-45, P-46 (três) | 5 predef., com limites | parcial |
| Janela francesa (FW) 1,40 x 2,20, peitoril 0 | nenhum com essa medida; J-43 (abrir 2 folhas 1,50 x 1,20) | predef. 13 | **falta** (aprox.) |
| Bay, bow, box, oriel | nenhum | 8 estilos | **falta** |
| Janela de correr, maxim-ar, basculante, pivotante, guilhotina, veneziana, fixa, bandeira | 39 tipos J-12 a J-50 mais composições | 12 operações, sem predef. | Hestia tem mais |
| Vão livre (sem folha) | V-01 (`ot_vao90`, `defaults.ts:166`), V-02 (`ot_jv120`, `defaults.ts:178`) | `BareKinds` (`E:Openings.cs:77`) | cobre |
| Janela de telhado e lucarna | não verificado nesta coleta | `E:Roofs/RoofOpenings.cs` | fora do catálogo de esquadrias |
| Porta de fachada-cortina | não verificado nesta coleta | `E:CurtainCells.cs:528-560` | não verificado |
| Portão (entidade própria) | nenhum | 7 tipos, seção 4 | **falta** |

---

## 6. Arco, ogival e círculo no Hestia: o que existe e o que falta

| Item | Hestia hoje | O que falta | Origem | Conf. |
|---|---|---|---|---|
| Campo de forma no tipo de abertura | ausente | campo (ou referência a `OpeningShape`) em `OpeningType` | `openingTypes.ts:16` | [V] |
| Tipos de catálogo em arco pleno, abatido, ogival ou círculo | **0 de 154** | tipos com ids e códigos | seção 5.4 | [V] |
| Geometria de arco pleno, abatido, ogival e círculo | existe em `openingShape.ts` (`round`, `segmental`, `pointed`, `circle`) | ligação ao modelo; hoje só o teste usa | `openingShape.ts:10-19`, `:130` | [V] |
| Validação de flecha | existe (`round`, `segmental`, `pointed`) | nada para `circle` (ver abaixo) | `openingShape.ts:37-63` | [V] |
| Círculo (oculus) | `circle` = elipse inscrita; é círculo só com `width = height` | regra ou tipo que force `w = h` | `openingShape.ts:18-19` | [V] |
| Valor padrão de `rise` | nenhum | decisão de projeto. O Lapin usa `w/2` (`round`), `w/6` (`segmental`), `w·√3/2` (`pointed`) | Lapin `E:JoineryShapes.cs:125-139` | [V] |
| Dimensões padrão de arco ou círculo | nenhuma fonte | valores reais. Coleta 13 não traz medida de arco nem de oculus. Coleta 15 também não | coletas 13 e 15 | [V] |
| Símbolo de planta de arco | `PlanSymbol` sem valor para arco (`openingTypes.ts:8-11`) | símbolo de arco ou oculus | `openingTypes.ts:8-11` | [V] |
| Furo na parede e IFC para forma não retangular | não verificado (sem uso de `OpeningShape` no código) | verificar como o furo e o `IfcOpeningElement` lidam com contorno | — | [I] |
| Ogival com `rise < w/2` | rejeitado (`openingShape.ts:55-58`) | nada; o Hestia já evita o defeito do Lapin | [V] | [V] |

Resumo: o Hestia tem a geometria e as regras das três formas (arco pleno, ogival, círculo, além do abatido), mas não tem tipo no catálogo, campo no modelo, símbolo de planta nem dimensão de fonte. Para cada forma, o tipo de projeto (medida e flecha) precisa de decisão do dono ou de fabricante, porque as fontes coletadas não dão medida.

---

## 7. Divergências e pontos a checar

1. **Lapin, ogival**: defeito com `rise < w/2`, descrito na seção 3.3. Conta refeita. [V]
2. **Lapin, round**: topo a `w/2` fixo com `H − 0,15 < w/2` (coleta 13 §3.5). Fórmula [V], efeito [I]. Sem teste.
3. **Lapin, portão arqueado**: senoide, não arco de círculo (seção 3.4). [V]
4. **Portas, referência de medida**: Lapin (vão) e Hestia (folha) diferem. Comparações de tamanho precisam converter. [V]
5. **CBIC, NBR 10821**: atribuída a portas, mas trata de janelas (coleta 15 §3). [I]
6. **Bombeiros**: as larguras são de passagem, não de porta. A versão vigente de MG e GO não foi confirmada. [I]
7. **Hestia, comentário NBR 15930**: `catalogoPortas.ts:6` cita a norma. Não lida aqui. [I]

## 8. Próximos passos

1. Liberar cbic.org.br, bombeiros.* e engenharia360.com (coleta 15 §9) e refazer as dimensões de porta e janela com fonte primária.
2. Decidir se `OpeningType` ganha campo de forma e se os tipos de arco e círculo entram no catálogo. Antes disso, definir `rise` e dimensões com fabricante.
3. Verificar o furo na parede e o `IfcOpeningElement` para contorno não retangular antes de ligar `OpeningShape` ao modelo.
4. Ler `E:Gates/Gates.cs` completo para confirmar o comentário "circle's segment" contra a senoide, e decidir se o Hestia precisa de portão.
