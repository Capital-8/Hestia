/**
 * Referência TS das peças da parede cortina (decisão 0056, §5.3 e §5.4): montantes por segmento (papel, prioridade de
 * junção, aparo reto) e painéis por célula (retângulo livre, área visível e bruta). Fase 1: perfis `rect` e `round`
 * (as demais formas são ENTRADA até a fase 3); sem remoção de segmento nem sobrescrita de célula (fase 2).
 * Coordenadas locais do plano da cortina: `s` ao longo do eixo (0..L), `z` de baixo para cima (0..H).
 * O montante de borda é EMBUTIDO em [0, L] × [0, H] (face externa rente à ponta; decisão do dono); o interior é centrado na linha.
 */
import {
  CURTAIN_PANEL_BITE, TOL_SOLDA, at, erroEntrada,
  type CortinaEntrada, type CurtainPanelTypeRef, type MullionTypeRef,
} from './tipos.ts';
import type { GradeResolvida } from './grade.ts';

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
  /** Área da seção (m²) do perfil. */
  areaPerfil: number;
}

/** Montante de um segmento que não gera peça (papel nulo): só consta da tabela de segmentos. */
export interface SegmentoLinha {
  eixo: 'u' | 'v';
  indiceLinha: number;
  linha: number;
  k: number;
  de: number;
  ate: number;
  tipoNum: number | null;
}

export interface PainelCelula {
  i: number;
  j: number;
  tipoId: string;
  tipoNum: number;
  materialNum: number;
  kind: 'glass' | 'solid' | 'empty';
  papel: number;
  espessura: number;
  deslocamento: number;
  bite: number;
  /** Retângulo livre (a célula menos a meia largura dos montantes que a margeiam). Largura/altura nunca negativas. */
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
  paineis: PainelCelula[];
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
  if (t.profile.shape !== 'rect' && t.profile.shape !== 'round') throw erroEntrada(`forma de montante não suportada na fase 1 (${t.profile.shape})`);
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

export function calcularPecas(e: CortinaEntrada, g: GradeResolvida): Pecas {
  if (!(e.tipo.depth > 0)) throw erroEntrada('profundidade do sistema inválida');
  const m = e.tipo.mullions;
  const nu = g.nu;
  const nv = g.nv;
  const sB = g.u.bordas;
  const zB = g.v.bordas;

  // Tipo de montante por linha (papel): bordas e interiores. Fase 1 não usa `corner`.
  const tipoU = (li: number): MullionTypeRef | null => achaMontante(e, li === 0 ? m.borderStart : li === nu ? m.borderEnd : m.interiorVertical);
  const tipoV = (lj: number): MullionTypeRef | null => achaMontante(e, lj === 0 ? m.borderBottom : lj === nv ? m.borderTop : m.interiorHorizontal);
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

  const montantes: Montante[] = [];
  const segmentos: SegmentoLinha[] = [];
  const verticalContinuo = m.joinPriority === 'vertical';

  const empurra = (
    eixo: 'u' | 'v', indiceLinha: number, k: number, t: MullionTypeRef | null, papel: number,
    de: number, ate: number, deAparado: number, ateAparado: number, continuo: boolean,
  ): void => {
    const linha = eixo === 'u' ? indiceLinha : nu + 1 + indiceLinha;
    segmentos.push({ eixo, indiceLinha, linha, k, de, ate, tipoNum: t ? t.num : null });
    if (!t) return;
    const comprimento = ateAparado - deAparado;
    if (comprimento <= TOL_SOLDA) return; // nada sobra do segmento depois do aparo
    const vertical = eixo === 'u';
    montantes.push({
      papel, eixo, indiceLinha, linha, k, tipoId: t.id, tipoNum: t.num, materialNum: t.materialNum,
      forma: t.profile.shape as 'rect' | 'round', largura: t.profile.width, profundidade: profundidadeDoPerfil(t), deslocamento: t.offset ?? 0,
      vertical,
      s: vertical ? at(centrosU, indiceLinha) : deAparado,
      z: vertical ? deAparado : at(centrosV, indiceLinha),
      comprimento, de, ate, continuo, areaPerfil: areaDoPerfil(t),
    });
  };

  // Linhas verticais (U): cada uma tem nv segmentos, entre as linhas horizontais que a cruzam.
  for (let li = 0; li <= nu; li++) {
    for (let k = 0; k < nv; k++) {
      const de = at(zB, k);
      const ate = at(zB, k + 1);
      const aparar = !verticalContinuo; // vertical é aparado quando o horizontal manda
      const dA = aparar ? de + recuoV(k) : de;
      const aA = aparar ? ate - recuoV(k + 1) : ate;
      empurra('u', li, k, at(tU, li), papelU(li), de, ate, dA, aA, !aparar);
    }
  }
  // Linhas horizontais (V): cada uma tem nu segmentos, entre as linhas verticais que a cruzam.
  for (let lj = 0; lj <= nv; lj++) {
    for (let k = 0; k < nu; k++) {
      const de = at(sB, k);
      const ate = at(sB, k + 1);
      const aparar = verticalContinuo; // horizontal é aparado quando o vertical manda
      const dA = aparar ? de + recuoU(k) : de;
      const aA = aparar ? ate - recuoU(k + 1) : ate;
      empurra('v', lj, k, at(tV, lj), papelV(lj), de, ate, dA, aA, !aparar);
    }
  }

  // Painéis: um por célula (a fase 2 passa a fundir regiões e a aplicar sobrescritas).
  const padraoId = e.instancia?.defaultPanelTypeId ?? e.tipo.defaultPanelTypeId;
  const tipoPainel = achaPainel(e, padraoId);
  const paineis: PainelCelula[] = g.celulas.map((c) => {
    const s0 = c.s0 + recuoU(c.i);
    const s1 = c.s1 - recuoU(c.i + 1);
    const z0 = c.z0 + recuoV(c.j);
    const z1 = c.z1 - recuoV(c.j + 1);
    const larguraLivre = Math.max(0, s1 - s0);
    const alturaLivre = Math.max(0, z1 - z0);
    const ladosV = (at(largurasU, c.i) > 0 ? 1 : 0) + (at(largurasU, c.i + 1) > 0 ? 1 : 0);
    const ladosH = (at(largurasV, c.j) > 0 ? 1 : 0) + (at(largurasV, c.j + 1) > 0 ? 1 : 0);
    const bite = tipoPainel.bite ?? CURTAIN_PANEL_BITE;
    const areaVisivel = larguraLivre * alturaLivre;
    const vazio = tipoPainel.kind === 'empty';
    const areaBruta = vazio || areaVisivel === 0 ? areaVisivel : (larguraLivre + bite * ladosV) * (alturaLivre + bite * ladosH);
    return {
      i: c.i, j: c.j, tipoId: tipoPainel.id, tipoNum: tipoPainel.num, materialNum: tipoPainel.materialNum, kind: tipoPainel.kind,
      papel: tipoPainel.kind === 'glass' ? PAPEL_VIDRO : tipoPainel.kind === 'solid' ? PAPEL_SOLIDO : PAPEL_VAZIO,
      espessura: vazio ? 0 : tipoPainel.thickness, deslocamento: tipoPainel.offset ?? 0, bite,
      livre: { s0, s1, z0, z1 }, larguraLivre, alturaLivre, ladosV, ladosH, areaVisivel, areaBruta,
      volume: vazio ? 0 : areaBruta * tipoPainel.thickness,
    };
  });

  return { montantes, segmentos, paineis, largurasU, largurasV, centrosU, centrosV };
}
