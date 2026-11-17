# Estudo de esquadrias, A4: formas e tipologias reais

Projeto Hestia (BIM de arquitetura, mercado brasileiro). Este documento levanta as formas de vãos e esquadrias além do retângulo, onde cada uma é usada, as regras de desenho e de construção que as cercam, como entram em projeto executivo, e os **parâmetros mínimos** que cada uma exige no modelo.

## 0. Como ler este documento

Cada afirmação traz uma marca de confiança:

| Marca | Significado |
|---|---|
| **[V]** | Verificado: aparece em fonte pública consultada nesta pesquisa (URL na seção 11). |
| **[P]** | Parcial: a fonte existe, mas o trecho estava truncado, era secundário (varejo, blog, trabalho acadêmico) ou o valor é específico de um fabricante. Confirmar antes de usar como regra. |
| **[G]** | Geometria derivada: fórmula obtida por dedução matemática a partir da definição da forma. Não depende de fonte, mas está correta por construção. |
| **[I]** | Inferido: conhecimento geral de prática construtiva e de arquitetura, sem fonte consultada. Tratar como hipótese a validar com um projetista ou um catálogo. |

**Limite desta pesquisa.** O ambiente permitiu apenas buscas na web (resumos de resultados). A leitura direta das páginas (`WebFetch`) falhou por bloqueio de rede (`getaddrinfo ENOTFOUND` em caixa.gov.br, cbic.org.br, urbipedia.org e edisciplinas.usp.br). Por isso nenhuma norma ABNT, catálogo ou tratado foi lido na íntegra. Os números de fabricante vêm de resumos de busca, e várias fichas técnicas vieram com texto corrompido. A seção 12 lista o que falta ler.

---

## 1. Resumo executivo para o modelo do Hestia

1. Quase todas as formas curvas e poligonais se descrevem com **vão (corda), altura e um ou dois números de forma** (flecha, raio, lados, ângulo). Um único conceito, o **contorno do vão como polilinha fechada com segmentos de reta e de arco (bulge)**, cobre arcos, óculos, ovais, polígonos, trapézios, empenas e leques. Recomenda-se um tipo `OpeningShape` com gerador paramétrico por forma e uma forma `custom` (polilinha + bulge) como escape. **[I]**
2. A **flecha** (altura do arco acima da linha de arranque) é o parâmetro que separa arco pleno, abatido e peraltado. Pleno: flecha = vão/2. Abatido: flecha < vão/2. Peraltado: flecha > vão/2. **[V]** (Tesauro SIPA e material didático de traçado de arcos; ver seção 11)
3. Verga, contraverga, peitoril e pingadeira são **elementos de interface** entre esquadria e parede. O vão em arco troca a verga reta por arco de alvenaria ou por verga reta oculta sob a esquadria. Eles precisam ser parametrizados à parte da esquadria. **[P]**
4. Alguns itens da lista de tipologias não são "janelas com contorno diferente", e sim **conjuntos com lógica própria**: bay/bow (várias folhas em ângulo e uma projeção), pele de vidro (grade de painéis e montantes), cobogó (painel vazado modular), portão de garagem (trilho, caixa e recuos), dormer (volume com telhado próprio). Cada um precisa de um modelo de dados distinto (seção 9).
5. Em projeto executivo, a esquadria de forma especial vai com **cota do vão, cota de altura até a linha de arranque, flecha ou raio indicados, e gabarito em escala 1:1 para o fabricante**. **[I]** (seção 8)

---

## 2. Vocabulário e regras de desenho comuns a todas as formas

### 2.1 Termos do arco e do vão

| Termo | Definição | Confiança |
|---|---|---|
| Vão (luz, corda) | Distância horizontal entre os pontos de apoio do arco na linha de arranque. | **[V]** (publicação do gov.br sobre arcos: "o vão é a projeção horizontal da corda") |
| Flecha | Distância do ponto mais alto do arco à linha de arranque (ou de impostas). | **[V]** (mesma fonte) |
| Linha de arranque / imposta | Nível horizontal onde o arco nasce, geralmente a altura dos pés-direitos dos montantes. | **[V]** (idem) |
| Esbeltez | Relação flecha/vão, escrita como fração (1/2, 1/4). | **[V]** (material didático de arcos) |
| Arco pleno (meio-ponto) | Semicírculo: vão = 2 x flecha. | **[V]** |
| Arco abatido (rebaixado) | Trecho de circunferência com flecha menor que a semiluz; equivale a "curvatura inferior à de uma circunferência". | **[V]** |
| Arco peraltado | Flecha maior que a semiluz. | **[V]** |
| Ombreira | Face vertical lateral do vão (jamba). Em janelas e portas, a peça ou o plano que limita o vão dos lados. | **[V]** (Estudo Geral UC: a janela tradicional tem "verga, duas ombreiras e peitoril") |
| Verga | Elemento sobre o vão. | **[V]** |
| Contraverga | Elemento sob o vão (abaixo de janelas). | **[V]** |
| Peitoril | Componente na base da esquadria que protege a alvenaria de infiltração. | **[V]** (SINAPI, via resultado de busca) |
| Pingadeira | Detalhe que afasta a água da fachada, evitando manchas. | **[V]** (AECweb) |
| Cunhal | Canto da parede; em alvenaria histórica, pedra ou reforço dos cantos de edifício (quoin). Relevância aqui: o cunhal e a ombreira reforçada emolduram o vão em estilos coloniais e neoclássicos. | **[I]** |

### 2.2 Regras de traçado de arco com fórmula

Seja `c` o vão (corda na linha de arranque) e `f` a flecha.

- **Arco circular qualquer (pleno, abatido, peraltado como trecho de círculo):**
  `R = (c²/4 + f²) / (2f)`. O centro fica no eixo de simetria, a `R - f` **abaixo** da linha de arranque quando `f < c/2` (abatido) e a `f - R` **acima** dela quando `f > c/2` (peraltado, trecho maior que a semicircunferência). **[G]**
  - Pleno: `f = c/2`, `R = c/2`, centro na linha de arranque.
- **Ângulo central do abatido:** `sin(θ/2) = (c/2)/R`; comprimento do arco `= R·θ` (para perímetro de vidro e perfil). **[G]**
- **Ogival (arco quebrado) com dois centros na linha de arranque:** os dois arcos têm o mesmo raio `R`, cada um com centro no apoio oposto da linha de arranque deslocado. Para `R = c` (ogival equilátero), a flecha é `f = c·√3/2 ≈ 0,866·c`. Fonte confirma o traçado equilátero: "raio igual à distância entre as impostas". **[V]** para o traçado; **[G]** para a flecha.
  - Caso geral com centros na linha de arranque: `f = sqrt(R·c - c²/4)` (válido para `c/2 <= R`). Com `R > c` o arco é lanceolado (mais agudo); com `R < c` é obtuso/rebaixado. **[G]**
