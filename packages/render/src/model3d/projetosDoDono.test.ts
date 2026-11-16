import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  analyzeLevelTilt,
  computeSection,
  junctionLevel,
  levelFrames,
  limparCachesDeConteudo,
  openingGeometry,
  resolveLevel,
  tangentAt,
  toLocal,
  joinStatus,
  wallTopFacesCached,
  type WallFrame,
} from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeWall, migrateProject, type Layer, type Project, type Wall } from '@hestia/model';
import { planViewOf } from '../plan/view.ts';
import { buildLevelSolids, wallLayerSolid, type SolidBatch } from './solids.ts';
import { buildLevelSolidsComCaixas } from './paredesInstanciadas3d.ts';

/**
 * J5 · aceite com os projetos de teste do dono.
 * Os projetos NÃO fazem parte do repositório: são lidos de `HESTIA_PROJETOS` (ou `~/Documents/Projetos`) em tempo de execução.
 * Sem a pasta, a parte dos projetos é pulada (`describe.skipIf`); o fuzz e o desempenho sintético não dependem dela.
 * `HESTIA_GRAVAR_ACEITE=1` grava a tabela em `docs/parede-formas/aceite-projetos.md`.
 */
const PASTA = process.env.HESTIA_PROJETOS ?? join(homedir(), 'Documents', 'Projetos');
const TEM_PASTA = existsSync(PASTA);
if (!TEM_PASTA) console.log(`[J5] pasta de projetos do dono não encontrada (${PASTA}): testes de aceite dos projetos PULADOS`);

