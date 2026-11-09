import { isGuardaCorpo, normaDe, type GuardaCorpo, type Id, type TipoGuardaCorpo } from '@hestia/model';
import { gid, materialOf, storeyOf, type IfcCtx } from './ifcCtx.ts';
import { faceSetOf, tessellatedShape } from './ifcGeneric.ts';
import { ifcGuid } from './ifcGuid.ts';
import { addPropertySet, type PropValue } from './ifcProperties.ts';
import { localPlacement } from './ifcSolids.ts';
import { en, list, num, OMIT, ref, stepString } from './ifcStep.ts';
import type { IfcGeometry, IfcGuardaCorpoGeo, IfcPapelGC, IfcParteGC } from './ifcTypes.ts';

/**
 * Guarda-corpo no IFC4 (ADR 0055 §7.2): um `IFCRAILING` por guarda-corpo, contido no pavimento, agregando uma entidade por
 * grupo de malha do kernel (papel + material). A geometria é a da consulta `guarda_malha`, em `IFCTRIANGULATEDFACESET`.
 */

/** `IfcRailingTypeEnum` pela composição do tipo (ADR §7.2), quando `tipo.ifcPredefinido` é nulo. */
export function railingKindOf(tipo: TipoGuardaCorpo): NonNullable<TipoGuardaCorpo['ifcPredefinido']> {
  if (tipo.ifcPredefinido) return tipo.ifcPredefinido;
  const balaustres = tipo.preenchimentos.some((f) => f.tipo === 'balaustres');
  const paineis = tipo.preenchimentos.some((f) => f.tipo === 'painel');
  const corrimao = tipo.corrimaos.some((r) => r.funcao === 'corrimao');
  if (balaustres && !paineis && !corrimao) return 'BALUSTRADE';
  if (balaustres || paineis) return 'GUARDRAIL';
  if (corrimao) return 'HANDRAIL';
  return 'USERDEFINED';
}

interface ParteIfc {
  entity: 'IFCRAILING' | 'IFCMEMBER' | 'IFCPLATE';
  predefined: string;
  /** `ObjectType` quando o predefinido é `USERDEFINED`. */
  objectType?: string;
}

/** Entidade IFC4 de cada papel (ADR §7.2; trilho e suporte não estão na ADR: ver o registro da exportação IFC). */
function parteIfc(p: IfcParteGC): ParteIfc {
  switch (p.papel) {
    case 'corrimao':
    case 'travessa':
      return { entity: 'IFCRAILING', predefined: 'HANDRAIL' };
    case 'poste':
      return { entity: 'IFCMEMBER', predefined: 'POST' };
    case 'trilho':
      return { entity: 'IFCMEMBER', predefined: 'RAIL' };
    case 'balaustre':
      return { entity: 'IFCMEMBER', predefined: 'USERDEFINED', objectType: 'BALUSTER' };
    case 'suporte':
      return { entity: 'IFCMEMBER', predefined: 'USERDEFINED', objectType: 'HANDRAIL_SUPPORT' };
    case 'cabo':
      return { entity: 'IFCMEMBER', predefined: 'USERDEFINED', objectType: 'CABLE' };
    case 'painel':
      return { entity: 'IFCPLATE', predefined: p.vidro ? 'CURTAIN_PANEL' : 'SHEET' };
  }
}

const PAPEL_NOME: Record<IfcPapelGC, { pt: string; en: string }> = {
  poste: { pt: 'poste', en: 'post' },
  balaustre: { pt: 'balaústre', en: 'baluster' },
  trilho: { pt: 'trilho', en: 'rail' },
  corrimao: { pt: 'corrimão', en: 'handrail' },
  suporte: { pt: 'suporte', en: 'support' },
  painel: { pt: 'painel', en: 'panel' },
  cabo: { pt: 'cabo', en: 'cable' },
  travessa: { pt: 'travessa superior', en: 'top rail' },
};

const papelNome = (papel: IfcPapelGC, lang: string): string => (lang === 'pt' || lang === 'es' ? PAPEL_NOME[papel].pt : PAPEL_NOME[papel].en);

