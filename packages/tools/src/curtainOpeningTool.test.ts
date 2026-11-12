import { describe, expect, it } from 'vitest';
import { ErroEsquadriaCelula, ProjectStore, createEmptyProject, tDoModelo, type Id, type Project, type SubelementoCortina } from '@hestia/model';
import { montarParedeSubelementos, type GradeCortina, type ParedeSubelementos } from '@hestia/engine';
import { especCortinaTeste, projetoComCortina } from '../../engine/src/fixtureCortina.ts';
import { createTool, type PointerInfo, type Tool, type ToolEnv, type ToolOptions } from './index.ts';

/**
 * Grade de mentira (sem o kernel) da cortina `ct1` (6 m x 3 m): `nu` colunas e `nv` fileiras iguais, como o modelo faz com
 * `fixedNumber`. A ferramenta lê a grade do kernel pelo `subelementos`; o modelo decide o resto pela sua própria grade.
 */
function gradeDe(nu: number, nv: number, L = 6, H = 3): GradeCortina {
  const linhas: GradeCortina['linhas'] = [];
  for (let k = 1; k < nu; k++) linhas.push({ cortina: 1, eixo: 'u', indice: k, origem: 0, flags: 0, pos: (L / nu) * k });
  for (let k = 1; k < nv; k++) linhas.push({ cortina: 1, eixo: 'v', indice: k, origem: 0, flags: 0, pos: (H / nv) * k });
  const celulas: GradeCortina['celulas'] = [];
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++)
      celulas.push({ cortina: 1, i, j, regiao: i * nv + j, painel: 1, flags: 0, s0: (L / nu) * i, s1: (L / nu) * (i + 1), z0: (H / nv) * j, z1: (H / nv) * (j + 1) });
  return { linhas, celulas, segmentos: [] };
}

function paredeDe(nu: number, nv: number, zBase = 0): ParedeSubelementos {
  return montarParedeSubelementos(gradeDe(nu, nv), { wallId: 'ct1', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, L: 6, H: 3, zBase, profundidade: 0.1, extras: [] });
}

interface Opcoes {
  nu?: number;
  nv?: number;
  /** Sem kernel: a grade não existe (`subelementos` devolve null). */
  semKernel?: boolean;
  /** Confirmação do app: resposta fixa; `undefined` = a ferramenta não tem confirmação. */
  confirma?: boolean;
  /** Troca o `exec` por um que falha com este erro (para testar as mensagens do modelo). */
  erro?: ErroEsquadriaCelula;
  /** Substitui o projeto (padrão: a cortina de teste `ct1` com grade 4 x 2). */
  projeto?: Project;
  opcoes?: Partial<ToolOptions>;
}

function ambiente(o: Opcoes = {}) {
  const store = new ProjectStore(o.projeto ?? projetoComCortina());
  // Porta pequena que cabe na célula (0,60 x 1,20) e porta padrão que não cabe (0,80 x 2,10).
  store.exec({ type: 'upsertOpeningType', openingType: { ...createEmptyProject().openingTypes.ot_p80!, id: 'ot_pq', name: 'Porta pequena', code: 'PQ', width: 0.6, height: 1.2, sill: 0 } });
  let options = { doorTypeId: 'ot_pq', windowTypeId: 'ot_j120', ...o.opcoes } as ToolOptions;
  let sub: SubelementoCortina | null = null;
  const sala = { say: [] as string[], done: 0 };
  const parede = paredeDe(o.nu ?? 4, o.nv ?? 2);
  const env: ToolEnv = {
    project: () => store.project,
    levelId: () => 'lv_0',
    selection: () => [],
    setSelection: () => {},
    exec: (c) => {
      if (o.erro) throw o.erro;
      store.exec(c);
    },
    transaction: (l, fn) => store.transaction(l, fn),
    metersPerPixel: () => 0.01,
    gridStep: () => 0.1,
    say: (m) => sala.say.push(m),
    done: () => {
      sala.done += 1;
    },
    options: () => options,
    setOptions: (patch) => {
      options = { ...options, ...patch };
    },
    subelementos: (wallId: Id) => (o.semKernel ? null : wallId === 'ct1' ? parede : null),
    subelemento: () => sub,
    setSubelemento: (s) => {
      sub = s;
    },
    ...(o.confirma === undefined
      ? {}
      : {
          confirm: (msg: string) => {
            confirmacoes.push(msg);
            return o.confirma!;
          },
        }),
  };
  const confirmacoes: string[] = [];
  return { env, store, sala, sub: () => sub, confirmacoes };
}

