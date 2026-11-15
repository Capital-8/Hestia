import { convexHull, type Vec2 } from '@hestia/geom';
import { hashTexto, servicoTerreno, type MalhaTerreno } from '@hestia/engine';
import type { Id, Material, Project, Terrain, TerrainRegion } from '@hestia/model';
import { isTerrain, isTerrainRegion } from '@hestia/model';
import { ofElement, type SolidBatch } from './solids.ts';

/**
 * Terreno na vista 3D (PLANO A.8 item 6). A malha NÃO nasce aqui: vem do kernel (`servicoTerreno().malha`, superfície proposta) e este arquivo só a
 * transforma em lotes da categoria `site`, um por terreno e por material, com a faixa de índices (`ElementRange`, decisão 0016) de cada terreno e de cada
 * região. Sem kernel, o terreno é só a borda tracejada de reserva (a `borda` do modelo ou a envoltória convexa das fontes, que são dado do modelo).
 * O lote (`kind: 'lot'`) não entra no 3D.
 */

/** Cor do terreno sem material nem cor (areia). */
export const COR_PADRAO_TERRENO = '#b5a27a';

/** Prefixo do id de material sintético de cor avulsa (`color` do terreno ou da região): `tn_cor_<hex sem #>`. */
export const PREFIXO_COR_TN = 'tn_cor_';

/** De onde a cena lê a malha do terreno: o serviço do kernel (único caminho; nenhum TS gera a malha). Os testes injetam o deles. */
export interface FonteTerreno {
  pronto(): boolean;
  /** Superfície proposta de todos os terrenos, ou `null` sem kernel (ou com o kernel recusando os dados). */
  malha(p: Project): MalhaTerreno[] | null;
}

