import {
  alterarDivisaoItem,
  dividirVaoEmIguais,
  encontrarVao,
  garantirCaixaria,
  preencherVao,
  removerDivisao,
  resolverVaosCaixaria,
  sincronizarCaixaria,
  type DivisaoItem,
  type ModoDivisao,
  type Vao,
} from '@hestia/model';
import { useMemo, type ReactElement } from 'react';
import {
  ESTILOS_PORTA,
  LinhaNumero,
  LinhaSelect,
  MODOS_DIVISAO,
  MONTAGENS_FRENTE,
  ROTULO_MODO_3D,
  SecaoCaixariaBase,
} from './FamiliaCaixariaBase.tsx';
import { EditorPreenchimentoVao } from './FamiliaCaixariaPecaCtrl.tsx';
import { executarPeca } from './familiaPecaAviso.ts';
import { useFamilia, useResolucao } from './familiaStore.ts';
import './familiaCaixaria.css';

function OpcoesFerramentaAtiva(): ReactElement | null {
  const modo3d = useFamilia((s) => s.modo3d);
  const partesDivisao = useFamilia((s) => s.partesDivisao);
  const recuoFrentePadrao = useFamilia((s) => s.recuoFrentePadrao);
  const estiloPorta = useFamilia((s) => s.estiloPorta);
  const alvoPorta = useFamilia((s) => s.alvoPorta);
  const montagemFrente = useFamilia((s) => s.montagemFrente);
  const qtdGavetas = useFamilia((s) => s.qtdGavetas);
  const set = useFamilia.getState().set;
  if (modo3d === 'selecionar') return null;

  return (
    <>
      <div className="fam-cx-sub">Ferramenta: {ROTULO_MODO_3D[modo3d]}</div>
      {(modo3d === 'prateleira' || modo3d === 'divisoria') && (
        <>
          <div className="fam-row">
            <label>Partes no clique</label>
            <div className="fam-cx-pills" style={{ padding: 0 }}>
              {[1, 2, 3, 4].map((n) => (
                <button key={n} type="button" className={`fam-cx-pill${partesDivisao === n ? ' on' : ''}`}
                  onClick={() => set({ partesDivisao: n })}>{n === 1 ? 'Livre' : `${n} iguais`}</button>
              ))}
            </div>
          </div>
          <div className="fam-row">
            <label>Frente (mm)</label>
            <div className="fam-cx-pills" style={{ padding: 0 }}>
              {[[-20, 'Avançar 20'], [0, 'Rente'], [20, 'Recuar 20']].map(([val, rot]) => (
                <button key={val} type="button" className={`fam-cx-pill${recuoFrentePadrao === val ? ' on' : ''}`}
                  onClick={() => set({ recuoFrentePadrao: Number(val) })}>{rot}</button>
              ))}
            </div>
          </div>
          <LinhaNumero id="cx-tool-recuo" rotulo="Avanço(-) / Recuo(+)" valor={recuoFrentePadrao} min={-500} max={1000} step={5}
            onChange={(v) => set({ recuoFrentePadrao: v })} />
        </>
      )}
      {modo3d === 'porta' && (
        <>
          <LinhaSelect id="cx-tool-porta-est" rotulo="Estilo" valor={estiloPorta} opcoes={ESTILOS_PORTA} onChange={(v) => set({ estiloPorta: v })} />
          <LinhaSelect id="cx-tool-porta-mont" rotulo="Montagem" valor={montagemFrente} opcoes={MONTAGENS_FRENTE} onChange={(v) => set({ montagemFrente: v })} />
          <div className="fam-row">
            <label>Alvo no 3D</label>
            <div className="fam-cx-pills" style={{ padding: 0 }}>
              <button type="button" className={`fam-cx-pill${alvoPorta === 'inteiro' ? ' on' : ''}`}
                onClick={() => set({ alvoPorta: 'inteiro' })}>Módulo inteiro</button>
              <button type="button" className={`fam-cx-pill${alvoPorta === 'vao' ? ' on' : ''}`}
                onClick={() => set({ alvoPorta: 'vao' })}>Só este vão</button>
            </div>
          </div>
          <div className="fam-cx-acoes-lin">
            <button type="button" className="fam-bt"
              onClick={() => executarPeca('Aplicar porta no módulo inteiro', (f) => preencherVao(f, 'raiz', { tipo: 'porta', estilo: estiloPorta, montagem: montagemFrente }))}>
              Aplicar porta no módulo inteiro agora
            </button>
          </div>
        </>
      )}
      {modo3d === 'gavetas' && (
        <>
          <div className="fam-row">
            <label>Qtd. rápida</label>
            <div className="fam-cx-pills" style={{ padding: 0 }}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button key={n} type="button" className={`fam-cx-pill${qtdGavetas === n ? ' on' : ''}`} onClick={() => set({ qtdGavetas: n })}>{n}</button>
              ))}
            </div>
          </div>
          <LinhaNumero id="cx-tool-gav-qtd" rotulo="Quantidade" valor={qtdGavetas} min={1} max={24}
            onChange={(v) => Number.isInteger(v) && set({ qtdGavetas: v })} />
          <LinhaSelect id="cx-tool-gav-mont" rotulo="Montagem" valor={montagemFrente} opcoes={MONTAGENS_FRENTE} onChange={(v) => set({ montagemFrente: v })} />
        </>
      )}
      <div className="fam-cx-acoes-lin">
        <button type="button" className="fam-bt" onClick={() => set({ modo3d: 'selecionar' })}>Voltar para Selecionar (Esc)</button>
      </div>
    </>
  );
}

