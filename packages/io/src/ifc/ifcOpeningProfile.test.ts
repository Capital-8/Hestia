import { describe, expect, it } from 'vitest';
import { outline, type OpeningShape } from '@hestia/model';
import { addOpeningProfile } from './ifcOpeningProfile.ts';
import { num, OMIT, StepWriter } from './ifcStep.ts';
import { axis3, localPlacement } from './ifcSolids.ts';

/** Contexto mínimo: mundo na origem, sem norte verdadeiro (o teste não depende dele). */
function novoModelo(): { w: StepWriter; ctx: number; placement: number } {
  const w = new StepWriter();
  const world = axis3(w, [0, 0, 0]);
  const ctx = w.add('IFCGEOMETRICREPRESENTATIONCONTEXT', [OMIT, "'Model'", '3', num(1e-5), `#${world}`, OMIT]);
  const placement = localPlacement(w, null, [0, 0, 0]);
  return { w, ctx, placement };
}

/** Linhas do escritor como mapa id -> { tipo, args }. */
function entidades(w: StepWriter): Map<number, { tipo: string; args: string }> {
  const out = new Map<number, { tipo: string; args: string }>();
  for (const line of w.written) {
    const m = /^#(\d+)=([A-Z0-9]+)\((.*)\);$/.exec(line);
    if (!m) throw new Error(`linha STEP mal formada: ${line}`);
    out.set(Number(m[1]), { tipo: m[2]!, args: m[3]! });
  }
  return out;
}

