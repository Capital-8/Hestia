import { assetParts, isFurniture, mat4Det3, furniturePartWorldTransform, type FurnitureAsset, type FurnitureQuality, type Id, type Project } from '@hestia/model';
import { META_TRIANGULOS_LEVE, metasLeves, triangulosDaDefinicao } from './furnitureLod.ts';

/** Acima disto (triângulos desenhados dos móveis) a interface avisa que a vista pode ficar pesada. */
export const AVISO_TRIANGULOS_MOVEIS = 2_000_000;

export interface OrcamentoDeMoveis {
  /** Instâncias de móvel contadas. */
  instancias: number;
  /** Assets distintos usados. */
  assets: number;
  /** Definições de malha distintas desenhadas (cada uma é geometria compartilhada). */
  definicoes: number;
  /** Triângulos desenhados na vista (soma de instâncias × peças × triângulos da qualidade escolhida). */
  triangulos: number;
  /** Chamadas de desenho estimadas: uma por (definição, grupo de material, qualidade, espelhada). */
  chamadas: number;
  /** Triângulos que a vista desenharia se tudo fosse completo (para a interface mostrar o ganho). */
  triangulosCompletos: number;
  /** `triangulos` passou do limite de aviso. */
  excede: boolean;
}

export interface OpcoesOrcamento {
  /** Qualidade das instâncias sem `quality` (padrão do projeto). Padrão 'leve'. */
  qualidadePadrao?: FurnitureQuality;
  /** Meta da versão leve por bloco (padrão `META_TRIANGULOS_LEVE`). */
  metaLeve?: number;
  /** Só um nível. */
  nivel?: Id;
  /** Elementos ocultos na vista. */
  ocultos?: ReadonlySet<Id>;
  /** Limite do aviso (padrão `AVISO_TRIANGULOS_MOVEIS`). */
  limite?: number;
}

/**
 * Orçamento da vista 3D para os móveis do projeto, sem montar nenhuma malha (usa só contagens do asset): a interface o
 * chama para mostrar o aviso de peso. A versão leve é estimada pela meta (a simplificação real fica até ~10% acima).
 */
export function furnitureViewBudget(p: Project, opt: OpcoesOrcamento = {}): OrcamentoDeMoveis {
  const assets = p.furniture?.assets ?? {};
  const meta = opt.metaLeve ?? META_TRIANGULOS_LEVE;
  const padrao = opt.qualidadePadrao ?? 'leve';
  const metas = new Map<string, Map<string, number>>();
  const usados = new Set<string>();
  const defs = new Set<string>();
  const chamadas = new Set<string>();
  let instancias = 0;
  let triangulos = 0;
  let completos = 0;
  for (const e of Object.values(p.elements)) {
    if (!isFurniture(e) || (opt.nivel && e.levelId !== opt.nivel) || opt.ocultos?.has(e.id)) continue;
    const asset: FurnitureAsset | undefined = assets[e.assetId];
    if (!asset) continue;
    instancias++;
    usados.add(asset.id);
    const q = e.quality ?? padrao;
    let m = metas.get(asset.id);
    if (!m) {
      m = metasLeves(asset, meta);
      metas.set(asset.id, m);
    }
    const porId = new Map(asset.defs.map((d) => [d.id, d]));
    for (const part of assetParts(asset)) {
      const d = porId.get(part.defId);
      if (!d) continue;
      const cheios = triangulosDaDefinicao(d);
      completos += cheios;
      triangulos += q === 'completo' ? cheios : (m.get(d.id) ?? cheios);
      const espelhada = mat4Det3(furniturePartWorldTransform(e, part, asset)) < 0;
      defs.add(`${asset.id}|${d.id}`);
      const grupos = d.groups.length ? new Set(d.groups.map((g) => g.materialIndex)).size : 1;
      for (let g = 0; g < grupos; g++) chamadas.add(`${asset.id}|${d.id}|${q}|${espelhada ? 1 : 0}|${g}`);
    }
  }
  return {
    instancias,
    assets: usados.size,
    definicoes: defs.size,
    triangulos,
    chamadas: chamadas.size,
    triangulosCompletos: completos,
    excede: triangulos > (opt.limite ?? AVISO_TRIANGULOS_MOVEIS),
  };
}
