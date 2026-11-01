import type { ReactElement } from 'react';
import {
  DIM_FAMILY_PADRAO,
  dimensionFamiliesOf,
  dimensionFormatStyle,
  dimensionStyleFor,
  dimensionStyleOf,
  dimensionValue,
  formatDimension,
  isElementRef,
  levelDimensions,
  type AnnotationCommand,
  type Dimension,
  type Project,
} from '@hestia/model';
import { dimElementRefLabel, drivenEditCommands, eqChainCommands, mergeRefCommands } from '@hestia/tools';
import { editor, useProject } from '../editor/controller.ts';
import { useUi } from '../editor/state.ts';
import { Check, Group, NumField, Row, TextField } from './fields.tsx';
import { useUnits } from './useUnits.ts';

interface Props {
  dim: Dimension;
  /** Cota de corte/elevação: o par `(t,z)` vale como está (sem refs da planta, sem mover elementos). */
  section?: boolean;
  nota: (c: AnnotationCommand) => void;
  edit: (run: () => void) => void;
}

const PRECISOES = [0, 1, 2, 3] as const;
const TICKS: Array<[NonNullable<Dimension['tickStyle']>, string]> = [['slash', 'Traço'], ['arrow', 'Seta'], ['dot', 'Ponto']];

/** Rótulo curto da referência de uma ponta ("Parede · Face 2"), ou "Livre" quando a ponta não está presa a nada. */
function refLabel(p: Project, ref: NonNullable<Dimension['refs']>['a']): string {
  if (!ref) return 'Livre (ponto fixo)';
  if (!isElementRef(ref)) return 'Parede · extremidade';
  const el = p.elements[ref.elementId];
  if (!el) return 'Elemento removido';
  const tipo = el.kind === 'wall' ? 'Parede' : el.kind === 'door' ? 'Porta' : el.kind === 'window' ? 'Janela' : 'Elemento';
  return `${tipo} · ${dimElementRefLabel(ref)}`;
}

/**
 * Propriedades da cota linear, no mesmo padrão dos demais elementos: Restrições (trava, EQ, referências), Dimensões
 * (valor editável move o elemento), Texto, Gráficos (família) e Identidade. Tudo grava por comando e desfaz.
 */
