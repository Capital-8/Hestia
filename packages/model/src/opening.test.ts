import { describe, expect, it } from 'vitest';
import { DEFAULT_OPENING_TYPES, ProjectStore, createEmptyProject, makeWall, nextOpeningFavorite, openingCasing, openingFamilies, openingFamilyName, openingFamilyOf, openingFavorites, openingHeight, openingLeaves, openingLintel, openingRough, openingSillBeam, openingSillBoard, openingType, openingTypeIssue, openingTypeWarning, type Opening, type OpeningType } from './index.ts';

const tipo = (id: string): OpeningType => {
  const t = DEFAULT_OPENING_TYPES.find((x) => x.id === id);
  if (!t) throw new Error(`tipo padrão ausente: ${id}`);
  return t;
};

describe('famílias de abertura', () => {
  it('famílias de porta (10) e de janela (9), na ordem da interface', () => {
    expect(openingFamilies('door').map((f) => f.id)).toEqual(['door_swing', 'door_double', 'door_sliding', 'door_pivot', 'door_dblact', 'door_pocket', 'door_bifold', 'door_accordion', 'door_garage', 'door_void']);
    expect(openingFamilies('window').map((f) => f.id)).toEqual(['window_fixed', 'window_hinged', 'window_tilt', 'window_casement', 'window_sliding', 'window_hung', 'window_pivot', 'window_louver', 'window_void']);
  });

  it('cada tipo do catálogo cai na família do seu comportamento', () => {
    expect(openingFamilyOf(tipo('ot_p80'))!.id).toBe('door_swing');
    expect(openingFamilyOf(tipo('ot_p160'))!.id).toBe('door_double');
    expect(openingFamilyOf(tipo('ot_pc160'))!.id).toBe('door_sliding');
    expect(openingFamilyOf(tipo('ot_pp80'))!.id).toBe('door_pivot');
    expect(openingFamilyOf(tipo('ot_vao90'))!.id).toBe('door_void');
    expect(openingFamilyOf(tipo('ot_jfixa60'))!.id).toBe('window_fixed');
    expect(openingFamilyOf(tipo('ot_j60'))!.id).toBe('window_casement');
    expect(openingFamilyOf(tipo('ot_j120'))!.id).toBe('window_sliding');
    expect(openingFamilyOf(tipo('ot_j240'))!.id).toBe('window_sliding');
    expect(openingFamilyOf(tipo('ot_jv120'))!.id).toBe('window_void');
  });

  it('o vão livre de janela tem 0 folhas e o símbolo da fixa (sem folha o desenho é só a soleira)', () => {
    expect(openingFamilyOf({ kind: 'window', plan: 'fixed', leaves: 0 })!.id).toBe('window_void');
    expect(openingFamilyOf({ kind: 'door', plan: 'swing', leaves: 0 })!.id).toBe('door_void');
  });

  it('porta de duas folhas gravada como giro (arquivo antigo ou editor) é a família dupla', () => {
    expect(openingFamilyOf({ kind: 'door', plan: 'swing', leaves: 2 })!.id).toBe('door_double');
    expect(openingFamilyName({ kind: 'door', plan: 'double', leaves: 2 })).toBe('Porta dupla');
  });

  it('folhas aceitas por família: giro 1, dupla 2, correr 2, pivotante 1, vão livre 0; janela de correr 2 e 3', () => {
    expect(openingLeaves({ kind: 'door', plan: 'swing', leaves: 1 })).toEqual([1]);
    expect(openingLeaves({ kind: 'door', plan: 'double', leaves: 2 })).toEqual([2]);
    expect(openingLeaves({ kind: 'door', plan: 'sliding', leaves: 2 })).toEqual([2, 1]);
    expect(openingLeaves({ kind: 'door', plan: 'pivot', leaves: 1 })).toEqual([1]);
    expect(openingLeaves({ kind: 'door', plan: 'swing', leaves: 0 })).toEqual([0]);
    expect(openingLeaves({ kind: 'window', plan: 'sliding', leaves: 3 })).toEqual([2, 3, 4]);
    expect(openingLeaves({ kind: 'window', plan: 'tilt', leaves: 1 })).toEqual([1]);
  });

  it('combinações que não existem não têm família e são recusadas com mensagem', () => {
    const invalidos: Array<Pick<OpeningType, 'kind' | 'plan' | 'leaves'>> = [
      { kind: 'door', plan: 'fixed', leaves: 1 },
      { kind: 'door', plan: 'swing', leaves: 3 },
      { kind: 'window', plan: 'swing', leaves: 1 },
      { kind: 'window', plan: 'sliding', leaves: 1 },
      { kind: 'window', plan: 'tilt', leaves: 2 },
    ];
    for (const t of invalidos) {
      expect(openingFamilyOf(t)).toBeNull();
      expect(openingTypeIssue(t)).toMatch(/Combinação inválida/);
    }
    expect(openingTypeIssue({ kind: 'window', plan: 'sliding', leaves: 1 })).toBe('Combinação inválida: janela com o símbolo "sliding" e 1 folha.');
    expect(openingTypeIssue({ kind: 'door', plan: 'swing', leaves: 3 })).toBe('Combinação inválida: porta com o símbolo "swing" e 3 folhas.');
  });

  it('toda combinação válida passa na regra do tipo', () => {
    for (const f of [...openingFamilies('door'), ...openingFamilies('window')]) {
      for (const leaves of f.leaves) expect(openingTypeIssue({ kind: f.kind, plan: f.plan, leaves })).toBeNull();
    }
  });
});

