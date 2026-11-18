import {
  alterarEstruturaCaixaria,
  definirTampoCaixaria,
  definirTamponamentosCaixaria,
  type Caixaria,
  type EstiloPorta,
  type EstruturaCaixa,
  type FundoCaixa,
  type ModoDivisao,
  type MontagemFrente,
  type RodapeCaixa,
  type TampoCaixa,
  type TamponamentoCaixa,
} from '@hestia/model';
import type { ModoInteracao3DFamilia } from '@hestia/render';
import type { ReactElement } from 'react';
import { executarPeca } from './familiaPecaAviso.ts';

export const ESTRUTURAS: Array<[EstruturaCaixa, string]> = [
  ['base_topo', 'Base e topo'],
  ['laterais_passantes', 'Laterais passantes'],
  ['sem_topo', 'Sem topo (travessas)'],
  ['aberta', 'Aberta'],
];
export const RODAPES: Array<[RodapeCaixa['tipo'], string]> = [['nenhum', 'Nenhum'], ['recuado', 'Recuado'], ['pes', 'Pés']];
export const FUNDOS: Array<[FundoCaixa['tipo'], string]> = [['encaixado', 'Encaixado'], ['pregado', 'Pregado'], ['espesso', 'Espesso'], ['nenhum', 'Nenhum']];
export const ESTILOS_PORTA: Array<[EstiloPorta, string]> = [['giro_1', '1 folha'], ['giro_2', '2 folhas'], ['basculante', 'Basculante'], ['correr', 'Correr']];
export const MONTAGENS_FRENTE: Array<[MontagemFrente, string]> = [['sobreposta', 'Sobreposta'], ['embutida', 'Embutida']];
export const MODOS_DIVISAO: Array<[ModoDivisao, string]> = [['proporcional', '%'], ['fixo_inicio', 'Início (mm)'], ['fixo_fim', 'Fim (mm)']];
export const ROTULO_MODO_3D: Record<ModoInteracao3DFamilia, string> = {
  selecionar: 'Selecionar', prateleira: 'Prateleira', divisoria: 'Divisória', porta: 'Porta',
  gavetas: 'Gavetas', cabideiro: 'Cabideiro', ripado: 'Ripado', sapateira: 'Sapateira',
  tampo: 'Tampo', tamponamento: 'Tamponamento', recorte: 'Recorte no tampo',
};
const TAMPO_PADRAO: TampoCaixa = { espessura: 25, avancoFrente: 20, avancoEsq: 0, avancoDir: 0, avancoFundo: 0 };

function lerNum(bruto: string, minimo = 1): number | null {
  if (bruto.trim() === '') return null;
  const n = Number(bruto);
  return Number.isFinite(n) && n >= minimo ? n : null;
}

export function LinhaSelect<T extends string>({ id, rotulo, valor, opcoes, onChange }: {
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

export function LinhaNumero({ id, rotulo, valor, min = 0, max, step = 1, semPadding = false, onChange }: {
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

export function LinhaCheck({ id, rotulo, texto, checked, onChange }: {
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

export function SecaoCaixariaBase({ cx }: { cx: Caixaria }): ReactElement {
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
