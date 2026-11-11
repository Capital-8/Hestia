/**
 * Conversão da saída do Rust da fatia B para os MESMOS tipos do TypeScript (`ResolvedFloor`, `ResolvedSlab`, `JunctionLevel`), decisão 0050, B5.
 * Extraída de `kernelDespachoB.ts` para o arquivo caber no limite de linhas; não há política aqui, só tradução.
 */
import type { Id, Project, Slab } from '@hestia/model';
import type { ResolvedFloor, ResolvedFloorLayer } from './floors.ts';
import type { ElementJunction, JunctionLevel, WallJunction } from './junctionLevel.ts';
import type { ResolvedPrism } from './junctionPlanar.ts';
import type { ResolvedSlab, ResolvedSlabLayer } from './slabs.ts';
import type { CenaA1 } from './kernelA1.ts';
import type { CamadaB1, CenaB1, ElementoB1 } from './kernelB.ts';
import { TIPO_B3, type JuncaoB3 } from './kernelB3.ts';
import { bandKey } from './junctionLevel.ts';
import type { OutlineProblem } from './outlineBound.ts';

export const inverso = <V>(m: ReadonlyMap<V, number>): Map<number, V> => new Map([...m].map(([k, n]) => [n, k] as const));

const PROBLEMAS: ReadonlyArray<OutlineProblem | null> = [null, 'aberto', 'fora'];

function numeroParaId(m: ReadonlyMap<number, Id>, n: number, o: string): Id {
  const id = m.get(n);
  if (id === undefined) throw new Error(`${o} ${n} da saída do Rust não existe no projeto`);
  return id;
}

/** O que a conversão precisa da cena que gerou a saída (guardado junto dela: a cena é substituída a cada edição do projeto). */
export interface MapasB {
  b: CenaB1;
  a1: CenaA1;
}

function camada(c: CamadaB1, material: ReadonlyMap<number, Id>): ResolvedFloorLayer & ResolvedSlabLayer {
  return {
    layerIndex: c.indice,
    materialId: numeroParaId(material, c.material, 'material'),
    z0: c.z0,
    z1: c.z1,
    priority: c.prioridade,
    core: c.nucleo,
    membrane: c.membrana,
    explicit: c.explicita,
    venceParede: c.venceParede,
    polygon: c.poligono,
  };
}

/** `ElementoB1` do Rust -> `ResolvedFloor` e `ResolvedSlab` do nível, na mesma ordem (pisos e depois lajes) e com os mesmos campos do TypeScript. */
export function converterPisosELajes(p: Project, levelId: Id, el: readonly ElementoB1[], m: MapasB): { pisos: ResolvedFloor[]; lajes: ResolvedSlab[] } {
  const piso = inverso(m.b.pisoDe);
  const laje = inverso(m.b.lajeDe);
  const tipoPiso = inverso(m.b.tipoPisoDe);
  const tipoLaje = inverso(m.b.tipoLajeDe);
  const material = inverso(m.b.materialDe);
  const pisos: ResolvedFloor[] = [];
  const lajes: ResolvedSlab[] = [];
  for (const e of el) {
    const base = {
      levelId,
      polygon: e.poligono,
      topZ: e.topoZ,
      bottomZ: e.baseZ,
      problem: PROBLEMAS[e.problema] ?? null,
    };
    const layers = e.camadas.map((c) => camada(c, material));
    if (e.laje) {
      const slabId = numeroParaId(laje, e.id, 'laje');
      const s = p.elements[slabId] as Slab;
      lajes.push({ slabId, typeId: numeroParaId(tipoLaje, e.tipo, 'tipo de laje'), ...base, slope: s.slope, layers });
    } else {
      pisos.push({ floorId: numeroParaId(piso, e.id, 'piso'), typeId: numeroParaId(tipoPiso, e.tipo, 'tipo de piso'), ...base, layers });
    }
  }
  return { pisos, lajes };
}

/** `JuncaoB3` do Rust -> `JunctionLevel` (o inverso de `referenciaB3De`; os cortadores não voltam: `levelCutterSet` segue no TypeScript). */
export function converterJuncao(levelId: Id, j: JuncaoB3, m: MapasB): JunctionLevel {
  const piso = inverso(m.b.pisoDe);
  const laje = inverso(m.b.lajeDe);
  const parede = inverso(m.a1.idDe);
  const prismas = (ps: ReadonlyArray<{ poligono: ResolvedPrism['poly']; z0: number; z1: number }>): ResolvedPrism[] => ps.map((x) => ({ poly: x.poligono, z0: x.z0, z1: x.z1 }));
  const elements = new Map<Id, ElementJunction>();
  for (const e of j.elementos) {
    const id = e.tipo === TIPO_B3.floor ? numeroParaId(piso, e.dono, 'piso') : numeroParaId(laje, e.dono, 'laje');
    elements.set(id, { cut: e.corte, layers: e.camadas.map((c) => ({ layerIndex: c.camada, parts: prismas(c.partes) })), region: e.regiao });
  }
  const walls = new Map<Id, WallJunction>();
  for (const w of j.paredes) {
    walls.set(numeroParaId(parede, w.parede, 'parede'), { cut: w.corte, bands: new Map(w.faixas.map((f) => [bandKey(f.camada, f.banda), prismas(f.partes)] as const)) });
  }
  return { levelId, elements, walls };
}
