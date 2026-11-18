import { familiaDaBiblioteca, isWall, type Id, type Project, type Wall } from '@hestia/model';
import type { ResultadoDeFila } from '@hestia/engine';
import { create } from 'zustand';
import { useState, type ReactElement } from 'react';
import { editor, useProject } from '../editor/controller.ts';
import { useUi } from '../editor/state.ts';
import { useT } from '../editor/i18n.ts';
import { tm } from './moveisTextos.ts';
import { familiasDaBiblioteca, familiasDoProjeto, familiaEscolhida } from './ComponentOptionsBar.tsx';
import { NumField } from './fields.tsx';
import { comprimentoDaFace, criarFila, previaDaFila, type EntradaDaFila, type LadoDaParede, type LinhaDaFilaNaTela } from './montarFilaLogica.ts';
import { useFormat } from './useUnits.ts';
import './familia/familia.css';
import './montarFila.css';

/*
 * Diálogo "Montar fila": com UMA parede reta selecionada, monta uma sequência de módulos contra uma das faces e grava
 * o conjunto no projeto. A prévia usa o mesmo motor da gravação, então o que aparece é o que entra.
 */

interface MontarFilaState {
  aberta: boolean;
  abrir: () => void;
  fechar: () => void;
}

export const useMontarFila = create<MontarFilaState>((set) => ({
  aberta: false,
  abrir: () => set({ aberta: true }),
  fechar: () => set({ aberta: false }),
}));

/** A única parede reta do nível selecionada; `null` se a seleção não tem exatamente uma parede reta do nível. */
function paredeSelecionada(p: Project, selection: readonly Id[], levelId: Id): Wall | null {
  if (selection.length !== 1) return null;
  const e = p.elements[selection[0]!];
  return isWall(e) && e.levelId === levelId && e.sag === 0 ? e : null;
}

function nomeDaFamilia(p: Project, id: Id): string {
  return p.componentFamilies?.[id]?.nome ?? familiaDaBiblioteca(id)?.nome ?? id;
}

function nomeDoTipo(p: Project, familiaId: Id, tipoId: Id | null): string {
  if (!tipoId) return tm('mov_padrao_familia');
  const familia = p.componentFamilies?.[familiaId] ?? familiaDaBiblioteca(familiaId);
  return familia?.tipos.find((tp) => tp.id === tipoId)?.nome ?? tipoId;
}

interface LinhaDaPrevia {
  id: Id;
  nome: string;
  tipo: string;
  largura: number;
  posicao: number;
}

function linhasDaPrevia(p: Project, resultado: ResultadoDeFila, inicio: number): LinhaDaPrevia[] {
  let posicao = inicio;
  return resultado.componentes.map((componente, indice) => {
    const largura = resultado.larguras[indice] ?? 0;
    const linha: LinhaDaPrevia = {
      id: componente.id,
      nome: nomeDaFamilia(p, componente.familyId),
      tipo: nomeDoTipo(p, componente.familyId, componente.typeId),
      largura,
      posicao,
    };
    posicao += largura;
    return linha;
  });
}

function SemParede({ fechar }: { fechar: () => void }): ReactElement {
  return (
    <div className="fam-dback" role="presentation" onPointerDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
      <div className="fam-dwin" role="dialog" aria-label={tm('mov_montar_fila')}>
        <div className="fam-dt"><span>{tm('mov_montar_fila')}</span><button aria-label={tm('mov_fechar')} onClick={fechar}>✕</button></div>
        <div className="fam-db"><p className="mf-aviso">{tm('mov_selecione_parede')}</p></div>
        <div className="fam-df"><span style={{ flex: 1 }} /><button className="fam-bt" onClick={fechar}>{tm('mov_fechar')}</button></div>
      </div>
    </div>
  );
}

