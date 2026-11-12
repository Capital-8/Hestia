import { describe, expect, it } from 'vitest';
import { createEmptyProject, DEFAULT_OPENING_TYPES, openingFamilyOf, openingLeaves, openingTypeIssue, type OpeningType } from './index.ts';
import { catalogoPortas } from './catalogoPortas.ts';

/** Os 24 tipos de antes do catálogo brasileiro: ids, códigos, nomes e medidas (projetos salvos referenciam os ids). */
const ANTIGOS: Array<[id: string, code: string, name: string, kind: OpeningType['kind'], width: number, height: number, sill: number, leaves: number, plan: string]> = [
  ['ot_p70', 'P-01', 'Porta 70 x 210', 'door', 0.7, 2.1, 0, 1, 'swing'],
  ['ot_p80', 'P-02', 'Porta 80 x 210', 'door', 0.8, 2.1, 0, 1, 'swing'],
  ['ot_p90', 'P-03', 'Porta 90 x 210', 'door', 0.9, 2.1, 0, 1, 'swing'],
  ['ot_p160', 'P-04', 'Porta dupla 160 x 210', 'door', 1.6, 2.1, 0, 2, 'double'],
  ['ot_pc160', 'P-05', 'Porta de correr 160 x 210', 'door', 1.6, 2.1, 0, 2, 'sliding'],
  ['ot_pp80', 'P-06', 'Porta pivotante 80 x 210', 'door', 0.8, 2.1, 0, 1, 'pivot'],
  ['ot_vao90', 'V-01', 'Vão livre 90 x 210', 'door', 0.9, 2.1, 0, 0, 'swing'],
  ['ot_pvv90', 'P-07', 'Porta vai-e-vem 90 x 210', 'door', 0.9, 2.1, 0, 1, 'dblact'],
  ['ot_pe80', 'P-08', 'Porta de embutir 80 x 210', 'door', 0.8, 2.1, 0, 1, 'pocket'],
  ['ot_pd120', 'P-09', 'Porta dobrável 2 folhas 120 x 210', 'door', 1.2, 2.1, 0, 2, 'bifold'],
  ['ot_ps90', 'P-10', 'Porta sanfonada 90 x 210', 'door', 0.9, 2.1, 0, 1, 'accordion'],
  ['ot_pg300', 'P-11', 'Portão seccionado 300 x 220', 'door', 3.0, 2.2, 0, 1, 'garage'],
  ['ot_j120', 'J-01', 'Janela 120 x 120', 'window', 1.2, 1.2, 1.1, 2, 'sliding'],
  ['ot_j150', 'J-02', 'Janela 150 x 100', 'window', 1.5, 1.0, 1.1, 2, 'sliding'],
  ['ot_j60', 'J-03', 'Janela 60 x 60', 'window', 0.6, 0.6, 1.5, 1, 'casement'],
  ['ot_j200', 'J-04', 'Janela 200 x 120', 'window', 2.0, 1.2, 1.0, 2, 'sliding'],
  ['ot_jfixa60', 'J-05', 'Janela fixa 60 x 60', 'window', 0.6, 0.6, 1.5, 1, 'fixed'],
  ['ot_j240', 'J-06', 'Janela de correr 240 x 120 (3 folhas)', 'window', 2.4, 1.2, 1.1, 3, 'sliding'],
  ['ot_jv120', 'V-02', 'Vão livre de janela 120 x 120', 'window', 1.2, 1.2, 1.0, 0, 'fixed'],
  ['ot_ja120', 'J-07', 'Janela de abrir 120 x 120 (2 folhas)', 'window', 1.2, 1.2, 1.1, 2, 'hinged'],
  ['ot_jg90', 'J-08', 'Janela guilhotina 90 x 150', 'window', 0.9, 1.5, 0.9, 2, 'hung'],
  ['ot_jp80', 'J-09', 'Janela pivotante 80 x 120', 'window', 0.8, 1.2, 1.0, 1, 'pivotwin'],
  ['ot_jv80', 'J-10', 'Janela veneziana 80 x 60', 'window', 0.8, 0.6, 1.5, 1, 'louver'],
  ['ot_jb80', 'J-11', 'Janela basculante 80 x 50', 'window', 0.8, 0.5, 1.7, 1, 'tilt'],
];