export function DimensionProps({ dim, section, nota, edit }: Props): ReactElement {
  const p = useProject();
  const units = useUnits();
  const levelId = useUi((s) => s.levelId);
  const patch = (pt: Partial<Omit<Dimension, 'id'>>): void => edit(() => nota({ type: 'updateDimension', levelId, id: dim.id, patch: pt }));
  const estilo = dimensionFormatStyle(dimensionStyleFor(p.settings, dim));
  const medido = dimensionValue(section ? { elements: {} } : p, dim);
  const valorTexto = formatDimension({ ...dim, text: undefined }, medido, units, estilo);
  const associada = !section && !!dim.refs?.a && !!dim.refs?.b;
  const familiasSalvas = dimensionFamiliesOf(p.settings);
  const familias = familiasSalvas.some((f) => f.id === DIM_FAMILY_PADRAO) ? familiasSalvas : [{ id: DIM_FAMILY_PADRAO, name: 'Padrão', ...dimensionStyleOf(p.settings) }, ...familiasSalvas];
  const cadeia = dim.chainId ? levelDimensions(p, levelId).filter((d) => d.chainId === dim.chainId) : [];
  const substituido = !!dim.text?.trim();

  const alterarValor = (v: number): void => {
    const r = drivenEditCommands(p, dim, v);
    if (!r.ok) { useUi.setState({ status: r.reason }); return; }
    if (r.commands.length) editor.applyCommands('Editar cota', r.commands as never);
  };
  const travar = (on: boolean): void => patch(on ? { locked: true, lockedValue: medido } : { locked: undefined, lockedValue: undefined });
  const ligarEq = (on: boolean): void => {
    try {
      const cmds = eqChainCommands(p, dim.chainId!, on);
      editor.store.transaction(on ? 'Ligar EQ da cadeia' : 'Desligar EQ da cadeia', () => { for (const c of cmds) editor.store.exec(c); });
    } catch (e) {
      useUi.setState({ status: e instanceof Error ? e.message : 'Não foi possível igualar a cadeia.' });
    }
  };
  const juntar = (side: 'a' | 'b'): void => {
    const r = mergeRefCommands(p, levelId, dim.id, side);
    if ('error' in r) { useUi.setState({ status: r.error }); return; }
    editor.applyCommands('Remover referência da cota', r.commands);
  };
  const escolher = (slot: 'a' | 'b', add = false): void =>
    useUi.setState({ dimRefPick: { dimId: dim.id, slot, ...(add ? { add: true } : {}) }, status: add ? 'Clique na parede, porta ou janela que será a nova referência (Esc cancela).' : 'Clique no elemento para a nova referência (Esc cancela).' });
  const sel = (id: string, value: string, onChange: (v: string) => void, opts: Array<[string, string]>): ReactElement => (
    <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
  );

  return (
    <>
      <Group title="Restrições">
        <Row label="Travada" htmlFor="p-dlock">
          <Check id="p-dlock" checked={dim.locked === true} disabled={!associada} onChange={travar}>Mantém {valorTexto}</Check>
        </Row>
        {dim.chainId && cadeia.length > 1 ? (
          <>
            <Row label="Igualdade (EQ)" htmlFor="p-deq"><Check id="p-deq" checked={dim.eq === true} onChange={ligarEq}>Trechos iguais</Check></Row>
            <Row label="Trechos da cadeia" readOnly><span className="val">{cadeia.length}</span></Row>
          </>
        ) : null}
        <Row label="Direção" htmlFor="p-dmode">
          {sel('p-dmode', dim.mode ?? 'aligned', (v) => patch({ mode: v as Dimension['mode'] }), [['aligned', 'Alinhada'], ['horizontal', 'Horizontal'], ['vertical', 'Vertical']])}
        </Row>
      </Group>
      {!section ? (
        <Group title="Referências">
          <Row label="Início" readOnly><span className="val" title={refLabel(p, dim.refs?.a)}>{refLabel(p, dim.refs?.a)}</span></Row>
          <div className="prow"><span /><button className="chiplink" title="Escolher outro elemento para a ponta inicial" onClick={() => escolher('a')}>Trocar início…</button></div>
          <Row label="Fim" readOnly><span className="val" title={refLabel(p, dim.refs?.b)}>{refLabel(p, dim.refs?.b)}</span></Row>
          <div className="prow"><span /><button className="chiplink" title="Escolher outro elemento para a ponta final" onClick={() => escolher('b')}>Trocar fim…</button></div>
          <div className="prow"><span /><button className="chiplink" title="Divide a cota numa nova referência entre as pontas" onClick={() => escolher('a', true)}>Adicionar referência…</button></div>
          {cadeia.length > 1 ? <div className="prow"><span /><button className="chiplink" title="Junta esta cota com o trecho seguinte da cadeia" onClick={() => juntar('b')}>Remover referência do fim</button></div> : null}
        </Group>
      ) : null}
      <Group title="Dimensões">
        <Row label="Valor" htmlFor="p-dvalue">
          {associada && !dim.locked ? (
            <NumField id="p-dvalue" value={medido} quantity="length" min={0.001} onCommit={alterarValor} />
          ) : (
            <span className="val" title={dim.locked ? 'Cota travada: destrave para mudar o valor' : 'Cota livre: não move elementos'}>{valorTexto}</span>
          )}
        </Row>
        <Row label="Deslocamento" htmlFor="p-doff"><NumField id="p-doff" value={dim.offset} quantity="length" onCommit={(v) => patch({ offset: v })} /></Row>
        {dim.textAt ? <Row label="Texto"><button className="chiplink" onClick={() => patch({ textAt: undefined })}>Centralizar texto</button></Row> : null}
      </Group>
      <Group title="Texto da cota">
        <Row label="Valor do texto" htmlFor="p-dtmode">
          {sel('p-dtmode', substituido ? 'text' : 'real', (v) => patch(v === 'text' ? { text: dim.text?.trim() || valorTexto } : { text: undefined }), [['real', 'Usar valor real'], ['text', 'Substituir por texto']])}
        </Row>
        {substituido ? (
          <Row label="Texto" htmlFor="p-dtext"><TextField id="p-dtext" value={dim.text ?? ''} onCommit={(v) => patch({ text: v.trim() === '' ? undefined : v })} /></Row>
        ) : (
          <>
            <Row label="Prefixo" htmlFor="p-dprefix"><TextField id="p-dprefix" value={dim.prefix ?? ''} onCommit={(v) => patch({ prefix: v })} /></Row>
            <Row label="Sufixo" htmlFor="p-dsuffix"><TextField id="p-dsuffix" value={dim.suffix ?? ''} onCommit={(v) => patch({ suffix: v })} /></Row>
          </>
        )}
      </Group>
      <Group title="Gráficos">
        <Row label="Família" htmlFor="p-dfamily">
          {sel('p-dfamily', dim.familyId ?? DIM_FAMILY_PADRAO, (id) => patch({ familyId: id === DIM_FAMILY_PADRAO ? undefined : id }), familias.map((f): [string, string] => [f.id, f.name]))}
        </Row>
        <div className="prow"><span /><button className="chiplink" title="Abrir a família desta cota no editor de famílias" onClick={() => useUi.setState({ dialog: 'dimensionFamilies', dimFamilyFocus: dim.familyId ?? DIM_FAMILY_PADRAO })}>Editar família…</button></div>
        <Row label="Marca" htmlFor="p-dtick">{sel('p-dtick', dim.tickStyle ?? 'slash', (v) => patch({ tickStyle: v as Dimension['tickStyle'] }), TICKS)}</Row>
        <Row label="Altura do texto" htmlFor="p-dheight">{/* units-ok: altura em mm de papel */}<NumField id="p-dheight" value={dim.textHeight ?? 2.5} decimals={1} unit="mm" min={0.5} onCommit={(v) => patch({ textHeight: v })} /></Row>
        <Row label="Unidade" htmlFor="p-dunit">{sel('p-dunit', dim.unit ?? 'project', (v) => patch({ unit: v as Dimension['unit'] }), [['project', 'Projeto'], ['m', 'Metros'], ['cm', 'Centímetros'], ['mm', 'Milímetros']])}</Row>
        <Row label="Casas decimais" htmlFor="p-dprec">{sel('p-dprec', String(dim.precision ?? 2), (v) => patch({ precision: Number(v) as 0 | 1 | 2 | 3 }), PRECISOES.map((n): [string, string] => [String(n), String(n)]))}</Row>
      </Group>
      <Group title="Dados de identidade" open={false}>
        <Row label="Vista" readOnly><span className="val">{section ? 'Corte/elevação' : 'Planta'}</span></Row>
        <Row label="Associada a" readOnly><span className="val">{associada ? 'Elementos do modelo' : 'Nada (cota livre)'}</span></Row>
        {dim.chainId ? <Row label="Cadeia" readOnly><span className="val">{cadeia.length} trechos</span></Row> : null}
      </Group>
    </>
  );
}

