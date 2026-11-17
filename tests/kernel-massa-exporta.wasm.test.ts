/**
 * Massa conceitual na saída (ficha X1; plano de massa A.4 e A.5) sobre o Rust REAL: IFC (`IFCBUILDINGELEMENTPROXY` com a malha lod 2), DXF (camada
 * `MASSA` na planta e `CORTE_MASSA` no corte) e prancha (planta, corte, elevação e 3D vetorial, e o PDF delas). O serviço é o global do app
 * (`servicoMassa()`), ligado ao kernel por `definirGerenciadorDaMassa`; sem kernel, nada sai e nada lança. Roda só em `npm run test:wasm`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSheetDrawList } from '@hestia/render';
import { ProjectStore, createEmptyProject, emptyTitleBlock, makeLevel, type Project, type Sheet, type SheetViewport } from '@hestia/model';
import { definirGerenciadorDaMassa, servicoMassa } from '../packages/engine/src/index.ts';
import { massaM1, massaM3, massaM5Bulbo, massaM5Petala, projetoComMassas } from '../packages/engine/src/fixtureMassa.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { ifcGeometryOf, projectIfcComAvisos } from '../apps/web/src/editor/ifcExport.ts';
import { dxfGeometryOf, planDxf, sectionDxf, sectionDxfGeometryOf } from '../apps/web/src/editor/dxfExport.ts';
import { sheetsPdfOf } from '../apps/web/src/editor/sheetActions.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;

beforeAll(async () => {
  if (!bytes) return;
  try {
    ger = await GerenciadorKernelV2.dosBytes(bytes);
  } catch {
    ger = null;
  }
});

afterAll(() => {
  servicoMassa().encerrar();
  definirGerenciadorDaMassa(() => null);
});

const DATA = new Date('2026-01-01T00:00:00Z');
const count = (text: string, type: string): number => (text.match(new RegExp(`=${type}\\(`, 'g')) ?? []).length;
const ligar = (): void => definirGerenciadorDaMassa(() => ger);
const desligar = (): void => definirGerenciadorDaMassa(() => null);

/** Projeto só com as massas pedidas (11 níveis, como a fixture de referência). */
function projetoCom(...massas: Array<() => ReturnType<typeof massaM1>>): Project {
  const s = new ProjectStore(createEmptyProject());
  for (let i = 2; i <= 10; i++) s.exec({ type: 'upsertLevel', level: makeLevel({ id: `lv_${i}`, name: `Nível ${i + 1}`, elevation: i * 3 }) });
  for (const m of massas) s.exec({ type: 'addMass', mass: m() });
  return s.project;
}

/** Volume (divergência) de cada `IFCTRIANGULATEDFACESET` do texto, na ordem em que aparecem; lê as coordenadas do arquivo, não da geometria de entrada. */
function volumesDoTexto(texto: string): number[] {
  const pontos = new Map<number, number[][]>();
  for (const m of texto.matchAll(/^#(\d+)=IFCCARTESIANPOINTLIST3D\(\((.*)\)\);$/gm)) {
    pontos.set(Number(m[1]), [...m[2]!.matchAll(/\(([^()]*)\)/g)].map((q) => q[1]!.split(',').map(Number)));
  }
  const out: number[] = [];
  for (const m of texto.matchAll(/^#\d+=IFCTRIANGULATEDFACESET\(#(\d+),\$,\$,\((.*)\),\$\);$/gm)) {
    const v = pontos.get(Number(m[1]))!;
    let vol = 0;
    for (const t of m[2]!.matchAll(/\((\d+),(\d+),(\d+)\)/g)) {
      const [a, b, c] = [v[Number(t[1]) - 1]!, v[Number(t[2]) - 1]!, v[Number(t[3]) - 1]!];
      vol += (a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) - a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) + a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!)) / 6;
    }
    out.push(vol);
  }
  return out;
}

/** Área (em módulo) de um anel. */
function area(pts: ReadonlyArray<{ x: number; y: number }>): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

