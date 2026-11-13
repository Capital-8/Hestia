import { describe, expect, it } from 'vitest';
import { createEmptyProject } from './defaults.ts';
import { ProjectStore } from './history.ts';
import { migrateProject } from './migrate.ts';
import { SCHEMA_VERSION, type Project } from './types.ts';
import { DEFAULT_TIPO_GUARDA_CORPO_ID, EXTENSAO_CORRIMAO_PADRAO, makeGuardaCorpo, tipoGuardaCorpoIssue, tiposGuardaCorpo } from './guardaCorpo.ts';
import { LIMITES_GUARDA_CORPO, type GuardaCorpo, type HospedeiroManual, type TipoGuardaCorpo } from './guardaCorpoTypes.ts';
import { PERFIS_NORMA_PADRAO, normaDe, perfilNormaIssue, perfisNormaPadrao, type PerfilNorma } from './guardaCorpoNorma.ts';
import { guardaCorpoIssues } from './validateGuardaCorpo.ts';
import { applyElementLevel } from './elementLevel.ts';

const manual = (): HospedeiroManual => ({
  tipo: 'manual',
  uso: 'borda-laje',
  caminho: [
    { x: 0, y: 0, dz: 0 },
    { x: 3, y: 0, dz: 0 },
  ],
  fechado: false,
  ladoDeslocamento: 'esquerdo',
});

/** Projeto com um guarda-corpo manual válido sobre o nível térreo. */
function comGuarda(): { p: Project; guarda: GuardaCorpo } {
  const p = createEmptyProject();
  const guarda = { ...makeGuardaCorpo({ id: 'gc_1', levelId: 'lv_0', typeId: DEFAULT_TIPO_GUARDA_CORPO_ID, hospedeiro: manual() }), order: 1 } as GuardaCorpo;
  p.elements[guarda.id] = guarda;
  return { p, guarda };
}

/** Tipo válido que serve de base para os testes de regra. */
function tipoBase(): TipoGuardaCorpo {
  const t = tiposGuardaCorpo('pt')[0];
  if (!t) throw new Error('sem tipo padrão');
  return structuredClone(t);
}

describe('makeGuardaCorpo', () => {
  it('cria com os campos padrão do modelo (sem geometria, sem sobrescritas)', () => {
    const g = makeGuardaCorpo({ id: 'gc_x', levelId: 'lv_0', typeId: 'gct_balaustres', hospedeiro: manual() });
    expect(g.kind).toBe('railing');
    expect(g.cotaBase).toBe(0);
    expect(g.deslocamento).toBeNull();
    expect(g.altura).toBeNull();
    expect(g.inverter).toBe(false);
    expect(g.sobrescritas).toBeUndefined();
    expect(g).not.toHaveProperty('geometria');
  });
});

