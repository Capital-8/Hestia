# 08 - CreaBIM: leitura profunda do modelo de esquadrias

Tarefa A8 do estudo de esquadrias do Hestia. Somente leitura do repositório `/home/user/chopinregis/creabim` (commit `498b370`, 2026-11-15; Rust, 10 crates, cerca de 930 testes `#[test]`). Caminhos abaixo são relativos a essa raiz, salvo indicação.

## AVISO DE LICENÇA (leia primeiro)

O CreaBIM é **GPL-3.0** (`LICENSE`). O Hestia é **MIT**. Copiar, traduzir linha a linha ou adaptar de perto o código do CreaBIM para o Hestia contaminaria o Hestia com a GPL. Este documento descreve **ideias, modelo de dados e comportamento observável**, em palavras e pseudocódigo próprios, sem transcrever trechos. Nomes de campos e de tipos IFC aparecem só como identificadores factuais (IFC é padrão aberto). Quem for implementar no Hestia deve trabalhar a partir deste texto e das normas/IFC, sem abrir o código do CreaBIM ao lado. Onde o comportamento é só uma ideia útil, ela está marcada como "ideia aproveitável".

## 1. Resumo executivo

O CreaBIM modela esquadria de forma **deliberadamente simples**: um vão retangular (`Opening`) preso a uma parede por (parede, deslocamento, peitoril, largura, altura), com três "espécies" (porta, janela, furo vazio) e um parâmetro de "quadro" muito curto (largura e profundidade do batente, número de divisões de vidro na horizontal e na vertical). A geometria é **gerada na hora** como uma lista de caixas (batente, folha, vidro, maçaneta) que alimenta 3D, planta, corte/elevação e IFC. Não há arco, bandeira, laterais, perfis, folhas múltiplas, correr, pivotante, alizar, nem composição por células.

É o oposto do Hestia atual (composição por células, perfis, ferragens, alizar, catálogo de 130 tipos, ver `docs/aberturas/F-PROGRESSO.md`). O valor do CreaBIM para o estudo está em quatro pontos: (1) o contrato "uma descrição, quatro consumidores" (3D, desenhos, quadro e IFC saem da mesma lista de caixas); (2) a regra de **mão e lado** (duas bandeiras booleanas) e sua leitura em texto ("Direita, para dentro"); (3) o **IFC de ida e volta** com `IfcOpeningElement` + `IfcRelFillsElement` e a importação tolerante; (4) a **interface de colocação** (fantasma antes do clique, alças de arrastar, Tab entre paredes sobrepostas) e as **verificações** (vão que cruza junta de parede, objeto dentro do arco de giro).

## 2. Modelo de dados

Arquivos: `crates/creabim-core/src/element.rs` (struct `Opening`, enum `OpeningKind`, struct `OpeningFrame`), `crates/creabim-core/src/types.rs` (tipos), `docs/creabim-model.schema.json` e `docs/json-format.md` (formato JSON aberto).

### 2.1 Vão (`Opening`)

Um elemento do modelo, filho de uma parede (`host`). Campos:

| Campo | Significado |
|---|---|
| `host` | id da parede hospedeira (única; não há vão em laje, telhado ou pilar) |
| `kind` | `Door`, `Window` ou `Hole` (furo retangular vazio) |
| `offset` | distância do início da parede até a borda esquerda do vão, medida ao longo da parede (em parede curva, ao longo do arco) |
| `sill` | altura da borda inferior acima da base da parede (porta: 0; janela padrão: 0,9 m) |
| `width`, `height` | dimensões do vão |
| `material` | um único material para o conjunto (opcional) |
| `frame` | os 4 números de `OpeningFrame` (abaixo) |
| `flip_hand` | porta articulada no outro montante |
| `flip_facing` | porta abrindo para o lado oposto ao padrão; janela com a face externa para dentro |

Validação (`element.rs`, ramo `Opening`): largura e altura positivas; peitoril e deslocamento não negativos. Nada mais (sem limite de peitoril+altura contra a altura da parede na validação; o recorte na geometria é que prende o vão à parede).

Ideia aproveitável: a face (lado) **não** é guardada como "esquerda/direita" absoluta, e sim derivada de três fatos: espécie, se a parede está invertida (`flip` da parede) e `flip_facing`. Porta abre para o lado "interior", janela olha para o "exterior"; o exterior é o lado direito da parede, a menos que a parede seja invertida. Consequência desejada: **inverter a parede vira as portas e janelas junto**. Em pseudocódigo próprio: `lado_esquerdo = (interior_é_esquerda se porta, senão exterior_é_esquerda) XOR flip_facing`.

