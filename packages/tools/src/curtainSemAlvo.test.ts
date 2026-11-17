import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, type Id, type Project, type SubelementoCortina } from '@hestia/model';
import { montarParedeSubelementos, type GradeCortina, type ParedeSubelementos } from '@hestia/engine';
import { projetoComCortina } from '../../engine/src/fixtureCortina.ts';
import { t as tr, type Lang } from './i18n.ts';
import { createTool, type PointerInfo, type Tool, type ToolEnv, type ToolId, type ToolOptions } from './index.ts';

/** Grade de mentira da cortina `ct1` (6 m x 3 m) com `nu` colunas e `nv` fileiras, como o modelo faz com `fixedNumber`. */
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

function paredeDe(nu: number, nv: number): ParedeSubelementos {
  return montarParedeSubelementos(gradeDe(nu, nv), { wallId: 'ct1', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, L: 6, H: 3, zBase: 0, profundidade: 0.1, extras: [] });
}

interface Opcoes {
  /** Sem o kernel da cortina: `subelementos` devolve null. */
  semKernel?: boolean;
  /** Idioma da interface. */
  lang?: Lang;
}

/** Ambiente com a cortina `ct1` (4 x 2 células) e a parede comum `w1` (y = 5 m). Registra cada comando executado. */
function ambiente(o: Opcoes = {}) {
  const store = new ProjectStore(projetoComCortina());
  // Porta pequena que cabe na célula (0,60 x 1,20), como no teste da porta na cortina.
  store.exec({ type: 'upsertOpeningType', openingType: { ...createEmptyProject().openingTypes.ot_p80!, id: 'ot_pq', name: 'Porta pequena', code: 'PQ', width: 0.6, height: 1.2, sill: 0 } });
  const options = { doorTypeId: 'ot_pq', windowTypeId: 'ot_j120' } as ToolOptions;
  let sub: SubelementoCortina | null = null;
  const comandos: string[] = [];
  const sala = { say: [] as string[] };
  const parede = paredeDe(4, 2);
  const env: ToolEnv = {
    project: () => store.project,
    levelId: () => 'lv_0',
    selection: () => [],
    setSelection: () => {},
    exec: (c) => {
      comandos.push(c.type);
      store.exec(c);
    },
    transaction: (l, fn) => store.transaction(l, fn),
    metersPerPixel: () => 0.01,
    gridStep: () => 0.1,
    say: (m) => sala.say.push(m),
    done: () => {},
    options: () => options,
    setOptions: () => {},
    lang: () => o.lang ?? 'pt',
    subelementos: (wallId: Id) => (o.semKernel ? null : wallId === 'ct1' ? parede : null),
    subelemento: () => sub,
    setSubelemento: (s) => {
      sub = s;
    },
  };
  return { env, store, sala, comandos, sub: () => sub };
}

const ferramenta = (env: ToolEnv, id: ToolId): Tool => {
  const t = createTool(id, env);
  t.start();
  return t;
};
const P = (x: number, y: number): PointerInfo => ({ raw: { x, y }, shift: false, ctrl: false, alt: false });

/** Ponto sobre a parede comum `w1` (y = 5 m), a 2 cm do eixo: dentro da tolerância de captura. */
const SOBRE_PAREDE_COMUM = P(1, 5.02);
/** Ponto sobre a cortina `ct1` (y = 0), na célula (0, 0) da fileira de base. */
const SOBRE_CORTINA = P(1, 0.02);
/** Ponto longe de qualquer parede. */
const FORA = P(20, 20);

const MENSAGEM_PT = tr('pt', 'tl_msg_curtain_only');

/** Fotografia do projeto (para provar que o clique não mudou nada). */
const fotografia = (p: Project): string => JSON.stringify(p);