- **Arco de ferradura (mouro, "túmido"):** os centros ficam **acima** da linha de arranque (diferente do ogival, que tem centros sobre ela). A abertura nos apoios é menor que o diâmetro do círculo. **[V]** (descrição do centro; "ultrassemicircular"). Parametrização: raio `R` do círculo, `c` na linha de arranque e altura `hc` do centro acima dela, com `c < 2R`. **[G]**
- **Arco policêntrico (carpanel de 3 centros, de 5 centros):** construído com número ímpar de centros, em geral três ou cinco. Serve para aproximar uma semi-elipse com arcos de círculo, o que é o que se faz em obra. **[V]** (a descrição existe); a construção passo a passo não foi lida. **[I]** para os valores usuais.
- **Arco conopial (ogee):** três centros, dois deles fora do arco. **[V]**
- **Arco polilobulado/trilobado:** vários centros equidistantes sobre uma circunferência; o trilobado é o caso mais simples. **[V]**

### 2.3 Faixa de esbeltez útil para arco abatido

A única faixa encontrada pela busca é para estruturas de aço (`f/L` de 1/6 a 1/5) e madeira (1/7 a 1/6, até 1/2 em casos particulares). **[V]** como dado, mas **não é de alvenaria** e não deve ser usado como regra de vão. Para o Hestia, adotar como limites de validação do parâmetro (não como norma): `f/c` entre 1/12 e 1/2 para abatido, com aviso visual abaixo de 1/8. **[I]**, valores de projeto de software, não construtivos.

### 2.4 Verga e contraverga (convenção brasileira)

- Transpasse de verga/contraverga além do vão: especificações públicas brasileiras usam **mínimo 20 cm por lado** (exemplo: janela de 1,20 m com verga de 1,60 m). **[P]** (memoriais de prefeituras citados por artigo do Olhar Digital)
- Trabalho da ABM (alvenaria): barras devem ultrapassar o vão em cerca de **30 a 40 cm por lado**, valor empírico; a verga serve para prevenir fendas. **[P]**
- Contraverga sob janela: reforça a faixa inferior; redistribui tensões e reduz trincas diagonais nos cantos. **[P]**
- Peitoril: **[V]** como função (proteger alvenaria). Detalhes de saliência e inclinação **[I]**: ressalto de 2 a 3 cm além do plano da fachada com pingadeira, caimento para fora de 1% a 5%.
- **Conclusão para o modelo:** o transpasse é parâmetro do tipo de verga (padrão 20 cm por lado, editável), nunca constante fixa. Dimensionamento e posição seguem o projeto estrutural, e o Hestia não substitui essa verificação. **[P]**

### 2.5 Altura de peitoril e vão livre de porta (valores de referência)

- Vão livre de porta acessível: 0,80 m x 2,10 m. **[P]** (resumos de checklists sobre a NBR 9050:2020; texto da norma não lido)
- Maçaneta de alavanca entre 0,80 m e 1,10 m. **[P]**
- Peitoril alto de segurança (1,10 m em edifícios, NBR 14718 do guarda-corpo): a busca não confirmou o texto. **[I]**; validar na norma antes de uma regra de aviso.

---

## 3. Catálogo de formas não retangulares

Convenções: `c` = largura do vão (corda), `h` = altura total do vão medida do piso/peitoril à parte mais alta, `hp` = altura dos pés-direitos (parte reta antes da curva), `f` = flecha, `R` = raio. Todos os desenhos ficam num sistema local com origem no meio da base do vão, eixo x ao longo da parede, eixo y para cima. **[I]** para a convenção.

### 3.1 Arco pleno (meio-ponto, romano)

- **Uso.** Vão e portal de arquitetura eclética e neocolonial; janelas de chalés e casas ecléticas de Ouro Preto com "verga em arco pleno, bandeira fixa e guilhotina"; portais de igrejas e fachadas neoclássicas. **[P]** (TCC IFMG sobre tipologias de janelas de Ouro Preto) No colonial tradicional brasileiro predominam vergas retas e vergas ligeiramente arqueadas; o arco pleno aparece mais no eclético/neoclássico. **[P]/[I]**
- **Proporção.** Janelas altas e estreitas, h/c de cerca de 1,5 a 2,5 para janelas e 2,0 a 2,5 para portas. **[I]**
- **Parâmetros mínimos.** `c`, `h` (altura total), `hp` derivado como `h - c/2` ou informado e `h` derivado. Flecha implícita `f = c/2`. Condição: `h >= c/2`. **[G]**
- **Pontos de apoio.** Dois, na linha de arranque, a `hp` do piso/peitoril.
- **Construção.** Arco de alvenaria autoportante ou verga reta oculta sob um arco de enchimento; esquadria de madeira/alumínio acompanha a curva com bandeira fixa em arco. **[I]**

### 3.2 Arco abatido / segmental / rebaixado

- **Uso.** Vãos largos com pouca altura sobre a verga; janelas e portas de sobrados coloniais com vergas arqueadas; portais de ruas históricas. **[I]**
- **Proporção.** `f/c` típico entre 1/8 e 1/4 em obra. **[I]**
- **Parâmetros mínimos.** `c`, `hp` (ou altura até a linha de arranque), `f` (ou `R`). Derivados: `R`, centro (abaixo da linha), ângulo central. Validação: `0 < f < c/2`. **[G]**

### 3.3 Arco peraltado

- Pleno com pés-direitos prolongados ou trecho maior que semicírculo. Parâmetros iguais ao abatido, com `f > c/2`. **[G]**

### 3.4 Arco elíptico (semi-elipse) e policêntrico (carpanel)

- **Uso.** Portas e janelas de fachadas neoclássicas e de passagens carroçáveis (portões de casa com arco abatido de três centros). **[I]**
- **Parâmetros mínimos.** `c`, `hp`, `f`; para a semi-elipse, semieixos `a = c/2`, `b = f`. Opção `centros: 1 | 3 | 5` para escolher entre arco circular único, carpanel de 3 centros ou de 5 centros. **[G]/[I]**

### 3.5 Arco ogival (gótico, quebrado) e lanceolado

- **Uso.** Neogótico em igrejas e capelas brasileiras de fins do XIX e XX. **[I]**
- **Parâmetros mínimos.** `c`, `hp`, e uma entre: `f`, `R`, ou razão `R/c` (equilátero: 1,0). Validação: `R >= c/2`. Derivado `f = sqrt(R·c - c²/4)`. **[V]/[G]**

### 3.6 Arco mourisco (ferradura) e túmido

- **Uso.** Neomourisco/eclético, galerias, pórticos e elementos de inspiração árabe-portuguesa. **[I]** Ambiente de origem: Península Ibérica, via colonização. **[I]**
- **Parâmetros mínimos.** `c` (abertura nos apoios), `R` (maior que `c/2`), altura do centro `hc` acima da linha de arranque; derivado: ponto de tangência dos apoios e flecha total `f = hc + R`. Validação: `c < 2R`, `hc >= 0`. **[G]**

### 3.7 Arco trilobado (polilobulado) e conopial