### 2.2 Quadro (`OpeningFrame`)

Quatro parâmetros: largura da face dos montantes (padrão 6 cm), profundidade através da parede (padrão 10 cm, limitada à espessura da parede), divisões do vidro "lado a lado" e "uma sobre a outra" (padrão 1x1). Há uma operação "ajustar ao vão" que limita a largura do montante a um terço do menor lado do vão, a profundidade entre 2 cm e a espessura da parede, e as divisões entre 1 e 12. Serialização tolera arquivos antigos sem o campo (teste em `element.rs`, perto da linha 2330: arquivo sem `frame` lê o padrão e viaja de volta).

### 2.3 Tipos (`OpeningType`) e herança

`types.rs` define tipos de porta e de janela (`TypeParams::Door` / `Window`) com: largura, altura, peitoril, quadro, material. A instância guarda uma referência ao tipo e **marca quais parâmetros divergem do tipo** (override por parâmetro: Largura, Altura, Peitoril, Quadro, Material). O tipo também mapeia para `IfcDoorType` / `IfcWindowType`. Catálogo inicial ("starters") com apenas seis tipos: porta 900x2100, 800x2100, larga 1200x2100, janela 1200x1300 com 2 divisões, janela 600x1300 e janela alta 900x2100 com 3 divisões verticais e peitoril 0,10. No formato JSON, o vão pode apontar um `type` e herdar largura, altura, peitoril, quadro e material (`docs/json-format.md`, tabela de Opening).

Comparação: o tipo do Hestia é muito mais rico (`packages/model/src/openingTypes.ts`: estilo de folha, maçaneta, estilo de batente, grade, bandeira, laterais, ângulos 2D/3D, referência nominal, rebaixo/`reveal`, dobradiças, soleira).

## 3. Formas suportadas

Resposta curta: **só retângulo**.

- A geometria de recorte da parede (`crates/creabim-geom/src/wall.rs`, `Cut::of`) é um retângulo em coordenadas locais (u ao longo da parede, v para cima), cortado pelos limites da parede (comprimento e altura). O corpo da parede é montado dividindo a face numa grade em cada borda de vão e marcando cada célula como cheia ou vazia; os lados das células vazias viram as faces de ombreira, verga e peitoril. Isso só dá retângulos.
- Busca por `arch`, arco de vão, `fanlight`, `segmental`, `lintel`, trapézio, vão redondo: **nenhum resultado** em código ou docs de esquadria. O único "arco" que existe é (a) a parede curva (campo `bulge` da parede), onde o vão acompanha o arco da parede, e (b) o varrido do giro da porta em planta.
- `docs/ROADMAP.md` lista "Components from sketches: windows, doors and objects from drawn outlines" em "Next". Ou seja, formas livres (arco, círculo) ficam para quando houver componentes por croqui; hoje não existem.
- Em paredes curvas, o vão fica **de pé sobre o arco**: a janela é uma peça reta, perpendicular à parede no meio do vão, ao longo da tangente ali (teste "a window in a curved wall stands on its arc", `crates/creabim-geom/src/opening.rs`). Para cortar a parede curva, o recorte segue o arco (a caixa de recorte usa 8 segmentos).
- Parede de cortina com porta/janela: o painel ocupado é substituído (ver 4.5).

Para o Hestia isto significa que o CreaBIM **não traz precedente** para vãos em arco ou formas especiais; o precedente a consultar está em Revit/ArchiCAD (estudos A e D em `docs/aberturas/`).

## 4. Geometria gerada (como a esquadria vira peças)

Arquivo central: `crates/creabim-geom/src/opening.rs` (489 linhas). Princípio declarado no cabeçalho: toda peça é uma **caixa** no sistema de coordenadas do próprio vão, e 3D, desenhos e IFC compartilham essa descrição.

Coordenadas do vão: x ao longo da parede a partir da borda esquerda; y através da parede a partir do eixo, positivo para a esquerda da parede (onde a porta gira); z para cima a partir da borda inferior do vão.

Tipos de peça: `Frame` (batente e travessas de vidro), `Leaf` (folha de porta), `Glass`, `Handle`.

### 4.1 Peças por espécie (descrição em palavras)

