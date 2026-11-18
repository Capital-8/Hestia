import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeTerrain, ProjectStore, TERRAIN_TYPES_DEFAULT, type Project } from '@hestia/model';
import { ServicoTerreno } from './kernelTerrenoServico.ts';

/** Nível "todos" do kernel (u32::MAX): usado quando a consulta não recebe um nível. */
const NIVEL_TODOS = 4294967295;

type Chamada = [string, unknown[]];

/** Projeto com terrenos tn1 e tn2; `tipos` são os tipos gravados e `usos` o tipo de cada terreno (ausente = sem tipo). */
function projeto(tipos: Record<string, Record<string, unknown>>, usos: Record<string, string>): Project {
  const s = new ProjectStore(createEmptyProject());
  const nivel = s.project.levels[0]!.id;
  for (const id of ['tn1', 'tn2']) s.exec({ type: 'addTerrain', terrain: makeTerrain({ id, levelId: nivel }) });
  for (const [id, extra] of Object.entries(tipos)) s.exec({ type: 'upsertTerrainType', tipo: { ...TERRAIN_TYPES_DEFAULT[0]!, id, ...extra } });
  for (const [terrenoId, tipoId] of Object.entries(usos)) s.exec({ type: 'updateTerrain', id: terrenoId, patch: { tipoId } });
  return s.project;
}

/**
 * Serviço com uma cena falsa: `preparar` não toca o kernel, `consultar` só anota a chamada e devolve listas vazias. Assim testa-se o que o
 * serviço PEDE ao kernel (consulta e tolerância) e a chave de memória, sem wasm.
 */
function servicoFalso(terrenos: [string, number][]): { srv: ServicoTerreno; chamadas: Chamada[]; memo: Map<string, unknown> } {
  const srv = new ServicoTerreno(() => null);
  const chamadas: Chamada[] = [];
  const interno = srv as unknown as { preparar: () => boolean; cena: unknown; atual: unknown; memo: Map<string, unknown> };
  interno.preparar = () => true;
  interno.cena = {
    consultar: (nome: string, args: unknown[]) => {
      chamadas.push([nome, args]);
      return { linhas: [], pontos: [], cotas: [] };
    },
  };
  interno.atual = { terrenoDe: new Map(terrenos), regiaoDe: new Map(), nivelDe: new Map() };
  return { srv, chamadas, memo: interno.memo };
}

describe('ServicoTerreno.curvas: tolerância por tipo', () => {
  it('sem tipo (projeto antigo): consulta com tolerância 0 (exatas)', () => {
    const { srv, chamadas } = servicoFalso([['tn1', 0]]);
    srv.curvas(projeto({}, {}));
    expect(chamadas).toEqual([['terreno_curvas', [NIVEL_TODOS, 1, 0]]]);
  });

  it('tipo suavizado sem tolerância gravada: consulta com 0,02', () => {
    const { srv, chamadas } = servicoFalso([['tn1', 0]]);
    srv.curvas(projeto({ tt_s: { suavizarCurvas: true } }, { tn1: 'tt_s' }));
    expect(chamadas).toEqual([['terreno_curvas', [NIVEL_TODOS, 1, 0.02]]]);
  });

  it('tipo suavizado com tolerância 0,005: consulta com 0,005', () => {
    const { srv, chamadas } = servicoFalso([['tn1', 0]]);
    srv.curvas(projeto({ tt_s: { suavizarCurvas: true, toleranciaSuavizacao: 0.005 } }, { tn1: 'tt_s' }));
    expect(chamadas).toEqual([['terreno_curvas', [NIVEL_TODOS, 1, 0.005]]]);
  });

  it('dois terrenos com tolerâncias diferentes: uma consulta por tolerância (0 e 0,005), cada uma com os seus', () => {
    const { srv, chamadas } = servicoFalso([['tn1', 0], ['tn2', 1]]);
    srv.curvas(projeto({ tt_s: { suavizarCurvas: true, toleranciaSuavizacao: 0.005 } }, { tn2: 'tt_s' }));
    expect(chamadas).toEqual([
      ['terreno_curvas', [NIVEL_TODOS, 1, 0]],
      ['terreno_curvas', [NIVEL_TODOS, 1, 0.005]],
    ]);
  });

  it('trocar a opção do tipo muda a chave de memória (exata -> suavizada -> exata)', () => {
    const { srv, chamadas, memo } = servicoFalso([['tn1', 0]]);
    srv.curvas(projeto({ tt_s: {} }, { tn1: 'tt_s' }));
    expect([...memo.keys()]).toEqual(['curvas|1|null|']);
    srv.curvas(projeto({ tt_s: { suavizarCurvas: true } }, { tn1: 'tt_s' }));
    expect([...memo.keys()]).toEqual(['curvas|1|null|', 'curvas|1|null|tn1=0.02']);
    // a volta à opção exata reencontra a chave já memorizada: nenhuma consulta nova
    srv.curvas(projeto({ tt_s: {} }, { tn1: 'tt_s' }));
    expect(chamadas.map((c) => c[1])).toEqual([
      [NIVEL_TODOS, 1, 0],
      [NIVEL_TODOS, 1, 0.02],
    ]);
  });
});