const ferramenta = (env: ToolEnv, id: 'curtainDoor' | 'curtainWindow' = 'curtainDoor'): Tool => {
  const t = createTool(id, env);
  t.start();
  return t;
};
const P = (x: number, y: number, extra: Partial<PointerInfo> = {}): PointerInfo => ({ raw: { x, y }, shift: false, ctrl: false, alt: false, ...extra });
/** Ponteiro sobre a superfície 3D da cortina `ct1` na altura `z` (m). */
const P3 = (x: number, z: number): PointerInfo => P(x, 0, { hit3d: 'ct1', hitZ: z });

/** Célula (i, j) que o cursor destacou, ou undefined. */
const celulaDe = (sub: SubelementoCortina | null): { i: number; j: number } | undefined => (sub?.kind === 'cell' ? { i: sub.cell.i, j: sub.cell.j } : undefined);
/** Esquadrias de célula gravadas na cortina `ct1`. */
const esquadriasDe = (store: ProjectStore) => ((store.project.elements.ct1 as { curtain?: { cells?: Array<{ key: { i: number; j: number }; override: { kind: string } & Record<string, unknown> }> } }).curtain?.cells ?? []).filter((c) => c.override.kind === 'opening');

describe('ferramenta Porta/Janela na cortina: identidade e registro', () => {
  it('tem id, rótulo e dica próprios, separados das esquadrias de parede', () => {
    const { env } = ambiente();
    const porta = createTool('curtainDoor', env);
    const janela = createTool('curtainWindow', env);
    expect(porta.id).toBe('curtainDoor');
    expect(porta.label).toBe('Porta na cortina');
    expect(janela.label).toBe('Janela na cortina');
    expect(porta.hint).toContain('Porta na cortina');
    expect(porta.pick3d).toBe(true);
    expect(porta.hover3d).toBe(true);
  });
});