describe('catálogo: portas novas (tarefa F1)', () => {
  it('os cinco tipos pré-cadastrados têm código, família certa e passam na regra do tipo', () => {
    const novos: Array<[string, string, string]> = [
      ['ot_pvv90', 'P-07', 'door_dblact'],
      ['ot_pe80', 'P-08', 'door_pocket'],
      ['ot_pd120', 'P-09', 'door_bifold'],
      ['ot_ps90', 'P-10', 'door_accordion'],
      ['ot_pg300', 'P-11', 'door_garage'],
    ];
    for (const [id, code, familia] of novos) {
      const t = tipo(id);
      expect(t.code, id).toBe(code);
      expect(openingFamilyOf(t)?.id, id).toBe(familia);
      expect(openingTypeIssue(t), id).toBeNull();
    }
    expect(tipo('ot_pd120').leaves).toBe(2);
    expect(tipo('ot_pg300').frameMaterialId).toBe('mat_aco');
  });
});

describe('regra do tipo no comando', () => {
  it('grava o tipo válido e recusa o inválido, sem alterar o projeto', () => {
    const s = new ProjectStore(createEmptyProject());
    const base = tipo('ot_p80');
    s.exec({ type: 'upsertOpeningType', openingType: { ...base, id: 'ot_novo', name: 'Porta da sala', code: 'P-10' } });
    expect(s.project.openingTypes.ot_novo).toMatchObject({ name: 'Porta da sala', code: 'P-10', leaves: 1, plan: 'swing' });
    expect(() => s.exec({ type: 'upsertOpeningType', openingType: { ...base, id: 'ot_ruim', leaves: 3 } })).toThrow(/Combinação inválida/);
    expect(s.project.openingTypes.ot_ruim).toBeUndefined();
  });
});


describe('vão bruto, alizar, peitoril e vergas do tipo', () => {
  it('sem os campos, o vão bruto é o do tipo e os acabamentos não existem', () => {
    const t = tipo('ot_j120');
    expect(openingRough(t)).toEqual({ width: 1.2, height: 1.2 });
    expect(openingCasing(t)).toBeNull();
    expect(openingSillBoard(t)).toBeNull();
    expect(openingLintel(t)).toBeNull();
    expect(openingSillBeam(t)).toBeNull();
  });

  it('a folga soma na largura e na altura do furo; valores inválidos valem zero', () => {
    const r = openingRough({ width: 0.8, height: 2.1, roughOversize: { w: 0.04, h: 0.06 } });
    expect(r.width).toBeCloseTo(0.84, 9);
    expect(r.height).toBeCloseTo(2.16, 9);
    expect(openingRough({ width: 0.8, height: 2.1, roughOversize: { w: -1, h: Number.NaN } })).toEqual({ width: 0.8, height: 2.1 });
  });

  it('alizar e peitoril só valem com as duas medidas positivas; peitoril só em janela', () => {
    expect(openingCasing({ casing: { width: 0.05, thickness: 0.015 } })).toEqual({ width: 0.05, thickness: 0.015 });
    expect(openingCasing({ casing: { width: 0, thickness: 0.015 } })).toBeNull();
    expect(openingSillBoard({ kind: 'window', sillBoard: { projection: 0.03, thickness: 0.02 } })).toEqual({ projection: 0.03, thickness: 0.02 });
    expect(openingSillBoard({ kind: 'door', sillBoard: { projection: 0.03, thickness: 0.02 } })).toBeNull();
  });

  it('verga e contraverga usam transpasse padrão de 0,30 m quando o campo está presente sem valores', () => {
    expect(openingLintel({ lintel: {} })).toEqual({ over: 0.3, height: 0.2 });
    expect(openingLintel({ lintel: { over: 0.4, height: 0.15 } })).toEqual({ over: 0.4, height: 0.15 });
    expect(openingSillBeam({ sillBeam: { over: 0 } })).toEqual({ over: 0, height: 0.2 });
    expect(openingLintel({})).toBeNull();
  });
});