- **Uso.** Neogótico e ornamentação de janelas (vitrais e bandeiras de igrejas). **[I]**
- **Parâmetros mínimos.** `c`, `hp`, `f`, número de lóbulos `n` (3 ou 5), razão de raio do lóbulo lateral (ex.: `r = c/4`). Conopial: `c`, `f`, `ponto de inflexão` (altura e posição). **[V]** como construção; valores usuais **[I]**.

### 3.8 Empena / triângulo / pentágono "casinha"

- **Uso.** Frontões, janelas de oitão/sótão em casas de telhado de duas águas, painéis de empena (Art Déco e modernista também usam forma triangular fixa). **[I]**
- **Parâmetros mínimos.** Triângulo: `c` (base) e `h`; ou `c`, `inclinação` (graus/%) ; assimetria: deslocamento do vértice `dx`. Pentágono "casinha": `c`, `hp`, `h`. **[G]**
- **Regra de desenho.** A inclinação da esquadria costuma acompanhar a inclinação do telhado que a abriga. **[I]**

### 3.9 Trapézio / vão inclinado em um lado (escada)

- **Uso.** Janelas ao longo de escada (peitoril e verga inclinados), vãos sob telhado de uma água, mansardas. **[I]**
- **Parâmetros mínimos.** `c`, `h_esq`, `h_dir`, base `y0` (e opcionalmente `y0_dir` para peitoril inclinado). **[G]**

### 3.10 Polígonos regulares (hexágono, octógono, pentágono)

- **Uso.** Óculos e vitrais decorativos; janelas de torres, mirantes e cúpulas. **[I]**
- **Parâmetros mínimos.** `n`, e uma entre: raio circunscrito, apótema ou distância entre faces; rotação (ex.: octógono "ponta para cima" ou "face para cima"). **[G]**

### 3.11 Circular, óculo e olho-de-boi

- **Uso.** Óculo: janela circular de pequena dimensão, ventilação e iluminação de sótão, fachada de igrejas, janelas Art Déco e modernistas (inspirada em escotilha). "Olho-de-boi" é o mesmo desenho em nomenclatura de arquitetura portuguesa e brasileira. **[I]**
- **Parâmetros mínimos.** `d` (diâmetro) e posição do centro `(x, y)` em relação a eixo do vão, ou `y` do centro ao piso. **[G]**
- **Variante com moldura.** Caixilho concêntrico e anel de moldura: espessura do anel. **[I]**

### 3.12 Oval, elipse e janela "bacia"

- **Parâmetros mínimos.** Eixos `a` e `b`, orientação (horizontal/vertical), centro. Aproximação construtiva por arcos policêntricos. **[G]**

### 3.13 Quarto de círculo e leque (fanlight, bandeira em leque)

- **Uso.** Bandeira de porta de entrada em leque sobre a folha, comum em neoclássico; quarto de círculo em canto de vão para escada em curva. **[I]**
- **Parâmetros mínimos.** Quarto de círculo: `R`, quadrante (4 orientações). Leque: `c`, `f` (normalmente `f = c/2`), `n_raios` (número de divisões radiais) e raio do cubo central. **[G]**

### 3.14 Janela de canto (corner window)

- **Uso.** Modernismo (fachada livre e janela em fita são características do modernismo brasileiro). **[V]** para "fachadas e janelas em fita permitem grandes vãos" (artigo SIGRADI 2022). Janela de canto sem pilar é recurso modernista. **[I]**
- **Parâmetros mínimos.** Duas paredes concorrentes (ângulo de encontro, normalmente 90°), um vão em cada parede com as respectivas larguras `c1`, `c2`, e `canto`: `com_montante` ou `vidro_colado/canto_vivo`. **[I]**
- **Observação de modelo.** É um grupo de duas aberturas ligadas, ou uma abertura com host em uma parede em "L". Requer decisão de arquitetura do modelo.

### 3.15 Bay window (saliente em ângulos) e bow window (saliente em arco)

- **Dados de catálogo (mercado americano, polegadas).** Bay de 45°: largura típica 54 a 90 pol (137 a 229 cm), altura 36 a 72 pol, projeção de 12 a 18 pol. Bay de 30°: largura de 66 a 102 pol. Bow: 4 a 6 painéis, 10° a 15° por painel, projeção de 10 a 16 pol, vão de 6 a 10 pés. **[P]** (dimensions.com, Pella, Loewen via busca; conversão feita aqui). Esses números são de fabricantes norte-americanos e não representam o mercado brasileiro. No Brasil, o equivalente típico é a **sacada envidraçada** e o balanço de madeira dos sobrados coloniais ("janela de peito", "muxarabi"). **[I]**
- **Parâmetros mínimos.** Bay: `c_total` (ou `c_central`), `ângulo` (30°/45°/90°), `projeção`, `n_painéis` (3), painel central fixo/aberto. Bow: `c_total`, `n_painéis` (4 a 6), raio do arco, `projeção`. Mais: se sustenta em laje própria ou em consolo. **[P]/[G]**

### 3.16 Janela inclinada, clarabóia e janela de telhado

- **Dados.** A maioria dos fabricantes indica **15° como inclinação mínima** de telhado e vai até 90° (Velux, Fakro; um modelo Emica só de 15° a 45°). Tipos de abertura: basculante (pivô central), projetante, vasistas, motorizada; um modelo é pensado para instalação alta (130 a 160 cm do piso). Dimensões comerciais comuns: 55x78, 55x98, 78x98, 94x118, 114x118, 134x98 cm. **[P]** (Leroy Merlin PT, via busca; mercado português)
- **Parâmetros mínimos.** Host (telhado ou laje inclinada), posição no plano do telhado, `c`, `h` (medidos no plano inclinado), inclinação herdada do host, tipo de abertura, altura de rufo (curb) se for clarabóia sobre laje plana. **[I]**
- **Clarabóia (skylight) em laje plana.** Caixa/curb com altura, domo ou vidro plano e rufos. Parâmetros: `c`, `l`, altura do curb, tipo (fixa, domo, abrir). **[I]**

### 3.17 Janela de água-furtada, trapeira, lucarna (dormer)

- **Dados.** Os resultados de busca não trouxeram definição técnica. **[I]** como segue: a trapeira (água-furtada) é uma janela vertical sobre o telhado, dentro de um pequeno volume com cobertura própria (duas águas, uma água, meia-lua/arqueada, empena) e faces laterais ("bochechas"). É recurso comum em mansardas e sobrados.
- **Parâmetros mínimos.** Host (telhado), posição, `c` da janela, `h` da janela, `profundidade` (projeção), tipo de cobertura (duas águas / uma água / arqueada), inclinação da cobertura, altura do peitoril acima do telhado. **[I]**
- **Observação.** É um objeto composto (volume + janela + telhado local), não apenas um vão. O Hestia pode começar tratando-o como "componente de telhado" separado da janela.

### 3.18 Seteira, rasgo e fresta

