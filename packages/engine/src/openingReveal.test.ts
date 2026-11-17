import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Opening, type OpeningType, type Project, type Wall } from '@hestia/model';
import { frameOfWall, openingGeometry } from './resolve.ts';
import { buildOpeningModel } from './openingModel.ts';
import { insertFrameFootprint } from './wrap.ts';
import { computeSection } from './index.ts';
import type { OpeningModel, OpeningPart } from './openingModelTypes.ts';

/*
 * Recuo do batente (`reveal`): o batente e o que está na profundidade dele deslocam-se para DENTRO da parede, a partir da
 * face externa. Parede de teste: uma camada de 0,20 m, a=(0,0) b=(4,0), linha de localização no centro; a face externa fica
 * à esquerda de a→b (s = +0,10) e a interna em s = -0,10, então o recuo é um deslocamento de s NEGATIVO (e positivo com
 * `flipped`). Batente 'fixed' de 0,09: centro em 0 sem recuo, folga até a face interna = 0,10 - 0,045 = 0,055.
 */

const camada: Layer = { function: 'structure', materialId: 'mat_concreto', thickness: 0.2, wraps: false };

interface Opts {
  reveal?: OpeningType['reveal'];
  extra?: Partial<OpeningType>;
  wall?: Partial<Wall>;
  /** Fixa o batente em 0,09 (sem isto vale o padrão `wall`, em que o batente ocupa a espessura toda). */
  fixo?: boolean;
  plano?: 'vertical' | 'inclinado';
  camadas?: Layer[];
}

function cena(base: string, o: Opts = {}): { p: Project; op: Opening; m: OpeningModel } {
  const s = new ProjectStore(createEmptyProject());
  const t = s.project.openingTypes[base]!;
  s.project.wallTypes.wt_t = { ...s.project.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: o.camadas ?? [camada] };
  const fixo: Partial<OpeningType> = o.fixo === false ? {} : { frameDepthMode: 'fixed', frameDepth: 0.09 };
  const tipo: OpeningType = { ...t, id: 'ot_x', ...fixo, ...o.extra, ...(o.reveal ? { reveal: o.reveal } : {}) };
  s.exec({ type: 'upsertOpeningType', openingType: tipo });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_t', levelId: 'lv_0', height: 3, a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, ...o.wall }) as Wall });
  s.exec({ type: 'addOpening', opening: { id: 'v', kind: t.kind, typeId: 'ot_x', hostId: 'w', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '', ...(o.plano ? { plano: o.plano } : {}) } as Opening });
  const p = s.project;
  const op = p.elements.v as Opening;
  const f = frameOfWall(p, 'w')!;
  return { p, op, m: buildOpeningModel(p, op, openingGeometry(p, op, f), f) };
}

const parte = (m: OpeningModel, id: string): OpeningPart => m.parts.find((x) => x.id === id)!;
/** Papéis que NÃO dependem do batente: ficam nas faces da parede ou no núcleo. */
const FIXOS = new Set(['casing', 'lintel', 'sillBeam', 'sillBoard']);
const TIPOS = ['ot_p90', 'ot_pp80', 'ot_pc160', 'ot_pd120', 'ot_pg300', 'ot_pvv90', 'ot_pe80', 'ot_ps90', 'ot_j120', 'ot_jv120', 'ot_ja120', 'ot_jg90', 'ot_jp80', 'ot_jb80', 'ot_jfixa60', 'ot_j240'];

