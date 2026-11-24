import { adicionarLigacao, criarLigacaoPadrao, type DominioLigacao, type SecaoLigacao } from '@hestia/model';
import { useState, type ReactElement } from 'react';
import { useT } from '../../editor/i18n.ts';
import {
  DOMINIOS_LIGACAO_UI,
  FamiliaLigacoesForm,
  ROTULO_DOMINIO,
  ROTULO_SECAO_LIGACAO,
  SECOES_LIGACAO_UI,
} from './FamiliaLigacoesForm.tsx';
import { useFamilia } from './familiaStore.ts';
import './familiaCorpo.css';

/*
 * Seção "Ligações" do painel (ficha C2): lista das ligações da família, criação de uma nova (domínio e seção) e o
 * formulário da selecionada. A seleção é local a este painel. Ainda NÃO está montada no editor: falta o ponto de
 * montagem em `FamiliaPaineis.tsx`, que está fora da lista de arquivos desta ficha.
 */

/** Próximo id `ligN` livre entre as ligações existentes. */
function proximoIdLigacao(ids: readonly string[]): string {
  let n = 1;
  while (ids.includes(`lig${n}`)) n++;
  return `lig${n}`;
}

export function FamiliaLigacoesPainel(): ReactElement {
  const { t } = useT();
  const familia = useFamilia((s) => s.historico.atual);
  const ligacoes = familia.ligacoes ?? [];
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [dominio, setDominio] = useState<DominioLigacao>('agua_fria');
  const [secao, setSecao] = useState<SecaoLigacao>('redonda');
  const [erro, setErro] = useState<string | null>(null);

  const atual = ligacoes.find((l) => l.id === selecionada);

  const criar = (): void => {
    const id = proximoIdLigacao(ligacoes.map((l) => l.id));
    const motivo = useFamilia.getState().executar('Nova ligação', (f) => adicionarLigacao(f, criarLigacaoPadrao(dominio, secao, id)));
    setErro(motivo);
    if (motivo === null) setSelecionada(id);
  };

  return (
    <div className="fam-lig-painel">
      <div className="fam-grp">
        <div className="fam-gh">{t('fam_lig_secao')}</div>
        <div className="fam-hint">{ligacoes.length === 0 ? t('fam_lig_lista_vazio') : t('fam_lig_lista_titulo', { n: ligacoes.length })}</div>
        <ul className="fam-lig-lista">
          {ligacoes.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                className={`fam-bt${l.id === selecionada ? ' on' : ''}`}
                aria-pressed={l.id === selecionada}
                onClick={() => {
                  setSelecionada(l.id);
                  setErro(null);
                }}
              >
                {l.nome} · {t(ROTULO_DOMINIO[l.dominio])}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="fam-grp">
        <div className="fam-gh">{t('fam_lig_nova')}</div>
        <p className="fam-hint">{t('fam_lig_nova_dica')}</p>
        <div className="fam-row"><label htmlFor="fln-novo-dominio">{t('fam_lig_escolha_dominio')}</label>
          <select id="fln-novo-dominio" className="fam-f" value={dominio} onChange={(e) => setDominio(e.target.value as DominioLigacao)}>
            {DOMINIOS_LIGACAO_UI.map((d) => <option key={d} value={d}>{t(ROTULO_DOMINIO[d])}</option>)}
          </select>
        </div>
        <div className="fam-row"><label htmlFor="fln-novo-secao">{t('fam_lig_secao_campo')}</label>
          <select id="fln-novo-secao" className="fam-f" value={secao} onChange={(e) => setSecao(e.target.value as SecaoLigacao)}>
            {SECOES_LIGACAO_UI.map((s) => <option key={s} value={s}>{t(ROTULO_SECAO_LIGACAO[s])}</option>)}
          </select>
        </div>
        <button type="button" className="fam-bt" onClick={criar}>{t('fam_lig_nova')}</button>
      </div>

      {erro !== null && <div className="fam-aviso-erro" role="alert">{erro}</div>}

      {atual === undefined ? (
        <div className="fam-hint">{t('fam_lig_sem_selecao')}</div>
      ) : (
        <FamiliaLigacoesForm
          key={atual.id}
          ligacao={atual}
          aoErro={setErro}
          aoExcluir={() => {
            setSelecionada(null);
            setErro(null);
          }}
        />
      )}
    </div>
  );
}
