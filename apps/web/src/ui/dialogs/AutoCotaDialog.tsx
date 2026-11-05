import { useState, type ReactElement } from 'react';
import type { AutoCotaOptions, LadoCota } from '@hestia/engine';
import {
  OPENING_DIM_REFS,
  OPENING_DIM_REF_LABELS,
  WALL_DIM_REFS,
  WALL_DIM_REF_LABELS,
  dimensionSettingsOf,
  type OpeningDimRef,
  type WallDimRef,
} from '@hestia/model';
import { useT } from '../../editor/i18n.ts';
import { editor } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { Check, NumField, Row } from '../fields.tsx';
import { Dialog } from './Dialog.tsx';

/** Critérios das cotas automáticas, no modelo do ArquiFácil: o que cotar, por onde medir e em quais lados. */
export function AutoCotaDialog(): ReactElement {
  const { t } = useT();
  const [geral, setGeral] = useState(true);
  const [geometria, setGeometria] = useState(true);
  const [paredes, setParedes] = useState(true);
  const [aberturas, setAberturas] = useState(true);
  const padroes = dimensionSettingsOf(editor.project);
  const [modo, setModo] = useState<OpeningDimRef>(padroes.openingRef);
  const [referencia, setReferencia] = useState<WallDimRef>(padroes.wallRef);
  const [lados, setLados] = useState<'todos' | LadoCota>('todos');
  const [somenteExternas, setSomenteExternas] = useState(true);
  const [offset, setOffset] = useState(0.6);
  const [espacamento, setEspacamento] = useState(0.45);
  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
  const gerar = (): void => {
    const opts: AutoCotaOptions = {
      lados,
      geral,
      geometria,
      paredes,
      aberturas,
      openingRef: modo,
      wallRef: referencia,
      somenteExternas,
      offset,
      espacamento,
    };
    editor.cotasAutomaticasDaPlanta(opts);
    close();
  };
  return (
    <Dialog
      title={t('dlm_autocota')}
      sub={t('dlm_autocota_sub')}
      onClose={close}
      size="narrow"
      footer={
        <>
          <button className="btn" onClick={close}>{t('dlm_btn_cancel')}</button>
          <button className="btn primary" onClick={gerar}>{t('dlm_autocota_generate')}</button>
        </>
      }
    >
      <h3 style={{ fontSize: 12, margin: '4px 0 6px' }}>{t('dlm_autocota_what')}</h3>
      <div style={{ display: 'grid', gap: 4, marginBottom: 10 }}>
        <Check id="ac-geral" checked={geral} onChange={setGeral}>{t('dlm_autocota_total')}</Check>
        <Check id="ac-geometria" checked={geometria} onChange={setGeometria}>{t('dlm_autocota_outline')}</Check>
        <Check id="ac-paredes" checked={paredes} onChange={setParedes}>{t('dlm_autocota_walls')}</Check>
        <Check id="ac-aberturas" checked={aberturas} onChange={setAberturas}>{t('dlm_autocota_openings')}</Check>
      </div>

      <Row label={t('dlm_autocota_by')} htmlFor="ac-modo">
        <select id="ac-modo" className="select" value={modo} onChange={(e) => setModo(e.target.value as OpeningDimRef)} disabled={!aberturas}>
          {OPENING_DIM_REFS.map((r) => <option key={r} value={r}>{OPENING_DIM_REF_LABELS[r]}</option>)}
        </select>
      </Row>

      <h3 style={{ fontSize: 12, margin: '12px 0 6px' }}>{t('dlm_autocota_wallref')}</h3>
      <Row label={t('dlm_autocota_measure_by')} htmlFor="ac-referencia">
        <select id="ac-referencia" className="select" value={referencia} onChange={(e) => setReferencia(e.target.value as WallDimRef)}>
          {WALL_DIM_REFS.map((r) => <option key={r} value={r}>{WALL_DIM_REF_LABELS[r]}</option>)}
        </select>
      </Row>

      <h3 style={{ fontSize: 12, margin: '12px 0 6px' }}>{t('dlm_autocota_sides')}</h3>
      <Row label={t('dlm_autocota_dimension')} htmlFor="ac-lados">
        <select id="ac-lados" className="select" value={lados} onChange={(e) => setLados(e.target.value as 'todos' | LadoCota)}>
          <option value="todos">{t('dlm_autocota_side_all')}</option>
          <option value="sul">{t('dlm_autocota_side_south')}</option>
          <option value="norte">{t('dlm_autocota_side_north')}</option>
          <option value="oeste">{t('dlm_autocota_side_west')}</option>
          <option value="leste">{t('dlm_autocota_side_east')}</option>
        </select>
      </Row>
      <Row label={t('dlm_autocota_offset')} htmlFor="ac-offset">
        <NumField id="ac-offset" value={offset} min={0.1} quantity="length" onCommit={setOffset} />
      </Row>
      <Row label={t('dlm_autocota_spacing')} htmlFor="ac-espaco">
        <NumField id="ac-espaco" value={espacamento} min={0.1} quantity="length" onCommit={setEspacamento} />
      </Row>
      <div style={{ marginTop: 6 }}>
        <Check id="ac-externas" checked={somenteExternas} onChange={setSomenteExternas}>{t('dlm_autocota_exterior')}</Check>
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        {t('dlm_autocota_hint')}
      </p>
    </Dialog>
  );
}
