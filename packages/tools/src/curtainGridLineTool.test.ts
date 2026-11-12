import { describe, expect, it } from 'vitest';
import { ProjectStore, type Id, type SubelementoCortina } from '@hestia/model';
import { montarParedeSubelementos, type GradeCortina, type ParedeSubelementos } from '@hestia/engine';
import { projetoComCortina } from '../../engine/src/fixtureCortina.ts';
import { t as tr } from './i18n.ts';
import { createTool, type PointerInfo, type Tool, type ToolEnv, type ToolOptions } from './index.ts';
import { encaixeNaAltura, encaixeNaGradeDaParede, posicaoDaLinha } from './curtainGridLineTool.ts';

/**
 * Grade de mentira (sem o kernel) da cortina `ct1` (6 m x 3 m) com 4 colunas e 2 fileiras, como o modelo faz com
 * `fixedNumber`: linhas internas em U a 1,5 / 3,0 / 4,5 m e em V a 1,5 m. A ferramenta lê a grade pelo `subelementos`.
 */
function gradeDe(nu: number, nv: number, L = 6, H = 3): GradeCortina {
  const linhas: GradeCortina['linhas'] = [];
  for (let k = 1; k < nu; k++) linhas.push({ cortina: 1, eixo: 'u', indice: k, origem: 0, flags: 0, pos: (L / nu) * k });
  for (let k = 1; k < nv; k++) linhas.push({ cortina: 1, eixo: 'v', indice: k, origem: 0, flags: 0, pos: (H / nv) * k });
  return { linhas, celulas: [], segmentos: [] };
}

function paredeDe(nu: number, nv: number): ParedeSubelementos {
  return montarParedeSubelementos(gradeDe(nu, nv), { wallId: 'ct1', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, L: 6, H: 3, zBase: 0, profundidade: 0.1, extras: [] });
}

interface Opcoes {
  /** Substitui o passo da grade do projeto (padrão 0,1 m). */
  passo?: number;
  /** Quando `true`, o `exec` falha com esta mensagem (para testar a barra de status). */
  erro?: string;
}

function ambiente(o: Opcoes = {}) {
  const store = new ProjectStore(projetoComCortina());
  const options: ToolOptions = {} as ToolOptions;
  let sub: SubelementoCortina | null = null;
  const sala = { say: [] as string[], done: 0 };
  const parede = paredeDe(4, 2);
  const env: ToolEnv = {
    project: () => store.project,
    levelId: () => 'lv_0',
    selection: () => [],
    setSelection: () => {},
    exec: (c) => {
      if (o.erro) throw new Error(o.erro);
      store.exec(c);
    },
    transaction: (l, fn) => store.transaction(l, fn),
    metersPerPixel: () => 0.01,
    gridStep: () => o.passo ?? 0.1,
    say: (m) => sala.say.push(m),
    done: () => {
      sala.done += 1;
    },
    options: () => options,
    subelementos: (wallId: Id) => (wallId === 'ct1' ? parede : null),
    subelemento: () => sub,
    setSubelemento: (s) => {
      sub = s;
    },
  };
  return { env, store, sala, sub: () => sub };
}

const ferramenta = (env: ToolEnv): Tool => {
  const t = createTool('curtainGridLine', env);
  t.start();
  return t;
};
const P = (x: number, y: number, extra: Partial<PointerInfo> = {}): PointerInfo => ({ raw: { x, y }, shift: false, ctrl: false, alt: false, ...extra });
/** Ponteiro sobre a superfície 3D da cortina `ct1` na altura `z` (m). */
const P3 = (x: number, z: number): PointerInfo => P(x, 0, { hit3d: 'ct1', hitZ: z });

/** Linhas extras gravadas na cortina `ct1` (eixo e posição). */
const extrasDe = (store: ProjectStore) => ((store.project.elements.ct1 as { curtain?: { addedLines?: Array<{ id: string; axis: string; pos: number }> } }).curtain?.addedLines ?? []);

describe('ferramenta Linha de grade na cortina: identidade', () => {
  it('tem id, rótulo e dica próprios e atende a planta e a 3D', () => {
    const { env } = ambiente();
    const t = createTool('curtainGridLine', env);
    expect(t.id).toBe('curtainGridLine');
    expect(t.label).toBe('Linha de grade na cortina');
    expect(t.hint).toContain('Linha de grade na cortina');
    expect(t.pick3d).toBe(true);
    expect(t.hover3d).toBe(true);
  });
});

describe('funções de encaixe e de casamento', () => {
  it('encaixe na grade do projeto no eixo dominante da parede (parede ao longo de X)', () => {
    expect(encaixeNaGradeDaParede(2.04, { x: 0, y: 0 }, { x: 1, y: 0 }, 0.1)).toBeCloseTo(2.0, 9);
    expect(encaixeNaGradeDaParede(2.06, { x: 0, y: 0 }, { x: 1, y: 0 }, 0.1)).toBeCloseTo(2.1, 9);
    expect(encaixeNaGradeDaParede(2.04, { x: 0, y: 0 }, { x: 1, y: 0 }, 0)).toBe(2.04);
  });

  it('altura encaixa na grade absoluta (base mais altura)', () => {
    expect(encaixeNaAltura(1.04, 0.5, 0.1)).toBeCloseTo(1.0, 9);
    expect(encaixeNaAltura(1.04, 0.5, 0)).toBe(1.04);
  });

  it('casa com a linha existente dentro da tolerância; sem casamento, usa a grade', () => {
    const grade = (v: number) => Math.round(v * 10) / 10;
    expect(posicaoDaLinha(1.47, [0, 1.5, 3], 0.08, grade)).toBe(1.5);
    expect(posicaoDaLinha(2.04, [0, 1.5, 3], 0.08, grade)).toBeCloseTo(2.0, 9);
  });
});

