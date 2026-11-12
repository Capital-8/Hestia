// Painel do subelemento da parede cortina (ADR 0056, fase 2): liga o estado do editor (`subElemento`, escolhido com o Tab ou o clique)
// ao componente puro `SubelementoCortina`. Resolve a parede com as sobrescritas já remapeadas (§4.4) para saber o que a linha, o
// segmento ou a célula têm hoje; nada aqui grava sem passar por um comando.

import type { ReactElement } from 'react';
import {
  casarGerada,
  curtainPanelTypesOf,
  type CellKey,
  isWall,
  mullionTypesOf,
  resolverParede,
  type Command,
  type Id,
  type LineRef,
  type OpeningCellOverride,
  type ParedeResolvida,
  type Project,
  type SegmentRef,
  type SubelementoCortina as SubelementoSelecionado,
} from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { SubelementoCortina } from './CurtainSubelementProps.tsx';
import { openingOptions } from './typeOptions.ts';

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

/** Porta ou janela da célula, como o painel a mostra (decisão 0056, §7.7). */
export interface DadosEsquadriaCelula {
  tipo: 'door' | 'window';
  openingTypeId: Id;
  flipHand: boolean;
  flipFacing: boolean;
  mark: string;
  fit: 'cell' | 'grid';
  align: 'center' | 'start' | 'end';
  /** Peitoril por instância (m); `null` = a base da célula. */
  peitoril: number | null;
}

/** Dados que o painel mostra do subelemento, ou null se ele deixou de existir (parede apagada, grade mudou). */
export type DadosSubelemento =
  | { kind: 'line'; wallId: Id; line: LineRef; montante: Id | null | undefined; travada: boolean }
  | { kind: 'segment'; wallId: Id; line: LineRef; k: number; removido: boolean }
  | { kind: 'cell'; wallId: Id; i: number; j: number; painel: Id; sobrescrita: boolean; comEsquadria: boolean }
  | { kind: 'opening'; wallId: Id; i: number; j: number; esquadria: DadosEsquadriaCelula };

/** Esquadria (sobrescrita `opening`) da região que contém a célula (i, j); a região inteira conta (§5.2). */
function esquadriaDaRegiao(r: ParedeResolvida, i: number, j: number): OpeningCellOverride | undefined {
  const rc = r.canon[i * r.nv + j];
  const entrada = r.celulas.find((c) => c.override.kind === 'opening' && r.canon[c.key.i * r.nv + c.key.j] === rc);
  return entrada && entrada.override.kind === 'opening' ? entrada.override : undefined;
}

/** Dados da esquadria para o painel (tipo de porta ou de janela, inversões, marca, modo, alinhamento e peitoril). */
function dadosDaEsquadria(p: Project, ov: OpeningCellOverride): DadosEsquadriaCelula {
  return {
    tipo: p.openingTypes[ov.openingTypeId]?.kind === 'window' ? 'window' : 'door',
    openingTypeId: ov.openingTypeId,
    flipHand: ov.flipHand,
    flipFacing: ov.flipFacing,
    mark: ov.mark,
    fit: ov.fit ?? 'cell',
    align: ov.align ?? 'center',
    peitoril: ov.sillOverride ?? null,
  };
}

/** Célula do subelemento de célula ou de esquadria (a chave que o estado guarda); `null` para linha e segmento. */
export function celulaDoSubelemento(sub: SubelementoSelecionado): CellKey | null {
  return sub.kind === 'cell' || sub.kind === 'opening' ? sub.cell : null;
}

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
  // A esquadria da célula (se houver) é o próprio subelemento `opening`: o painel dela não tem painel de vidro ou sólido.
  const esquadria = esquadriaDaRegiao(r, i, j);
  if (sub.kind === 'opening') return esquadria ? { kind: 'opening', wallId: sub.wallId, i, j, esquadria: dadosDaEsquadria(p, esquadria) } : null;
  const proprio = r.celulas.find((c) => c.key.i === i && c.key.j === j && c.override.kind === 'panel');
  const padrao = (w.curtain?.defaultPanelTypeId ?? (p.wallTypes[w.typeId] as { curtain?: { defaultPanelTypeId: Id } }).curtain?.defaultPanelTypeId) as Id;
  const painel = proprio && proprio.override.kind === 'panel' ? proprio.override.panelTypeId : padrao;
  if (esquadria) return { kind: 'cell', wallId: sub.wallId, i, j, painel, sobrescrita: false, comEsquadria: true };
  return { kind: 'cell', wallId: sub.wallId, i, j, painel, sobrescrita: proprio !== undefined, comEsquadria: false };
}