describe('parede comum: as ferramentas de cortina avisam e não gravam nada', () => {
  it('porta na cortina: clique em parede comum gera o aviso na barra e o rótulo junto do cursor, sem comando', () => {
    const c = ambiente();
    const t = ferramenta(c.env, 'curtainDoor');
    const antes = fotografia(c.store.project);
    t.move(SOBRE_PAREDE_COMUM);
    t.click(SOBRE_PAREDE_COMUM);
    expect(c.sala.say.at(-1)).toBe(`Porta na cortina: ${MENSAGEM_PT}`);
    expect(t.preview()).toEqual([{ kind: 'label', at: SOBRE_PAREDE_COMUM.raw, text: MENSAGEM_PT }]);
    expect(t.blocked?.()).toBe(true);
    expect(c.comandos).toEqual([]);
    expect(fotografia(c.store.project)).toBe(antes);
  });

  it('janela na cortina: mesmo aviso, com o nome da janela, e nenhum comando', () => {
    const c = ambiente();
    const t = ferramenta(c.env, 'curtainWindow');
    t.click(SOBRE_PAREDE_COMUM);
    expect(c.sala.say.at(-1)).toBe(`Janela na cortina: ${MENSAGEM_PT}`);
    expect(t.blocked?.()).toBe(true);
    expect(c.comandos).toEqual([]);
  });

  it('linha de grade: clique em parede comum gera o aviso e não cria linha', () => {
    const c = ambiente();
    const t = ferramenta(c.env, 'curtainGridLine');
    const antes = fotografia(c.store.project);
    t.move(SOBRE_PAREDE_COMUM);
    t.click(SOBRE_PAREDE_COMUM);
    expect(c.sala.say.at(-1)).toBe(`Linha de grade na cortina: ${MENSAGEM_PT}`);
    expect(t.preview()).toEqual([{ kind: 'label', at: SOBRE_PAREDE_COMUM.raw, text: MENSAGEM_PT }]);
    expect(t.blocked?.()).toBe(true);
    expect(c.comandos).toEqual([]);
    expect(fotografia(c.store.project)).toBe(antes);
  });

  it('fora de qualquer parede, as três ferramentas avisam e recusam o cursor', () => {
    for (const id of ['curtainDoor', 'curtainWindow', 'curtainGridLine'] as const) {
      const c = ambiente();
      const t = ferramenta(c.env, id);
      t.move(FORA);
      t.click(FORA);
      expect(c.sala.say.at(-1)).toContain(MENSAGEM_PT);
      expect(t.blocked?.()).toBe(true);
      expect(c.comandos).toEqual([]);
    }
  });

  it('cortina sem o kernel (sem grade): o cursor é recusado e a barra diz que a grade não está pronta', () => {
    const c = ambiente({ semKernel: true });
    const t = ferramenta(c.env, 'curtainDoor');
    t.move(SOBRE_CORTINA);
    expect(t.blocked?.()).toBe(true);
    expect(c.sala.say.at(-1)).toBe(tr('pt', 'tl_msg_curtain_no_grid'));
    expect(t.preview()).toEqual([{ kind: 'label', at: SOBRE_CORTINA.raw, text: tr('pt', 'tl_msg_curtain_no_grid') }]);
  });

  it('o aviso vai embora quando o cursor volta a uma cortina válida (sem estado preso)', () => {
    const c = ambiente();
    const t = ferramenta(c.env, 'curtainDoor');
    t.move(SOBRE_PAREDE_COMUM);
    expect(t.blocked?.()).toBe(true);
    t.move(SOBRE_CORTINA);
    expect(t.blocked?.()).toBe(false);
    expect(t.preview()).toEqual([]);
  });

  it('o aviso sai no idioma da interface (inglês aqui)', () => {
    const c = ambiente({ lang: 'en' });
    const t = ferramenta(c.env, 'curtainGridLine');
    t.move(SOBRE_PAREDE_COMUM);
    expect(c.sala.say.at(-1)).toBe(`Grid line in curtain wall: ${tr('en', 'tl_msg_curtain_only')}`);
    expect(tr('en', 'tl_msg_curtain_only')).toContain('curtain wall');
  });
});

describe('parede cortina: o comportamento não muda', () => {
  it('porta na cortina: o cursor sobre a célula não é recusado e o clique grava a porta', () => {
    const c = ambiente();
    const t = ferramenta(c.env, 'curtainDoor');
    t.move(SOBRE_CORTINA);
    expect(t.blocked?.()).toBe(false);
    expect(t.preview()).toEqual([]);
    t.click(SOBRE_CORTINA);
    expect(c.comandos).toEqual(['setCellOpening']);
    expect(c.sala.say.at(-1)).toBe('Porta pequena inserida na cortina.');
  });

  it('janela na cortina: idem, com o tipo de janela', () => {
    const c = ambiente();
    const t = ferramenta(c.env, 'curtainWindow');
    t.move(P(2, 0.02));
    expect(t.blocked?.()).toBe(false);
    expect(c.sub()).toMatchObject({ kind: 'cell', wallId: 'ct1' });
  });

  it('linha de grade na cortina: o cursor sobre a parede cortina cria a linha (addGridLine) e não é recusado', () => {
    const c = ambiente();
    const t = ferramenta(c.env, 'curtainGridLine');
    t.move(P(1.0, 0.02));
    expect(t.blocked?.()).toBe(false);
    expect(t.preview()).toHaveLength(1);
    t.click(P(1.0, 0.02));
    expect(c.comandos).toEqual(['addGridLine']);
    expect(c.store.project.elements.ct1).toBeDefined();
  });
});

describe('dicas e textos das ferramentas de cortina', () => {
  it('a dica da porta e da janela diz "Clique numa parede cortina", em português', () => {
    const c = ambiente();
    expect(createTool('curtainDoor', c.env).hint).toContain('clique numa parede cortina');
    expect(createTool('curtainWindow', c.env).hint).toContain('clique numa parede cortina');
  });

  it('a dica da linha de grade diz "clique numa parede cortina", em português', () => {
    const c = ambiente();
    expect(createTool('curtainGridLine', c.env).hint).toContain('clique numa parede cortina');
  });

  it('a dica sai no inglês quando a interface está em inglês', () => {
    const c = ambiente({ lang: 'en' });
    expect(createTool('curtainDoor', c.env).hint).toContain('click a curtain wall');
  });

  it('a mensagem e a dica existem nos 7 idiomas, com texto próprio em cada um', () => {
    const langs: Lang[] = ['pt', 'en', 'es', 'de', 'fr', 'it', 'pl'];
    const textos = langs.map((l) => tr(l, 'tl_msg_curtain_only'));
    expect(new Set(textos).size).toBe(7);
    for (const l of langs) {
      expect(tr(l, 'tl_msg_curtain_only').length).toBeGreaterThan(20);
      expect(tr(l, 'tl_msg_curtain_no_cell').length).toBeGreaterThan(5);
      expect(tr(l, 'tl_hint_curtain_opening', { label: 'X' })).toContain('X');
      expect(tr(l, 'tl_hint_curtain_gridline', { label: 'X' })).toContain('X');
    }
  });
});
