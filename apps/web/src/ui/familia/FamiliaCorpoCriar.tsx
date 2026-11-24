import { useState, type ReactElement } from 'react';
import { useT } from '../../editor/i18n.ts';
import { Icon } from '../Icon.tsx';
import { ICONE_FORMA, ROTULO_FORMA, TIPOS_FORMA, criarCorpoNoEditor } from './familiaCorpo.ts';
import './familiaCorpo.css';

/** Painel "Corpos" da aba Criar da faixa: um botão grande por forma (extrusão, revolução, varredura, transição). */
export function PainelCorpos(): ReactElement {
  const { t } = useT();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <div className="rb-panel" role="group" aria-label={t('fam_corpo_painel')}>
      <div className="rb-cols">
        {TIPOS_FORMA.map((tipo) => (
          <button
            key={tipo}
            className="rb-btn rb-large"
            title={t('fam_corpo_criar_dica', { forma: t(ROTULO_FORMA[tipo]) })}
            aria-label={t(ROTULO_FORMA[tipo])}
            onClick={() => setErro(criarCorpoNoEditor(tipo))}
          >
            <Icon name={ICONE_FORMA[tipo]} size={28} />
            <span className="rb-lbl">{t(ROTULO_FORMA[tipo])}</span>
          </button>
        ))}
      </div>
      {erro !== null && <div className="fam-msg erro fam-corpo-erro-faixa" role="alert">{erro}</div>}
      <div className="rb-title">{t('fam_corpo_painel')}</div>
    </div>
  );
}