describe('destaque da célula ao passar o cursor', () => {
  it('na planta, a porta vai à fileira de base: o cursor sobre (1 m, 0) destaca a célula (0, 0)', () => {
    const c = ambiente();
    const t = ferramenta(c.env);
    t.move(P(1, 0.02));
    expect(celulaDe(c.sub())).toEqual({ i: 0, j: 0 });
    t.move(P(4, 0.02));
    expect(celulaDe(c.sub())).toEqual({ i: 2, j: 0 });
  });

  it('o destaque é o subelemento da cortina (kind "cell"), o mesmo que a planta e a 3D desenham', () => {
    const c = ambiente();
    ferramenta(c.env).move(P(1, 0.02));
    expect(c.sub()?.kind).toBe('cell');
    expect(c.sub()?.wallId).toBe('ct1');
  });

  it('na 3D, a altura da superfície escolhe a fileira (2,5 m fica na fileira de cima)', () => {
    const c = ambiente();
    ferramenta(c.env).move(P3(1, 2.5));
    expect(celulaDe(c.sub())).toEqual({ i: 0, j: 1 });
    ferramenta(c.env).move(P3(4.8, 0.4));
    expect(celulaDe(c.sub())).toEqual({ i: 3, j: 0 });
  });

  it('a janela na planta escolhe a fileira do corte (1,2 m), que com fileiras de 1,5 m é a de base', () => {
    const c = ambiente({ nv: 1 });
    ferramenta(c.env, 'curtainWindow').move(P(2, 0.02));
    expect(celulaDe(c.sub())).toEqual({ i: 1, j: 0 });
  });

  it('fora da cortina, o destaque some e a barra mostra a dica', () => {
    const c = ambiente();
    const t = ferramenta(c.env);
    t.move(P(1, 0.02));
    t.move(P(20, 20));
    expect(c.sub()).toBeNull();
    expect(c.sala.say.at(-1)).toContain('Porta na cortina');
  });

  it('uma parede que não é cortina não destaca nada', () => {
    const c = ambiente();
    ferramenta(c.env).move(P(1, 5.02));
    expect(c.sub()).toBeNull();
  });

  it('sem o kernel da cortina, não há grade para destacar: a barra avisa', () => {
    const c = ambiente({ semKernel: true });
    ferramenta(c.env).move(P(1, 0.02));
    expect(c.sub()).toBeNull();
    expect(c.sala.say.at(-1)).toContain('Grade da cortina indisponível');
  });

  it('célula estreita demais para a folha mínima do tipo: a barra mostra o aviso de folha mínima (o clique não bloqueia)', () => {
    // 12 colunas de 0,5 m: a folha livre (0,44 m) fica abaixo da folha mínima de porta de giro (0,60 m).
    const c = ambiente({ projeto: projetoComCortina(especCortinaTeste({ u: { mode: 'fixedNumber', count: 12 } })), nu: 12, nv: 2 });
    // Porta de 0,40 m: cabe na célula de 0,44 m livres, mas fica abaixo da folha mínima (0,60 m).
    c.store.exec({ type: 'upsertOpeningType', openingType: { ...createEmptyProject().openingTypes.ot_p80!, id: 'ot_fino', name: 'Porta fina', code: 'PF', width: 0.4, height: 1.2, sill: 0 } });
    c.env.setOptions!({ doorTypeId: 'ot_fino' });
    const t = ferramenta(c.env);
    t.move(P(0.25, 0.02));
    expect(c.sala.say.at(-1)).toContain('folha mínima');
    t.click(P(0.25, 0.02));
    expect(esquadriasDe(c.store)).toHaveLength(1);
  });

  it('a barra diz se a porta cabe na célula ou precisa fundir vizinhas', () => {
    const c = ambiente();
    const t = ferramenta(c.env);
    t.move(P(1, 0.02));
    expect(c.sala.say.at(-1)).toContain('cabe na célula (0, 0)');
    c.env.setOptions!({ doorTypeId: 'ot_p80' });
    t.move(P(1, 0.02));
    expect(c.sala.say.at(-1)).toContain('não cabe na célula (0, 0)');
  });
});