- **Uso.** Fortificações, e, hoje, rasgos verticais ou horizontais modernistas e contemporâneos para luz e ventilação controlada. **[I]**
- **Parâmetros mínimos.** `c` (estreito: 8 a 20 cm), `h`, **abertura com derrame** (largura maior na face interna: ângulo de derrame ou `c_int` e `c_ext`), profundidade da parede. **[I]**

### 3.19 Cobogó, muxarabi, brise e veneziana (elementos vazados e de proteção)

- **Dados históricos.** O cobogó surgiu em Pernambuco na década de 1920; o nome vem das sílabas iniciais dos sobrenomes de seus criadores; um dos primeiros usos foi a Caixa d'Água de Olinda (1934, Luiz Nunes). Inspira-se nos grafismos do muxarabi, que chegou ao Brasil pelos portugueses como treliça de madeira. Lúcio Costa o difundiu como referência sutil à arquitetura colonial. O brise-soleil foi sistematizado por Le Corbusier em 1933, e difere do cobogó por ser uma sequência de lâminas, não um elemento vazado. **[V]/[P]** (ArchDaily, UFRJ, ANTAC e reportagens; ver seção 11)
- **Cobogó (painel).** Não é esquadria no sentido da NBR 10821; é **painel modular perfurado** que preenche um vão ou uma parede. Parâmetros: `c`, `h`, módulo do bloco `(m_x, m_y)` (tamanhos comerciais de 20x20, 25x25 e 50x50 cm são comuns **[I]**), padrão do bloco, espessura, junta, `n_x`, `n_y` (derivados). **[I]**
- **Veneziana (esquadria).** Folhas com lâminas inclinadas, fixas ou móveis. Parâmetros: tipo (fixa, de abrir, de correr, persiana de enrolar), passo `p` entre lâminas, ângulo da lâmina (fixo ou 0°-90°), largura da lâmina. **[I]**
- **Muxarabi.** Treliça de madeira em balanço ou em vão. Parâmetros: abertura da treliça e padrão. **[I]**

### 3.20 Tipologias de abertura (formas retangulares com comportamento)

Estas são retangulares, mas mudam a **geometria interna** (folhas, eixo, movimento). Incluídas aqui por pertencerem à lista pedida.

| Tipologia | Descrição | Parâmetros mínimos | Confiança |
|---|---|---|---|
| Maxim-ar (projetante) | Abre para fora por hastes laterais, com controle do ângulo de ventilação. Medidas comerciais: 60x60, 60x80, 100x60 cm. | `c`, `h`, hastes/ângulo máximo, lado de abertura (fixo para fora) | **[V]/[P]** (varejo) |
| Basculante (pivô horizontal) | Folha gira em torno de eixo horizontal; usada em banheiros, cozinhas e áreas de serviço. | `c`, `h`, posição do eixo (centro ou deslocado), nº de folhas | **[V]/[P]** |
| Vitrô | Basculante de ferro ou alumínio em grade de lâminas, comum em banheiro; modelo clássico de casas dos anos 1940-70. | `c`, `h`, nº de lâminas verticais, altura da lâmina | **[P]/[I]** |
| Guilhotina | Folhas se deslocam na vertical (não por rotação). | `c`, `h`, nº de folhas (2), sobreposição, altura do trilho | **[V]** |
| Pivotante vertical (janela/porta) | Folha gira em eixo vertical. | `c`, `h`, deslocamento do eixo `e`, peso | **[V]** |
| Camarão | Folhas articuladas que dobram em sanfona; nome regional, termo ambíguo. | `c`, `h`, nº de folhas articuladas, lado de recolhimento | **[P]** (busca citou "sanfonada" sem detalhar) |
| Tombar-e-girar (tilt & turn) | Uma folha com duas aberturas: vertical-basculante (tomba) e batente (gira), com ferragem europeia. | `c`, `h`, lado da dobradiça, modo ativo (gira/tomba) | **[I]** |
| Janela de correr | Folhas deslizando em trilho; limites típicos de sistema (por exemplo, FAD do PBQP-H: alumínio de correr até 1,00 x 1,50 m por folha em alguns sistemas). | `c`, `h`, nº de folhas, sobreposição, trilhos | **[P]** |

### 3.21 Portas especiais

| Tipologia | Dados | Parâmetros mínimos | Confiança |
|---|---|---|---|
| Porta de duas folhas (de abrir) | Folhas iguais ou desiguais (ex.: "uma folha e meia"). | `c`, `h`, razão `r` entre folhas, folha ativa | **[I]** |
| Porta pivotante grande | Dobradiça pivotante System M+ (FritsJurgens): portas de 20 a 500 kg, sem limite de altura. System 3: 40 a 350 kg e larguras de 1000 a 3800 mm. Outro sistema: folha de 600 a 2950 mm de largura e 700 a 2200 mm de altura. Distância mínima do eixo à extremidade: 70 mm; máxima: até o centro. Espessura mínima da porta: 40 a 50 mm conforme o sistema. Porta pivotante de alumínio de varejo: 243,5 x 146,2 cm. | `c`, `h`, espessura, deslocamento do eixo `e` (70 mm mínimo), peso | **[P]** (valores de fabricantes específicos) |
| Porta de correr embutida (cassete) | A busca não trouxe fichas. Característica construtiva: a folha corre **dentro da parede** (caixa/cassete), exigindo trecho de parede livre de instalações igual a `c` da folha mais folga. | `c`, `h`, espessura da parede/caixa, lado de recolhimento, comprimento da caixa (>= c) | **[I]** |
| Porta de correr de superfície (barn) | Folha corre em trilho aparente. | `c`, `h`, sobreposição no vão, comprimento de trilho | **[I]** |

### 3.22 Portões de garagem

Fonte de fabricantes (Kingspan Isoeste, DAPORTAS/Novo da Portas), texto parcial. **[P]**

| Tipo | Dados | Parâmetros mínimos |
|---|---|---|
| Seccionado | Folgas laterais de 80 a 100 mm; folga superior mínima de "altura do vão mais 500 mm" (ficha série V, texto corrompido); em porta industrial Kingspan Isoeste, pé-direito livre mínimo = vão-luz + 900 mm; calhas "dupla, normal, inclinada e padieira reduzida" mudam o recuo superior. Instalação reduz 5 a 7 cm de altura livre segundo relato de usuário. | `c`, `h` do vão-luz, recuo lateral `rl`, recuo superior `rs` (função do tipo de calha), profundidade para trás (comprimento do trilho), tipo de calha |
| Basculante | A busca não trouxe medidas. Característica: a folha gira para fora ao abrir, ocupando projeção no lote (prefeituras exigem que o movimento ocorra dentro do lote ou com recuo suficiente). Variantes: basculante de contrapeso, de molas. | `c`, `h`, projeção externa `p` (máxima, depende do mecanismo), tipo de mecanismo |
| Enrolar | A busca não trouxe dados. Caixa do rolo acima do vão; diâmetro depende da altura e das lâminas. | `c`, `h`, altura da caixa `hc` e profundidade, tipo de lâmina |
| Correr (carro) | Folha desliza ao lado do vão, em trilho. | `c`, `h`, comprimento de recolhimento (>= c) |

