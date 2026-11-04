import { useEffect, type ReactElement } from 'react';
import { useProject } from '../../editor/controller.ts';
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

/** Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z no editor; não dispara quando o foco está num campo de texto. */
function useAtalhos(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!useFamilia.getState().aberta) return;
      const alvo = e.target as HTMLElement | null;
      const digitando = alvo !== null && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable);
      if (digitando || !(e.ctrlKey || e.metaKey) || e.altKey) return;
      const tecla = e.key.toLowerCase();
      if (tecla === 'z' && !e.shiftKey) {
        e.preventDefault();
        useFamilia.getState().desfazer();
      } else if (tecla === 'y' || (tecla === 'z' && e.shiftKey)) {
        e.preventDefault();
        useFamilia.getState().refazer();
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
  const res = useResolucao();
  const projeto = useProject();
  useAtalhos();
  if (!aberta) return null;
  const set = useFamilia.getState().set;
  const tipo = familia.tipos.find((t) => t.id === tipoId);
  return (
    <div className="fam-root" role="region" aria-label="Editor de família">
      <div className="fam-doctabs">
        <button onClick={() => useFamilia.getState().ocultar()} title="Voltar ao projeto (a família fica guardada)">{projeto.name}</button>
        <span className="on fam-aba">Família: {familia.nome}</span>
        <button className="fam-novo-btn" onClick={() => set({ dialogo: 'novo' })}>+ Novo módulo…</button>
        <span className="fam-aviso">Protótipo de interface: nada é gravado no projeto</span>
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
              ? <Familia3D key={familia.id} pecas={res.pecas} sel={sel} onSel={(id) => useFamilia.getState().selecionarPeca(id)} explodir={explodir} opacidade={opacidade} corte={corte} portas={portas} detalhe={detalhe} />
              : <FamiliaVista pecas={res.pecas} vista={vista} sel={sel} onSel={(id) => useFamilia.getState().selecionarPeca(id)} explodir={0} portas={portas} detalhe={detalhe} />}
          </div>
          <div className="fam-vcb"><span>1:10</span><span>Detalhe: {detalhe}</span><span>Estilo: sombreado</span><span style={{ marginLeft: 'auto' }}>Tipo: {tipo?.nome}</span></div>
        </div>
        <aside className="fam-dock right"><div className="fam-ph">Propriedades</div><div className="fam-pb"><PropriedadesFamilia /></div></aside>
      </div>
      <div className="fam-status">
        <span><span className="fam-dot" />Motor: TS</span><span>Peças resolvidas: {res.pecas.length}</span><span>arredondado a 1 µm</span>
        {ferramenta && <span>Ferramenta: {ferramenta} (ainda não cria peças)</span>}
        <span style={{ flex: 1 }} /><span>Alterações não carregadas no projeto</span>
      </div>
      <FamiliaDialogos />
    </div>
  );
}
