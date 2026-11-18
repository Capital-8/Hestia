import { conectoresDe } from './biblioteca/conectores.ts';
import {
  CHAPAS_CAIXARIA,
  avaliarAfim,
  calcularCaixaRaizAfim,
  criarCaixariaPadrao,
  dividirIntervaloAfim,
  sincronizarCaixaria,
  type CaixaAfim,
} from './caixariaCompilar.ts';
import { FAMILIA_FORMATO, FAMILIA_VERSAO, LIMITES, type Familia } from './tipos.ts';
import type {
  Caixaria,
  DivisaoItem,
  EstruturaCaixa,
  ModoDivisao,
  Vao,
} from './tiposCaixaria.ts';

/*
 * Modelo e operações de edição da árvore de Caixaria paramétrica (ADR 0049).
 * Todas as operações de edição devolvem `null` quando bem-sucedidas ou motivo em português
 * (sem alterar a família em caso de erro) e executam `sincronizarCaixaria(f)` ao finalizar.
 */

const ESTRUTURAS_VALIDAS: readonly EstruturaCaixa[] = ['base_topo', 'laterais_passantes', 'sem_topo', 'aberta'];
const MODOS_VALIDOS: readonly ModoDivisao[] = ['proporcional', 'fixo_inicio', 'fixo_fim'];

