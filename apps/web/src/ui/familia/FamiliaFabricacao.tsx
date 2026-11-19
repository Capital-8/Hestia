import type { Familia, Fita, Peca } from '@hestia/model';
import type { ReactElement } from 'react';
import { executarPeca } from './familiaPecaAviso.ts';
import { useFamilia } from './familiaStore.ts';

/** Grupo Fabricação das propriedades da peça: veio, material (id livre ou parâmetro de chapa/material) e fita nos 4 lados. */

type LadoFita = 'n' | 's' | 'l' | 'o';

const LADOS: ReadonlyArray<{ lado: LadoFita; rotulo: string }> = [
  { lado: 'n', rotulo: 'Norte' },
  { lado: 's', rotulo: 'Sul' },
  { lado: 'l', rotulo: 'Leste' },
  { lado: 'o', rotulo: 'Oeste' },
];

const VEIOS: ReadonlyArray<{ valor: '' | 'a' | 'b' | 'livre'; rotulo: string }> = [
  { valor: '', rotulo: '—' },
  { valor: 'a', rotulo: 'A' },
  { valor: 'b', rotulo: 'B' },
  { valor: 'livre', rotulo: 'Livre' },
];

function alterar(pecaId: string, fn: (p: Peca) => void): (f: Familia) => string | null {
  return (f) => {
    const p = f.pecas.find((x) => x.id === pecaId);
    if (p === undefined) return `peça “${pecaId}” não existe`;
    fn(p);
    return null;
  };
}

function limparFita(p: Peca, lado: LadoFita): void {
  if (p.fita === undefined) return;
  delete p.fita[lado];
  if (p.fita.n === undefined && p.fita.s === undefined && p.fita.l === undefined && p.fita.o === undefined) delete p.fita;
}

export function FamiliaFabricacao({ peca }: { peca: Peca }): ReactElement {
  const familia = useFamilia((s) => s.historico.atual);
  const catalogo = useFamilia((s) => s.catalogo);
  const materiais = familia.parametros.filter((p) => p.tipo === 'chapa' || p.tipo === 'material');
  const fitas = catalogo.fitas;

  const trocarVeio = (valor: string): void => {
    executarPeca('Alterar veio', alterar(peca.id, (p) => {
      if (valor === '') delete p.veio;
      else p.veio = valor as 'a' | 'b' | 'livre';
    }));
  };

  const trocarMaterial = (valor: string): void => {
    executarPeca('Alterar material', alterar(peca.id, (p) => {
      if (valor === '') delete p.material;
      else p.material = valor;
    }));
  };

  const trocarFita = (lado: LadoFita, valor: string): void => {
    executarPeca('Alterar fita', alterar(peca.id, (p) => {
      const limpo = valor.trim();
      if (limpo === '') {
        limparFita(p, lado);
        return;
      }
      const fita = p.fita ?? {};
      fita[lado] = limpo;
      p.fita = fita;
    }));
  };

  return (
    <div className="fam-grp">
      <div className="fam-gh">Fabricação</div>
      <div className="fam-row"><label htmlFor={`fab-${peca.id}-veio`}>Veio</label>
        <select id={`fab-${peca.id}-veio`} className="fam-f" value={peca.veio ?? ''} onChange={(e) => trocarVeio(e.target.value)}>
          {VEIOS.map((v) => <option key={v.valor} value={v.valor}>{v.rotulo}</option>)}
        </select>
      </div>
      <div className="fam-row"><label htmlFor={`fab-${peca.id}-material`}>Material</label>
        <input
          id={`fab-${peca.id}-material`}
          className="fam-f mono"
          value={peca.material ?? ''}
          placeholder="id de material ou parâmetro"
          onChange={(e) => trocarMaterial(e.target.value)}
        />
      </div>
      {materiais.length > 0 && (
        <div className="fam-row"><label htmlFor={`fab-${peca.id}-material-sel`}>Parâmetro</label>
          <select
            id={`fab-${peca.id}-material-sel`}
            className="fam-f"
            value={materiais.some((m) => m.id === peca.material) ? peca.material : ''}
            onChange={(e) => trocarMaterial(e.target.value)}
          >
            <option value="">—</option>
            {materiais.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </div>
      )}
      <div className="fam-fita">
        {LADOS.map(({ lado, rotulo }) => (
          <SeletorFita
            key={lado}
            pecaId={peca.id}
            lado={lado}
            rotulo={rotulo}
            valor={peca.fita?.[lado] ?? ''}
            fitas={fitas}
            aoTrocar={trocarFita}
          />
        ))}
      </div>
    </div>
  );
}

interface PropsSeletorFita {
  pecaId: string;
  lado: LadoFita;
  rotulo: string;
  valor: string;
  fitas: readonly Fita[];
  aoTrocar: (lado: LadoFita, valor: string) => void;
}

/** Select de fita por lado: “Sem fita”, as fitas do catálogo e o valor atual mesmo que tenha saído do catálogo. */
function SeletorFita({ pecaId, lado, rotulo, valor, fitas, aoTrocar }: PropsSeletorFita): ReactElement {
  const atual = valor === 'nenhuma' ? '' : valor;
  const foraDoCatalogo = atual !== '' && !fitas.some((f) => f.id === atual);
  const id = `fab-${pecaId}-fita-${lado}`;
  return (
    <div className="fam-fita-lado">
      <label htmlFor={id}>{rotulo}</label>
      <select id={id} className="fam-f" value={atual} onChange={(e) => aoTrocar(lado, e.target.value)}>
        <option value="">Sem fita</option>
        {foraDoCatalogo && <option value={atual}>{atual} (fora do catálogo)</option>}
        {fitas.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
      </select>
    </div>
  );
}
