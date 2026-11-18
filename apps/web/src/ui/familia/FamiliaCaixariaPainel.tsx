import {
  alterarDivisaoItem,
  alterarEstruturaCaixaria,
  definirTampoCaixaria,
  definirTamponamentosCaixaria,
  dividirVaoEmIguais,
  encontrarVao,
  garantirCaixaria,
  preencherVao,
  removerDivisao,
  resolverVaosCaixaria,
  sincronizarCaixaria,
  type Caixaria,
  type DivisaoItem,
  type EstiloPorta,
  type EstruturaCaixa,
  type FundoCaixa,
  type ModoDivisao,
  type MontagemFrente,
  type PreenchimentoVao,
  type RodapeCaixa,
  type TampoCaixa,
  type TamponamentoCaixa,
  type Vao,
} from '@hestia/model';
import type { ModoInteracao3DFamilia } from '@hestia/render';
import { useMemo, type ReactElement } from 'react';
import { executarPeca } from './familiaPecaAviso.ts';
import { useFamilia, useResolucao } from './familiaStore.ts';
import './familiaCaixaria.css';

const ESTRUTURAS: Array<[EstruturaCaixa, string]> = [
  ['base_topo', 'Base e topo'],
  ['laterais_passantes', 'Laterais passantes'],
  ['sem_topo', 'Sem topo (travessas)'],
  ['aberta', 'Aberta'],
];
const RODAPES: Array<[RodapeCaixa['tipo'], string]> = [['nenhum', 'Nenhum'], ['recuado', 'Recuado'], ['pes', 'Pés']];
const FUNDOS: Array<[FundoCaixa['tipo'], string]> = [['encaixado', 'Encaixado'], ['pregado', 'Pregado'], ['espesso', 'Espesso'], ['nenhum', 'Nenhum']];
const ESTILOS_PORTA: Array<[EstiloPorta, string]> = [['giro_1', '1 folha'], ['giro_2', '2 folhas'], ['basculante', 'Basculante'], ['correr', 'Correr']];
const MONTAGENS_FRENTE: Array<[MontagemFrente, string]> = [['sobreposta', 'Sobreposta'], ['embutida', 'Embutida']];
const MODOS_DIVISAO: Array<[ModoDivisao, string]> = [['proporcional', '%'], ['fixo_inicio', 'Início (mm)'], ['fixo_fim', 'Fim (mm)']];
const ROTULO_MODO_3D: Record<ModoInteracao3DFamilia, string> = {
  selecionar: 'Selecionar', prateleira: 'Prateleira', divisoria: 'Divisória', porta: 'Porta',
  gavetas: 'Gavetas', cabideiro: 'Cabideiro', ripado: 'Ripado', sapateira: 'Sapateira',
  tampo: 'Tampo', tamponamento: 'Tamponamento', recorte: 'Recorte no tampo',
};
const TAMPO_PADRAO: TampoCaixa = { espessura: 25, avancoFrente: 20, avancoEsq: 0, avancoDir: 0, avancoFundo: 0 };

function lerNum(bruto: string, minimo = 1): number | null {
  const n = Number(bruto);
  return Number.isFinite(n) && n >= minimo ? n : null;
}

