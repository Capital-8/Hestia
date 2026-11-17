import { servicoMassa, type ServicoMassa } from '@hestia/engine';
import type { IfcMassaGeo } from '@hestia/io';
import { isMass, type Id, type Project } from '@hestia/model';

/** Só o que a exportação lê do serviço da massa (os testes injetam um simulado). */
export type FonteMassaIfc = Pick<ServicoMassa, 'pronto' | 'malha' | 'quantidades'>;

/**
 * Massas do projeto para o IFC (plano de massa, ficha X1): a malha `lod 2` de `massa_malha` (todas as cópias do arranjo, cada uma uma casca) e as
 * quantidades de `quant_massa`, por massa. Sem kernel pronto, sem nenhuma massa, ou com erro dele, devolve `undefined`: a massa não sai no IFC e o
 * exportador registra o aviso (nenhum caminho TS gera a geometria da massa, A.5). Massa que o kernel não devolve (inválida) também fica de fora.
 */
export function massesOf(p: Project, fonte: FonteMassaIfc = servicoMassa()): IfcMassaGeo[] | undefined {
  if (!Object.values(p.elements).some(isMass) || !fonte.pronto()) return undefined;
  const malha = fonte.malha(p, null, 2);
  if (!malha) return undefined;
  const quant = new Map((fonte.quantidades(p, null) ?? []).map((q) => [q.massaId, q] as const));
  // Os grupos vêm por massa e cópia; cada grupo é um trecho de `indices` (índices absolutos em `vertices`), então a malha da massa é a soma dos trechos.
  const indices = new Map<Id, number[]>();
  const copias = new Map<Id, Set<number>>();
  for (const g of malha.grupos) {
    const lista = indices.get(g.massaId) ?? [];
    for (let k = g.primeiro; k < g.primeiro + g.n; k++) lista.push(malha.indices[k]!);
    indices.set(g.massaId, lista);
    copias.set(g.massaId, (copias.get(g.massaId) ?? new Set<number>()).add(g.copia));
  }
  const out: IfcMassaGeo[] = [];
  for (const [massaId, idx] of indices) {
    // Só os vértices que a massa usa, renumerados: a malha do kernel é do projeto inteiro.
    const novo = new Map<number, number>();
    const positions: number[] = [];
    const indices2 = idx.map((i) => {
      let n = novo.get(i);
      if (n === undefined) {
        n = novo.size;
        novo.set(i, n);
        positions.push(malha.vertices[3 * i]!, malha.vertices[3 * i + 1]!, malha.vertices[3 * i + 2]!);
      }
      return n;
    });
    const q = quant.get(massaId);
    out.push({
      massaId,
      mesh: { positions, indices: indices2 },
      copias: copias.get(massaId)?.size ?? 1,
      ...(q ? { quantidades: { volume: q.volume, areaLateral: q.areaLateral, areaBase: q.areaBase, areaTopo: q.areaTopo, altura: q.altura } } : {}),
    });
  }
  return out.length > 0 ? out : undefined;
}
