# G · O que foi implementado (29/10/2026)

Estado da entrega da planta de área. Para o desenho e as decisões, ver
[F-proposta-plantas-de-area.md](F-proposta-plantas-de-area.md) e a
[decisão 0037](../decisoes/0037-plantas-de-area.md).

## Como usar

1. **Arquitetura → Sala e Área → Ambiente** e clique dentro de um circuito fechado (ou use
   **Ambientes em todos os circuitos fechados**). Todo ambiente criado já tem rótulo na planta de área.
2. No navegador, em **Plantas de área**, botão direito → **Criar para todos os níveis**. Abra a planta.
3. A planta nasce **sem cor**: diagonais de referência atravessando cada ambiente, perímetro fino, rótulo no
   cruzamento e paredes claras. O texto do rótulo **não tem fundo** (não há halo branco).
4. **Arraste o rótulo**. Com o rótulo dentro do ambiente, as diagonais passam a cruzar no **centro do texto** e
   acompanham o arraste. Ao sair do ambiente, o X volta ao ponto de referência e a chamada de duas linhas cruzadas
   acompanha o rótulo, com o cruzamento no centro do texto.
5. **Clique dentro do ambiente** para selecioná-lo: preenchimento e contorno em destaque. No painel, escolha a
   **Categoria** e clique em **Gerenciar categorias…** para editar nome, código, cor e hachura.
6. **Anote como numa planta de piso**: Cota, Texto, Etiqueta, Linha/Região de detalhe, Medir e **Cotas automáticas…**
   funcionam na planta de área. As anotações ficam **presas a esta vista** (`AreaPlan.annotations`) e não vazam para a
   planta de piso. Ao criar a planta, as anotações do nível são copiadas; “Copiar anotações do nível” refaz a cópia.
7. Com um ambiente selecionado, edite **Etiqueta nesta planta de área** no painel: campos
   (nome, número, área, categoria, nível, perímetro, volume e texto livre), orientação, chamada e visibilidade.
   Esses ajustes ficam em `AreaPlan.tags` e não mudam o rótulo compartilhado das outras vistas.
8. Em **Cor (opcional)**, escolha **Por categoria**, **Por nível** ou **Por faixa**. Aí entram
   preenchimento, legenda e quadro. A cor de área aparece só na planta de área; a planta de piso usa o
   preenchimento neutro do tema.
9. **Botão direito em Plantas de área → Criar prancha geral**: uma vista por pavimento + quadro geral.

## Onde está

| Camada | Arquivo |
|---|---|
| Modelo | `packages/model/src/areaPlan.ts`, `areaPlanCommands.ts`, `types.ts` (`Room.referencePoint/labelPosition/labelRotation/labelLeader/categoryId`) |
| Geometria | `packages/engine/src/roomReference.ts` (centroide, polo, diagonais), `rooms.ts` (`roomRegions`, cache) |
| Cores e quadro | `packages/engine/src/areaPlan.ts` |
| Desenho | `packages/render/src/plan/areaPlan.ts`, `build.ts` (`buildAreaPlanGeometry`) |
| Prancheta | `packages/render/src/sheet/viewports.ts`, `sheet/build.ts`, `sheet/frame.ts` |
| Ações/UI | `apps/web/src/editor/areaPlanActions.ts`, `ui/AreaPlanProperties.tsx`, `ui/browser/Views.tsx`, `RoomProperties.tsx` |
| DXF | `apps/web/src/editor/dxfExport.ts` (`areaPlanDxf`) |
| IFC | `packages/io/src/ifc/ifcSpaces.ts` |

## Correções que vieram junto

- `wallsSignature` inclui a flecha (`sag`) do arco, e os caches são por projeto (`WeakMap`), não globais.
- `dropBandHoles` usa o retângulo **orientado** do separador (pilar ao lado de diagonal continua furo).
- Criação em lote usa `roomRegions` (mesma fonte do `resolveRooms`), com separadores e `wallFaces`; não cria
  ambiente no miolo de pilar.
- Duplicata no mesmo circuito não soma na tabela/quadro.
- Número repetido no nível: aviso. Pé-direito ≤ 0: erro.
- Referência e rótulo acompanham mover/girar/espelhar/copiar o ambiente.
- Rótulo, legenda e quadro seguem o tema claro/escuro; a prancha impressa continua em papel branco.
- O cache de circuitos usa a assinatura do conteúdo do nível (inclui a flecha `sag` do arco), então editar um nível não
  recalcula os outros e uma parede em arco não deixa área velha.

## Limitações conhecidas (próxima etapa)

- O posicionamento automático do rótulo usa um leque de candidatos ao redor da referência e prefere uma caixa
  inteira dentro do ambiente; em ambientes muito pequenos, quando nenhum candidato cabe, ele fica no candidato
  mais próximo (com chamada) e pode exigir ajuste manual. Não é um layout global ótimo.
- PDF da prancha de área é gerado pelo caminho existente de pranchas, mas não tem teste visual próprio.
- `ouroZoom.test.ts` tem 72 falhas de hash **pré-existentes**, iguais às do estado anterior; não são desta
  entrega.

