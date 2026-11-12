// Cortina embutida em parede comum (decisão 0056, §8): o hospedeiro, a posição que a cortina tem nele, e o que acontece
// quando o hospedeiro é transformado, dividido ou apagado. A posição manda em `host`: a parede da cortina (a, b,
// baseOffset, height) é derivada e regravada a cada comando. O recorte geométrico na parede hospedeira é do Rust (fase 5),
// não daqui.

import type { Command } from './commands.ts';
import { t, type Lang } from './i18n.ts';
import { isOpening, isWall, type Id, type Project, type Wall } from './types.ts';
import { isCurtainType } from './wallType.ts';
import { openingTypeById } from './openingNominal.ts';
import { newId } from './ids.ts';
import type { ValidationIssue } from './validate.ts';
import type { CurtainHost } from './wallCurtainTypes.ts';

const EPS = 1e-6;

/** Há alguma cortina embutida no projeto (o caminho de sincronização só roda quando há). */
export function temCortinaEmbutida(p: Project): boolean {
  return Object.values(p.elements).some((e) => isWall(e) && !!e.curtain?.host);
}

/** Comprimento (corda) de uma parede: as cortinas embutidas só existem em parede reta (§8.1). */
const comprimento = (w: Wall): number => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);

/** Posição (a, b, baseOffset, height) que a cortina tem no hospedeiro reto. null se o hospedeiro não tem comprimento. */
export function posicaoDoHospedado(h: Wall, host: CurtainHost): { a: Wall['a']; b: Wall['b']; baseOffset: number; height: number } | null {
  const L = comprimento(h);
  if (!(L > 0)) return null;
  const ux = (h.b.x - h.a.x) / L;
  const uy = (h.b.y - h.a.y) / L;
  const s0 = host.offset - host.width / 2;
  const s1 = host.offset + host.width / 2;
  return {
    a: { x: h.a.x + ux * s0, y: h.a.y + uy * s0 },
    b: { x: h.a.x + ux * s1, y: h.a.y + uy * s1 },
    baseOffset: h.baseOffset + host.sill,
    height: host.height,
  };
}

const perto = (x: number, y: number): boolean => Math.abs(x - y) <= EPS;

/** Regrava a posição da cortina a partir do hospedeiro: a, b, baseOffset e height; topo pela altura do vão (sem nível). */
function aplicarPosicao(w: Wall, pos: NonNullable<ReturnType<typeof posicaoDoHospedado>>): void {
  w.a = { ...pos.a };
  w.b = { ...pos.b };
  w.baseOffset = pos.baseOffset;
  w.height = pos.height;
  w.topLevelId = null;
  w.sag = 0;
}

/** A parede já está na posição do hospedeiro (sem regravar: evita um passo de desfazer vazio e mudança à toa). */
function naPosicao(w: Wall, pos: NonNullable<ReturnType<typeof posicaoDoHospedado>>): boolean {
  return perto(w.a.x, pos.a.x) && perto(w.a.y, pos.a.y) && perto(w.b.x, pos.b.x) && perto(w.b.y, pos.b.y) && perto(w.baseOffset, pos.baseOffset) && perto(w.height, pos.height);
}

/** Cortina vira independente: tira o hospedeiro e mantém a geometria como está (§8.3). */
function promover(w: Wall): void {
  if (!w.curtain?.host) return;
  const copia = { ...w.curtain };
  delete copia.host;
  w.curtain = copia;
}

/**
 * Regrava a posição de toda cortina embutida a partir do hospedeiro; cortina cujo hospedeiro foi apagado vira independente
 * (§8.3). Roda depois de cada comando (com cortina embutida no projeto).
 */
export function sincronizarCortinasEmbutidas(p: Project): void {
  for (const w of Object.values(p.elements)) {
    if (!isWall(w) || !w.curtain?.host) continue;
    const h = p.elements[w.curtain.host.wallId];
    if (!isWall(h)) {
      promover(w);
      continue;
    }
    const pos = posicaoDoHospedado(h, w.curtain.host);
    if (pos && !naPosicao(w, pos)) aplicarPosicao(w, pos);
  }
}