/** Descrição dos lados ligados do hospedeiro (`esquerdo:lance+patamar;direito:lance`). */
function ladosTexto(g: GuardaCorpo): string {
  const h = g.hospedeiro;
  if (h.tipo === 'manual') return h.ladoDeslocamento;
  return (['esquerdo', 'direito'] as const)
    .map((lado) => {
      const partes = [h.lados[lado].lance ? 'lance' : '', h.lados[lado].patamar ? 'patamar' : ''].filter(Boolean);
      return `${lado}:${partes.length > 0 ? partes.join('+') : 'nenhum'}`;
    })
    .join(';');
}

/** Id STEP do produto de escada/rampa já escrito (mapa de produtos ou GlobalId determinístico). */
function hostProduct(c: IfcCtx, hostId: Id, prefix: 'stair' | 'ramp'): number | undefined {
  const known = c.products?.get(hostId);
  if (known !== undefined) return known;
  const guid = ifcGuid(`${prefix}:${hostId}`);
  for (const line of c.w.written) {
    if (line.includes(`('${guid}'`)) {
      const m = /^#(\d+)=/.exec(line);
      if (m) return Number(m[1]);
    }
  }
  return undefined;
}

interface TypeEntry {
  id: number;
  members: number[];
}

/** `IFCRAILINGTYPE` do tipo do guarda-corpo, criado uma vez por tipo. */
function railingType(c: IfcCtx, types: Map<Id, TypeEntry>, tipo: TipoGuardaCorpo): TypeEntry {
  const known = types.get(tipo.id);
  if (known) return known;
  const id = c.w.add('IFCRAILINGTYPE', [
    gid(`railingtype:${tipo.id}`),
    OMIT,
    stepString(tipo.name),
    tipo.description ? stepString(tipo.description) : OMIT,
    OMIT,
    OMIT,
    OMIT,
    OMIT,
    OMIT,
    en(railingKindOf(tipo)),
  ]);
  const entry: TypeEntry = { id, members: [] };
  types.set(tipo.id, entry);
  return entry;
}