interface Carregado { nome: string; project: Project }
/** Carregador de produção (controller.ts): `migrateProject(JSON.parse(texto))`. */
function carregar(): Carregado[] {
  if (!TEM_PASTA) return [];
  const out: Carregado[] = [];
  for (const d of readdirSync(PASTA, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()) {
    const f = join(PASTA, d, 'projeto.hestia.json');
    if (existsSync(f)) out.push({ nome: d, project: migrateProject(JSON.parse(readFileSync(f, 'utf8'))) });
  }
  return out;
}
const projetos = carregar();
const PRINCIPAL = projetos.find((c) => c.nome === 'Projeto sem título');
const NIVEL23 = projetos.filter((c) => c.project.schemaVersion >= 23 && c.nome !== 'Projeto sem título' && Object.values(c.project.elements).some((e) => e.kind === 'roof'));

// ---------------------------------------------------------------- medição de fresta e sobreposição (método do diag.mts)
type Seg = [number, number, number, number];
type V2 = { x: number; y: number };
function secaoPorCamada(p: Project, lv: string, id: string, z: number, rl = resolveLevel(p, lv), jl = junctionLevel(p, lv)): Seg[][] {
  const rw = rl.walls[id]!;
  const out: Seg[][] = [];
  for (const l of rw.layers) {
    const b: SolidBatch = wallLayerSolid(rw, l, jl);
    const segs: Seg[] = [];
    for (let i = 0; i < b.indices.length; i += 3) {
      const t = [0, 1, 2].map((j) => [0, 1, 2].map((c) => b.positions[b.indices[i + j]! * 3 + c]!));
      const pts: number[][] = [];
      for (let j = 0; j < 3; j++) {
        const a = t[j]!, c = t[(j + 1) % 3]!;
        const da = a[2]! - z, dc = c[2]! - z;
        if (Math.abs(da) < 1e-9 && Math.abs(dc) < 1e-9) continue;
        if (Math.abs(da) < 1e-9) pts.push([a[0]!, a[1]!]);
        else if (da * dc < 0) { const k = da / (da - dc); pts.push([a[0]! + k * (c[0]! - a[0]!), a[1]! + k * (c[1]! - a[1]!)]); }
      }
      const u: number[][] = [];
      for (const q of pts) if (!u.some((r) => Math.hypot(r[0]! - q[0]!, r[1]! - q[1]!) < 1e-9)) u.push(q);
      if (u.length === 2) segs.push([u[0]![0]!, u[0]![1]!, u[1]![0]!, u[1]![1]!]);
    }
    out.push(segs);
  }
  return out;
}
const dentro = (s: Seg[], x: number, y: number): boolean => {
  let c = false;
  for (const [x1, y1, x2, y2] of s) if ((y1 > y) !== (y2 > y) && x < x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)) c = !c;
  return c;
};
const distSeg = (s: Seg[], x: number, y: number): number => {
  let m = 1e9;
  for (const [x1, y1, x2, y2] of s) {
    const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / l));
    m = Math.min(m, Math.hypot(x1 + t * dx - x, y1 + t * dy - y));
  }
  return m;
};
const emAlguma = (L: Seg[][], x: number, y: number): boolean => L.some((s) => dentro(s, x, y));
const distAlguma = (L: Seg[][], x: number, y: number): number => Math.min(...L.map((s) => distSeg(s, x, y)));
/** Pontos das tampas (arestas de extremidade) de uma parede perto do nó: arestas não paralelas ao eixo. */
function tampas(A: Seg[][], g: WallFrame, w: 'a' | 'b', no: V2): Array<[number, number, number]> {
  const t0 = tangentAt(g, w === 'a' ? 0 : g.length);
  const out: Array<[number, number, number]> = [];
  for (const [li, s] of A.entries()) for (const [x1, y1, x2, y2] of s) {
    const l = Math.hypot(x2 - x1, y2 - y1);
    if (l < 1e-6) continue;
    if (Math.hypot((x1 + x2) / 2 - no.x, (y1 + y2) / 2 - no.y) > 0.9) continue;
    if (Math.abs((x2 - x1) * t0.x + (y2 - y1) * t0.y) / l > 0.75) continue;
    for (let k = 0; k <= 10; k++) out.push([x1 + ((x2 - x1) * k) / 10, y1 + ((y2 - y1) * k) / 10, li]);
  }
  return out;
}
/** `fresta`/`sobrep`: todas as camadas; `frestaG`/`sobrepG`: só camadas com espessura >= 5 mm (a tinta de 2 mm fica de fora). */
interface Medida { fresta: number; sobrep: number; frestaG: number; sobrepG: number; onde?: string }
function medirNoEm(p: Project, lv: string, ia: string, wa: 'a' | 'b', ib: string, wb: 'a' | 'b', no: V2, z: number, fr: Map<string, WallFrame>): Medida {
  const rl = resolveLevel(p, lv), jl = junctionLevel(p, lv);
  const A = secaoPorCamada(p, lv, ia, z, rl, jl), B = secaoPorCamada(p, lv, ib, z, rl, jl);
  const espCamada = (id: string, li: number): number => p.wallTypes[(p.elements[id] as Wall).typeId]!.layers[rl.walls[id]!.layers[li]!.layerIndex]!.thickness;
  let fresta = 0, sobrep = 0, frestaG = 0, sobrepG = 0, onde = '';
  for (const [P, g, w, Q, id] of [[A, fr.get(ia)!, wa, B, ia], [B, fr.get(ib)!, wb, A, ib]] as const) {
    for (const [x, y, li] of tampas(P, g, w, no)) {
      const grossa = espCamada(id, li) >= 0.005;
      if (emAlguma(Q, x, y)) {
        const e = Math.min(...Q.filter((s) => dentro(s, x, y)).map((s) => distSeg(s, x, y)));
        sobrep = Math.max(sobrep, e);
        if (grossa) sobrepG = Math.max(sobrepG, e);
      } else {
        const d = distAlguma(Q, x, y);
        if (d > fresta) { fresta = d; onde = `(${x.toFixed(4)}, ${y.toFixed(4)}) camada ${li} de ${id}`; }
        if (grossa) frestaG = Math.max(frestaG, d);
      }
    }
  }
  return { fresta, sobrep, frestaG, sobrepG, onde };
}

