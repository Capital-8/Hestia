import {
  alterarDivisaoItem,
  definirTampoCaixaria,
  encontrarDivisaoPorPecaId,
  encontrarVao,
  preencherVao,
  type Familia,
  type ModoDivisao,
  type Peca,
  type PreenchimentoVao,
} from '@hestia/model';
import type { ReactElement } from 'react';
import {
  ESTILOS_PORTA,
  LinhaNumero,
  LinhaSelect,
  MODOS_DIVISAO,
  MONTAGENS_FRENTE,
} from './FamiliaCaixariaBase.tsx';
import { executarPeca } from './familiaPecaAviso.ts';
import { useFamilia } from './familiaStore.ts';

const PILLS_RECUO: Array<[number, string]> = [
  [-20, 'Avançar 20'],
  [0, 'Rente (0)'],
  [20, 'Recuar 20'],
  [50, 'Recuar 50'],
];

function textoRecuo(recuo: number): string {
  if (recuo < 0) return `Avança ${Math.abs(recuo)} mm além da frente`;
  if (recuo > 0) return `Recua ${recuo} mm para dentro`;
  return 'Rente à face frontal (0 mm)';
}

export function EditorPreenchimentoVao({
  vaoId,
  p,
}: {
  vaoId: string;
  p: Exclude<PreenchimentoVao, { tipo: 'nenhum' }>;
}): ReactElement {
  const atualizar = (proximo: PreenchimentoVao): void => {
    executarPeca('Alterar preenchimento do vão', (f) => preencherVao(f, vaoId, proximo));
  };

  return (
    <>
      <div className="fam-cx-sub">Preenchimento: {p.tipo} ({vaoId})</div>
      {p.tipo === 'porta' && (
        <>
          <LinhaSelect id="cx-vao-porta-est" rotulo="Estilo" valor={p.estilo} opcoes={ESTILOS_PORTA} onChange={(estilo) => atualizar({ ...p, estilo })} />
          <LinhaSelect id="cx-vao-porta-mont" rotulo="Montagem" valor={p.montagem} opcoes={MONTAGENS_FRENTE} onChange={(montagem) => atualizar({ ...p, montagem })} />
          {p.estilo === 'giro_1' && (
            <LinhaSelect
              id="cx-vao-porta-lado"
              rotulo="Dobradiça"
              valor={p.dobradicaLado ?? 'esquerda'}
              opcoes={[['esquerda', 'Esquerda'], ['direita', 'Direita']]}
              onChange={(dobradicaLado) => atualizar({ ...p, dobradicaLado })}
            />
          )}
          {vaoId !== 'raiz' && (
            <div className="fam-cx-acoes-lin">
              <button
                type="button"
                className="fam-bt"
                onClick={() => executarPeca('Aplicar porta no módulo inteiro', (f) => {
                  const err = preencherVao(f, vaoId, { tipo: 'nenhum' });
                  if (err) return err;
                  return preencherVao(f, 'raiz', p);
                })}
              >
                Cobrir módulo inteiro
              </button>
            </div>
          )}
        </>
      )}
      {p.tipo === 'gavetas' && (
        <>
          <div className="fam-row">
            <label>Qtd. gavetas</label>
            <div className="fam-cx-pills" style={{ padding: 0 }}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button key={n} type="button" className={`fam-cx-pill${p.quantidade === n ? ' on' : ''}`}
                  onClick={() => atualizar({ ...p, quantidade: n })}>{n}</button>
              ))}
            </div>
          </div>
          <LinhaNumero id="cx-vao-gav-qtd" rotulo="Quantidade" valor={p.quantidade} min={1} max={24}
            onChange={(quantidade) => Number.isInteger(quantidade) && atualizar({ ...p, quantidade })} />
          <LinhaSelect id="cx-vao-gav-mont" rotulo="Montagem" valor={p.montagem} opcoes={MONTAGENS_FRENTE} onChange={(montagem) => atualizar({ ...p, montagem })} />
        </>
      )}
      {p.tipo === 'cabideiro' && (
        <LinhaNumero id="cx-vao-cab-off" rotulo="Afastamento topo (mm)" valor={p.alturaOffsetTopo ?? 60} min={0} step={5}
          onChange={(alturaOffsetTopo) => atualizar({ ...p, alturaOffsetTopo })} />
      )}
      {p.tipo === 'ripado' && (
        <>
          <LinhaSelect id="cx-vao-rip-dir" rotulo="Direção" valor={p.direcao}
            opcoes={[['vertical', 'Vertical'], ['horizontal', 'Horizontal']]} onChange={(direcao) => atualizar({ ...p, direcao })} />
          <LinhaNumero id="cx-vao-rip-larg" rotulo="Largura ripa (mm)" valor={p.larguraRipa} min={5} step={1}
            onChange={(larguraRipa) => atualizar({ ...p, larguraRipa })} />
          <LinhaNumero id="cx-vao-rip-esp" rotulo="Espaçamento (mm)" valor={p.espacamento} min={0} step={1}
            onChange={(espacamento) => atualizar({ ...p, espacamento })} />
        </>
      )}
      {p.tipo === 'sapateira' && (
        <LinhaNumero id="cx-vao-sap-qtd" rotulo="Prateleiras" valor={p.quantidade} min={1} max={32}
          onChange={(quantidade) => Number.isInteger(quantidade) && atualizar({ ...p, quantidade })} />
      )}
      <div className="fam-cx-acoes-lin">
        <button type="button" className="fam-bt" onClick={() => executarPeca('Limpar vão', (f) => preencherVao(f, vaoId, { tipo: 'nenhum' }))}>
          Remover do vão
        </button>
      </div>
    </>
  );
}