/**
 * Transformação de paredes (mover, girar, espelhar, copiar; §8.4 e regra 3): a cortina embutida acompanha o hospedeiro.
 * Espelhar o hospedeiro inverte o `offset` (medido a partir de `a`). Com cópia, cada hospedeiro copiado leva a cortina
 * embutida dele (cópia nova, ligada ao hospedeiro novo); a cópia de uma cortina cujo hospedeiro não foi copiado fica
 * independente. Sozinha, a cortina embutida não sai do hospedeiro: a sincronização devolve a posição do hospedeiro.
 */
export function transformarHospedados(p: Project, espelhado: boolean, ids: Id[], idMap?: Record<Id, Id>): void {
  const movidos = new Set(ids);
  if (!idMap) {
    for (const w of Object.values(p.elements)) {
      if (!isWall(w) || !w.curtain?.host || !espelhado || !movidos.has(w.curtain.host.wallId)) continue;
      const h = p.elements[w.curtain.host.wallId];
      if (isWall(h)) w.curtain = { ...w.curtain, host: { ...w.curtain.host, offset: comprimento(h) - w.curtain.host.offset } };
    }
    return;
  }
  // Cortinas que foram copiadas junto (a própria cópia): ligadas ao hospedeiro copiado, ou independentes.
  for (const [orig, nid] of Object.entries(idMap)) {
    const copia = p.elements[nid];
    if (!isWall(copia) || !copia.curtain?.host || !isWall(p.elements[orig])) continue;
    const hostNovo = idMap[copia.curtain.host.wallId];
    if (hostNovo && isWall(p.elements[hostNovo])) {
      const h = p.elements[copia.curtain.host.wallId];
      const offset = espelhado && isWall(h) ? comprimento(h) - copia.curtain.host.offset : copia.curtain.host.offset;
      copia.curtain = { ...copia.curtain, host: { ...copia.curtain.host, wallId: hostNovo, offset } };
    } else {
      promover(copia);
    }
  }
  // Cortinas embutidas em hospedeiro copiado, que não estavam na cópia: a cópia do hospedeiro leva a sua cortina.
  for (const w of Object.values(p.elements)) {
    if (!isWall(w) || !w.curtain?.host || idMap[w.id] !== undefined) continue;
    const hostNovo = idMap[w.curtain.host.wallId];
    if (!hostNovo || !movidos.has(w.curtain.host.wallId)) continue;
    const h = p.elements[w.curtain.host.wallId];
    const offset = espelhado && isWall(h) ? comprimento(h) - w.curtain.host.offset : w.curtain.host.offset;
    const nid = newId('cw');
    p.elements[nid] = { ...w, id: nid, order: p.nextOrder++, curtain: { ...w.curtain, host: { ...w.curtain.host, wallId: hostNovo, offset } } };
  }
}

/**
 * Divisão do hospedeiro (§8.4): cada cortina embutida fica com a parte que contém o vão dela. Se o corte (com a lacuna)
 * cai dentro do vão da cortina, a divisão é recusada. A parte da direita começa em `hi`.
 */
export function reassociarNoCorte(p: Project, hospedeiro: Wall, novoId: Id, lo: number, hi: number, lang: Lang): void {
  for (const c of Object.values(p.elements)) {
    if (!isWall(c) || !c.curtain?.host || c.curtain.host.wallId !== hospedeiro.id) continue;
    const h = c.curtain.host;
    const s0 = h.offset - h.width / 2;
    const s1 = h.offset + h.width / 2;
    if (lo < s1 - EPS && hi > s0 + EPS) throw new Error(t(lang, 'md_ct_split_inside'));
    if (s0 >= hi - EPS) c.curtain = { ...c.curtain, host: { ...h, wallId: novoId, offset: h.offset - hi } };
  }
}

