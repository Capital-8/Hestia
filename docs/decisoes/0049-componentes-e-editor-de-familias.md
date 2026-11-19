# 0049 · Componentes e editor de famílias (RASCUNHO para aprovação do dono)

Data: 2026-11-02. Estado: **rascunho, nada implementado**. Escopo desta sessão: pesquisa e desenho; nenhum código do app foi alterado.
Numeração: 0046 a 0048 já existem nas branches do Rust (`claude/great-ptolemy-cngq9y`), e a main tem dois 0046; por isso este é o **0049**. Renumere na hora de mesclar se houver colisão.

**Como ler as marcações** (mesma convenção de `docs/aberturas/D-editor-esquadrias-revit-archicad.md`):
*[LIDO]* = página aberta e lida nesta rodada. *[RESULTADO DE BUSCA]* = só o trecho que a busca devolveu, página não aberta. *[INFERÊNCIA]* = conclusão minha, **não verificada**.
Referências ao código do Hestia saem como `arquivo:linha` e foram conferidas contra a main (`fc8ccf81`) no fim da sessão. As decisões 0046 a 0048 só existem na branch do Rust, então são citadas pelo número, sem linha.

Regras de licença seguidas: só **conceito e método** de Promob e Revit. Nenhum código, arquivo, biblioteca, ativo ou formato proprietário foi copiado nem será (nada de ler `.rfa` nem biblioteca do Promob). Nenhuma dependência nova é proposta (o avaliador de expressões é escrito à mão); se um dia entrar uma, será permissiva e registrada no `NOTICE`.

---

## 1 · Resumo da pesquisa

### 1.1 Promob (móveis e marcenaria)