const ANTIGOS_IDS = new Set(ANTIGOS.map((r) => r[0]));
const NOVOS = DEFAULT_OPENING_TYPES.filter((t) => !ANTIGOS_IDS.has(t.id));
const porId = (id: string): OpeningType => DEFAULT_OPENING_TYPES.find((t) => t.id === id)!;
const porCodigo = (code: string): OpeningType => DEFAULT_OPENING_TYPES.find((t) => t.code === code)!;

/** Medida do tipo novo ou antigo com a mesma família, folhas e vão (para conferir a lista pedida). */
const achou = (kind: OpeningType['kind'], plan: string, leaves: number, width: number, height: number): boolean =>
  DEFAULT_OPENING_TYPES.some((t) => t.kind === kind && t.plan === plan && t.leaves === leaves && t.width === width && t.height === height);

describe('catálogo brasileiro: tipos antigos preservados', () => {
  it('os 24 tipos de antes continuam com o mesmo id, código, nome, família e medidas', () => {
    expect(ANTIGOS).toHaveLength(24);
    for (const [id, code, name, kind, width, height, sill, leaves, plan] of ANTIGOS) {
      expect(porId(id), id).toEqual(expect.objectContaining({ id, code, name, kind, width, height, sill, leaves, plan }));
    }
  });

  it('nenhum tipo antigo ganhou nominalRef (a referência continua sendo o vão)', () => {
    for (const [id] of ANTIGOS) expect(porId(id).nominalRef, id).toBeUndefined();
  });
});