function addRailing(c: IfcCtx, types: Map<Id, TypeEntry>, geo: IfcGuardaCorpoGeo): void {
  const el = c.p.elements[geo.guardaId];
  if (!isGuardaCorpo(el)) return;
  const st = storeyOf(c, el.levelId);
  const tipo = c.p.tiposGuardaCorpo?.[el.typeId];
  if (!st || !tipo) return;
  const lang = c.lang ?? 'pt';
  const name = tipo.name;
  const kind = railingKindOf(tipo);
  const place = localPlacement(c.w, st.place, [0, 0, 0]);
  const railing = c.w.add('IFCRAILING', [
    gid(`railing:${el.id}`),
    OMIT,
    stepString(el.mark ? `${name} ${el.mark}` : name),
    el.comments ? stepString(el.comments) : OMIT,
    kind === 'USERDEFINED' ? stepString('GUARDA-CORPO') : OMIT,
    ref(place),
    OMIT,
    el.mark ? stepString(el.mark) : OMIT,
    en(kind),
  ]);
  c.products?.set(el.id, railing);
  st.contained.push(railing);
  c.w.add('IFCRELASSOCIATESMATERIAL', [gid(`mat:railing:${el.id}`), OMIT, OMIT, OMIT, list([ref(railing)]), ref(materialOf(c, tipo.materialPadraoId))]);
  railingType(c, types, tipo).members.push(railing);

  const parts: number[] = [];
  geo.partes.forEach((parte, i) => {
    const faceSet = faceSetOf(c.w, parte.mesh, st.elev);
    if (faceSet === null) return;
    const info = parteIfc(parte);
    const pPlace = localPlacement(c.w, st.place, [0, 0, 0]);
    const shape = tessellatedShape(c.w, c.ctx, faceSet);
    const label = `${name} - ${papelNome(parte.papel, lang)}${parte.pecas && parte.pecas > 1 ? ` (${parte.pecas})` : ''}`;
    const part = c.w.add(info.entity, [
      gid(`railing:${el.id}:part:${i}`),
      OMIT,
      stepString(label),
      OMIT,
      info.objectType ? stepString(info.objectType) : OMIT,
      ref(pPlace),
      ref(shape),
      OMIT,
      en(info.predefined),
    ]);
    c.w.add('IFCRELASSOCIATESMATERIAL', [gid(`mat:railing:${el.id}:part:${i}`), OMIT, OMIT, OMIT, list([ref(part)]), ref(materialOf(c, parte.materialId))]);
    parts.push(part);
  });
  if (parts.length > 0) c.w.add('IFCRELAGGREGATES', [gid(`railingagg:${el.id}`), OMIT, OMIT, OMIT, ref(railing), list(parts.map(ref))]);

  // Altura da instância ou do tipo; Diameter: o do primeiro corrimão de perfil circular.
  const altura = el.altura ?? tipo.altura;
  const circular = tipo.corrimaos.find((r) => r.perfil.forma === 'circular');
  const common: Array<readonly [string, PropValue]> = [['Reference', tipo.code || tipo.name], ['Height', altura]];
  if (circular) common.push(['Diameter', circular.perfil.largura]);
  addPropertySet(c, `pset:railing:${el.id}:common`, 'Pset_RailingCommon', common, railing);

  const norma = normaDe(c.p, tipo);
  const hestia: Array<readonly [string, PropValue]> = [
    ['Hospedeiro', el.hospedeiro.tipo],
    ['Lados', ladosTexto(el)],
    ['Norma', norma.name],
    ['NormaConferida', norma.verificado],
    ['Tipo', tipo.id],
  ];
  if (el.hospedeiro.tipo === 'escada') hestia.push(['HospedeiroId', el.hospedeiro.escadaId]);
  if (el.hospedeiro.tipo === 'rampa') hestia.push(['HospedeiroId', el.hospedeiro.rampaId]);
  addPropertySet(c, `pset:railing:${el.id}:hestia`, 'Pset_Hestia_GuardaCorpo', hestia, railing);

  if (geo.comprimentoDesenvolvido !== undefined && Number.isFinite(geo.comprimentoDesenvolvido)) {
    const q = c.w.add('IFCQUANTITYLENGTH', [stepString('Length'), OMIT, OMIT, num(geo.comprimentoDesenvolvido), OMIT]);
    const set = c.w.add('IFCELEMENTQUANTITY', [gid(`qto:railing:${el.id}`), OMIT, stepString('Qto_RailingBaseQuantities'), OMIT, OMIT, list([ref(q)])]);
    c.w.add('IFCRELDEFINESBYPROPERTIES', [gid(`qto:railing:${el.id}:rel`), OMIT, OMIT, OMIT, list([ref(railing)]), ref(set)]);
  }

  // Hospedeiro escada/rampa: IFCRELCONNECTSELEMENTS do hospedeiro (relacionante) ao guarda-corpo (relacionado).
  const h = el.hospedeiro;
  if (h.tipo !== 'manual') {
    const host = h.tipo === 'escada' ? hostProduct(c, h.escadaId, 'stair') : hostProduct(c, h.rampaId, 'ramp');
    if (host !== undefined) {
      c.w.add('IFCRELCONNECTSELEMENTS', [gid(`railinghost:${el.id}`), OMIT, stepString('Host'), OMIT, OMIT, ref(host), ref(railing)]);
    }
  }
}

/** Guarda-corpos do projeto com malha em `geo.railings`; chamar depois de `addStairs`/`addRamps` (para achar o hospedeiro). */
export function addRailings(c: IfcCtx, geo: IfcGeometry): void {
  const types = new Map<Id, TypeEntry>();
  for (const r of geo.railings ?? []) addRailing(c, types, r);
  for (const [tipoId, t] of [...types.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    c.w.add('IFCRELDEFINESBYTYPE', [gid(`railingtyperel:${tipoId}`), OMIT, OMIT, OMIT, list(t.members.map(ref)), ref(t.id)]);
  }
}
