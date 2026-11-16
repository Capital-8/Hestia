import type { Id } from './types.ts';
import type { OpeningType } from './openingTypes.ts';
import { openingNominalRef, openingSpanGap } from './openingNominal.ts';
import { childLengths, dividerWidth, resolveLayout } from './openingCompositionLayout.ts';
import { compositionIssue } from './openingCompositionRules.ts';
import type {
  CellNode,
  CompositionNode,
  LeafOptions,
  OpeningComposition,
  ProfilePreset,
  ProfileRef,
  ProfileSpec,
} from './openingComposition.ts';

/**
 * Campos planos do tipo que a composição AUTORAL recebe quando mudam (o motor lê só a composição: sem isto o campo gravava e
 * o vão/peça não mudava). Chaves de `LeafOptions` têm o mesmo nome no tipo e na opção da célula de folha.
 */
export const OPTION_KEYS = [
  'leafStyle', 'handle', 'glassRatio', 'hinges', 'leafThickness', 'leafMaterialId', 'glassKind', 'glassThickness', 'grid',
  'tiltAxis', 'leafSide', 'leafUndercut', 'handleHeight', 'handleInset', 'angle2d', 'angle3d', 'showSwing', 'swingStyle', 'leafPlan',
] as const satisfies readonly (keyof LeafOptions)[];

/**
 * Campos que a composição autoral NÃO acompanha (estrutura ou perfil sem mapeamento 1:1): o diálogo deve travá-los com aviso.
 * `transom`/`sidelights` são células da composição; `frameStyle` troca a seção do perfil; `frameMaterialId` o material dos perfis.
 */
export const CAMPOS_SEM_MAPEAMENTO = ['transom', 'sidelights', 'frameStyle', 'frameMaterialId'] as const satisfies readonly (keyof OpeningType)[];

type Presets = Readonly<Record<Id, ProfilePreset>>;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function withProfile(r: ProfileRef, patch: Partial<ProfileSpec>): ProfileRef {
  return 'inline' in r ? { inline: { ...r.inline, ...patch } } : { presetId: r.presetId, override: { ...r.override, ...patch } };
}

/** Aplica `fn` a cada célula, preservando a identidade dos nós que não mudam. */
function mapCells(n: CompositionNode, fn: (c: CellNode) => CellNode): CompositionNode {
  if (n.kind === 'cell') return fn(n);
  return { ...n, children: n.children.map((ch) => ({ ...ch, node: mapCells(ch.node, fn) })) };
}

/** Opção de folha: grava o valor, ou tira a chave quando o campo do tipo voltou ao padrão (undefined). */
function setOption(o: LeafOptions, key: (typeof OPTION_KEYS)[number], v: unknown): LeafOptions {
  const out: Record<string, unknown> = { ...o };
  if (v === undefined) delete out[key];
  else out[key] = v;
  return out as LeafOptions;
}

/**
 * Reajusta os módulos FIXOS quando o conjunto ficou sem módulo livre (`fill`) ao longo de um eixo: escala proporcional, que
 * preserva a divisão. Com `fill` não mexe em nada (ele absorve a diferença). `cols`/`rows` = luz do nó (m).
 */
function refit(n: CompositionNode, cols: number, rows: number, presets?: Presets): CompositionNode {
  if (n.kind === 'cell') return n;
  const isCols = n.axis === 'cols';
  const total = isCols ? cols : rows;
  let sized = n;
  if (!n.children.some((ch) => ch.size.mode === 'fill')) {
    const avail = total - (n.children.length - 1) * dividerWidth(n, presets);
    const sum = n.children.reduce((a, ch) => a + (ch.size.mode === 'fixed' ? ch.size.value : 0), 0);
    if (sum > 0 && avail > 0) {
      sized = { ...n, children: n.children.map((ch) => (ch.size.mode === 'fixed' ? { ...ch, size: { mode: 'fixed' as const, value: (ch.size.value * avail) / sum } } : ch)) };
    }
  }
  const lens = childLengths(sized, total, presets);
  return { ...sized, children: sized.children.map((ch, i) => ({ ...ch, node: refit(ch.node, isCols ? lens[i]! : cols, isCols ? rows : lens[i]!, presets) })) };
}

/** Luz da raiz (m): a luz de uma célula única de mesmo quadro e vão, sem repetir a conta do batente/peitoril. */
function rootLuz(c: OpeningComposition, presets?: Presets): { cols: number; rows: number } {
  const probe: OpeningComposition = { ...c, layout: { kind: 'cell', id: '_', content: { kind: 'panel', thickness: 0.02 } } };
  const r = resolveLayout(probe, presets).cells[0]!.luz;
  return { cols: r.t1 - r.t0, rows: r.z1 - r.z0 };
}