describe('acabamento na regra do tipo e no comando', () => {
  it('openingTypeIssue recusa medida de acabamento fora da faixa e aceita o tipo válido', () => {
    const base = { kind: 'window' as const, plan: 'fixed' as const, leaves: 1 as const };
    expect(openingTypeIssue(base)).toBeNull();
    expect(openingTypeIssue({ ...base, casing: { width: 0.05, thickness: -0.01 } })).toBe('Alizar, espessura: use um valor de 0 a 5 cm.');
  });

  it('o comando não grava o tipo com acabamento inválido e grava o válido', () => {
    const s = new ProjectStore(createEmptyProject());
    const t = s.project.openingTypes['ot_p80'] ?? DEFAULT_OPENING_TYPES[0]!;
    expect(() => s.exec({ type: 'upsertOpeningType', openingType: { ...t, id: 'ot_x', lintel: { over: 2 } } })).toThrow('Verga, transpasse: use um valor de 0 a 100 cm.');
    expect(s.project.openingTypes['ot_x']).toBeUndefined();
    s.exec({ type: 'upsertOpeningType', openingType: { ...t, id: 'ot_x', lintel: { over: 0.3, height: 0.2 } } });
    expect(s.project.openingTypes['ot_x']?.lintel).toEqual({ over: 0.3, height: 0.2 });
  });
});

describe('campos v2 na regra do tipo', () => {
  const porta = DEFAULT_OPENING_TYPES.find((t) => t.id === 'ot_p90')!;
  const janela = DEFAULT_OPENING_TYPES.find((t) => t.id === 'ot_j120')!;

  it('aceita os valores padrão (campos v2 ausentes)', () => {
    expect(openingTypeIssue(porta)).toBeNull();
    expect(openingTypeIssue(janela)).toBeNull();
    expect(openingTypeIssue({ ...porta, angle2d: 0, angle3d: 120 })).toBeNull();
    expect(openingTypeIssue({ ...janela, grid: { cols: 1, rows: 8 } })).toBeNull();
  });

  it('recusa ângulo fora de 0..120', () => {
    expect(openingTypeIssue({ ...porta, angle2d: 150 })).toBe('Ângulo de abertura 2D: use um valor de 0 a 120°.');
    expect(openingTypeIssue({ ...porta, angle3d: -1 })).toBe('Ângulo de abertura 3D: use um valor de 0 a 120°.');
  });

  it('recusa grid fora de 1..8 ou fracionário', () => {
    const msg = 'Divisões do caixilho: use colunas e linhas inteiras de 1 a 8.';
    expect(openingTypeIssue({ ...janela, grid: { cols: 0, rows: 2 } })).toBe(msg);
    expect(openingTypeIssue({ ...janela, grid: { cols: 9, rows: 2 } })).toBe(msg);
    expect(openingTypeIssue({ ...janela, grid: { cols: 2, rows: 2.5 } })).toBe(msg);
  });

  it('recusa bandeira com altura maior ou igual à do tipo e lateral com largura não positiva', () => {
    expect(openingTypeIssue({ ...porta, transom: { height: porta.height } })).toBe(
      'Bandeira: a altura deve ser maior que 0 e menor que a altura do tipo.',
    );
    expect(openingTypeIssue({ ...porta, sidelights: { left: true, width: 0 } })).toBe(
      'Bandeira lateral: a largura deve ser maior que 0 e menor que a largura do tipo.',
    );
    expect(openingTypeIssue({ ...porta, sidelights: { right: true, width: porta.width } })).toBe(
      'Bandeira lateral: a largura deve ser maior que 0 e menor que a largura do tipo.',
    );
  });

  it('recusa estilos fora dos conjuntos fechados', () => {
    expect(openingTypeIssue({ ...porta, leafStyle: 'desconhecido' as never })).toBe('Estilo da folha desconhecido.');
    expect(openingTypeIssue({ ...porta, handle: 'puxador' as never })).toBe('Maçaneta desconhecida.');
    expect(openingTypeIssue({ ...porta, frameStyle: 'x' as never })).toBe('Estilo do batente desconhecido.');
  });

  it('o comando recusa o tipo inválido com a mensagem e não grava', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(() => s.exec({ type: 'upsertOpeningType', openingType: { ...porta, id: 'ot_v2', angle2d: 150 } })).toThrow(
      'Ângulo de abertura 2D: use um valor de 0 a 120°.',
    );
    expect(s.project.openingTypes['ot_v2']).toBeUndefined();
  });
});

