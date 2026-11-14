import { massasDoProjeto, type MalhaMassaProjeto } from '@hestia/engine';
import { isMass, type Id, type Mass, type PerfilMassa, type Project } from '@hestia/model';
import type { ElementRange } from './solids.ts';

/**
 * Massa conceitual no 3D (plano de massa, ficha V1). A malha vem do kernel por nível (`servicoMassa().malha`, consulta 140); aqui ficam as contas puras
 * que a cena usa: uma PEÇA por massa (os triângulos de todas as cópias, com vértices próprios por face), o cache de peças por assinatura, o LOTE do
 * nível (uma geometria com uma faixa de índices por massa, decisão 0016) e o contorno da base da reserva (sem kernel). Nada aqui calcula anel, fatia
 * ou malha: a peça só copia e orienta os triângulos que o kernel entregou.
 *
 * O desenho (material transparente, sem escrita de profundidade, ordem posterior aos opacos) está em `massaGrupo3d.ts`.
 */

/** Pontos por contorno de círculo ou elipse na reserva (sem kernel). */
const PONTOS_DA_RESERVA = 32;

/**
 * Peça de uma massa: os triângulos de todas as cópias dela (o arranjo), em coordenadas de mundo e com a normal de cada face repetida nos três
 * vértices (sombreamento chapado: a malha do kernel compartilha vértices entre faces). `n` é o número de vértices (três por triângulo).
 */
export interface PecaDeMassa {
  massaId: Id;
  /** Assinatura de geometria da massa (`entradaMassaDoProjeto().assinaturas`) com que a peça foi montada. */
  assinatura: string;
  positions: Float32Array;
  normals: Float32Array;
  n: number;
}

/** Peça de uma massa a partir da malha do nível: grupos da massa (uma faixa por cópia e papel). Triângulo degenerado não entra. */
export function pecaDaMassa(malha: MalhaMassaProjeto, massaId: Id, assinatura: string): PecaDeMassa {
  const v = malha.vertices;
  const pos: number[] = [];
  const nor: number[] = [];
  for (const g of malha.grupos) {
    if (g.massaId !== massaId) continue;
    for (let t = g.primeiro; t + 2 < g.primeiro + g.n; t += 3) {
      const ia = 3 * malha.indices[t]!;
      const ib = 3 * malha.indices[t + 1]!;
      const ic = 3 * malha.indices[t + 2]!;
      const ux = v[ib]! - v[ia]!;
      const uy = v[ib + 1]! - v[ia + 1]!;
      const uz = v[ib + 2]! - v[ia + 2]!;
      const wx = v[ic]! - v[ia]!;
      const wy = v[ic + 1]! - v[ia + 1]!;
      const wz = v[ic + 2]! - v[ia + 2]!;
      let nx = uy * wz - uz * wy;
      let ny = uz * wx - ux * wz;
      let nz = ux * wy - uy * wx;
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-18) continue;
      nx /= l;
      ny /= l;
      nz /= l;
      for (const i of [ia, ib, ic]) {
        pos.push(v[i]!, v[i + 1]!, v[i + 2]!);
        nor.push(nx, ny, nz);
      }
    }
  }
  return { massaId, assinatura, positions: Float32Array.from(pos), normals: Float32Array.from(nor), n: pos.length / 3 };
}

/**
 * Cache de peças por massa, pela assinatura de geometria. Editar UMA massa refaz só a peça dela; as outras vêm do cache (mesmo nível ou não).
 * `construidas` conta as peças montadas desde o começo: é o diagnóstico (e o que o teste confere) de que editar uma massa não reconstrói as demais,
 * e de que mudar só a cor não reconstrói nenhuma.
 */
export class CacheDeMassas3d {
  private readonly mapa = new Map<Id, PecaDeMassa>();
  construidas = 0;

  /** Peça de cada massa dada: a memorizada se a assinatura é a mesma; senão monta de novo a partir de `malha`. */
  pecas(malha: MalhaMassaProjeto, massas: ReadonlyArray<{ id: Id; assinatura: string }>): PecaDeMassa[] {
    return massas.map(({ id, assinatura }) => {
      const memo = this.mapa.get(id);
      if (memo && memo.assinatura === assinatura) return memo;
      const nova = pecaDaMassa(malha, id, assinatura);
      this.mapa.set(id, nova);
      this.construidas++;
      return nova;
    });
  }

