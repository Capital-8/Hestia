import { isComponent, type Component, type Id, type Project } from '@hestia/model';
import { resolverComponente } from '../componentes/instancia.ts';
import { ligacaoNoMundo } from '../componentes/ligacoesEncaixe.ts';

/*
 * Comprimento do circuito pela REDE DE LIGAÇÕES (ficha C5): soma dos comprimentos dos trechos de eletroduto no caminho mais curto
 * entre o quadro e cada ponto; o do circuito é o do ponto mais distante. Ponto que a rede não alcança fica SEM comprimento (`null`):
 * nada é inventado. O comprimento de cada peça é a distância (m) entre as suas duas ligações de eletroduto no mundo, o que para uma
 * curva é a corda (um pouco menos que o arco). Caixas, quadros e dispositivos (categoria `dispositivo_eletrico`) valem zero.
 */

export interface ComprimentoDoCircuito {
  /** Comprimento (m) até o ponto mais distante ALCANÇADO; `null` se nenhum ponto é alcançado (ou não há quadro). */
  comprimentoM: number | null;
  /** Comprimento (m) até cada ponto; `null` = a rede não liga o quadro a ele. */
  porPonto: Record<Id, number | null>;
  /** Pontos que a rede não alcança. */
  semCaminho: Id[];
}

/** Comprimento (m) da peça: distância entre as duas primeiras ligações de eletroduto; 0 para dispositivos ou peça sem duas pontas. */
export function comprimentoDaPeca(p: Project, c: Component): number {
  if (p.componentFamilies?.[c.familyId]?.categoria === 'dispositivo_eletrico') return 0;
  const pontas = (resolverComponente(p, c).ligacoes ?? []).filter((l) => l.dominio === 'eletroduto').map((l) => ligacaoNoMundo(l, c).posicaoMundo);
  const [a, b] = pontas;
  return a && b ? Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) : 0;
}

/** Vizinhos por conexão gravada, nos dois sentidos (só instâncias que existem). */
function vizinhos(p: Project): Map<Id, Set<Id>> {
  const mapa = new Map<Id, Set<Id>>();
  const liga = (a: Id, b: Id): void => {
    const s = mapa.get(a) ?? new Set<Id>();
    s.add(b);
    mapa.set(a, s);
  };
  for (const e of Object.values(p.elements)) {
    if (!isComponent(e)) continue;
    for (const cx of Object.values(e.ligacoes ?? {})) {
      if (isComponent(p.elements[cx.componenteId])) {
        liga(e.id, cx.componenteId);
        liga(cx.componenteId, e.id);
      }
    }
  }
  return mapa;
}

/** Distâncias mínimas (m) a partir do quadro (Dijkstra; o custo é o comprimento da peça em que se entra). */
function distancias(p: Project, origem: Id): Map<Id, number> {
  const viz = vizinhos(p);
  const dist = new Map<Id, number>([[origem, 0]]);
  const abertos = new Set<Id>([origem]);
  while (abertos.size > 0) {
    let atual: Id | undefined;
    for (const id of abertos) if (atual === undefined || (dist.get(id) ?? Infinity) < (dist.get(atual) ?? Infinity)) atual = id;
    if (atual === undefined) break;
    abertos.delete(atual);
    for (const v of viz.get(atual) ?? []) {
      const e = p.elements[v];
      if (!isComponent(e)) continue;
      const d = (dist.get(atual) ?? 0) + comprimentoDaPeca(p, e);
      if (d < (dist.get(v) ?? Infinity) - 1e-12) {
        dist.set(v, d);
        abertos.add(v);
      }
    }
  }
  return dist;
}

/** Comprimento do circuito (`quadroId` e `pontos` do circuito) pela rede de eletrodutos do projeto. Nunca lança. */
export function comprimentoDoCircuito(p: Project, circuito: { quadroId?: Id; pontos: { componenteId: Id }[] }): ComprimentoDoCircuito {
  const quadro = circuito.quadroId !== undefined ? p.elements[circuito.quadroId] : undefined;
  const dist = isComponent(quadro) ? distancias(p, quadro.id) : new Map<Id, number>();
  const porPonto: Record<Id, number | null> = {};
  for (const pt of circuito.pontos) porPonto[pt.componenteId] = dist.get(pt.componenteId) ?? null;
  const alcancados = Object.values(porPonto).filter((v): v is number => v !== null);
  return {
    comprimentoM: alcancados.length > 0 ? Math.max(...alcancados) : null,
    porPonto,
    semCaminho: circuito.pontos.map((x) => x.componenteId).filter((id) => porPonto[id] === null),
  };
}