/** Hospedeiro válido para a cortina: parede comum, reta, com o vão dentro dela e sem cobrir uma abertura por inteiro. */
function hospedeiroValido(p: Project, wallId: Id, host: CurtainHost, lang: Lang): Wall {
  const h = p.elements[host.wallId];
  if (host.wallId === wallId || !isWall(h)) throw new Error(t(lang, 'md_ct_host_missing'));
  if (isCurtainType(p.wallTypes[h.typeId])) throw new Error(t(lang, 'md_ct_host_not_basic'));
  if (h.sag !== 0) throw new Error(t(lang, 'md_ct_host_arc'));
  const L = comprimento(h);
  const s0 = host.offset - host.width / 2;
  const s1 = host.offset + host.width / 2;
  const cabe = host.width > 0 && host.height > 0 && host.sill >= 0 && s0 >= -EPS && s1 <= L + EPS;
  if (!cabe || !(L > 0)) throw new Error(t(lang, 'md_ct_host_range'));
  for (const o of Object.values(p.elements)) {
    if (!isOpening(o) || o.hostId !== h.id) continue;
    const meia = (openingTypeById(p, o.typeId)?.width ?? 0) / 2;
    if (o.offset - meia >= s0 - EPS && o.offset + meia <= s1 + EPS) throw new Error(t(lang, 'md_ct_host_covers_opening'));
  }
  return h;
}

/** Aplica os comandos de cortina embutida (setCurtainHost, clearCurtainHost). Devolve false se não é desta família. */
export function applyCurtainHostCommand(p: Project, c: Command, lang: Lang = 'pt'): boolean {
  switch (c.type) {
    case 'setCurtainHost': {
      const w = p.elements[c.wallId];
      if (!isWall(w) || !isCurtainType(p.wallTypes[w.typeId])) throw new Error(t(lang, 'md_ct_not_curtain'));
      const h = hospedeiroValido(p, c.wallId, c.host, lang);
      const pos = posicaoDoHospedado(h, c.host);
      if (!pos) throw new Error(t(lang, 'md_ct_host_missing'));
      w.curtain = { ...(w.curtain ?? {}), host: { ...c.host } };
      aplicarPosicao(w, pos);
      return true;
    }
    case 'clearCurtainHost': {
      const w = p.elements[c.wallId];
      if (!isWall(w) || !isCurtainType(p.wallTypes[w.typeId])) throw new Error(t(lang, 'md_ct_not_curtain'));
      promover(w);
      return true;
    }
    default:
      return false;
  }
}

/**
 * Problemas de projeto da cortina embutida: hospedeiro ausente (aviso; a cortina vira independente no próximo comando),
 * espelho divergente do hospedeiro, vão que passa das pontas, e abertura do hospedeiro cortada em parte (§8.2).
 */
export function curtainHostIssues(p: Project, lang: Lang = 'pt'): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const w of Object.values(p.elements)) {
    if (!isWall(w) || !w.curtain?.host) continue;
    const host = w.curtain.host;
    const h = p.elements[host.wallId];
    if (!isWall(h)) {
      out.push({ severity: 'warning', code: 'cortina-hospedeiro-ausente', message: t(lang, 'md_ct_w_hospedeiro_ausente', { id: host.wallId }), elementId: w.id });
      continue;
    }
    const pos = posicaoDoHospedado(h, host);
    if (pos && !naPosicao(w, pos)) out.push({ severity: 'warning', code: 'curtain-host-mirror', message: t(lang, 'md_ct_w_mirror'), elementId: w.id, ids: [w.id, h.id] });
    const L = comprimento(h);
    const s0 = host.offset - host.width / 2;
    const s1 = host.offset + host.width / 2;
    if (s0 < -EPS || s1 > L + EPS) out.push({ severity: 'warning', code: 'cortina-recorte-fora-do-hospedeiro', message: t(lang, 'md_ct_w_fora_hospedeiro'), elementId: w.id, ids: [w.id, h.id] });
    for (const o of Object.values(p.elements)) {
      if (!isOpening(o) || o.hostId !== h.id) continue;
      const meia = (openingTypeById(p, o.typeId)?.width ?? 0) / 2;
      const coberta = o.offset - meia >= s0 - EPS && o.offset + meia <= s1 + EPS;
      const cruza = Math.min(o.offset + meia, s1) - Math.max(o.offset - meia, s0) > EPS;
      if (cruza && !coberta) out.push({ severity: 'warning', code: 'cortina-colide-abertura', message: t(lang, 'md_ct_w_colide_abertura'), elementId: w.id, ids: [w.id, o.id] });
    }
  }
  return out;
}
