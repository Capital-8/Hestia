/**
 * Referência TS das peças da parede cortina (decisão 0056, §5.3 e §5.4): montantes por segmento (papel, prioridade de
 * junção, aparo reto) e painéis por REGIÃO (retângulo livre, área visível e bruta). Fase 2: perfis `rect` e `round`
 * (as demais formas são ENTRADA até a fase 3); linhas extras e montante por linha; segmentos removidos e regiões
 * fundidas; sobrescrita de painel por célula (uma por região). Coordenadas locais do plano da cortina: `s` ao longo do
 * eixo (0..L), `z` de baixo para cima (0..H). O montante de borda é EMBUTIDO em [0, L] × [0, H]; o interior é centrado.
 */
import {
  CURTAIN_PANEL_BITE, TOL_SOLDA, at, erroEntrada,
  type CortinaEntrada, type CurtainPanelTypeRef, type MullionTypeRef,
} from './tipos.ts';
import type { EixoCompleto, GradeResolvida } from './grade.ts';
import { ESTADO } from './remap.ts';

/** Papéis de montante (índice na tabela de quantitativos). */
export const PAPEL_INTERIOR_V = 0;
export const PAPEL_INTERIOR_H = 1;
export const PAPEL_BORDA_INICIO = 2;
export const PAPEL_BORDA_FIM = 3;
export const PAPEL_BORDA_BASE = 4;
export const PAPEL_BORDA_TOPO = 5;
/** Papéis de painel e o do sistema inteiro (só na tabela de quantitativos). */
export const PAPEL_VIDRO = 10;
export const PAPEL_SOLIDO = 11;
export const PAPEL_VAZIO = 12;
export const PAPEL_SISTEMA = 20;

export interface Montante {
  papel: number;
  /** 'u' = linha vertical (posição s); 'v' = linha horizontal (posição z). */
  eixo: 'u' | 'v';
  /** Índice da linha no eixo, contando as bordas (0 = borda início/base, n = borda fim/topo). */
  indiceLinha: number;
  /** Índice global da linha: U = 0..nu, V = nu+1..nu+nv+1. É a coluna `linha` de `segmentos`. */
  linha: number;
  /** Índice do segmento ao longo da linha. */
  k: number;
  tipoId: string;
  tipoNum: number;
  materialNum: number;
  forma: 'rect' | 'round';
  largura: number;
  profundidade: number;
  deslocamento: number;
  /** Vertical (sobe em z) ou horizontal (corre em s). */
  vertical: boolean;
  /** Início da peça (s, z) e comprimento, já com o aparo. */
  s: number;
  z: number;
  comprimento: number;
  /** Segmento nominal entre as duas linhas que o limitam (sem aparo). */
  de: number;
  ate: number;
  /** true = corre contínuo (não aparado); false = aparado nas faces do contínuo. */
  continuo: boolean;
  /** Área da seção (em metros quadrados) do perfil. */
  areaPerfil: number;
}

/** Segmento de uma linha, com ou sem montante. `removido` = sem montante por remoção (explícita ou interna a região). */
export interface SegmentoLinha {
  eixo: 'u' | 'v';
  indiceLinha: number;
  linha: number;
  k: number;
  de: number;
  ate: number;
  tipoNum: number | null;
  removido: boolean;
}

/** Painel de uma região (uma célula, ou várias fundidas). `i`/`j` são os da célula canônica. */
export interface PainelCelula {
  i: number;
  j: number;
  /** Índice (i·nv + j) da célula canônica da região. */
  regiao: number;
  /** Nº de células da região (1 = célula própria). */
  celulas: number;
  tipoId: string;
  tipoNum: number;
  materialNum: number;
  kind: 'glass' | 'solid' | 'empty';
  papel: number;
  espessura: number;
  deslocamento: number;
  bite: number;
  /** Retângulo livre (a região menos a meia largura dos montantes que a margeiam). Largura/altura nunca negativas. */
  livre: { s0: number; s1: number; z0: number; z1: number };
  larguraLivre: number;
  alturaLivre: number;
  /** Lados com montante (0 a 2 em cada direção), para o `bite`. */
  ladosV: number;
  ladosH: number;
  areaVisivel: number;
  areaBruta: number;
  volume: number;
}

