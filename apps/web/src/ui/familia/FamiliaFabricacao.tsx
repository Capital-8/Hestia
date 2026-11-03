import type { Familia, Peca } from '@hestia/model';
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
  const materiais = familia.parametros.filter((p) => p.tipo === 'chapa' || p.tipo === 'material');

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
          <div key={lado} className="fam-fita-lado">
            <label htmlFor={`fab-${peca.id}-fita-${lado}`}>{rotulo}</label>
            <input
              id={`fab-${peca.id}-fita-${lado}`}
              className="fam-f"
              value={peca.fita?.[lado] ?? ''}
              placeholder="sem fita"
              maxLength={40}
              onChange={(e) => trocarFita(lado, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