- **Todo vão (porta ou janela):** dois montantes e uma verga, cada um com a largura de face do quadro e a profundidade do quadro centrada no eixo da parede.
- **Janela:** mais uma peça de soleira (travessa inferior do batente). Se a parede for mais grossa que o batente, acrescenta um **peitoril externo** que sai da face do batente e avança além da face da parede por 4 cm (constante própria), com 3 cm de altura. As divisões (`panes_across` x `panes_up`) viram travessas e montantes finos (60% da largura do batente, 70% da profundidade) entre vidros; cada célula de vidro é uma caixa de 2 cm de espessura centrada no eixo.
- **Porta:** uma única folha, com folga de 4 mm de cada lado e 1 cm acima do piso, espessura 60% da profundidade do batente limitada a 4,5 cm, **rente à face do batente do lado para onde abre**. Se a folha tem mais de 30 cm e o vão mais de 1,2 m de altura, duas maçanetas (uma por face), cada uma com roseta, haste e alavanca, a 1 m de altura (ou 45% da altura do vão), no lado oposto às dobradiças.
- **Furo (`Hole`):** nenhuma peça.
- Depois de montado "virado para +y, dobradiça em x=0", o conjunto é espelhado em x (mão) e em y (lado) conforme as duas bandeiras.

Observações para comparação: não há folha dupla, correr, pivotante, basculante, maxim-ar, venezianas, bandeira, laterais, alizar, guarnição, contramarco nem soleira de porta. Todas as peças são paralelepípedos (sem perfil extrudado nem arco). A espessura do vidro é fixa.

### 4.2 Forma do recorte e ombreira

A parede é recortada pelo retângulo do vão em toda a espessura. Em paredes em camadas (`assembly`), há um conceito extra: **revestimento de ombreira** ("reveal lining", `crates/creabim-geom/src/scene.rs`, função de revestimentos, constante de espessura de 4 mm). Em 3D, para cada camada da parede, as faces de ombreira (duas laterais, verga, e peitoril quando o vão não vai até o piso) recebem o acabamento do lado correspondente (reboco no interior, revestimento no exterior), para que a ombreira não mostre o isolante cortado. Camadas que não são acabamento "tomam o acabamento mais próximo". São tiras finas de 4 mm que não mexem no tamanho do vão. **Só aparecem no 3D**; desenhos e exportações as omitem (lacuna declarada, ver 8).

Ideia aproveitável: tratar a ombreira como "cada camada da parede, na faixa dela, ganha o acabamento do lado" e não como peça do esquadria. Isso resolve o corte "aberto" sem inventar alizar.

### 4.3 Planta

`crates/creabim-geom/src/plan.rs`, função de símbolo de abertura (por volta da linha 2070). Descrição:

- O plano corta a parede a uma altura (`cut_v`). Para cada caixa de batente que o plano atravessa, desenha um retângulo; em janelas, desenha também a peça de soleira (que está abaixo do corte) e prolonga as duas faces da parede por cima do vão (linhas); cada vidro que o plano atravessa vira **uma linha** no centro da espessura dele.
- **Porta:** a folha é desenhada **aberta a 90 graus** como retângulo e o arco do giro é um quarto de círculo com centro na dobradiça e raio igual à largura da folha. O arco é montado "do ângulo que vem primeiro" para sempre sair anti-horário. A dobradiça fica na face do batente do lado para onde abre; a mão inverte o ponto de dobradiça.
- **Furo** que começa acima do piso mostra as duas faces da parede atravessando (como janela); furo até o chão é só a abertura.
- Vãos **acima** do plano de corte aparecem **tracejados** sobre o preenchimento do corte (nota `plan.rs` perto da linha 949; matriz de pesos de linha tem caneta própria "Symbol" para símbolos).
- Em paredes curvas, a caixa de recorte e o símbolo seguem o arco e o símbolo usa uma função que mapeia (u, s) para o ponto real.

Diferenças em relação ao Hestia: o CreaBIM só tem **um** símbolo de porta (folha aberta + arco de 90 graus) e **um** de janela (retângulos de batente + linha de vidro); sem opção de mostrar fechada, tracejada ou ângulo configurável; sem simbologia de correr, maxim-ar etc. (o Hestia tem `swingStyle`, `leafPlan`, `angle2d`, `planDisplay`, etc.).

### 4.4 Corte, elevação e 3D

