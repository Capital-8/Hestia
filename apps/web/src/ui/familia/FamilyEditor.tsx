import type { ModoInteracao3DFamilia } from '@hestia/render';
import { useEffect, type ReactElement } from 'react';
import { useProject } from '../../editor/controller.ts';
import { useT } from '../../editor/i18n.ts';
import { Familia3D } from './Familia3D.tsx';
import { FamiliaDialogos } from './FamiliaDialogos.tsx';
import { FamiliaFaixa } from './FamiliaFaixa.tsx';
import { NavegadorFamilia, PropriedadesFamilia } from './FamiliaPaineis.tsx';
import { FamiliaVista } from './FamiliaVista.tsx';
import { useFamilia, useResolucao, type DetalheFamilia, type VistaFamilia } from './familiaStore.ts';
import './familia.css';

/**
 * Editor de famílias (ADR 0049 §4.2): uma aba ao lado do projeto, no mesmo programa. O projeto continua montado por
 * baixo (nada fecha, nada é salvo, a vista e a seleção ficam como estavam); "Projeto" volta a ele e o botão Componente
 * da faixa traz a aba de volta com a família como foi deixada.
 */

const VISTAS: Array<[VistaFamilia, string]> = [['3d', 'Vista 3D'], ['frente', 'Frente'], ['lateral', 'Lateral'], ['planta', 'Planta']];
const DETALHES: DetalheFamilia[] = ['grosso', 'medio', 'fino'];

const DICAS_MODO_3D: Readonly<Record<ModoInteracao3DFamilia, string>> = {
  selecionar: 'Modo 3D: Selecionar — clique em uma peça ou vão para inspecionar (H = Prateleira, V = Divisória)',
  prateleira: 'Modo 3D: Prateleira — passe o mouse dentro de um vão e clique para inserir (Esc volta para Selecionar)',
  divisoria: 'Modo 3D: Divisória — passe o mouse dentro de um vão e clique para inserir (Esc volta para Selecionar)',
  porta: 'Modo 3D: Porta — passe o mouse sobre um vão e clique para preencher (Esc volta para Selecionar)',
  gavetas: 'Modo 3D: Gavetas — passe o mouse sobre um vão e clique para inserir conjunto de gavetas (Esc volta para Selecionar)',
  cabideiro: 'Modo 3D: Cabideiro — clique em um vão para inserir cabideiro (Esc volta para Selecionar)',
  ripado: 'Modo 3D: Ripado — clique em um vão para inserir painel ripado (Esc volta para Selecionar)',
  sapateira: 'Modo 3D: Sapateira — clique em um vão para inserir prateleiras de sapateira (Esc volta para Selecionar)',
  tampo: 'Modo 3D: Tampo — clique na face superior do móvel para ativar/remover o tampo (Esc volta para Selecionar)',
  tamponamento: 'Modo 3D: Tamponamento — clique em uma face externa (esquerda/direita/topo/base) para alternar (Esc volta para Selecionar)',
  recorte: 'Modo 3D: Recorte — clique no tampo para alternar recorte de pia/cooktop (Esc volta para Selecionar)',
};