function LinhaSelect<T extends string>({ id, rotulo, valor, opcoes, onChange }: {
  id: string; rotulo: string; valor: T; opcoes: Array<[T, string]>; onChange: (v: T) => void;
}): ReactElement {
  return (
    <div className="fam-row">
      <label htmlFor={id}>{rotulo}</label>
      <select id={id} className="fam-f" value={valor} onChange={(e) => onChange(e.target.value as T)}>
        {opcoes.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
      </select>
    </div>
  );
}

function LinhaNumero({ id, rotulo, valor, min = 0, max, step = 1, semPadding = false, onChange }: {
  id: string; rotulo: string; valor: number; min?: number; max?: number; step?: number; semPadding?: boolean; onChange: (n: number) => void;
}): ReactElement {
  return (
    <div className="fam-row" style={semPadding ? { padding: 0 } : undefined}>
      <label htmlFor={id}>{rotulo}</label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        className="fam-f mono"
        value={valor}
        onChange={(e) => {
          const n = lerNum(e.target.value, min);
          if (n !== null && (max === undefined || n <= max)) onChange(n);
        }}
      />
    </div>
  );
}

function LinhaCheck({ id, rotulo, texto, checked, onChange }: {
  id: string; rotulo: string; texto: string; checked: boolean; onChange: (v: boolean) => void;
}): ReactElement {
  return (
    <div className="fam-row">
      <label htmlFor={id}>{rotulo}</label>
      <label className="fam-cx-check">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>{texto}</span>
      </label>
    </div>
  );
}

function OpcoesFerramentaAtiva(): ReactElement | null {
  const modo3d = useFamilia((s) => s.modo3d);
  const partesDivisao = useFamilia((s) => s.partesDivisao);
  const estiloPorta = useFamilia((s) => s.estiloPorta);
  const montagemFrente = useFamilia((s) => s.montagemFrente);
  const qtdGavetas = useFamilia((s) => s.qtdGavetas);
  const set = useFamilia.getState().set;
  if (modo3d === 'selecionar') return null;

  return (
    <>
      <div className="fam-cx-sub">Ferramenta 3D: {ROTULO_MODO_3D[modo3d]}</div>
      {(modo3d === 'prateleira' || modo3d === 'divisoria') && (
        <>
          <div className="fam-row">
            <label>Inserção</label>
            <div className="fam-cx-pills" style={{ padding: 0 }}>
              {[1, 2, 3, 4].map((n) => (
                <button key={n} type="button" className={`fam-cx-pill${partesDivisao === n ? ' on' : ''}`} onClick={() => set({ partesDivisao: n })}>
                  {n === 1 ? 'Única' : `${n} partes`}
                </button>
              ))}
            </div>
          </div>
          <div className="fam-hint">
            {partesDivisao === 1 ? 'Clique no vão para inserir na posição indicada.' : `Clique no vão para dividir em ${partesDivisao} partes iguais.`}
          </div>
        </>
      )}
      {modo3d === 'porta' && (
        <>
          <LinhaSelect id="cx-tool-porta-est" rotulo="Estilo" valor={estiloPorta} opcoes={ESTILOS_PORTA} onChange={(v) => set({ estiloPorta: v })} />
          <LinhaSelect id="cx-tool-porta-mont" rotulo="Montagem" valor={montagemFrente} opcoes={MONTAGENS_FRENTE} onChange={(v) => set({ montagemFrente: v })} />
        </>
      )}
      {modo3d === 'gavetas' && (
        <>
          <div className="fam-row">
            <label>Quantidade</label>
            <div className="fam-cx-pills" style={{ padding: 0 }}>
              {[2, 3, 4, 5, 6].map((n) => (
                <button key={n} type="button" className={`fam-cx-pill${qtdGavetas === n ? ' on' : ''}`} onClick={() => set({ qtdGavetas: n })}>{n}</button>
              ))}
            </div>
          </div>
          <LinhaSelect id="cx-tool-gav-mont" rotulo="Montagem" valor={montagemFrente} opcoes={MONTAGENS_FRENTE} onChange={(v) => set({ montagemFrente: v })} />
        </>
      )}
      <div className="fam-cx-acoes-lin">
        <button type="button" className="fam-bt" onClick={() => set({ modo3d: 'selecionar' })}>Voltar para Selecionar (Esc)</button>
      </div>
    </>
  );
}

function SecaoCaixariaBase({ cx }: { cx: Caixaria }): ReactElement {
  const tampo = cx.tampo;
  const tamp = cx.tamponamentos ?? {};
  const alternarTamp = (face: keyof Pick<TamponamentoCaixa, 'esquerda' | 'direita' | 'topo' | 'base'>): void => {
    executarPeca('Alterar tamponamento', (f) => {
      const atual = f.caixaria?.tamponamentos ?? {};
      const proximo: TamponamentoCaixa = { ...atual, [face]: !atual[face] };
      const algum = Boolean(proximo.esquerda || proximo.direita || proximo.topo || proximo.base);
      return definirTamponamentosCaixaria(f, algum ? proximo : null);
    });
  };
  const editarTampo = (rotulo: string, fn: (t: TampoCaixa) => TampoCaixa): void => {
    executarPeca(rotulo, (f) => (f.caixaria?.tampo ? definirTampoCaixaria(f, fn(f.caixaria.tampo)) : null));
  };

  return (
    <>
      <div className="fam-cx-sub">Caixaria base</div>
      <LinhaSelect id="cx-estrutura" rotulo="Estrutura" valor={cx.estrutura} opcoes={ESTRUTURAS}
        onChange={(estrutura) => executarPeca('Alterar estrutura', (f) => alterarEstruturaCaixaria(f, { estrutura }))} />
      <LinhaSelect id="cx-rodape-tipo" rotulo="Rodapé" valor={cx.rodape.tipo} opcoes={RODAPES}
        onChange={(tipo) => executarPeca('Alterar rodapé', (f) => alterarEstruturaCaixaria(f, {
          rodape: { tipo, altura: tipo === 'nenhum' ? cx.rodape.altura : (cx.rodape.altura > 0 ? cx.rodape.altura : 100), recuo: tipo === 'recuado' ? (cx.rodape.recuo > 0 ? cx.rodape.recuo : 50) : cx.rodape.recuo },
        }))} />
      {cx.rodape.tipo !== 'nenhum' && (
        <LinhaNumero id="cx-rodape-alt" rotulo="Altura rodapé (mm)" valor={cx.rodape.altura} min={10} step={5}
          onChange={(altura) => executarPeca('Alterar altura do rodapé', (f) => alterarEstruturaCaixaria(f, { rodape: { altura } }))} />
      )}
      {cx.rodape.tipo === 'recuado' && (
        <LinhaNumero id="cx-rodape-rec" rotulo="Recuo rodapé (mm)" valor={cx.rodape.recuo} min={0} step={5}
          onChange={(recuo) => executarPeca('Alterar recuo do rodapé', (f) => alterarEstruturaCaixaria(f, { rodape: { recuo } }))} />
      )}
      <LinhaSelect id="cx-fundo-tipo" rotulo="Fundo" valor={cx.fundo.tipo} opcoes={FUNDOS}
        onChange={(tipo) => executarPeca('Alterar fundo', (f) => alterarEstruturaCaixaria(f, {
          fundo: { tipo, espessura: tipo === 'nenhum' ? cx.fundo.espessura : (tipo === 'espesso' ? Math.max(15, cx.fundo.espessura || 18) : (cx.fundo.espessura > 0 ? cx.fundo.espessura : 6)) },
        }))} />
      {cx.fundo.tipo !== 'nenhum' && (
        <LinhaNumero id="cx-fundo-esp" rotulo="Espessura fundo (mm)" valor={cx.fundo.espessura} min={2} step={1}
          onChange={(espessura) => executarPeca('Alterar espessura do fundo', (f) => alterarEstruturaCaixaria(f, { fundo: { espessura } }))} />
      )}
      {cx.fundo.tipo === 'encaixado' && (
        <LinhaNumero id="cx-fundo-rec" rotulo="Recuo fundo (mm)" valor={cx.fundo.recuo} min={0} step={1}
          onChange={(recuo) => executarPeca('Alterar recuo do fundo', (f) => alterarEstruturaCaixaria(f, { fundo: { recuo } }))} />
      )}
      <LinhaCheck id="cx-tampo-ativo" rotulo="Tampo" texto={tampo ? 'Ativo' : 'Sem tampo'} checked={Boolean(tampo)}
        onChange={(ativar) => executarPeca(ativar ? 'Ativar tampo' : 'Remover tampo', (f) => definirTampoCaixaria(f, ativar ? TAMPO_PADRAO : null))} />
      {tampo && (
        <>
          <LinhaNumero id="cx-tampo-esp" rotulo="Espessura tampo (mm)" valor={tampo.espessura} min={10} step={1}
            onChange={(espessura) => editarTampo('Alterar espessura do tampo', (t) => ({ ...t, espessura }))} />
          <LinhaNumero id="cx-tampo-av" rotulo="Avanço frente (mm)" valor={tampo.avancoFrente} min={-500} step={5}
            onChange={(avancoFrente) => editarTampo('Alterar avanço do tampo', (t) => ({ ...t, avancoFrente }))} />
          <LinhaCheck id="cx-tampo-eng" rotulo="Engrossado" texto="Borda engrossada" checked={Boolean(tampo.engrossado)}
            onChange={(engrossado) => editarTampo('Alterar engrossamento', (t) => ({ ...t, engrossado }))} />
          <LinhaCheck id="cx-tampo-rec" rotulo="Recorte pia/cooktop" texto={tampo.recorte ? 'Com recorte' : 'Sem recorte'} checked={Boolean(tampo.recorte)}
            onChange={(ligar) => editarTampo('Alternar recorte', (t) => {
              const p = { ...t };
              if (ligar) p.recorte = { largura: 500, profundidade: 400 }; else delete p.recorte;
              return p;
            })} />
          {tampo.recorte && (
            <>
              <LinhaNumero id="cx-rec-larg" rotulo="Largura recorte (mm)" valor={tampo.recorte.largura} min={50} step={10}
                onChange={(largura) => editarTampo('Alterar largura do recorte', (t) => ({ ...t, recorte: { ...t.recorte!, largura } }))} />
              <LinhaNumero id="cx-rec-prof" rotulo="Prof. recorte (mm)" valor={tampo.recorte.profundidade} min={50} step={10}
                onChange={(profundidade) => editarTampo('Alterar profundidade do recorte', (t) => ({ ...t, recorte: { ...t.recorte!, profundidade } }))} />
            </>
          )}
        </>
      )}
      <div className="fam-cx-sub">Tamponamentos</div>
      <div className="fam-cx-checks">
        {([['esquerda', 'Esquerda'], ['direita', 'Direita'], ['topo', 'Topo'], ['base', 'Base']] as const).map(([k, r]) => (
          <label key={k} className="fam-cx-check">
            <input type="checkbox" checked={Boolean(tamp[k])} onChange={() => alternarTamp(k)} /><span>{r}</span>
          </label>
        ))}
      </div>
    </>
  );
}

function EditorItemDivisao({ vaoId, indice, item, extensaoMm }: { vaoId: string; indice: number; item: DivisaoItem; extensaoMm: number }): ReactElement {
  const trocarModo = (novoModo: ModoDivisao): void => {
    if (novoModo === item.modo) return;
    let valor = item.valor;
    if (item.modo === 'proporcional' && novoModo !== 'proporcional') {
      valor = Math.max(20, Math.round(item.valor * Math.max(100, extensaoMm)));
    } else if (item.modo !== 'proporcional' && novoModo === 'proporcional') {
      valor = Math.round(Math.min(0.95, Math.max(0.05, item.valor / Math.max(100, extensaoMm))) * 100) / 100;
    }
    executarPeca('Alterar modo da divisão', (f) => alterarDivisaoItem(f, vaoId, item.id, { modo: novoModo, valor }));
  };
  const exibido = item.modo === 'proporcional' ? Math.round(item.valor * 100) : Math.round(item.valor);

  return (
    <div className="fam-cx-div-item">
      <div className="fam-cx-div-topo">
        <strong>#{indice + 1}</strong>
        <div className="fam-cx-pills" style={{ padding: 0 }}>
          {MODOS_DIVISAO.map(([modo, rotulo]) => (
            <button key={modo} type="button" className={`fam-cx-pill${item.modo === modo ? ' on' : ''}`} onClick={() => trocarModo(modo)}>{rotulo}</button>
          ))}
        </div>
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
    </div>
  );
}

function EditorPreenchimentoVao({ vaoId, p }: { vaoId: string; p: Exclude<PreenchimentoVao, { tipo: 'nenhum' }> }): ReactElement {
  const atualizar = (proximo: PreenchimentoVao): void => {
    executarPeca('Alterar preenchimento do vão', (f) => preencherVao(f, vaoId, proximo));
  };
  return (
    <>
      <div className="fam-cx-sub">Preenchimento: {p.tipo}</div>
      {p.tipo === 'porta' && (
        <>
          <LinhaSelect id="cx-vao-porta-est" rotulo="Estilo" valor={p.estilo} opcoes={ESTILOS_PORTA} onChange={(estilo) => atualizar({ ...p, estilo })} />
          <LinhaSelect id="cx-vao-porta-mont" rotulo="Montagem" valor={p.montagem} opcoes={MONTAGENS_FRENTE} onChange={(montagem) => atualizar({ ...p, montagem })} />
          {p.estilo === 'giro_1' && (
            <LinhaSelect id="cx-vao-porta-lado" rotulo="Dobradiça" valor={p.dobradicaLado ?? 'esquerda'}
              opcoes={[['esquerda', 'Esquerda'], ['direita', 'Direita']]} onChange={(dobradicaLado) => atualizar({ ...p, dobradicaLado })} />
          )}
        </>
      )}
      {p.tipo === 'gavetas' && (
        <>
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
        <button type="button" className="fam-bt" onClick={() => executarPeca('Limpar vão', (f) => preencherVao(f, vaoId, { tipo: 'nenhum' }))}>Limpar vão</button>
      </div>
    </>
  );
}

function SecaoVaoSelecionado({ vao, pai, extensaoXMm, extensaoZMm }: { vao: Vao; pai: Vao | null; extensaoXMm: number; extensaoZMm: number }): ReactElement {
  const preenchimento = vao.preenchimento && vao.preenchimento.tipo !== 'nenhum' ? vao.preenchimento : null;
  const extensaoDiv = vao.divisao?.eixo === 'x' ? extensaoXMm : extensaoZMm;
  return (
    <>
      <div className="fam-cx-sub" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Vão selecionado: {vao.id}</span>
        {pai !== null && (
          <button type="button" className="fam-cx-pill" onClick={() => useFamilia.getState().set({ vaoSel: pai.id })}>Pai ({pai.id})</button>
        )}
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