- Corte e elevação **não têm código próprio de esquadria**: usam a mesma malha de cena (`scene.rs`, `opening_items`), que gera uma malha por peça, com cor e superfície por espécie (batente de janela cor clara, de porta marrom, folha com cor própria, vidro transparente, maçaneta metálica) ou o material do vão se houver. Os desenhos recortam e projetam essas malhas (`section.rs`, `slice.rs`), então o vão em corte aparece como corte real das caixas (batente, vidro, folha) e em elevação como projeção das caixas.
- Em `section.rs` os elementos `Opening` são excluídos do conjunto "revelável" (pontilhado de elementos cobertos).
- Em 3D a esquadria "assenta no piso do nível" e **não segue um plano de trabalho personalizado** (lacuna em KNOWN_GAPS).
- Existe também a **caixa de recorte** (`cut_box_mesh`) usada como fantasma, para selecionar furos e mostrar o vão atravessando a parede.
- Lacunas relatadas pelo próprio projeto: em vistas 3D e cortes com linha oculta, o painel de porta ou janela oculto ainda esconde linhas atrás (KNOWN_GAPS, linha 87); em vistas 3D colocadas em folha, as ombreiras revestidas não aparecem (linha 122).

### 4.5 Parede de cortina com esquadria

`crates/creabim-core/src/curtain.rs` e `crates/creabim-geom/src/curtain.rs`. Parede de cortina é uma parede com grade (vãos horizontais e verticais, montantes, painéis de vidro ou cheios). Uma porta ou furo hospedado nela **ocupa os painéis e montantes que cobre** (a grade abre espaço), e uma parede de cortina colocada dentro de outra parede **gera sozinha o seu vão** na hospedeira (função de "vazios"), que segue a cortina quando movida e se fecha quando ela sai. Em parede curva, só vale se a cortina estiver sobre o mesmo arco da hospedeira. KNOWN_GAPS: nada impede um vão de cortina de se sobrepor a uma porta/janela da mesma parede; painéis podem ser trocados nos dados mas a UI só tem "redefinir".

## 5. Quadro de esquadrias (schedule)

`crates/creabim-geom/src/schedule.rs`, `crates/creabim-core/src/element.rs` (`ScheduleCategory::Doors/Windows`), `crates/creabim-app/src/schedulepane.rs`.

- Duas categorias de quadro, **Portas** e **Janelas**, geradas ao vivo do modelo (editar o modelo atualiza o quadro). Colunas: Marca, Nível, Parede, Largura, Altura, Peitoril; mais uma coluna **Giro** só para portas.
- Larguras, alturas e peitoril são **editáveis na tabela** (escrevem de volta no modelo). Total em rodapé ("2 doors").
- A coluna Giro mostra a mão em texto: dobradiça vista do lado para onde abre, mais "para dentro" ou "para fora" (quatro rótulos: Right/Left, in/out). Função própria de leitura de mão (`door_hand`).
- A marca vem de regras de numeração (`creabim_core::marks`, `marks.rs`): padrão D01.., W01.. com regras configuráveis, janela de numeração com lista de duplicados. A etiqueta (Tag, `Shift+T` para todas) em planta usa a marca. A busca do navegador acha por marca.
- Quantitativos (take-off) **excluem** portas e janelas (KNOWN_GAPS 5.2).
- O quadro também sai em DXF/PDF/XLSX como qualquer quadro (`xlsx.rs`, `schedule_drawing`), e entra em folha.
- Não há colunas por tipo, material, vidro, ferragens, área, U-value ou observações. Para o Hestia isto confirma que o quadro "básico" é facilmente coberto; o diferencial do Hestia (nominal da folha vs vão, ferragens) não existe lá.

Ideia aproveitável: o quadro como **visão viva editável** (célula da tabela escreve no modelo) e a coluna de mão em texto padronizado.

## 6. IFC: exportação e importação (round-trip)

Arquivos: `crates/creabim-ifc/src/export.rs` (a partir da linha 830 e `opening_body` perto de 1626), `crates/creabim-ifc/src/import.rs` (`import_filling` perto de 1760, `opening_in_wall` perto de 2185, `import_bare_openings`), `crates/creabim-ifc/tests/{export,import,freecad,ifcx,marks}.rs`.

### 6.1 Exportação (IFC4)

Para cada vão, segunda passada (depois das paredes):

