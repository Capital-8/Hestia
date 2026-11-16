import { useState, type ReactElement } from 'react';
import { useT } from '../../editor/i18n.ts';
import { formatBytes, type DataSpaceInfo } from '../../plugins/supManage.ts';

/**
 * Espaço de dados do suplemento no projeto, SOMENTE LEITURA: tamanho em bytes, chaves e prévia. Quando o projeto traz um
 * `dataSchema` maior que o instalado, o espaço fica somente leitura para o suplemento e a tela avisa.
 */
export function SupplementData({ read, schema }: { read: () => DataSpaceInfo; schema: number }): ReactElement {
  const { t } = useT();
  const [info, setInfo] = useState<DataSpaceInfo>(read);
  return (
    <div role="group" aria-label={t('supj_data_title')} style={{ marginTop: 8 }}>
      <div className="hint">{t('supj_data_schema', { schema })}</div>
      <div role="status">{t('supj_data_size', { size: formatBytes(info.totalBytes), bytes: info.totalBytes, limit: formatBytes(info.limitBytes), n: info.entries.length })}</div>
      {info.readOnly ? <p role="alert" style={{ color: '#b26a00' }}>{t('supj_data_readonly', { schema })}</p> : null}
      {info.entries.length === 0 ? <p className="hint">{t('supj_data_empty')}</p> : (
        <table style={{ width: '100%', fontSize: 12 }}>
          <caption className="hint" style={{ textAlign: 'left' }}>{t('supj_data_note')}</caption>
          <thead><tr><th scope="col" style={{ textAlign: 'left' }}>{t('supj_data_key')}</th><th scope="col" style={{ textAlign: 'right' }}>{t('supj_data_bytes')}</th><th scope="col" style={{ textAlign: 'left' }}>{t('supj_data_value')}</th></tr></thead>
          <tbody>
            {info.entries.map((e) => (
              <tr key={e.key}>
                <td><code>{e.key}</code></td>
                <td style={{ textAlign: 'right' }}>{e.bytes}</td>
                <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.preview}><code>{e.preview}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button className="btn" onClick={() => setInfo(read())}>{t('supj_data_refresh')}</button>
    </div>
  );
}