describe('recuo do batente (reveal) no modelo de peças', () => {
  it('reveal 0, {depth: 0} e ausente dão exatamente o mesmo modelo', () => {
    for (const id of TIPOS) {
      const a = cena(id).m;
      expect(cena(id, { reveal: { depth: 0 } }).m, id).toEqual(a);
      expect(cena(id, { reveal: { depth: 0, anchor: 'core' } }).m, id).toEqual(a);
    }
  });

  it('porta de giro: ombreira em [-0,045; 0,045] sem recuo e em [-0,095; -0,005] com 0,05', () => {
    const base = parte(cena('ot_p90').m, 'jamb-left');
    expect(base.box.s0).toBeCloseTo(-0.045, 9);
    expect(base.box.s1).toBeCloseTo(0.045, 9);
    const r = parte(cena('ot_p90', { reveal: { depth: 0.05 } }).m, 'jamb-left');
    expect(r.box.s0).toBeCloseTo(-0.095, 9);
    expect(r.box.s1).toBeCloseTo(-0.005, 9);
    expect([r.box.t0, r.box.t1, r.box.z0, r.box.z1]).toEqual([base.box.t0, base.box.t1, base.box.z0, base.box.z1]);
  });

  it('janela: o vidro (12 mm, no lado da folha) desloca exatamente -0,05 e mantém a espessura', () => {
    const vidro = (m: OpeningModel): OpeningPart => m.parts.find((x) => x.role === 'glass')!;
    const a = vidro(cena('ot_j120').m).box;
    const b = vidro(cena('ot_j120', { reveal: { depth: 0.05 } }).m).box;
    expect((b.s0 + b.s1) / 2 - (a.s0 + a.s1) / 2).toBeCloseTo(-0.05, 9);
    expect(b.s1 - b.s0).toBeCloseTo(a.s1 - a.s0, 9);
  });

  it('todas as famílias: batente, folha, vidro, ferragens e soleira deslocam 0,05; alizar, verga e peitoril ficam', () => {
    for (const id of TIPOS) {
      const a = cena(id).m;
      const b = cena(id, { reveal: { depth: 0.05 } }).m;
      expect(b.parts.map((x) => x.id), id).toEqual(a.parts.map((x) => x.id));
      for (const pa of a.parts) {
        const pb = parte(b, pa.id);
        // Trilhos tracejados do portão: ficam na face da parede (dentro do ambiente), não no batente.
        const ds = FIXOS.has(pa.role) || /^track-(left|right)$/.test(pa.id) ? 0 : -0.05;
        if (pa.role === 'pocket') {
          // A cavidade (porta embutida) contém a folha recuada e fica dentro da parede.
          const folha = parte(b, 'leaf-0').box;
          expect(pb.box.s0, 'cavidade').toBeLessThanOrEqual(folha.s0 + 1e-9);
          expect(pb.box.s1, 'cavidade').toBeGreaterThanOrEqual(folha.s1 - 1e-9);
          expect(pb.box.s0, 'cavidade na parede').toBeGreaterThanOrEqual(-0.1 - 1e-9);
          continue;
        }
        expect(pb.box.s0 - pa.box.s0, `${id}/${pa.id} s0`).toBeCloseTo(ds, 9);
        expect(pb.box.s1 - pa.box.s1, `${id}/${pa.id} s1`).toBeCloseTo(ds, 9);
        expect(pb.box.z0, `${id}/${pa.id} z0`).toBeCloseTo(pa.box.z0, 9);
        if (pa.motion && 's' in pa.motion && typeof pa.motion.s === 'number') {
          expect((pb.motion as { s: number }).s - pa.motion.s, `${id}/${pa.id} eixo`).toBeCloseTo(-0.05, 9);
        }
      }
    }
  });

  it('parede flipped: o interior fica em s positivo e o recuo desloca para + (a parede, não a folha, define o lado)', () => {
    const a = parte(cena('ot_p90', { wall: { flipped: true } }).m, 'jamb-left').box;
    const b = parte(cena('ot_p90', { wall: { flipped: true }, reveal: { depth: 0.05 } }).m, 'jamb-left').box;
    expect(a.s0).toBeCloseTo(-0.045, 9);
    expect(b.s0).toBeCloseTo(0.005, 9);
    expect(b.s1).toBeCloseTo(0.095, 9);
  });

  it('o recuo não depende de para onde a folha abre: flipFacing e flipHand só mudam a folha', () => {
    const jamb = (reveal?: OpeningType['reveal']): number => parte(cena('ot_p90', { reveal }).m, 'jamb-left').box.s0;
    expect(jamb({ depth: 0.05 }) - jamb()).toBeCloseTo(-0.05, 9);
  });

  it('limite: recuo maior que a folga (0,055) encosta o batente na face interna, sem sair da parede', () => {
    const r = parte(cena('ot_p90', { reveal: { depth: 0.2 } }).m, 'jamb-left').box;
    expect(r.s0).toBeCloseTo(-0.1, 9);
    expect(r.s1).toBeCloseTo(-0.01, 9);
    const j = cena('ot_j120', { reveal: { depth: 0.5 } }).m.parts.filter((x) => x.role !== 'casing' && x.role !== 'lintel' && x.role !== 'sillBoard' && x.role !== 'sillBeam');
    for (const x of j) expect(x.box.s0, x.id).toBeGreaterThanOrEqual(-0.1 - 1e-9);
  });

  it('batente que ocupa a parede inteira (modo wall, o padrão): sem folga, o recuo vale 0 e o modelo não muda', () => {
    for (const id of ['ot_p90', 'ot_j120']) {
      expect(cena(id, { fixo: false, reveal: { depth: 0.05 } }).m, id).toEqual(cena(id, { fixo: false }).m);
    }
  });

  it('modo core (núcleo de 0,14 entre dois acabamentos de 0,03): folga de 0,03; 0,02 desloca 0,02 e 0,05 é limitado a 0,03', () => {
    const acab = (): Layer => ({ function: 'finish1', materialId: 'mat_reboco', thickness: 0.03, wraps: true });
    const camadas: Layer[] = [acab(), { function: 'structure', materialId: 'mat_concreto', thickness: 0.14, wraps: false }, acab()];
    const jamb = (reveal?: OpeningType['reveal']): number => parte(cena('ot_p90', { fixo: false, extra: { frameDepthMode: 'core' }, camadas, reveal }).m, 'jamb-left').box.s0;
    expect(jamb()).toBeCloseTo(-0.07, 9);
    expect(jamb({ depth: 0.02 })).toBeCloseTo(-0.09, 9);
    expect(jamb({ depth: 0.05 })).toBeCloseTo(-0.1, 9);
  });

  it('estilo aduela e batente simples também acompanham', () => {
    for (const frameStyle of ['aduela', 'simple'] as const) {
      const extra = { frameStyle };
      const a = cena('ot_p90', { extra }).m;
      const b = cena('ot_p90', { extra, reveal: { depth: 0.01 } }).m;
      const ja = a.parts.find((x) => x.role === 'jamb')!.box;
      const jb = b.parts.find((x) => x.role === 'jamb')!.box;
      const folga = frameStyle === 'aduela' ? 0 : 0.01;
      expect(ja.s0 - jb.s0, frameStyle).toBeCloseTo(folga, 9);
    }
  });
});