describe('catálogo brasileiro: validade e unicidade', () => {
  it('ids e códigos únicos, todo tipo com código', () => {
    expect(new Set(DEFAULT_OPENING_TYPES.map((t) => t.id)).size).toBe(DEFAULT_OPENING_TYPES.length);
    const codigos = DEFAULT_OPENING_TYPES.map((t) => t.code);
    expect(codigos.every((c) => typeof c === 'string' && c.length > 0)).toBe(true);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it('os tipos novos usam ids com prefixo ot_ e códigos P-, PF-, J- ou V-', () => {
    expect(NOVOS.length).toBeGreaterThan(0);
    for (const t of NOVOS) {
      expect(t.id.startsWith('ot_'), t.id).toBe(true);
      expect(/^(P|PF|J|V)-/.test(t.code ?? ''), t.id).toBe(true);
    }
  });

  it('todo tipo passa em openingTypeIssue, tem família e aceita a contagem de folhas dela', () => {
    for (const t of DEFAULT_OPENING_TYPES) {
      expect(openingTypeIssue(t), t.id).toBeNull();
      expect(openingFamilyOf(t), t.id).not.toBeNull();
      expect(openingLeaves(t), t.id).toContain(t.leaves);
    }
  });

  it('faixas: largura de 0,3 a 6 m, altura de 0,3 a 4 m, peitoril de 0 a 2,5 m', () => {
    for (const t of DEFAULT_OPENING_TYPES) {
      expect(t.width, t.id).toBeGreaterThanOrEqual(0.3);
      expect(t.width, t.id).toBeLessThanOrEqual(6);
      expect(t.height, t.id).toBeGreaterThanOrEqual(0.3);
      expect(t.height, t.id).toBeLessThanOrEqual(4);
      expect(t.sill, t.id).toBeGreaterThanOrEqual(0);
      expect(t.sill, t.id).toBeLessThanOrEqual(2.5);
    }
  });
});

describe('catálogo brasileiro: referência nominal', () => {
  it('portas novas (exceto o portão de garagem) são cadastradas pela folha: nominalRef "leaf"', () => {
    const portas = NOVOS.filter((t) => t.kind === 'door' && openingFamilyOf(t)?.id !== 'door_garage');
    expect(portas.length).toBeGreaterThan(40);
    for (const t of portas) expect(t.nominalRef, t.id).toBe('leaf');
  });

  it('portão de garagem e janelas novas são medidas pelo vão (sem nominalRef)', () => {
    const vaos = NOVOS.filter((t) => t.kind === 'window' || openingFamilyOf(t)?.id === 'door_garage');
    expect(vaos.length).toBeGreaterThan(40);
    for (const t of vaos) expect(t.nominalRef, t.id).toBeUndefined();
  });
});

describe('catálogo brasileiro: famílias', () => {
  it.each([
    ['P-12', 'door_swing'],
    ['P-17', 'door_double'],
    ['P-21', 'door_double'],
    ['P-24', 'door_sliding'],
    ['P-26', 'door_pocket'],
    ['P-28', 'door_pivot'],
    ['P-30', 'door_bifold'],
    ['P-31', 'door_bifold'],
    ['P-32', 'door_dblact'],
    ['P-35', 'door_accordion'],
    ['P-39', 'door_swing'],
    ['PF-30-80', 'door_swing'],
    ['P-45', 'door_garage'],
    ['J-12', 'window_sliding'],
    ['J-15', 'window_sliding'],
    ['J-20', 'window_casement'],
    ['J-25', 'window_tilt'],
    ['J-33', 'window_pivot'],
    ['J-37', 'window_hung'],
    ['J-40', 'window_hinged'],
    ['J-44', 'window_fixed'],
    ['J-46', 'window_louver'],
    ['J-48', 'window_fixed'],
    ['J-50', 'window_casement'],
  ])('%s usa a família %s', (code, familia) => {
    expect(openingFamilyOf(porCodigo(code))?.id).toBe(familia);
  });

  it('a basculante (família window_tilt) passa a ter tipos novos', () => {
    expect(NOVOS.filter((t) => t.kind === 'window' && t.plan === 'tilt').length).toBe(8);
  });
});

describe('catálogo brasileiro: corta-fogo e vidro temperado', () => {
  it('corta-fogo: PF-30, PF-60, PF-90 e PF-120 em 80 e 90 cm, folha de giro e batente de aço', () => {
    const cf = NOVOS.filter((t) => t.fireRating !== undefined);
    expect(cf).toHaveLength(8);
    expect(new Set(cf.map((t) => t.fireRating))).toEqual(new Set(['PF-30', 'PF-60', 'PF-90', 'PF-120']));
    expect(new Set(cf.map((t) => t.width))).toEqual(new Set([0.8, 0.9]));
    for (const t of cf) {
      expect(t.height, t.id).toBe(2.1);
      expect(t.frameMaterialId, t.id).toBe('mat_aco');
      expect(openingFamilyOf(t)?.id, t.id).toBe('door_swing');
    }
  });

  it('blindex: 72, 82 e 92 cm com vidro temperado de 8 mm e de 10 mm, sem caixilho', () => {
    // As variantes de vidro temperado com ferragem (`_vid`, ver "variações de material") não são blindex de catálogo antigo.
    const bl = NOVOS.filter((t) => t.glassKind === 'tempered' && !/_vid$/.test(t.id));
    expect(bl).toHaveLength(6);
    expect(new Set(bl.map((t) => t.width))).toEqual(new Set([0.72, 0.82, 0.92]));
    expect(new Set(bl.map((t) => t.glassThickness))).toEqual(new Set([0.008, 0.01]));
    for (const t of bl) {
      expect(t.frameStyle, t.id).toBe('block');
      expect(t.leafStyle, t.id).toBe('glass');
    }
  });
});

describe('catálogo brasileiro: medidas pedidas', () => {
  it('portas (folha): giro 1 folha, giro 2 folhas, balcão, correr, embutir, pivotante, camarão, vai-e-vem e sanfonada', () => {
    const pedidas: Array<[kind: OpeningType['kind'], plan: string, leaves: number, width: number, height: number]> = [
      ...[0.6, 0.7, 0.8, 0.9, 1.0].map((w): [OpeningType['kind'], string, number, number, number] => ['door', 'swing', 1, w, 2.1]),
      ...[1.2, 1.4, 1.6, 1.8].map((w): [OpeningType['kind'], string, number, number, number] => ['door', 'double', 2, w, 2.1]),
      ...[1.2, 1.5, 2.0].map((w): [OpeningType['kind'], string, number, number, number] => ['door', 'double', 2, w, 2.1]),
      ...[1.6, 1.8].map((w): [OpeningType['kind'], string, number, number, number] => ['door', 'sliding', 2, w, 2.1]),
      ...[0.8, 0.9].map((w): [OpeningType['kind'], string, number, number, number] => ['door', 'pocket', 1, w, 2.1]),
      ...[1.0, 1.2].map((w): [OpeningType['kind'], string, number, number, number] => ['door', 'pivot', 1, w, 2.1]),
      ['door', 'bifold', 2, 1.6, 2.1],
      ['door', 'bifold', 4, 2.4, 2.1],
      ...[0.8, 0.9, 1.0].map((w): [OpeningType['kind'], string, number, number, number] => ['door', 'dblact', 1, w, 2.1]),
      ...[0.6, 0.7, 0.8, 0.9].map((w): [OpeningType['kind'], string, number, number, number] => ['door', 'accordion', 1, w, 2.1]),
    ];
    for (const [kind, plan, leaves, width, height] of pedidas) {
      expect(achou(kind, plan, leaves, width, height), `${plan} ${leaves}f ${width}x${height}`).toBe(true);
    }
  });

  it('janelas (vão): correr 2, 3 e 4 folhas, maxim-ar, basculante, pivotante, guilhotina, de abrir, fixas, veneziana, bandeira e banheiro', () => {
    const pedidas: Array<[plan: string, leaves: number, medidas: Array<[number, number]>]> = [
      ['sliding', 2, [[1.2, 1.0], [1.5, 1.0], [1.2, 1.2], [1.5, 1.2], [1.2, 1.5]]],
      ['sliding', 3, [[1.5, 1.0], [2.0, 1.2]]],
      ['sliding', 4, [[2.0, 1.0], [2.0, 1.2], [2.4, 1.2]]],
      ['casement', 1, [[0.4, 0.4], [0.5, 0.5], [0.6, 0.6], [0.8, 0.6], [0.8, 0.8], [1.0, 1.0]]],
      ['tilt', 1, [[0.4, 0.4], [0.6, 0.4], [0.8, 0.4], [1.0, 0.4], [0.6, 0.6], [0.8, 0.6], [1.0, 0.6], [1.0, 1.0]]],
      ['pivotwin', 1, [[0.6, 0.6], [0.8, 0.8], [1.0, 1.0], [1.2, 1.2]]],
      ['hung', 2, [[0.6, 1.2], [0.8, 1.2], [1.0, 1.5]]],
      ['hinged', 1, [[0.6, 0.6], [0.8, 0.8], [1.0, 1.0]]],
      ['hinged', 2, [[1.2, 1.2], [1.5, 1.2]]],
      ['fixed', 1, [[0.8, 0.6], [1.2, 1.2], [0.9, 0.4], [0.9, 0.6]]],
      ['louver', 1, [[1.2, 1.0], [1.5, 1.0]]],
      ['casement', 1, [[1.0, 0.5]]],
    ];
    for (const [plan, leaves, medidas] of pedidas) {
      for (const [width, height] of medidas) {
        expect(achou('window', plan, leaves, width, height), `${plan} ${leaves}f ${width}x${height}`).toBe(true);
      }
    }
  });

  it('bandeiras fixas têm peitoril acima da porta (2,10 m)', () => {
    expect(porCodigo('J-48').sill).toBe(2.1);
    expect(porCodigo('J-49').sill).toBe(2.1);
  });
});

describe('catálogo brasileiro: variações de material das portas', () => {
  const VARIANTES = DEFAULT_OPENING_TYPES.filter((t) => /_(alu|pvc|vid)$/.test(t.id));
  const tipo = (id: string): OpeningType => VARIANTES.find((t) => t.id === id)!;

  it('24 variantes: 4 layouts × 2 tamanhos × 3 materiais, com códigos seguidos de P-62 a P-85', () => {
    expect(VARIANTES).toHaveLength(24);
    expect(VARIANTES.map((t) => t.code)).toEqual(Array.from({ length: 24 }, (_, i) => `P-${62 + i}`));
    expect(new Set(VARIANTES.map((t) => t.id)).size).toBe(24);
  });

  it('materiais de batente e vidro existem no projeto novo', () => {
    const materiais = createEmptyProject().materials;
    for (const t of VARIANTES) {
      expect(materiais[t.frameMaterialId], t.id).toBeDefined();
      expect(materiais[t.glassMaterialId], t.id).toBeDefined();
    }
    expect(new Set(VARIANTES.map((t) => t.frameMaterialId))).toEqual(new Set(['mat_aluminio', 'mat_pvc', 'mat_vidro']));
  });

  it('layouts: giro 1 folha (swing), giro 2 folhas (double), correr 2 folhas (sliding) e pivotante (pivot)', () => {
    const esperado: Array<[string, string, number]> = [
      ['ot_pgiro_80', 'swing', 1],
      ['ot_pgiro_90', 'swing', 1],
      ['ot_pgiro2_140', 'double', 2],
      ['ot_pgiro2_160', 'double', 2],
      ['ot_pcorrer_160', 'sliding', 2],
      ['ot_pcorrer_180', 'sliding', 2],
      ['ot_ppiv_100', 'pivot', 1],
      ['ot_ppiv_120', 'pivot', 1],
    ];
    for (const [base, plan, leaves] of esperado) {
      for (const sigla of ['alu', 'pvc', 'vid']) {
        const t = tipo(`${base}_${sigla}`);
        expect(t.plan, t.id).toBe(plan);
        expect(t.leaves, t.id).toBe(leaves);
        expect(t.kind, t.id).toBe('door');
        expect(t.nominalRef, t.id).toBe('leaf');
        expect(openingFamilyOf(t), t.id).not.toBeNull();
      }
    }
    expect(tipo('ot_pgiro_80_alu').width).toBe(0.8);
    expect(tipo('ot_pgiro2_140_vid').width).toBe(1.4);
  });

  it('alumínio e PVC: folha do batente (sem vidro); vidro: batente de vidro, folha de vidro temperado com ferragem', () => {
    for (const t of VARIANTES.filter((x) => !x.id.endsWith('_vid'))) expect(t.leafStyle, t.id).not.toBe('glass');
    for (const t of VARIANTES.filter((x) => x.id.endsWith('_vid'))) {
      expect(t.frameMaterialId, t.id).toBe('mat_vidro');
      expect(t.frameStyle, t.id).toBe('block');
      expect(t.leafStyle, t.id).toBe('glass');
      expect(t.glassKind, t.id).toBe('tempered');
      expect(t.glassThickness, t.id).toBe(0.01);
      expect(t.handle, t.id).toBe('pull');
    }
    expect(tipo('ot_pgiro_80_alu').frameMaterialId).toBe('mat_aluminio');
    expect(tipo('ot_pcorrer_160_pvc').frameMaterialId).toBe('mat_pvc');
  });

  it('nomes em inglês traduzem alumínio e vidro temperado (sem texto em português)', () => {
    const en = catalogoPortas('en').filter((t) => /_(alu|pvc|vid)$/.test(t.id));
    const vid = en.find((t) => t.id === 'ot_pgiro_80_vid')!;
    expect(vid.name).toContain('tempered glass');
    expect(vid.name).toContain('with hardware');
    expect(en.find((t) => t.id === 'ot_pgiro_80_alu')!.name).toContain('Aluminum');
    expect(en.some((t) => /alumínio|vidro temperado|com ferragem/.test(t.name))).toBe(false);
  });
});