1. Cria um `IfcOpeningElement` (caixa atravessando a parede, 5 cm para fora de cada face; posição ao longo do eixo da parede, descontando a linha de eixo da parede) e liga com `IfcRelVoidsElement` à parede.
2. Para furo vazio: o próprio `IfcOpeningElement` leva o id do elemento e termina.
3. Para porta ou janela: cria o preenchimento `IfcDoor` ou `IfcWindow` com uma representação `SweptSolid` formada por **uma extrusão retangular por peça** (batente, vidro, folha, maçaneta, todas como caixas, no mesmo sistema do vão) e liga com `IfcRelFillsElement`.
4. Portas: eixo y local do `IfcDoor` aponta para o lado em que gira (como o IFC pede); quando a porta abre para a direita da parede, o preenchimento é colocado virado. A mão vira `SINGLE_SWING_LEFT` ou `SINGLE_SWING_RIGHT` no atributo de operação, calculada do XOR entre `flip_hand` e o "virado". Altura e largura gerais (`OverallHeight/Width`) vêm do vão. Janelas saem sempre `SINGLE_PANEL`.
5. Tipos: `IfcDoorType`/`IfcWindowType` com `SINGLE_SWING_LEFT` e `SINGLE_PANEL` fixos; vão ligado ao tipo (`of_type`).
6. Material: o preenchimento entra no conjunto de materiais do vão (um só material por esquadria). Contido no pavimento (`IfcRelContainedInSpatialStructure`) da parede.
7. Marca: a marca digitada vira o `Tag` do IfcDoor (`tests/marks.rs`).
8. Contagem testada na casa de exemplo: 2 portas, 11 janelas, 13 `IfcOpeningElement` (`tests/export.rs`).

Em parede de cortina, a exportação usa `IfcCurtainWall` com montantes e painéis, e a cortina dentro de parede abre seu próprio vão preenchido por ela.

### 6.2 Importação

- Lê `IfcDoor`, `IfcWindow` (e variantes `StandardCase`). Segue `IfcRelFillsElement` para achar o `IfcOpeningElement` e `IfcRelVoidsElement` para achar a parede; **mede o buraco** (malha do `IfcOpeningElement`) projetando os vértices no eixo da parede para obter deslocamento, peitoril, largura e altura (função de medição). Se não houver relação, procura uma parede nativa que contenha o corpo da porta e usa `OverallWidth/Height` (centralizado na malha) com uma nota "placed in wall" no relatório de importação.
- Há "encaixe no vazio" (snap) ao furo real da parede e recorte para dentro da parede se ultrapassar o início ou a base, com nota.
- Quando não consegue medir, a parede não é nativa, ou o corpo não é um prisma reto, **a esquadria entra como malha livre** (`FreeMesh` com a classe IFC) e um motivo vai para o relatório.
- Furos nus (`IfcOpeningElement` sem preenchimento) viram `Hole` nativos.
- Tipos: `IfcDoorType`/`IfcWindowType` viram tipos com material.
- O quadro (`frame`) importado fica no **padrão** ("a door's or window's frame is only written on its type"), e `flip_hand`/`flip_facing` ficam falsos: **mão e giro são exportados e não são relidos** (KNOWN_GAPS, linha 275: o quadro marca como "checked").

### 6.3 Round-trip

Testes: `crates/creabim-ifc/tests/import.rs` compara casa de exemplo exportada e reimportada: mesma parede hospedeira, mesma espécie, e deslocamento/peitoril/largura/altura iguais até 1e-6. Mão, giro, divisões de vidro, largura do batente e override por instância **não** são conferidos porque não voltam. Fixtures de FreeCAD (`tests/freecad.rs`) conferem 11 janelas e 3 portas nativas contra malhas antes do passe de melhoria (7 de 13 paredes antes). IFC5/IFCX (`ifcx.rs`): vãos voltam do mesmo jeito (hospedeiro + tipo + geometria), mas a exportação IFC5 deixa de fora móveis, objetos e vãos de parede de cortina.

Lacunas declaradas (KNOWN_GAPS "IFC import and export"):
- Portas e janelas de paredes importadas como malha não viram vãos nativos.
- Mão e giro não são relidos.
- O override do quadro por instância se perde na exportação (só o tipo o grava).
- Uma esquadria tem um só material; as partes saem sem material próprio no IFC.
- Cada elemento sai como um corpo único (camadas só no conjunto de materiais).
- Cada peça da esquadria sai como caixa extrudada; **não há `IfcRelAggregates`** de partes nem perfis: o preenchimento é um único `IfcDoor` com várias representações.

