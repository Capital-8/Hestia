import { useState, type ReactElement } from 'react';
import { parseDxfText, type DxfImportResult } from '@hestia/io';
import type { CadUnit } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { importCadFile } from '../../editor/cadImport.ts';
import { useUi } from '../../editor/state.ts';
import { useT, type Dict } from '../../editor/i18n.ts';
import { Dialog } from './Dialog.tsx';

/** Unidades do DXF, com a chave do rótulo do seletor. */
const UNITS: ReadonlyArray<{ value: CadUnit; labelKey: keyof Dict }> = [
  { value: 'mm', labelKey: 'dlc_unit_mm' },
  { value: 'cm', labelKey: 'dlc_unit_cm' },
  { value: 'm', labelKey: 'dlc_unit_m' },
  { value: 'ft', labelKey: 'dlc_unit_ft' },
  { value: 'in', labelKey: 'dlc_unit_in' },
];

/** Número digitado; vírgula vira ponto; vazio/inválido cai no padrão. */
const num = (text: string, fallback: number): number => {
  const v = Number(text.replace(',', '.'));
  return Number.isFinite(v) ? v : fallback;
};

const semExtensao = (name: string): string => name.replace(/\.dxf$/i, '');

/**
 * Diálogo "Importar CAD (DXF)": escolhe o arquivo, mostra o resumo (camadas, traços, textos, unidade detectada e avisos) e
 * insere no nível com ponto, rotação e escala. O desenho entra como um objeto só (`CadDrawing`), com as camadas do arquivo;
 * a unidade padrão é a detectada no `$INSUNITS`, e o usuário pode trocar.
 */
export function ImportCadDialog(): ReactElement {
  const { t, lang } = useT();
  const p = useProject();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<DxfImportResult | null>(null);
  const [levelId, setLevelId] = useState(() => useUi.getState().levelId);
  const [unit, setUnit] = useState<CadUnit>('m');
  const [x, setX] = useState('0');
  const [y, setY] = useState('0');
  const [rotation, setRotation] = useState('0');
  const [scale, setScale] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = (): void => useUi.setState({ dialog: null });

  const choose = async (f: File | undefined): Promise<void> => {
    if (!f) return;
    setFile(f);
    setError(null);
    setPreview(null);
    try {
      const r = parseDxfText(await f.text(), semExtensao(f.name), lang);
      setPreview(r);
      setUnit(r.unit);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('dlc_err_cad_read'));
    }
  };

  const doImport = async (): Promise<void> => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const cad = await importCadFile(file, {
        levelId,
        unit,
        at: { x: num(x, 0), y: num(y, 0) },
        rotation: num(rotation, 0),
        scale: num(scale, 1),
        name: semExtensao(file.name),
      }, lang);
      editor.store.exec({ type: 'addCadDrawing', cad }, t('dlc_undo_insert_cad'));
      useUi.setState({ dialog: null, status: { key: 'dlc_status_cad_imported', args: { name: cad.name } } });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('dlc_err_cad_import'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={t('dlc_import_cad')}
      sub={t('dlc_import_cad_sub')}
      onClose={close}
      size="mid"
      footer={
        <>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={close}>{t('dlc_btn_cancel')}</button>
          <button className="btn primary" onClick={() => void doImport()} disabled={!file || busy}>
            {busy ? t('dlc_importing') : t('dlc_btn_import')}
          </button>
        </>
      }
    >
      <label className="fm-field" style={{ display: 'block', marginBottom: 10 }}>
        {t('dlc_cad_file')}
        <input
          type="file"
          accept=".dxf"
          aria-label={t('dlc_cad_file')}
          onChange={(e) => void choose(e.target.files?.[0])}
          style={{ marginLeft: 8 }}
        />
      </label>

      {preview ? (
        <p role="status" style={{ margin: '0 0 10px', opacity: 0.8 }}>
          <b>{preview.name}</b> — {t('dlc_cad_preview', { layers: preview.layers.length, paths: preview.paths.length, texts: preview.texts.length })}
          {' '}{t('dlc_cad_detected_unit')} <b>{preview.unit}</b>.
          {preview.warnings.length > 0 && (
            <>
              <br />
              {t('dlc_cad_warnings')} {preview.warnings.slice(0, 4).join(' · ')}
              {preview.warnings.length > 4 ? ` · +${preview.warnings.length - 4}` : ''}
            </>
          )}
        </p>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px', alignItems: 'center' }}>
        <label htmlFor="cad-level">{t('col_level')}</label>
        <select id="cad-level" value={levelId} onChange={(e) => setLevelId(e.target.value)}>
          {p.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>

        <label htmlFor="cad-unit">{t('dlc_unit')}</label>
        <select id="cad-unit" value={unit} onChange={(e) => setUnit(e.target.value as CadUnit)}>
          {UNITS.map((u) => <option key={u.value} value={u.value}>{t(u.labelKey)}</option>)}
        </select>

        <label htmlFor="cad-x">{t('dlc_cad_insert_xy')}</label>
        <span style={{ display: 'flex', gap: 6 }}>
          <input id="cad-x" className="input" value={x} onChange={(e) => setX(e.target.value)} style={{ width: 90 }} />
          <input aria-label={t('dlc_aria_cad_insert_y')} className="input" value={y} onChange={(e) => setY(e.target.value)} style={{ width: 90 }} />
        </span>

        <label htmlFor="cad-rot">{t('dlc_rotation')}</label>
        <input id="cad-rot" className="input" value={rotation} onChange={(e) => setRotation(e.target.value)} style={{ width: 90 }} />

        <label htmlFor="cad-scale">{t('scale')}</label>
        <input id="cad-scale" className="input" value={scale} onChange={(e) => setScale(e.target.value)} style={{ width: 90 }} />
      </div>

      {error ? <p role="alert" style={{ color: '#b91c1c', marginTop: 10 }}>{error}</p> : null}
    </Dialog>
  );
}
