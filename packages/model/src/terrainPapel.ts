import type { PapelRegiaoTerreno, TerrainRegion } from './terrainTypes.ts';

/**
 * Regra do papel da região de terreno (A.6): o que cada papel usa e o que uma edição grava. Fonte única para o painel, para os comandos
 * `addTerrainRegion` e `updateTerrainRegion` e para a ferramenta (que re-exporta os padrões).
 *
 * O kernel (`terreno_regioes.rs`, `plana()`) aplica o plano (cota, inclinação, direção) e o talude só nas regiões planas (plataforma e
 * nivelada); na subdivisão a região não altera a superfície. Por isso só esses dois campos dependem do papel. Material, cor e permeável
 * valem para todos os papéis.
 */

/** Padrões de cada papel (A.6): taludes de corte e aterro e se a região conta como área permeável. */
export const PADROES_PAPEL_REGIAO: Readonly<Record<PapelRegiaoTerreno, { taludeCorte: number; taludeAterro: number; permeavel: boolean }>> = {
  subdivisao: { taludeCorte: 0, taludeAterro: 0, permeavel: true },
  plataforma: { taludeCorte: 0, taludeAterro: 0, permeavel: false },
  nivelada: { taludeCorte: 1.5, taludeAterro: 2, permeavel: false },
};

/** Campos com efeito no papel: `plano` (cota, inclinação, direção) e `talude` (corte e aterro). */
export interface CamposDoPapel {
  plano: boolean;
  talude: boolean;
}

/** Plano e talude se aplicam a plataforma e a nivelada; a subdivisão não usa nenhum dos dois. */
export function camposDoPapel(papel: PapelRegiaoTerreno): CamposDoPapel {
  const plano = papel !== 'subdivisao';
  return { plano, talude: plano };
}

const ehPapel = (x: unknown): x is PapelRegiaoTerreno => x === 'subdivisao' || x === 'plataforma' || x === 'nivelada';
const SEM_PLANO = { cota: 0, inclinacao: 0, direcao: 0 } as const;
const SEM_TALUDE = { taludeCorte: 0, taludeAterro: 0 } as const;

/**
 * Região com os campos que o papel dela não usa zerados (na subdivisão: cota, inclinação, direção e taludes). Campos que se aplicam ficam como
 * estão. Não valida: a validação é `terrainRegionIssue`, e arquivo antigo com valor sobrando continua sendo lido.
 */
export function neutralizarCamposNaoUsados(r: TerrainRegion): TerrainRegion {
  const usa = camposDoPapel(r.papel);
  if (usa.plano && usa.talude) return r;
  return { ...r, ...(usa.plano ? {} : SEM_PLANO), ...(usa.talude ? {} : SEM_TALUDE) };
}

/**
 * Região depois de uma edição (`updateTerrainRegion`). Ao trocar o papel, taludes e permeável voltam aos padrões do papel novo (é o que a
 * barra de opções da ferramenta faz ao trocar a predefinição); entrar num papel de plano vindo da subdivisão põe cota, inclinação e direção em 0.
 * Os valores do próprio `patch` vencem os padrões. Por fim, o que o papel não usa sai neutro.
 */
export function normalizarEdicaoRegiao(anterior: TerrainRegion, patch: Partial<TerrainRegion>): TerrainRegion {
  const papel = patch.papel ?? anterior.papel;
  if (papel === anterior.papel || !ehPapel(papel)) return neutralizarCamposNaoUsados({ ...anterior, ...patch });
  const pad = PADROES_PAPEL_REGIAO[papel];
  const entrouNoPlano = camposDoPapel(papel).plano && !camposDoPapel(anterior.papel).plano;
  return neutralizarCamposNaoUsados({
    ...anterior,
    ...(entrouNoPlano ? SEM_PLANO : {}),
    taludeCorte: pad.taludeCorte,
    taludeAterro: pad.taludeAterro,
    permeavel: pad.permeavel,
    ...patch,
  });
}