Observação de projeto: o vão pode ter vigas, tubulações ou revestimentos que reduzem a abertura útil, e é preciso descontar guarnições. Verificar esquadro do vão pelas diagonais (diferença de cerca de 12 mm já indica vão fora de esquadro). **[P]**

### 3.23 Fachada pele de vidro (curtain wall)

- **O que é.** Parede-cortina: pele contínua de painéis (vidro, opaco, venezianas, janelas) sustentada por **montantes** (verticais) e **travessas** (horizontais) fixados à estrutura. Dois sistemas: *stick* (montado em obra, peça por peça) e *unitizado* (módulos prontos de piso a piso). A busca não encontrou dados de módulos. **[I]**
- **Parâmetros mínimos.** Grade: espaçamento de montantes `mx` (típico de 1,2 a 1,5 m **[I]**), altura de módulo `mh` (pé-direito), travessas intermediárias, tipo de painel por célula (vidro fixo, abrir, opaco, porta), perfil (largura visível, profundidade), superfície de referência (plana, curva em planta).
- **Referência de software.** O Archicad documenta a criação de **Parede Cortina Curva por métodos geométricos** (ajuda do Archicad 24 a 30), o que confirma que a concorrência trata a pele de vidro como elemento próprio. **[V]**
- **Recomendação.** No Hestia, tratar como entidade separada ("parede cortina") com grade paramétrica e células que podem conter janelas ou portas, não como esquadria única.

---

## 4. Onde cada forma aparece, por estilo

A tabela abaixo mistura o que as fontes sustentam com o que é prática comum. Marcas por linha.

| Estilo | Vãos e esquadrias características | Confiança |
|---|---|---|
| **Colonial brasileiro** | Vãos retangulares altos, **verga reta** ou ligeiramente arqueada; janelas com **venezianas, rótulas (treliças) e guilhotina**; portas almofadadas; muxarabi e gelosia; **cunhais** e ombreiras de cantaria emoldurando; peitoril saliente. Em Ouro Preto, o arco pleno aparece em edifícios posteriores/ecléticos. | **[P]** (TCCs IFMG sobre Ouro Preto); cunhais e gelosia **[I]** |
| **Neoclássico** | Vãos com eixo de simetria, verga reta ou arco pleno/abatido, molduras (ombreiras com capitel, frontão sobre a verga), bandeira em leque, portas de duas folhas, óculos em frontões. | **[I]** |
| **Eclético/neogótico/neomourisco** | Arcos ogivais, trilobados, ferradura, rosáceas; bandeiras e vitrais; torres com janelas poligonais. | **[I]** |
| **Art Déco** | Verticalidade, vãos em fita vertical, vidros em linhas geométricas, óculos e escotilhas, ferragens geométricas, peitoris contínuos, bandeiras gradeadas. A busca não trouxe fonte. | **[I]** |
| **Modernista brasileiro** | **Janela em fita e fachada livre** (grandes vãos), esquadrias de correr e basculantes em ferro/alumínio, **cobogó** (Pernambuco, anos 1920, difundido por Lúcio Costa), **brise-soleil** (sistematizado por Le Corbusier em 1933), venezianas, vitrô, janela de canto. | **[V]/[P]** (SIGRADI 2022, ANTAC, ArchDaily, UFRJ) |
| **Contemporâneo** | Grandes panos de vidro de correr ou pivotantes, portas pivotantes grandes, caixilhos esbeltos (perfis mínimos), pele de vidro, janelas de canto sem montante, cobogó revisitado, **caixilhos em arco de estilo retrô** voltam (tendência apontada pela imprensa), clarabóias. | **[P]** (reportagens), demais **[I]** |

---

## 5. Esquadria e alvenaria: interfaces construtivas

| Elemento | Função e regra | Parâmetros no modelo | Confiança |
|---|---|---|---|
| **Verga** | Sobre o vão; evita fissuras; concreto armado moldado in loco ou pré-moldada, transpasse de 20 a 40 cm por lado conforme a fonte. | `h_verga`, `transpasse`, tipo | **[P]** |
| **Contraverga** | Sob janelas, reforça cantos inferiores e evita trinca diagonal; mesmo transpasse. Não é usada em porta (a soleira é o piso). | `h_contraverga`, `transpasse` | **[P]/[I]** |
| **Arco de alvenaria sobre o vão** | O arco descarrega em duas ombreiras (apoios). Em construção moderna, é frequente haver **verga reta de concreto oculta** sob um arco de enchimento, e o arco vira elemento de acabamento. Sem verga/ cinta, exige ombreiras capazes de resistir ao empuxo horizontal. | `tipo_arco_estrutural`: autoportante / com verga oculta; `largura_ombreira` | **[I]** |
| **Ombreira** | Face lateral do vão, onde o contramarco/batente é fixado. | `largura_ombreira`, acabamento | **[V]** (termo) / **[I]** (uso) |
| **Cunhal / moldura** | Reforço de canto e moldura do vão em fachadas históricas. | `largura_moldura`, `saliência` | **[I]** |
| **Peitoril** | Base inferior do vão: pedra, concreto ou cerâmica; protege a alvenaria de infiltração; ressalto e pingadeira. Peitoril de granito comercial: 122 x 14 cm, 162 x 14 cm. | `saliência`, `largura`, `caimento`, `pingadeira` | **[V]** (função); medidas comerciais **[P]** (Telhanorte) |
| **Pingadeira** | Direciona a água, evita manchas na fachada, inclusive em verga e laje. | `tipo`, `profundidade` | **[V]** |
| **Contramarco / requadro** | Quadro de assentamento da esquadria; o vão de alvenaria é maior que a esquadria pela folga de assentamento. O Guia de Esquadrias da CBIC (2017) e as partes da NBR 10821 (2: requisitos; 3: ensaios; 5: instalação e manutenção) tratam da interface. O texto não foi lido. | `folga_assentamento` (típico de 1 a 2 cm por lado **[I]**) | **[P]** |

Regra de modelo: o vão de alvenaria (`c_vao`, `h_vao`) e a dimensão nominal da esquadria (`c_esq`, `h_esq`) são **grandezas diferentes** ligadas pela folga de assentamento. Em arco, a folga se aplica ao longo da curva, o que gera uma segunda curva concêntrica (offset). **[I]**

---

## 6. Parâmetros mínimos por forma (tabela de resumo)

Todos em metros (ou milímetros) no sistema local descrito na seção 3. `*` = obrigatório; `d` = derivado.