export interface Pecas {
  montantes: Montante[];
  segmentos: SegmentoLinha[];
  /** Um painel por região, em ordem de região (= ordem de célula, para a grade sem fusão). */
  paineis: PainelCelula[];
  /** Painel de cada célula (índice i·nv + j): o da sua região. */
  painelDaCelula: PainelCelula[];
  /** Largura de montante por linha (0 = sem montante): U e V, bordas incluídas. */
  largurasU: number[];
  largurasV: number[];
  /** Posição do CENTRO de cada montante (s para U, z para V): interior na linha; borda embutida (centro a meia largura da ponta). */
  centrosU: number[];
  centrosV: number[];
}

function achaMontante(e: CortinaEntrada, id: string | null): MullionTypeRef | null {
  if (id === null) return null;
  const t = e.montantes.find((m) => m.id === id);
  if (!t) throw erroEntrada(`tipo de montante inexistente (${id})`);
  if (t.profile.shape !== 'rect' && t.profile.shape !== 'round') throw erroEntrada(`forma de montante não suportada até a fase 2 (${t.profile.shape})`);
  if (!(t.profile.width > 0) || !(t.profile.depth > 0)) throw erroEntrada(`perfil de montante inválido (${id})`);
  return t;
}

export function achaPainel(e: CortinaEntrada, id: string): CurtainPanelTypeRef {
  const t = e.paineis.find((p) => p.id === id);
  if (!t) throw erroEntrada(`tipo de painel inexistente (${id})`);
  if (t.kind !== 'empty' && !(t.thickness > 0)) throw erroEntrada(`espessura de painel inválida (${id})`);
  return t;
}

/** Profundidade efetiva do perfil: no redondo é igual à largura (§4.2). */
export function profundidadeDoPerfil(t: MullionTypeRef): number {
  return t.profile.shape === 'round' ? t.profile.width : t.profile.depth;
}

export function areaDoPerfil(t: MullionTypeRef): number {
  return t.profile.shape === 'round' ? (Math.PI * t.profile.width * t.profile.width) / 4 : t.profile.width * t.profile.depth;
}

/** Montante de uma linha por sobrescrita (`undefined` = sem sobrescrita; `null` = sem montante). */
function sobrescritaDeLinha(eixo: EixoCompleto, li: number): string | null | undefined {
  if (li < 1 || li > eixo.n - 1) return undefined;
  return eixo.origens[li - 1]?.mullionTypeId;
}

