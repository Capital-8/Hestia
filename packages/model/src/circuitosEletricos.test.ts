import { describe, expect, it } from 'vitest';
import { applyCommand as aplicarNoLugar, type Command } from './commands.ts';
import {
  apagarCircuito,
  atribuirPonto,
  atualizarCircuito,
  circuitoDoComponente,
  criarCircuito,
  limparExcluidos,
  moverCircuito,
  proximaCorCircuito,
  proximoIdCircuito,
  proximoNomeCircuito,
  removerPonto,
  renomearCircuito,
  totaisPorQuadro,
  totalDoCircuito,
  vaDoPonto,
  type CircuitoEletrico,
  type MapaCircuitos,
} from './circuitosEletricos.ts';
import { consultarCircuitos, coresPorComponente, corDoComponente, listarQuadros, validarCircuitos } from './circuitosEletricosConsulta.ts';
import { createEmptyProject } from './defaults.ts';
import { ID_QUADRO_ELETRICO, FAMILIA_QUADRO_ELETRICO, familiaDaBiblioteca } from './familia/index.ts';
import { ProjectStore } from './history.ts';
import { migrateProject } from './migrate.ts';
import type { Component, Project } from './types.ts';

const circ = (id: string, nome: string, extra: Partial<CircuitoEletrico> = {}): CircuitoEletrico => ({ id, nome, tipo: 'iluminacao', tensao: 127, pontos: [], cor: '#d9480f', ...extra });
const vazio: MapaCircuitos = {};