function Conteudo({ p, parede, levelId }: { p: Project; parede: Wall; levelId: Id }): ReactElement {
  const { t } = useT();
  const fechar = useMontarFila((s) => s.fechar);
  const formatar = useFormat();
  const doProjeto = familiasDoProjeto(p);
  const daBiblioteca = familiasDaBiblioteca(p);
  const todas = [...doProjeto, ...daBiblioteca];
  const [lado, setLado] = useState<LadoDaParede>('esquerdo');
  const [inicio, setInicio] = useState(0);
  const [comprimento, setComprimento] = useState(comprimentoDaFace(p, levelId, parede.id, 'esquerdo'));
  const [linhas, setLinhas] = useState<LinhaDaFilaNaTela[]>([]);
  const [preencher, setPreencher] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const entrada: EntradaDaFila = { levelId, wallId: parede.id, lado, inicio, comprimento, linhas, preencher };
  const previa = previaDaFila(p, entrada);
  const podeCriar = linhas.length > 0 && previa !== null && previa.componentes.length > 0;
  const tipoDaParede = p.wallTypes[parede.typeId]?.name ?? parede.typeId;

  const alterarLinha = (indice: number, patch: Partial<LinhaDaFilaNaTela>): void => {
    setLinhas((atuais) => atuais.map((linha, i) => (i === indice ? { ...linha, ...patch } : linha)));
  };
  const adicionar = (): void => {
    const familia = todas[0];
    if (familia) setLinhas((atuais) => [...atuais, { familyId: familia.id, typeId: null }]);
  };
  const remover = (indice: number): void => {
    setLinhas((atuais) => atuais.filter((_, i) => i !== indice));
  };
  const mover = (indice: number, delta: number): void => {
    setLinhas((atuais) => {
      const destino = indice + delta;
      if (destino < 0 || destino >= atuais.length) return atuais;
      const copia = [...atuais];
      const [linha] = copia.splice(indice, 1);
      if (linha) copia.splice(destino, 0, linha);
      return copia;
    });
  };
  const criar = (): void => {
    const resultado = criarFila(editor.store, entrada);
    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }
    useUi.setState({ status: { key: 'mov_fila_criada', args: { n: resultado.ids.length } } });
    fechar();
  };

  return (
    <div className="fam-dback" role="presentation" onPointerDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
      <div className="fam-dwin larga" role="dialog" aria-label={t('mov_montar_fila')}>
        <div className="fam-dt"><span>{t('mov_montar_fila')} · {parede.mark || parede.id}</span><button aria-label={t('mov_fechar')} onClick={fechar}>✕</button></div>
        <div className="fam-db mf-corpo">
          <div className="mf-topo">
            <span className="mf-parede"><b>{t('mov_parede')}</b> {parede.mark || parede.id} <span className="fam-hint">{tipoDaParede}</span></span>
            <label>
              {t('mov_lado_livre')}
              <select className="fam-f" value={lado} onChange={(e) => setLado(e.target.value as LadoDaParede)}>
                <option value="esquerdo">{t('mov_lado_esquerdo')}</option>
                <option value="direito">{t('mov_lado_direito')}</option>
              </select>
            </label>
          </div>

          <div className="mf-campos">
            <label>
              {t('mov_inicio')}
              <NumField id="mf-inicio" value={inicio} quantity="length" min={0} onCommit={setInicio} />
            </label>
            <label>
              {t('mov_comprimento')}
              <NumField id="mf-comprimento" value={comprimento} quantity="length" min={0.01} onCommit={setComprimento} />
            </label>
            <label className="mf-check">
              <input type="checkbox" checked={preencher} onChange={(e) => setPreencher(e.target.checked)} />
              {t('mov_preencher_vao')}
            </label>
          </div>

          <div className="mf-linhas">
            <div className="mf-linhas-cab">
              <b>{t('mov_modulos')}</b>
              <button type="button" className="fam-bt" disabled={todas.length === 0} onClick={adicionar}>{t('mov_adicionar_modulo')}</button>
            </div>
            {linhas.length === 0 && <p className="fam-hint">{t('mov_adicione_modulo')}</p>}
            {linhas.map((linha, indice) => {
              const familia = familiaEscolhida(p, linha.familyId);
              return (
                <div className="mf-linha" key={indice}>
                  <select className="fam-f" aria-label={t('mov_familia')} value={linha.familyId} onChange={(e) => alterarLinha(indice, { familyId: e.target.value, typeId: null })}>
                    {doProjeto.length > 0 && (
                      <optgroup label={t('mov_grp_projeto')}>
                        {doProjeto.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                      </optgroup>
                    )}
                    {daBiblioteca.length > 0 && (
                      <optgroup label={t('mov_biblioteca')}>
                        {daBiblioteca.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                      </optgroup>
                    )}
                  </select>
                  <select className="fam-f" aria-label={t('mov_tipo')} value={linha.typeId ?? ''} onChange={(e) => alterarLinha(indice, { typeId: e.target.value === '' ? null : e.target.value })}>
                    <option value="">{t('mov_padrao_familia')}</option>
                    {familia?.tipos.map((tp) => <option key={tp.id} value={tp.id}>{tp.nome}</option>)}
                  </select>
                  <NumField
                    id={`mf-largura-${indice}`}
                    value={linha.largura ?? null}
                    quantity="length"
                    min={0.01}
                    placeholder={t('mov_do_tipo')}
                    onCommit={(v) => alterarLinha(indice, { largura: v })}
                    onClear={() => alterarLinha(indice, { largura: undefined })}
                  />
                  <div className="mf-acoes">
                    <button type="button" className="fam-bt" title={t('mov_subir')} aria-label={t('mov_subir')} disabled={indice === 0} onClick={() => mover(indice, -1)}>↑</button>
                    <button type="button" className="fam-bt" title={t('mov_descer')} aria-label={t('mov_descer')} disabled={indice === linhas.length - 1} onClick={() => mover(indice, 1)}>↓</button>
                    <button type="button" className="fam-bt" title={t('mov_remover')} aria-label={t('mov_remover')} onClick={() => remover(indice)}>{t('mov_remover')}</button>
                  </div>
                </div>
              );
            })}
          </div>

          {previa && previa.componentes.length > 0 && (
            <div className="fam-tabela mf-previa">
              <table>
                <thead>
                  <tr><th>{t('mov_modulo')}</th><th className="n">{t('mov_largura')}</th><th className="n">{t('mov_grp_posicao')}</th></tr>
                </thead>
                <tbody>
                  {linhasDaPrevia(p, previa, inicio).map((linha) => (
                    <tr key={linha.id}>
                      <td>{linha.nome} <span className="fam-hint">{linha.tipo}</span></td>
                      <td className="n">{formatar('length', linha.largura, { trim: true, decimals: 2 })}</td>
                      <td className="n">{formatar('length', linha.posicao, { trim: true, decimals: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {previa && (previa.painel > 0 || previa.sobra > 0) && (
            <div className="mf-contas">
              {previa.painel > 0 && <span>{t('mov_painel_enchimento')}: <b>{formatar('length', previa.painel, { trim: true, decimals: 2 })}</b></span>}
              {previa.sobra > 0 && <span>{t('mov_sobra')}: <b>{formatar('length', previa.sobra, { trim: true, decimals: 2 })}</b></span>}
            </div>
          )}

          {previa && previa.avisos.length > 0 && (
            <div className="mf-avisos" role="status">
              <b>{t('mov_avisos')}</b>
              <ul>{previa.avisos.map((aviso, indice) => <li key={indice}>{aviso}</li>)}</ul>
            </div>
          )}

          {erro && <p className="mf-aviso" role="alert">{erro}</p>}
        </div>
        <div className="fam-df">
          <span className="fam-hint">{previa ? t('mov_modulos_na_fila', { n: previa.componentes.length }) : t('mov_sem_previa')}</span>
          <span style={{ flex: 1 }} />
          <button className="fam-bt" onClick={fechar}>{tm('dlc_btn_cancel')}</button>
          <button className="fam-bt pri" disabled={!podeCriar} onClick={criar}>{t('mov_criar')}</button>
        </div>
      </div>
    </div>
  );
}

export function MontarFila(): ReactElement | null {
  const aberta = useMontarFila((s) => s.aberta);
  const fechar = useMontarFila((s) => s.fechar);
  const p = useProject();
  const selection = useUi((s) => s.selection);
  const levelId = useUi((s) => s.levelId);
  if (!aberta) return null;
  const parede = paredeSelecionada(p, selection, levelId);
  if (!parede) return <SemParede fechar={fechar} />;
  return <Conteudo key={parede.id} p={p} parede={parede} levelId={levelId} />;
}