describe('prévia e snap', () => {
  it('vertical (U) na planta: a prévia é uma linha perpendicular à parede na posição do cursor', () => {
    const c = ambiente();
    const t = ferramenta(c.env);
    t.move(P(1.0, 0.02));
    const [pv] = t.preview() as Array<{ kind: string; a: { x: number; y: number }; b: { x: number; y: number } }>;
    expect(pv?.kind).toBe('line');
    expect(pv!.a.x).toBeCloseTo(1.0, 6);
    expect(pv!.b.x).toBeCloseTo(1.0, 6);
    expect(pv!.a.y).not.toBeCloseTo(pv!.b.y, 3);
  });

  it('encaixa na grade do projeto quando não há linha perto', () => {
    const c = ambiente();
    const t = ferramenta(c.env);
    t.move(P(2.04, 0.02));
    expect(c.sala.say.at(-1)).toContain('2,000');
  });

  it('encaixa na linha existente quando o cursor está perto dela (1,5 m)', () => {
    const c = ambiente();
    const t = ferramenta(c.env);
    t.move(P(1.47, 0.02));
    expect(c.sala.say.at(-1)).toBe(tr('pt', 'tl_msg_curtain_gridline_dup'));
  });
});

describe('criação, duplicata e seleção', () => {
  it('um clique cria a linha extra com addGridLine e a deixa selecionada como subelemento', () => {
    const c = ambiente();
    const t = ferramenta(c.env);
    t.click(P(1.0, 0.02));
    const extras = extrasDe(c.store);
    expect(extras).toHaveLength(1);
    expect(extras[0]!.axis).toBe('u');
    expect(extras[0]!.pos).toBeCloseTo(1.0, 6);
    const sub = c.sub();
    expect(sub).toEqual({ wallId: 'ct1', kind: 'line', line: { added: extras[0]!.id } });
  });

  it('clicar numa posição que já tem linha não duplica e avisa', () => {
    const c = ambiente();
    const t = ferramenta(c.env);
    t.click(P(1.47, 0.02));
    expect(extrasDe(c.store)).toHaveLength(0);
    expect(c.sub()).toBeNull();
    expect(c.sala.say.at(-1)).toBe(tr('pt', 'tl_msg_curtain_gridline_dup'));
  });

  it('fora do vão não cria e avisa', () => {
    const c = ambiente();
    const t = ferramenta(c.env);
    t.click(P(6.08, 0.02));
    expect(extrasDe(c.store)).toHaveLength(0);
    expect(c.sala.say.at(-1)).toBe(tr('pt', 'tl_msg_curtain_gridline_span'));
  });

  it('erro do modelo sai na barra de status e não cria', () => {
    const c = ambiente({ erro: 'linha recusada' });
    const t = ferramenta(c.env);
    t.click(P(1.0, 0.02));
    expect(c.sala.say.at(-1)).toBe('linha recusada');
    expect(c.sub()).toBeNull();
  });
});

describe('alternar eixo, 3D e Esc', () => {
  it('Tab alterna vertical (U) e horizontal (V): a horizontal mostra o ponto e a mensagem com o eixo', () => {
    const c = ambiente();
    const t = ferramenta(c.env);
    t.move(P(1.0, 0.02));
    expect(c.sala.say.at(-1)).toContain(tr('pt', 'tl_curtain_gridline_axis_u'));
    t.tab();
    expect(c.sala.say.at(-1)).toContain(tr('pt', 'tl_curtain_gridline_axis_v'));
    expect(t.preview()[0]?.kind).toBe('point');
    t.tab();
    expect(t.preview()[0]?.kind).toBe('line');
  });

  it('na 3D, a horizontal (V) usa a altura da superfície e cria a linha nessa altura', () => {
    const c = ambiente();
    const t = ferramenta(c.env);
    t.tab();
    t.click(P3(1.0, 2.5));
    const extras = extrasDe(c.store);
    expect(extras).toHaveLength(1);
    expect(extras[0]!.axis).toBe('v');
    expect(extras[0]!.pos).toBeCloseTo(2.5, 6);
  });

  it('Esc sai: tira o destaque e volta à seleção', () => {
    const c = ambiente();
    const t = ferramenta(c.env);
    t.click(P(1.0, 0.02));
    expect(c.sub()).not.toBeNull();
    t.cancel();
    expect(c.sub()).toBeNull();
    expect(c.sala.done).toBe(1);
  });

  it('fora de qualquer parede cortina, a ferramenta só diz a dica e não tem prévia', () => {
    const c = ambiente();
    const t = ferramenta(c.env);
    t.move(P(20, 20));
    expect(t.preview()).toHaveLength(0);
    expect(c.sala.say.at(-1)).toBe(t.hint);
  });
});