  /** Tira do cache as massas que não existem mais no projeto. */
  podar(vivas: ReadonlySet<Id>): void {
    for (const id of [...this.mapa.keys()]) if (!vivas.has(id)) this.mapa.delete(id);
  }

  limpar(): void {
    this.mapa.clear();
  }
}

/** Lote de um nível: uma geometria com as peças das massas em sequência e uma faixa por massa. */
export interface LoteDeMassas {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** Uma faixa por massa com peça (`ElementRange`, decisão 0016); a posição na lista é o índice do material do grupo. */
  faixas: ElementRange[];
}

/** Junta as peças num lote: copia as posições e as normais e escreve os índices em sequência (a peça é uma faixa). Peça vazia não entra. */
export function montarLoteDeMassas(pecas: readonly PecaDeMassa[]): LoteDeMassas {
  const com = pecas.filter((q) => q.n > 0);
  const total = com.reduce((s, q) => s + q.n, 0);
  const positions = new Float32Array(3 * total);
  const normals = new Float32Array(3 * total);
  const indices = new Uint32Array(total);
  const faixas: ElementRange[] = [];
  let k = 0;
  for (const q of com) {
    positions.set(q.positions, 3 * k);
    normals.set(q.normals, 3 * k);
    for (let i = 0; i < q.n; i++) indices[k + i] = k + i;
    faixas.push({ id: q.massaId, start: k, count: q.n });
    k += q.n;
  }
  return { positions, normals, indices, faixas };
}

/** Pontos do perfil de uma seção, em coordenadas locais (origem no centro). Círculo e elipse viram polígono de `PONTOS_DA_RESERVA` pontos. */
export function pontosDoPerfil(perfil: PerfilMassa): Array<{ x: number; y: number }> {
  const anel = (rx: number, ry: number, n: number) => Array.from({ length: n }, (_, k) => {
    const a = (2 * Math.PI * k) / n;
    return { x: rx * Math.cos(a), y: ry * Math.sin(a) };
  });
  switch (perfil.forma) {
    case 'circulo':
      return anel(perfil.raio, perfil.raio, PONTOS_DA_RESERVA);
    case 'elipse':
      return anel(perfil.rx, perfil.ry, PONTOS_DA_RESERVA);
    case 'poligono':
      return anel(perfil.raio, perfil.raio, perfil.lados);
    case 'livre':
      return perfil.pontos.map((q) => ({ x: q.x, y: q.y }));
  }
}

/**
 * Contorno da BASE da massa para a reserva (sem kernel, A.5 "Kernel desligado"): só a primeira seção, com escala, rotação e deslocamento do perfil,
 * na cota `cota + baseOffset`. Não é a geometria da massa: é o desenho mínimo que mostra onde ela está. Devolve pares de pontos (segmentos).
 */
export function contornoDaBase(m: Mass, cota: number): Float32Array {
  const s = m.secoes[0];
  if (!s) return new Float32Array(0);
  const pts = pontosDoPerfil(s.perfil);
  const c = Math.cos(s.rotacao);
  const sn = Math.sin(s.rotacao);
  const z = cota + m.baseOffset;
  const mundo = pts.map((q) => {
    const x = q.x * s.escala;
    const y = q.y * s.escala;
    return { x: m.origem.x + s.dx + c * x - sn * y, y: m.origem.y + s.dy + sn * x + c * y };
  });
  const saida = new Float32Array(6 * mundo.length);
  mundo.forEach((a, i) => {
    const b = mundo[(i + 1) % mundo.length]!;
    saida.set([a.x, a.y, z, b.x, b.y, z], 6 * i);
  });
  return saida;
}

/** Massas do nível, na ordem de criação. */
export function massasDoNivel(p: Project, levelId: Id): Mass[] {
  return massasDoProjeto(p).filter((m) => m.levelId === levelId);
}

/** Há alguma massa no projeto? (sem isso a camada não faz nada: nenhum custo para quem não usa massa). */
export const temMassa = (p: Project): boolean => Object.values(p.elements).some(isMass);
