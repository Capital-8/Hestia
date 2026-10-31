# Colar alinhado aos níveis selecionados — contrato de implementação

Branch: `feat/colar-niveis` (worktree `wt/paste-niveis`).
Base: `3be24728` (`feat/corte-editavel`).
Este documento é a fonte da verdade para os agentes. Não mudar assinatura sem combinar com o integrador.

## Objetivo

Copiar a seleção (paredes + portas/janelas, pisos, lajes, forros, telhados, escadas, rampas,
ambientes, genéricos/IFC e desenhos CAD) para **um ou vários níveis**, mantendo X/Y e os offsets
relativos ao nível, com **um único passo de desfazer**.

Cortes, elevações, cotas, textos, etiquetas, grades e separadores **não** entram. Se estiverem na
seleção, são ignorados e o status avisa.

## Textos exatos (Revit pt-BR)

- Item da seta do Colar: **Alinhado aos níveis selecionados** / `Aligned to Selected Levels`
- Diálogo: **Selecionar níveis** / `Select Levels`
- Aba contextual: **Modificar | Colar alinhado**
- Botões do diálogo: **Cancelar** · **Pré-visualizar** · **Colar**
- Vínculo (opcional): **Manter cópias vinculadas** · **Sincronizar cópias vinculadas** · **Desvincular**

## Fluxo

```
Selecionar
  └─ seta ▾ do botão Colar
       ├─ Colar (comportamento atual, Ctrl+V)
       └─ Alinhado aos níveis selecionados...
            └─ diálogo "Selecionar níveis"
                 ├─ Colar ──────────────► aplica direto (1 undo)
                 └─ Pré-visualizar ─────► 3D enquadrado + fantasmas
                                            + aba "Modificar | Colar alinhado"
                                                 ├─ V verde ──► aplica (1 undo)
                                                 └─ X vermelho ► cancela tudo, volta à vista
```

Menu de contexto (botão direito no canvas), na ordem:

```
Copiar
Colar
Alinhado aos níveis selecionados...
--------
Repetir
...
```

Habilitado em planta, 3D, corte e elevação. Fora de prancha.

## Semântica do colar

Para cada nível de destino:

1. `levelId` dos elementos = destino.
2. X/Y, rotação, `sag`, offsets relativos (`baseOffset`, `topOffset`, `heightOffset`, `offsetZ`)
   são preservados.
3. `topLevelId` (parede, escada, rampa) é remapeado por **delta de índice** entre `p.levels`
   ordenados por `elevation`: se a origem vai do nível `i` ao `i+2`, no destino vai do `j` ao `j+2`.
   Se estourar o último nível, cair para altura explícita e avisar.
4. `attachTopRoofId` → id do telhado copiado, se o telhado estiver no buffer; senão limpar + avisar.
5. Aberturas seguem a parede copiada (`hostId` remapeado), nunca para parede de outro nível.
6. Escada/rampa com `topLevelId: null` continua automático (nível acima do destino).
7. Forro: `roomId` remapeado se o ambiente foi copiado; senão soltar vínculo (`roomLinked` falso)
   e manter o contorno, com aviso.
8. Genérico: a malha está em Z absoluto; transladar por `destino.elevation - origem.elevation`.
9. CAD: copiar por referência compartilhada (paths/textos imutáveis) com id novo e `levelId` novo.
10. Ambiente: mantém o ponto interior; contorno/área são derivados das paredes do destino.
11. Um único `{ type: 'batch', commands }`. Nunca um `exec` por nível.
12. Sobreposição no destino é permitida; o resultado lista `N sobreposições` por nível.

## Contratos de código

### `packages/tools/src/pasteLevels/types.ts`

