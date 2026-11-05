import type { ReactElement } from 'react';
import { compositionCells, openingCompositionOf, type CellContent, type OpeningFamilyId, type OpeningGlassKind, type OpeningType } from '@hestia/model';
import { NumField } from '../../../fields.tsx';
import { useT, type Dict } from '../../../../editor/i18n.ts';
import { GLASS_KINDS } from '../openingTypeControls.ts';
import {
  comFamilia,
  defineConteudo,
  defineLuz,
  familiasDoTipo,
  tamanhoDaCelula,
  conteudoPadrao,
  type LeafContent,
  type TipoConteudo,
} from './compositionControls.ts';

const TIPOS: ReadonlyArray<readonly [TipoConteudo, keyof Dict]> = [
  ['leaf', 'dlo_o_content_leaf'],
  ['glass', 'dlo_o_content_glass'],
  ['panel', 'dlo_o_cell_panel'],
  ['louver', 'dlo_o_content_louver'],
];

interface Props {
  d: OpeningType;
  onChange: (next: OpeningType) => void;
  cellId: string;
}

/** Editor da célula selecionada: conteúdo, luz (ou preenche) e as opções do conteúdo. A validação fica no painel. */
export function CellEditor({ d, onChange, cellId }: Props): ReactElement | null {
  const { t } = useT();
  const c = openingCompositionOf(d);
  const cell = compositionCells(c).find((x) => x.id === cellId);
  if (!cell) return null;
  const conteudo: CellContent = cell.content;
  const medida = tamanhoDaCelula(c, cell.id);

  return (
    <>
      <div className="field-row">
        <label htmlFor="cel-conteudo">{t('dlo_cell_content')}</label>
        <select id="cel-conteudo" className="select" value={conteudo.kind} onChange={(e) => onChange(defineConteudo(d, cell.id, conteudoPadrao(d, e.target.value as TipoConteudo)))}>
          {TIPOS.map(([v, labelKey]) => <option key={v} value={v}>{t(labelKey)}</option>)}
        </select>
      </div>
      {medida ? (
        <>
          <div className="field-row">
            <label htmlFor="cel-medida">{t('dlo_cell_size')}</label>
            <select id="cel-medida" className="select" value={medida.mode} onChange={(e) => onChange(defineLuz(d, cell.id, e.target.value === 'fill' ? { mode: 'fill' } : { mode: 'fixed', value: 0.4 }))}>
              <option value="fixed">{t('dlo_o_cell_size_fixed')}</option>
              <option value="fill">{t('dlo_o_cell_size_fill')}</option>
            </select>
          </div>
          {medida.mode === 'fixed' ? (
            <div className="field-row">
              <label htmlFor="cel-luz">{t('dlo_cell_width')}</label>
              <NumField id="cel-luz" value={medida.value} quantity="smallLength" min={0.01} onCommit={(v) => onChange(defineLuz(d, cell.id, { mode: 'fixed', value: v }))} />
            </div>
          ) : null}
        </>
      ) : null}
      {conteudo.kind === 'leaf' ? <LeafRows d={d} onChange={onChange} cellId={cell.id} content={conteudo} /> : null}
      {conteudo.kind === 'glass' ? (
        <div className="field-row">
          <label htmlFor="cel-vidro">{t('dlo_f_glass_kind')}</label>
          <select
            id="cel-vidro"
            className="select"
            value={conteudo.glass.kind}
            onChange={(e) => onChange(defineConteudo(d, cell.id, { ...conteudo, glass: { ...conteudo.glass, kind: e.target.value as OpeningGlassKind } }))}
          >
            {GLASS_KINDS.map(([v, labelKey]) => <option key={v} value={v}>{t(labelKey)}</option>)}
          </select>
        </div>
      ) : null}
      {conteudo.kind === 'panel' ? (
        <div className="field-row">
          <label htmlFor="cel-painel">{t('dlo_cell_panel_thickness')}</label>
          <NumField id="cel-painel" value={conteudo.thickness} quantity="smallLength" min={0.001} onCommit={(v) => onChange(defineConteudo(d, cell.id, { ...conteudo, thickness: v }))} />
        </div>
      ) : null}
    </>
  );
}

/** Folha: tipo de abertura (família) e espelhamento da dobradiça. As demais opções de folha ficam no painel Folha do tipo. */
function LeafRows({ d, onChange, cellId, content }: { d: OpeningType; onChange: (next: OpeningType) => void; cellId: string; content: LeafContent }): ReactElement {
  const { t } = useT();
  return (
    <>
      <div className="field-row">
        <label htmlFor="cel-familia">{t('dlo_f_opening_type')}</label>
        <select
          id="cel-familia"
          className="select"
          value={content.family}
          onChange={(e) => onChange(defineConteudo(d, cellId, comFamilia(content, e.target.value as OpeningFamilyId)))}
        >
          {familiasDoTipo(d.kind).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>
      <label className="check" htmlFor="cel-espelho">
        <input id="cel-espelho" type="checkbox" checked={!!content.mirror} onChange={(e) => onChange(defineConteudo(d, cellId, { ...content, mirror: e.target.checked }))} />
        {t('dlo_cell_mirror')}
      </label>
    </>
  );
}