describe('tipos padrão', () => {
  it('traz as sete famílias padrão, todas válidas', () => {
    const tipos = tiposGuardaCorpo('pt');
    expect(tipos.map((t) => t.name)).toEqual([
      'Metálico com balaústres',
      'Vidro com corrimão',
      'Madeira',
      'Cabo de aço',
      'Tela',
      'Chapa perfurada',
      'Corrimão de parede',
    ]);
    for (const t of tipos) expect(tipoGuardaCorpoIssue(t, 'pt')).toBeNull();
  });

  it('todo corrimão de agarrar de fábrica traz a extensão mínima da norma nas duas pontas; a travessa superior não', () => {
    const minimo = normaDe(createEmptyProject(), null).limites.corrimaoExtensaoMin ?? 0;
    expect(minimo).toBeGreaterThan(0);
    expect(EXTENSAO_CORRIMAO_PADRAO).toBeGreaterThanOrEqual(minimo);
    for (const t of tiposGuardaCorpo('pt')) {
      for (const c of t.corrimaos) {
        const ext = c.funcao === 'corrimao' ? EXTENSAO_CORRIMAO_PADRAO : 0;
        const comp = (e: typeof c.extensaoInicio): number => (e.estilo === 'nenhum' ? 0 : e.comprimento);
        if (c.funcao === 'corrimao') {
          expect(comp(c.extensaoInicio), `${t.id} início`).toBeGreaterThanOrEqual(minimo);
          expect(comp(c.extensaoFim), `${t.id} fim`).toBeGreaterThanOrEqual(minimo);
        } else {
          expect(comp(c.extensaoInicio) + comp(c.extensaoFim) + ext).toBe(0);
        }
      }
    }
  });

  it('o deslocamento de fábrica deixa o poste inteiro sobre o degrau: ao menos meia largura do poste mais 1 cm (ADR 0055 §4.4)', () => {
    for (const t of tiposGuardaCorpo('pt')) {
      const maior = Math.max(...[t.postes.inicio, t.postes.fim, t.postes.canto].filter((x) => x.ativo).map((x) => x.perfil.largura));
      if (Number.isFinite(maior)) expect(t.deslocamento, t.id).toBeGreaterThanOrEqual(maior / 2 + 0.01 - 1e-9);
    }
  });

  it('o corrimão de parede não tem preenchimento e tem duas alturas (0,92 e 0,70)', () => {
    const parede = tiposGuardaCorpo('pt').find((t) => t.id === 'gct_corrimao_parede');
    expect(parede?.preenchimentos).toHaveLength(0);
    expect(parede?.corrimaos.map((c) => c.altura)).toEqual([0.92, 0.7]);
  });

  it('famílias com preenchimento de tela, cabo, chapa ou balaústre têm travessa inferior (trilho) a 5 a 10 cm do piso', () => {
    const porId = new Map(tiposGuardaCorpo('pt').map((t) => [t.id, t]));
    for (const id of ['gct_balaustres', 'gct_madeira', 'gct_cabos', 'gct_tela', 'gct_chapa_perfurada']) {
      const tipo = porId.get(id);
      expect(tipo?.trilhos.length, id).toBeGreaterThanOrEqual(1);
      const inferior = tipo!.trilhos[0]!;
      expect(inferior.altura, id).toBeGreaterThanOrEqual(0.05);
      expect(inferior.altura, id).toBeLessThanOrEqual(0.1);
    }
  });

  it('balaústres e painéis de tela, cabo e chapa nascem na travessa inferior; vidro e corrimão de parede ficam como estavam', () => {
    const porId = new Map(tiposGuardaCorpo('pt').map((t) => [t.id, t]));
    for (const id of ['gct_balaustres', 'gct_madeira', 'gct_cabos', 'gct_tela', 'gct_chapa_perfurada']) {
      for (const pr of porId.get(id)!.preenchimentos) expect(pr.base, id).toEqual({ de: 'trilho', indice: 0 });
    }
    expect(porId.get('gct_vidro')!.trilhos).toHaveLength(0);
    expect(porId.get('gct_vidro')!.preenchimentos[0]!.base).toEqual({ de: 'hospedeiro' });
    expect(porId.get('gct_corrimao_parede')!.trilhos).toHaveLength(0);
  });

  it('a travessa inferior usa o perfil do material (tubular em metal, 6 cm em madeira)', () => {
    const porId = new Map(tiposGuardaCorpo('pt').map((t) => [t.id, t]));
    expect(porId.get('gct_balaustres')!.trilhos[0]!.perfil).toEqual({ forma: 'circular', largura: 0.05, altura: 0 });
    expect(porId.get('gct_madeira')!.trilhos[0]!.perfil).toEqual({ forma: 'retangular', largura: 0.06, altura: 0.06 });
    expect(porId.get('gct_madeira')!.trilhos[0]!.materialId).toBe('mat_madeira');
  });

  it('os textos saem no idioma pedido', () => {
    expect(tiposGuardaCorpo('en')[0]?.name).toBe('Metal with balusters');
    expect(tiposGuardaCorpo('pl')[6]?.name).toBe('Poręcz ścienna');
  });
});

