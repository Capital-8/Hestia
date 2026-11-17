import type { ReactElement } from 'react';
import type { Material } from '@hestia/model';
import { useT } from '../../../editor/i18n.ts';
import { TextField } from '../../fields.tsx';
import { formatPalavrasChave, parsePalavrasChave, type Editar } from './materialsLogic.ts';

/** Aba Identidade: textos de identificação do material (bloco `identidade`). */
export function TabIdentidade({ m, editar }: { m: Material; editar: Editar }): ReactElement {
  const { t } = useT();
  const id = m.identidade;
  const campo = (key: 'descricao' | 'classe' | 'comentarios' | 'fabricante' | 'modelo' | 'url', rotulo: string): ReactElement => (
    <div className="field-row" key={key}>
      <label htmlFor={`mat-id-${key}`}>{rotulo}</label>
      <TextField id={`mat-id-${key}`} value={id?.[key] ?? ''} onCommit={(v) => editar('identidade', [key], v, true)} />
    </div>
  );
  return (
    <>
      {campo('descricao', t('dlt_mat_fld_desc'))}
      {campo('classe', t('dlt_mat_fld_class'))}
      {campo('fabricante', t('dlt_mat_fld_maker'))}
      {campo('modelo', t('dlt_mat_fld_model'))}
      {campo('url', t('dlt_mat_fld_url'))}
      {campo('comentarios', t('dlt_mat_fld_comments'))}
      <div className="field-row">
        <label htmlFor="mat-id-palavras">{t('dlt_mat_fld_keywords')}</label>
        <TextField
          id="mat-id-palavras"
          value={formatPalavrasChave(id?.palavrasChave)}
          placeholder={t('dlt_mat_keywords_hint')}
          onCommit={(v) => editar('identidade', ['palavrasChave'], parsePalavrasChave(v), true)}
        />
      </div>
      <p className="hint" style={{ padding: '2px 0 6px' }}>{t('dlt_mat_keywords_hint')}</p>
    </>
  );
}
