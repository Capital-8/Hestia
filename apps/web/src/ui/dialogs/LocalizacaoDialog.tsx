import { useState, type ReactElement } from 'react';
import { editor, useProject } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { useT } from '../../editor/i18n.ts';
import { NumField, TextField } from '../fields.tsx';
import { Dialog } from './Dialog.tsx';
import { aplicarLocalizacao, formDaLocalizacao, formMudou, problemaDoForm, type FormLocalizacao } from './localizacaoForm.ts';
import { fecharLocalizacao, useLocalizacaoAberta } from './localizacaoAberta.ts';

/**
 * Diálogo "Localização" (aba Gerenciar › Gerenciar projeto): leste, norte, altitude da cota zero, norte verdadeiro (graus) e
 * sistema de referência. Aplicar grava `setLocalizacao` (um passo de desfazer). A lógica está em `localizacaoForm.ts`.
 */
export function LocalizacaoDialog(): ReactElement | null {
  return useLocalizacaoAberta() ? <LocalizacaoCorpo /> : null;
}

function LocalizacaoCorpo(): ReactElement {
  const { t, lang } = useT();
  const p = useProject();
  const [f, setF] = useState<FormLocalizacao>(() => formDaLocalizacao(p));
  const [erro, setErro] = useState<string | null>(null);
  const mude = (patch: Partial<FormLocalizacao>): void => {
    setF((a) => ({ ...a, ...patch }));
    setErro(null);
  };
  const problema = problemaDoForm(f, lang) ?? erro;
  const aplicar = (): void => {
    const r = aplicarLocalizacao(editor.store, f, t('ui_loc_rotulo_undo'), lang);
    if (r) {
      setErro(r);
      return;
    }
    fecharLocalizacao();
    useUi.setState({ status: { key: 'ui_loc_status' } });
  };
  return (
    <Dialog
      title={t('ui_loc_titulo')}
      sub={t('ui_loc_sub')}
      onClose={fecharLocalizacao}
      onSubmit={aplicar}
      footer={
        <>
          <button className="btn" onClick={() => setF({ origemE: 0, origemN: 0, cotaZero: 0, norteGraus: 0, sistema: '' })}>{t('ui_loc_zerar')}</button>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={fecharLocalizacao}>{t('dlc_btn_cancel')}</button>
          <button className="btn primary" onClick={aplicar} disabled={problema !== null || !formMudou(f, p)}>{t('prc_btn_apply')}</button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px', alignItems: 'center' }}>
        <label htmlFor="loc-e">{t('ui_loc_leste')}</label>
        <NumField id="loc-e" quantity="length" value={f.origemE} onCommit={(v) => mude({ origemE: v })} />
        <label htmlFor="loc-n">{t('ui_loc_norte')}</label>
        <NumField id="loc-n" quantity="length" value={f.origemN} onCommit={(v) => mude({ origemN: v })} />
        <label htmlFor="loc-z">{t('ui_loc_cota_zero')}</label>
        <NumField id="loc-z" quantity="length" value={f.cotaZero} onCommit={(v) => mude({ cotaZero: v })} />
        <label htmlFor="loc-nv">{t('ui_loc_norte_verdadeiro')}</label>
        <NumField id="loc-nv" suffix="°" decimals={4} value={f.norteGraus} onCommit={(v) => mude({ norteGraus: v })} />
        <label htmlFor="loc-sis">{t('ui_loc_sistema')}</label>
        <TextField id="loc-sis" value={f.sistema} placeholder={t('ui_loc_sistema_ex')} onCommit={(v) => mude({ sistema: v })} />
      </div>
      <p style={{ margin: '10px 0 0', opacity: 0.8 }}>{t('ui_loc_ajuda')}</p>
      {problema ? <p role="alert" style={{ color: '#b91c1c', margin: '6px 0 0' }}>{problema}</p> : null}
    </Dialog>
  );
}
