import type { ReactElement } from 'react';
import { useT } from '../../editor/i18n.ts';
import { Icon } from '../Icon.tsx';
import { ICONE_FORMA, ROTULO_FORMA, selecionarCorpo, useCorpoSel } from './familiaCorpo.ts';
import { useFamilia } from './familiaStore.ts';

/** Lista de corpos no navegador da família (ícone por forma). Selecionar aqui seleciona o corpo no painel de propriedades. */
export function FamiliaCorpoLista(): ReactElement {
  const { t } = useT();
  const corpos = useFamilia((s) => s.historico.atual.corpos) ?? [];
  const selecionado = useCorpoSel((s) => s.id);
  return (
    <>
      <li className="h">▾ {t('fam_corpo_lista_titulo', { n: corpos.length })}</li>
      {corpos.length === 0 && (
        <li className="l2"><span className="fam-mut">{t('fam_corpo_lista_vazio')}</span></li>
      )}
      {corpos.map((c) => (
        <li key={c.id} className={`l2 fam-corpo-li${c.id === selecionado ? ' sel' : ''}`} onClick={() => selecionarCorpo(c.id)}>
          <Icon name={ICONE_FORMA[c.forma.tipo]} size={14} />
          <span>{c.nome}</span>
          <span className="fam-mut">{t(ROTULO_FORMA[c.forma.tipo])}</span>
        </li>
      ))}
    </>
  );
}
