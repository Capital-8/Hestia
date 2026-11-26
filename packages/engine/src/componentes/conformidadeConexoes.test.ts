import { afterEach, describe, expect, it } from 'vitest';
import { createEmptyProject, familiaDaBiblioteca, ProjectStore, type Component, type Familia } from '@hestia/model';
import { categoriaDaFamilia } from './categoriaPeca.ts';
import { conferirLinha, empacotarLinha, lacunaMinima, motivoColadas, parDiretoPermitido, TRECHO_MINIMO_ENTRE_CONEXOES, trechoMinimoDe, type PecaNaLinha, type ParDireto } from './conformidadeConexoes.ts';
import { diagnosticarRede } from './diagnosticoRede.ts';
import { resolverNo, type EntradaNo, type VizinhaNo } from './resolvedorNo.ts';
import { TIPOS_TUBULACAO, tipoDaFamiliaDeTubo } from './tiposTubulacao.ts';
import { COMPRIMENTO_MINIMO_TRECHO, listarProblemasDeViabilidade } from './viabilidadeNo.ts';

/*
 * Conformidade entre conexões (ficha F1): dado editável por tipo (`trechoMinimoEntreConexoes`, `paresDiretos`), sequência peça-tubo-peça
 * pura, resolvedor com a peça vizinha conhecida, mínimo por tipo na viabilidade e o diagnóstico `conexoes_coladas` da Verificar rede.
 */

const SOL = 'fam_krona_soldavel_tubo_corte';
const JOELHO = 'fam_krona_soldavel_joelho90';
const LUVA_RED = 'fam_krona_soldavel_luva_reducao';
const tipoSol = TIPOS_TUBULACAO.find((t) => t.id === 'krona_soldavel') as { paresDiretos: readonly ParDireto[]; trechoMinimoEntreConexoes: number };
const paresOriginais = tipoSol.paresDiretos;
const minimoOriginal = tipoSol.trechoMinimoEntreConexoes;
afterEach(() => { tipoSol.paresDiretos = paresOriginais; tipoSol.trechoMinimoEntreConexoes = minimoOriginal; });

const peca = (rotulo: string, categoria: PecaNaLinha['categoria'], antes: number, depois: number): PecaNaLinha => ({ rotulo, categoria, recuoAntes: antes, recuoDepois: depois });

describe('dado editável por tipo de tubulação', () => {
  it('os três tipos declaram o mínimo (10 mm, CONFERIR) e nenhum par direto', () => {
    for (const t of TIPOS_TUBULACAO) {
      expect(t.trechoMinimoEntreConexoes).toBe(TRECHO_MINIMO_ENTRE_CONEXOES);
      expect(t.paresDiretos).toEqual([]);
    }
  });
  it('o mínimo de tipo é o mesmo valor que a viabilidade B2 já usava', () => {
    expect(TRECHO_MINIMO_ENTRE_CONEXOES).toBe(COMPRIMENTO_MINIMO_TRECHO);
  });
  it('sem tipo, vale o mínimo padrão e nenhum par é direto', () => {
    expect(trechoMinimoDe(undefined)).toBe(10);
    expect(parDiretoPermitido(undefined, 'luva', 'curva90')).toBe(false);
    expect(lacunaMinima(undefined, 'luva', 'curva90')).toBe(10);
  });
  it('par direto configurado vale nos dois sentidos e zera a lacuna só desse par', () => {
    const tipo = { paresDiretos: [['luva', 'curva90']] as ParDireto[] };
    expect(parDiretoPermitido(tipo, 'curva90', 'luva')).toBe(true);
    expect(lacunaMinima(tipo, 'luva', 'curva90')).toBe(0);
    expect(lacunaMinima(tipo, 'luva', 'te')).toBe(10);
  });
  it('categoriaDaFamilia acha a peça pelas regras do tipo e ignora tubo e outras famílias', () => {
    expect(categoriaDaFamilia(JOELHO)?.categoria).toBe('curva90');
    expect(categoriaDaFamilia(LUVA_RED)?.categoria).toBe('reducao');
    expect(categoriaDaFamilia(JOELHO)?.tipo?.id).toBe('krona_soldavel');
    expect(categoriaDaFamilia(SOL)).toBeNull();
    expect(categoriaDaFamilia('fam_qualquer_caixa')).toBeNull();
  });
});

