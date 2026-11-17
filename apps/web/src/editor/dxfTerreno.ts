import { areaEdificavel, planoDaSecao, servicoTerreno, type SectionResult, type ServicoTerreno } from '@hestia/engine';
import {
  DXF_LAYER_LOTE,
  DXF_LAYER_LOTE_EDIFICAVEL,
  DXF_LAYER_TERRENO_BORDA,
  DXF_LAYER_TERRENO_CURVAS,
  DXF_LAYER_TERRENO_CURVAS_MESTRAS,
  DXF_LAYER_TERRENO_REGIAO,
  type DxfPoint,
  type DxfSectionPath,
  type DxfTerrenoPath,
} from '@hestia/io';
import { cotaExibida, isLot, isTerrainRegion, type Id, type Project } from '@hestia/model';

/**
 * Terreno e lote no DXF (ficha X1, A.7). As curvas de nível, a borda e o perfil do corte vêm do kernel (`servicoTerreno().curvas`, `.planta`, `.corte`,
 * superfície PROPOSTA); nenhum caminho TS os gera. Sem kernel pronto o kernel não responde e só saem o que é do modelo (regiões, lote e área
 * edificável). Decisão da elevação: o código 38 de cada curva é a COTA EXIBIDA (`cotaExibida`: z do projeto mais `localizacao.cotaZero`), a altitude que
 * o levantamento e o CAD esperam; o corte, como o resto dele, fica em z do projeto.
 */
type Fonte = Pick<ServicoTerreno, 'curvas' | 'planta' | 'corte'>;

/** Anel sem o vértice de fechamento repetido. */
function anelAberto(anel: ReadonlyArray<{ x: number; y: number }>): DxfPoint[] {
  const pts = anel.map((q) => ({ x: q.x, y: q.y }));
  const a = pts[0];
  const b = pts[pts.length - 1];
  if (pts.length > 1 && a && b && Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9) pts.pop();
  return pts;
}

/**
 * Polilinhas do terreno e do lote do nível para a planta: curvas (mestra em camada própria, com a elevação), borda, contorno das regiões, contorno do
 * lote e área edificável (tracejada). `site` e `lot` dizem se a categoria está visível na vista; `hidden` são os ocultos da vista. Vazio quando nada sai.
 */
export function terrenoPlantaDxfOf(p: Project, levelId: Id, categorias: { site: boolean; lot: boolean }, hidden: ReadonlySet<Id> = new Set(), servico: Fonte = servicoTerreno()): DxfTerrenoPath[] {
  const out: DxfTerrenoPath[] = [];
  if (categorias.site) {
    for (const c of servico.curvas(p, 1, levelId) ?? []) {
      if (hidden.has(c.terrenoId) || c.pontos.length < 2) continue;
      out.push({ layer: c.mestra ? DXF_LAYER_TERRENO_CURVAS_MESTRAS : DXF_LAYER_TERRENO_CURVAS, pts: c.fechada ? anelAberto(c.pontos) : c.pontos.map((q) => ({ x: q.x, y: q.y })), closed: c.fechada, elevation: cotaExibida(p, c.z) });
    }
    for (const b of servico.planta(p, 1, levelId) ?? []) {
      if (hidden.has(b.terrenoId) || b.pontos.length < 3) continue;
      out.push({ layer: DXF_LAYER_TERRENO_BORDA, pts: anelAberto(b.pontos), closed: true });
    }
    for (const r of Object.values(p.elements).filter(isTerrainRegion)) {
      if (r.levelId !== levelId || hidden.has(r.id) || hidden.has(r.terrenoId) || r.contorno.length < 3) continue;
      out.push({ layer: DXF_LAYER_TERRENO_REGIAO, pts: anelAberto(r.contorno), closed: true });
    }
  }
  if (categorias.lot) {
    for (const l of Object.values(p.elements).filter(isLot)) {
      if (l.levelId !== levelId || hidden.has(l.id) || l.contorno.length < 3) continue;
      out.push({ layer: DXF_LAYER_LOTE, pts: anelAberto(l.contorno), closed: true });
      if (!l.mostrarEdificavel) continue;
      for (const poly of areaEdificavel(l.contorno, l.lados)) {
        for (const anel of poly) {
          const pts = anelAberto(anel);
          if (pts.length >= 3) out.push({ layer: DXF_LAYER_LOTE_EDIFICAVEL, pts, closed: true, dashed: true });
        }
      }
    }
  }
  return out;
}

/**
 * Linhas do terreno no corte ou na elevação (`terreno_corte` do kernel, todo terreno do projeto, sem filtro de nível), em `(s, z)`: o solo cortado
 * fechado, o perfil existente tracejado e a silhueta aberta. `undefined` sem terreno, sem kernel pronto ou com a categoria oculta.
 */
export function terrenoCorteDxfOf(p: Project, s: SectionResult, visivel: boolean, hidden: ReadonlySet<Id> = new Set(), servico: Fonte = servicoTerreno()): DxfSectionPath[] | undefined {
  if (!visivel) return undefined;
  const plano = planoDaSecao(s);
  if (!plano) return undefined;
  const linhas = servico.corte(p, { x: plano.a.x, y: plano.a.y }, { x: plano.b.x - plano.a.x, y: plano.b.y - plano.a.y }, plano.depth, null);
  if (!linhas) return undefined;
  const out = linhas
    .filter((l) => l.pontos.length >= 2 && !hidden.has(l.terrenoId))
    .map((l): DxfSectionPath => ({ pts: l.pontos.map((q) => ({ x: q.s, y: q.z })), closed: l.papel === 'cortado', ...(l.papel === 'perfilExistente' ? { dashed: true } : {}) }));
  return out.length > 0 ? out : undefined;
}
