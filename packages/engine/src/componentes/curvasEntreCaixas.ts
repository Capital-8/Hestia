import { isComponent, type Component, type Id, type Project } from '@hestia/model';
import { TIPOS_TUBULACAO } from './tiposTubulacao.ts';

/*
 * Curvas entre caixas (ficha C3). A NBR 5410 limita as curvas de um trecho de eletroduto entre dois pontos de puxada (caixas), mas o
 * valor abaixo NÃO é norma verificada: é um dado editável provisório. Quem usar outro limite passa o número como argumento.
 */

/** Máximo de curvas (equivalentes a 90°) entre duas caixas. CONFERIR contra a norma vigente; valor provisório, não é norma verificada. */
export const LIMITE_CURVAS_ENTRE_CAIXAS = 3;

/** Peso de cada tipo de curva no limite (curva 90° = 1; 45° = 0,5). Só entra a peça que o tipo de eletroduto tem. CONFERIR. */
const PESO_CURVA = { curva90: 1, curva45: 0.5 } as const;

/** Um trecho de eletroduto entre pontos de puxada: componentes ligados sem passar por caixa. */
export interface TrechoEntreCaixas {
  /** Ids dos eletrodutos, curvas e luvas do trecho, na ordem do projeto. */
  componentes: Id[];
  /** Curvas equivalentes a 90° do trecho. */
  curvas: number;
  /** Caixas nas extremidades (ids sem repetição); vazio = trecho sem caixa nenhuma ainda. */
  caixas: Id[];
}

const TIPOS_ELETRODUTO = TIPOS_TUBULACAO.filter((t) => t.dominio === 'eletroduto');

/** Caixa de ligação elétrica: instância de família de dispositivo elétrico com entrada de eletroduto (`fam_krona_eletrica_caixa*` e afins). */
function ehCaixa(p: Project, c: Component): boolean {
  const f = p.componentFamilies?.[c.familyId];
  return f?.categoria === 'dispositivo_eletrico' && (f.ligacoes ?? []).some((l) => l.dominio === 'eletroduto');
}

/** Peça da linha de eletroduto (tubo, curva, luva): o que forma o trecho entre caixas. */
function ehPecaDeEletroduto(c: Component): boolean {
  return TIPOS_ELETRODUTO.some((t) => Object.values(t.regras).includes(c.familyId));
}

/** Peso da peça no limite de curvas; 0 se não é curva. */
function pesoDaCurva(c: Component): number {
  for (const t of TIPOS_ELETRODUTO) {
    for (const k of ['curva90', 'curva45'] as const) if (t.regras[k] !== '' && t.regras[k] === c.familyId) return PESO_CURVA[k];
  }
  return 0;
}

/**
 * Trechos de eletroduto do projeto, agrupados pelas conexões gravadas e cortados nas caixas. Função pura; nunca lança. Trecho sem
 * caixa e sem curva também aparece (a interface filtra por `curvas`).
 */
export function trechosEntreCaixas(p: Project): TrechoEntreCaixas[] {
  const pecas = Object.values(p.elements).filter((e): e is Component => isComponent(e) && ehPecaDeEletroduto(e));
  const vistos = new Set<Id>();
  const saida: TrechoEntreCaixas[] = [];
  for (const inicio of pecas) {
    if (vistos.has(inicio.id)) continue;
    vistos.add(inicio.id);
    const grupo: Component[] = [];
    const caixas = new Set<Id>();
    const pilha = [inicio];
    for (let atual = pilha.pop(); atual; atual = pilha.pop()) {
      grupo.push(atual);
      for (const cx of Object.values(atual.ligacoes ?? {})) {
        const outro = p.elements[cx.componenteId];
        if (!isComponent(outro)) continue;
        if (ehCaixa(p, outro)) caixas.add(outro.id);
        else if (ehPecaDeEletroduto(outro) && !vistos.has(outro.id)) {
          vistos.add(outro.id);
          pilha.push(outro);
        }
      }
    }
    const ordem = new Map(pecas.map((c, i): [Id, number] => [c.id, i]));
    grupo.sort((a, b) => (ordem.get(a.id) ?? 0) - (ordem.get(b.id) ?? 0));
    saida.push({ componentes: grupo.map((c) => c.id), curvas: grupo.reduce((s, c) => s + pesoDaCurva(c), 0), caixas: [...caixas] });
  }
  return saida;
}

/** Trechos que passam do limite de curvas (estritamente maior). */
export function trechosAcimaDoLimite(p: Project, limite: number = LIMITE_CURVAS_ENTRE_CAIXAS): TrechoEntreCaixas[] {
  return trechosEntreCaixas(p).filter((t) => t.curvas > limite);
}