/** Se a composição deixou de fechar (sem módulo livre num eixo), reescala os módulos fixos pela luz da raiz. */
function refitIfNeeded(c: OpeningComposition, presets?: Presets): OpeningComposition {
  if (!compositionIssue(c, presets)) return c;
  const { cols, rows } = rootLuz(c, presets);
  return { ...c, layout: refit(c.layout, cols, rows, presets) };
}

/**
 * Leva à composição AUTORAL o que mudou nos campos planos do tipo (`prev` → `next`); a divisão em módulos é preservada.
 * Regra do vão: `nominal` recebe `width`/`height`/`nominalRef`/`spanGap` do tipo (só o eixo que mudou, salvo troca de
 * referência ou de folga); o módulo livre (`fill`, ou a folha da referência 'leaf') absorve a diferença e os módulos fixos
 * (bandeira, laterais) ficam como estão; se um eixo não tem módulo livre, os fixos escalam em proporção. Perfil do batente
 * (`frameWidth`, `frameDepth`, `frameDepthMode`), opções de folha/vidro (`OPTION_KEYS`) e alizar vão para a composição.
 * `transom`/`sidelights`/`frameStyle`/`frameMaterialId` não têm mapeamento (ver `CAMPOS_SEM_MAPEAMENTO`). Função pura.
 */
export function syncAuthoredComposition(c: OpeningComposition, prev: OpeningType, next: OpeningType, presets?: Presets): OpeningComposition {
  let out = c;
  const changed = (k: keyof OpeningType): boolean => !same(prev[k], next[k]);

  const refChanged = openingNominalRef(prev) !== openingNominalRef(next) || !same(openingSpanGap(prev), openingSpanGap(next));
  const wChanged = prev.width !== next.width;
  const hChanged = prev.height !== next.height;
  if (refChanged || wChanged || hChanged) {
    const ref = openingNominalRef(next);
    const nominal = {
      ref,
      width: refChanged || wChanged ? next.width : c.nominal.width,
      height: refChanged || hChanged ? next.height : c.nominal.height,
      ...(ref === 'leaf' ? { gap: openingSpanGap(next) } : {}),
      ...(c.nominal.nominalCellId ? { nominalCellId: c.nominal.nominalCellId } : {}),
    };
    out = { ...out, nominal };
    // Sem módulo livre ao longo de um eixo, a soma dos fixos deixa de fechar com o vão: reescala proporcional.
    out = refitIfNeeded(out, presets);
  }

  const fw = next.frameWidth;
  const fd = next.frameDepth;
  const fm = next.frameDepthMode;
  if ((changed('frameWidth') && fw !== undefined && fw > 0) || (changed('frameDepth') && fd !== undefined && fd > 0) || (changed('frameDepthMode') && fm !== undefined)) {
    const patch: Partial<ProfileSpec> = {};
    if (changed('frameWidth') && fw !== undefined && fw > 0) patch.visibleWidth = fw;
    if (changed('frameDepth') && fd !== undefined && fd > 0) patch.depth = fd;
    const frame = { ...out.frame, ...(changed('frameDepthMode') && fm !== undefined ? { depthMode: fm } : {}) };
    out = { ...out, frame: Object.keys(patch).length ? { ...frame, profile: withProfile(frame.profile, patch) } : frame };
    out = refitIfNeeded(out, presets);
  }

  const keys = OPTION_KEYS.filter((k) => changed(k));
  if (keys.length) {
    out = {
      ...out,
      layout: mapCells(out.layout, (cell) => {
        const ct = cell.content;
        if (ct.kind === 'leaf') return { ...cell, content: { ...ct, options: keys.reduce((o, k) => setOption(o, k, next[k]), ct.options) } };
        if (ct.kind !== 'glass') return cell;
        const g = { ...ct.glass };
        if (keys.includes('glassKind') && next.glassKind !== undefined) g.kind = next.glassKind;
        if (keys.includes('glassThickness') && next.glassThickness !== undefined && next.glassThickness > 0) g.thickness = next.glassThickness;
        return { ...cell, content: { kind: 'glass', glass: g } };
      }),
    };
  }

  if (changed('casing')) {
    const k = next.casing;
    const { casing: old, ...rest } = out;
    out = k ? { ...rest, casing: { setback: 0, ...old, faces: k.sides ?? old?.faces ?? 'both', width: k.width, thickness: k.thickness } } : rest;
  }
  return out;
}