describe('operações puras de circuito', () => {
  it('cria circuito e recusa id repetido, nome repetido (sem diferenciar caixa) e dados inválidos', () => {
    const m = criarCircuito(vazio, circ('a', 'C1'));
    expect(Object.keys(m)).toEqual(['a']);
    expect(() => criarCircuito(m, circ('a', 'C2'))).toThrow(/id/);
    expect(() => criarCircuito(m, circ('b', 'c1'))).toThrow(/chamado/);
    expect(() => criarCircuito(vazio, circ('b', ' '))).toThrow(/nome/);
    expect(() => criarCircuito(vazio, circ('b', 'C2', { tensao: 0 }))).toThrow(/tensão/);
    expect(() => criarCircuito(vazio, circ('b', 'C2', { cor: 'vermelho' }))).toThrow(/cor/);
    expect(() => criarCircuito(vazio, circ('b', 'C2', { tipo: 'x' as never }))).toThrow(/Tipo/);
  });
  it('não altera o mapa de entrada', () => {
    const m = criarCircuito(vazio, circ('a', 'C1'));
    const copia = structuredClone(m);
    atribuirPonto(m, 'a', { componenteId: 'x', potenciaVA: 100 });
    renomearCircuito(m, 'a', 'Novo');
    expect(m).toEqual(copia);
  });
  it('renomeia, recusa nome de outro circuito e aceita o próprio nome', () => {
    let m = criarCircuito(vazio, circ('a', 'C1'));
    m = criarCircuito(m, circ('b', 'C2'));
    expect(renomearCircuito(m, 'a', 'Sala').a!.nome).toBe('Sala');
    expect(() => renomearCircuito(m, 'a', 'C2')).toThrow(/chamado/);
    expect(renomearCircuito(m, 'a', 'c1').a!.nome).toBe('c1');
    expect(() => renomearCircuito(m, 'z', 'X')).toThrow(/inexistente/);
  });
  it('atualiza tipo, tensão, cor e notas, e apaga as notas com texto vazio', () => {
    let m = criarCircuito(vazio, circ('a', 'C1'));
    m = atualizarCircuito(m, 'a', { tipo: 'tomadas_uso_geral', tensao: 220, cor: '#1c7ed6', notas: 'cozinha' });
    expect(m.a).toMatchObject({ tipo: 'tomadas_uso_geral', tensao: 220, cor: '#1c7ed6', notas: 'cozinha' });
    expect(atualizarCircuito(m, 'a', { notas: '  ' }).a!.notas).toBeUndefined();
    expect(() => atualizarCircuito(m, 'a', { tensao: -1 })).toThrow();
  });
  it('apaga o circuito e recusa apagar o que não existe', () => {
    const m = criarCircuito(vazio, circ('a', 'C1'));
    expect(apagarCircuito(m, 'a')).toEqual({});
    expect(() => apagarCircuito(m, 'b')).toThrow(/inexistente/);
  });
  it('atribui ponto; repetir no mesmo circuito atualiza a potência sem duplicar', () => {
    let m = criarCircuito(vazio, circ('a', 'C1'));
    m = atribuirPonto(m, 'a', { componenteId: 'x', potenciaVA: 100 });
    m = atribuirPonto(m, 'a', { componenteId: 'x', potenciaVA: 250, fator: 0.5 });
    expect(m.a!.pontos).toEqual([{ componenteId: 'x', potenciaVA: 250, fator: 0.5 }]);
  });
  it('um ponto pertence a no máximo um circuito: atribuir a outro tira do primeiro', () => {
    let m = criarCircuito(vazio, circ('a', 'C1'));
    m = criarCircuito(m, circ('b', 'C2'));
    m = atribuirPonto(m, 'a', { componenteId: 'x', potenciaVA: 100 });
    m = atribuirPonto(m, 'b', { componenteId: 'x', potenciaVA: 60 });
    expect(m.a!.pontos).toHaveLength(0);
    expect(m.b!.pontos).toHaveLength(1);
    expect(circuitoDoComponente(m, 'x')?.id).toBe('b');
  });
  it('recusa ponto com potência negativa, não numérica ou fator inválido', () => {
    const m = criarCircuito(vazio, circ('a', 'C1'));
    expect(() => atribuirPonto(m, 'a', { componenteId: 'x', potenciaVA: -1 })).toThrow(/potência/);
    expect(() => atribuirPonto(m, 'a', { componenteId: 'x', potenciaVA: NaN })).toThrow(/potência/);
    expect(() => atribuirPonto(m, 'a', { componenteId: 'x', potenciaVA: 1, fator: -2 })).toThrow(/fator/);
    expect(() => atribuirPonto(m, 'zz', { componenteId: 'x', potenciaVA: 1 })).toThrow(/inexistente/);
  });
  it('remove ponto e ignora componente que não está em circuito', () => {
    let m = criarCircuito(vazio, circ('a', 'C1', { pontos: [{ componenteId: 'x', potenciaVA: 1 }] }));
    expect(removerPonto(m, 'x').a!.pontos).toEqual([]);
    expect(removerPonto(m, 'nada')).toEqual(m);
    m = removerPonto(m, 'x');
    expect(circuitoDoComponente(m, 'x')).toBeUndefined();
  });
  it('criar com pontos iniciais recusa componente repetido ou já em outro circuito', () => {
    const m = criarCircuito(vazio, circ('a', 'C1', { pontos: [{ componenteId: 'x', potenciaVA: 1 }] }));
    expect(() => criarCircuito(m, circ('b', 'C2', { pontos: [{ componenteId: 'x', potenciaVA: 1 }] }))).toThrow(/já pertence/);
    expect(() => criarCircuito(vazio, circ('b', 'C2', { pontos: [{ componenteId: 'y', potenciaVA: 1 }, { componenteId: 'y', potenciaVA: 2 }] }))).toThrow(/já pertence/);
  });
  it('move circuito entre quadros e o solta com undefined', () => {
    let m = criarCircuito(vazio, circ('a', 'C1', { quadroId: 'q1' }));
    m = moverCircuito(m, 'a', 'q2');
    expect(m.a!.quadroId).toBe('q2');
    expect(moverCircuito(m, 'a', undefined).a!.quadroId).toBeUndefined();
    expect('quadroId' in moverCircuito(m, 'a', undefined).a!).toBe(false);
  });
  it('total do circuito soma potência × fator (fator ausente = 1)', () => {
    expect(vaDoPonto({ componenteId: 'x', potenciaVA: 200 })).toBe(200);
    expect(vaDoPonto({ componenteId: 'x', potenciaVA: 200, fator: 0.5 })).toBe(100);
    expect(totalDoCircuito({ pontos: [{ componenteId: 'x', potenciaVA: 200 }, { componenteId: 'y', potenciaVA: 100, fator: 0.5 }] })).toBe(250);
    expect(totalDoCircuito({ pontos: [] })).toBe(0);
  });
  it('total por quadro agrupa circuitos e põe os sem quadro na chave vazia', () => {
    let m = criarCircuito(vazio, circ('a', 'C1', { quadroId: 'q1', pontos: [{ componenteId: 'x', potenciaVA: 100 }] }));
    m = criarCircuito(m, circ('b', 'C2', { quadroId: 'q1', pontos: [{ componenteId: 'y', potenciaVA: 50 }] }));
    m = criarCircuito(m, circ('c', 'C3', { pontos: [{ componenteId: 'z', potenciaVA: 7 }] }));
    expect(totaisPorQuadro(m)).toEqual({ q1: 150, '': 7 });
  });
  it('sugere nome, id e cor livres', () => {
    let m = criarCircuito(vazio, circ('cir_1', 'C1', { cor: '#d9480f' }));
    m = criarCircuito(m, circ('cir_3', 'C3', { cor: '#1c7ed6' }));
    expect(proximoNomeCircuito(m)).toBe('C2');
    expect(m[proximoIdCircuito(m)]).toBeUndefined();
    expect(['#d9480f', '#1c7ed6']).not.toContain(proximaCorCircuito(m));
  });
  it('limparExcluidos tira pontos e solta o quadro excluído', () => {
    const m = criarCircuito(vazio, circ('a', 'C1', { quadroId: 'q1', pontos: [{ componenteId: 'x', potenciaVA: 1 }, { componenteId: 'y', potenciaVA: 2 }] }));
    const r = limparExcluidos(m, new Set(['x', 'q1']));
    expect(r.a!.pontos).toEqual([{ componenteId: 'y', potenciaVA: 2 }]);
    expect(r.a!.quadroId).toBeUndefined();
  });
});

