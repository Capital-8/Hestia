# 0046 · Anotação 2D universal e famílias de cotas

Decidido em 2026-11-01 com o dono. Origem: o dono relatou que a cota da planta e a do corte/elevação "são anotações
diferentes": sistema, aparência, orientação do texto, propriedades e saída (DXF/prancha) divergiam; e que a cota manual
é pouco fluida e o estilo é pobre. O pedido foi uma camada de anotação **universal** para todas as vistas 2D, com
**família de cotas** (Revit: Dimension Type) e criação mais fluida. Companheira de
[0019](0019-anotacoes.md) (anotação da planta), [0028](0028-cotas-automaticas.md) (cotas automáticas) e
[0037](0037-cotas-dinamicas-e-referencias.md) (cotas dinâmicas).

## 1 · Camada universal: a anotação é da VISTA

O modelo de dados já era o mesmo (`Dimension`, `TextNote`, `DetailLine`, `DetailRegion`, `ElementTag`) e o desenho já era
um só (`render/src/plan/notes.ts`, `dimDraw.ts`, `dimLabels.ts`). O que faltava era **um único caminho de escrita e de
edição**: corte/elevação moravam num contêiner à parte, escrito por um comando "conjunto inteiro"
(`setSectionAnnotations`), com escala fixa, sem propriedades e sem exportação.

Agora todo comando de anotação aceita o dono da vista, na ordem: `sectionId` (corte/elevação) → `planId` (planta de
área) → nível (planta de piso). `applyAnnotationCommand` resolve o escopo (`sectionScope`, `planScope`, `levelScope`) e
valida com as mesmas regras. Consequências:

- a cota/texto do corte entra com `addDimension`/`addText`/…, com validação pt-BR e rótulo de desfazer próprio
  ("Criar cota", "Editar cota", "Excluir cota") — antes tudo era "Anotar no corte";
- o painel de propriedades acha a anotação do corte (`selectedNote(..., sectionId)`), com valor, deslocamento, família,
  texto, unidade, casas, prefixo/sufixo, altura e marca — antes não havia painel nenhum no corte;
- mover/copiar no corte move as anotações selecionadas em `(t,z)` (translação no plano da vista);
- o arraste de alça do texto de anotação passa a existir no corte (a cota já tinha `offset`/texto);
- `setSectionAnnotations` continua aceito por compatibilidade (arquivos e comandos antigos), mas o caminho novo é por
  item.

O armazenamento **não mudou**: `Level`, `AreaPlan.annotations` e `SectionView.annotations` continuam opcionais, sem
migração e sem `SCHEMA_VERSION` novo. Um projeto antigo abre e lê como antes.

## 2 · Família de cotas

`DimensionFamily` (`packages/model/src/dimensionFamily.ts`) é `{ id, name } & DimensionStyle`: a aparência nomeada da
cota. Fica em `ProjectSettings.dimensionFamilies`, com `defaultDimensionFamilyId`; a cota guarda `familyId` opcional.

- **Compatibilidade:** sem famílias gravadas existe só a família implícita `Padrão`, que é o **estilo global** de antes
  (`settings.dimensionStyle`). Editar a `Padrão` grava no estilo global; criar/editar as demais grava em
  `dimensionFamilies`. Cota sem `familyId` lê o estilo global (todo arquivo antigo).
- **Comandos:** `upsertDimensionFamily`, `removeDimensionFamily`, `setDefaultDimensionFamily` (com desfazer e validação:
  nome único, faixas de mm, enums).