describe('sequência peça, tubo, peça', () => {
  it('empacota com o tubo mínimo entre as peças e conta os recuos com sinal', () => {
    const r = empacotarLinha(undefined, [peca('Joelho', 'curva90', 0, 14.4), peca('Redução', 'reducao', -23.3, 24.3)]);
    expect(r.lacunas).toEqual([10]);
    expect(r.centros[1]).toBeCloseTo(14.4 + 10 - 23.3, 6);
    expect(r.fim).toBeCloseTo(r.centros[1]! + 24.3, 6);
  });
  it('par direto empacota encostado (lacuna 0)', () => {
    const r = empacotarLinha({ paresDiretos: [['curva90', 'reducao']] }, [peca('Joelho', 'curva90', 0, 14.4), peca('Redução', 'reducao', 5, 5)]);
    expect(r.lacunas).toEqual([0]);
    expect(r.centros[1]).toBeCloseTo(19.4, 6);
  });
  it('conferirLinha aceita tubo >= mínimo e acusa tubo menor com as duas conexões no motivo', () => {
    const pecas = [peca('Joelho', 'curva90', 0, 14.4), peca('Redução', 'reducao', 10, 0)];
    expect(conferirLinha(undefined, pecas, [0, 40])).toBeNull();
    const c = conferirLinha(undefined, pecas, [0, 30]);
    expect(c?.restante).toBeCloseTo(5.6, 6);
    expect(c?.motivo).toBe(motivoColadas('Joelho', 'Redução', 10));
    expect(c?.motivo).toBe('As conexões Joelho e Redução ficariam coladas: o trecho entre elas precisa de pelo menos 10 mm de tubo.');
  });
  it('encostadas (restante 0) só passam se o par é direto; uma fresta de tubo menor que o mínimo não passa nem no par direto', () => {
    const pecas = [peca('A', 'curva90', 0, 10), peca('B', 'luva', 10, 0)];
    expect(conferirLinha(undefined, pecas, [0, 20])?.restante).toBeCloseTo(0, 6);
    expect(conferirLinha({ paresDiretos: [['curva90', 'luva']] }, pecas, [0, 20])).toBeNull();
    expect(conferirLinha({ paresDiretos: [['curva90', 'luva']] }, pecas, [0, 25])).not.toBeNull();
  });
});

describe('resolvedor com a peça vizinha conhecida', () => {
  const familias: Record<string, Familia> = {};
  for (const id of [JOELHO, LUVA_RED]) familias[id] = familiaDaBiblioteca(id) as Familia;
  const regras = tipoDaFamiliaDeTubo(SOL)!.regras;
  const L90 = (dnA: number, dnB: number, vizinha?: VizinhaNo): EntradaNo => ({
    tipo: tipoSol as unknown as EntradaNo['tipo'] & object,
    familias,
    no: { tipo: 'encontro', trechos: [{ direcao: [-1, 0, 0], dn: dnA }, { direcao: [0, 1, 0], dn: dnB, ...(vizinha ? { vizinha } : {}) }] },
  });
  const com = (e: EntradaNo): EntradaNo => ({ ...e, tipo: { ...(e.tipo as object), regras, bitolas: [25, 32] } as EntradaNo['tipo'] });
  const viz = (distancia: number): VizinhaNo => ({ categoria: 'curva90', distancia, recuo: 14.4 });

  it('vizinha longe: a curva segue `ok`', () => {
    expect(resolverNo(com(L90(25, 25, viz(500)))).status).toBe('ok');
  });
  it('vizinha colada (tubo restante menor que o mínimo): sem_solucao `conexoes_coladas` com o motivo fixo', () => {
    const s = resolverNo(com(L90(25, 25, viz(30))));
    expect(s.status).toBe('sem_solucao');
    if (s.status === 'sem_solucao') {
      expect(s.codigo).toBe('conexoes_coladas');
      expect(s.motivo).toMatch(/^As conexões joelho ou curva de 90° e joelho ou curva de 90° ficariam coladas: o trecho entre elas precisa de pelo menos 10 mm de tubo\.$/);
    }
  });
  it('par direto configurado e conexões encostadas: segue `ok`', () => {
    tipoSol.paresDiretos = [['curva90', 'curva90']];
    const r = resolverNo(com(L90(25, 25, viz(28.8))));
    expect(r.status).toBe('ok');
  });
  it('sem a vizinha informada nada muda (comportamento anterior)', () => {
    expect(resolverNo(com(L90(25, 25))).status).toBe('ok');
  });
  it('curva entre DN 25 e 32 (`ajustada`) com vizinha longe segue ajustada; com vizinha perto vira coladas', () => {
    expect(resolverNo(com(L90(25, 32, viz(800)))).status).toBe('ajustada');
    const s = resolverNo(com(L90(25, 32, viz(40))));
    expect(s).toMatchObject({ status: 'sem_solucao', codigo: 'conexoes_coladas' });
  });
  it('o mínimo do tipo manda: com 100 mm uma vizinha a 40 mm do joelho vira coladas', () => {
    expect(resolverNo(com(L90(25, 25, viz(60)))).status).toBe('ok');
    tipoSol.trechoMinimoEntreConexoes = 100;
    expect(resolverNo(com(L90(25, 25, viz(60)))).status).toBe('sem_solucao');
  });
});