describe('regras do tipo (tipoGuardaCorpoIssue)', () => {
  const casos: Array<[string, (t: TipoGuardaCorpo) => void]> = [
    ['altura zero', (t) => (t.altura = 0)],
    ['folga inferior negativa', (t) => (t.folgaInferior = -0.01)],
    ['trilhos acima do limite', (t) => (t.trilhos = Array.from({ length: LIMITES_GUARDA_CORPO.trilhos + 1 }, () => ({ nome: 'T', altura: 0.5, deslocamento: 0, perfil: { forma: 'circular', largura: 0.02, altura: 0 }, materialId: 'mat_aco' })))],
    ['corrimãos acima do limite', (t) => (t.corrimaos = Array.from({ length: LIMITES_GUARDA_CORPO.corrimaos + 1 }, () => t.corrimaos[0]!))],
    ['perfil circular sem diâmetro', (t) => (t.postes.inicio.perfil = { forma: 'circular', largura: 0, altura: 0 })],
    ['retangular sem altura', (t) => (t.postes.inicio.perfil = { forma: 'retangular', largura: 0.05, altura: 0 })],
    ['poligonal com 2 pontos', (t) => (t.postes.inicio.perfil = { forma: 'poligono', largura: 0, altura: 0, pontos: [{ x: 0, y: 0 }, { x: 1, y: 0 }] })],
    ['referência a trilho inexistente', (t) => ((t.trilhos = []), (t.preenchimentos[0]!.base = { de: 'trilho', indice: 0 }))],
    ['referência a corrimão inexistente', (t) => (t.preenchimentos[0]!.topo = { de: 'corrimao', indice: 9 })],
    ['trilho na altura do guarda-corpo', (t) => (t.trilhos = [{ nome: 'T', altura: t.altura, deslocamento: 0, perfil: { forma: 'circular', largura: 0.02, altura: 0 }, materialId: 'mat_aco' }])],
    ['espessura zero em vidro', (t) => (t.preenchimentos[0] = { ...t.preenchimentos[0]!, tipo: 'painel', familia: 'vidro', espessura: 0 } as TipoGuardaCorpo['preenchimentos'][number])],
    ['padrão sem elementos', (t) => (t.preenchimentos[0]!.tipo === 'balaustres' ? (t.preenchimentos[0]!.elementos = []) : null)],
    ['período não maior que a soma', (t) => {
      const pr = t.preenchimentos[0];
      if (pr?.tipo === 'balaustres') {
        pr.elementos = [pr.elementos[0]!, { ...pr.elementos[0]!, distanciaAnterior: 0.2 }];
        pr.periodo = 0.2;
      }
    }],
    ['balaústres por degrau sem quantidade', (t) => {
      const pr = t.preenchimentos[0];
      if (pr?.tipo === 'balaustres') pr.porDegrau = { ...pr.porDegrau, ativo: true, automatico: false, quantidade: 0 };
    }],
  ];
  for (const [nome, altera] of casos) {
    it(`recusa: ${nome}`, () => {
      const t = tipoBase();
      altera(t);
      expect(tipoGuardaCorpoIssue(t, 'pt')).not.toBeNull();
    });
  }
  it('balaústres por degrau automático não exige quantidade e é o padrão de fábrica', () => {
    const t = tipoBase();
    const pr = t.preenchimentos.find((p) => p.tipo === 'balaustres');
    expect(pr?.tipo === 'balaustres' && pr.porDegrau.automatico).toBe(true);
    if (pr?.tipo === 'balaustres') pr.porDegrau = { ...pr.porDegrau, quantidade: 0 };
    expect(tipoGuardaCorpoIssue(t, 'pt')).toBeNull();
  });
  it('aceita o tipo padrão sem alteração', () => {
    expect(tipoGuardaCorpoIssue(tipoBase(), 'pt')).toBeNull();
  });
});

