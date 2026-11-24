import {
  adicionarPrimitivo,
  adicionarSimbolo,
  criarSimboloPadrao,
  editarSimbolo,
  excluirSimbolo,
  moverPonto,
  PLANOS_SIMBOLO,
  VISTAS_SIMBOLO,
  type Familia,
  type PlanoSimbolo,
  type VistaSimbolo,
} from '@hestia/model';
import { useState, type ReactElement } from 'react';
import { useT } from '../../editor/i18n.ts';
import { CampoCorpo } from './FamiliaCorpoCampo.tsx';
import { FamiliaSimboloPrimitivos } from './FamiliaSimboloPrimitivo.tsx';
import { FamiliaSimboloTela } from './FamiliaSimboloTela.tsx';
import { FERRAMENTAS, primitivoEm, ROTULO_FERRAMENTA, ROTULO_VISTA_SIMBOLO, type Ferramenta } from './familiaSimbolo.ts';
import { proximoId } from './familiaDetalhe.ts';
import { useFamilia, useResolucao } from './familiaStore.ts';
import './familiaSimbolo.css';

/*
 * Seção "Símbolos 2D" do editor (ficha D3): lista de símbolos, formulário do selecionado (nome, vistas em que aparece, plano,
 * "Substituir geometria", excluir), seletor de ferramenta, a tela de desenho e a lista de primitivos. Toda gravação passa pelo
 * modelo dentro de `useFamilia.executar` (histórico e desfazer); a recusa do modelo aparece no painel. A visibilidade por corpo
 * fica no painel do corpo (B7), não aqui.
 */

type Executar = (rotulo: string, receita: (f: Familia) => string | null) => string | null;