describe('clique: grava a esquadria na célula', () => {
  it('a porta que cabe é inserida na célula (0, 0) com o comando de célula', () => {
    const c = ambiente();
    const t = ferramenta(c.env);
    t.move(P(1, 0.02));
    t.click(P(1, 0.02));
    const e = esquadriasDe(c.store);
    expect(e).toHaveLength(1);
    expect(e[0]!.key).toMatchObject({ i: 0, j: 0 });
    expect(e[0]!.override).toMatchObject({ kind: 'opening', openingTypeId: 'ot_pq', fit: 'cell' });
    expect(c.sala.say.at(-1)).toBe('Porta pequena inserida na cortina.');
  });

  it('clique fora da cortina não grava nada', () => {
    const c = ambiente();
    ferramenta(c.env).click(P(20, 20));
    expect(esquadriasDe(c.store)).toHaveLength(0);
  });

  it('a janela usa o tipo de janela das opções', () => {
    const c = ambiente({ opcoes: { windowTypeId: 'ot_pq' } });
    const t = ferramenta(c.env, 'curtainWindow');
    t.click(P(1, 0.02));
    expect(esquadriasDe(c.store)[0]!.override).toMatchObject({ openingTypeId: 'ot_pq' });
  });

  it('o modo "ajustar grade à porta" grava fit grid e cria as linhas presas', () => {
    const c = ambiente({ opcoes: { curtainFit: 'grid', curtainAlign: 'start' } });
    ferramenta(c.env).click(P(1, 0.02));
    const e = esquadriasDe(c.store);
    expect(e[0]!.override).toMatchObject({ fit: 'grid', align: 'start' });
    const cortina = (c.store.project.elements.ct1 as { curtain?: { addedLines?: unknown[] } }).curtain;
    expect(cortina?.addedLines?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('Espaço e Tab invertem o giro e o sentido antes do clique', () => {
  it('Espaço inverte o giro e o clique grava flipHand', () => {
    const c = ambiente();
    const t = ferramenta(c.env);
    t.space?.();
    expect(c.env.options().openingFlipHand).toBe(true);
    t.click(P(1, 0.02));
    expect(esquadriasDe(c.store)[0]!.override).toMatchObject({ flipHand: true, flipFacing: false });
  });

  it('Tab inverte o sentido; uma segunda inversão volta ao original', () => {
    const c = ambiente();
    const t = ferramenta(c.env);
    t.tab();
    expect(c.env.options().openingFlipFacing).toBe(true);
    t.tab();
    expect(c.env.options().openingFlipFacing).toBe(false);
  });

  it('Espaço sem setOptions na interface não quebra (a inversão só não se grava)', () => {
    const c = ambiente();
    const env = { ...c.env, setOptions: undefined };
    expect(() => ferramenta(env).space?.()).not.toThrow();
  });
});

/** Deixa a resposta assíncrona da confirmação chegar (a ferramenta espera a `Promise` do `confirm`). */
const esperar = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('fusão de células vizinhas (confirmação)', () => {
  it('porta maior que a célula pede confirmação; sim funde as vizinhas e grava a porta', async () => {
    const c = ambiente({ confirma: true, opcoes: { doorTypeId: 'ot_p80' } });
    ferramenta(c.env).click(P(1, 0.02));
    await esperar();
    expect(c.confirmacoes).toHaveLength(1);
    expect(c.confirmacoes[0]).toContain('não cabe na célula');
    expect(c.confirmacoes[0]).toContain('0.80');
    const e = esquadriasDe(c.store);
    expect(e).toHaveLength(1);
    expect(e[0]!.override).toMatchObject({ openingTypeId: 'ot_p80' });
    // A fusão grava os segmentos removidos entre as células.
    const cortina = (c.store.project.elements.ct1 as { curtain?: { removedSegments?: unknown[] } }).curtain;
    expect(cortina?.removedSegments?.length ?? 0).toBeGreaterThan(0);
  });

  it('não: nada muda e a barra diz que a esquadria não foi inserida', async () => {
    const c = ambiente({ confirma: false, opcoes: { doorTypeId: 'ot_p80' } });
    const antes = JSON.stringify(c.store.project.elements.ct1);
    ferramenta(c.env).click(P(1, 0.02));
    await esperar();
    expect(c.confirmacoes).toHaveLength(1);
    expect(esquadriasDe(c.store)).toHaveLength(0);
    expect(JSON.stringify(c.store.project.elements.ct1)).toBe(antes);
    expect(c.sala.say.at(-1)).toBe('Nada mudou: a esquadria não foi inserida.');
  });

  it('sem confirmação na interface, a recusa mostra a mensagem do modelo (não cabe)', () => {
    const c = ambiente({ opcoes: { doorTypeId: 'ot_p80' } });
    ferramenta(c.env).click(P(1, 0.02));
    expect(esquadriasDe(c.store)).toHaveLength(0);
    expect(c.sala.say.at(-1)).toBe(tDoModelo('pt', 'md_ct_opening_no_fit'));
  });

  it('se a fusão deixaria a região sem forma retangular, mostra a mensagem do modelo (md_ct_*)', () => {
    const erro = new ErroEsquadriaCelula('md_ct_opening_funde_nao_retangular', 'pt');
    const c = ambiente({ confirma: true, erro, opcoes: { doorTypeId: 'ot_p80' } });
    ferramenta(c.env).click(P(1, 0.02));
    expect(c.confirmacoes).toHaveLength(0);
    expect(c.sala.say.at(-1)).toBe(tDoModelo('pt', 'md_ct_opening_funde_nao_retangular'));
  });
});

describe('Esc e saída', () => {
  it('cancelar sai da ferramenta e tira o destaque da célula', () => {
    const c = ambiente();
    const t = ferramenta(c.env);
    t.move(P(1, 0.02));
    expect(c.sub()).not.toBeNull();
    t.cancel();
    expect(c.sub()).toBeNull();
    expect(c.sala.done).toBe(1);
  });

  it('iniciar a ferramenta com um subelemento escolhido limpa o destaque antigo', () => {
    const c = ambiente();
    c.env.setSubelemento!({ wallId: 'ct1', kind: 'cell', cell: { i: 3, j: 1, s: 0.9, z: 0.75, nu: 4, nv: 2 } });
    ferramenta(c.env);
    expect(c.sub()).toBeNull();
  });
});
