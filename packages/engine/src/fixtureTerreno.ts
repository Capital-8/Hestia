/**
 * Fixtures de referência do terreno (PLANO A.10): T1 a T9 e as regiões de T5, T6 e T7, como `Project`. Usadas pelos testes do adaptador, do WASM e das
 * fichas das vistas e da interface. Todas com `intervaloCurvas` 0,5 (T3 e T8, 1), `espessuraBase` 3 e sem `localizacao`; o nível é `lv_0`.
 * Montadas pelos comandos do modelo (`addTerrain`, `editTerrainFontes`, `addTerrainRegion`), como o app faria.
 */
import type { Vec2 } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeTerrain, makeTerrainRegion, type OpTerreno, type Project, type TerrainRegion } from '@hestia/model';

export const NOMES_FIXTURE_TERRENO = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9'] as const;
export type NomeFixtureTerreno = (typeof NOMES_FIXTURE_TERRENO)[number];

const v = (x: number, y: number): Vec2 => ({ x, y });

/** Id do terreno de uma fixture: `tn_t1` a `tn_t9`. */
export const idTerrenoFixture = (nome: NomeFixtureTerreno): string => `tn_${nome.toLowerCase()}`;
/** Id da região de T5, T6 e T7: `rg_t5`, `rg_t6`, `rg_t7`. */
export const idRegiaoFixture = (nome: 'T5' | 'T6' | 'T7'): string => `rg_${nome.toLowerCase()}`;

const cantos = (z: (x: number) => number): OpTerreno[] =>
  [
    [0, 0],
    [20, 0],
    [20, 20],
    [0, 20],
  ].map(([x, y]) => ({ op: 'addPonto', x: x!, y: y!, z: z(x!) }));

const rampa = (x: number): number => 10.25 + 0.1 * x;

/** Fontes de cada fixture como operações de `editTerrainFontes`, mais o intervalo das curvas. */
function fontes(nome: NomeFixtureTerreno): { ops: OpTerreno[]; intervalo: number } {
  switch (nome) {
    case 'T1':
    case 'T5':
    case 'T6':
      return { ops: cantos(() => 10), intervalo: 0.5 };
    case 'T2':
    case 'T7':
      return { ops: cantos(rampa), intervalo: 0.5 };
    case 'T3':
      return { ops: [...cantos(() => 0), { op: 'addPonto', x: 10, y: 10, z: 5 }], intervalo: 1 };
    case 'T4':
      return { ops: [...cantos(() => 2), { op: 'addQuebra', xyz: [10, 0, 0, 10, 20, 0] }], intervalo: 0.5 };
    case 'T8':
      return { ops: [...cantos(() => 0), { op: 'addPonto', x: 10, y: 10, z: 5 }, { op: 'setBorda', xy: [5, 5, 15, 5, 15, 15, 5, 15] }], intervalo: 1 };
    case 'T9':
      return { ops: [...cantos(() => 10), { op: 'addQuebra', xyz: [5, 5, 10, 15, 15, 10] }, { op: 'addQuebra', xyz: [5, 15, 10, 15, 5, 10] }], intervalo: 0.5 };
  }
}

/** Região de T5 (plataforma, cota 8, taludes 0), T6 (nivelada, cota 8, talude de corte 1) e T7 (plataforma, cota 12,25, taludes 0); as demais não têm. */
export function regiaoDaFixture(nome: NomeFixtureTerreno): Omit<TerrainRegion, 'order'> | null {
  const quadrado = [v(5, 5), v(15, 5), v(15, 15), v(5, 15)];
  if (nome === 'T5') return makeTerrainRegion({ id: idRegiaoFixture('T5'), levelId: 'lv_0', terrenoId: idTerrenoFixture('T5'), name: 'Plataforma', contorno: quadrado, papel: 'plataforma', cota: 8 });
  if (nome === 'T6') {
    return makeTerrainRegion({ id: idRegiaoFixture('T6'), levelId: 'lv_0', terrenoId: idTerrenoFixture('T6'), name: 'Nivelada', contorno: quadrado, papel: 'nivelada', cota: 8, taludeCorte: 1 });
  }
  if (nome === 'T7') return makeTerrainRegion({ id: idRegiaoFixture('T7'), levelId: 'lv_0', terrenoId: idTerrenoFixture('T7'), name: 'Plataforma', contorno: quadrado, papel: 'plataforma', cota: 12.25 });
  return null;
}

/** Acrescenta a fixture `nome` (terreno e, se houver, a região) ao armazém. */
export function adicionarFixtureTerreno(s: ProjectStore, nome: NomeFixtureTerreno): void {
  const { ops, intervalo } = fontes(nome);
  const id = idTerrenoFixture(nome);
  s.exec({ type: 'addTerrain', terrain: makeTerrain({ id, levelId: 'lv_0', name: nome, intervaloCurvas: intervalo }) });
  s.exec({ type: 'editTerrainFontes', terrenoId: id, ops });
  const r = regiaoDaFixture(nome);
  if (r) s.exec({ type: 'addTerrainRegion', regiao: r });
}

/** Projeto só com a fixture `nome` (T1 a T9). */
export function projetoTerreno(nome: NomeFixtureTerreno): Project {
  const s = new ProjectStore(createEmptyProject());
  adicionarFixtureTerreno(s, nome);
  return s.project;
}

/** Projeto com T1 a T9 juntos (terrenos sobrepostos em planta; os ids numéricos seguem a ordem de criação). */
export function projetoTerrenos(): Project {
  const s = new ProjectStore(createEmptyProject());
  for (const nome of NOMES_FIXTURE_TERRENO) adicionarFixtureTerreno(s, nome);
  return s.project;
}