interface NoMedido {
  id: string;
  tipos: string;
  tilts: string;
  z: number[];
  m: Medida[];
  avisos: string[];
  inviavel: boolean;
  espessura: number;
  onde: string;
}
const s5 = (id: string): string => id.slice(2, 7);
/** Todos os nós pareados (ponta com ponta) do nível; mede nas cotas baixa, meio e topo (a menor altura dos dois). */
function medirNos(p: Project, lv: string): NoMedido[] {
  const frames = levelFrames(p, lv);
  const fr = new Map(frames.map((f) => [f.wall.id, f] as const));
  const rl = resolveLevel(p, lv);
  const heights = new Map(Object.values(rl.walls).map((w) => [w.wallId, w.height] as const));
  const an = analyzeLevelTilt(frames, heights, p.settings?.joinTolerance);
  const feito = new Set<string>();
  const out: NoMedido[] = [];
  for (const f of frames) for (const w of ['a', 'b'] as const) {
    const st = joinStatus(frames, f.wall.id, w, p.settings?.joinTolerance);
    if (st.kind !== 'pair') continue;
    const q = st.partners[0]!;
    const chave = [`${f.wall.id}.${w}`, `${q.wallId}.${q.end}`].sort().join('~');
    if (feito.has(chave)) continue;
    feito.add(chave);
    const g = fr.get(q.wallId)!;
    const no = w === 'a' ? f.a : f.b;
    const H = Math.min(rl.walls[f.wall.id]!.height, rl.walls[q.wallId]!.height);
    const z = [0.01, H * 0.4973, H - 0.01]; // meio fora da cota dos níveis da malha (H/2 é nível: a aresta no plano some da seção)
    const m = z.map((zz) => medirNoEm(p, lv, f.wall.id, w, q.wallId, q.end, no, zz, fr));
    const tipo = (x: WallFrame): string => (x.arc ? `arco R${x.arc.radius.toFixed(2)}` : 'reta');
    const avisos = an.avisos.filter((a) => a.wallId === f.wall.id || a.wallId === q.wallId).map((a) => a.code);
    out.push({
      id: `${s5(f.wall.id)}.${w}-${s5(q.wallId)}.${q.end}`,
      tipos: `${tipo(f)} × ${tipo(g)}`,
      tilts: `${f.wall.tilt ?? 0}/${g.wall.tilt ?? 0}`,
      z,
      m,
      onde: JSON.stringify(m.map((x) => x.onde)),
      avisos: [...new Set(avisos)],
      inviavel: avisos.some((c) => c === 'arcoInclinadoSemJuncao' || c === 'inclinacaoInviavelNaJuncao'),
      espessura: Math.max(...[f.wall.id, q.wallId].map((id) => (rl.walls[id]!.sHi - rl.walls[id]!.sLo) / Math.cos(((rl.walls[id]!.tilt ?? 0) * Math.PI) / 180))),
    });
  }
  return out;
}
const mm = (v: number): string => (v * 1000).toFixed(3);
const linhaTabela = (n: NoMedido): string =>
  `| ${n.id} | ${n.tipos} | ${n.tilts} | ${n.m.map((x) => `${mm(x.fresta)} / ${mm(x.sobrep)}`).join(' | ')} | ${n.avisos.join(', ') || '-'} | ${n.inviavel ? 'inviável' : 'exata'} |`;
const CABECALHO = '| Nó | Tipos | Tilts (°) | z baixo (fresta/sobrep., mm) | z meio | z topo | Avisos | Status |\n|---|---|---|---|---|---|---|---|';