/** Ids referenciados (`#n`) nos argumentos de uma entidade. */
const refsOf = (args: string): number[] => [...args.matchAll(/#(\d+)/g)].map((m) => Number(m[1]));

/** Coordenadas [x, z] dos pontos referenciados pela polilinha do perfil, na ordem do anel. */
function anelDoPerfil(ents: Map<number, { tipo: string; args: string }>, profileId: number): Array<[number, number]> {
  const profile = ents.get(profileId)!;
  const curveId = refsOf(profile.args)[0]!;
  const poly = ents.get(curveId)!;
  expect(poly.tipo).toBe('IFCPOLYLINE');
  return refsOf(poly.args).map((id) => {
    const m = /^\(([-\d.]+),([-\d.]+)\)$/.exec(ents.get(id)!.args)!;
    return [Number(m[1]), Number(m[2])];
  });
}

/** Área com sinal (positiva = anti-horário) pela fórmula do cadarço, sobre o anel fechado. */
function areaComSinal(ring: Array<[number, number]>): number {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i]!;
    const [x1, y1] = ring[i + 1]!;
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}

const formas: Array<[string, OpeningShape]> = [
  ['rect', { kind: 'rect', width: 1, height: 2 }],
  ['round', { kind: 'round', width: 1, height: 0.75 }],
  ['segmental', { kind: 'segmental', width: 1.2, height: 2, rise: 0.3 }],
  ['pointed', { kind: 'pointed', width: 1, height: 1.6, rise: 0.8 }],
  ['circle', { kind: 'circle', width: 1, height: 1 }],
];

describe('addOpeningProfile', () => {
  it('rect 1 x 2 com parede de 0,2: entidades esperadas e cotas corretas', () => {
    const { w, ctx, placement } = novoModelo();
    const ids = addOpeningProfile(w, ctx, placement, 'vao:1', 'Janela 1', { kind: 'rect', width: 1, height: 2 }, { thickness: 0.2 });
    const ents = entidades(w);

    expect(ents.get(ids.profile)?.tipo).toBe('IFCARBITRARYCLOSEDPROFILEDEF');
    expect(ents.get(ids.profile)?.args.startsWith(".AREA.,$,")).toBe(true);
    expect(ents.get(ids.solid)?.tipo).toBe('IFCEXTRUDEDAREASOLID');
    expect(ents.get(ids.shape)?.tipo).toBe('IFCPRODUCTDEFINITIONSHAPE');
    expect(ents.get(ids.opening)?.tipo).toBe('IFCOPENINGELEMENT');

    // Vazio com a espessura mais 1 cm por face: profundidade 0,22 m (mesma convenção de ifcExport.ts).
    const extrusao = ents.get(ids.solid)!;
    expect(extrusao.args.endsWith(',0.220000')).toBe(true);
    expect(refsOf(extrusao.args)[0]).toBe(ids.profile);

    // Retângulo: quatro cantos, o primeiro repetido no fim.
    expect(anelDoPerfil(ents, ids.profile)).toEqual([
      [0.5, 0],
      [0.5, 2],
      [-0.5, 2],
      [-0.5, 0],
      [0.5, 0],
    ]);

    // Elemento: tipo OPENING, colocação recebida e corpo com a representação criada.
    const op = ents.get(ids.opening)!;
    expect(op.args).toContain(".OPENING.");
    expect(op.args).toContain("'Janela 1'");
    expect(refsOf(op.args)).toEqual([placement, ids.shape]);
  });

  it('o IfcOpeningElement recebe GlobalId de 22 caracteres', () => {
    const { w, ctx, placement } = novoModelo();
    const ids = addOpeningProfile(w, ctx, placement, 'vao:x', 'V', { kind: 'rect', width: 1, height: 1 }, { thickness: 0.15 });
    const guid = /^'([^']*)'/.exec(entidades(w).get(ids.opening)!.args)![1]!;
    expect(guid).toHaveLength(22);
  });

  it.each(formas)('%s: anel fechado, anti-horário, com os vértices de outline()', (_nome, shape) => {
    const { w, ctx, placement } = novoModelo();
    const ids = addOpeningProfile(w, ctx, placement, `vao:${_nome}`, _nome, shape, { thickness: 0.2 });
    const ents = entidades(w);
    const ring = anelDoPerfil(ents, ids.profile);

    // Fechado: o último ponto é o primeiro, e o número de vértices distintos é o de outline().
    expect(ring[ring.length - 1]).toEqual(ring[0]);
    expect(ring.length - 1).toBe(outline(shape).length);
    // Anti-horário: área com sinal positiva.
    expect(areaComSinal(ring)).toBeGreaterThan(0);
  });

  it('círculo de diâmetro 1: área da polilinha dentro de 0,005 m² da área exata', () => {
    const { w, ctx, placement } = novoModelo();
    const ids = addOpeningProfile(w, ctx, placement, 'vao:c', 'C', { kind: 'circle', width: 1, height: 1 }, { thickness: 0.2 });
    expect(areaComSinal(anelDoPerfil(entidades(w), ids.profile))).toBeCloseTo(Math.PI * 0.25, 2);
  });

  it.each(formas)('%s: topo do contorno em z = altura, dentro da tolerância da corda', (_nome, shape) => {
    const { w, ctx, placement } = novoModelo();
    const ids = addOpeningProfile(w, ctx, placement, `vao:${_nome}`, _nome, shape, { thickness: 0.2 });
    const topo = Math.max(...anelDoPerfil(entidades(w), ids.profile).map(([, z]) => z));
    expect(Math.abs(topo - shape.height)).toBeLessThanOrEqual(0.001 + 1e-9);
  });

  it('todo id referenciado existe, sem definições repetidas', () => {
    const { w, ctx, placement } = novoModelo();
    for (const [nome, shape] of formas) addOpeningProfile(w, ctx, placement, `vao:${nome}`, nome, shape, { thickness: 0.2 });
    const linhas = w.written;
    const definidos = linhas.map((l) => Number(/^#(\d+)=/.exec(l)![1]));
    expect(new Set(definidos).size).toBe(definidos.length);
    const existentes = new Set(definidos);
    for (const l of linhas) {
      const args = l.slice(l.indexOf('(') + 1);
      for (const r of refsOf(args)) expect(existentes.has(r)).toBe(true);
    }
  });

  it('a mesma entrada gera exatamente o mesmo texto', () => {
    const gera = (): string => {
      const { w, ctx, placement } = novoModelo();
      addOpeningProfile(w, ctx, placement, 'vao:p', 'P', { kind: 'pointed', width: 1, height: 1.6, rise: 0.8 }, { thickness: 0.2 });
      return w.written.join('\n');
    };
    expect(gera()).toBe(gera());
  });

  it('margem zero: profundidade igual à espessura', () => {
    const { w, ctx, placement } = novoModelo();
    const ids = addOpeningProfile(w, ctx, placement, 'vao:m', 'M', { kind: 'rect', width: 1, height: 1 }, { thickness: 0.2, margin: 0 });
    expect(entidades(w).get(ids.solid)!.args.endsWith(',0.200000')).toBe(true);
  });

  it('forma inválida lança erro e não escreve nenhuma linha', () => {
    const { w, ctx, placement } = novoModelo();
    const antes = w.written.length;
    expect(() => addOpeningProfile(w, ctx, placement, 'vao:e', 'E', { kind: 'rect', width: 0, height: 1 }, { thickness: 0.2 })).toThrow(/width-invalid/);
    expect(w.written.length).toBe(antes);
  });

  it('espessura ou folga inválidas lançam erro antes de qualquer escrita', () => {
    const { w, ctx, placement } = novoModelo();
    const antes = w.written.length;
    const rect: OpeningShape = { kind: 'rect', width: 1, height: 1 };
    expect(() => addOpeningProfile(w, ctx, placement, 'k', 'k', rect, { thickness: 0 })).toThrow(/espessura/);
    expect(() => addOpeningProfile(w, ctx, placement, 'k', 'k', rect, { thickness: 0.2, margin: -1 })).toThrow(/folga/);
    expect(w.written.length).toBe(antes);
  });
});
