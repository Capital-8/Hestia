import type { Id } from '@hestia/model';
import { NON_ELEMENT_KINDS, type DimContext, type DimProvider, type DimSubjectKind, type NonElementKind, type TempDim } from './types.ts';
import { openingDimProvider } from './providers/opening.ts';
import { wallDimProvider } from './providers/wall.ts';
import { outlineDimProvider } from './providers/outline.ts';
import { detailLineDimProvider, perimeterLineDimProvider } from './providers/line.ts';
import { gridDimProvider } from './providers/grid.ts';
import { permanentDimProvider } from './providers/dimension.ts';

// O sujeito varia por provedor; o registro guarda o contrato sem o parâmetro e só `selectionDims` o usa.
type AnyProvider = DimProvider<never>;

interface Resolved {
  provider: DimProvider<unknown>;
  subject: unknown;
}

const providers = new Map<DimSubjectKind, AnyProvider>();
let builtinsDone = false;

/**
 * Liga o provedor ao tipo do sujeito: o `kind` de um elemento (`'door'`, `'wall'`...) ou um `NonElementKind`
 * (`'detailLine'`, `'perimeterLine'`, `'grid'`). Ao selecionar um sujeito desse tipo, as cotas dele aparecem.
 */
export function registerDimProvider<S>(kind: DimSubjectKind, provider: DimProvider<S>): void {
  providers.set(kind, provider as unknown as AnyProvider);
}

export function getDimProvider(kind: DimSubjectKind): AnyProvider | undefined {
  return providers.get(kind);
}

/** Desfaz todos os registros (testes). */
export function clearDimProviders(): void {
  providers.clear();
  builtinsDone = false;
}

/**
 * Sujeito selecionado: primeiro procura o id em `project.elements` (provedor do `kind` do elemento) e, se não for
 * elemento, tenta os sujeitos fora dele na ordem de `NON_ELEMENT_KINDS` (linha de detalhe, linha de perímetro, grade).
 * O provedor decide, pelo id recebido, se aquele sujeito é dele.
 */
function resolveSelection(ctx: DimContext, id: Id): Resolved | null {
  const el = ctx.project.elements[id];
  if (el) {
    const provider = providers.get(el.kind) as DimProvider<unknown> | undefined;
    if (!provider?.selectionSubject) return null;
    const subject = provider.selectionSubject(ctx.project, id, ctx.levelId);
    return subject === null ? null : { provider, subject };
  }
  for (const kind of NON_ELEMENT_KINDS) {
    const provider = providers.get(kind) as DimProvider<unknown> | undefined;
    if (!provider?.selectionSubject) continue;
    const subject = provider.selectionSubject(ctx.project, id, ctx.levelId);
    if (subject !== null) return { provider, subject };
  }
  return null;
}

/**
 * Cotas do que está selecionado: só com UM sujeito selecionado, com provedor registrado e `showOnSelection` ligado.
 */
export function selectionDims(ctx: DimContext, ids: readonly Id[]): TempDim[] {
  if (ids.length !== 1 || !ctx.settings.showOnSelection) return [];
  const resolved = resolveSelection(ctx, ids[0]!);
  return resolved ? resolved.provider.compute(ctx, resolved.subject) : [];
}

/**
 * Cotas de um sujeito fora de `project.elements` montado pela própria ferramenta (ex.: o trecho selecionado no
 * rascunho do Perímetro, que não tem id no projeto). As ferramentas chamam isto direto em `tempDims()`.
 */
export function subjectDims<S>(ctx: DimContext, kind: NonElementKind, subject: S): TempDim[] {
  const provider = providers.get(kind) as DimProvider<S> | undefined;
  return provider ? provider.compute(ctx, subject) : [];
}

/** Registra os provedores que acompanham o Hestia. Idempotente; chamada na inicialização do editor. */
export function registerBuiltinDimProviders(): void {
  if (builtinsDone) return;
  builtinsDone = true;
  registerDimProvider('door', openingDimProvider);
  registerDimProvider('window', openingDimProvider);
  registerDimProvider('wall', wallDimProvider);
  registerDimProvider('floor', outlineDimProvider);
  registerDimProvider('slab', outlineDimProvider);
  registerDimProvider('ceiling', outlineDimProvider);
  registerDimProvider('roof', outlineDimProvider);
  registerDimProvider('detailLine', detailLineDimProvider);
  registerDimProvider('perimeterLine', perimeterLineDimProvider);
  registerDimProvider('grid', gridDimProvider);
  registerDimProvider('dimension', permanentDimProvider);
}