describe('viabilidade com o mínimo do tipo', () => {
  it('trecho com 30 mm de tubo passa no mínimo de 10 mm e é bloqueado no de 50 mm', () => {
    const trechos = [{ comprimento: 60, recuoInicio: 15, recuoFim: 15 }];
    expect(listarProblemasDeViabilidade({ trechos })).toEqual([]);
    expect(listarProblemasDeViabilidade({ trechos, trechoMinimo: 50 })[0]).toMatchObject({ codigo: 'trecho_curto' });
    expect(listarProblemasDeViabilidade({ trechos, trechoMinimo: 50 })[0]?.motivo).toContain('mínimo 50 mm');
  });
  it('trecho entre conexões vale o mínimo mesmo sem recuo nesta ponta', () => {
    const t = { comprimento: 8, recuoInicio: 0, recuoFim: 0 };
    expect(listarProblemasDeViabilidade({ trechos: [t] })).toEqual([]);
    expect(listarProblemasDeViabilidade({ trechos: [{ ...t, entreConexoes: true }] })[0]).toMatchObject({ codigo: 'trecho_curto' });
  });
  it('a prumada também usa o mínimo do tipo', () => {
    const p = { desvioVertical: 60, diametroExterno: 25, recuoBaixo: 14, recuoCima: 14 };
    expect(listarProblemasDeViabilidade({ prumadas: [p] })).toEqual([]);
    expect(listarProblemasDeViabilidade({ prumadas: [p], trechoMinimo: 50 })[0]).toMatchObject({ codigo: 'cota_insuficiente' });
  });
});

describe('Verificar rede: conexoes_coladas', () => {
  /** Joelho e luva de redução (e opcionalmente um tubo entre eles), ligados pelas ligações a/b. */
  function rede(comTubo: boolean): ReturnType<typeof diagnosticarRede> {
    const store = new ProjectStore(createEmptyProject('t'));
    for (const id of [SOL, JOELHO, LUVA_RED]) store.exec({ type: 'upsertFamily', family: structuredClone(familiaDaBiblioteca(id) as Familia) });
    const nivel = store.project.levels[0]?.id ?? 'lv_0';
    const add = (id: string, familyId: string, x: number, values: Component['values']): void => store.exec({ type: 'addComponent', component: { id, kind: 'component', familyId, typeId: null, levelId: nivel, x, y: 0, z: 0.5, rotation: 0, inclinacao: [0, 0], mirrored: false, values, mark: '' } });
    add('j', JOELHO, 0, { DN: 25 });
    add('r', LUVA_RED, 0.2, { COD: 451 });
    if (comTubo) {
      add('t', SOL, 0.1, { DN: 25, L: 50 });
      store.exec({ type: 'connectComponents', a: 'j', ligacaoA: 'b', b: 't', ligacaoB: 'a' });
      store.exec({ type: 'connectComponents', a: 't', ligacaoA: 'b', b: 'r', ligacaoB: 'a' });
    } else store.exec({ type: 'connectComponents', a: 'j', ligacaoA: 'b', b: 'r', ligacaoB: 'a' });
    return diagnosticarRede(store.project);
  }
  const coladas = (d: ReturnType<typeof diagnosticarRede>) => d.filter((x) => x.codigo === 'conexoes_coladas');

  it('peças ligadas direto, sem tubo: acusa uma vez, com o tubo mínimo em `valor` e as duas instâncias', () => {
    const c = coladas(rede(false));
    expect(c).toHaveLength(1);
    expect(c[0]?.valor).toBe(10);
    expect([c[0]?.elementId, c[0]?.outroId].sort()).toEqual(['j', 'r']);
  });
  it('com tubo entre as duas peças: não acusa', () => {
    expect(coladas(rede(true))).toEqual([]);
  });
  it('par listado em `paresDiretos` do tipo: não acusa', () => {
    tipoSol.paresDiretos = [['curva90', 'reducao']];
    expect(coladas(rede(false))).toEqual([]);
  });
  it('o mínimo do tipo vai em `valor`', () => {
    tipoSol.trechoMinimoEntreConexoes = 25;
    expect(coladas(rede(false))[0]?.valor).toBe(25);
  });
});