describe('perfis de norma', () => {
  it('traz os três presets: Brasil composto, IBC e Parte K', () => {
    expect(Object.keys(PERFIS_NORMA_PADRAO).sort()).toEqual(['ibc-us', 'nbr-br', 'uk-k']);
  });

  it('Brasil: valores da decisão 0055 §4.3 (o mais restritivo)', () => {
    const br = PERFIS_NORMA_PADRAO['nbr-br']!;
    expect(br.limites.desnivelExigeGuarda).toBe(0.19);
    expect(br.limites.alturaMinima).toBe(1.1);
    expect(br.limites.alturaMinimaEscadaInterna).toBe(0.92);
    expect(br.limites.alturaMinimaAlta).toEqual({ acimaDe: 12, altura: 1.3 });
    expect(br.limites.esferaMaxima).toBe(0.11);
    expect(br.limites.corrimaoAlturaMin).toBe(0.8);
    expect(br.limites.corrimaoAlturaMax).toBe(0.92);
    expect(br.limites.corrimaoAlturasAdicionais).toEqual([0.7]);
    expect(br.limites.corrimaoDiametroMin).toBe(0.038);
    expect(br.limites.corrimaoDiametroMax).toBe(0.045);
    expect(br.limites.corrimaoIntermediarioLargura).toBe(2.2);
    expect(br.limites.corrimaoIntermediarioEspacamento).toBe(1.8);
    expect(br.limites.cargaCorrimao).toBe(900);
  });

  it('valores lidos na NBR 9077 saem verificados; os da 14718 e da 9050 saem "a conferir"', () => {
    const br = PERFIS_NORMA_PADRAO['nbr-br']!;
    expect(br.fontes.desnivelExigeGuarda?.verificado).toBe(true);
    expect(br.fontes.alturaMinimaEscadaInterna?.verificado).toBe(true);
    expect(br.fontes.alturaMinima?.verificado).toBe(false);
    expect(br.fontes.esferaMaxima?.verificado).toBe(false);
    expect(br.fontes.corrimaoExtensaoMin?.verificado).toBe(false);
    expect(br.verificado).toBe(false);
  });

  it('todos os presets têm nome, país e passam na validação', () => {
    for (const perfil of Object.values(perfisNormaPadrao('en'))) {
      expect(perfil.name).not.toBe('');
      expect(perfil.verificado).toBe(false);
      expect(perfilNormaIssue(perfil, 'en')).toBeNull();
    }
  });

  it('IBC e Parte K têm valores "a conferir"', () => {
    expect(PERFIS_NORMA_PADRAO['ibc-us']!.limites.desnivelExigeGuarda).toBe(0.762);
    expect(PERFIS_NORMA_PADRAO['uk-k']!.limites.desnivelExigeGuarda).toBe(0.6);
    for (const id of ['ibc-us', 'uk-k']) {
      for (const f of Object.values(PERFIS_NORMA_PADRAO[id]!.fontes)) expect(f?.verificado).toBe(false);
    }
  });

  it('normaDe: o tipo vence o projeto; sem escolha, vale o Brasil', () => {
    const { p } = comGuarda();
    const tipo = tipoBase();
    expect(normaDe(p, tipo).id).toBe('nbr-br');
    p.settings.normaGuardaCorpoId = 'ibc-us';
    expect(normaDe(p, tipo).id).toBe('ibc-us');
    expect(normaDe(p, { normaId: 'uk-k' }).id).toBe('uk-k');
  });

  it('perfilNormaIssue recusa nome vazio, limite não positivo e faixa invertida', () => {
    const base = structuredClone(PERFIS_NORMA_PADRAO['nbr-br']!) as PerfilNorma;
    expect(perfilNormaIssue({ ...base, name: '  ' }, 'pt')).not.toBeNull();
    expect(perfilNormaIssue({ ...base, limites: { ...base.limites, esferaMaxima: 0 } }, 'pt')).not.toBeNull();
    expect(perfilNormaIssue({ ...base, limites: { ...base.limites, corrimaoAlturaMin: 1, corrimaoAlturaMax: 0.5 } }, 'pt')).not.toBeNull();
  });
});