```ts
export interface PasteLevelsOptions { link?: boolean; mint?: MintId }
export interface PasteIds {
  walls: Id[]; openings: Id[]; floors: Id[]; slabs: Id[]; ceilings: Id[];
  roofs: Id[]; stairs: Id[]; ramps: Id[]; rooms: Id[]; generics: Id[]; cad: Id[];
}
export type PasteWarningKind =
  | 'overlap' | 'opening-dropped' | 'too-tall' | 'top-overflow'
  | 'room-open' | 'ceiling-unlinked';
export interface PasteWarning { levelId: Id; kind: PasteWarningKind; count: number }
export interface PasteLevelsResult {
  command: Command;
  byLevel: Record<Id, PasteIds>;
  warnings: PasteWarning[];
}
```

### Engine (`W1`, dono de `packages/tools/src/pasteLevels/{command,remap}.ts`, `clipboard.ts`, `pasteTool.ts`)

```ts
export function pasteAlignedToLevelsCommand(
  p: Project, clip: ClipBuffer, levelIds: Id[], o?: PasteLevelsOptions,
): PasteLevelsResult | null;

export function previewPasteLevels(
  p: Project, clip: ClipBuffer, levelIds: Id[], o?: PasteLevelsOptions,
): Project; // rascunho com os elementos colados, sem tocar no projeto real
```

`ClipBuffer` ganha `ceilings?: Ceiling[]`, `generics?: Generic[]`, `cad?: CadDrawing[]`.
`clipboardFrom` e `copyableIds` passam a incluí-los.

### Categorias (`W2`, dono de `packages/tools/src/pasteLevels/categories.ts`)

```ts
export interface CategoryContext {
  p: Project; levelId: Id; srcLevelId: Id; mint: MintId;
  hostMap: Map<Id, Id>; wallMap: Map<Id, Id>;
}
export function cloneCategories(
  p: Project, clip: ClipBuffer, levelId: Id, ctx: CategoryContext,
): { commands: Command[]; ids: PasteIds; warnings: PasteWarning[] };
```

Cuida de forros, genéricos e CAD. W1 cuida de paredes/aberturas/pisos/lajes/telhados/escadas/
rampas/ambientes e chama `cloneCategories`.

### Vínculo (`W3`, dono de `packages/model/src/copyLink.ts` e dos comandos)

```ts
export interface CopyLink {
  id: Id;
  sourceIds: Id[];                              // role i
  members: { levelId: Id; ids: Id[] }[];        // ids[i] é a cópia de sourceIds[i]
  createdAt: number;
}
export function copyLinkOf(p: Project, elementId: Id): CopyLink | null;
export function linkRoleIndex(link: CopyLink, elementId: Id): number;
export function linkedSiblings(p: Project, link: CopyLink, elementId: Id): Id[];
export function makeCopyLink(
  sourceIds: Id[],
  members: { levelId: Id; ids: Id[] }[],
  mint: MintId,
): CopyLink;
export interface SyncLinkedElements { linkId: Id; fromId: Id; toIds?: Id[] }
export function syncLinkedCommand(p: Project, c: SyncLinkedElements): Command | null;
```

`Project` ganha `copyLinks?: CopyLink[]`. Migração: ausente = nenhum. Schema version +1.
Comandos novos (W3):

```ts
| { type: 'addCopyLink'; link: CopyLink }
| { type: 'deleteCopyLink'; id: Id }
```

O motor (W1) usa `{ type: 'addCopyLink', link: makeCopyLink(...) }` no mesmo batch quando
`link: true`. Sincronizar = copiar geometria/parâmetros do `fromId` para os irmãos, ajustando Z
pelo delta de nível e remapeando `topLevelId`/`attachTopRoofId` do destino. Um batch.

### Web / controlador (integrador)

```ts
useUi.pastePreview: PastePreviewState | null

editor.openPasteLevelsDialog(): boolean
editor.previewPasteLevels(levelIds: Id[], link: boolean): boolean
editor.confirmPasteLevels(): boolean
editor.cancelPasteLevels(): void
editor.pasteLevelsDirect(levelIds: Id[], link: boolean): boolean
```

