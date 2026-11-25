import { consultarCircuitos, createEmptyProject, familiaDaBiblioteca, ID_QUADRO_ELETRICO, ProjectStore, type Component, type Project } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { apagarCircuitoPorId, atribuirSelecionados, definirPotencia, mudarCor, mudarQuadro, mudarTipo, novoCircuito, renomear, renomearQuadro, textoVA, tentarAcao, tirarPonto } from './circuitosAcoes.ts';

/*
 * Ações do painel Circuitos (ficha C4), sobre um ProjectStore real: criar, atribuir a seleção, potência por ponto, quadros,
 * totais, erros do modelo e passo único de desfazer.
 */
const comp = (id: string, familyId: string, typeId: string): Omit<Component, 'order'> => ({ id, kind: 'component', familyId, typeId, levelId: 'lv_0', x: 0, y: 0, z: 0, rotation: 0, mirrored: false, mark: id });

function loja(quadros = 1): ProjectStore {
  const s = new ProjectStore(createEmptyProject('t') as Project);
  for (const fid of [ID_QUADRO_ELETRICO, 'fam_tomada', 'fam_interruptor', 'fam_luminaria_teto']) s.exec({ type: 'upsertFamily', family: structuredClone(familiaDaBiblioteca(fid)!) });
  for (let i = 1; i <= quadros; i++) s.exec({ type: 'addComponent', component: comp(`qd${i}`, ID_QUADRO_ELETRICO, 'dn25') });
  for (const [id, f] of [['t1', 'fam_tomada'], ['i1', 'fam_interruptor'], ['l1', 'fam_luminaria_teto']] as const) s.exec({ type: 'addComponent', component: comp(id, f, familiaDaBiblioteca(f)!.tipos[0]!.id) });
  return s;
}

describe('painel Circuitos: ações', () => {
  it('novo circuito: nome C1, C2..., cor distinta e quadro único do projeto escolhido sozinho', () => {
    const s = loja();
    const a = novoCircuito(s);
    const b = novoCircuito(s);
    const cs = s.project.circuitosEletricos!;
    expect([cs[a]!.nome, cs[b]!.nome]).toEqual(['C1', 'C2']);
    expect(cs[a]!.cor).not.toBe(cs[b]!.cor);
    expect(cs[a]!.quadroId).toBe('qd1');
  });
  it('com dois quadros o circuito novo nasce sem quadro, e o quadro pode ser dado ou trocado', () => {
    const s = loja(2);
    const a = novoCircuito(s);
    expect(s.project.circuitosEletricos![a]!.quadroId).toBeUndefined();
    mudarQuadro(s, a, 'qd2');
    expect(s.project.circuitosEletricos![a]!.quadroId).toBe('qd2');
    const b = novoCircuito(s, 'qd1');
    expect(s.project.circuitosEletricos![b]!.quadroId).toBe('qd1');
    mudarQuadro(s, a, undefined);
    expect(s.project.circuitosEletricos![a]!.quadroId).toBeUndefined();
  });
  it('atribui os componentes selecionados, ignora quadro e ids que não são componente', () => {
    const s = loja();
    const c = novoCircuito(s);
    const r = atribuirSelecionados(s, c, ['t1', 'i1', 'qd1', 'nada'], 150);
    expect(r).toEqual({ atribuidos: 2, ignorados: 2 });
    expect(s.project.circuitosEletricos![c]!.pontos.map((p) => [p.componenteId, p.potenciaVA])).toEqual([['t1', 150], ['i1', 150]]);
  });
  it('atribuir vários pontos é um único passo de desfazer', () => {
    const s = loja();
    const c = novoCircuito(s);
    atribuirSelecionados(s, c, ['t1', 'i1', 'l1'], 100);
    s.undo();
    expect(s.project.circuitosEletricos![c]!.pontos).toEqual([]);
  });
  it('seleção sem componente elétrico não altera nada', () => {
    const s = loja();
    const c = novoCircuito(s);
    expect(atribuirSelecionados(s, c, [], 100)).toEqual({ atribuidos: 0, ignorados: 0 });
    expect(atribuirSelecionados(s, c, ['qd1'], 100)).toEqual({ atribuidos: 0, ignorados: 1 });
  });
  it('potência por ponto muda o total do circuito e do quadro', () => {
    const s = loja();
    const c = novoCircuito(s);
    atribuirSelecionados(s, c, ['t1', 'l1'], 100);
    definirPotencia(s, c, { componenteId: 't1', potenciaVA: 600 });
    definirPotencia(s, c, { componenteId: 'l1', potenciaVA: 100, fator: 0.5 });
    const r = consultarCircuitos(s.project);
    expect(r.circuitos[0]!.totalVA).toBe(650);
    expect(r.quadros[0]!.totalVA).toBe(650);
  });
  it('atribuir o mesmo ponto a outro circuito o tira do primeiro', () => {
    const s = loja();
    const a = novoCircuito(s);
    const b = novoCircuito(s);
    atribuirSelecionados(s, a, ['t1'], 100);
    atribuirSelecionados(s, b, ['t1'], 200);
    const r = consultarCircuitos(s.project);
    expect(r.circuitos.map((c) => c.pontos.length)).toEqual([0, 1]);
    expect(r.quadros[0]!.totalVA).toBe(200);
  });
  it('tirar ponto, renomear, tipo, cor, quadro e apagar usam comandos do modelo', () => {
    const s = loja();
    const c = novoCircuito(s);
    atribuirSelecionados(s, c, ['t1'], 100);
    renomear(s, c, 'Sala');
    mudarTipo(s, c, 'tomadas_uso_geral');
    mudarCor(s, c, '#112233');
    renomearQuadro(s, 'qd1', 'QD-Geral');
    tirarPonto(s, 't1');
    expect(s.project.circuitosEletricos![c]).toMatchObject({ nome: 'Sala', tipo: 'tomadas_uso_geral', cor: '#112233', pontos: [] });
    expect(consultarCircuitos(s.project).quadros[0]!.nome).toBe('QD-Geral');
    apagarCircuitoPorId(s, c);
    expect(s.project.circuitosEletricos).toEqual({});
  });
  it('erro do modelo vira mensagem em português em vez de lançar', () => {
    const s = loja();
    const a = novoCircuito(s);
    const b = novoCircuito(s);
    expect(tentarAcao(() => renomear(s, b, s.project.circuitosEletricos![a]!.nome))).toMatch(/Já existe um circuito/);
    expect(tentarAcao(() => mudarQuadro(s, a, 't1'))).toMatch(/quadro/);
    expect(tentarAcao(() => undefined)).toBeNull();
  });
  it('textoVA: inteiro sem casas e uma casa com vírgula', () => {
    expect(textoVA(700)).toBe('700 VA');
    expect(textoVA(12.34)).toBe('12,3 VA');
    expect(textoVA(0)).toBe('0 VA');
  });
});