const aplicar = (p: Project, c: Command): Project => {
  const q = structuredClone(p);
  aplicarNoLugar(q, c);
  return q;
};
const comp = (id: string, familyId: string, typeId: string, extra: Partial<Component> = {}): Omit<Component, 'order'> => ({ id, kind: 'component', familyId, typeId, levelId: 'lv_0', x: 0, y: 0, z: 0, rotation: 0, mirrored: false, mark: id, ...extra });

function projetoBase(): Project {
  let p = createEmptyProject('t');
  for (const fid of [ID_QUADRO_ELETRICO, 'fam_tomada', 'fam_interruptor', 'fam_luminaria_teto']) {
    const f = familiaDaBiblioteca(fid)!;
    p = aplicar(p, { type: 'upsertFamily', family: structuredClone(f) });
  }
  p = aplicar(p, { type: 'addComponent', component: comp('qd1', ID_QUADRO_ELETRICO, 'dn25') });
  p = aplicar(p, { type: 'addComponent', component: comp('qd2', ID_QUADRO_ELETRICO, 'dn25', { values: { posicoes: 1 } }) });
  p = aplicar(p, { type: 'addComponent', component: comp('t1', 'fam_tomada', familiaDaBiblioteca('fam_tomada')!.tipos[0]!.id) });
  p = aplicar(p, { type: 'addComponent', component: comp('i1', 'fam_interruptor', familiaDaBiblioteca('fam_interruptor')!.tipos[0]!.id) });
  p = aplicar(p, { type: 'addComponent', component: comp('l1', 'fam_luminaria_teto', familiaDaBiblioteca('fam_luminaria_teto')!.tipos[0]!.id) });
  return p;
}