O Promob é uma família de produtos: Plus/Studio (projeto e venda na loja) e **Builder** (fábrica: documentação técnica, plano de corte, CNC, ERP) [LIDO: [Builder](https://suporte.promob.com/hc/articles/31123224404625)]. O que importa para o Hestia é o *método*:

**Fluxo do usuário** (montado de várias páginas; a ordem é minha [INFERÊNCIA]):
1. A fábrica cadastra **materiais de produção** e **chapas** (material MDF/MDP/aglomerado, espessura, largura × altura, refilo nos quatro cantos, sentido de veio) [LIDO: [Cut Pro, cadastro de chapas](https://suporte.promob.com/hc/pt-br/articles/31120995063313-KB-Cut-Pro-Cadastro-de-chapas)].
2. Monta a **biblioteca de módulos**. Cada módulo é uma estrutura de **agregados** (peças e sub-módulos) posicionados e dimensionados por **fórmulas** sobre variáveis. Material, dimensões máximas e espessura de cada componente (lateral, base, fundo...) ficam na aba Painel da biblioteca / Configurador de Dimensões [RESULTADO DE BUSCA: [cadastro de preços e Configurador de Dimensões](https://suporte.promob.com/hc/es/articles/31214122809617)].
3. O projetista insere o módulo no ambiente e **redimensiona**; as fórmulas reposicionam as peças.
4. O Builder gera, a partir das peças, **relatórios** (por módulo e por componente, bordas, portas, perfis, itens montados), **operações de usinagem** (furos, rasgos, cavilhas, inserção de ferragem, aplicação de borda), **plano de corte** (via otimizadores externos: Cut Pro, Cut List, Gplan; refilo e "sobrecorte" configuráveis; etiqueta com dimensões e legenda de fita de borda) e arquivos de CNC (DXF e formatos de máquinas) [LIDO: Builder; [plano de corte](https://suporte.promob.com/hc/articles/31119991541905)].
5. Render: o fotorrealista do Promob é o **Real Scene** (com versão de IA por créditos) [RESULTADO DE BUSCA: [Real Scene](https://suporte.promob.com/hc/en-us/articles/31120036531473-Real-Scene-Opening-Real-Scene)]. Fora do escopo do Hestia agora.

**Modelo de dados implícito** (o que as fontes sustentam):
- **Variáveis** de cota: `$PW$ $PH$ $PD$` (largura/altura/profundidade do módulo-pai), `$W$ $H$ $D$` (do agregado), `$N$ $NI$` (total e índice de repetição), `$X$ $Y$ $Z$` (posição), `$I$` (invertido), `$P.P.W$` (sobe um nível por "P."), mais `Round() Ceil() Floor()` [LIDO: [Variables](https://suporte.promob.com/hc/en-us/articles/31123722986129)].
- **Fórmulas** com `+ - * /`, comparação, `&& || !` e condicional `@(a > b ? c : d)`. Servem para **posição, dimensão, repetição, referências, opções de remoção e condição de visibilidade**. Exemplos: centrar `$PW$/2-$W$/2`; encostar à direita `$PW$ - $W$`; repetir com passo fixo `VAR1 + ($W$+VAR2)*($NI$-1)`. As fórmulas de centro e alinhamento supõem o ponto zero do agregado no canto **inferior esquerdo de trás** [LIDO: Variables].
- **Por que variáveis**: sem elas "a biblioteca inteira ficaria desconfigurada" a cada mudança de medida [LIDO: Variables].
- **Regras de montagem são parâmetros de biblioteca**, não geometria livre: tipo de fundo (pregado, encaixado), quanto o fundo avança sobre base e laterais, tampo comum ou "engrossado" (espessura do tampo e da moldura distintas), travessas posicionadas pelo configurador [RESULTADO DE BUSCA: [fundo pregado/encaixado/tampo engrossado](https://suporte.promob.com/hc/pt-br/articles/360057292394-KB-Dica-Promob-Como-configurar-tampo-engrossurado); artigos de fundo não abriram (404), então os nomes exatos dos campos não foram lidos].
- **Espessuras**: caixas sem porta usam laterais, bases e travessas de 15, 18 ou 25 mm; com duas espessuras (15+25 ou 18+25) o projetista escolhe qual vale onde [RESULTADO DE BUSCA: [Guia Maker](https://promobsitestorage.blob.core.windows.net/download/Guia_Maker_BR/Guia%20do%20Produto%20MAKER%20BR%20-%20V.13%20R.20.pdf); PDF grande demais para abrir].
- **Peça fora da biblioteca**: o plugin *Builder Parts* cria peça a partir de **geometria ou composição** e a edita num editor de geometria (vértices, curvas, perfil); acrescenta usinagens (furo, rasgo, retangular, circular, ao longo de linha/arco, arranjo, espelho) e verificação de borda; peça nova **não** é associada sozinha à máquina CNC; módulo com peça trocada perde o redimensionamento [LIDO: [Builder Parts](https://suporte.promob.com/hc/en-us/articles/31122941360145-Builder-Parts); RESULTADO DE BUSCA: [Builder Parts, editor de geometria](https://suporte.promob.com/hc/articles/31123671122961)].
- **O que é paramétrico**: dimensões e posições dos agregados, quantidades (repetição), presença (visibilidade condicional), material e espessura por componente. **O que não é**: o desenho de uma peça nova (é geometria editada) e a associação a máquinas.

**Não verificado**: sintaxe completa de fórmulas do Builder; regras automáticas de furação (a página só lista as operações, não diz quando o programa as gera sozinho); tamanhos de chapa; modelo interno de fita de borda (aparece só na legenda da etiqueta); comportamento da lista de peças fora do plano de corte.

### 1.2 Revit (editor de famílias)

Todas [LIDO] nas páginas da Autodesk: [Workflow: Creating Loadable Families](https://help.autodesk.com/cloudhelp/2024/ENU/Revit-Customize/files/GUID-09A2439A-FDCB-4233-B08E-6F160D4296DE.htm), [Family Category and Parameters](https://help.autodesk.com/cloudhelp/2024/ENU/Revit-Customize/files/GUID-68EFCA67-4913-4E00-AB9E-F2E6A7BEF8C6.htm) e [Set Family Geometry Visibility](https://help.autodesk.com/cloudhelp/2024/ENU/Revit-Customize/files/GUID-749AEB1E-1B01-46BC-9790-3473BC769211.htm) (esta última pelo resultado de busca).

- **Fluxo**: planejar (geometria, nível de detalhe, parâmetros, comportamentos) → escolher *template* (RFT) pela categoria → **planos de referência** como esqueleto, origem na interseção dos principais, prioridade de cada plano (afeta cotagem e *snap* na colocação) → formas (extrusão, mistura, revolução, varredura, mistura varrida; **vazios** cortam sólidos) → **restrições** (cotas rotuladas com parâmetro, alinhamentos travados) → **flexionar** (testar os parâmetros para achar erro de restrição) → **tipos** (valores pré-definidos de parâmetros) → salvar `.rfa` e carregar no projeto.
- **Parâmetros**: de **tipo** (valem para todas as instâncias do tipo) e de **instância** (cada ocorrência); *fórmulas* relacionam parâmetros [RESULTADO DE BUSCA: [Advanced Family Techniques](https://help.autodesk.com/cloudhelp/2024/ENU/RevitLT-Customize/files/GUID-3EA4D026-0974-43C6-859F-3A4B785B7977.htm)]; parâmetro pode controlar a visibilidade de uma forma ("Visible").
- **Categoria e comportamento** (Family Category and Parameters): hospedagem (parede, face, plano de trabalho, nível), *Always Vertical*, *Cut with Voids When Loaded* (vazios da família cortam paredes, pisos etc.), *Enable Cutting in Views* (aparece cortada ou projetada), *Shared* (família aninhada que pode ser selecionada, etiquetada e listada em separado), classificação OmniClass.
- **Visibilidade 2D/3D**: por forma, em quais vistas (planta/forro, frente/trás, esquerda/direita) e em quais níveis de detalhe (grosso, médio, fino; dependem da escala da vista); geometria oculta continua existindo no projeto. Há também linhas simbólicas 2D (a pesquisa não trouxe a página; **não verificado**).
- **Tipos**: *type catalog* lista os tipos de uma família para carregar só os necessários [RESULTADO DE BUSCA: Advanced Family Techniques].
- **Família carregável** é o arquivo externo; as famílias de sistema (parede, piso) e *in-place* ficam de fora.

### 1.3 Comparação

| Aspecto | Promob | Revit | Para o Hestia |
|---|---|---|---|
| Unidade de trabalho | módulo = árvore de agregados com fórmulas | família = geometria + parâmetros + restrições | **família com parâmetros, peças e fórmulas** |
| Geometria | **chapas** (prismas ortogonais) + usinagens; peça livre só no Builder Parts | sólidos livres (extrusão, revolução...) e vazios | v1: **peças prismáticas** (contorno 2D × espessura) e vazios; sem revolução/varredura |
| Como parametriza | variáveis + fórmulas, **sem solver** | planos de referência + restrições + solver | **fórmulas em ordem de dependência, sem solver** (decisão D2) |
| Saída de fabricação | lista de peças, bordas, usinagem, plano de corte, CNC | tabelas e quantitativos; fabricação fora do escopo | lista de peças e CSV; plano de corte depois |
| Colocação | arrastar módulo, encosta nas paredes, redimensiona | hospedagem por categoria (nível, parede, face, plano) | hospedagem nível e parede; face depois |
| Níveis de detalhe / 2D | desenho técnico gerado a partir das peças | símbolo 2D e visibilidade por nível de detalhe | **contorno automático das peças** + visibilidade por nível de detalhe |
| Tipos | variações de medida na biblioteca | tipos de família com valores | tipos com valores |
| Catálogo | biblioteca da fabricante (proprietária) | bibliotecas + type catalog | **catálogo base próprio** + importar/exportar JSON |

**Recomendação (combinação):**
- **Do Revit, copiar**: o vocabulário família → tipo → instância (o Hestia já usa em aberturas), parâmetros de tipo e de instância, categoria que define comportamento (hospedagem, corte em vista), vazios, visibilidade por nível de detalhe 2D/3D e o ciclo "editar em ambiente próprio e carregar no projeto".
- **Do Promob, copiar**: o método de **fórmulas sobre variáveis do pai** (largura/altura/profundidade, repetição, condição de presença), a ideia de **regras de montagem como parâmetros** (tipo de fundo, tipo de montagem), **chapa como unidade** (material + espessura vinda de um cadastro de chapas), fita de borda e veio como atributos da peça, e a **lista de peças** como saída principal.
- **Adaptar**: o Promob mistura biblioteca com regras de fábrica; no Hestia a regra vira **parâmetro e fórmula da própria família**, editável pelo usuário. O Revit tem solver de restrições; o Hestia usa grafo de dependência de fórmulas (mais simples, determinístico, testável).
- **Evitar**: solver de restrições, scripts arbitrários do usuário, importar formatos proprietários, edição livre de sólidos curvos no v1, cadastro de máquinas CNC.

---

## 2 · O que o Hestia já tem e como reaproveitar

| Existente | Onde | Reuso |
|---|---|---|
| Única "família" atual: tipos de abertura com catálogo e composição | `packages/model/src/opening.ts:153` (`OPENING_FAMILIES`), `packages/model/src/openingTypes.ts:16` (`OpeningType`) | modelo mental família → tipo → instância; **mas** a família é um *schema fechado em código* ("nada de parâmetros autorais", `packages/model/src/opening.ts:206-210`), logo **não serve de base direta**: o componente precisa de família **autoral** |
| Composição de esquadria: células e perfis com `version` e presets editáveis | `packages/model/src/openingComposition.ts:12`, `:64`, `:92`, `:124` | padrão de dado versionado, presets semeados no projeto e tamanhos `fixed`/`fill` (equivalente local a "luz fixa" e "resto") |
| Presets opcionais no projeto | `packages/model/src/types.ts:782` (`openingProfiles?`) | molde para `componentFamilies?`, `chapas?`, `fitas?`: opcionais, sem migração obrigatória |
| Nível de detalhe 2D/3D por tipo | `packages/model/src/opening.ts:45-46`, `packages/model/src/openingTypes.ts:83-85` | mesmos nomes para a visibilidade por nível de detalhe do componente |
| Biblioteca por arquivo JSON, com materiais embutidos | `packages/model/src/openingTypeLibrary.ts:12`, `:105`, `:199` | molde de `hestia-componentes` (exportar/importar famílias) |
| Diálogo de tipo: biblioteca à esquerda, lista de componentes ao centro, prévia à direita | `apps/web/src/ui/dialogs/openingType/OpeningTypeDialog.tsx:68-70` | referência de UX; **não reaproveitar o diálogo**: o editor de família é um *modo*, não um modal |
| Prévia = mini-projeto com `ProjectStore` e a abertura no centro | `apps/web/src/ui/dialogs/openingType/previewProject.ts:40` | **molde do ambiente de edição** (decisão D6) |
| Objeto sem equivalente nativo (mobiliário importado do IFC): malha em coordenadas de mundo | `packages/model/src/types.ts:638` (`Generic`) | já passa por 3D (`packages/render/src/model3d/genericSolids.ts:9`), planta (`packages/render/src/plan/build.ts:493`), quantitativos (`packages/engine/src/genericQuantities.ts:39`), IFC (`packages/io/src/ifc/ifcGeneric.ts:107`), colar (`packages/tools/src/clipboard.ts:46`), seleção (`packages/tools/src/selectTool.ts:52`) e picking (`packages/tools/src/pick.ts:145`). **Serve de mapa** dos pontos de integração, mas não de modelo: a malha em mundo não tem tipo, parâmetro nem instância, e mover reescreve a malha |
| Modelo 3D de esquadria como função pura | `packages/engine/src/openingModel.ts:25` (`buildOpeningModel`) | precedente de "geometria de peças = função pura no engine" |
| Desfazer/refazer por *patches* do immer sobre comandos | `packages/model/src/history.ts:1`, `:19`, `:151` | todo comando novo ganha desfazer sem trabalho extra |
| Comandos de tipo e de elemento | `packages/model/src/commands.ts:290` (`addGeneric`), `:444` (`upsertOpeningType`) | molde de `placeComponent`, `upsertComponentFamily` |
| Migração por versão | `packages/model/src/types.ts:22` (`SCHEMA_VERSION = 23`), `packages/model/src/migrate.ts:272-283` | decisão D7 |
| Ferramenta de colocação e painel de colocação | `packages/tools/src/registry.ts:42` (`ToolId`), `:52` (`createTool`), `:104` (porta), `apps/web/src/ui/PlacementProperties.tsx:15`, `:22`, `:55` | molde da ferramenta Componente |
| Painel de propriedades de objeto genérico | `apps/web/src/ui/GenericProps.tsx:94` | molde do painel da instância |
| Faixa de opções | `apps/web/src/ui/ribbon/tabsMain.ts:17` (botão esmaecido), `apps/web/src/ui/ribbon/model.ts:56-59` (`tool`, `act`, `soon`), `docs/decisoes/0032-interface-padrao-revit.md:7-8` | "ferramenta nova = uma linha" |
| Categorias gráficas (visibilidade por vista) | `packages/model/src/graphics.ts:9` | acrescentar `component` |

Lacunas que o desenho precisa fechar: `Element` é uma união fechada (`packages/model/src/types.ts:659`) e `hasLevel` é uma lista explícita (`packages/model/src/elementLevel.ts:19`); um tipo novo de elemento obriga a visitar todos os pontos da tabela acima (lista completa na fase F3).

---

## 3 · Modelo de dados proposto

Princípios: (1) **dados puros e serializáveis**, sem funções; (2) **uma única mecânica** (parâmetros + peças + fórmulas) serve a mobiliário "forma livre" e a marcenaria de chapa; (3) o que o Rust verá no futuro são **peças já resolvidas, só números** (seção 5); (4) metros e radianos em todo o modelo, como no resto do projeto.

### 3.1 Família, tipo, instância

```ts
// packages/model/src/component.ts (novo; só tipos e constantes)
export const FAMILIA_VERSAO = 1;                       // como COMPOSITION_VERSION

export interface ComponentFamily {
  id: Id; version: number; name: string;
  category: ComponentCategory;                         // mobiliário | louças e metais | equipamento | marcenaria | genérico
  hosting: 'level' | 'wall';                           // v1; 'face' e 'ceiling' depois
  origin: 'corner' | 'center';                         // ponto de inserção; eixos locais: X largura, Y profundidade, Z altura
  params: ParamDef[];                                  // inclui L, A, P (largura, altura, profundidade) sempre
  refPlanes: RefPlane[];                               // posições nomeadas por fórmula (não há solver)
  parts: Part[];                                       // ver 3.3
  hardware: HardwareLine[];                            // ferragens só na lista de peças (v1: sem geometria)
  symbol2d?: Symbol2d;                                 // linhas simbólicas opcionais; padrão = contorno automático
  detail: { d2: DetailFlags; d3: DetailFlags };        // quais peças aparecem em grosso/médio/fino
}
export interface ComponentType {                       // Revit: family type; molde: OpeningType
  id: Id; familyId: Id; name: string; code?: string; description?: string;
  values: Record<string /*paramId*/, number | boolean | string>;   // só parâmetros de escopo 'type'
}
export interface Component {                           // novo membro de `Element`
  id: Id; kind: 'component'; typeId: Id; levelId: Id; order: number;
  x: number; y: number; z: number;                     // z = deslocamento sobre o nível
  rotation: number; mirrored: boolean;
  hostId?: Id; hostOffset?: number; hostSide?: 'a' | 'b';          // só hospedagem 'wall'
  overrides?: Record<string, number | boolean | string>;           // só parâmetros de escopo 'instance'
  mark: string;
}
```

Armazenamento no projeto (todos **opcionais**, no molde de `openingProfiles?` em `packages/model/src/types.ts:782`): `componentFamilies?: Record<Id, ComponentFamily>`, `componentTypes?: Record<Id, ComponentType>`, `chapas?`, `fitas?`.
A família vive **dentro do projeto** (cópia), como os presets de perfil; a biblioteca externa é um arquivo JSON (D3).

### 3.2 Parâmetros e fórmulas

```ts
export interface ParamDef {
  id: string; name: string; scope: 'type' | 'instance'; group?: string;
  kind: 'length' | 'number' | 'integer' | 'boolean' | 'material' | 'sheet' | 'enum' | 'text';
  default: number | boolean | string; min?: number; max?: number; step?: number;
  options?: { value: string; label: string }[];       // enum
  formula?: string;                                    // se presente, o valor é calculado e o campo fica só leitura
}
```
- **Linguagem de expressão mínima** (escrita à mão, sem `eval`, sem dependência): números, parâmetros por nome, `+ - * /`, parênteses, comparações, `&& || !`, ternário `c ? a : b`, funções `min max abs clamp round floor ceil` e membro `p.esp` para parâmetros `sheet` (espessura da chapa escolhida). Inspirada nas fórmulas do Promob (`$PW$/2-$W$/2` vira `L/2 - larg/2`) e nas fórmulas de família do Revit.
- **Variáveis sempre presentes**: `L`, `A`, `P` (largura, altura, profundidade do componente), `i` e `n` dentro de peça repetida (Promob `$NI$`, `$N$`).
- **Sem solver**: parâmetros e planos de referência são avaliados na **ordem topológica** das dependências; ciclo é erro de validação, não loop. Resultado numérico arredondado a 1 µm **uma vez** na saída (D9).
- **Limites** (defesa e determinismo): 256 parâmetros, 512 peças após repetição, expressão ≤ 512 caracteres, profundidade de parênteses ≤ 32, repetição `n` ≤ 64. Nunca lança por entrada do usuário: devolve lista de erros com o id do campo.
- Parâmetro de instância sobrescreve o do tipo só se declarado `scope: 'instance'` (como o Revit); L, A, P podem ser de instância (redimensionar na colocação, comportamento do Promob).

### 3.3 Peças, materiais, chapas

```ts
export interface Part {
  id: string; name: string;
  role: 'lateral'|'base'|'topo'|'fundo'|'prateleira'|'travessa'|'porta'|'frente'|'tampo'|'rodape'|'generica';
  void?: boolean;                                      // vazio (Revit): corta os sólidos da família e, depois, a parede
  thicknessAxis: 'x' | 'y' | 'z';                      // peças ortogonais no v1
  origin: [Expr, Expr, Expr];                          // canto mínimo da peça, no sistema local
  size: [Expr, Expr];                                  // as duas dimensões no plano da chapa
  thickness: Expr;                                     // ou `sheetParam.esp`
  outline?: [Expr, Expr][];                            // contorno poligonal no plano da chapa (v2; padrão: retângulo)
  sheet?: ParamRef | Id;                               // chapa (marcenaria) ...
  material?: ParamRef | Id;                            // ... ou material livre (mobiliário)
  edges?: { n?: Id; s?: Id; l?: Id; o?: Id };          // fita por borda (norte, sul, leste, oeste) — só marcenaria
  grain?: 'a' | 'b' | 'free';                          // sentido de veio
  machining?: Machining[];                             // furo, rasgo (posição e profundidade por fórmula)
  repeat?: { n: Expr };                                // `i` e `n` disponíveis nas outras fórmulas da peça
  when?: Expr;                                         // condição de presença (Promob: visibilidade condicional)
  detail?: { d2?: Detail; d3?: Detail };               // grosso | médio | fino | nunca
}
export interface Sheet { id: Id; name: string; materialId: Id; thickness: number; width: number; height: number; grain: boolean; trim: number; cost?: number }
export interface EdgeBand { id: Id; name: string; materialId: Id; thickness: number; cost?: number }
```
- **Mobiliário "forma livre"** (mesa, cadeira, cama, vaso): peças com `material`, sem `sheet`.
- **Marcenaria**: peças com `sheet`, `edges`, `grain`, `machining`. A **espessura vem da chapa** (`sheet.esp`), como no Promob; trocar a chapa do parâmetro `corpo` de 15 para 18 mm recalcula as fórmulas que dependem dela (`L - 2*corpo.esp`).
- O `Material` do Hestia (`packages/model/src/types.ts:34`: cor, hachura, brilho, opacidade, custo, unidade) continua sendo a aparência; a **chapa** aponta para ele. Valores de exemplo de chapa (15/18/25 mm de espessura vêm do guia do Promob Maker; **tamanho bruto da chapa não foi verificado**, o catálogo base traz valores editáveis).
- **Regras de montagem como parâmetros**: a família "Armário baixo" traz `montagem: enum {laterais_sobre_base, base_entre_laterais}`, `fundo: enum {sem, pregado, encaixado}`, `tampo: enum {comum, engrossado}`; as fórmulas das peças usam ternários sobre eles. Os nomes de parâmetros e de papéis são **proposta nossa**, não os do Promob.
- **Nada de gerador em código**: "caixaria" não é um algoritmo especial no engine, é uma **família com fórmulas**. O editor oferece *assistentes* ("Novo módulo de marcenaria") que apenas preenchem uma família inicial.

### 3.4 Hospedagem
- v1: `level` (apoiado no nível, com deslocamento `z`) e `wall` (posição `hostOffset` ao longo do eixo da parede e `hostSide`, rotação pela normal da parede, como `Opening.hostId`/`offset` em `packages/model/src/openingTypes.ts:153`). Sem corte na parede no v1.
- v2: vazio da família corta a parede (equivale a *Cut with Voids When Loaded*); depende do caminho de recortes de esquadria já existente, a decidir na época.
- v3: `face` (sobre piso/laje/forro resolvidos) e `ceiling`. **Depende da fatia B do Rust** (pisos e lajes resolvidos); por isso fica depois (seção 5.4).

### 3.5 Níveis de detalhe e 2D/3D
- **3D**: cada peça declara em quais níveis (`schematic | simple | full`, mesmos nomes de `packages/model/src/opening.ts:46`) aparece; `when` e `void` somam.
- **Planta**: padrão = **contorno automático** (união das projeções das peças que o plano de corte atravessa ou que estão abaixo, hachura leve), calculado com `union` de `@hestia/geom` (`packages/geom/src/index.ts:19`). Opcional: `symbol2d` com linhas e arcos desenhados, por nível `low | mid | high` (`packages/model/src/opening.ts:45`).
- **Corte/elevação**: as peças são prismas ortogonais; o corte é recorte de retângulos pelo plano (entra no `computeSection`, ver 5.4).

### 3.6 Serialização e migração
- Tudo opcional e versionado (`FAMILIA_VERSAO`). Elemento novo `kind: 'component'` exige **subir `SCHEMA_VERSION` para 24** na fase F3 com migração identidade (23 → 24): programa antigo recusa o arquivo ("Arquivo de versão mais novo", `packages/model/src/migrate.ts:274`) em vez de **descartar componentes em silêncio**.
- Biblioteca: `hestia-componentes` v1 (`kind`, `schemaVersion`, `families`, `types`, `materials`, `sheets`, `edgeBands`), com troca de ids de material como em `trocaMateriais` (`packages/model/src/openingTypeLibrary.ts:52`) e recusa de arquivo mais novo.
- Validação ao salvar (`componentIssue`, no molde de `openingTypeIssue`, `packages/model/src/opening.ts:211`): ciclo de fórmula, limites, referência a peça/parâmetro/chapa inexistente, dimensão ≤ 0 após avaliar, chapa sem espessura.

### 3.7 Desfazer, cópia, seleção, visibilidade
- **Desfazer/refazer**: todo comando passa por `ProjectStore.exec` (`packages/model/src/history.ts:19`), sem código extra. Rótulos novos em `labelOf` (`packages/model/src/history.ts:151`): "Inserir componente", "Editar componente", "Editar família". **Carregar a família editada = um único passo**.
- **Cópia/colar**: instâncias entram em `clipboard.ts` (`packages/tools/src/clipboard.ts:46`, `:70`); colar no **mesmo** projeto referencia o tipo existente; colar em **outro** projeto leva a família junto (questão Q9). Mover/rotacionar/espelhar muda `x, y, rotation, mirrored` (nada de reescrever malha), entra em `applyTransformCmd` (`packages/model/src/commands.ts:221`).
- **Seleção**: `component` entra em `MODELO` (`packages/tools/src/selectTool.ts:52`) e no `AnyHit.kind` (`:40`); o picking 3D sai de graça se o lote usa `SolidBatch.ids/ElementRange` como `genericSolids.ts:9`.
- **Visibilidade**: nova categoria gráfica `component` (`packages/model/src/graphics.ts:9`); arquivo antigo sem a chave vale o padrão ("ausente = padrão"), sem migração.
- **Nível do elemento**: `hasLevel` (`packages/model/src/elementLevel.ts:19`) passa a incluir `Component`, para "Mover para nível" e filtros por nível funcionarem.

---

## 4 · Ambiente de edição e ferramenta de colocar

### 4.1 Ferramenta Colocar componente
- Faixa: **trocar uma linha** em `apps/web/src/ui/ribbon/tabsMain.ts:17` de `soon(...)` para `tool('component')`, mais `ToolId` (`packages/tools/src/registry.ts:42`) e o `case` em `createTool` (`:52`). Nada além disso na faixa (decisão 0032). O botão "Componente de detalhe" (`tabsMain.ts:67`) e "Equipamento" (`apps/web/src/ui/ribbon/tabsSoon.ts:33`) ficam como estão.
- **Aba contextual "Modificar | Colocar Componente"** (padrão da 0032): seletor de tipo, "Carregar família", "Editar família".
- **Painel de colocação** em `PlacementProperties.tsx` (adicionar `'component'` a `PLACE_TOOLS`, `apps/web/src/ui/PlacementProperties.tsx:15`): tipo, rotação, espelhar, nível/deslocamento, "ancorar em: centro | canto", e para famílias `wall` a distância da quina como em `PlacementProperties.tsx:62`.
- **Comportamento**: fantasma do contorno seguindo o cursor na planta; **Espaço** gira 90°; **Tab** troca o lado em famílias de parede; magnetismo nas paredes (famílias `wall` se alinham à normal, as de nível giram para ficar paralelas à parede mais próxima se o usuário ligar a opção); clique insere e **fica ativa** para repetir; Esc sai. Cotas temporárias para a quina das paredes vizinhas reaproveitam o que já existe para esquadrias (a confirmar na F5).
- **Propriedades da instância** (`ComponentProps`, molde `apps/web/src/ui/GenericProps.tsx:94`): grupos na ordem do Revit (Restrições, Dimensões, Materiais, Dados de identidade), parâmetros de instância, tipo, "Editar tipo" e "Editar família".

### 4.2 Editor de famílias (ambiente próprio)
**Modo, não diálogo.** Entrar por: Arquivo ▸ Novo ▸ Família; botão "Editar família" com uma instância selecionada; duplo clique no tipo no Navegador (árvore Famílias já prevista na 0032). O modo troca o espaço de trabalho por um **projeto-areia** (mesmo padrão de `previewProject`, `apps/web/src/ui/dialogs/openingType/previewProject.ts:40`): um `ProjectStore` à parte com uma instância no centro, desfazer/refazer próprios, e a mesma tela de planta/3D do app.

Telas e painéis (nomes na linguagem da 0032):
1. **Faixa contextual "Editor de família"**: Criar (Peça, Vazio, Plano de referência, Repetir), Propriedades (Categoria e hospedagem, Tipos de família, Parâmetros), Modificar, **Flexionar**, **Carregar no projeto** / **Carregar e fechar**.
2. **Navegador da família** (árvore): Parâmetros · Planos de referência · Peças (agrupadas por papel) · Ferragens · Tipos.
3. **Vistas**: 3D, planta, frente e lateral (as três últimas são cortes ortogonais da própria família), mais lista de peças ao vivo.
4. **Tabela de parâmetros** (diálogo): nome, grupo, tipo, escopo (tipo/instância), valor, **fórmula**, min/max; erros de fórmula na linha; ordem de avaliação visível.
5. **Tabela de tipos**: uma coluna por parâmetro de tipo; "novo tipo", "duplicar".
6. **Propriedades da peça**: papel, origem, tamanho, espessura (por chapa ou número), material/chapa, bordas, veio, usinagens, repetição, condição, níveis de detalhe. Campos aceitam número ou fórmula (o ícone Σ indica fórmula).
7. **Flexionar**: controles deslizantes para L, A, P e os parâmetros numéricos; a cada passo roda a validação (ciclo, dimensão ≤ 0, peça fora da caixa, peças que se atravessam) e mostra a lista de problemas. É o equivalente de "test and flex" do Revit.
8. **Assistentes** (só preenchem a família inicial): "Caixa/Bloco", "Mesa", "Módulo de marcenaria" (laterais + base + topo + fundo + prateleiras + portas, com os parâmetros de montagem da 3.3).

**Edição no v1 é por formulário + prévia**, como o editor de esquadrias; a edição por manipulação direta na vista (arrastar face, cotar peça, travar) é fase posterior. Recomendação deliberada: a parte cara de um editor 3D interativo não é o que gera valor primeiro, e a tabela de parâmetros com fórmulas já cobre o método do Promob.

**Fechar**: "Carregar no projeto" executa `upsertComponentFamily` (+ tipos) em **uma** transação; se há instâncias, elas se regeneram por assinatura. "Descartar" não toca o projeto principal.

---

## 5 · Plano de uso do Rust

Contexto vigente (decisões 0045 a 0048): TypeScript é a referência; Rust só liga por flag; equivalência a **1 µm** e **1e-6 m²/m³**, nunca afrouxada; booleanas só via `@hestia/geom` (`packages/geom/src/index.ts:19`); o `.wasm` é commitado e só uma branch o regenera; o estado do Rust é cache; o esquema de cena carrega **só números e ids, sem texto**, em seções por colunas (0046 §2, 0047 §3). Esta sessão **não toca** `resolve.ts`, `wallZ.ts`, camadas, `crates/geom-wasm/schema/cena-v*.json` nem o `.wasm`.

### 5.1 Fronteira: peças resolvidas
O recurso é dividido em duas metades com um contrato numérico no meio:

```
 TS (permanece)                                    NÚCLEO NUMÉRICO PURO                          Rust (quando for a hora)
 família + tipo + overrides  ──resolver──▶  PecaResolvida[] (colunas: Float64Array/Uint32Array) ──▶ malha, contorno, corte, picking, plano de corte
 (fórmulas, parâmetros, validação)           (sem texto, sem fórmula, ids internados em u32)
```
- Módulo `packages/engine/src/componentes/` **sem React e sem three.js**: entradas e saídas numéricas e serializáveis, nada de `Map` de objetos na fronteira.
- `resolverComponente(p, instância) → PecaResolvida[]`: coordenadas no sistema da instância, arredondadas a 1 µm uma vez (mesmo `Math.round` que `arredonda_js` do kernel, 0045 §3).
- `pecasNoMundo(pecas, x, y, z, rot, espelho)` aplica a transformação da instância. Mesma peça resolvida serve a todas as instâncias com a mesma assinatura (**instanciamento**: uma malha, uma matriz por instância), o que já elimina boa parte do custo sem Rust.
- Rascunho de seções para a futura revisão do esquema (**não criar agora**): `componentes_tipo` (n_pecas), `pecas` (tipo_num, papel_num, material_num, ox, oy, oz, eixo_espessura, a, b, esp, ini_contorno, n_contorno, flags), `contornos` (x, y planos), `usinagens` (peca, tipo, face, x, y, diam, prof), `componentes_inst` (id_num, tipo_num, nivel_num, x, y, z, rot, espelho). O mesmo princípio de `paredes_z` (0047 §2): **o JS calcula o que depende de outros domínios e manda pronto**.

### 5.2 O que ganha com Rust e o que fica em TS

| Parte | Natureza | Destino | Fatia |
|---|---|---|---|
| Parser e avaliador de expressões, ordem de dependência, validação, tipos/overrides | lógica de modelo; milissegundos por instância | **TS para sempre** | — |
| Expansão de peças (família → `PecaResolvida`) | leve; cacheada por assinatura | TS; Rust só se a medição pedir | — |
| Malha 3D das peças (prismas com contorno, furos e rasgos; vazios subtraídos) | geometria pesada só com usinagem e contorno; caixa simples é trivial | **Rust** | **C** |
| Contorno em planta (união das projeções, hachura) | booleanas em lote | Rust, chamando as booleanas existentes | **D** |
| Corte e elevação com componentes (`computeSection`) | recorte de retângulos pelo plano | Rust | **D** |
| Picking 3D (BVH das peças) e quantitativos por geometria | consulta espacial | Rust | **E** |
| Lista de peças e somatórios (área por chapa, metros de fita, nº de furos) | soma sobre colunas | TS (barato); migra só se a fatia E já cobrir quantitativos | E (opcional) |
| **Plano de corte** (arranjo 2D das peças nas chapas) | **única parte realmente pesada**: heurística de empacotamento com muitas peças | TS de referência primeiro; Rust depois, **determinístico e idêntico** | **E** (exportações) |
| Exportar usinagem/CNC (DXF de furos e rasgos) | formatação | TS | E |

### 5.3 Equivalência exigida dos futuros portes
Mesmas regras da 0046 §2.4: área, volume, contagem de peças e topologia com tolerância de 1 µm e 1e-6 m²/m³; harness por projeto real e sintéticos; testes de propriedade (seção 6). Para o plano de corte, como a heurística é determinística, o critério é **posições idênticas a 1 µm** (mesmo critério de ordenação e desempate nos dois lados); só se admite diferença com justificativa por escrito, nunca pelo teste. Divergência é defeito, não ruído.

### 5.4 Em que fatia entra e do que **não** depender
- **Fatia B (pisos, lajes)**: o v1 **não depende**. Componente "sobre piso/laje" (hospedagem `face`) só depois de B, porque exige a cota resolvida do piso.
- **Fatia C (malha 3D)**: primeiro a entrar (peças com contorno/usinagem). Atualização só do elemento alterado já é requisito de C; o componente respeita (um `Component` = um id).
- **Fatia D (planta e cortes)**: contorno automático e recorte de peças.
- **Fatia E (picking, quantitativos, exportações)**: BVH, lista de peças pesada e plano de corte.
- **Não depender de**: `resolveLevel`/`ResolvedLevel`, `resolveMemo` e seu `CACHE_LIMIT`, `wallZ`, camadas, junções, nem de `VERSAO_MOTOR_GEOMETRIA` (0047 §5): componente não pode obrigar a subir a versão do cache do motor de paredes; se tiver cache próprio, chave própria. Para hospedagem em parede usar apenas o **modelo** (eixo, comprimento e espessura via `packages/model`, por exemplo `wallLength` em `packages/model/src/queries.ts`), nunca a geometria resolvida.
- **Esquema**: só a branch que hoje regenera o `.wasm` altera `cena-v*.json`. Este ADR **propõe**, não cria, as seções da 5.1.

### 5.5 Como funciona hoje em TS sem criar código que o Rust reescreva
1. As funções de geometria (malha, contorno, recorte, plano de corte) nascem **como a referência TS** que a regra do 0046 exige; o Rust, quando vier, é a segunda implementação do mesmo contrato e o TS continua como plano B (disjuntor da 0045 §1 item 4). Isso não é retrabalho descartável, é o caminho previsto.
2. Elas nascem com a **forma de dados do Rust** (colunas numéricas, ids numéricos, sem objetos aninhados na fronteira) para o porte ser mecânico.
3. Tudo que o Rust **não** vai portar (fórmulas, validação, UI) fica em `packages/model` e no app.
4. Booleanas de contorno em planta usam `@hestia/geom`, que já despacha para o kernel Rust quando ligado.
5. Se algo for inevitavelmente reescrito: o **avaliador de expressões** não será (decisão: fica em TS); o único candidato a reescrita total é o plano de corte, e a justificativa é medida (seção 7, risco R6).

---

## 6 · Faseamento

Legenda de modelo (regras do dono: subagentes baratos nos passos simples, forte onde o motor é delicado, eu reviso tudo):
**H** = Haiku ou DeepSeek flash (mecânico, com especificação fechada e arquivos nomeados); **S** = Sonnet (complexidade média); **F** = modelo forte (desenho delicado ou algoritmo).
Cada passo termina com `npm test` dos pacotes tocados e `lint`/`typecheck` verdes, um commit em português e **nenhum projeto real nem dado da máquina**. Cada fase é uma branch própria a partir da main.

| Fase | Entrega | Modelo | Critério de aceite objetivo | Testes de propriedade |
|---|---|---|---|---|
| **F1** | `component.ts` (tipos), `expressao.ts` (lexer, parser, avaliador), ordem topológica | **F** (parser e erros) com testes escritos por **S** | 100% dos casos da tabela de gramática passam; entrada de até 512 chars nunca lança; ciclo detectado com id do parâmetro; sem dependência nova | `print(parse(e))` reparseia igual; avaliação é determinística; para entradas finitas o resultado é finito ou erro tipado; `a+b` = `b+a`; ternário só avalia o ramo escolhido |
| **F2** | `resolverComponente` só com peças-caixa; `PecaResolvida` em colunas; arredondamento a 1 µm | **S** | família "mesa" gera volume = Σ a·b·esp (±1e-6 m³); mesma entrada, saída idêntica | volume invariante a translação e rotação de 90°; aumentar L em Δ muda a caixa envolvente em exatamente Δ quando as fórmulas são lineares; espelhar duas vezes = identidade |
| **F3** | Elemento `component`, comandos `placeComponent`/`upsertComponentFamily`/`updateComponent`, `SCHEMA_VERSION` 24, migração identidade, validação, rótulos de histórico, e **os pontos de integração** (tabela da seção 2) | desenho dos comandos: **S**; edição mecânica de cada `switch`: **H**, revisado por mim | arquivo antigo abre igual (teste de migração com os fixtures existentes); arquivo novo em programa antigo é recusado; todo `switch` exaustivo compila; nenhum teste existente muda de resultado | `migrate(serialize(p)) ≡ p`; desfazer após qualquer comando devolve o projeto byte a byte (JSON canônico); `deleteElements` de um componente não deixa referência |
| **F4** | Render: 3D por `SolidBatch` (instanciamento), planta com contorno automático, picking/seleção, categoria gráfica, ocultar por vista | **S** (contorno e instanciamento), **H** (registro de categoria, seleção) | instância aparece em 3D e planta; clique seleciona; "ocultar categoria" funciona; 1.000 instâncias da mesma assinatura geram **uma** malha | caixa envolvente 3D = caixa da planta; contorno ⊇ projeção de cada peça (±1 µm); mover não altera a malha de tipo |
| **F5** | Ferramenta Colocar (registro, faixa, `PlacementProperties`, `ComponentProps`), hospedagem `level` e `wall` | **S**; **H** para a linha da faixa e textos | uma linha em `tabsMain.ts`; colocar, girar (Espaço), repetir, Esc; instância em parede mantém `hostOffset` ao mover a parede | para qualquer posição válida, a instância hospedada fica a `hostOffset` do início da parede (±1 µm); espelhar a parede preserva a distância |
| **F6** | Catálogo base **próprio** (10 famílias: caixa, mesa, cadeira, cama, sofá, vaso, pia, geladeira, fogão, armário baixo simples), importar/exportar `hestia-componentes` | famílias: **H** com especificação por tabela; import/export: **S** | todo item do catálogo passa na validação e no flex automático (L, A, P entre min e max); exportar → importar em projeto vazio dá os mesmos tipos | `importar(exportar(x)) ≡ x`; arquivo mais novo é recusado; ids de material são reapontados |
| **F7** | Editor de famílias: projeto-areia, navegador da família, tabela de parâmetros, tabela de tipos, propriedades da peça, flexionar, carregar no projeto | **S** (telas), **F** (revisão do contrato com o modelo) | criar a "mesa" do zero só pela interface e carregar; desfazer dentro do editor não afeta o projeto; carregar = 1 passo de desfazer | editar e desfazer N vezes volta à família inicial; flex em 100 amostras aleatórias nunca lança |
| **F8** | **Marcenaria**: cadastro de chapas e fitas, parâmetros `sheet`, bordas, veio, usinagens manuais, assistente de módulo, ferragens na lista | **F** (modelagem das fórmulas do módulo-base), **S** (telas) | "armário baixo" com `corpo` 15 → 18 mm recalcula as peças; troca de `fundo` muda o número de peças; sem peça com espessura ≠ da chapa | Σ espessuras laterais + largura interna = L; nenhuma peça fora da caixa do módulo (±1 µm); nenhuma peça de chapa se atravessa (volume da interseção ≤ 1e-9 m³) |
| **F9** | **Lista de peças** e quantitativos (por papel, material, espessura; m² de chapa, m de fita, nº de furos), tabela no Navegador, CSV | **S** | Σ área das peças da lista = Σ a·b das peças da família × instâncias (±1e-6 m²); CSV reimportável em planilha | a lista não depende da ordem de inserção; somar tipos = somar famílias |
| **F10** | **Plano de corte** em TS (heurística de guilhotina, determinística) e exportação | **F** | cada peça aparece exatamente uma vez; nenhuma sobreposição; todas dentro da chapa menos refilo; aproveitamento ≥ 0 e ≤ 1; saída idêntica em duas execuções | invariantes ao lado; permutar a entrada não muda o aproveitamento além de ε se a heurística ordena antes |
| **F11** | IFC: exportar `IfcFurniture`/`IfcSanitaryTerminal` por categoria; DXF em planta | **S** | arquivo abre no validador de IFC já usado pelo projeto; contagem de elementos confere | contar instâncias no IFC = no modelo |
| **F12** | Esquema do Rust (só quando a fatia C estiver aberta): seções de 5.1, harness de equivalência, flag | **F** | diferencial verde a 1 µm e 1e-6 m²/m³ no projeto real e sintéticos; flag desligado por padrão; `.wasm` regenerado **só** pela branch dona | todas as propriedades de F2/F4/F10 rodando contra os dois lados |

Ordem de valor: F1 → F2 → F3 → F4 → F5 já entrega "colocar componentes" (objetivo 1). F6 dá conteúdo. F7 entrega o editor (objetivo 2). F8 a F10 entregam o método do Promob (objetivo 3). F12 é independente e condicionada ao calendário do Rust.

---

## 7 · Riscos, alternativas descartadas e questões em aberto

### 7.1 Riscos
| # | Risco | Mitigação |
|---|---|---|
| R1 | Elemento novo na união `Element` obriga a visitar muitos `switch` (colar, selecionar, IFC, DXF, cópia vinculada, quantitativos) e esquecer um perde dado | fase F3 com lista de verificação gerada por busca (`isGeneric`, `kind === 'generic'`) e teste de exaustividade; teste de ida e volta |
| R2 | Linguagem de expressão vira linguagem de programação | gramática fechada, sem laços, sem funções do usuário, limites duros, nunca `eval` |
| R3 | Famílias mal escritas travam o app (ciclos, 10 mil peças) | limites de 3.2 e validação antes de gravar; avaliação com orçamento de passos |
| R4 | Editor sem solver parece "menos Revit" | mostrar o grafo de dependência e o flex; a manipulação direta vem depois; documentar |
| R5 | Mapear a regra de montagem real da marcenaria (folgas, recuos) sem a fonte do Promob | marcar como **a validar com marceneiro/fabricante** (mesma prática dos presets de perfil, `packages/model/src/openingComposition.ts:24`); todos editáveis |
| R6 | Plano de corte é problema de otimização; qualidade da heurística e esforço | v1 exporta lista e CSV para otimizador externo (como o Promob faz); algoritmo próprio só depois e medido |
| R7 | Colisão de numeração e de esquema com as branches do Rust | este ADR não toca `cena-v*.json`; seções propostas viram trabalho da branch dona do `.wasm` |
| R8 | Peso do arquivo do projeto com muitas famílias | família guardada uma vez por projeto; instâncias só referenciam; biblioteca externa em arquivo |
| R9 | Cópia entre projetos sem a família | colar leva a família (Q9) |
| R10 | Cache do navegador (IndexedDB) com geometria de componente desatualizada | chave de versão própria de componente, separada de `VERSAO_MOTOR_GEOMETRIA` |

### 7.2 Alternativas descartadas
1. **Estender `OpeningType`/`OPENING_FAMILIES`** para mobiliário: o schema é fechado em código de propósito (`packages/model/src/opening.ts:206-210`) e acoplado a parede; quebraria as duas coisas.
2. **Reaproveitar `Generic` como instância**: malha em mundo, sem tipo nem parâmetro; mover reescreve a malha; sem família. Fica como *fonte de conversão* futura (Q10).
3. **Solver de restrições** estilo Revit: caro, difícil de testar e de portar; o Promob mostra que fórmulas bastam para marcenaria.
4. **Scripts em JavaScript nas famílias**: segurança, determinismo e portabilidade para Rust.
5. **Importar `.rfa` ou bibliotecas do Promob**: formatos proprietários e não verificados; fora da regra de licenças.
6. **Núcleo de sólidos (BRep) para revolução/varredura/mistura**: grande, com dependência pesada; v1 usa prismas e, se preciso, contornos poligonais. Revolução e varredura ficam para uma decisão futura.
7. **Gerador de caixaria em código** (um algoritmo "armário"): rígido; a família com fórmulas é editável pelo usuário e cobre mais casos.
8. **Biblioteca de ativos prontos** de terceiros: licença; o catálogo base é todo autoral.

### 7.3 Questões em aberto para o dono decidir
Cada uma com opções e a minha recomendação (a primeira).

| # | Questão | Opções | Recomendação |
|---|---|---|---|
| Q1 | Escopo inicial | **(a)** núcleo comum + mobiliário de forma livre primeiro, depois marcenaria (F8) · (b) só marcenaria Promob · (c) só Revit-like | **(a)**: entrega "colocar componentes" cedo e o método do Promob entra sobre o mesmo núcleo |
| Q2 | Instância | **(a)** novo elemento `component` (SCHEMA 24) · (b) reaproveitar `Generic` | **(a)** |
| Q3 | Onde ficam as famílias | **(a)** dentro do projeto + biblioteca em arquivo JSON · (b) só biblioteca externa · (c) só no projeto | **(a)**, como os tipos de abertura |
| Q4 | Linguagem de fórmulas | **(a)** gramática mínima própria · (b) só parâmetros numéricos e proporções fixas · (c) biblioteca de terceiros | **(a)**; nenhuma dependência nova |
| Q5 | Restrições | **(a)** sem solver, ordem topológica · (b) solver simples | **(a)** |
| Q6 | Editor | **(a)** modo próprio com projeto-areia, edição por formulário no v1 · (b) diálogo modal como o de esquadrias · (c) já com manipulação direta | **(a)** |
| Q7 | Plano de corte | **(a)** v1 só lista de peças e CSV para otimizador externo; algoritmo próprio na F10 · (b) algoritmo próprio já · (c) nunca | **(a)** |
| Q8 | Hospedagem do v1 | **(a)** nível e parede, sem cortar parede · (b) já cortar parede · (c) só nível | **(a)** |
| Q9 | Colar em outro projeto | **(a)** leva a família junto · (b) recusa se o tipo não existir | **(a)** |
| Q10 | Mobiliário importado do IFC (`Generic`) | **(a)** manter como está, sem conversão · (b) ferramenta "converter em componente de malha" | **(a)** agora; **(b)** como fase posterior se pedirem |
| Q11 | Categorias e IFC | **(a)** mobiliário, louças e metais sanitários, equipamentos, marcenaria, genérico → `IfcFurniture`, `IfcSanitaryTerminal`, `IfcBuildingElementProxy` · (b) só genérico | **(a)**, IFC na F11 |
| Q12 | Origem local da família | **(a)** canto esquerdo-frontal-inferior (fórmulas `L - esp` ficam simples; no Promob o zero é inferior-esquerdo-traseiro) com opção de centro · (b) sempre centro | **(a)** |
| Q13 | Catálogo base | **(a)** 10 famílias autorais simples (F6) · (b) começar vazio | **(a)** |
| Q14 | Numeração do ADR | **(a)** 0049 · (b) renumerar na mesclagem | **(a)** |
| Q15 | Quando começar o Rust | **(a)** só depois de F4 e com a fatia C aberta (F12) · (b) já no desenho do esquema | **(a)** |

---

## 8 · Fontes e o que cada uma sustenta

| Fonte | Sustenta |
|---|---|
| [Promob Builder: o que é](https://suporte.promob.com/hc/articles/31123224404625) [LIDO] | escopo do Builder: documentação técnica, peças, ferragens e usinagem, plano de corte, CNC, ERP, orçamento |
| [Promob: Variables](https://suporte.promob.com/hc/en-us/articles/31123722986129) [LIDO] | lista de variáveis, operadores, fórmulas de centralizar, alinhar e repetir, condicional, "P." sobe um nível, ponto zero inferior-esquerdo-traseiro |
| [Promob: plano de corte](https://suporte.promob.com/hc/articles/31119991541905) [LIDO] | otimizadores, refilo, etiqueta com legenda de fita de borda, campos de arquivo (origem/objetivo) |
| [Promob: Builder Parts](https://suporte.promob.com/hc/en-us/articles/31122941360145-Builder-Parts) [LIDO] | criação de peças, usinagens (furo, rasgo, retangular, circular, arranjo, espelho), uso só em fábrica |
| [Promob: editor de geometria / criar peça a partir de geometria](https://suporte.promob.com/hc/articles/31123671122961) [RESULTADO DE BUSCA] | editor de forma e perfil; módulo com peça trocada perde redimensionamento; peça nova não associa CNC |
| [Promob: Cut Pro, cadastro de chapas](https://suporte.promob.com/hc/pt-br/articles/31120995063313-KB-Cut-Pro-Cadastro-de-chapas) [LIDO] | material, espessura, dimensões, refilo, veio |
| [Promob: Configurador de Dimensões e cadastro de preços](https://suporte.promob.com/hc/es/articles/31214122809617) [RESULTADO DE BUSCA] | material e espessura por componente; fundo e tampo configuráveis |
| [Promob: tampo engrossado](https://suporte.promob.com/hc/pt-br/articles/360057292394-KB-Dica-Promob-Como-configurar-tampo-engrossurado) [RESULTADO DE BUSCA] | tampo e moldura com espessuras próprias |
| [Guia Promob Maker](https://promobsitestorage.blob.core.windows.net/download/Guia_Maker_BR/Guia%20do%20Produto%20MAKER%20BR%20-%20V.13%20R.20.pdf) [RESULTADO DE BUSCA; PDF não abriu] | espessuras 15/18/25 mm, escolha entre duas espessuras |
| [Promob: Real Scene](https://suporte.promob.com/hc/en-us/articles/31120036531473-Real-Scene-Opening-Real-Scene) [RESULTADO DE BUSCA] | render fotorrealista do Promob |
| [Revit: Creating Loadable Families](https://help.autodesk.com/cloudhelp/2024/ENU/Revit-Customize/files/GUID-09A2439A-FDCB-4233-B08E-6F160D4296DE.htm) [LIDO] | fluxo do editor, planos de referência e prioridades, formas e vazios, restrições, flex, tipos, `.rfa` |
| [Revit: Family Category and Parameters](https://help.autodesk.com/cloudhelp/2024/ENU/Revit-Customize/files/GUID-68EFCA67-4913-4E00-AB9E-F2E6A7BEF8C6.htm) [LIDO] | hospedagem, Always Vertical, Cut with Voids, Enable Cutting in Views, Shared, OmniClass |
| [Revit: Set Family Geometry Visibility](https://help.autodesk.com/cloudhelp/2024/ENU/Revit-Customize/files/GUID-749AEB1E-1B01-46BC-9790-3473BC769211.htm) [RESULTADO DE BUSCA] | visibilidade por vista e nível de detalhe; geometria oculta continua existindo; parâmetro Visible |
| [Revit: Advanced Family Techniques](https://help.autodesk.com/cloudhelp/2024/ENU/RevitLT-Customize/files/GUID-3EA4D026-0974-43C6-859F-3A4B785B7977.htm) [RESULTADO DE BUSCA] | fórmulas, famílias aninhadas e compartilhadas, type catalog |

**Não verificado, registrado**: fórmulas completas do Builder; regras automáticas de furação; tamanho de chapa; modelo interno de fita; linhas simbólicas 2D do Revit; qualquer detalhe de produtos pagos que as páginas não descrevem. Onde este ADR usa esses pontos, são **propostas do Hestia**, não cópia do comportamento deles.