function numeroFinito(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Cria uma nova `Familia` paramétrica inicializada com caixaria pronta e validável. */
export function criarFamiliaCaixaria(opcoes?: {
  nome?: string;
  L?: number;
  A?: number;
  P?: number;
  estrutura?: EstruturaCaixa;
}): Familia {
  const L = numeroFinito(opcoes?.L) && opcoes.L > 0 ? opcoes.L : 800;
  const A = numeroFinito(opcoes?.A) && opcoes.A > 0 ? opcoes.A : 720;
  const P = numeroFinito(opcoes?.P) && opcoes.P > 0 ? opcoes.P : 560;
  const estrutura = opcoes?.estrutura && ESTRUTURAS_VALIDAS.includes(opcoes.estrutura)
    ? opcoes.estrutura
    : 'base_topo';
  const nomeBruto = opcoes?.nome?.trim() || 'Caixaria paramétrica';
  const nome = nomeBruto.slice(0, LIMITES.nome);

  const familia: Familia = {
    formato: FAMILIA_FORMATO,
    versao: FAMILIA_VERSAO,
    id: 'fam_caixaria',
    nome,
    categoria: 'marcenaria',
    descricao: 'Módulo paramétrico de caixaria com árvore de vãos, prateleiras, divisórias e preenchimentos.',
    unidade: 'mm',
    hospedagem: 'nivel',
    origem: 'canto',
    parametros: [
      { id: 'L', nome: 'Largura', tipo: 'comprimento', escopo: 'instancia', padrao: L, min: Math.min(200, L), max: Math.max(3000, L), passo: 10, grupo: 'Dimensões' },
      { id: 'A', nome: 'Altura', tipo: 'comprimento', escopo: 'instancia', padrao: A, min: Math.min(200, A), max: Math.max(3000, A), passo: 10, grupo: 'Dimensões' },
      { id: 'P', nome: 'Profundidade', tipo: 'comprimento', escopo: 'instancia', padrao: P, min: Math.min(150, P), max: Math.max(1200, P), passo: 10, grupo: 'Dimensões' },
      { id: 'corpo', nome: 'Chapa do corpo', tipo: 'chapa', escopo: 'tipo', padrao: 'mdf18', grupo: 'Material', opcoes: CHAPAS_CAIXARIA },
      { id: 'esp', nome: 'Espessura do corpo', tipo: 'numero', escopo: 'tipo', padrao: 0, formula: 'corpo.esp', grupo: 'Derivados' },
      { id: 'mat_porta', nome: 'Material das portas', tipo: 'material', escopo: 'tipo', padrao: 'mdf18', grupo: 'Material' },
      { id: 'mat_tampo', nome: 'Material do tampo', tipo: 'material', escopo: 'tipo', padrao: 'mdf25', grupo: 'Material' },
      { id: 'mat_fundo', nome: 'Material do fundo', tipo: 'material', escopo: 'tipo', padrao: 'mdf6', grupo: 'Material' },
    ],
    planos: [
      { id: 'pEsq', nome: 'Esquerda', eixo: 'x', posicao: '0' },
      { id: 'pDir', nome: 'Direita', eixo: 'x', posicao: 'L' },
      { id: 'pFrente', nome: 'Frente', eixo: 'y', posicao: '0' },
      { id: 'pFundo', nome: 'Fundo', eixo: 'y', posicao: 'P' },
      { id: 'pBase', nome: 'Base', eixo: 'z', posicao: '0' },
      { id: 'pTopo', nome: 'Topo', eixo: 'z', posicao: 'A' },
    ],
    pecas: [],
    aninhados: [],
    ferragens: [],
    conectores: conectoresDe('base'),
    caixaria: criarCaixariaPadrao(estrutura),
    tipos: [
      { id: 'P600', nome: 'Módulo 600', valores: { L: 600 } },
      { id: 'P800', nome: 'Módulo 800', valores: { L: 800 } },
      { id: 'P1200', nome: 'Módulo 1200', valores: { L: 1200 } },
    ],
    tipoPadrao: 'P800',
  };

  sincronizarCaixaria(familia);
  return familia;
}

/** Garante que `f.caixaria` esteja inicializada e a devolve. */
export function garantirCaixaria(f: Familia): Caixaria {
  if (!f.caixaria || typeof f.caixaria !== 'object' || !f.caixaria.raiz) {
    f.caixaria = criarCaixariaPadrao();
  }
  return f.caixaria;
}

/** Busca um vão na árvore pelo `vaoId`, devolvendo também seu pai e índice. */
export function encontrarVao(
  raiz: Vao,
  vaoId: string,
): { vao: Vao; pai: Vao | null; indiceNoPai: number } | null {
  if (!raiz || typeof raiz !== 'object') return null;
  if (raiz.id === vaoId) return { vao: raiz, pai: null, indiceNoPai: -1 };
  const filhos = raiz.filhos;
  if (!Array.isArray(filhos)) return null;
  for (let i = 0; i < filhos.length; i++) {
    const filho = filhos[i];
    if (!filho) continue;
    if (filho.id === vaoId) return { vao: filho, pai: raiz, indiceNoPai: i };
    const achado = encontrarVao(filho, vaoId);
    if (achado) return { vao: achado.vao, pai: achado.pai, indiceNoPai: achado.indiceNoPai };
  }
  return null;
}

function coletarIds(raiz: Vao): { vaos: Set<string>; itens: Set<string> } {
  const vaos = new Set<string>();
  const itens = new Set<string>();
  const visitar = (v: Vao): void => {
    vaos.add(v.id);
    if (v.divisao) {
      for (const item of v.divisao.itens) itens.add(item.id);
    }
    for (const f of v.filhos ?? []) visitar(f);
  };
  visitar(raiz);
  return { vaos, itens };
}

function gerarId(prefixo: string, usados: Set<string>): string {
  let n = 1;
  while (usados.has(`${prefixo}${n}`)) n++;
  const id = `${prefixo}${n}`;
  usados.add(id);
  return id;
}

function validarItemDivisao(modo: ModoDivisao, valor: number, recuoFrente?: number): string | null {
  if (!MODOS_VALIDOS.includes(modo)) return `modo de divisão inválido: “${String(modo)}”`;
  if (!numeroFinito(valor)) return 'valor da divisão precisa ser número finito';
  if (modo === 'proporcional') {
    if (valor <= 0 || valor >= 1) return 'fração proporcional precisa estar entre 0 e 1';
  } else if (valor <= 0) {
    return 'distância fixa precisa ser maior que zero';
  }
  if (recuoFrente !== undefined && (!numeroFinito(recuoFrente) || recuoFrente < -500 || recuoFrente > 1000)) {
    return 'avanço/recuo frontal precisa estar entre -500 e 1000 mm';
  }
  return null;
}

function dimensaoPadrao(f: Familia, id: 'L' | 'A' | 'P', fallback: number): number {
  const p = f.parametros?.find((x) => x.id === id);
  return p && typeof p.padrao === 'number' && Number.isFinite(p.padrao) ? p.padrao : fallback;
}

function espPadrao(f: Familia): number {
  const corpo = f.parametros?.find((x) => x.id === 'corpo');
  const op = corpo?.opcoes?.find((o) => o.valor === corpo.padrao);
  return op && typeof op.esp === 'number' && Number.isFinite(op.esp) ? op.esp : 18;
}

function encontrarCaixaAfimDoVao(raiz: Vao, caixa: CaixaAfim, alvoId: string): CaixaAfim | null {
  if (raiz.id === alvoId) return caixa;
  const div = raiz.divisao;
  const filhos = raiz.filhos;
  if (!div || !filhos || filhos.length !== div.itens.length + 1) return null;
  if (div.eixo === 'z') {
    const { intervalos } = dividirIntervaloAfim(caixa.z0, caixa.z1, div.itens);
    for (let i = 0; i < filhos.length; i++) {
      const [z0, z1] = intervalos[i]!;
      const res = encontrarCaixaAfimDoVao(filhos[i]!, { ...caixa, z0, z1 }, alvoId);
      if (res) return res;
    }
  } else {
    const { intervalos } = dividirIntervaloAfim(caixa.x0, caixa.x1, div.itens);
    for (let i = 0; i < filhos.length; i++) {
      const [x0, x1] = intervalos[i]!;
      const res = encontrarCaixaAfimDoVao(filhos[i]!, { ...caixa, x0, x1 }, alvoId);
      if (res) return res;
    }
  }
  return null;
}

function posicaoEstimadaItem(
  f: Familia,
  cx: Caixaria,
  vaoId: string,
  eixo: 'x' | 'z',
  itens: readonly DivisaoItem[],
): number[] {
  const info = calcularCaixaRaizAfim(cx);
  const caixa = encontrarCaixaAfimDoVao(cx.raiz, info.raiz, vaoId) ?? info.raiz;
  const dim = eixo === 'x' ? dimensaoPadrao(f, 'L', 800) : dimensaoPadrao(f, 'A', 720);
  const esp = espPadrao(f);
  const [a, b] = eixo === 'x' ? [caixa.x0, caixa.x1] : [caixa.z0, caixa.z1];
  const { posicoes } = dividirIntervaloAfim(a, b, itens);
  return posicoes.map((p) => avaliarAfim(p, dim, esp));
}

/** Divide um vão com uma prateleira (`'z'`) ou divisória (`'x'`). */
export function dividirVao(
  f: Familia,
  vaoId: string,
  eixo: 'x' | 'z',
  modo: ModoDivisao,
  valor: number,
  recuoFrente?: number,
): string | null {
  if (eixo !== 'x' && eixo !== 'z') return `eixo inválido: “${String(eixo)}”`;
  const erroItem = validarItemDivisao(modo, valor, recuoFrente);
  if (erroItem !== null) return erroItem;

  const cx = garantirCaixaria(f);
  const achado = encontrarVao(cx.raiz, vaoId);
  if (!achado) return `vão “${vaoId}” não existe`;
  const { vao } = achado;

  if (vao.divisao && vao.divisao.eixo !== eixo) {
    return 'este vão já possui divisão no outro eixo; divida um dos sub-vãos';
  }

  const ids = coletarIds(cx.raiz);
  const itemId = gerarId('d', ids.itens);
  const novoItem: DivisaoItem = recuoFrente !== undefined
    ? { id: itemId, modo, valor, recuoFrente }
    : { id: itemId, modo, valor };

  if (!vao.divisao) {
    const idA = gerarId('v', ids.vaos);
    const idB = gerarId('v', ids.vaos);
    vao.divisao = { eixo, itens: [novoItem] };
    vao.filhos = [{ id: idA }, { id: idB }];
  } else {
    const antigos = vao.divisao.itens;
    const candidatos = [...antigos, novoItem];
    const posicoes = posicaoEstimadaItem(f, cx, vaoId, eixo, candidatos);
    const posNovo = posicoes[posicoes.length - 1]!;
    let indiceInsercao = antigos.length;
    for (let i = 0; i < antigos.length; i++) {
      if (posNovo < posicoes[i]!) {
        indiceInsercao = i;
        break;
      }
    }
    vao.divisao.itens.splice(indiceInsercao, 0, novoItem);
    const filhos = vao.filhos ?? [];
    filhos.splice(indiceInsercao + 1, 0, { id: gerarId('v', ids.vaos) });
    vao.filhos = filhos;
  }

  sincronizarCaixaria(f);
  return null;
}

/** Divide um vão em `partes` iguais ao longo de `eixo`. */
export function dividirVaoEmIguais(
  f: Familia,
  vaoId: string,
  eixo: 'x' | 'z',
  partes: number,
  recuoFrente?: number,
): string | null {
  if (eixo !== 'x' && eixo !== 'z') return `eixo inválido: “${String(eixo)}”`;
  if (!Number.isInteger(partes) || partes < 2 || partes > 32) {
    return 'número de partes precisa ser inteiro entre 2 e 32';
  }
  if (recuoFrente !== undefined && (!numeroFinito(recuoFrente) || recuoFrente < -500 || recuoFrente > 1000)) {
    return 'avanço/recuo frontal precisa estar entre -500 e 1000 mm';
  }

  const cx = garantirCaixaria(f);
  const achado = encontrarVao(cx.raiz, vaoId);
  if (!achado) return `vão “${vaoId}” não existe`;
  const { vao } = achado;

  const ids = coletarIds(cx.raiz);
  const itens: DivisaoItem[] = [];
  for (let k = 1; k < partes; k++) {
    const item: DivisaoItem = { id: gerarId('d', ids.itens), modo: 'proporcional', valor: k / partes };
    if (recuoFrente !== undefined) item.recuoFrente = recuoFrente;
    itens.push(item);
  }
  const filhos: Vao[] = [];
  for (let k = 0; k < partes; k++) {
    filhos.push({ id: gerarId('v', ids.vaos) });
  }

  vao.divisao = { eixo, itens };
  vao.filhos = filhos;
  sincronizarCaixaria(f);
  return null;
}

/** Altera modo, valor ou recuo frontal de uma prateleira/divisória existente. */
export function alterarDivisaoItem(
  f: Familia,
  vaoId: string,
  itemId: string,
  patch: Partial<DivisaoItem>,
): string | null {
  const cx = garantirCaixaria(f);
  const achado = encontrarVao(cx.raiz, vaoId);
  if (!achado) return `vão “${vaoId}” não existe`;
  const { vao } = achado;
  if (!vao.divisao) return `vão “${vaoId}” não possui divisão`;

  const item = vao.divisao.itens.find((it) => it.id === itemId);
  if (!item) return `item de divisão “${itemId}” não existe`;

  const modo = patch.modo ?? item.modo;
  const valor = patch.valor ?? item.valor;
  const recuoFrente = Object.prototype.hasOwnProperty.call(patch, 'recuoFrente')
    ? patch.recuoFrente
    : item.recuoFrente;
  const erro = validarItemDivisao(modo, valor, recuoFrente);
  if (erro !== null) return erro;

  item.modo = modo;
  item.valor = valor;
  if (recuoFrente === undefined) delete item.recuoFrente;
  else item.recuoFrente = recuoFrente;

  sincronizarCaixaria(f);
  return null;
}

/** Remove a divisão e todos os sub-vãos de `vaoId`. */
export function removerDivisao(f: Familia, vaoId: string): string | null {
  const cx = garantirCaixaria(f);
  const achado = encontrarVao(cx.raiz, vaoId);
  if (!achado) return `vão “${vaoId}” não existe`;
  const { vao } = achado;
  if (!vao.divisao) return `vão “${vaoId}” não possui divisão`;

  delete vao.divisao;
  delete vao.filhos;
  sincronizarCaixaria(f);
  return null;
}


/** Localiza a divisão e o vão dono de uma peça gerada (`cx_prat_*` ou `cx_div_*`). */
export function encontrarDivisaoPorPecaId(
  raiz: Vao,
  pecaId: string,
): { vaoId: string; eixo: 'x' | 'z'; item: DivisaoItem } | null {
  if (!raiz || typeof raiz !== 'object') return null;
  if (raiz.divisao) {
    const prefixo = raiz.divisao.eixo === 'z' ? 'cx_prat_' : 'cx_div_';
    for (const item of raiz.divisao.itens) {
      const limpo = item.id.replace(/[^A-Za-z0-9_]/g, '_') || 'x';
      if (`${prefixo}${limpo}` === pecaId) {
        return { vaoId: raiz.id, eixo: raiz.divisao.eixo, item };
      }
    }
  }
  for (const filho of raiz.filhos ?? []) {
    if (!filho) continue;
    const achado = encontrarDivisaoPorPecaId(filho, pecaId);
    if (achado) return achado;
  }
  return null;
}

export {
  preencherVao,
  alterarEstruturaCaixaria,
  definirTampoCaixaria,
  definirTamponamentosCaixaria,
  desvincularPecaCaixaria,
  revincularPecaCaixaria,
} from './caixariaEstrutura.ts';
