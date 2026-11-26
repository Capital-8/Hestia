import { isComponent, type Component, type Id, type Project } from '@hestia/model';
import { AFASTAMENTO_MAXIMO_CONEXAO } from './diagnosticoRede.ts';
import { curvaturasFechadas } from './curvaturaFlexivel.ts';
import { afastamentoDoPar, ligacoesCompativeis } from './ligacoesEncaixe.ts';
import { chaveLigacao, portasNoMundo } from './movimentoLigadoRede.ts';
import type { Falha, PatchComponente } from './movimentoLigadoTipos.ts';

/*
 * Conferência do resultado do movimento (ficha F4): aplica os `patches` num projeto descartável (cópia rasa) e confere, com as MESMAS
 * funções que `diagnosticarRede` usa, que nenhuma ligação do que se mexeu ficou afastada (> 5 mm) ou incompatível, e que nenhum
 * corrugado ficou com canto mais fechado que o raio mínimo. Ligação que já estava ruim ANTES do movimento não é culpa dele: fica de fora.
 */

/** Nome para as mensagens: a marca da instância ou o nome da família. */
export function nomeDoComponente(p: Project, c: Component): string {
  return c.mark.trim() !== '' ? c.mark : p.componentFamilies?.[c.familyId]?.nome ?? c.familyId;
}

// units-ok: mensagem em mm por contrato do engine (a ferramenta converte de metros); não é exibição de quantidade do projeto
const mm = (m: number): string => String(Math.round(m * 10000) / 10).replace('.', ',');

/** Projeto com os patches aplicados (cópia rasa dos elementos; o original não é tocado). */
export function projetoComPatches(p: Project, patches: ReadonlyMap<Id, PatchComponente>): Project {
  const elements = { ...p.elements };
  for (const [id, patch] of patches) {
    const c = elements[id];
    if (isComponent(c)) elements[id] = { ...c, ...patch };
  }
  return { ...p, elements };
}

/** Resultado de uma ligação: `null` se serve, ou o motivo do problema. */
function problemaDaLigacao(p: Project, a: Component, la: string, b: Component, lb: string): string | null {
  const pa = portasNoMundo(p, a).find((l) => l.id === la);
  const pb = portasNoMundo(p, b).find((l) => l.id === lb);
  if (!pa || !pb) return null;
  const afastamento = afastamentoDoPar(pa, pb);
  if (afastamento > AFASTAMENTO_MAXIMO_CONEXAO) return `a ligação entre ${nomeDoComponente(p, a)} e ${nomeDoComponente(p, b)} ficaria afastada ${mm(afastamento)} mm`;
  const compat = ligacoesCompativeis(pa, pb);
  return compat.ok ? null : `a ligação entre ${nomeDoComponente(p, a)} e ${nomeDoComponente(p, b)} ficaria incompatível (${compat.motivo})`;
}

/**
 * Primeiro problema entre as ligações dos `tocados` (as que não estão em `cortes`) ou nos corrugados tocados; `null` se está tudo bem.
 * `emMovimento`: ligações com a ponta nestes ids são as candidatas a cortar quando o problema é de curvatura.
 */
export function conferirResultado(p: Project, patches: ReadonlyMap<Id, PatchComponente>, tocados: ReadonlySet<Id>, cortes: ReadonlySet<string>, emMovimento: ReadonlySet<Id>): Falha | null {
  const depois = projetoComPatches(p, patches);
  for (const id of tocados) {
    const antes = p.elements[id];
    const novo = depois.elements[id];
    if (!isComponent(antes) || !isComponent(novo)) continue;
    for (const [la, cx] of Object.entries(antes.ligacoes ?? {})) {
      if (cortes.has(chaveLigacao(id, la))) continue;
      const outroAntes = p.elements[cx.componenteId];
      const outroDepois = depois.elements[cx.componenteId];
      if (!isComponent(outroAntes) || !isComponent(outroDepois)) continue;
      // Cada ligação é conferida uma vez (pela ponta de chave menor), como `diagnosticarRede`.
      if (!(`${id}\n${la}` < `${outroAntes.id}\n${cx.ligacaoId}`)) continue;
      if (problemaDaLigacao(p, antes, la, outroAntes, cx.ligacaoId) !== null) continue;
      const motivo = problemaDaLigacao(depois, novo, la, outroDepois, cx.ligacaoId);
      if (motivo !== null) return { tipo: 'falha', motivo: capitalizar(motivo), cortar: [{ a: id, la }] };
    }
  }
  const antesFechadas = new Set(curvaturasFechadas(p).map((c) => c.elementId));
  for (const f of curvaturasFechadas(depois)) {
    if (antesFechadas.has(f.elementId) || !tocados.has(f.elementId)) continue;
    const t = depois.elements[f.elementId];
    const c = isComponent(t) ? t : null;
    const cortar = Object.entries(c?.ligacoes ?? {})
      .filter(([la, cx]) => !cortes.has(chaveLigacao(f.elementId, la)) && emMovimento.has(cx.componenteId))
      .map(([la]) => ({ a: f.elementId, la }));
    const nome = c ? nomeDoComponente(p, c) : f.elementId;
    return { tipo: 'falha', motivo: `O trecho flexível ${nome} ficaria com canto mais fechado que o raio mínimo de curvatura: as curvas pedem ${mm(f.necessario / 1000)} mm e o trecho tem ${mm(f.disponivel / 1000)} mm.`, cortar };
  }
  return null;
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}