export function FamiliaSimboloPainel(): ReactElement {
  const { t } = useT();
  const familia = useFamilia((s) => s.historico.atual);
  const resolucao = useResolucao();
  const simbolos = familia.simbolos ?? [];
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [ferramenta, setFerramenta] = useState<Ferramenta>('linha');
  const [erro, setErro] = useState<string | null>(null);
  const atual = simbolos.find((s) => s.id === selecionado);

  const executar: Executar = (rotulo, receita) => {
    const motivo = useFamilia.getState().executar(rotulo, receita);
    setErro(motivo);
    return motivo;
  };

  const criar = (): void => {
    const id = proximoId('sim', simbolos.map((s) => s.id));
    if (executar('Novo símbolo', (f) => adicionarSimbolo(f, criarSimboloPadrao(id, id))) === null) setSelecionado(id);
  };

  const alternarVista = (v: VistaSimbolo): void => {
    if (atual === undefined) return;
    const vistas = atual.vistas.includes(v) ? atual.vistas.filter((x) => x !== v) : [...atual.vistas, v];
    executar('Editar vistas do símbolo', (f) => editarSimbolo(f, atual.id, { vistas }));
  };

  const avisosDoSimbolo = atual === undefined
    ? []
    : resolucao.erros.filter((e) => e.onde.startsWith(`simbolos[${atual.id}]`) || e.onde.startsWith(`simbolo:${atual.id}`));

  return (
    <div className="fam-corpo-painel fam-sim-painel">
      <div className="fam-grp">
        <div className="fam-gh">{t('fam_sim_secao')}</div>
        <div className="fam-hint">{simbolos.length === 0 ? t('fam_sim_lista_vazio') : t('fam_sim_lista_titulo', { n: simbolos.length })}</div>
        <ul className="fam-lig-lista">
          {simbolos.map((s) => (
            <li key={s.id}>
              <button type="button" className={`fam-bt${s.id === selecionado ? ' on' : ''}`} aria-pressed={s.id === selecionado} onClick={() => { setSelecionado(s.id); setErro(null); }}>
                {s.nome} · {s.vistas.map((v) => t(ROTULO_VISTA_SIMBOLO[v])).join(', ')}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="fam-bt" onClick={criar}>{t('fam_sim_novo')}</button>
      </div>

      {erro !== null && <div className="fam-aviso-erro" role="alert">{erro}</div>}
      {avisosDoSimbolo.map((e, k) => <div key={k} className="fam-msg erro">{t('fam_sim_aviso', { mensagem: e.mensagem })}</div>)}

      {atual === undefined ? (
        <div className="fam-hint">{t('fam_sim_sem_selecao')}</div>
      ) : (
        <>
          <div className="fam-grp">
            <div className="fam-gh">{atual.nome}</div>
            <CampoCorpo key={`nome:${atual.nome}`} id={`fsy-${atual.id}-nome`} rotulo={t('fam_sim_nome')} valor={atual.nome} formula={false}
              gravar={(nome) => executar('Renomear símbolo', (f) => editarSimbolo(f, atual.id, { nome }))} />
            <div className="fam-row"><span>{t('fam_sim_vistas')}</span>
              <div className="fam-sim-checks">
                {VISTAS_SIMBOLO.map((v) => (
                  <label key={v}>
                    <input type="checkbox" checked={atual.vistas.includes(v)} onChange={() => alternarVista(v)} />
                    {t(ROTULO_VISTA_SIMBOLO[v])}
                  </label>
                ))}
              </div>
            </div>
            <div className="fam-row"><label htmlFor={`fsy-${atual.id}-plano`}>{t('fam_sim_plano')}</label>
              <select id={`fsy-${atual.id}-plano`} className="fam-f" value={atual.plano} onChange={(e) => executar('Mudar plano do símbolo', (f) => editarSimbolo(f, atual.id, { plano: e.target.value as PlanoSimbolo }))}>
                {PLANOS_SIMBOLO.map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
              </select>
            </div>
            <button type="button" className="fam-bt" aria-pressed={atual.substituiGeometria === true} title={t('fam_sim_substituir_dica')}
              onClick={() => executar('Substituir geometria', (f) => editarSimbolo(f, atual.id, { substituiGeometria: atual.substituiGeometria !== true }))}>
              {t('fam_sim_substituir')}{atual.substituiGeometria === true ? ' ✓' : ''}
            </button>
            {atual.substituiGeometria === true && <div className="fam-hint">{t('fam_sim_substituir_dica')}</div>}
            <button type="button" className="fam-bt" onClick={() => {
              if (executar('Excluir símbolo', (f) => excluirSimbolo(f, atual.id)) === null) setSelecionado(null);
            }}>{t('fam_sim_excluir')}</button>
          </div>

          <div className="fam-grp">
            <div className="fam-gh">{t('fam_sim_ferramenta')}</div>
            <div className="fam-sim-ferramentas">
              {FERRAMENTAS.map((f) => (
                <button key={f} type="button" className={`fam-bt${f === ferramenta ? ' on' : ''}`} aria-pressed={f === ferramenta} onClick={() => setFerramenta(f)}>
                  {t(ROTULO_FERRAMENTA[f])}
                </button>
              ))}
            </div>
            <div className="fam-hint">{t('fam_sim_tela_dica')}</div>
            <FamiliaSimboloTela
              simboloId={atual.id}
              resolvidos={resolucao.simbolos ?? []}
              primitivos={atual.primitivos}
              ferramenta={ferramenta}
              aoCriar={(x, y) => executar('Criar primitivo', (f) => adicionarPrimitivo(f, atual.id, primitivoEm(ferramenta, x, y)))}
              aoMover={(indice, k, x, y) => executar('Mover ponto', (f) => moverPonto(f, atual.id, indice, k, x, y))}
            />
            <button type="button" className="fam-bt" onClick={() => executar('Adicionar primitivo', (f) => adicionarPrimitivo(f, atual.id, primitivoEm(ferramenta, 0, 0)))}>
              {t('fam_sim_adicionar')}
            </button>
          </div>

          <div className="fam-grp">
            <div className="fam-gh">{t('fam_sim_primitivos', { n: atual.primitivos.length })}</div>
            <FamiliaSimboloPrimitivos simboloId={atual.id} primitivos={atual.primitivos} executar={executar} />
          </div>
        </>
      )}
    </div>
  );
}