/**
 * Chave da célula onde está a esquadria de mesmo tipo e mesma marca, na grade de hoje. A grade pode mudar com um comando
 * (ajustar à porta cria linhas presas e a porta vai para outra célula): o destaque segue a esquadria. `null` se não há
 * uma única esquadria com esses dados.
 */
export function celulaDaEsquadria(p: Project, wallId: Id, openingTypeId: Id, mark: string): CellKey | null {
  const w = p.elements[wallId];
  if (!w || !isWall(w)) return null;
  const r = resolverParede(p, w);
  if (!r) return null;
  const achadas = r.celulas.filter((c) => c.override.kind === 'opening' && c.override.openingTypeId === openingTypeId && c.override.mark === mark);
  return achadas.length === 1 ? achadas[0]!.key : null;
}

/** Seção do painel de Propriedades: aparece só quando há um subelemento de cortina escolhido. */
export function CurtainSubelementPanel(): ReactElement | null {
  const { lang } = useT();
  const sub = useUi((s) => s.subElemento);
  const p = useProject();
  if (!sub) return null;
  const dados = dadosDoSubelemento(p, sub);
  if (!dados) return null;
  const cell = celulaDoSubelemento(sub);
  // Troca o subelemento entre a célula e a esquadria da mesma célula (botões do painel).
  const irParaCelula = (): void => {
    if (cell) useUi.setState({ subElemento: { wallId: dados.wallId, kind: 'cell', cell } });
  };
  const irParaEsquadria = (): void => {
    if (cell) useUi.setState({ subElemento: { wallId: dados.wallId, kind: 'opening', cell } });
  };
  // Um comando recusado pelo modelo (ex.: trocar para um tipo que não cabe na célula) sai na barra de status, no idioma pedido.
  const onCommand = (c: Command): void => {
    const antes = dados.kind === 'opening' ? dados.esquadria : undefined;
    try {
      editor.store.exec(c, undefined, lang);
    } catch (e) {
      useUi.setState({ status: e instanceof Error ? e.message : String(e) });
      return;
    }
    // Remover a esquadria: o subelemento volta à célula, que agora é normal.
    if (c.type === 'removeCellOpening' && dados.kind === 'opening') {
      irParaCelula();
      return;
    }
    // A grade pode ter mudado (tipo, modo ou alinhamento): o destaque vai para a célula nova da mesma esquadria.
    if (c.type === 'updateCellOpening' && antes && dados.kind === 'opening') {
      const nova = celulaDaEsquadria(editor.store.project, dados.wallId, c.patch.openingTypeId ?? antes.openingTypeId, c.patch.mark ?? antes.mark);
      if (nova && (nova.i !== dados.i || nova.j !== dados.j)) useUi.setState({ subElemento: { wallId: dados.wallId, kind: 'opening', cell: nova } });
    }
  };
  const montantes = Object.values(mullionTypesOf(p));
  const paineis = Object.values(curtainPanelTypesOf(p));
  return (
    <div className="group">
      {dados.kind === 'line' && <SubelementoCortina {...dados} montantes={montantes} onCommand={onCommand} />}
      {dados.kind === 'segment' && <SubelementoCortina {...dados} onCommand={onCommand} />}
      {dados.kind === 'cell' && (
        <SubelementoCortina
          {...dados}
          paineis={paineis}
          onSelecionarEsquadria={irParaEsquadria}
          onCommand={onCommand}
        />
      )}
      {dados.kind === 'opening' && (
        <SubelementoCortina
          kind="opening"
          wallId={dados.wallId}
          i={dados.i}
          j={dados.j}
          {...dados.esquadria}
          tipos={openingOptions(p, dados.esquadria.tipo)}
          favoritos={p.settings.favoriteOpeningTypes ?? []}
          onEditarTipo={() => useUi.setState({ dialog: 'openingType', dialogArg: dados.esquadria.openingTypeId })}
          onSelecionarCelula={irParaCelula}
          onCommand={onCommand}
        />
      )}
    </div>
  );
}