| Forma | Parâmetros | Derivados | Validação principal |
|---|---|---|---|
| Retângulo | `c*`, `h*` | | `c, h > 0` |
| Arco pleno | `c*`, `h*` | `hp = h - c/2`, `R = c/2` | `h >= c/2` |
| Arco abatido | `c*`, `hp*`, `f*` (ou `R`) | `R`, centro, `θ`, `h = hp + f` | `0 < f < c/2` |
| Arco peraltado | `c*`, `hp*`, `f*` | `R`, centro | `f > c/2` |
| Semi-elipse | `c*`, `hp*`, `f*` | `a = c/2`, `b = f` | `f > 0` |
| Policêntrico (3/5 centros) | `c*`, `hp*`, `f*`, `n_centros*` | raios e centros | `f > 0` |
| Ogival | `c*`, `hp*`, `R/c*` (ou `f`) | `f`, centros | `R >= c/2` |
| Ferradura | `c*`, `R*`, `hc*`, `hp*` | `f_total = hc + R` | `c < 2R` |
| Trilobado | `c*`, `hp*`, `f*`, `n_lóbulos*`, `r_lóbulo*` | centros dos lóbulos | `n` ímpar |
| Conopial | `c*`, `hp*`, `f*`, ponto de inflexão* | | |
| Empena/triângulo | `c*`, `h*`, `dx` (assimetria) | inclinação | `0 <= dx <= c` |
| "Casinha" (pentágono) | `c*`, `hp*`, `h*` | inclinação | `h > hp` |
| Trapézio | `c*`, `h_esq*`, `h_dir*`, `y0` | inclinação | `h_esq, h_dir > 0` |
| Polígono regular | `n*`, raio ou apótema*, rotação | vértices | `n >= 3` |
| Circular/óculo | `d*`, centro `(x, y)*` | | `d > 0` |
| Oval/elipse | `a*`, `b*`, orientação, centro | | |
| Quarto de círculo | `R*`, quadrante* | | |
| Leque | `c*`, `f*` (padrão `c/2`), `n_raios*` | raio do cubo | |
| Janela de canto | `c1*`, `c2*`, `ângulo*`, `canto*` | | duas paredes |
| Bay | `c_total*`, `ângulo*`, `projeção*`, `n=3` | larguras dos painéis | |
| Bow | `c_total*`, `n*` (4 a 6), `projeção*` | raio, ângulo por painel | `n >= 4` |
| Janela de telhado | host, posição, `c*`, `h*` | inclinação do host | `>= 15°` **[P]** |
| Clarabóia (laje plana) | `c*`, `l*`, `h_curb*` | | |
| Dormer | host, posição, `c*`, `h*`, `profundidade*`, tipo de cobertura* | inclinação | |
| Seteira | `c*`, `h*`, `c_int` ou ângulo de derrame*, profundidade | | `c` estreito |
| Cobogó | `c*`, `h*`, módulo `(m_x, m_y)*`, padrão* | `n_x`, `n_y` | |
| Veneziana | tipo*, `p*` (passo), ângulo | nº de lâminas | |
| Porta pivotante | `c*`, `h*`, `e*` (eixo), espessura*, peso | | `e >= 70 mm` **[P]** |
| Porta embutida (cassete) | `c*`, `h*`, comprimento da caixa*, lado* | | caixa `>= c` |
| Porta de 2 folhas | `c*`, `h*`, razão* | | |
| Portão seccionado | `c*`, `h*`, `rl*`, `rs*`, comprimento do trilho* | | `rl` 80 a 100 mm **[P]** |
| Portão basculante | `c*`, `h*`, projeção* | | |
| Portão de enrolar | `c*`, `h*`, caixa* | | |
| Pele de vidro | superfície, `mx*`, `mh*`, perfil, painéis por célula | grade | |

---

## 7. Proposta de modelo de dados (para discussão)

**[I]**, proposta de projeto, não de fonte.

```
OpeningShape =
  | { kind: 'rect',      c, h }
  | { kind: 'arch',      subkind: 'pleno'|'abatido'|'peraltado'|'ogival'|'ferradura'|'elíptico'|'policêntrico'|'trilobado'|'conopial',
                         c, hp, f?, R?, hc?, n_centros?, n_lobulos? }
  | { kind: 'circle',    d, cx, cy }
  | { kind: 'ellipse',   a, b, cx, cy, rot }
  | { kind: 'polygon',   n, r | apothem, rot }          // regular
  | { kind: 'triangle',  c, h, dx? }
  | { kind: 'trapezoid', c, h_esq, h_dir, y0? }
  | { kind: 'quadrant',  R, quadrante }
  | { kind: 'fan',       c, f, n_raios }
  | { kind: 'custom',    path: [ {x, y, bulge?} ... ] } // polilinha fechada com bulge (arco entre vértices)
```

Pontos de decisão:

1. **Contorno único vs. um tipo por forma.** Um gerador por forma que **produz sempre uma polilinha com bulge** permite que planta, elevação, corte, 3D, IFC e DXF consumam apenas uma representação. A forma `custom` fica de graça. **[I]**
2. **IFC.** O IFC aceita perfil arbitrário fechado extrudado (`IfcArbitraryClosedProfileDef`) com curvas compostas; a busca confirmou que `IfcDoorLiningProperties`/`IfcWindowPanelProperties` definem parâmetros que **não** carregam geometria própria, então formas especiais devem ser exportadas por `IfcShapeRepresentation`. Os valores de `IfcWindowTypePartitioningEnum` correspondentes a arco, círculo etc. **não foram confirmados** pela busca; verificar antes de mapear. **[P]**
3. **Vão na parede vs. esquadria.** O vão (recorte na parede) acompanha o contorno externo da esquadria mais a folga. Em arco, é uma segunda curva (offset). Pensar em uma função `offset(shape, d)` que retorne o contorno do vão a partir do contorno da esquadria.
4. **Host.** Janela de telhado, clarabóia e dormer têm host em telhado ou laje; janela de canto tem host em duas paredes; pele de vidro tem host em superfície. Isso afeta o tipo de objeto, não só a forma. **[I]**
5. **Presets.** Para as formas com fórmula (ogival equilátero, pleno), oferecer presets que preenchem o parâmetro obrigatório (`R = c`, `f = c/2`) e travam o campo. **[I]**

---

## 8. Como esquadrias de forma especial são cotadas e detalhadas em projeto executivo

A busca dirigida a esse assunto não achou fonte em português (retornou ajuda de software e geometria básica). O que segue é prática geral de projeto, **[I]** em sua totalidade, a validar com um projetista ou com a NBR 6492 (representação de projetos de arquitetura) e a NBR 10821.

### 8.1 Planta

- Símbolo da esquadria conforme tipo de abertura (arco de giro de porta, linhas do vão, etc.); o contorno curvo só aparece em planta se a esquadria for **de canto, bay/bow ou em parede curva**. Nas demais, a planta mostra o vão reto.
- Cota do vão (largura) entre ombreiras acabadas, e **código da esquadria** (por exemplo, `J-01`, `P-02`) ligando ao quadro de esquadrias.

### 8.2 Elevação

