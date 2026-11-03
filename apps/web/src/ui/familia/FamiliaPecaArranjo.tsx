import { arranjoLinear, type Eixo, type Peca } from '@hestia/model';
import { useState, type ReactElement } from 'react';
import { executarPeca } from './familiaPecaAviso.ts';
import { PopoverPeca } from './FamiliaPecaPopover.tsx';

/** Grupo "Ações" da peça: arranjo linear (n cópias com passo) sobre um eixo, via `arranjoLinear` do modelo. */

export function FamiliaPecaArranjo({ peca }: { peca: Peca }): ReactElement {
  const [ancora, setAncora] = useState<DOMRect | null>(null);
  return (
    <>
      <div className="fam-row acao">
        <span className="fam-acao-rotulo">Repetição</span>
        <button type="button" className="fam-bt" onClick={(e) => setAncora(e.currentTarget.getBoundingClientRect())}>Arranjo linear…</button>
      </div>
      {ancora !== null && (
        <PopoverPeca ancora={ancora} titulo="Arranjo linear" onFechar={() => setAncora(null)}>
          <FormularioArranjo peca={peca} onFechar={() => setAncora(null)} />
        </PopoverPeca>
      )}
    </>
  );
}

function FormularioArranjo({ peca, onFechar }: { peca: Peca; onFechar: () => void }): ReactElement {
  const [eixo, setEixo] = useState<Eixo>(peca.eixo);
  const [n, setN] = useState('2');
  const [passo, setPasso] = useState('100');
  const [erro, setErro] = useState<string | null>(null);

  const aplicar = (): void => {
    const motivo = executarPeca('Arranjo linear', (f) => arranjoLinear(f, peca.id, eixo, n.trim(), passo.trim()));
    if (motivo !== null) {
      setErro(motivo);
      return;
    }
    onFechar();
  };

  return (
    <>
      <div className="fam-row"><label htmlFor="ar-eixo">Eixo</label>
        <select id="ar-eixo" className="fam-f" value={eixo} onChange={(e) => setEixo(e.target.value as Eixo)}>
          <option value="x">X</option><option value="y">Y</option><option value="z">Z</option>
        </select>
      </div>
      <div className="fam-row"><label htmlFor="ar-n">N (fórmula)</label>
        <input id="ar-n" className="fam-f mono" value={n} onChange={(e) => setN(e.target.value)} />
      </div>
      <div className="fam-row"><label htmlFor="ar-passo">Passo</label>
        <input id="ar-passo" className="fam-f mono" value={passo} onChange={(e) => setPasso(e.target.value)} />
      </div>
      <div className="fam-hint">A origem no eixo vira (origem atual) + (i − 1) × (passo); a peça precisa ainda não repetir.</div>
      {erro !== null && <div className="fam-msg erro" role="alert">{erro}</div>}
      <div className="fam-pop-acoes">
        <button type="button" className="fam-bt" onClick={onFechar}>Cancelar</button>
        <button type="button" className="fam-bt pri" onClick={aplicar}>Aplicar</button>
      </div>
    </>
  );
}