Comparação com o Hestia: o Hestia hoje exporta cada vão como caixa única (`F-PROGRESSO.md`: "IFC fora: cada vão sai como caixa única"). O CreaBIM já faz melhor nesse ponto: **vazio + preenchimento + peças**, mão no atributo `OperationType`, relações de vazio e preenchimento. O CreaBIM não faz `IfcWindowLiningProperties`, `IfcDoorPanelProperties`, `IfcWindowPanelProperties`, `PartitioningType` nem `UserDefinedOperationType`, apenas `SINGLE_SWING_*` e `SINGLE_PANEL`.

## 7. Interface: colocação e edição

Arquivos: `crates/creabim-app/src/planview.rs` (função `place_opening`, perto da linha 7223), `ghost.rs`, `handles.rs`, `editui.rs`, `props.rs`, `memberstool.rs`, `hoverpick.rs`, `tempdims.rs`, `typesui.rs`, `help/doors-windows.md`.

- **Ferramentas:** Porta, Janela e "Wall opening" (furo). Clica em parede em planta, corte, elevação ou 3D.
- **Colocação:** o clique mira a parede sob o ponteiro (a que o hover mostrou vence; Tab percorre paredes sobrepostas; a parede é acertada em toda a espessura; a parede sob o ponteiro vence encaixes e guias antes do primeiro clique). Centraliza o vão no clique, o prende a [0, comprimento-largura], e depois a "vão livre" da parede, que para antes de uma parede que chega na esquina (função de limitar vão). Uma porta mais larga que a parede não é colocada.
- **Opções antes de clicar:** escolher um **Tipo**, ou digitar Largura/Altura/Peitoril (digitar tamanho larga o tipo, como a espessura da parede). Mesmas opções na aba "Next element" de Propriedades.
- **Fantasma:** antes do clique mostra o que será colocado exatamente (batente e recorte atravessando a parede), em planta e 3D; fora da parede mostra "Move onto a wall". Teste: "a window ghost is what the click places and changes nothing" (`ghost.rs`).
- **Edição:** Propriedades (Largura, Altura, Peitoril, material, largura/profundidade do quadro, divisões); arrastar ao longo da parede (alça de deslizar); alças de montante (largura), de verga e de peitoril (altura), em planta e 3D (`handles.rs`, tipos `OpeningJamb`, `OpeningHead`, `OpeningSill`, `OpeningSlide`); largura alterada em Propriedades **mantém o vão centrado ou o montante mais próximo da ponta da parede a 500 mm**, e a barra de status avisa se invade junta de parede; cotas temporárias clicáveis movem o vão (cota até a ponta da parede ou o vizinho; **não se trava a folga** com cadeado e **não se digita a distância da parede**, KNOWN_GAPS).
- **Mão e giro:** `Espaço` inverte o giro (dentro/fora), `Shift+Espaço` inverte a mão; "Flip" em Propriedades; Propriedades mostra "Hung right, in". Antes havia setas laranja de inversão, hoje não.
- **Cópia e movimento:** copiar uma parede copia seus vãos (transform.rs); mover/espelhar parede carrega vão; cópia para níveis e duplicação de nível respeitam vãos.
- **Visibilidade:** categorias separadas (Portas, Janelas, "Openings, shafts and void cutters") para gráfico por vista.
- **Verificações:** `check_doorways` / `objects_in_openings` (`roomtool.rs`, `checks.rs`): objeto de mobiliário dentro do vão ou do **varrido do giro** (zona de passagem e arco de 90 graus aproximado por 9 pontos) é sinalizado e deslizado para fora; "Check model" geral **não existe** (5.6: sem verificar vão que cruza junta).
- **Detecção de conflito de vão:** função de "vão cruza junta" amostra 24 pontos na largura do vão e acusa parede que atravessa ou termina na face do hospedeiro; usada em aviso, não bloqueia.

Ideia aproveitável (UX): a fila "fantasma antes do clique + Tab entre hospedeiros + tipo OU tamanho digitado (nunca ambos)" e a regra "alargar mantém centrado ou ancora no montante mais perto da ponta" são pequenas e baratas. A regra de mão/giro com Espaço e Shift+Espaço também.

## 8. Lacunas declaradas pelo próprio projeto e outras observadas

Das tabelas de `docs/KNOWN_GAPS.md` (seção "Openings" e relacionadas):