```ts
export interface PastePreviewState {
  levelIds: Id[];
  count: number;
  originView: 'plan' | '3d' | 'section' | 'sheet';
  originLevelId: Id;
  originSectionId: Id | null;
  link: boolean;
}
```

### UI

- `W4` cria `apps/web/src/ui/dialogs/SelectLevelsDialog.tsx` e
  `apps/web/src/ui/dialogs/pasteLevelsModel.ts` (+ teste). O diálogo é **controlado por props**:
  `levels`, `originLevelIds`, `initialSelected`, `onCancel`, `onPreview(levelIds, link)`,
  `onPaste(levelIds, link)`. Não importa o controlador.
- `W5` é dono de `ui/ribbon/{model,actions,panelsShared,context}.ts`, `editor/contextMenu.ts`,
  `ui/useCanvasContextMenu.ts`. Faz a seta, a ação, a aba V/X e o menu de contexto.
- `W6` é dono de `apps/web/src/editor/pastePreview.ts`, `packages/render/src/model3d/ghost.ts`,
  `packages/render/src/index.ts` e do componente 3D (`ViewportCanvas.tsx` / canvas 3D).
  Fantasmas violeta (`--preview`), translúcidos, sem picking.

## Donos de arquivo (ninguém mais edita)

| Dono | Arquivos |
|---|---|
| W1 | `packages/tools/src/pasteLevels/{types,command,remap}.ts`, `clipboard.ts`, `pasteTool.ts`, testes |
| W2 | `packages/tools/src/pasteLevels/categories.ts`, teste |
| W3 | `packages/model/src/copyLink.ts`, `copyLinkCommands.ts`, `commands.ts`, `history.ts`, `migrate.ts`, `types.ts`, `index.ts`, testes |
| W4 | `ui/dialogs/SelectLevelsDialog.tsx`, `ui/dialogs/pasteLevelsModel.ts`, teste |
| W5 | `ui/ribbon/{model,actions,panelsShared,context}.ts`, `ui/Ribbon.tsx`, `editor/contextMenu.ts`, `ui/useCanvasContextMenu.ts`, `ui/ribbon/ConfirmCancelPanel.tsx`, testes |
| W6 | `editor/pastePreview.ts`, `render/src/model3d/ghost.ts`, `render/src/index.ts`, `ui/ViewportCanvas.tsx`, componente 3D, testes |
| Integrador | `editor/controller.ts`, `editor/transfer.ts`, `editor/state.ts`, `App.tsx`, `styles.css`, `pasteLevels/types.ts` (web), exports restantes |

Se precisar de um arquivo de outro dono: **pare e reporte**, não edite.

## Regras para os agentes

1. Só edite os arquivos da sua lista.
2. Não rode `npm install`, não mexa em lockfile, não reformate arquivo inteiro.
3. Verifique com `npx vitest run <seus testes>`; não rode `npm run check` completo.
4. Não refatore nada fora do escopo.
5. Entregue: resumo, arquivos, testes rodados, dúvidas.
6. TypeScript estrito: sem `any` novo, sem `@ts-ignore`.
7. Comentários em português, no estilo do projeto.

## Testes mínimos

- 3 níveis → 3 conjuntos, ids distintos, X/Y igual, `levelId` correto.
- Um `undo` remove os 3.
- Abertura no mesmo nível da parede.
- Parede com `topLevelId` remapeado passa em `validateProject`.
- Telhado + `attachTopRoofId` remapeado.
- Forro com e sem ambiente copiado.
- Genérico transladado em Z; CAD com id novo e mesmo conteúdo.
- Nível repetido/inexistente não altera o modelo.
- Corte na seleção é ignorado.
- Vínculo: sincronizar 3 cópias em um batch; desvincular.
- E2E: 2 níveis, parede+porta, colar em 2, conferir por nível, um undo.
