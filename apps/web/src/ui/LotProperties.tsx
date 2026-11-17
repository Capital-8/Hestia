import { useMemo, type ReactElement } from 'react';
import { defaultLotFamilyIdOf, dimensionStyleOf, isLot, lotFamiliesOf, LOTE_LIMITES, type Command, type Lot, type PapelLadoLote } from '@hestia/model';
import { useUi } from '../editor/state.ts';
import { TypeSelector } from './TypeSelector.tsx';
import { editor, useProject } from '../editor/controller.ts';
import { fmtNum, useT, type Dict } from '../editor/i18n.ts';
import { Check, Group, NumField, Row, TextField } from './fields.tsx';
import { useFormat } from './useUnits.ts';
import { comLadoAlterado, comLimite, fracaoParaPercentual, ladosDoLote, leiturasDoLote, percentualParaFracao } from './terrainPropsModel.ts';
import { aplicarEmTodos, comum, CorRow, Leitura } from './terrainPanelParts.tsx';

type PatchLote = Extract<Command, { type: 'updateLot' }>['patch'];
type ChaveLimite = 'taxaOcupacaoMax' | 'coefAproveitamentoMax' | 'permeabilidadeMin' | 'gabaritoMax';

const PAPEIS: ReadonlyArray<{ value: PapelLadoLote; chave: keyof Dict }> = [
  { value: 'frente', chave: 'ui_lt_papel_frente' },
  { value: 'lateral', chave: 'ui_lt_papel_lateral' },
  { value: 'fundo', chave: 'ui_lt_papel_fundo' },
];

/** Cor com que o lote é desenhado quando não tem `color` (cor DXF ACI 1, vermelho). */
const COR_PADRAO = '#ff0000';

/** Leituras e tabela de lados de UM lote (área, perímetro, área edificável; lado a lado: comprimento, azimute, papel e recuo editáveis). */
function LoteLados({ lote }: { lote: Lot }): ReactElement {
  const { t, lang } = useT();
  const p = useProject();
  const fmt = useFormat();
  const leituras = useMemo(() => leiturasDoLote(lote), [lote]);
  const lados = useMemo(() => ladosDoLote(p, lote), [p, lote]);
  const gravar = (i: number, campos: Partial<Lot['lados'][number]>): void =>
    aplicarEmTodos([lote.id], t('ui_lt_rotulo_undo_lados'), (id) => ({ type: 'setLotContorno', id, contorno: lote.contorno, lados: comLadoAlterado(lote.lados, i, campos) }));
  return (
    <>
      <Leitura label={t('ui_lt_area')} valor={fmt('area', leituras.area)} />
      <Leitura label={t('ui_lt_perimetro')} valor={fmt('length', leituras.perimetro)} />
      <Leitura label={t('ui_lt_area_edificavel')} valor={fmt('area', leituras.areaEdificavel)} />
      {lados.map((l) => {
        const rotulo = `${l.indice + 1}: ${fmt('length', l.comprimento)} · ${fmtNum(l.azimute, 1, lang)}°`;
        return (
          <Row key={l.indice} label={rotulo}>
            <select aria-label={`${t('ui_lt_col_papel')} ${l.indice + 1}`} className="select" value={l.papel} onChange={(e) => gravar(l.indice, { papel: e.target.value as PapelLadoLote })}>
              {PAPEIS.map((o) => <option key={o.value} value={o.value}>{t(o.chave)}</option>)}
            </select>
            <NumField quantity="length" min={0} max={LOTE_LIMITES.recuoMax} value={l.recuo} onCommit={(v) => gravar(l.indice, { recuo: v })} />
          </Row>
        );
      })}
    </>
  );
}

/**
 * Propriedades do lote (A.3 e A.6): nome, limites da lei local (taxa de ocupação, coeficiente, permeabilidade, gabarito: vazio = sem limite),
 * mostrar a área edificável, cor, e por lote as leituras (área, perímetro, área edificável) com a tabela de lados editável (papel e recuo).
 * A linha de propriedade e o texto dos lados têm família (`TypeSelector` e "Editar tipo"). Mudar papel ou recuo grava `setLotContorno` (mesmo contorno, outros lados), um passo de desfazer.
 */