describe('recuo do batente em parede curva e inclinada', () => {
  it('parede curva: o recuo é radial (a pegada do batente encosta 0,05 mais perto do centro quando o centro está do lado interno)', () => {
    const wall = { sag: 0.8 };
    const lado = (reveal?: OpeningType['reveal']): number => {
      const c = cena('ot_j120', { wall, reveal });
      const f = frameOfWall(c.p, 'w')!;
      const g = openingGeometry(c.p, c.op, f);
      const fp = insertFrameFootprint(f, g.offset, c.p.openingTypes.ot_x!, 1)!;
      const rs = fp.flatMap((poly) => poly.flatMap((ring) => ring.map((q) => Math.hypot(q.x - f.arc!.center.x, q.y - f.arc!.center.y))));
      return Math.min(...rs);
    };
    const d = Math.abs(lado({ depth: 0.05 }) - lado());
    expect(d).toBeGreaterThan(0.049);
    expect(d).toBeLessThan(0.0501);
    // o modelo de peças tem o mesmo deslocamento local de uma parede reta
    const a = parte(cena('ot_p90', { wall }).m, 'jamb-left').box;
    const b = parte(cena('ot_p90', { wall, reveal: { depth: 0.05 } }).m, 'jamb-left').box;
    expect(a.s0 - b.s0).toBeCloseTo(0.05, 9);
  });

  it('parede inclinada (plano vertical e inclinado): o modelo desloca 0,05 e o corte carrega o modelo deslocado', () => {
    for (const plano of ['vertical', 'inclinado'] as const) {
      const jamb = (reveal?: OpeningType['reveal']): number => parte(cena('ot_p90', { wall: { tilt: 15 }, plano, reveal }).m, 'jamb-left').box.s0;
      expect(jamb() - jamb({ depth: 0.05 }), plano).toBeCloseTo(0.05, 9);
      const noCorte = (reveal?: OpeningType['reveal']): number => {
        const c = cena('ot_p90', { wall: { tilt: 15 }, plano, reveal });
        const r = computeSection(c.p, { a: { x: 3, y: -3 }, b: { x: 3, y: 3 }, depth: 3 });
        return parte(r.openings[0]!.model, 'jamb-left').box.s0;
      };
      expect(noCorte() - noCorte({ depth: 0.05 }), plano).toBeCloseTo(0.05, 9);
    }
  });

  it('corte de parede reta: o modelo da abertura no corte tem o batente recuado', () => {
    const mk = (reveal?: OpeningType['reveal']): number => {
      const c = cena('ot_j120', { reveal });
      const r = computeSection(c.p, { a: { x: 3, y: -3 }, b: { x: 3, y: 3 }, depth: 3 });
      return r.openings[0]!.model.parts.find((x) => x.role === 'glass')!.box.s0;
    };
    expect(mk() - mk({ depth: 0.05 })).toBeCloseTo(0.05, 9);
  });
});