describe('comandos e consulta no projeto', () => {
  it('fluxo completo: cria circuitos, atribui pontos e consulta os totais', () => {
    let p = projetoBase();
    p = aplicar(p, { type: 'addCircuitoEletrico', circuito: circ('c1', 'C1', { quadroId: 'qd1' }) });
    p = aplicar(p, { type: 'addCircuitoEletrico', circuito: circ('c2', 'C2', { tipo: 'tomadas_uso_geral', quadroId: 'qd1' }) });
    p = aplicar(p, { type: 'assignPontoCircuito', circuitoId: 'c1', ponto: { componenteId: 'l1', potenciaVA: 100 } });
    p = aplicar(p, { type: 'assignPontoCircuito', circuitoId: 'c2', ponto: { componenteId: 't1', potenciaVA: 600 } });
    const r = consultarCircuitos(p);
    expect(r.circuitos.map((c) => [c.nome, c.totalVA])).toEqual([['C1', 100], ['C2', 600]]);
    expect(r.quadros.find((q) => q.id === 'qd1')).toMatchObject({ totalVA: 700, circuitos: ['c1', 'c2'], posicoes: 12 });
    expect(r.semQuadroVA).toBe(0);
  });
  it('ponto cujo componente sumiu é removido na consulta e não entra no total', () => {
    let p = projetoBase();
    p = aplicar(p, { type: 'addCircuitoEletrico', circuito: circ('c1', 'C1', { quadroId: 'qd1', pontos: [{ componenteId: 'l1', potenciaVA: 100 }, { componenteId: 'fantasma', potenciaVA: 900 }] }) });
    const c = consultarCircuitos(p).circuitos[0]!;
    expect(c.pontos.map((x) => x.componenteId)).toEqual(['l1']);
    expect(c.totalVA).toBe(100);
    expect(c.removidos).toBe(1);
    expect(validarCircuitos(p).map((x) => x.codigo)).toContain('ponto_orfao');
    expect(coresPorComponente(p).has('fantasma')).toBe(false);
  });
  it('validação aponta circuito sem quadro, quadro inexistente, vazio e quadro sem posição', () => {
    let p = projetoBase();
    p = aplicar(p, { type: 'addCircuitoEletrico', circuito: circ('c1', 'C1') });
    expect(validarCircuitos(p).map((x) => x.codigo)).toEqual(['circuito_sem_quadro', 'circuito_vazio']);
    p = aplicar(p, { type: 'moveCircuitoEletrico', id: 'c1', quadroId: 'qd2' });
    p = aplicar(p, { type: 'addCircuitoEletrico', circuito: circ('c2', 'C2', { quadroId: 'qd2', pontos: [{ componenteId: 'l1', potenciaVA: 1 }] }) });
    expect(validarCircuitos(p).map((x) => x.codigo)).toContain('quadro_sem_posicao');
    const q = structuredClone(p);
    q.circuitosEletricos!.c2!.quadroId = 'nao_existe';
    expect(validarCircuitos(q).map((x) => x.codigo)).toContain('quadro_inexistente');
  });
  it('comandos recusam quadro que não é quadro e componente inexistente (projeto fica como estava)', () => {
    let p = projetoBase();
    expect(() => aplicar(p, { type: 'addCircuitoEletrico', circuito: circ('c1', 'C1', { quadroId: 't1' }) })).toThrow(/quadro/);
    p = aplicar(p, { type: 'addCircuitoEletrico', circuito: circ('c1', 'C1') });
    expect(() => aplicar(p, { type: 'assignPontoCircuito', circuitoId: 'c1', ponto: { componenteId: 'nada', potenciaVA: 1 } })).toThrow(/inexistente/);
    expect(() => aplicar(p, { type: 'moveCircuitoEletrico', id: 'c1', quadroId: 'l1' })).toThrow(/quadro/);
  });
  it('mover circuito entre quadros muda os totais por quadro', () => {
    let p = projetoBase();
    p = aplicar(p, { type: 'addCircuitoEletrico', circuito: circ('c1', 'C1', { quadroId: 'qd1', pontos: [{ componenteId: 'l1', potenciaVA: 80 }] }) });
    p = aplicar(p, { type: 'moveCircuitoEletrico', id: 'c1', quadroId: 'qd2' });
    const q = consultarCircuitos(p).quadros;
    expect(q.find((x) => x.id === 'qd1')!.totalVA).toBe(0);
    expect(q.find((x) => x.id === 'qd2')!.totalVA).toBe(80);
  });
  it('nomes de quadro: automáticos (QD n) e renomeados; só vale em componente-quadro', () => {
    let p = projetoBase();
    expect(listarQuadros(p).map((q) => q.nome)).toEqual(['QD 1', 'QD 2']);
    p = aplicar(p, { type: 'renameQuadroEletrico', id: 'qd2', nome: ' Quadro geral ' });
    expect(listarQuadros(p).map((q) => q.nome)).toEqual(['QD 1', 'Quadro geral']);
    expect(() => aplicar(p, { type: 'renameQuadroEletrico', id: 't1', nome: 'x' })).toThrow(/quadro/);
    expect(() => aplicar(p, { type: 'renameQuadroEletrico', id: 'qd1', nome: ' ' })).toThrow(/nome/);
  });
  it('excluir o componente tira o ponto do circuito e excluir o quadro solta o circuito', () => {
    let p = projetoBase();
    p = aplicar(p, { type: 'addCircuitoEletrico', circuito: circ('c1', 'C1', { quadroId: 'qd1', pontos: [{ componenteId: 'l1', potenciaVA: 80 }, { componenteId: 't1', potenciaVA: 5 }] }) });
    p = aplicar(p, { type: 'renameQuadroEletrico', id: 'qd1', nome: 'Geral' });
    p = aplicar(p, { type: 'deleteElements', ids: ['l1', 'qd1'] } as Command);
    expect(p.circuitosEletricos!.c1!.pontos.map((x) => x.componenteId)).toEqual(['t1']);
    expect(p.circuitosEletricos!.c1!.quadroId).toBeUndefined();
    expect(p.quadrosEletricos).toEqual({});
  });
  it('cor por componente vem do circuito', () => {
    let p = projetoBase();
    p = aplicar(p, { type: 'addCircuitoEletrico', circuito: circ('c1', 'C1', { cor: '#2f9e44', quadroId: 'qd1', pontos: [{ componenteId: 'i1', potenciaVA: 0 }] }) });
    expect(corDoComponente(p, 'i1')).toBe('#2f9e44');
    expect(corDoComponente(p, 't1')).toBeUndefined();
    expect([...coresPorComponente(p).entries()]).toEqual([['i1', '#2f9e44']]);
  });
  it('desfazer e refazer pelo histórico, com rótulo', () => {
    const store = new ProjectStore(projetoBase());
    store.exec({ type: 'addCircuitoEletrico', circuito: circ('c1', 'C1', { quadroId: 'qd1' }) });
    expect(Object.keys(store.project.circuitosEletricos ?? {})).toEqual(['c1']);
    expect(store.undoLabel).toBe('Criar circuito');
    store.undo();
    expect(store.project.circuitosEletricos ?? {}).toEqual({});
    store.redo();
    expect(Object.keys(store.project.circuitosEletricos ?? {})).toEqual(['c1']);
  });
  it('projeto antigo (sem os campos) continua válido e a consulta devolve vazio', () => {
    const p = projetoBase();
    expect('circuitosEletricos' in p).toBe(false);
    const r = consultarCircuitos(p);
    expect(r.circuitos).toEqual([]);
    expect(validarCircuitos(p)).toEqual([]);
  });
  it('ida e volta pelo JSON e pela migração preserva circuitos e nomes de quadro', () => {
    let p = projetoBase();
    p = aplicar(p, { type: 'addCircuitoEletrico', circuito: circ('c1', 'C1', { quadroId: 'qd1', notas: 'n', pontos: [{ componenteId: 'l1', potenciaVA: 90, fator: 0.8 }] }) });
    p = aplicar(p, { type: 'renameQuadroEletrico', id: 'qd1', nome: 'Geral' });
    const volta = migrateProject(JSON.parse(JSON.stringify(p)));
    expect(volta.circuitosEletricos).toEqual(p.circuitosEletricos);
    expect(volta.quadrosEletricos).toEqual(p.quadrosEletricos);
  });
  it('a família do quadro fica na categoria elétrica da paleta', () => {
    expect(FAMILIA_QUADRO_ELETRICO.categoria).toBe('dispositivo_eletrico');
  });
});