export function LotProperties({ lots }: { lots: Lot[] }): ReactElement {
  const { t } = useT();
  const p = useProject();
  const ids = lots.map((l) => l.id);
  const patch = (campos: PatchLote): void => aplicarEmTodos(ids, t('ui_lt_rotulo_undo'), (id) => ({ type: 'updateLot', id, patch: campos }));
  const limite = (chave: ChaveLimite, valor: number | undefined): void =>
    aplicarEmTodos(ids, t('ui_lt_rotulo_undo'), (id) => {
      const l = editor.project.elements[id];
      return { type: 'updateLot', id, patch: { limites: comLimite(isLot(l) ? l.limites : {}, chave, valor) } };
    });
  const fam = comum(lots, (l) => l.familyId ?? defaultLotFamilyIdOf(p.settings));
  const nome = comum(lots, (l) => l.name);
  const edificavel = comum(lots, (l) => l.mostrarEdificavel);
  const cor = comum(lots, (l) => l.color ?? '');
  const lim = (chave: ChaveLimite): { value: number | null; mixed: boolean } => {
    const c = comum(lots, (l) => l.limites[chave] ?? null);
    return c;
  };
  const taxa = lim('taxaOcupacaoMax');
  const coef = lim('coefAproveitamentoMax');
  const perm = lim('permeabilidadeMin');
  const gab = lim('gabaritoMax');
  const pct = (v: number | null): number | null => (v === null ? null : fracaoParaPercentual(v));
  return (
    <>
      <Group title={t('ui_fam_prop_lot')} stateKey="lote-familia">
        <TypeSelector
          triggerId="prop-lt-family"
          label={t('ui_fam_family_lot')}
          categoryLabel={t('ui_fam_family_lot')}
          options={lotFamiliesOf(p.settings).map((f) => ({ id: f.id, name: f.name, code: '', family: t('ui_fam_family_lot'), subject: { kind: 'dimension' as const, style: dimensionStyleOf(p.settings) } }))}
          selectedId={fam.mixed ? null : fam.value}
          editDisabled={fam.mixed}
          onSelect={(id) => patch({ familyId: id })}
          onEdit={() => useUi.setState({ dialog: 'lotFamilies', dialogArg: fam.value })}
        />
      </Group>
      <Group title={t('prc_pgrp_identity')} stateKey="lote-id">
        <Row label={t('ui_tn_p_nome')} htmlFor="p-lt-nome"><TextField id="p-lt-nome" value={nome.value} mixed={nome.mixed} onCommit={(v) => v.trim() !== '' && patch({ name: v.trim() })} /></Row>
        <Row label={t('ui_lt_edificavel')} htmlFor="p-lt-edif"><Check id="p-lt-edif" checked={edificavel.value} mixed={edificavel.mixed} onChange={(v) => patch({ mostrarEdificavel: v })} /></Row>
        <CorRow id="p-lt-cor" value={cor.mixed || cor.value === '' ? undefined : cor.value} padrao={COR_PADRAO} onChange={(v) => patch({ color: v })} />
      </Group>
      <Group title={t('ui_lt_g_limites')} stateKey="lote-limites">
        <Row label={t('ui_lt_taxa')} htmlFor="p-lt-taxa"><NumField id="p-lt-taxa" suffix="%" decimals={2} min={0.01} max={100} placeholder={t('ui_lt_sem_limite')} value={pct(taxa.value)} mixed={taxa.mixed} onCommit={(v) => limite('taxaOcupacaoMax', percentualParaFracao(v))} onClear={() => limite('taxaOcupacaoMax', undefined)} /></Row>
        <Row label={t('ui_lt_coef')} htmlFor="p-lt-coef"><NumField id="p-lt-coef" decimals={2} min={0.01} max={100} placeholder={t('ui_lt_sem_limite')} value={coef.value} mixed={coef.mixed} onCommit={(v) => limite('coefAproveitamentoMax', v)} onClear={() => limite('coefAproveitamentoMax', undefined)} /></Row>
        <Row label={t('ui_lt_perm')} htmlFor="p-lt-perm"><NumField id="p-lt-perm" suffix="%" decimals={2} min={0.01} max={100} placeholder={t('ui_lt_sem_limite')} value={pct(perm.value)} mixed={perm.mixed} onCommit={(v) => limite('permeabilidadeMin', percentualParaFracao(v))} onClear={() => limite('permeabilidadeMin', undefined)} /></Row>
        <Row label={t('ui_lt_gabarito')} htmlFor="p-lt-gab"><NumField id="p-lt-gab" quantity="length" min={0.01} placeholder={t('ui_lt_sem_limite')} value={gab.value} mixed={gab.mixed} onCommit={(v) => limite('gabaritoMax', v)} onClear={() => limite('gabaritoMax', undefined)} /></Row>
      </Group>
      {lots.map((l) => (
        <Group key={l.id} title={lots.length === 1 ? t('ui_lt_g_lados') : `${t('ui_lt_g_lados')}: ${l.name}`} stateKey="lote-lados">
          <LoteLados lote={l} />
        </Group>
      ))}
    </>
  );
}