export function FamiliaCaixariaPecaCtrl({ familia, peca }: { familia: Familia; peca: Peca }): ReactElement | null {
  const cx = familia.caixaria;
  if (!cx) return null;

  const divMatch = encontrarDivisaoPorPecaId(cx.raiz, peca.id);
  if (divMatch) {
    const { vaoId, eixo, item } = divMatch;
    const recuo = item.recuoFrente ?? 0;
    const exibido = item.modo === 'proporcional' ? Math.round(item.valor * 100) : Math.round(item.valor);
    const setRecuo = (recuoFrente: number): void => {
      executarPeca('Alterar avanço/recuo frontal', (f) => alterarDivisaoItem(f, vaoId, item.id, { recuoFrente }));
    };

    return (
      <div className="fam-grp">
        <div className="fam-gh">{eixo === 'z' ? 'Prateleira interna' : 'Divisória vertical'} ({vaoId})</div>
        <div className="fam-cx-sub">Avanço / Recuo frontal</div>
        <div className="fam-cx-status">{textoRecuo(recuo)}</div>
        <div className="fam-cx-pills">
          {PILLS_RECUO.map(([val, rot]) => (
            <button key={val} type="button" className={`fam-cx-pill${recuo === val ? ' on' : ''}`} onClick={() => setRecuo(val)}>
              {rot}
            </button>
          ))}
        </div>
        <div className="fam-cx-slider-row">
          <span className="mono">-100</span>
          <input
            aria-label="Avanço ou recuo frontal em mm"
            type="range"
            min={-100}
            max={200}
            step={5}
            value={Math.min(200, Math.max(-100, recuo))}
            onChange={(e) => setRecuo(Number(e.target.value))}
          />
          <span className="mono">+200</span>
        </div>
        <LinhaNumero id="cx-peca-recuo" rotulo="Avanço(-) / Recuo(+)" valor={recuo} min={-500} max={1000} step={5} onChange={setRecuo} />
        <div className="fam-cx-sub">Posição no vão</div>
        <LinhaSelect
          id="cx-peca-modo"
          rotulo="Referência"
          valor={item.modo}
          opcoes={MODOS_DIVISAO}
          onChange={(modo: ModoDivisao) => {
            const valor = modo === 'proporcional' ? 0.5 : 300;
            executarPeca('Alterar modo da divisão', (f) => alterarDivisaoItem(f, vaoId, item.id, { modo, valor }));
          }}
        />
        <LinhaNumero
          id="cx-peca-pos"
          rotulo={item.modo === 'proporcional' ? 'Proporção (%)' : 'Distância (mm)'}
          valor={exibido}
          min={1}
          max={item.modo === 'proporcional' ? 99 : undefined}
          step={item.modo === 'proporcional' ? 1 : 5}
          onChange={(bruto) => {
            const valor = item.modo === 'proporcional' ? Math.min(0.99, Math.max(0.01, bruto / 100)) : bruto;
            executarPeca('Alterar posição da divisão', (f) => alterarDivisaoItem(f, vaoId, item.id, { valor }));
          }}
        />
        <div className="fam-cx-acoes-lin">
          <button type="button" className="fam-bt" onClick={() => useFamilia.getState().set({ sel: null, vaoSel: vaoId })}>
            Ver vão pai ({vaoId})
          </button>
        </div>
      </div>
    );
  }

  if (peca.id === 'cx_tampo' && cx.tampo) {
    const tampo = cx.tampo;
    return (
      <div className="fam-grp">
        <div className="fam-gh">Tampo</div>
        <LinhaNumero id="cx-peca-tampo-esp" rotulo="Espessura (mm)" valor={tampo.espessura} min={10} step={1}
          onChange={(espessura) => executarPeca('Alterar espessura do tampo', (f) => (f.caixaria?.tampo ? definirTampoCaixaria(f, { ...f.caixaria.tampo, espessura }) : null))} />
        <LinhaNumero id="cx-peca-tampo-av" rotulo="Avanço frente (mm)" valor={tampo.avancoFrente} min={-500} step={5}
          onChange={(avancoFrente) => executarPeca('Alterar avanço do tampo', (f) => (f.caixaria?.tampo ? definirTampoCaixaria(f, { ...f.caixaria.tampo, avancoFrente }) : null))} />
      </div>
    );
  }

  const vaoPreench = peca.grupo ? encontrarVao(cx.raiz, peca.grupo) : null;
  const p = vaoPreench?.vao.preenchimento;
  if (vaoPreench && p && p.tipo !== 'nenhum') {
    return (
      <div className="fam-grp">
        <div className="fam-gh">Caixaria da peça</div>
        <EditorPreenchimentoVao vaoId={vaoPreench.vao.id} p={p} />
      </div>
    );
  }

  return null;
}