// ---------------------------------------------------------------- 1, 5 · carga, solidos, vistas e desempenho
describe.skipIf(!TEM_PASTA || projetos.length === 0)('J5 · projetos do dono: carga e geração', () => {
  // O desempenho vem primeiro: o processo ainda está frio e os caches de conteúdo são esvaziados.
  /** Roda o pipeline inteiro do projeto principal (arquivo relido, caches de conteúdo esvaziados) e devolve os tempos em ms. */
  const pipeline = (): Record<string, number> => {
    limparCachesDeConteudo();
    const p = migrateProject(JSON.parse(readFileSync(join(PASTA, PRINCIPAL!.nome, 'projeto.hestia.json'), 'utf8')));
    const t: Record<string, number> = {};
    const ms = <T,>(k: string, f: () => T): T => { const a = performance.now(); const r = f(); t[k] = performance.now() - a; return r; };
    const lv = p.levels[0]!.id;
    const rls = ms('resolver', () => p.levels.map((l) => resolveLevel(p, l.id)));
    const jl = ms('junções', () => junctionLevel(p, lv));
    ms('sólidos', () => buildLevelSolids(rls[0]!, jl));
    ms('planta', () => planViewOf(p, lv));
    ms('corte', () => computeSection(p, { a: { x: -20, y: 2 }, b: { x: 20, y: 2 }, depth: 30 }));
    ms('elevação', () => computeSection(p, { a: { x: -20, y: -30 }, b: { x: 20, y: -30 }, depth: 80 }));
    t.total = Object.values(t).reduce((a, b) => a + b, 0);
    return t;
  };
  const fmt = (t: Record<string, number>): string => Object.entries(t).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ');
  // O desempenho vem primeiro: o processo ainda está frio (JIT) e os caches de conteúdo são esvaziados antes de cada rodada.
  const rodadas: Array<Record<string, number>> = [];
  it('(5) projeto principal inteiro (resolver, junções, sólidos, planta, corte, elevação): 1ª rodada a frio e 2ª aquecida, tempos impressos', () => {
    if (!PRINCIPAL) return;
    rodadas.push(pipeline(), pipeline());
    console.log(`[J5] desempenho (ms)\n  a frio (1ª rodada, JIT frio): ${fmt(rodadas[0]!)}\n  aquecido (2ª rodada, caches de conteúdo vazios): ${fmt(rodadas[1]!)}`);
    expect(rodadas[1]!.total).toBeLessThan(30000); // só detecta regressão grosseira; o limite do aceite (2 s) está no it.fails abaixo
  }, 120000);
  // D4 (corrigido): o pipeline caía de 4,4 s para ~1,6 s a frio (Clipper, casamento de vértices, tiltPlan preguiçoso); limite do aceite: 2 s.
  it('(5) projeto principal inteiro a frio < 2 s (J5-D4)', () => {
    if (!PRINCIPAL) throw new Error('sem projeto');
    expect(rodadas[0]!.total).toBeLessThan(2000);
  });

  for (const { nome, project } of projetos) {
    describe(nome, () => {
      it('carrega pelo migrateProject, resolve todos os níveis e gera sólidos, planta, corte, elevação e faces superiores sem lançar', () => {
        expect(project.levels.length).toBeGreaterThan(0);
        const frames0 = levelFrames(project, project.levels[0]!.id);
        const xs = frames0.flatMap((f) => [f.a.x, f.b.x]), ys = frames0.flatMap((f) => [f.a.y, f.b.y]);
        const [x0, x1] = xs.length ? [Math.min(...xs) - 1, Math.max(...xs) + 1] : [-10, 10];
        const [y0, y1] = ys.length ? [Math.min(...ys) - 1, Math.max(...ys) + 1] : [-10, 10];
        for (const l of project.levels) {
          const rl = resolveLevel(project, l.id);
          const jl = junctionLevel(project, l.id);
          expect(() => buildLevelSolids(rl, jl)).not.toThrow();
          expect(() => buildLevelSolidsComCaixas(rl, jl, false)).not.toThrow();
          expect(() => planViewOf(project, l.id)).not.toThrow();
          expect(() => wallTopFacesCached(project, l.id)).not.toThrow();
        }
        expect(() => computeSection(project, { a: { x: x0, y: (y0 + y1) / 2 }, b: { x: x1, y: (y0 + y1) / 2 }, depth: 20 })).not.toThrow();
        expect(() => computeSection(project, { a: { x: x0, y: y0 - 5 }, b: { x: x1, y: y0 - 5 }, depth: y1 - y0 + 10 })).not.toThrow();
      });
    });
  }
});