function EditorItemDivisao({ vaoId, indice, item, extensaoMm }: { vaoId: string; indice: number; item: DivisaoItem; extensaoMm: number }): ReactElement {
  const exibido = item.modo === 'proporcional' ? Math.round(item.valor * 100) : Math.round(item.valor);
  const recuo = item.recuoFrente ?? 0;
  return (
    <div style={{ padding: '4px 8px', borderTop: '1px solid var(--line)', display: 'grid', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5 }}>
        <strong>Divisão {indice + 1}</strong>
        <select
          aria-label={`Modo da divisão ${indice + 1}`}
          className="fam-f"
          style={{ maxWidth: 115 }}
          value={item.modo}
          onChange={(e) => {
            const modo = e.target.value as ModoDivisao;
            const proporcaoAtual = item.modo === 'proporcional' ? item.valor : Math.min(0.99, Math.max(0.01, item.valor / Math.max(1, extensaoMm)));
            const valor = modo === 'proporcional' ? proporcaoAtual : Math.round(Math.max(1, extensaoMm * (modo === 'fixo_inicio' ? proporcaoAtual : 1 - proporcaoAtual)));
            executarPeca('Alterar modo da divisão', (f) => alterarDivisaoItem(f, vaoId, item.id, { modo, valor }));
          }}
        >
          {MODOS_DIVISAO.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
        </select>
      </div>
      <LinhaNumero
        id={`cx-div-${item.id}`}
        rotulo={item.modo === 'proporcional' ? 'Proporção (%)' : 'Distância (mm)'}
        valor={exibido}
        min={1}
        max={item.modo === 'proporcional' ? 99 : undefined}
        step={item.modo === 'proporcional' ? 1 : 5}
        semPadding
        onChange={(bruto) => {
          const valor = item.modo === 'proporcional' ? Math.min(0.99, Math.max(0.01, bruto / 100)) : bruto;
          executarPeca('Alterar valor da divisão', (f) => alterarDivisaoItem(f, vaoId, item.id, { valor }));
        }}
      />
      <LinhaNumero
        id={`cx-div-recuo-${item.id}`}
        rotulo="Avanço(-) / Recuo(+)"
        valor={recuo}
        min={-500}
        max={1000}
        step={5}
        semPadding
        onChange={(recuoFrente) => executarPeca('Alterar recuo frontal', (f) => alterarDivisaoItem(f, vaoId, item.id, { recuoFrente }))}
      />
    </div>
  );
}

function SecaoVaoSelecionado({ vao, pai, extensaoXMm, extensaoZMm }: { vao: Vao; pai: Vao | null; extensaoXMm: number; extensaoZMm: number }): ReactElement {
  const preenchimento = vao.preenchimento && vao.preenchimento.tipo !== 'nenhum' ? vao.preenchimento : null;
  const extensaoDiv = vao.divisao?.eixo === 'x' ? extensaoXMm : extensaoZMm;
  return (
    <>
      <div className="fam-cx-sub" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
        <span>Vão selecionado: {vao.id}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {vao.id !== 'raiz' && (
            <button type="button" className="fam-cx-pill" onClick={() => useFamilia.getState().set({ vaoSel: 'raiz' })}>Módulo inteiro</button>
          )}
          {pai !== null && (
            <button type="button" className="fam-cx-pill" onClick={() => useFamilia.getState().set({ vaoSel: pai.id })}>Pai ({pai.id})</button>
          )}
        </div>
      </div>
      <div className="fam-row">
        <label>Dividir horizontal</label>
        <div className="fam-cx-pills" style={{ padding: 0 }}>
          {[2, 3, 4].map((n) => (
            <button key={`h-${n}`} type="button" className="fam-cx-pill"
              onClick={() => executarPeca(`Dividir vão em ${n} na horizontal`, (f) => dividirVaoEmIguais(f, vao.id, 'z', n))}>{n}×</button>
          ))}
        </div>
      </div>
      <div className="fam-row">
        <label>Dividir vertical</label>
        <div className="fam-cx-pills" style={{ padding: 0 }}>
          {[2, 3, 4].map((n) => (
            <button key={`v-${n}`} type="button" className="fam-cx-pill"
              onClick={() => executarPeca(`Dividir vão em ${n} na vertical`, (f) => dividirVaoEmIguais(f, vao.id, 'x', n))}>{n}×</button>
          ))}
        </div>
      </div>
      {vao.divisao && (
        <>
          <div className="fam-cx-sub">Divisão ({vao.divisao.eixo === 'z' ? 'Prateleiras (Z)' : 'Divisórias (X)'})</div>
          {vao.divisao.itens.map((item, idx) => (
            <EditorItemDivisao key={item.id} vaoId={vao.id} indice={idx} item={item} extensaoMm={extensaoDiv} />
          ))}
          <div className="fam-cx-acoes-lin">
            <button type="button" className="fam-bt" onClick={() => executarPeca('Remover divisão do vão', (f) => removerDivisao(f, vao.id))}>Remover divisão</button>
          </div>
        </>
      )}
      {preenchimento !== null && <EditorPreenchimentoVao vaoId={vao.id} p={preenchimento} />}
    </>
  );
}

export function FamiliaCaixariaPainel(): ReactElement {
  const familia = useFamilia((s) => s.historico.atual);
  const vaoSel = useFamilia((s) => s.vaoSel);
  const res = useResolucao();
  const vaosResolvidos = useMemo(() => (familia.caixaria ? resolverVaosCaixaria(familia, res.env) : []), [familia, res.env]);

  if (!familia.caixaria) {
    return (
      <div className="fam-grp">
        <div className="fam-gh">Caixaria 3D</div>
        <div className="fam-cx-vazio">
          <span className="fam-hint" style={{ padding: 0 }}>Família sem árvore de caixaria. Inicialize para editar por vãos no 3D.</span>
          <button type="button" className="fam-bt" onClick={() => {
            executarPeca('Inicializar caixaria', (f) => { garantirCaixaria(f); sincronizarCaixaria(f); return null; });
            useFamilia.getState().set({ modo3d: 'prateleira', vista: '3d', vaoSel: 'raiz' });
          }}>Inicializar caixaria</button>
        </div>
      </div>
    );
  }

  const cx = familia.caixaria;
  const achado = vaoSel !== null ? encontrarVao(cx.raiz, vaoSel) : null;
  const vr = vaoSel !== null ? vaosResolvidos.find((v) => v.id === vaoSel) : undefined;
  const extensaoXMm = vr ? Math.max(10, Math.round((vr.max[0] - vr.min[0]) * 1000)) : 800;
  const extensaoZMm = vr ? Math.max(10, Math.round((vr.max[2] - vr.min[2]) * 1000)) : 700;

  return (
    <div className="fam-grp">
      <div className="fam-gh">Caixaria 3D</div>
      <OpcoesFerramentaAtiva />
      <SecaoCaixariaBase cx={cx} />
      {achado ? (
        <SecaoVaoSelecionado vao={achado.vao} pai={achado.pai} extensaoXMm={extensaoXMm} extensaoZMm={extensaoZMm} />
      ) : (
        <>
          <div className="fam-cx-sub">Vão selecionado</div>
          <div className="fam-hint">Clique em um vão no 3D para dividir ou preencher.</div>
          <div className="fam-cx-acoes-lin">
            <button type="button" className="fam-bt" onClick={() => useFamilia.getState().set({ vaoSel: cx.raiz.id })}>Selecionar vão raiz</button>
          </div>
        </>
      )}
    </div>
  );
}