export function calcularPecas(e: CortinaEntrada, g: GradeResolvida): Pecas {
  if (!(e.tipo.depth > 0)) throw erroEntrada('profundidade do sistema inválida');
  const m = e.tipo.mullions;
  const nu = g.nu;
  const nv = g.nv;
  const sB = g.u.bordas;
  const zB = g.v.bordas;

  // Tipo de montante por linha: a sobrescrita da linha manda; senão o papel (bordas e interiores).
  const tipoU = (li: number): MullionTypeRef | null => {
    const sob = sobrescritaDeLinha(g.u, li);
    if (sob !== undefined) return achaMontante(e, sob);
    return achaMontante(e, li === 0 ? m.borderStart : li === nu ? m.borderEnd : m.interiorVertical);
  };
  const tipoV = (lj: number): MullionTypeRef | null => {
    const sob = sobrescritaDeLinha(g.v, lj);
    if (sob !== undefined) return achaMontante(e, sob);
    return achaMontante(e, lj === 0 ? m.borderBottom : lj === nv ? m.borderTop : m.interiorHorizontal);
  };
  const papelU = (li: number): number => (li === 0 ? PAPEL_BORDA_INICIO : li === nu ? PAPEL_BORDA_FIM : PAPEL_INTERIOR_V);
  const papelV = (lj: number): number => (lj === 0 ? PAPEL_BORDA_BASE : lj === nv ? PAPEL_BORDA_TOPO : PAPEL_INTERIOR_H);

  const tU = Array.from({ length: nu + 1 }, (_, li) => tipoU(li));
  const tV = Array.from({ length: nv + 1 }, (_, lj) => tipoV(lj));
  const largurasU = tU.map((t) => (t ? t.profile.width : 0));
  const largurasV = tV.map((t) => (t ? t.profile.width : 0));
  // Recuo da face interna do montante em relação à linha: o interior é centrado (meia largura); a borda é EMBUTIDA
  // em [0, L] × [0, H] (largura inteira, face externa rente à ponta).
  const recuo = (w: number[], li: number): number => (li === 0 || li === w.length - 1 ? at(w, li) : at(w, li) / 2);
  const recuoU = (li: number): number => recuo(largurasU, li);
  const recuoV = (lj: number): number => recuo(largurasV, lj);
  const centrosU = sB.map((p, li) => (li === 0 ? p + at(largurasU, li) / 2 : li === nu ? p - at(largurasU, li) / 2 : p));
  const centrosV = zB.map((p, lj) => (lj === 0 ? p + at(largurasV, lj) / 2 : lj === nv ? p - at(largurasV, lj) / 2 : p));

  // Montante presente no segmento: a linha tem tipo e o segmento não foi removido (explícito ou interno a região).
  const semMontante = (linhaG: number, k: number): boolean => g.remocao.semMontante.has(`${linhaG}:${k}`);
  const temU = (li: number, k: number): boolean => at(tU, li) !== null && !semMontante(li, k);
  const temV = (lj: number, k: number): boolean => at(tV, lj) !== null && !semMontante(nu + 1 + lj, k);
  // Aparo: o montante trimado recua pela face do contínuo só onde esse contínuo tem montante no nó (segmentos adjacentes).
  const adjV = (lj: number, li: number): boolean => [li - 1, li].some((c) => c >= 0 && c < nu && temV(lj, c));
  const adjU = (li: number, lj: number): boolean => [lj - 1, lj].some((r) => r >= 0 && r < nv && temU(li, r));

  const montantes: Montante[] = [];
  const segmentos: SegmentoLinha[] = [];
  const verticalContinuo = m.joinPriority === 'vertical';

  const empurra = (
    eixo: 'u' | 'v', indiceLinha: number, k: number, t: MullionTypeRef | null, papel: number,
    de: number, ate: number, deAparado: number, ateAparado: number, continuo: boolean,
  ): void => {
    const linha = eixo === 'u' ? indiceLinha : nu + 1 + indiceLinha;
    const removido = semMontante(linha, k);
    const tt = removido ? null : t;
    segmentos.push({ eixo, indiceLinha, linha, k, de, ate, tipoNum: tt ? tt.num : null, removido });
    if (!tt) return;
    const comprimento = ateAparado - deAparado;
    if (comprimento <= TOL_SOLDA) return; // nada sobra do segmento depois do aparo
    const vertical = eixo === 'u';
    montantes.push({
      papel, eixo, indiceLinha, linha, k, tipoId: tt.id, tipoNum: tt.num, materialNum: tt.materialNum,
      forma: tt.profile.shape as 'rect' | 'round', largura: tt.profile.width, profundidade: profundidadeDoPerfil(tt), deslocamento: tt.offset ?? 0,
      vertical,
      s: vertical ? at(centrosU, indiceLinha) : deAparado,
      z: vertical ? deAparado : at(centrosV, indiceLinha),
      comprimento, de, ate, continuo, areaPerfil: areaDoPerfil(tt),
    });
  };

  // Linhas verticais (U): cada uma tem nv segmentos, entre as linhas horizontais que a cruzam.
  for (let li = 0; li <= nu; li++) {
    for (let k = 0; k < nv; k++) {
      const de = at(zB, k);
      const ate = at(zB, k + 1);
      const aparar = !verticalContinuo; // vertical é aparado quando o horizontal manda
      const dA = aparar ? de + (adjV(k, li) ? recuoV(k) : 0) : de;
      const aA = aparar ? ate - (adjV(k + 1, li) ? recuoV(k + 1) : 0) : ate;
      empurra('u', li, k, at(tU, li), papelU(li), de, ate, dA, aA, !aparar);
    }
  }
  // Linhas horizontais (V): cada uma tem nu segmentos, entre as linhas verticais que a cruzam.
  for (let lj = 0; lj <= nv; lj++) {
    for (let k = 0; k < nu; k++) {
      const de = at(sB, k);
      const ate = at(sB, k + 1);
      const aparar = verticalContinuo; // horizontal é aparado quando o vertical manda
      const dA = aparar ? de + (adjU(k, lj) ? recuoU(k) : 0) : de;
      const aA = aparar ? ate - (adjU(k + 1, lj) ? recuoU(k + 1) : 0) : ate;
      empurra('v', lj, k, at(tV, lj), papelV(lj), de, ate, dA, aA, !aparar);
    }
  }

  // Painéis por região. Sobrescrita de painel: uma região pode ter várias células com sobrescrita adotada; vale a da célula
  // de menor (j, i) (como o Rust, `cortina_pecas`).
  const padraoId = e.instancia?.defaultPanelTypeId ?? e.tipo.defaultPanelTypeId;
  const tipoPadrao = achaPainel(e, padraoId);
  const painelDaRegiao = new Map<number, CurtainPanelTypeRef>();
  const primeiraDaRegiao = new Map<number, { i: number; j: number; ordem: number }>();
  g.remap.celulas.forEach((r, ordem) => {
    if (r.estado !== ESTADO.adotada) return;
    const canon = at(g.remocao.regiaoDeCelula, r.a * nv + r.b);
    const atual = primeiraDaRegiao.get(canon);
    if (!atual || r.b < atual.j || (r.b === atual.j && r.a < atual.i)) primeiraDaRegiao.set(canon, { i: r.a, j: r.b, ordem });
  });
  for (const [canon, { ordem }] of primeiraDaRegiao) {
    const ov = e.instancia?.cells?.[ordem]?.override;
    if (ov && ov.kind === 'panel') painelDaRegiao.set(canon, achaPainel(e, ov.panelTypeId));
  }

  const porCanon = new Map<number, PainelCelula>();
  const paineis: PainelCelula[] = [];
  for (const reg of g.remocao.regioes) {
    const { i0, i1, j0, j1 } = reg;
    let lE = false;
    let lD = false;
    let lB = false;
    let lT = false;
    for (let j = j0; j <= j1; j++) {
      if (temU(i0, j)) lE = true;
      if (temU(i1 + 1, j)) lD = true;
    }
    for (let i = i0; i <= i1; i++) {
      if (temV(j0, i)) lB = true;
      if (temV(j1 + 1, i)) lT = true;
    }
    const s0 = at(sB, i0) + (lE ? recuoU(i0) : 0);
    const s1 = at(sB, i1 + 1) - (lD ? recuoU(i1 + 1) : 0);
    const z0 = at(zB, j0) + (lB ? recuoV(j0) : 0);
    const z1 = at(zB, j1 + 1) - (lT ? recuoV(j1 + 1) : 0);
    const larguraLivre = Math.max(0, s1 - s0);
    const alturaLivre = Math.max(0, z1 - z0);
    const ladosV = (lE ? 1 : 0) + (lD ? 1 : 0);
    const ladosH = (lB ? 1 : 0) + (lT ? 1 : 0);
    const tipo = painelDaRegiao.get(reg.canon) ?? tipoPadrao;
    const bite = tipo.bite ?? CURTAIN_PANEL_BITE;
    const areaVisivel = larguraLivre * alturaLivre;
    const vazio = tipo.kind === 'empty';
    const areaBruta = vazio || areaVisivel === 0 ? areaVisivel : (larguraLivre + bite * ladosV) * (alturaLivre + bite * ladosH);
    const painel: PainelCelula = {
      i: Math.floor(reg.canon / nv), j: reg.canon % nv, regiao: reg.canon, celulas: reg.celulas,
      tipoId: tipo.id, tipoNum: tipo.num, materialNum: tipo.materialNum, kind: tipo.kind,
      papel: tipo.kind === 'glass' ? PAPEL_VIDRO : tipo.kind === 'solid' ? PAPEL_SOLIDO : PAPEL_VAZIO,
      espessura: vazio ? 0 : tipo.thickness, deslocamento: tipo.offset ?? 0, bite,
      livre: { s0, s1, z0, z1 }, larguraLivre, alturaLivre, ladosV, ladosH, areaVisivel, areaBruta,
      volume: vazio ? 0 : areaBruta * tipo.thickness,
    };
    paineis.push(painel);
    porCanon.set(reg.canon, painel);
  }
  const painelDaCelula = Array.from({ length: nu * nv }, (_, idx) => {
    const p = porCanon.get(at(g.remocao.regiaoDeCelula, idx));
    if (!p) throw erroEntrada(`célula sem região (${idx})`);
    return p;
  });

  return { montantes, segmentos, paineis, painelDaCelula, largurasU, largurasV, centrosU, centrosV };
}
