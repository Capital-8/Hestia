import type { ReactElement } from 'react';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';

/** Área de desenho sem vista aberta: instrui a abrir um nível ou o 3D pelo navegador, que pode ser mostrado daqui. */
export function EmptyViews(): ReactElement {
  const { t } = useT();
  const browserOpen = useUi((s) => s.browserOpen);
  return (
    <div className="views-empty" role="status">
      <h2>{t('shc_empty_views_title')}</h2>
      <p>{t('shc_empty_views_body')}</p>
      {!browserOpen && (
        <button className="btn" onClick={() => useUi.setState({ browserOpen: true })}>
          {t('shc_empty_views_show_browser')}
        </button>
      )}
    </div>
  );
}