/** Atalhos de teclado no editor (Ctrl+Z/Y e ferramentas 3D Esc/H/V); ignora quando o foco está em campo editável. */
function useAtalhos(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = useFamilia.getState();
      if (!s.aberta) return;
      const alvo = e.target as HTMLElement | null;
      const digitando = alvo !== null && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable);
      if (digitando) return;
      const tecla = e.key.toLowerCase();

      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (tecla === 'z' && !e.shiftKey) {
          e.preventDefault();
          s.desfazer();
        } else if (tecla === 'y' || (tecla === 'z' && e.shiftKey)) {
          e.preventDefault();
          s.refazer();
        }
        return;
      }

      if (e.altKey || s.dialogo !== null) return;
      if (e.key === 'Escape') {
        if (s.modo3d !== 'selecionar') {
          e.preventDefault();
          s.set({ modo3d: 'selecionar' });
        }
      } else if (tecla === 'h') {
        e.preventDefault();
        s.set({ modo3d: 'prateleira', ferramenta: null });
      } else if (tecla === 'v') {
        e.preventDefault();
        s.set({ modo3d: 'divisoria', ferramenta: null });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function FamilyEditor(): ReactElement | null {
  const aberta = useFamilia((s) => s.aberta);
  const familia = useFamilia((s) => s.historico.atual);
  const vista = useFamilia((s) => s.vista);
  const explodir = useFamilia((s) => s.explodir);
  const opacidade = useFamilia((s) => s.opacidade);
  const corte = useFamilia((s) => s.corte);
  const portas = useFamilia((s) => s.portas);
  const detalhe = useFamilia((s) => s.detalhe);
  const sel = useFamilia((s) => s.sel);
  const tipoId = useFamilia((s) => s.tipoId);
  const ferramenta = useFamilia((s) => s.ferramenta);
  const modo3d = useFamilia((s) => s.modo3d);
  const res = useResolucao();
  const projeto = useProject();
  useAtalhos();
  const { t } = useT();
  if (!aberta) return null;
  const set = useFamilia.getState().set;
  const tipo = familia.tipos.find((t) => t.id === tipoId);
  return (
    <div className="fam-root" role="region" aria-label="Editor de família">
      <div className="fam-doctabs">
        <button onClick={() => useFamilia.getState().ocultar()} title="Voltar ao projeto (a família fica guardada)">{projeto.name}</button>
        <span className="on fam-aba">Família: {familia.nome}</span>
        <button className="fam-novo-btn" onClick={() => set({ dialogo: 'novo' })}>+ Novo módulo…</button>
        <span className="fam-selo-exp" title={t('fam_exp_dica')}>{t('fam_exp_selo')}</span>
        <span className="fam-aviso">{t('fam_exp_aviso')}</span>
      </div>
      <FamiliaFaixa />
      <div className="fam-body">
        <aside className="fam-dock"><div className="fam-ph">Navegador da família</div><div className="fam-pb"><NavegadorFamilia /></div></aside>
        <div className="fam-work">
          <div className="fam-vtabs">
            {VISTAS.map(([v, nome]) => <button key={v} className={vista === v ? 'on' : ''} onClick={() => set({ vista: v })}>{nome}</button>)}
            <div className="fam-vopts">
              <label><input type="checkbox" checked={portas} onChange={(e) => set({ portas: e.target.checked })} /> Mostrar portas</label>
              <label>Detalhe <select className="fam-f" value={detalhe} onChange={(e) => set({ detalhe: e.target.value as DetalheFamilia })} style={{ width: 78 }}>{DETALHES.map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
            </div>
          </div>
          <div className="fam-canvas">
            {vista === '3d'
              ? <Familia3D key={familia.id} familia={familia} env={res.env} pecas={res.pecas} corpos={res.corpos ?? []} ligacoes={res.ligacoes ?? []} sel={sel} onSel={(id) => useFamilia.getState().selecionarPeca(id)} explodir={explodir} opacidade={opacidade} corte={corte} portas={portas} detalhe={detalhe} />
              : <FamiliaVista pecas={res.pecas} vista={vista} sel={sel} onSel={(id) => useFamilia.getState().selecionarPeca(id)} explodir={0} portas={portas} detalhe={detalhe} />}
          </div>
          <div className="fam-vcb"><span>1:10</span><span>Detalhe: {detalhe}</span><span>Estilo: sombreado</span><span style={{ marginLeft: 'auto' }}>Tipo: {tipo?.nome}</span></div>
        </div>
        <aside className="fam-dock right"><div className="fam-ph">Propriedades</div><div className="fam-pb"><PropriedadesFamilia /></div></aside>
      </div>
      <div className="fam-status">
        <span><span className="fam-dot" />Motor: TS</span><span>Peças resolvidas: {res.pecas.length}</span><span>arredondado a 1 µm</span>
        <span>{DICAS_MODO_3D[modo3d]}</span>
        {ferramenta && <span>Ferramenta: {ferramenta}</span>}
        <span style={{ flex: 1 }} /><span>Alterações não carregadas no projeto</span>
      </div>
      <FamiliaDialogos />
    </div>
  );
}
