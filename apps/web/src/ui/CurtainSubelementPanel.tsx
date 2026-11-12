// Painel do subelemento da parede cortina (ADR 0056, fase 2): liga o estado do editor (`subElemento`, escolhido com o Tab ou o clique)
// ao componente puro `SubelementoCortina`. Resolve a parede com as sobrescritas já remapeadas (§4.4) para saber o que a linha, o
// segmento ou a célula têm hoje; nada aqui grava sem passar por um comando.

import type { ReactElement } from 'react';
import {
  casarGerada,
  curtainPanelTypesOf,
  isWall,
  mullionTypesOf,
  resolverParede,
  type Command,
  type Id,
  type LineRef,
  type ParedeResolvida,
  type Project,
  type SegmentRef,
  type SubelementoCortina as SubelementoSelecionado,
} from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { SubelementoCortina } from './CurtainSubelementProps.tsx';

type Eixo = 'u' | 'v';

/** Mesma linha? Extra pelo id; gerada pelo eixo e pelo índice resolvido contra a grade de hoje. */
export function linhaResolvida(r: ParedeResolvida, ref: LineRef): { eixo: Eixo; indice: number } | null {
  if ('added' in ref) {
    for (const eixo of ['u', 'v'] as const) {
      const indice = r[eixo].findIndex((l) => l.added === ref.added);
      if (indice >= 0) return { eixo, indice };
    }
    return null;
  }
  const base = ref.axis === 'u' ? r.geradasU : r.geradasV;
  const A = ref.axis === 'u' ? r.L : r.H;
  const g = casarGerada(ref, A, base);
  if (g < 0) return null;
  const indice = r[ref.axis].findIndex((l) => l.added === undefined && l.gerada === g);
  return indice >= 0 ? { eixo: ref.axis, indice } : null;
}

function mesmaLinha(r: ParedeResolvida, a: LineRef, b: LineRef): boolean {
  const ra = linhaResolvida(r, a);
  const rb = linhaResolvida(r, b);
  return ra !== null && rb !== null && ra.eixo === rb.eixo && ra.indice === rb.indice;
}

/** Dados que o painel mostra do subelemento, ou null se ele deixou de existir (parede apagada, grade mudou). */
export type DadosSubelemento =
  | { kind: 'line'; wallId: Id; line: LineRef; montante: Id | null | undefined; travada: boolean }
  | { kind: 'segment'; wallId: Id; line: LineRef; k: number; removido: boolean }
  | { kind: 'cell'; wallId: Id; i: number; j: number; painel: Id; sobrescrita: boolean };

export function dadosDoSubelemento(p: Project, sub: SubelementoSelecionado): DadosSubelemento | null {
  const w = p.elements[sub.wallId];
  if (!w || !isWall(w)) return null;
  const r = resolverParede(p, w);
  if (!r) return null;
  if (sub.kind === 'line') {
    const lr = linhaResolvida(r, sub.line);
    if (!lr) return null;
    const linha = r[lr.eixo][lr.indice]!;
    return { kind: 'line', wallId: sub.wallId, line: sub.line, montante: linha.montante, travada: linha.locked === true };
  }
  if (sub.kind === 'segment') {
    const { line, k } = sub.segment;
    if (!linhaResolvida(r, line)) return null;
    const removido = r.segmentos.some((s: SegmentRef) => s.k === k && mesmaLinha(r, s.line, line));
    return { kind: 'segment', wallId: sub.wallId, line, k, removido };
  }
  const { i, j } = sub.cell;
  if (i < 0 || j < 0 || i >= r.nu || j >= r.nv) return null;
  const proprio = r.celulas.find((c) => c.key.i === i && c.key.j === j && c.override.kind === 'panel');
  const padrao = (w.curtain?.defaultPanelTypeId ?? (p.wallTypes[w.typeId] as { curtain?: { defaultPanelTypeId: Id } }).curtain?.defaultPanelTypeId) as Id;
  const painel = proprio && proprio.override.kind === 'panel' ? proprio.override.panelTypeId : padrao;
  return { kind: 'cell', wallId: sub.wallId, i, j, painel, sobrescrita: proprio !== undefined };
}

/** Seção do painel de Propriedades: aparece só quando há um subelemento de cortina escolhido. */
export function CurtainSubelementPanel(): ReactElement | null {
  const { lang } = useT();
  const sub = useUi((s) => s.subElemento);
  const p = useProject();
  if (!sub) return null;
  const dados = dadosDoSubelemento(p, sub);
  if (!dados) return null;
  const onCommand = (c: Command): void => {
    editor.store.exec(c, undefined, lang);
  };
  const montantes = Object.values(mullionTypesOf(p));
  const paineis = Object.values(curtainPanelTypesOf(p));
  return (
    <div className="group">
      {dados.kind === 'line' && <SubelementoCortina {...dados} montantes={montantes} onCommand={onCommand} />}
      {dados.kind === 'segment' && <SubelementoCortina {...dados} onCommand={onCommand} />}
      {dados.kind === 'cell' && <SubelementoCortina {...dados} paineis={paineis} onCommand={onCommand} />}
    </div>
  );
}