// ---------------------------------------------------------------- 2 · nós do projeto principal
/** Projeto principal sem as aberturas (as bordas do vão contaminariam a medida) e a medição de todos os nós, uma vez só. */
let nosPrincipal: NoMedido[] | null = null;
const nosDoPrincipal = (): NoMedido[] => {
  if (nosPrincipal) return nosPrincipal;
  const p = structuredClone(PRINCIPAL!.project);
  for (const [id, e] of Object.entries(p.elements)) if (e.kind === 'door' || e.kind === 'window') delete p.elements[id];
  nosPrincipal = p.levels.filter((l) => levelFrames(p, l.id).length > 0).flatMap((l) => medirNos(p, l.id));
  return nosPrincipal;
};
describe.skipIf(!PRINCIPAL)('J5 · projeto principal: fresta e sobreposição em cada nó', () => {
  it('tabela dos nós (fresta / sobreposição em z baixo, meio e topo) e, com HESTIA_GRAVAR_ACEITE=1, grava aceite-projetos.md', () => {
    const nos = nosDoPrincipal();
    expect(nos.length).toBeGreaterThanOrEqual(10);
    const tabela = [CABECALHO, ...nos.map(linhaTabela)].join('\n');
    console.log(`[J5] nós do projeto principal (fresta / sobreposição em mm; camadas de tinta de 2 mm incluídas)\n${tabela}`);
    if (process.env.HESTIA_J5_DEBUG) for (const n of nos) console.log(n.id, JSON.stringify(n.m.map((x) => x.onde)));
    if (process.env.HESTIA_GRAVAR_ACEITE === '1') {
      const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
      const viaveis = nos.filter((n) => !n.inviavel);
      const pior = Math.max(0, ...viaveis.flatMap((n) => n.m.flatMap((x) => [x.frestaG, x.sobrepG])));
      writeFileSync(
        join(raiz, 'docs/parede-formas/aceite-projetos.md'),
        `# Aceite com os projetos do dono (J5, gerado por \`projetosDoDono.test.ts\`)\n\nProjeto principal "Projeto sem título", ${nos.length} nós de junção entre duas paredes. Medido nos sólidos reais (\`wallLayerSolid\`), sem as aberturas, tampas de cada parede contra a seção da vizinha em z = 0,01, 0,497·H e H−0,01 (o meio não pode ser H/2: é cota de nível da malha e a aresta no plano some da seção). Valores em milímetros, "fresta / sobreposição".\n\nNós viáveis: ${viaveis.length}; inviáveis (aviso): ${nos.length - viaveis.length}; pior valor nos viáveis, camadas de 5 mm ou mais: ${mm(pior)} mm (limite 1 mm). As colunas z incluem a tinta de 2 mm (ver "Defeitos" no ESTADO.md, J5).\n\n${tabela}\n`,
      );
    }
  });
  it('nós viáveis: fresta e sobreposição < 1 mm em z baixo, meio e topo (camadas de 5 mm ou mais)', () => {
    const viaveis = nosDoPrincipal().filter((n) => !n.inviavel);
    expect(viaveis.length).toBeGreaterThanOrEqual(7);
    for (const n of viaveis) for (const x of n.m) {
      expect(x.frestaG, `fresta ${n.id}`).toBeLessThan(1e-3);
      expect(x.sobrepG, `sobreposição ${n.id}`).toBeLessThan(1e-3);
    }
  });
  // DEFEITO (anterior ao tilt, igual com tilt 0): nas esquinas reta×reta o sólido da camada de tinta (2 mm) deixa uma fresta de 2 a 3 mm.
  it.fails('nós viáveis: fresta < 1 mm também na camada de tinta de 2 mm (defeito J5-D1: 2,0 a 3,0 mm, igual com tilt 0)', () => {
    for (const n of nosDoPrincipal().filter((q) => !q.inviavel)) for (const x of n.m) expect(x.fresta, `fresta ${n.id}`).toBeLessThan(1e-3);
  });
  it('nós inviáveis estão listados com aviso (arcoInclinadoSemJuncao / inclinacaoInviavelNaJuncao)', () => {
    const inv = nosDoPrincipal().filter((n) => n.inviavel);
    console.log(`[J5] nós inviáveis: ${inv.map((n) => `${n.id} [${n.avisos.join(', ')}]`).join('; ') || 'nenhum'}`);
    for (const n of inv) expect(n.avisos.length).toBeGreaterThan(0);
  });
  // J5-D2 (resolvido na D2): o trecho 37a7b-179a6-39484-703b7 caía inteiro no plano B por causa de uma camada fina (2 mm) no casamento dos anéis.
  it('nós inviáveis (se houver): fresta < espessura da parede (era J5-D2: até 0,97 m para 0,19 m)', () => {
    for (const n of nosDoPrincipal().filter((q) => q.inviavel)) for (const x of n.m) expect(x.fresta, `fresta ${n.id}`).toBeLessThan(n.espessura);
  });
  it('o projeto principal não tem nó inviável (era J5-D2: 3 nós caíam no plano B por causa de 179a6-39484-703b7)', () => {
    expect(nosDoPrincipal().filter((n) => n.inviavel).map((n) => n.id)).toEqual([]);
  });
});
describe.skipIf(!PRINCIPAL || !process.env.HESTIA_J5_DEBUG)('J5 · controle (informativo): projeto principal com tilt 0', () => {
  it('imprime a fresta dos nós sem inclinação', () => {
    const p = structuredClone(PRINCIPAL!.project);
    for (const [id, e] of Object.entries(p.elements)) { if (e.kind === 'door' || e.kind === 'window') delete p.elements[id]; else if (e.kind === 'wall') delete (e as { tilt?: number }).tilt; }
    const nos = medirNos(p, p.levels[0]!.id);
    console.log(`[J5] controle vertical\n${[CABECALHO, ...nos.map(linhaTabela)].join('\n')}`);
  });
});