1. Esquadria com **um só material**: sem material distinto para batente e vidro; no IFC as peças não têm material próprio.
2. Painéis de cortina só trocam nos dados, sem UI.
3. Nada impede vão de cortina de sobrepor porta/janela na mesma parede.
4. "There is no exterior sill nosing" (sem pingadeira/saliência de peitoril externa). **Observação deste estudo:** o código atual já cria uma peça de peitoril externo de 3 cm de altura que avança 4 cm além da face (`opening.rs`, constante do peitoril); a lacuna parece desatualizada ou se refere a um nosing configurável com perfil. Registrar como divergência doc x código.
5. Overrides do tipo listados numa linha só, sem marca por campo.
6. Digitar a distância do vão até a ponta da parede e travá-la (cadeado) não existe.
7. Mão e giro exportados e não relidos; override de quadro por instância perdido na exportação; esquadrias de parede importada como malha não viram nativas.
8. Quantitativos ignoram portas e janelas.
9. Vãos em vistas com linha oculta: painel oculto ainda esconde linhas.
10. Ombreiras revestidas não aparecem em vistas 3D colocadas em folha.
11. Esquadrias em 3D só no nível, sem plano de trabalho.
12. Largura de parede alterada, parede invertida ou empurrada não estica as vizinhas: esquina pode abrir (afeta vãos próximos).
13. Etiqueta pode se afastar da porta em cômodo apertado (o leader volta).
14. Sem "Check model": vão cruzando junta, vigas em lajes etc.

Lacunas adicionais constatadas na leitura (não listadas como tal): sem vão em arco/forma livre; sem bandeira, laterais, folha dupla, correr, pivotante, basculante, maxim-ar; sem alizar/guarnição/contramarco; sem ferragens e dobradiças parametrizadas; sem soleira; sem ângulo de abertura configurável (sempre 90 graus em planta, a porta não abre no 3D); sem NBR (referência nominal vão x folha); sem catálogo amplo (6 tipos); sem marcação de classe acústica, fogo, U-value.

## 9. Testes

Tudo em Rust, `#[test]` embutidos e em `crates/*/tests`. Esquadria especificamente:

- `crates/creabim-geom/src/opening.rs` (7 testes): janela em parede curva fica sobre o arco e perpendicular; janela tem batente em volta e vidro recuado, tudo dentro do vão; divisões criam o número certo de vidros e travessas e a área de vidro bate com a soma; porta tem folha e maçanetas sem soleira e todas as peças são sólidos fechados (volume > 0); batente cabe em parede fina (50 mm); inverter mão e lado move folha, maçaneta e leitura de mão.
- `crates/creabim-geom/src/schedule.rs`: quadro de portas lista marcas em ordem e segue edições; quadro de janelas usa o nome do tipo; desenho do quadro.
- `crates/creabim-core/src/element.rs`: serialização antiga do vão sem quadro.
- `crates/creabim-core/src/types.rs`: tipos iniciais (larguras de janela em tipo e elemento).
- `crates/creabim-core/src/checks.rs`, `walls.rs` (limitar vão, cruzamento de junta), `transform.rs` (copiar e espelhar vão), `marks.rs` (numeração D/W padrão).
- `crates/creabim-app/src/handles.rs`: alças de montante e verga (largura/altura), deslizar ao longo da parede; `editui.rs`: tamanhos digitados antes de colocar chegam à janela; `ghost.rs`: fantasma não altera o modelo; `planview.rs`: clique no vão pega a porta e não a sapata abaixo; `tempdims.rs`: porta desliza até a folga digitada; `align3d.rs`: janela por linha central desliza.
- IFC: ida e volta numérica de vão (1e-6), contagens de `IfcDoor`/`IfcWindow`/`IfcOpeningElement`, marca como Tag, importação FreeCAD, IFCX.
- Plano: `crates/creabim-geom/tests/plan.rs` e `visibility.rs` (visibilidade por categoria).

Observação de método útil para o Hestia: os testes do CreaBIM são de **invariantes de geometria** (volume positivo, tudo dentro do vão, área de vidro = soma) e de **ida e volta numérica**. Também há o teste de "nenhum vão com largura <= 0 após importar".

## 10. Comparação com o Hestia (pertinente)

