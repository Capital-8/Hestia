import { detalharFamilia } from '@hestia/engine';
import { adicionarDetalhe, criarDetalhePadrao, editarDetalhe, excluirDetalhe, type Eixo, type Familia, type VistaSimbolo } from '@hestia/model';
import { useMemo, useState, type ReactElement } from 'react';
import { editor, useProject } from '../../editor/controller.ts';
import { useT } from '../../editor/i18n.ts';
import { instanciaParaDetalhe, inserirDetalheDeFamilia } from '../../editor/sheetInsert.ts';
import { useUi } from '../../editor/state.ts';
import { FamiliaDetalheCotas } from './FamiliaDetalheCotas.tsx';
import { FamiliaDetalheMiniatura } from './FamiliaDetalheMiniatura.tsx';
import { CampoCorpo } from './FamiliaCorpoCampo.tsx';
import { EIXOS_DETALHE, proximoId, ROTULO_VISTA_DETALHE, VISTAS_DETALHE } from './familiaDetalhe.ts';
import { useFamilia } from './familiaStore.ts';
import './familiaCorpo.css';

/*
 * Aba "Detalhes" do editor (ficha D4): lista de detalhes, formulário do selecionado (nome, vista, escala e plano de corte),
 * miniatura da vista, tabela de cotas e o botão "inserir no projeto" (ficha D6b: põe o detalhe da instância da família numa prancha).
 * Ainda NÃO está montada no editor: falta o ponto de montagem em `FamiliaPaineis.tsx`, que está fora da lista de arquivos desta
 * ficha. A seleção é local a este painel; toda gravação passa pelo modelo dentro de `useFamilia.executar` (histórico e desfazer).
 */

