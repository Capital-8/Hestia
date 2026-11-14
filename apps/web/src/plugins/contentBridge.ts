/**
 * Ponte do conteúdo de suplementos (famílias e materiais; ADR 0057, fase G) com o app: lista o que cada suplemento ATIVO
 * oferece, mostra a prévia e, só quando o usuário CARREGA, grava pela porta de escrita da fase C (um passo de desfazer).
 * Sem React: roda igual no app e nos testes. Nada é carregado sozinho e nada do projeto é substituído sem pedido.
 */
import { loadedContentIds, planContentLoad, planContentRemoval, type ContentLoadOptions, type ContentOffer, type ContentPlan, type Project, type RemovalPlan } from '@hestia/model';
import { validateManifestAny, type ModelPort } from '@hestia/plugin-api';
import type { PackageStore } from './installer.ts';

/** Famílias e materiais de um suplemento, já limitados ao que o usuário concedeu (`content.families`, `content.materials`). */
export async function contentOffers(store: PackageStore): Promise<ContentOffer[]> {
  const out: ContentOffer[] = [];
  for (const p of await store.list()) {
    try {
      if (!p.enabled) continue;
      const r = validateManifestAny(p.manifest.raw);
      if (!r.ok) continue;
      const m = r.manifest;
      const families = p.grants.includes('content.families') ? (m.contributes.families ?? []) : [];
      const materials = p.grants.includes('content.materials') ? (m.contributes.materials ?? []) : [];
      if (families.length + materials.length === 0) continue;
      out.push({ pluginId: m.id, pluginName: m.name, version: m.version, families, materials });
    } catch {
      /* pacote com defeito não derruba a lista dos demais */
    }
  }
  return out.sort((a, b) => a.pluginName.localeCompare(b.pluginName));
}

const snapshot = (model: ModelPort): Project => model.read() as unknown as Project;

/** Prévia: o que a carga adicionaria, atualizaria ou recusaria (não altera o projeto). */
export function previewContent(model: ModelPort, offer: ContentOffer, opts: ContentLoadOptions = {}): ContentPlan {
  return planContentLoad(snapshot(model), offer, opts);
}

export type ContentWrite = { ok: true; applied: number } | { ok: false; error: string };

/** Carrega: grava os comandos da prévia como UM passo de desfazer ("<suplemento>: carregar conteúdo"). */
export function loadContent(model: ModelPort, offer: ContentOffer, opts: ContentLoadOptions = {}): { plan: ContentPlan; result: ContentWrite } {
  const plan = previewContent(model, offer, opts);
  if (plan.commands.length === 0) return { plan, result: { ok: true, applied: 0 } };
  const r = model.apply(offer.pluginId, 'carregar conteúdo', plan.commands);
  return { plan, result: r.ok ? { ok: true, applied: r.applied } : { ok: false, error: r.error } };
}

/** Prévia da remoção segura do conteúdo carregado (em uso = fica e avisa). */
export function previewRemoval(model: ModelPort, pluginId: string): RemovalPlan {
  return planContentRemoval(snapshot(model), pluginId);
}

/** Remove só o que está livre, em UM passo de desfazer. */
export function removeContent(model: ModelPort, pluginId: string): { plan: RemovalPlan; result: ContentWrite } {
  const plan = previewRemoval(model, pluginId);
  if (plan.commands.length === 0) return { plan, result: { ok: true, applied: 0 } };
  const r = model.apply(pluginId, 'remover conteúdo', plan.commands);
  return { plan, result: r.ok ? { ok: true, applied: r.applied } : { ok: false, error: r.error } };
}

/** Quantos itens do suplemento já estão no projeto. */
export const loadedCount = (model: ModelPort, pluginId: string): number => loadedContentIds(snapshot(model), pluginId).length;