describe('massa X1: IFC com o kernel real', () => {
  it.skipIf(!bytes)('M1 e M5 (12 pétalas): um IFCBUILDINGELEMENTPROXY por massa, com o nome, e o volume do arquivo bate com o da massa (M1 = 540)', () => {
    ligar();
    const p = projetoCom(massaM1, massaM5Bulbo, massaM5Petala);
    const geo = ifcGeometryOf(p);
    expect(geo.masses?.map((g) => g.massaId)).toEqual(['m1', 'm5', 'm5p']);
    expect(geo.masses!.find((g) => g.massaId === 'm5p')!.copias).toBe(12);
    const { texto, avisos } = projectIfcComAvisos(p, DATA, 'pt');
    expect(avisos).toEqual([]);
    // Um proxy por massa (a flor tem duas: o bulbo do centro e a pétala em 12 cópias, cascas na mesma malha).
    expect(count(texto, 'IFCBUILDINGELEMENTPROXY')).toBe(3);
    expect(texto).toContain("'M1 caixa'");
    expect(texto).toContain("'M5 flor (centro)'");
    const volumes = volumesDoTexto(texto);
    expect(volumes).toHaveLength(3);
    expect(Math.abs(volumes[0]! / 540 - 1)).toBeLessThan(1e-6);
    // As quantidades vêm do motor e o arquivo as grava: Volume do pset = volume da malha exportada.
    const quant = servicoMassa().quantidades(p, null)!;
    for (const [i, id] of ['m1', 'm5', 'm5p'].entries()) {
      const q = quant.find((x) => x.massaId === id)!;
      expect(Math.abs(volumes[i]! / q.volume - 1), id).toBeLessThan(1e-6);
    }
    expect(texto).toContain('Pset_Hestia_Massa');
  });

  it.skipIf(!bytes)('o IFC da massa é determinístico e não deixa referência solta', () => {
    ligar();
    const p = projetoComMassas();
    const a = projectIfcComAvisos(p, DATA, 'pt').texto;
    expect(projectIfcComAvisos(p, DATA, 'pt').texto).toBe(a);
    const definidos = new Set([...a.matchAll(/^#(\d+)=/gm)].map((m) => Number(m[1])));
    expect([...a.matchAll(/#(\d+)/g)].map((m) => Number(m[1])).filter((id) => !definidos.has(id))).toEqual([]);
    expect(count(a, 'IFCBUILDINGELEMENTPROXY')).toBe(6);
  });

  it.skipIf(!bytes)('sem kernel a massa não é exportada, não lança e o aviso aparece por massa', () => {
    desligar();
    const p = projetoCom(massaM1, massaM3);
    expect(ifcGeometryOf(p).masses).toBeUndefined();
    const { texto, avisos } = projectIfcComAvisos(p, DATA, 'pt');
    expect(count(texto, 'IFCBUILDINGELEMENTPROXY')).toBe(0);
    expect(avisos).toHaveLength(2);
    expect(avisos[0]).toContain('M1 caixa');
  });
});

describe('massa X1: DXF com o kernel real', () => {
  it.skipIf(!bytes)('planta de M3 com corte a 1,2 m: camada MASSA com o anel cortado (área 64), a seção do topo tracejada e o arquivo com a camada', () => {
    ligar();
    const p = projetoCom(massaM3);
    const geo = dxfGeometryOf(p, 'lv_0');
    expect(geo.masses).toBeDefined();
    const linhas = geo.masses!;
    const tracejadas = linhas.filter((l) => l.dashed === true);
    const continuas = linhas.filter((l) => l.dashed !== true);
    // Seção do topo (z = 30) acima do corte: tracejada, área 64. O anel cortado (e o da base, se a faixa o pega) saem contínuos.
    expect(tracejadas).toHaveLength(1);
    expect(Math.abs(area(tracejadas[0]!.pts) - 64)).toBeLessThan(1e-6);
    // Cortado (z = 1,2) e a seção da base (z = 0, abaixo do corte e dentro da faixa de vista): dois anéis contínuos.
    expect(continuas).toHaveLength(2);
    expect(linhas).toHaveLength(3);
    expect(continuas.every((l) => l.closed && Math.abs(area(l.pts) - 64) < 1e-6)).toBe(true);
    const texto = planDxf(p, 'lv_0');
    expect(texto).toContain('MASSA');
    expect(texto).toContain('AC1015');
  });

  it.skipIf(!bytes)('corte de M1: a camada CORTE_MASSA tem o polígono cortado, retângulo 10 × 9 (área 90)', () => {
    ligar();
    const p0 = projetoCom(massaM1);
    const p: Project = { ...p0, views: [{ id: 'sv1', name: 'Corte AA', kind: 'section', a: { x: -10, y: 0 }, b: { x: 10, y: 0 }, depth: 10 }] };
    const geo = sectionDxfGeometryOf(p, 'sv1');
    const cortes = geo.cut.filter((i) => i.category === 'mass');
    expect(cortes).toHaveLength(1);
    expect(Math.abs(area(cortes[0]!.polygons[0]![0]!) - 90)).toBeLessThan(1e-6);
    expect(sectionDxf(p, 'sv1')).toContain('CORTE_MASSA');
  });

  it.skipIf(!bytes)('sem kernel o DXF da planta e o do corte saem sem a massa e sem lançar', () => {
    desligar();
    const p0 = projetoCom(massaM1);
    const p: Project = { ...p0, views: [{ id: 'sv1', name: 'Corte AA', kind: 'section', a: { x: -10, y: 0 }, b: { x: 10, y: 0 }, depth: 10 }] };
    expect(dxfGeometryOf(p, 'lv_0').masses).toBeUndefined();
    expect(planDxf(p, 'lv_0')).not.toContain('MASSA');
    expect(sectionDxfGeometryOf(p, 'sv1').cut.some((i) => i.category === 'mass')).toBe(false);
    expect(sectionDxf(p, 'sv1')).not.toContain('CORTE_MASSA');
  });
});

const prancha = (viewports: SheetViewport[]): Sheet => ({
  id: 'sh1',
  number: 'A-101',
  name: 'Massa',
  size: 'A3',
  orientation: 'landscape',
  margin: 10,
  titleBlock: emptyTitleBlock(),
  viewports,
});

const vp = (id: string, view: SheetViewport['view'], at: { x: number; y: number }): SheetViewport => ({ id, view, at, size: { w: 190, h: 120 }, scale: 200 });

/** Projeto da flor (M5) com as quatro vistas numa prancha: planta, corte, elevação e 3D. */
function projetoDaPrancha(comMassa: boolean): Project {
  const base = comMassa ? projetoCom(massaM5Bulbo, massaM5Petala) : projetoCom();
  const views: Project['views'] = [
    { id: 'sv1', name: 'Corte AA', kind: 'section', a: { x: -16, y: 0 }, b: { x: 16, y: 0 }, depth: 20 },
    { id: 'ev1', name: 'Elevação Sul', kind: 'elevation', a: { x: -16, y: -14 }, b: { x: 16, y: -14 }, depth: 30 },
  ];
  const s = prancha([
    vp('v1', { kind: 'plan', levelId: 'lv_0' }, { x: 5, y: 5 }),
    vp('v2', { kind: 'section', sectionId: 'sv1' }, { x: 205, y: 5 }),
    vp('v3', { kind: 'section', sectionId: 'ev1' }, { x: 5, y: 130 }),
    vp('v4', { kind: '3d' }, { x: 205, y: 130 }),
  ]);
  return { ...base, views: [...base.views, ...views], sheets: [s] };
}

describe('massa X1: prancha com o kernel real', () => {
  it.skipIf(!bytes)('a prancha inclui a massa na planta, no corte, na elevação e no 3D vetorial (mais traços do que sem a massa)', () => {
    ligar();
    const com = buildSheetDrawList(projetoDaPrancha(true), 'sh1')!;
    const sem = buildSheetDrawList(projetoDaPrancha(false), 'sh1')!;
    const nomes = ['planta', 'corte', 'elevação', '3D'];
    for (const [i, nome] of nomes.entries()) {
      const a = com.groups[i]!;
      const b = sem.groups[i]!;
      expect(a.paths.length + a.fills.length, nome).toBeGreaterThan(b.paths.length + b.fills.length);
    }
    // O 3D vetorial lê a cena da aba 3D: sem a massa o quadro fica vazio (sem triângulos nem arestas), com ela há traços dentro do quadro.
    expect(sem.groups[3]!.paths).toHaveLength(0);
    expect(com.groups[3]!.paths.length).toBeGreaterThan(0);
  });

  it.skipIf(!bytes)('o PDF vetorial da prancha com as quatro vistas de M5 gera sem erro, com cabeçalho e páginas não vazias', () => {
    ligar();
    const pdf = sheetsPdfOf(projetoDaPrancha(true), 'pt');
    expect(pdf).not.toBeNull();
    expect(new TextDecoder().decode(pdf!.slice(0, 5))).toBe('%PDF-');
    const sem = sheetsPdfOf(projetoDaPrancha(false), 'pt')!;
    // Com a massa há mais desenho: o arquivo é maior que o da mesma prancha sem ela.
    expect(pdf!.length).toBeGreaterThan(sem.length);
    const texto = new TextDecoder('latin1').decode(pdf!);
    expect(texto.match(/\/Type \/Page\b/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  it.skipIf(!bytes)('sem kernel a prancha com a massa também gera o PDF (a massa só fica de fora, sem lançar)', () => {
    desligar();
    const pdf = sheetsPdfOf(projetoDaPrancha(true), 'pt');
    expect(pdf).not.toBeNull();
    expect(pdf!.length).toBeGreaterThan(100);
  });
});
