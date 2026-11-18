import type { Peca } from '@hestia/model';
import { useEffect, useState, type ReactElement } from 'react';
import {
  adicionarPonto,
  contornoDePontos,
  moverPonto,
  pontosDoContorno,
  removerPonto,
  validarContorno,
  type PontoContorno,
} from './familiaContorno.ts';
import { executarPeca } from './familiaPecaAviso.ts';
import './familiaPecaExtras.css';

/**
 * Editor do contorno poligonal da peça: vértices em fórmulas (x, y), inclusão, remoção e reordenação. O contorno só é
 * gravado com pelo menos 3 vértices e fórmulas que compilam; "Remover contorno" volta ao retângulo. Cada ação desfaz.
 */

export function FamiliaPecaContorno({ peca }: { peca: Peca }): ReactElement {
  const [pontos, setPontos] = useState<PontoContorno[]>(() => pontosDoContorno(peca.contorno));
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setPontos(pontosDoContorno(peca.contorno));
    setErro(null);
  }, [peca]);

  const editar = (indice: number, eixo: 0 | 1, valor: string): void => {
    setPontos((atuais) => atuais.map((ponto, i): PontoContorno => {
      if (i !== indice) return ponto;
      return eixo === 0 ? [valor, ponto[1]] : [ponto[0], valor];
    }));
  };

  const aplicar = (): void => {
    const motivo = validarContorno(pontos);
    if (motivo !== null) {
      setErro(motivo);
      return;
    }
    const recusa = executarPeca('Definir contorno', (f) => {
      const alvo = f.pecas.find((x) => x.id === peca.id);
      if (alvo === undefined) return `peça “${peca.id}” não existe`;
      alvo.contorno = contornoDePontos(pontos);
      return null;
    });
    setErro(recusa);
  };

  const remover = (): void => {
    const recusa = executarPeca('Remover contorno', (f) => {
      const alvo = f.pecas.find((x) => x.id === peca.id);
      if (alvo === undefined) return `peça “${peca.id}” não existe`;
      delete alvo.contorno;
      return null;
    });
    if (recusa === null) {
      setPontos([]);
      setErro(null);
    } else {
      setErro(recusa);
    }
  };

  const poligonal = peca.contorno?.tipo === 'poligono';

  return (
    <div className="fam-contorno">
      <div className="fam-hint">
        {poligonal ? 'Contorno poligonal gravado. Edite os vértices e aplique.' : 'Sem contorno poligonal: a peça usa o retângulo.'}
      </div>
      {pontos.map((ponto, indice) => (
        <div className="fam-row fam-contorno-vertice" key={indice}>
          <span className="fam-contorno-indice">{indice + 1}</span>
          <input
            className="fam-f mono"
            aria-label={`Vértice ${indice + 1} x`}
            value={ponto[0]}
            onChange={(e) => editar(indice, 0, e.target.value)}
          />
          <input
            className="fam-f mono"
            aria-label={`Vértice ${indice + 1} y`}
            value={ponto[1]}
            onChange={(e) => editar(indice, 1, e.target.value)}
          />
          <button type="button" className="fam-bt fam-contorno-bt" title="Subir vértice" aria-label={`Subir vértice ${indice + 1}`} disabled={indice === 0} onClick={() => setPontos((atuais) => moverPonto(atuais, indice, -1))}>↑</button>
          <button type="button" className="fam-bt fam-contorno-bt" title="Descer vértice" aria-label={`Descer vértice ${indice + 1}`} disabled={indice === pontos.length - 1} onClick={() => setPontos((atuais) => moverPonto(atuais, indice, 1))}>↓</button>
          <button type="button" className="fam-bt fam-contorno-bt" title="Remover vértice" aria-label={`Remover vértice ${indice + 1}`} onClick={() => setPontos((atuais) => removerPonto(atuais, indice))}>✕</button>
        </div>
      ))}
      <div className="fam-contorno-acoes">
        <button type="button" className="fam-bt" onClick={() => setPontos((atuais) => adicionarPonto(atuais))}>Adicionar vértice</button>
        <button type="button" className="fam-bt pri" onClick={aplicar} disabled={pontos.length === 0}>Aplicar contorno</button>
        <button type="button" className="fam-bt" onClick={remover} disabled={!poligonal && pontos.length === 0}>Remover contorno</button>
      </div>
      <div className="fam-hint">Vértices em (x, y) no plano da chapa, em fórmulas (ex.: 0, L, A / 2). Mínimo de 3.</div>
      {erro !== null && <div className="fam-msg erro" role="alert">{erro}</div>}
    </div>
  );
}