export function FamiliaDetalhePainel(): ReactElement {
  const { t } = useT();
  const familia = useFamilia((s) => s.historico.atual);
  const tipoId = useFamilia((s) => s.tipoId);
  const valores = useFamilia((s) => s.valores);
  const detalhes = familia.detalhes ?? [];
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const atual = detalhes.find((d) => d.id === selecionado);

  const resolvido = useMemo(
    () => (atual === undefined ? null : detalharFamilia(familia, tipoId ?? undefined, valores, atual.id)),
    [familia, tipoId, valores, atual],
  );

  // Instância da família no projeto (a que o detalhe da prancha vai acompanhar); sem ela o botão fica desligado.
  const projeto = useProject();
  const instancia = instanciaParaDetalhe(projeto, familia.id, tipoId);

  const inserir = (detalheId: string): void => {
    if (instancia === null) return;
    try {
      inserirDetalheDeFamilia(editor.store, instancia, detalheId, useUi.getState().sheetId);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  const executar = (rotulo: string, receita: (f: Familia) => string | null): string | null => {
    const motivo = useFamilia.getState().executar(rotulo, receita);
    setErro(motivo);
    return motivo;
  };

  const criar = (): void => {
    const id = proximoId('det', detalhes.map((d) => d.id));
    if (executar('Novo detalhe', (f) => adicionarDetalhe(f, criarDetalhePadrao(id, id))) === null) setSelecionado(id);
  };

  const trocarVista = (vista: VistaSimbolo): void => {
    if (atual === undefined) return;
    const plano = vista === 'planta' ? undefined : (atual.plano ?? { eixo: 'y' as Eixo, posicao: '0' });
    executar('Trocar vista', (f) => editarDetalhe(f, atual.id, { vista, plano }));
  };

  return (
    <div className="fam-corpo-painel">
      <div className="fam-grp">
        <div className="fam-gh">{t('fam_det_secao')}</div>
        <div className="fam-hint">{detalhes.length === 0 ? t('fam_det_lista_vazio') : t('fam_det_lista_titulo', { n: detalhes.length })}</div>
        <ul className="fam-lig-lista">
          {detalhes.map((d) => (
            <li key={d.id}>
              <button type="button" className={`fam-bt${d.id === selecionado ? ' on' : ''}`} aria-pressed={d.id === selecionado} onClick={() => { setSelecionado(d.id); setErro(null); }}>
                {d.nome} · {t(ROTULO_VISTA_DETALHE[d.vista])} 1:{d.escala}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="fam-bt" onClick={criar}>{t('fam_det_novo')}</button>
      </div>

      {erro !== null && <div className="fam-aviso-erro" role="alert">{erro}</div>}

      {atual === undefined ? (
        <div className="fam-hint">{t('fam_det_sem_selecao')}</div>
      ) : (
        <>
          <div className="fam-grp">
            <div className="fam-gh">{atual.nome}</div>
            <CampoCorpo key={`nome:${atual.nome}`} id={`fdp-${atual.id}-nome`} rotulo={t('fam_det_nome')} valor={atual.nome} formula={false} gravar={(nome) => executar('Renomear detalhe', (f) => editarDetalhe(f, atual.id, { nome }))} />
            <div className="fam-row"><label htmlFor={`fdp-${atual.id}-vista`}>{t('fam_det_vista')}</label>
              <select id={`fdp-${atual.id}-vista`} className="fam-f" value={atual.vista} onChange={(e) => trocarVista(e.target.value as VistaSimbolo)}>
                {VISTAS_DETALHE.map((v) => <option key={v} value={v}>{t(ROTULO_VISTA_DETALHE[v])}</option>)}
              </select>
            </div>
            <CampoCorpo key={`escala:${atual.escala}`} id={`fdp-${atual.id}-escala`} rotulo={t('fam_det_escala')} valor={String(atual.escala)} formula={false} gravar={(texto) => {
              const n = Number(texto.replace(',', '.'));
              return executar('Mudar escala', (f) => editarDetalhe(f, atual.id, { escala: n }));
            }} />
            {atual.vista !== 'planta' && atual.plano !== undefined && (
              <>
                <div className="fam-row"><label htmlFor={`fdp-${atual.id}-eixo`}>{t('fam_det_plano_eixo')}</label>
                  <select id={`fdp-${atual.id}-eixo`} className="fam-f" value={atual.plano.eixo} onChange={(e) => {
                    const eixo = e.target.value as Eixo;
                    const posicao = atual.plano?.posicao ?? '0';
                    executar('Mudar plano', (f) => editarDetalhe(f, atual.id, { plano: { ...atual.plano, eixo, posicao } }));
                  }}>
                    {EIXOS_DETALHE.map((e) => <option key={e} value={e}>{e.toUpperCase()}</option>)}
                  </select>
                </div>
                <CampoCorpo key={`pos:${atual.plano.posicao}`} id={`fdp-${atual.id}-pos`} rotulo={t('fam_det_plano_posicao')} valor={atual.plano.posicao} gravar={(posicao) => {
                  const eixo = atual.plano?.eixo ?? 'y';
                  return executar('Mudar plano', (f) => editarDetalhe(f, atual.id, { plano: { ...atual.plano, eixo, posicao } }));
                }} />
              </>
            )}
            <button type="button" className="fam-bt" onClick={() => {
              if (executar('Excluir detalhe', (f) => excluirDetalhe(f, atual.id)) === null) setSelecionado(null);
            }}>{t('fam_det_excluir')}</button>
          </div>

          {resolvido !== null && (
            <div className="fam-grp">
              <FamiliaDetalheMiniatura detalhe={resolvido} />
              {resolvido.diagnosticos.map((d, k) => <div key={k} className="fam-hint">{t('fam_det_aviso', { mensagem: d.mensagem })}</div>)}
            </div>
          )}

          <FamiliaDetalheCotas familia={familia} detalhe={atual} resolvidas={resolvido?.cotas ?? []} aoErro={setErro} />

          <button type="button" className="fam-bt" disabled={instancia === null} title={instancia === null ? t('fam_det_inserir_dica') : undefined} onClick={() => inserir(atual.id)}>{t('fam_det_inserir')}</button>
        </>
      )}
    </div>
  );
}
