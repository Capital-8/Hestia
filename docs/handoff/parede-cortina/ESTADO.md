# Parede cortina: estado (fase 0 concluída)

Decisão: `docs/decisoes/0056-parede-cortina.md`. Esta fase: tipos, migração 24 → 25, `wallThicknessOf`, camada-sombra, comandos de montante e painel, validação do tipo, testes. Sem grade, geometria, Rust ou UI.

## Pontos trocados de `totalThickness` para `wallThicknessOf` (recebem `WallType`)

- packages/engine: faces.ts, frame.ts (2 pontos), kernelA1.ts, schedule.ts
- packages/model: dimensionRefs.ts (2 pontos), validateJoins.ts (2 pontos)
- packages/tools: infer.ts, joinTool.ts (reescrito com tipo nulo tratado), wallTool.ts
- apps/web: editor/pastePreview.ts, ui/dialogs/SectionPreview.tsx, ui/dialogs/WallTypeDialog.tsx, ui/Properties.tsx, ui/TypePreview.tsx

Continuam com `totalThickness` (pisos, lajes, forros, testes e `wallType.ts`): ver o teste-guarda `contratoCortina.test.ts`.

## Consumidores de `layers` de tipo de parede (a revisar na fase 1)

Lista do grep e da allowlist do teste-guarda (`PONTOS_PERMITIDOS_LAYERS`):

- apps/web: editor/pastePreview.ts, editor/typeActions.ts, plugins/sceneExport.ts, ui/Properties.tsx, ui/dialogs/WallTypeDialog.tsx
- packages/engine: kernelA1.ts, partialStructure.ts, quantities.ts, resolve.ts, schedule.ts, wrap.ts
- packages/io: dxfNotes.ts, ifc/ifcExport.ts, ifc/ifcQuantities.ts
- packages/model: queries.ts (e as novas wallCurtain.ts, curtainCommands.ts, wallType.ts)
- packages/render: plan/tags.ts
- tests/ifc-export/canonical.ts

## Limitação do teste-guarda

A checagem é por arquivo. Uma leitura nova de `layers` de cortina dentro de um arquivo já listado não é pega; a revisão da fase 1 cobre isso.