| Tema | CreaBIM | Hestia (`docs/aberturas/F-PROGRESSO.md`, `packages/model/src/opening*.ts`) |
|---|---|---|
| Modelo | vão retangular + quadro de 4 números | composição por células, membros (montante, travessa, baguete), tipos com 130 itens |
| Forma | só retângulo | retângulo; bay/bow/canto fora (F8); arco não existe em nenhum |
| Parâmetros | largura, altura, peitoril, 2 divisões, 2 medidas de batente, material | muitos (folha, ferragens, alizar, rebaixo, referência nominal, etc.) |
| Mão/lado | 2 bandeiras booleanas, derivadas da parede | `flipHand`, `flipFacing`, mão global com `mirror` por célula |
| Planta | folha aberta 90 graus + arco; janela com batente e linha de vidro | símbolos por família, estilos de giro, ângulos configuráveis |
| Corte/elevação | cortes e projeções das mesmas caixas; sem símbolo de elevação | símbolos por família (arco do maxim-ar, giro, seta de correr) |
| 3D | caixas; ombreira revestida por camada | peças com perfil, vidro, ferragem, alizar |
| Quadro | portas e janelas, 6 a 7 colunas, editável | quadro e DXF (F5c) |
| IFC | vazio + preenchimento + caixas; round-trip numérico | cada vão como caixa única (limitação conhecida) |
| UI | fantasma, Tab, alças, cotas temporárias clicáveis | editor de composição, diálogo Editar tipo, alças de inversão |
| Testes | invariantes + round-trip IFC | 6098 testes, e2e, goldens |

Onde o CreaBIM ensina algo ao Hestia (como ideia, sem copiar código):

1. **IFC com vazio + preenchimento + peças + mão no OperationType** (seção 6.1) é um alvo concreto para a pendência "IFC com peças" do Hestia. Um modelo de relações suficiente: `IfcOpeningElement` por vão, `IfcRelVoidsElement` à parede, `IfcDoor`/`IfcWindow` com `IfcRelFillsElement`, tipo `IfcDoorType`/`IfcWindowType`. O que o CreaBIM não faz e o Hestia poderia: propriedades de painel e de moldura (`IfcDoorPanelProperties`, `IfcWindowLiningProperties`), `PartitioningType` por composição de células.
2. **Importação tolerante** (medir o buraco na malha, cair para malha livre com motivo registrado, nota por esquadria sem relação). Boa referência para um futuro importador IFC no Hestia.
3. **Relatório de importação por categoria de nota** ("placed in wall", "clipped to it", "imported as a mesh").
4. **Mão e lado derivados da parede** (inverter a parede vira as esquadrias). Verificar se o Hestia já se comporta assim.
5. **Ombreira por camada da parede**, só no 3D (seção 4.2).
6. **Verificações**: vão que atravessa junta; objetos no varrido do giro (seção 7).
7. **Lacuna que o Hestia já cobre e o CreaBIM não**: tudo o que está listado no fim da seção 8.

Riscos e cuidados: o CreaBIM tem a mão **só em texto no quadro**, sem norma (NBR 15930, referência de nominal da folha), e usa "para dentro/fora" como padrão derivado de "interior = esquerda da parede", que não vale para parede sem lado interior definido (paredes internas). O Hestia deve decidir como tratar parede interna.

## 11. Mapa rápido de arquivos para consulta

- Modelo: `crates/creabim-core/src/element.rs` (Opening, OpeningKind, OpeningFrame), `types.rs`, `walls.rs` (flip, limitar vão, junta), `curtain.rs`, `checks.rs`, `marks.rs`, `transform.rs`, `visibility.rs`.
- Geometria: `crates/creabim-geom/src/opening.rs`, `wall.rs` (recorte), `scene.rs` (itens e ombreiras), `plan.rs` (símbolo), `section.rs`, `schedule.rs`, `curtain.rs`, `annotate.rs` (cotas, etiquetas).
- IFC: `crates/creabim-ifc/src/export.rs`, `import.rs`, `ifcx.rs`; testes em `crates/creabim-ifc/tests/`.
- JSON aberto: `docs/json-format.md`, `docs/creabim-model.schema.json`, `examples/small-house.json`, `crates/creabim-spec/src/{build,export,format}.rs`.
- UI: `crates/creabim-app/src/{planview,ghost,handles,editui,props,tempdims,schedulepane,typesui}.rs`, `help/doors-windows.md`, `help/curtain-walls.md`.
- Lacunas e plano: `docs/KNOWN_GAPS.md` (seções "Openings", "IFC import and export", "JSON model format"), `docs/ROADMAP.md`.