| Forma | Como é cotada |
|---|---|
| Retangular | Largura do vão, altura do vão, cota do peitoril (do piso acabado ao vão) e cota da verga. |
| Arco (pleno, abatido) | Largura do vão `c`, **altura até a linha de arranque** (`hp`), **flecha `f`** ou **raio `R`** (por exemplo, `R = 1,10`), **cota do centro** do arco, altura total. Indica-se a linha de arranque com traço fino e as ombreiras. |
| Ogival, ferradura, trilobado | Mesma cotagem do arco, com **cada raio e a posição de cada centro**, ou gabarito. |
| Circular/óculo | **Diâmetro** (`Ø`) e **cota do eixo do centro** ao piso e ao eixo do vão. |
| Oval/elipse | Eixo maior, eixo menor, cota do centro. |
| Polígono | Largura entre faces (ou diâmetro circunscrito), altura, rotação. |
| Triângulo/trapézio | Largura da base e as alturas de cada extremidade (ou inclinação). |
| Seteira | Largura externa, largura interna, altura e profundidade (com derrame). |

### 8.3 Detalhe e quadro de esquadrias

- **Quadro de esquadrias:** código, tipologia, dimensões (c x h, com flecha ou raio se arco), material do caixilho, vidro, quantidade, ferragem, cor, observações. **[I]**
- **Detalhes 1:5 ou 1:10:** corte da verga e do peitoril (com pingadeira), corte horizontal da ombreira com o contramarco, assentamento e selagem. **[I]**
- **Gabarito (template) em escala 1:1.** Para arcos e formas livres o serralheiro/marceneiro costuma pedir um molde em tamanho real ou arquivo DXF; no Hestia, exportar o contorno em DXF 1:1 é um valor direto. **[I]**
- **Vão bruto e vão acabado.** O vão em alvenaria é cotado bruto; quando há revestimento (reboco, cerâmica), indica-se o vão acabado. A folga de assentamento fica entre a esquadria e o vão bruto. **[I]**
- **Tolerância de esquadro.** Verificação em obra pelas diagonais do vão (relato de fabricante de portões). **[P]**

---

## 9. Observações sobre elementos que não são uma "forma"

| Elemento | Por que não é só um contorno |
|---|---|
| Bay/bow | Várias folhas em ângulo, projeção, e geralmente base própria (laje/consolo) e cobertura própria. |
| Dormer | Volume com cobertura, faces laterais e janela dentro dele. |
| Pele de vidro | Sistema de grade; as células viram painéis, janelas ou portas. |
| Cobogó | Painel modular, trata mais como parede perfurada do que como janela. |
| Portão de garagem | Depende de trilhos, recuos laterais e superior, caixa e motor; o vão no desenho é só uma parte. |
| Porta de correr embutida | Exige parede dedicada (cassete) sem instalações; a esquadria define uma restrição à parede ao lado. |
| Janela de canto | Duas paredes concorrentes. |

---

## 10. Backlog sugerido (ordem de impacto estimada, **[I]**)

1. Contorno paramétrico com bulge e geradores: **arco pleno, abatido, peraltado, circular/óculo, triângulo/empena, trapézio** (cobre a maior parte dos casos reais).
2. Ogival, ferradura, elipse e polígono regular.
3. Offset do contorno (esquadria x vão) e cotas de executivo para essas formas (seção 8).
4. Verga, contraverga e peitoril como elementos parametrizados (seção 5).
5. Objetos compostos: bay/bow, janela de canto, dormer, clarabóia, portões de garagem, pele de vidro, cobogó. Cada um requer decisão de modelo (seção 9).
6. Exportação IFC e DXF 1:1 do contorno (seção 7).

---

## 11. Fontes consultadas

Todas por resumo de busca; nenhuma lida na íntegra (ver limite na seção 0). Status por fonte: **L** = trecho relevante apareceu no resumo; **P** = só título/relevância.

**Arcos, geometria e traçado**
- Tesauro SIPA (arco abatido/rebaixado, outras definições): https://vocabs.rossio.fcsh.unl.pt/pub/tesauro-sipa/en/page/c_67d57a30?clang=pt (L)
- Publicação gov.br sobre arcos de madeira (vão, flecha, relação f/L): https://www.gov.br/florestal/pt-br/centrais-de-conteudo/publicacoes/publicacoes-diversas/lpf/arcos-de-madeiras-1989.pdf/@@display-file/file (L)
- Material didático de traçado de arcos, Xunta de Galicia (medio punto, rebajado, peraltado, ogival, herradura, polilobulado, carpanel, conopial): https://centros.edu.xunta.gal/iessanchezcanton/aulavirtual/mod/resource/view.php?id=98383 (L)
- Outros materiais de arcos citados na busca: https://centros.edu.xunta.gal/iesasbarxas/aulavirtual/pluginfile.php/43143/mod_resource/content/1/4.%20Arcos.pdf , https://riunet.upv.es/bitstreams/aedfb3bc-ca30-48ef-83d7-58a995dec49c/download , https://www.urbipedia.org/hoja/Arcos (P)
- Teoria do arco de alvenaria, UnB: https://www.repositorio.unb.br/bitstream/10482/4465/1/2009_PatriciaCristinaCunhaNunes_orig.pdf , https://repositorio.unb.br/bitstream/10482/17989/1/2014_FranciscoAfonsodeCastroJunior.pdf (P)

**Verga, contraverga, peitoril, pingadeira**
- ABM, "Vergas e contravergas em alvenaria": https://abmproceedings.com.br/en/article/download-pdf/vergas-e-contravergas-em-alvenaria (L)
- Olhar Digital (transpasse de 20 cm em memoriais públicos): https://olhardigital.com.br/curiosidades/?p=25717 (L)
- SINAPI, caderno técnico de vergas, contravergas e fixação de alvenaria: https://www.caixa.gov.br/Downloads/sinapi-cadernos-tecnicos/SINAPI-CT-VERGAS-CONTRAVERGAS-E-FIXACAO-DE-ALVENARIA.pdf (P; fetch bloqueado)
- SINAPI, consulta pública de peitoris e chapins: https://www.caixa.gov.br/Downloads/sinapi-consulta-publica/SINAPI-CP-PEITORIS-E-CHAPINS.pdf (L, via busca)
- AECweb, pingadeira: https://www.aecweb.com.br/produto/pingadeira/55120 (L)
- AECweb, peitoris de janela: https://www.aecweb.com.br/produto/peitoris-de-janela/5981 (P)
- Manual da contraverga (acesso restrito): https://larpontual.com.br/portal/premium/cadernos-tecnicos/manual-da-contraverga/2026/01 (P)