- **Interface:** diálogo **Famílias de cotas** (aba Anotar, grupo Cota; também a partir de "Cotas do projeto › Estilo das
  cotas"), com lista, cópia, exclusão, padrão do projeto e prévia ao vivo; a barra de opções da ferramenta Cota passa a
  ter **um seletor de família** no lugar dos campos soltos de unidade/casas/marca/altura (que furam o estilo ao serem
  gravados cota por cota).
- **Aplicação:** `dimensionStyleFor(settings, d)` resolve a família da cota (ou o estilo global) e é usada pelo desenho,
  pelo hit test, pelo DXF e pela prancha. A formatação do valor usa `dimensionFormatStyle`, a mesma regra em todos eles.

## 3 · Estilo: leitura, encaixe do texto, empilhamento

Campos novos no `DimensionStyle` (todos com padrão = comportamento anterior):

- `readConvention`: `aligned` (padrão), `upright` (nunca de cabeça para baixo) ou `horizontal` (valor sempre horizontal,
  inclusive em cota vertical — comum em prancha de arquitetura);
- `textFit`: `leader` (padrão: afasta com chamada e empilha), `inside` (mantém no trecho) ou `outside` (sempre fora, com
  chamada);
- `textGap`: folga do texto até a linha (mm de papel).

O `stackSpacing` do estilo, que era decorativo, passa a definir o passo das pistas de texto empilhadas (mínimo de 1,4
altura de texto para os rótulos não se encostarem).

## 4 · Paridade do corte/elevação

- **Escala:** as anotações da seção usam a escala da vista (`sectionGraphics.scale`), como a planta. Antes eram fixas em
  1:100, mesmo com a escala da vista alterada.
- **Visibilidade:** a categoria `annotation` oculta nos gráficos do corte esconde cotas, textos, detalhes e etiquetas
  (antes desenhavam sempre).
- **DXF:** as anotações do corte saem nas camadas `COTAS`, `TEXTOS`, `DETALHE` e `ETIQUETAS`, com o estilo da família e a
  escala da vista (`packages/io/src/dxfSectionNotes.ts`). Antes o DXF do corte não levava anotação nenhuma.
- **Prancha/PDF:** `sectionPartsOf` passa as anotações da vista; a prancha desenha cota/texto do corte como já fazia com
  a planta (`render/src/sheet/viewports.ts`).
- **Níveis:** continuam anotação (peso 0 no DXF) e entram na prancha.

## 5 · Criação mais fluida

- **Prévia na escala real da vista** (antes usava 1 mm ≈ 4 px): o texto e as marcas têm o tamanho da cota confirmada.
- **Afastamento com encaixe:** a linha de cota encosta nas linhas de cota existentes da vista (tolerância de 3 mm de
  papel) e no último afastamento usado — cadeias alinhadas sem ajuste manual.
- **Direção automática** (`dimensionMode: 'auto'`, padrão da ferramenta): dois pontos na mesma horizontal viram cota
  horizontal, na mesma vertical viram vertical, o resto fica alinhada. A direção deixa de ser um preset obrigatório.
- **Família na criação:** a cota nova grava `familyId` da família escolhida (ou da padrão do projeto, quando existem
  famílias explícitas); sem famílias, não grava nada e segue o estilo global.

## 6 · O que ficou fora

- **3D:** anotação em 3D exige adaptador dependente de câmera; fica para quando a base 2D estiver estável (o dono
  aprovou a espera). O contrato `DimensionViewAdapter` continua reservado para isso.
- **Referências associativas no corte:** as `refs` de parede da planta não têm sentido em `(t,z)` e continuam sendo
  descartadas no desenho do corte. A cota do corte mede o par gravado; associá-la a feições da vista exige o catálogo de
  feições em `(t,z)` (a ferramenta Alinhar já calcula parte dele).
- **Cotas temporárias/dinâmicas e botão "I" no corte:** continuam só na planta (decisão 0037 §7).
- **Cotas automáticas no corte:** não há gerador; a ação continua criando cotas da planta no nível ativo.
- **Ignorar sem grão** do desenho 3D (`layers3d`) e o DXF de anotação 3D.

## 7 · Testes

- `packages/model/src/dimensionFamily.test.ts` (11): resolução, padrão implícito, comandos com desfazer, validação.
- `packages/model/src/annotations.test.ts`: comandos por item na vista de corte (cota/texto, validação, desfazer, duas
  vistas independentes).
- `packages/render/src/plan/dimDraw.test.ts`: família no desenho, `readConvention`, `textFit`, passo das pistas.
- `packages/render/src/section/annotations.test.ts`: escala da vista e visibilidade da categoria nas anotações do corte.
- `packages/render/src/sheet/build.test.ts`: cota e texto do corte na prancha.
- `packages/io/src/dxfSectionNotes.test.ts` (6): camadas, camadas de anotação com peso 0, escala, família.
- `apps/web/src/ui/AnnotationProps.test.ts`: painel da cota/texto do corte, valor sem resolver `refs`, família.
- Suíte completa e `typecheck`/`lint`/`build` no fechamento da rodada.

## Fechamento da implementação (planta)
- A cota permanente selecionada é editável como cota dinâmica (mesmo caminho das paredes e esquadrias): valor, alças de referência e Shift+clique para escolher outro elemento.
- Família de cota é aparência nomeada. A cota guarda só o que é próprio dela (texto, deslocamento, direção, trava) e o botão "Editar família…" abre o editor da família. Campos de ajuste individual ficam em "Avançado".
- Trava (`locked`) bloqueia a edição de valor, não a ferramenta Mover. Padrão: destravada.
- Corte e elevação ficam fora desta etapa.