describe('favoritos de tipo de abertura', () => {
  it('o comando liga e desliga o favorito e o desfazer volta a lista', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(openingFavorites(s.project)).toEqual([]);
    s.exec({ type: 'toggleOpeningFavorite', id: 'ot_p80' }, 'Favoritar tipo de abertura');
    expect(openingFavorites(s.project)).toEqual(['ot_p80']);
    s.exec({ type: 'toggleOpeningFavorite', id: 'ot_j120' }, 'Favoritar tipo de abertura');
    expect(openingFavorites(s.project)).toEqual(['ot_p80', 'ot_j120']);
    s.exec({ type: 'toggleOpeningFavorite', id: 'ot_p80' }, 'Remover tipo dos favoritos');
    expect(openingFavorites(s.project)).toEqual(['ot_j120']);
    s.undo();
    expect(openingFavorites(s.project)).toEqual(['ot_p80', 'ot_j120']);
    expect(() => s.exec({ type: 'toggleOpeningFavorite', id: 'nao_existe' })).toThrow(/Tipo de abertura inexistente/);
  });

  it('nextOpeningFavorite é pura: não altera a lista recebida', () => {
    const list = ['a'];
    expect(nextOpeningFavorite(list, 'b')).toEqual(['a', 'b']);
    expect(nextOpeningFavorite(list, 'a')).toEqual([]);
    expect(list).toEqual(['a']);
  });
});

describe('altura por instância', () => {
  const comJanela = (heightOverride: number | null = null) => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    s.exec({
      type: 'addOpening',
      opening: { id: 'j', kind: 'window', typeId: 'ot_j120', hostId: 'w', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, heightOverride, mark: '' },
    });
    return s;
  };

  it('updateElements aceita altura positiva e null, com desfazer', () => {
    const s = comJanela();
    expect((s.project.elements.j as Opening).heightOverride).toBeNull();

    s.exec({ type: 'updateElements', ids: ['j'], patch: { heightOverride: 1.75 } });
    const o = s.project.elements.j as Opening;
    expect(o.heightOverride).toBe(1.75);
    expect(openingHeight(openingType(s.project, o), o)).toBeCloseTo(1.75, 9);

    s.undo();
    expect((s.project.elements.j as Opening).heightOverride).toBeNull();
    expect(openingHeight(openingType(s.project, s.project.elements.j as Opening), s.project.elements.j as Opening)).toBeCloseTo(1.2, 9);

    s.exec({ type: 'updateElements', ids: ['j'], patch: { heightOverride: null } });
    expect((s.project.elements.j as Opening).heightOverride).toBeNull();
  });

  it('helper ignora override inválido e cai para a altura do tipo', () => {
    const s = comJanela(-0.5);
    const o = s.project.elements.j as Opening;
    expect(openingHeight(openingType(s.project, o), o)).toBeCloseTo(openingType(s.project, o).height, 9);
    expect(openingHeight(openingType(s.project, o), { ...o, heightOverride: Number.NaN })).toBeCloseTo(openingType(s.project, o).height, 9);
  });
});

describe('openingTypeWarning (alizar x retorno)', () => {
  it('leafPlan: valores válidos passam e o desconhecido é erro de tipo', () => {
    const t = DEFAULT_OPENING_TYPES.find((x) => x.id === 'ot_p90')!;
    for (const v of ['open', 'closed', 'both'] as const) expect(openingTypeIssue({ ...t, leafPlan: v })).toBeNull();
    expect(openingTypeIssue({ ...t, leafPlan: 'x' as never })).toMatch(/Folha em planta/);
  });

  it('avisa só quando há alizar e closure explícito; nunca é erro', () => {
    const casing = { width: 0.07, thickness: 0.015 };
    expect(openingTypeWarning({ closure: 'both', casing })).toMatch(/alizar/);
    expect(openingTypeWarning({ closure: 'inherit', casing })).toBeNull();
    expect(openingTypeWarning({ closure: 'both' })).toBeNull();
  });
});