## Rótulos, RoomTag por vista e planta de piso (29/10/2026)

- **Planta de piso mostra só o nome** (`roomNameText`): o número e a área ficaram na planta de área, onde os
  campos da etiqueta são configuráveis. O DXF da planta de piso segue a mesma regra.
- **Rótulo automático da planta de área**: leque determinístico de candidatos (centro, acima/abaixo,
  esquerda/direita e diagonais), com margem de papel; prefere caixa inteira dentro do polígono (furos/L/U) e
  sem colisão. Se nenhum candidato couber, usa o mais próximo da referência, em vez de subir degraus e sair do
  ambiente. Posição explícita do modelo ou `RoomTag` existente nunca é sobrescrita.
- **`RoomTag` por vista na UI**: com um ambiente selecionado na planta de área, o painel **Etiqueta nesta
  planta de área** edita campos, texto livre, orientação, chamada e visibilidade em `AreaPlan.tags`. O grupo
  **Rótulo (todas as vistas)** continua separado e não é alterado.
- **Seleção e caixa de texto**: a validação visual no navegador confirmou hover, seleção por clique, caixa de
  seleção, alça de arraste, `Delete`, propriedades, `TextDialog` multilinha e seleção por janela na planta de
  área (41/41 verificações).

## Seleção, texto e exclusão na planta de área (29/10/2026)

- **Cotas e textos da vista são selecionáveis**: a seleção lê `AreaPlan.annotations` quando a vista é de área
  (`annotationAt`, `dimGripAt`, `dimTextGripAt` com `planId`). Clicar seleciona; arrastar a alça da cota muda o
  deslocamento; arrastar a alça do texto move o texto (um passo de desfazer).
- **Propriedades**: o painel reconhece cotas, textos, linhas/regiões de detalhe e etiquetas da planta e edita a
  vista, não o nível. O texto tem conteúdo multilinha, altura, largura de quebra, rotação, moldura, alinhamento,
  negrito/itálico/sublinhado, posição X/Y e "Centralizar no ponto".
- **Excluir**: Delete remove as anotações da planta de área; o modelo continua bloqueado nessa vista.
- **Destaque**: texto/cota sob o cursor ganham realce; o texto selecionado ganha cor de seleção, caixa e um
  quadradinho no canto inferior esquerdo (fora do texto) para arrastar.
- **Caixa de texto**: com a ferramenta Texto ativa, o painel de colocação abre **Caixa de texto…**; o diálogo cria
  um texto com largura, moldura, quebra de linha, rotação e alinhamento no centro da vista (na planta de área, em
  `AreaPlan.annotations`). O texto criado pela ferramenta Texto continua aceitando Enter no campo e pode ser
  convertido em caixa pelas propriedades.
- Testes: `annotationPlanPick.test.ts` (tools), `notes.text.test.ts`/`frameBox.test.ts` (render),
  `AnnotationProps.test.ts`/`TextDialog.test.ts`/`PlanLabels.test.ts` (app). A suíte completa passa com as 72
  falhas de hash pré-existentes de `ouroZoom.test.ts`.

## Rótulo do ambiente na planta de piso (20/11/2026, 0.2.7)

- **Campos configuráveis por ambiente**: `Room.labelFields?: TagField[]` (ausente = `['name']`) é compartilhado
  por todas as vistas, como `labelPosition`/`labelRotation`. Sem o campo, a planta de piso continua mostrando
  **só o nome** (decisão 0037 preservada).
- **Render**: `roomOps` usa `roomTagLines` (o mesmo helper da planta de área) e desenha até **duas linhas** —
  nome/categoria/personalizado em cima, número/área/nível/perímetro/volume embaixo, com a mesma técnica de
  `desvio` da planta de área. A chamada e a posição/rotação compartilhadas continuam valendo.
- **UI**: no grupo **Rótulo (todas as vistas)** do painel do ambiente, a linha **Campos** liga/desliga cada
  campo (sem "Personalizado", que é da etiqueta da planta de área) e o botão **Aplicar aos ambientes deste
  nível** replica a escolha para todos os ambientes com circuito do nível, com desfazer.
- **Planta de área**: sem mudança de comportamento; `RoomTag.fields` (por vista) continua mandando naquela
  planta.
- **DXF**: o texto do ambiente usa os mesmos campos da tela (inclusive categoria e nível); sem `labelFields`,
  mantém o texto clássico `Sala (101) · 12,34 m2`.
- **Comando**: `setRoomLabel` aceita `fields?: TagField[] | null` (`null` limpa), com validação de lista vazia,
  repetição e valor inválido. Sem migração: projeto antigo abre com o campo ausente.
- **Testes**: `packages/model/src/areaPlan.test.ts` (comando/undo/validação), `packages/render/src/plan/rooms.test.ts`
  (duas linhas, fallback, chamada), `apps/web/src/editor/dxfRooms.test.ts` e `apps/web/src/ui/RoomProperties.test.ts`
  (toggles e aplicar ao nível).