describe('comandos e desfazer', () => {
  it('adiciona, edita e apaga um guarda-corpo; desfazer restaura', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc_1', levelId: 'lv_0', typeId: 'gct_balaustres', hospedeiro: manual() }) });
    expect(s.project.elements['gc_1']?.kind).toBe('railing');
    s.exec({ type: 'updateGuardaCorpo', id: 'gc_1', patch: { mark: 'G-01', altura: 1.2 } });
    expect(s.project.elements['gc_1']).toMatchObject({ mark: 'G-01', altura: 1.2 });
    s.exec({ type: 'deleteGuardaCorpo', id: 'gc_1' });
    expect(s.project.elements['gc_1']).toBeUndefined();
    s.undo();
    expect(s.project.elements['gc_1']).toMatchObject({ mark: 'G-01' });
    s.undo();
    expect(s.project.elements['gc_1']).toMatchObject({ mark: '' });
    s.undo();
    expect(s.project.elements['gc_1']).toBeUndefined();
  });

  it('não adiciona com tipo inexistente', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(() => s.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc_1', levelId: 'lv_0', typeId: 'nope', hospedeiro: manual() }) })).toThrow();
  });

  it('upsert recusa tipo inválido; delete recusa tipo em uso e o último tipo', () => {
    const { p } = comGuarda();
    const s = new ProjectStore(p);
    expect(() => s.exec({ type: 'upsertTipoGuardaCorpo', tipo: { ...tipoBase(), altura: 0 } })).toThrow();
    expect(() => s.exec({ type: 'deleteTipoGuardaCorpo', id: DEFAULT_TIPO_GUARDA_CORPO_ID })).toThrow();
    for (const t of tiposGuardaCorpo('pt').slice(1)) s.exec({ type: 'deleteTipoGuardaCorpo', id: t.id });
    expect(() => s.exec({ type: 'deleteTipoGuardaCorpo', id: DEFAULT_TIPO_GUARDA_CORPO_ID })).toThrow();
  });

  it('apagar um preset grava o conjunto, e o preset apagado não volta', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'deletePerfilNorma', id: 'uk-k' });
    expect(Object.keys(s.project.perfisNorma ?? {}).sort()).toEqual(['ibc-us', 'nbr-br']);
  });

  it('não apaga a norma do projeto nem norma em uso', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(() => s.exec({ type: 'deletePerfilNorma', id: 'nbr-br' })).toThrow();
    s.exec({ type: 'upsertTipoGuardaCorpo', tipo: { ...tipoBase(), id: 'gct_uk', normaId: 'uk-k' } });
    expect(() => s.exec({ type: 'deletePerfilNorma', id: 'uk-k' })).toThrow();
  });

  it('upsertPerfilNorma valida e grava; setNormaGuardaCorpo escolhe o perfil do projeto', () => {
    const s = new ProjectStore(createEmptyProject());
    const br = structuredClone(PERFIS_NORMA_PADRAO['nbr-br']!);
    expect(() => s.exec({ type: 'upsertPerfilNorma', perfil: { ...br, name: '' } })).toThrow();
    s.exec({ type: 'upsertPerfilNorma', perfil: { ...br, id: 'meu', name: 'Meu' } });
    s.exec({ type: 'setNormaGuardaCorpo', id: 'meu' });
    expect(s.project.settings.normaGuardaCorpoId).toBe('meu');
    expect(() => s.exec({ type: 'setNormaGuardaCorpo', id: 'nao-existe' })).toThrow();
  });
});

