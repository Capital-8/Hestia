import { useState, type ReactElement } from 'react';
import { useT } from '../../editor/i18n.ts';
import { Icon } from '../Icon.tsx';
import { useCorpoSel } from './familiaCorpo.ts';
import { useLigacaoSel } from './FamiliaLigacoesPainel.tsx';
import { useFamilia } from './familiaStore.ts';
import type { BotaoAba, Chave, PainelAba } from './familiaAbaAcoes.ts';

/*
 * Faixa de uma aba do editor de famílias (Inserir, Modificar, Vista, Gerenciar). Mesmo molde da faixa de Criar: painéis
 * com botões grandes. Botão sem ação real fica desabilitado e mostra o motivo no tooltip (ficha G2).
 */

/** Motivo de desabilitar o botão, ou `null` se ele está habilitado para a seleção atual. */
function motivoDe(b: BotaoAba, sel: string | null, ligacao: string | null, corpo: string | null): Chave | null {
  if (b.indisponivel !== undefined) return b.indisponivel;
  if (b.precisa === 'peca' && sel === null) return 'fa_m_sem_peca';
  if (b.precisa === 'ligacao' && ligacao === null) return 'fa_m_sem_ligacao';
  if (b.precisa === 'corpo' && corpo === null) return 'fa_m_sem_corpo';
  return null;
}

export function FamiliaAbaRibbon({ titulo, paineis }: { titulo: Chave; paineis: readonly PainelAba[] }): ReactElement {
  const { t } = useT();
  const sel = useFamilia((s) => s.sel);
  const vista = useFamilia((s) => s.vista);
  const opacidade = useFamilia((s) => s.opacidade);
  const detalhe = useFamilia((s) => s.detalhe);
  const ligacao = useLigacaoSel((s) => s.id);
  const corpo = useCorpoSel((s) => s.id);
  const [erro, setErro] = useState<string | null>(null);

  const ativo = (b: BotaoAba): boolean => {
    const a = b.ajusta;
    if (a === undefined) return false;
    return (a.vista === undefined || a.vista === vista)
      && (a.opacidade === undefined || a.opacidade === opacidade)
      && (a.detalhe === undefined || a.detalhe === detalhe);
  };

  const clicar = (b: BotaoAba): void => {
    if (b.abre !== undefined) {
      useFamilia.getState().set({ dialogo: b.abre });
      return;
    }
    if (b.ajusta !== undefined) {
      useFamilia.getState().set(b.ajusta);
      return;
    }
    if (b.acao !== undefined) setErro(b.acao(t(b.rotulo)));
  };

  return (
    <>
      {erro !== null && <div className="fam-msg erro" role="alert">{erro}</div>}
      <div className="ribbon" role="toolbar" aria-label={t(titulo)}>
        {paineis.map((p) => (
          <div key={p.titulo} className="rb-panel" role="group" aria-label={t(p.titulo)}>
            <div className="rb-cols">
              {p.botoes.map((b) => {
                const motivo = motivoDe(b, sel, ligacao, corpo);
                const on = ativo(b);
                return (
                  <button
                    key={b.rotulo}
                    className={`rb-btn rb-large${on ? ' on' : ''}`}
                    title={motivo !== null ? t(motivo) : t(b.rotulo)}
                    aria-pressed={on || undefined}
                    disabled={motivo !== null}
                    onClick={() => clicar(b)}
                  >
                    <Icon name={b.icone} size={28} />
                    <span className="rb-lbl">{t(b.rotulo)}</span>
                  </button>
                );
              })}
            </div>
            <div className="rb-title">{t(p.titulo)}</div>
          </div>
        ))}
      </div>
    </>
  );
}