// ---------------------------------------------------------------- 3 · projetos (3)(4)(5)
describe.skipIf(NIVEL23.length === 0)('J5 · projetos com telhado, porta e janela (esquema 23)', () => {
  for (const { nome, project } of NIVEL23) {
    it(`${nome}: telhado, paredes, vão de porta e janela, faces superiores`, () => {
      const els = Object.values(project.elements);
      expect(els.filter((e) => e.kind === 'roof').length).toBeGreaterThanOrEqual(1);
      const paredes = els.filter((e): e is Wall => e.kind === 'wall');
      expect(paredes.length).toBeGreaterThanOrEqual(6);
      const lv = paredes[0]!.levelId;
      const frames = levelFrames(project, lv);
      const rl = resolveLevel(project, lv);
      const jl = junctionLevel(project, lv);
      const volume = (r: typeof rl, id: string): number => {
        let v = 0;
        for (const l of r.walls[id]!.layers) {
          const b = wallLayerSolid(r.walls[id]!, l, jl);
          const P = (k: number): number[] => [b.positions[k * 3]!, b.positions[k * 3 + 1]!, b.positions[k * 3 + 2]!];
          for (let i = 0; i < b.indices.length; i += 3) {
            const [a, c, d] = [P(b.indices[i]!), P(b.indices[i + 1]!), P(b.indices[i + 2]!)] as [number[], number[], number[]];
            v += (a[0]! * (c[1]! * d[2]! - c[2]! * d[1]!) - a[1]! * (c[0]! * d[2]! - c[2]! * d[0]!) + a[2]! * (c[0]! * d[1]! - c[1]! * d[0]!)) / 6;
          }
        }
        return v;
      };
      const semVaos = structuredClone(project);
      for (const [id, e] of Object.entries(semVaos.elements)) if (e.kind === 'door' || e.kind === 'window') delete semVaos.elements[id];
      const rlSem = resolveLevel(semVaos, lv);
      const jlSem = junctionLevel(semVaos, lv);
      for (const tipo of ['door', 'window'] as const) {
        const o = els.find((e) => e.kind === tipo);
        expect(o, tipo).toBeDefined();
        if (!o || (o.kind !== 'door' && o.kind !== 'window')) continue;
        const f = frames.find((x) => x.wall.id === o.hostId)!;
        expect(f, `hospedeira da ${tipo}`).toBeDefined();
        const g = openingGeometry(project, o, f);
        expect(g.roughWidth).toBeGreaterThan(0);
        expect(g.roughHeight).toBeGreaterThan(0);
        // O vão tira volume do sólido da hospedeira.
        const vSem = ((): number => {
          let v = 0;
          for (const l of rlSem.walls[o.hostId]!.layers) {
            const b = wallLayerSolid(rlSem.walls[o.hostId]!, l, jlSem);
            const P = (k: number): number[] => [b.positions[k * 3]!, b.positions[k * 3 + 1]!, b.positions[k * 3 + 2]!];
            for (let i = 0; i < b.indices.length; i += 3) {
              const [a, c, d] = [P(b.indices[i]!), P(b.indices[i + 1]!), P(b.indices[i + 2]!)] as [number[], number[], number[]];
              v += (a[0]! * (c[1]! * d[2]! - c[2]! * d[1]!) - a[1]! * (c[0]! * d[2]! - c[2]! * d[0]!) + a[2]! * (c[0]! * d[1]! - c[1]! * d[0]!)) / 6;
            }
          }
          return v;
        })();
        expect(volume(rl, o.hostId), `volume da hospedeira da ${tipo} < sem vão`).toBeLessThan(vSem - 1e-4);
      }
      // Face superior: em parede vertical coincide com a base (1e-6 m).
      const topos = wallTopFacesCached(project, lv);
      expect(topos.length).toBe(frames.length);
      let verticais = 0;
      for (const tf of topos) {
        const f = frames.find((x) => x.wall.id === tf.wallId)!;
        expect(tf.exterior.length).toBeGreaterThanOrEqual(2);
        expect(tf.interior.length).toBeGreaterThanOrEqual(2);
        expect(tf.outline.length).toBeGreaterThanOrEqual(4);
        expect(tf.topZ).toBeGreaterThan(tf.baseZ);
        if ((f.wall.tilt ?? 0) !== 0 || f.arc) continue;
        verticais++;
        for (const [arr, s] of [[tf.exterior, f.sExt], [tf.interior, f.sInt], [tf.axis, 0]] as const)
          for (const q of arr) expect(Math.abs(toLocal(f, q).s - s), `${nome} ${tf.wallId} s`).toBeLessThan(1e-6);
        // Cantos superiores = cantos do sólido 3D (mesmo x, y) nas cotas do topo e da base.
        const rw = rl.walls[tf.wallId]!;
        const vs: number[][] = [];
        for (const l of rw.layers) { const sb = wallLayerSolid(rw, l, jl); for (let i = 0; i < sb.positions.length; i += 3) vs.push([sb.positions[i]!, sb.positions[i + 1]!, sb.positions[i + 2]!]); }
        for (const c of tf.corners) {
          const perto = (z: number): number => Math.min(...vs.filter((v) => Math.abs(v[2]! - z) < 1e-6).map((v) => Math.hypot(v[0]! - c.x, v[1]! - c.y)));
          expect(perto(c.z), `${nome} ${tf.wallId} canto no topo`).toBeLessThan(1e-6);
          expect(perto(tf.baseZ), `${nome} ${tf.wallId} canto na base`).toBeLessThan(1e-6);
        }
      }
      expect(verticais).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------- 4 · fuzz arco×arco e arco×reta (semente fixa)
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const camada: Layer = { function: 'structure', materialId: 'mat_concreto', thickness: 0.2, wraps: false };
export function parFuzz(r: () => number, k: number): { project: Project; H: number } {
  const u = (a: number, b: number): number => a + (b - a) * r();
  const J = { kind: 'miter' as const, flip: false };
  const arcoArco = k < 150;
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada] };
  const s = new ProjectStore(base);
  const H = u(2.5, 3.5);
  const ang = u(0, 2 * Math.PI), sep = u(0.4, 2 * Math.PI - 0.4);
  const walls: Array<{ id: string; a: V2; b: V2; sag: number; tilt: number }> = [ang, ang + sep].map((al, i) => {
    const L = u(2.5, 6);
    const b = { x: L * Math.cos(al), y: L * Math.sin(al) };
    const arco = i === 0 || arcoArco;
    const sag = arco ? (r() < 0.5 ? -1 : 1) * u(0.05, 0.3) * L : 0;
    const tilt = r() < 0.15 ? 0 : u(-30, 30);
    const fim = r() < 0.5;
    return { id: i === 0 ? 'A' : 'B', a: fim ? b : { x: 0, y: 0 }, b: fim ? { x: 0, y: 0 } : b, sag, tilt };
  });
  for (const w of walls) s.exec({ type: 'addWall', wall: makeWall({ id: w.id, typeId: 'wt_t', levelId: 'lv_0', height: H, a: w.a, b: w.b, ...(w.tilt ? { tilt: w.tilt } : {}), ...(w.sag ? { sag: w.sag } : {}), joinStart: J, joinEnd: J }) as Wall });
  return { project: s.project, H };
}
describe('J5 · fuzz de junções arco×arco e arco×reta (300 pares, semente 20261115)', () => {
  /**
   * Pares viáveis com defeito conhecido (J5-D3). Os pares 132 e 198 foram corrigidos (solda, diagonal da tampa e faces da vizinha);
   * restam 188 (tilts 0/0, caminho vertical) e 251: a medição de 100 mm é o canto externo do encosto 'butt' de arco em V agudo
   * (ESTADO.md, seção D3/D1).
   */
  const CONHECIDOS = new Set([188, 251]);
  let cache: { viaveis: number; inviaveis: number; arcoArcoViaveis: number; falhas: Array<{ k: number; texto: string }>; pior: number } | null = null;
  const rodar = (): NonNullable<typeof cache> => {
    if (cache) return cache;
    const r = mulberry32(20261115);
    const out = { viaveis: 0, inviaveis: 0, arcoArcoViaveis: 0, falhas: [] as Array<{ k: number; texto: string }>, pior: 0 };
    for (let k = 0; k < 300; k++) {
      const { project, H } = parFuzz(r, k);
      limparCachesDeConteudo();
      const no = medirNos(project, 'lv_0')[0];
      if (!no) { out.falhas.push({ k, texto: `par ${k}: nó não detectado` }); continue; }
      if (no.inviavel) { out.inviaveis++; if (no.avisos.length === 0) out.falhas.push({ k, texto: `par ${k}: inviável sem aviso` }); continue; }
      out.viaveis++;
      if (k < 150) out.arcoArcoViaveis++;
      for (const x of no.m) {
        out.pior = Math.max(out.pior, x.fresta, x.sobrep);
        if (x.fresta >= 1e-3 || x.sobrep >= 1e-3) out.falhas.push({ k, texto: `par ${k} (${no.tipos}, tilts ${no.tilts}, H ${H.toFixed(2)}): fresta ${mm(x.fresta)} mm, sobrep ${mm(x.sobrep)} mm` });
      }
    }
    return (cache = out);
  };
  it('300 pares (150 arco×arco, 150 arco×reta): viáveis têm fresta e sobreposição < 1 mm, exceto os defeitos conhecidos; inviáveis têm aviso', () => {
    const r = rodar();
    const unicos = [...new Set(r.falhas.map((f) => f.k))];
    console.log(`[J5] fuzz: ${r.viaveis} viáveis (${r.arcoArcoViaveis} arco×arco), ${r.inviaveis} inviáveis; pares viáveis com defeito: ${unicos.join(', ') || 'nenhum'} (pior ${mm(r.pior)} mm)\n${[...new Set(r.falhas.map((f) => f.texto))].join('\n')}`);
    expect(r.viaveis).toBeGreaterThan(100);
    expect(r.arcoArcoViaveis).toBeGreaterThan(30);
    expect(r.viaveis + r.inviaveis).toBe(300);
    expect(unicos.filter((k) => !CONHECIDOS.has(k))).toEqual([]);
  }, 300000);
  it.fails('nenhum par viável com fresta >= 1 mm (defeito J5-D3 restante: pares 188 e 251, canto externo do encosto de arco em V agudo)', () => {
    expect([...new Set(rodar().falhas.map((f) => f.k))]).toEqual([]);
  }, 300000);
});
