import { promoverParaParametro, type CampoPeca, type Peca } from '@hestia/model';
import { useState, type ReactElement } from 'react';
import { idPadraoDeNome } from './familiaPeca.ts';
import { executarPeca } from './familiaPecaAviso.ts';
import { useFamilia } from './familiaStore.ts';
import { PopoverPeca } from './FamiliaPecaPopover.tsx';

/** Botão "→P" ao lado de cada medida: abre o popover que promove a cota a parâmetro (estilo etiquetar cota do Revit). */

interface Props {
  peca: Peca;
  campo: CampoPeca;
  rotulo: string;
}

function FormularioPromover({ peca, campo, rotulo, onFechar }: Props & { onFechar: () => void }): ReactElement {
  const familia = useFamilia((s) => s.historico.atual);
  const ocupados = [...familia.parametros.map((p) => p.id), ...familia.planos.map((p) => p.id)];
  const [id, setId] = useState(() => idPadraoDeNome(`${peca.id}_${campo}`, ocupados));
  const [nome, setNome] = useState(`${peca.nome} ${rotulo}`);
  const [erro, setErro] = useState<string | null>(null);

  const promover = (): void => {
    const motivo = executarPeca('Promover a parâmetro', (f) => promoverParaParametro(f, peca.id, campo, id.trim(), nome.trim() || rotulo));
    if (motivo !== null) {
      setErro(motivo);
      return;
    }
    onFechar();
  };

  return (
    <>
      <div className="fam-row"><label htmlFor="pp-id">Id</label>
        <input id="pp-id" className="fam-f mono" value={id} onChange={(e) => setId(e.target.value)} />
      </div>
      <div className="fam-row"><label htmlFor="pp-nome">Nome</label>
        <input id="pp-nome" className="fam-f" value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div className="fam-hint">O campo passa a usar o parâmetro; números viram comprimento e fórmulas viram derivado.</div>
      {erro !== null && <div className="fam-msg erro" role="alert">{erro}</div>}
      <div className="fam-pop-acoes">
        <button type="button" className="fam-bt" onClick={onFechar}>Cancelar</button>
        <button type="button" className="fam-bt pri" onClick={promover}>Promover</button>
      </div>
    </>
  );
}

export function FamiliaPromover({ peca, campo, rotulo }: Props): ReactElement {
  const [ancora, setAncora] = useState<DOMRect | null>(null);
  return (
    <>
      <button
        type="button"
        className="fam-promover"
        title="Promover a parâmetro"
        aria-label={`Promover ${rotulo} a parâmetro`}
        onClick={(e) => setAncora(e.currentTarget.getBoundingClientRect())}
      >
        →P
      </button>
      {ancora !== null && (
        <PopoverPeca ancora={ancora} titulo={`Promover ${rotulo}`} onFechar={() => setAncora(null)}>
          <FormularioPromover peca={peca} campo={campo} rotulo={rotulo} onFechar={() => setAncora(null)} />
        </PopoverPeca>
      )}
    </>
  );
}