describe('validação do modelo', () => {
  it('guarda-corpo manual válido não gera problema', () => {
    const { p } = comGuarda();
    expect(guardaCorpoIssues(p)).toHaveLength(0);
  });

  it('hospedeiro de escada ausente vira railing-host-missing (o guarda-corpo fica no modelo)', () => {
    const { p } = comGuarda();
    p.elements['gc_esc'] = { ...makeGuardaCorpo({ id: 'gc_esc', levelId: 'lv_0', typeId: DEFAULT_TIPO_GUARDA_CORPO_ID, hospedeiro: { tipo: 'escada', escadaId: 'st_x', lados: { esquerdo: { lance: true, patamar: true }, direito: { lance: false, patamar: false } }, posicaoBase: 'degrau' } }), order: 2 } as GuardaCorpo;
    const codigos = guardaCorpoIssues(p).map((i) => i.code);
    expect(codigos).toEqual(['railing-host-missing']);
  });

  it('tipo ausente e caminho manual curto viram erro', () => {
    const { p, guarda } = comGuarda();
    p.elements[guarda.id] = { ...guarda, typeId: 'nope', hospedeiro: { ...manual(), caminho: [{ x: 0, y: 0, dz: 0 }] } };
    expect(guardaCorpoIssues(p).map((i) => i.code).sort()).toEqual(['railing-path-invalid', 'railing-type-missing']);
  });

  it('nível inexistente vira railing-level-missing', () => {
    const { p, guarda } = comGuarda();
    p.elements[guarda.id] = { ...guarda, levelId: 'lv_nao' };
    expect(guardaCorpoIssues(p).map((i) => i.code)).toEqual(['railing-level-missing']);
  });
});

describe('migração, esquema e serialização', () => {
  it('o esquema vai para 24', () => {
    expect(SCHEMA_VERSION).toBe(25);
  });

  it('projeto 23 ganha os tipos padrão e preserva os do arquivo', () => {
    const raw = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
    delete raw.tiposGuardaCorpo;
    raw.schemaVersion = 23;
    const p = migrateProject(raw);
    expect(p.schemaVersion).toBe(25);
    expect(Object.keys(p.tiposGuardaCorpo).sort()).toEqual(tiposGuardaCorpo('pt').map((t) => t.id).sort());
    expect(p.elements).toEqual({});
  });

  it('projeto 23 com tipo próprio mantém o tipo do arquivo', () => {
    const raw = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
    const meu = { ...tipoBase(), id: 'gct_meu', name: 'Meu' };
    raw.tiposGuardaCorpo = { gct_meu: meu };
    raw.schemaVersion = 23;
    const p = migrateProject(raw);
    expect(p.tiposGuardaCorpo['gct_meu']?.name).toBe('Meu');
    expect(p.tiposGuardaCorpo[DEFAULT_TIPO_GUARDA_CORPO_ID]).toBeDefined();
  });

  it('ida e volta em JSON preserva guarda-corpo, tipo e perfil de norma', () => {
    const { p } = comGuarda();
    p.perfisNorma = perfisNormaPadrao('pt');
    p.settings.normaGuardaCorpoId = 'ibc-us';
    const volta = migrateProject(JSON.parse(JSON.stringify(p)));
    expect(volta.elements['gc_1']).toEqual(p.elements['gc_1']);
    expect(volta.tiposGuardaCorpo).toEqual(p.tiposGuardaCorpo);
    expect(volta.perfisNorma).toEqual(p.perfisNorma);
    expect(volta.settings.normaGuardaCorpoId).toBe('ibc-us');
  });

  it('cota de guarda-corpo manual acompanha a troca de nível com elevação mantida', () => {
    const { p, guarda } = comGuarda();
    p.levels.push({ ...p.levels[0]!, id: 'lv_9', elevation: 3 });
    p.elements[guarda.id] = { ...guarda, cotaBase: 0 };
    applyElementLevel(p, { ids: [guarda.id], levelId: 'lv_9', keep: 'elevation' });
    expect((p.elements[guarda.id] as GuardaCorpo).cotaBase).toBe(-3);
  });
});