export const fonteDoServicoTerreno: FonteTerreno = {
  pronto: () => servicoTerreno().pronto(),
  malha: (p) => servicoTerreno().malha(p, 1, null),
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Material sintético de uma cor avulsa, ou `undefined` se o id não é de cor do terreno. Fosco e opaco. */
export function materialDeCorTN(id: Id): Material | undefined {
  if (!id.startsWith(PREFIXO_COR_TN)) return undefined;
  const cor = `#${id.slice(PREFIXO_COR_TN.length)}`;
  if (!HEX.test(cor)) return undefined;
  return { id, name: 'Terreno', color: cor, hatch: 'none', gloss: 0.05, opacity: 1, cost: 0, unit: 'm2' };
}

const idDeCor = (cor: string): Id => `${PREFIXO_COR_TN}${cor.slice(1).toLowerCase()}`;

/** Material ou cor de um dono (região ou terreno): o material do projeto vale mais que a cor avulsa. `null` = o dono não define aparência. */
function aparenciaDe(p: Pick<Project, 'materials'>, d: { materialId?: Id | undefined; color?: string | undefined }): Id | null {
  if (d.materialId !== undefined && p.materials[d.materialId]) return d.materialId;
  if (d.color !== undefined && HEX.test(d.color)) return idDeCor(d.color);
  return null;
}

/**
 * Material de uma parte da malha: o da região (material, senão cor), senão o do terreno (material, senão cor), senão a cor padrão. A saia e a base
 * (`regiao` nula) usam o terreno.
 */
export function materialDoTerreno(p: Pick<Project, 'materials'>, t: Terrain, regiao: TerrainRegion | null): Id {
  return (regiao ? aparenciaDe(p, regiao) : null) ?? aparenciaDe(p, t) ?? idDeCor(COR_PADRAO_TERRENO);
}

/** Regiões de cada terreno, na ordem de `order` (e id). Um passo só sobre os elementos. */
export function regioesPorTerreno(p: Pick<Project, 'elements'>): Map<Id, TerrainRegion[]> {
  const out = new Map<Id, TerrainRegion[]>();
  for (const e of Object.values(p.elements)) {
    if (!isTerrainRegion(e)) continue;
    const l = out.get(e.terrenoId);
    if (l) l.push(e);
    else out.set(e.terrenoId, [e]);
  }
  for (const l of out.values()) l.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

/** Terrenos do projeto, na ordem de `order` (e id). */
export function terrenosDoProjeto(p: Pick<Project, 'elements'>): Terrain[] {
  return Object.values(p.elements)
    .filter(isTerrain)
    .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Acrescenta os triângulos com a normal plana de cada face (vértices próprios: a malha do kernel compartilha vértices e a borda vertical pede aresta viva). */
function empurrarMalha(b: SolidBatch, pos: readonly number[], indices: readonly number[]): void {
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const ia = indices[t]! * 3;
    const ib = indices[t + 1]! * 3;
    const ic = indices[t + 2]! * 3;
    const ux = pos[ib]! - pos[ia]!;
    const uy = pos[ib + 1]! - pos[ia + 1]!;
    const uz = pos[ib + 2]! - pos[ia + 2]!;
    const vx = pos[ic]! - pos[ia]!;
    const vy = pos[ic + 1]! - pos[ia + 1]!;
    const vz = pos[ic + 2]! - pos[ia + 2]!;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-18) continue;
    nx /= l;
    ny /= l;
    nz /= l;
    const base = b.positions.length / 3;
    for (const i of [ia, ib, ic]) {
      b.positions.push(pos[i]!, pos[i + 1]!, pos[i + 2]!);
      b.normals.push(nx, ny, nz);
    }
    b.indices.push(base, base + 1, base + 2);
  }
}

/**
 * Lotes de UM terreno (categoria `site`): um por material. A superfície de cada região vai na faixa da região (clicar nela seleciona a região); a
 * superfície sem região, a saia e a base vão na faixa do terreno. Região oculta (`regiaoOculta`) fica na faixa do terreno, com a cor dela.
 */
export function solidosDoTerreno(
  p: Pick<Project, 'materials' | 'elements'>,
  t: Terrain,
  regioes: readonly TerrainRegion[],
  malha: MalhaTerreno,
  regiaoOculta: (regiaoId: Id) => boolean = () => false,
): SolidBatch[] {
  const porId = new Map(regioes.map((r) => [r.id, r] as const));
  const lotes = new Map<Id, SolidBatch>();
  const ordem = { superficie: 0, saia: 1, base: 2 } as const;
  const partes = [...malha.partes].sort((a, b) => ordem[a.papel] - ordem[b.papel]);
  for (const parte of partes) {
    const regiao = parte.papel === 'superficie' && parte.regiaoId !== null ? (porId.get(parte.regiaoId) ?? null) : null;
    const materialId = materialDoTerreno(p, t, regiao);
    let lote = lotes.get(materialId);
    if (!lote) {
      lote = { materialId, category: 'site', positions: [], normals: [], indices: [], ids: [] };
      lotes.set(materialId, lote);
    }
    const dono = regiao && !regiaoOculta(regiao.id) ? regiao.id : t.id;
    const alvo = lote;
    ofElement(alvo, dono, () => empurrarMalha(alvo, parte.positions, parte.indices));
  }
  return [...lotes.values()].filter((b) => b.indices.length > 0);
}

const memoTexto = new WeakMap<object, string>();

/** Texto de um elemento memorizado pela identidade do objeto (o armazém só troca o objeto que muda). */
function textoDe(o: object, f: () => string): string {
  let s = memoTexto.get(o);
  if (s === undefined) memoTexto.set(o, (s = f()));
  return s;
}

/**
 * Chave de conteúdo de UM terreno na cena 3D: a marca da vista (tema, arestas, sombras, estilo, categoria `site`, kernel pronto), o que o desenha (fontes,
 * borda, espessura, material e cor), as regiões dele e os materiais que usam. Nome, rótulos, pontos cotados e `mostrarExistente` não entram. Editar um
 * terreno só muda a chave dele.
 */
export function chaveDoTerreno(p: Pick<Project, 'materials'>, t: Terrain, regioes: readonly TerrainRegion[], marca: string, regiaoOculta: (regiaoId: Id) => boolean = () => false): string {
  const proprio = textoDe(t, () => JSON.stringify([t.levelId, t.pontos, t.curvas, t.quebras, t.borda ?? null, t.espessuraBase, t.materialId ?? null, t.color ?? null]));
  const regs = regioes.map((r) => `${textoDe(r, () => JSON.stringify([r.id, r.contorno, r.papel, r.cota, r.inclinacao, r.direcao, r.taludeCorte, r.taludeAterro, r.order, r.materialId ?? null, r.color ?? null]))}${regiaoOculta(r.id) ? 'o' : ''}`);
  const usados = new Set<Id>();
  for (const d of [t, ...regioes]) if (d.materialId !== undefined) usados.add(d.materialId);
  const mats = [...usados].sort().map((id) => JSON.stringify(p.materials[id] ?? null));
  return hashTexto([marca, proprio, regs.join(';'), mats.join(';')].join('|'));
}

/** Polígono de reserva do terreno sem kernel: a borda do modelo, senão a envoltória convexa das fontes (pontos, curvas e quebras). `null` = menos de 3 pontos distintos. */
export function poligonoDeReserva(t: Terrain): Vec2[] | null {
  if (t.borda && t.borda.length >= 6) {
    const anel: Vec2[] = [];
    for (let k = 0; k + 1 < t.borda.length; k += 2) anel.push({ x: t.borda[k]!, y: t.borda[k + 1]! });
    return anel;
  }
  const pts: Vec2[] = [];
  for (let k = 0; k + 2 < t.pontos.length; k += 3) pts.push({ x: t.pontos[k]!, y: t.pontos[k + 1]! });
  for (const c of t.curvas) for (let k = 0; k + 1 < c.xy.length; k += 2) pts.push({ x: c.xy[k]!, y: c.xy[k + 1]! });
  for (const q of t.quebras) for (let k = 0; k + 2 < q.xyz.length; k += 3) pts.push({ x: q.xyz[k]!, y: q.xyz[k + 1]! });
  const casco = convexHull(pts);
  return casco.length >= 3 ? casco : null;
}

/** Cota média das fontes do terreno (onde a borda de reserva é desenhada); 0 sem fontes. */
export function cotaDeReserva(t: Terrain): number {
  let soma = 0;
  let n = 0;
  for (let k = 2; k < t.pontos.length; k += 3) (soma += t.pontos[k]!), n++;
  for (const c of t.curvas) (soma += c.z * (c.xy.length / 2)), (n += c.xy.length / 2);
  for (const q of t.quebras) for (let k = 2; k < q.xyz.length; k += 3) (soma += q.xyz[k]!), n++;
  return n ? soma / n : 0;
}

/** Segmentos (pares de pontos x, y, z) do contorno fechado `anel` tracejado com `traco` e `vao` (m) na cota `z`. O padrão corre contínuo ao longo do perímetro. */
export function tracejarAnel(anel: readonly Vec2[], z: number, traco: number, vao: number): number[] {
  const out: number[] = [];
  if (anel.length < 2 || traco <= 0 || vao < 0) return out;
  const periodo = traco + vao;
  let s = 0;
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i]!;
    const b = anel[(i + 1) % anel.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-12) continue;
    let t0 = 0;
    while (t0 < len - 1e-12) {
      const fase = (s + t0) % periodo;
      const emTraco = fase < traco;
      const resto = (emTraco ? traco : periodo) - fase;
      const t1 = Math.min(len, t0 + Math.max(resto, 1e-9));
      if (emTraco) {
        const f0 = t0 / len;
        const f1 = t1 / len;
        out.push(a.x + (b.x - a.x) * f0, a.y + (b.y - a.y) * f0, z, a.x + (b.x - a.x) * f1, a.y + (b.y - a.y) * f1, z);
      }
      t0 = t1;
    }
    s += len;
  }
  return out;
}

/** Borda tracejada de reserva do terreno (posições dos segmentos, x, y, z em pares), ou `null` se as fontes não formam polígono. Traço proporcional ao perímetro. */
export function bordaTracejadaDeReserva(t: Terrain): number[] | null {
  const anel = poligonoDeReserva(t);
  if (!anel) return null;
  let perimetro = 0;
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i]!;
    const b = anel[(i + 1) % anel.length]!;
    perimetro += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const traco = Math.max(0.5, perimetro / 150);
  const seg = tracejarAnel(anel, cotaDeReserva(t), traco, traco * 0.6);
  return seg.length ? seg : null;
}