**Tipologias de esquadrias e normas**
- Apostila USP sobre esquadrias (pivotante, basculante, guilhotina etc.): https://edisciplinas.usp.br/mod/resource/view.php?id=2760929 (P; fetch bloqueado)
- Guia de Esquadrias para Edificações, CBIC (2017): https://cbic.org.br/wp-content/uploads/2017/11/Guia_de_Esquadrias_para_Edificacoes_2017.pdf (P; fetch bloqueado)
- DecorFácil, modelos de janelas: https://www.decorfacil.com/modelos-e-tipos-de-janelas , https://www.decorfacil.com/esquadria-de-aluminio (L)
- Catálogos de varejo (maxim-ar, basculante): https://www.telhanorte.com.br/janela-maximar-de-aluminio-ouro-p20-100x60cm-branca-ebel-764116/p , https://www.aecweb.com.br/produto/janela-maxim-ar-de-aluminio/116291 (L)
- Catálogos Hydro/Technal (Ivgold, Nova Gold): https://www.hydro.com/globalassets/catalogo_ivgold-r11.pdf , https://www.hydro.com/globalassets/catalogo_nova_gold-r47.pdf (P)
- PBQP-H, fichas FAD (limites de sistemas de correr): https://pbqp-h.mdr.gov.br/wp-content/uploads/2021/09/FAD-No-11-2.pdf (P)
- Acessibilidade (NBR 9050:2020, via resumos): https://engenharia360.com/a-nbr-9050-acessibilidade-e-desenho-universal/ , https://www.macae.rj.gov.br/midia/uploads/file/Acessibilidade-orienta%C3%A7%C3%B5es-revisado-2017.pdf (L)

**Estilos, tipologias históricas e modernismo**
- TCC "Tipologias de janelas em edificações históricas de Ouro Preto", IFMG: https://restauro.ouropreto.ifmg.edu.br/wp-content/uploads/sites/33/2020/01/TCC-Tipologias-de-Janelas-em-Edificações-Históricas-de-OP.pdf (L)
- Inventário de esquadrias de rua histórica, IFMG: https://repositorio.ifmg.edu.br/bitstreams/335b1b75-36ab-490e-81d9-a88ec9043989/download (L)
- Estudo Geral UC (janela tradicional: verga, ombreiras, peitoril): https://estudogeral.uc.pt/bitstream/10316/7410/1/Primeira%20parte.pdf (L)
- Colonial architecture of Brazil: https://en.wikipedia.org/wiki/Colonial_architecture_of_Brazil (P)
- Cobogó, ArchDaily: https://www.archdaily.com/875130/cobogos-a-brief-history-and-its-uses/ (L)
- Brise e cobogó, ANTAC: https://eventos.antac.org.br/index.php/entac/article/download/807/492/1636 (L)
- Janela em fita e fachada livre, SIGRADI 2022: https://pdf.blucher.com.br/designproceedings/sigradi2022/sigradi2022_62.pdf (L)
- Muxarabi, cobogó e brise (UFRJ): https://pantheon.ufrj.br/bitstream/11422/10127/1/VBOSantos.pdf (P)
- Arcos em caixilhos retrô (imprensa): https://oantagonista.com.br/economia/janelas-pequenas-com-grade-sairam-de-moda-os-caixilhos-em-arco-de-estilo-retro-voltam-para-ampliar-a-iluminacao-natural/ (P)

**Bay/bow, janelas de telhado, portas e portões**
- Dimensões de bay/bow: https://dimensions.com/collection/bay-windows-bow-windows , https://stanekwindows.com/bow-and-bay-window-sizes.aspx , https://media.pella.com/professional/adm/Clad-Wood/Pella-Wood_BayBowWindows.pdf (L, mercado americano)
- Janelas de telhado (Velux, Fakro, Leroy Merlin PT): https://www.leroymerlin.pt/produtos/janela-de-sotao-manual-velux-projetante-gpl-mk04-2076f-78x98cm-19807284.html , https://www.bimobject.com/pt/velux/product/ggl-b (L)
- Pivotantes, FritsJurgens: https://www.fritsjurgens.com/files/family-m/SystemMMplus-PT.pdf , https://www.fritsjurgens.com/files/system-3/System3-PT.pdf (L)
- Pivotante Strugal: https://www.strugal.com/sites/default/files/2026-07/fic-s82rp-nexus-pivot.pdf (L)
- Portões seccionados (fichas técnicas): https://cdn.weasy.io/users/novodaportas/other/pt_ficha_tecnica_portoes_seccionados_serie_v_revisaoagosto2024.pdf , https://cdn.weasy.io/users/novodaportas/other/pt_ficha_tecnica_portoes_seccionados_serie_c_revisaojulho2024.pdf (P, texto corrompido)
- Kingspan Isoeste, manual de instalação de porta seccional: https://downloads.kingspan-isoeste.com.br/Manuais/Kingspan-Isoeste-Porta-Seccional-Manual-de-Instala%C3%A7%C3%A3o-PT-BR.pdf (L)
- Medição de vão para portões: https://cursa.app/pt/pagina/levantamento-de-medidas-no-local-para-portoes-e-grades-vao-prumo-nivel-e-referencias (L)

**IFC e software de referência**
- IFC 4.3, IfcWindowTypePartitioningEnum: https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcWindowTypePartitioningEnum.htm (P; valores não confirmados)
- IFC 4.3, IfcWindow / IfcDoor / propriedades de lining e panel: https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcWindow.htm , https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcDoor.htm (L)
- Archicad, parede cortina curva: https://help.graphisoft.com/AC/29/BRA/_AC29_Help/040_ElementsVB/040_ElementsVB-162.htm (L)

**Contexto interno do repositório.** `docs/aberturas/B-estado-atual.md` (linha 276) registra que "vão em arco e formas não retangulares" ficaram para a fase de famílias (referência a `docs/paridade/paredes.md`, D5). Este estudo alimenta essa fase.

---

## 12. Lacunas (o que ainda precisa ser lido ou confirmado)

1. **Normas ABNT:** NBR 10821 (partes 1 a 5), NBR 6492 (representação em projeto de arquitetura), NBR 9050 (texto), NBR 14718 (guarda-corpo, altura de peitoril), NBR 15575 (desempenho). Nenhuma foi lida; os valores são de resumos. **Pendente.**
2. **Guia de Esquadrias da CBIC (2017)** e **SINAPI caderno técnico de vergas**: abrir quando a rede permitir (hosts `cbic.org.br` e `caixa.gov.br` estavam bloqueados nesta sessão).
3. **Traçado passo a passo** de ferradura, trilobado, carpanel, conopial e Tudor: os resumos confirmam apenas a existência e a natureza dos centros.
4. **Tabelas de módulo de pele de vidro e de portões** (basculante e de enrolar): a busca não trouxe dados confiáveis.
5. **Tratados de arquitetura** (Vignola, Palladio, Vitrúvio, Choisy, Reis Filho): não consultados nesta rodada. Servem para proporções clássicas de vãos (relação altura/largura, ordens) e para a Seção 4.
6. **Terminologia brasileira de "camarão"** (porta ou janela): o termo apareceu sem definição técnica; validar em catálogo de fabricante.
7. **Valores marcados [I]** (flechas típicas, proporções h/c, folgas de assentamento, módulos de cobogó, módulos de pele de vidro): confirmar com projetista ou catálogo antes de virar regra do software.
