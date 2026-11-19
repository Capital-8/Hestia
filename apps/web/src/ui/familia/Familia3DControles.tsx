import type { ReactElement } from 'react';
import { limitarPosicao, type LimitesPorEixo, type Vista3D } from './familia3d.ts';
import type { Corte, EixoCorte } from './familiaStore.ts';

/*
 * Barra discreta sobre o canvas da vista 3D. Só apresenta os controles e avisa o wrapper; o visualizador e o estado
 * ficam com `Familia3D`/store. Os sliders de explodir e opacidade seguem os valores do editor.
 */

export interface Familia3DControlesProps {
  aoVista: (nome: Vista3D) => void;
  explodir: number;
  aoExplodir: (valor: number) => void;
  opacidade: number;
  aoOpacidade: (valor: number) => void;
  corte: Corte;
  aoCorte: (patch: Partial<Corte>) => void;
  limites: LimitesPorEixo;
}

const VISTAS: ReadonlyArray<readonly [Vista3D, string]> = [
  ['iso', 'Iso'],
  ['frente', 'Frente'],
  ['lateral', 'Lateral'],
  ['planta', 'Planta'],
];

const EIXOS: ReadonlyArray<readonly [EixoCorte, string]> = [['x', 'X'], ['y', 'Y'], ['z', 'Z']];

export function Familia3DControles({
  aoVista,
  explodir,
  aoExplodir,
  opacidade,
  aoOpacidade,
  corte,
  aoCorte,
  limites,
}: Familia3DControlesProps): ReactElement {
  const faixa = limites[corte.eixo];
  const minimo = faixa?.min ?? 0;
  const maximo = faixa?.max ?? 1;
  const passo = maximo > minimo ? (maximo - minimo) / 100 : 0.01;
  const posicao = limitarPosicao(corte.posicao, faixa);
  const trocarEixo = (eixo: EixoCorte): void => {
    aoCorte({ eixo, posicao: limitarPosicao(corte.posicao, limites[eixo]) });
  };
  return (
    <div className="fam3d-controles" role="toolbar" aria-label="Controles da vista 3D">
      <div className="fam3d-grupo" role="group" aria-label="Vistas rápidas">
        {VISTAS.map(([nome, rotulo]) => (
          <button key={nome} type="button" onClick={() => aoVista(nome)} title={`Vista ${rotulo.toLowerCase()}`}>
            {rotulo}
          </button>
        ))}
      </div>
      <label className="fam3d-campo">
        Explodir
        <input type="range" aria-label="Explodir a família" min={0} max={1} step={0.05} value={explodir} onChange={(e) => aoExplodir(Number(e.target.value))} />
      </label>
      <label className="fam3d-campo">
        Opacidade
        <input type="range" aria-label="Opacidade das peças" min={0.1} max={1} step={0.05} value={opacidade} onChange={(e) => aoOpacidade(Number(e.target.value))} />
      </label>
      <label className="fam3d-campo">
        <input type="checkbox" aria-label="Corte ativo" checked={corte.ativo} onChange={(e) => aoCorte({ ativo: e.target.checked })} />
        Corte
      </label>
      <label className="fam3d-campo">
        Eixo
        <select aria-label="Eixo do corte" value={corte.eixo} onChange={(e) => trocarEixo(e.target.value as EixoCorte)}>
          {EIXOS.map(([eixo, rotulo]) => <option key={eixo} value={eixo}>{rotulo}</option>)}
        </select>
      </label>
      <label className="fam3d-campo">
        Posição
        <input
          type="range"
          aria-label="Posição do plano de corte"
          min={minimo}
          max={maximo}
          step={passo}
          value={posicao}
          disabled={!corte.ativo}
          onChange={(e) => aoCorte({ posicao: Number(e.target.value) })}
        />
      </label>
    </div>
  );
}
