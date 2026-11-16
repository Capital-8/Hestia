import { curtainPanelTypesOf, isCurtainType, isWall, mullionTypesOf, type CurtainPanelType, type Id, type MullionType } from '@hestia/model';
import { gid, langOf, materialOf, optStr, storeyOf, type IfcCtx } from './ifcCtx.ts';
import { faceSetOf } from './ifcGeneric.ts';
import { addPropertySet, type PropValue } from './ifcProperties.ts';
import { axis3, direction, localPlacement } from './ifcSolids.ts';
import { en, list, num, OMIT, ref, stepString } from './ifcStep.ts';
import type { IfcCurtainGeo, IfcCurtainPrototypeGeo, IfcCurtainWallGeo, IfcGeometry, IfcWallGeo } from './ifcTypes.ts';
import { t } from '../i18n.ts';

/**
 * Parede cortina no IFC4 (decisão 0056, §11, fase 6). Uma `IFCCURTAINWALL` por parede, contida no pavimento, agregando por `IFCRELAGGREGATES`
 * um `IFCMEMBER` por montante (`MULLION`; `USERDEFINED` com `ObjectType` `CORNER` na forma `corner`) e um `IFCPLATE` por painel de vidro
 * (`CURTAIN_PANEL`) ou sólido (`SHEET`). Vão vazio não gera peça.
 *
 * A geometria vem do kernel (malha por protótipos e matrizes, `cortina_malha`): cada protótipo vira UMA `IFCREPRESENTATIONMAP` (a mesma geometria
 * para todas as peças dele) e cada peça recebe um `IFCMAPPEDITEM` cujo alvo é a matriz dela, escrita como `IFCCARTESIANTRANSFORMATIONOPERATOR3DNONUNIFORM`.
 * Tipos (`IFCCURTAINWALLTYPE`, `IFCMEMBERTYPE`, `IFCPLATETYPE`) ligam as ocorrências por `IFCRELDEFINESBYTYPE`.
 *
 * Sem geometria do kernel para uma cortina, ela NÃO entra aqui: o exportador a escreve como parede genérica (`IFCWALL`) e registra o aviso.
 */

/** Entidade de tipo IFC (uma por tipo do modelo) e as ocorrências que a usam, para o `IFCRELDEFINESBYTYPE` do fim. */
interface TypeEntry {
  id: number;
  members: number[];
}

/** Estado da montagem das cortinas: representações por protótipo, tipos já escritos e os tipos do modelo lidos uma vez. */
interface CurtainEstado {
  mapas: Map<number, number | null>;
  tiposParede: Map<Id, TypeEntry>;
  tiposMontante: Map<Id, TypeEntry>;
  tiposPainel: Map<Id, TypeEntry>;
  montantes: Record<Id, MullionType>;
  paineis: Record<Id, CurtainPanelType>;
}

const EPS_ESCALA = 1e-6;

/** Coluna `i` da matriz 3 × 4 linha-maior (`[r0 r1 r2 t]` por linha): para onde vai o eixo `i` do protótipo. */
const coluna = (m: readonly number[], i: number): [number, number, number] => [m[i]!, m[4 + i]!, m[8 + i]!];

const comprimento = (v: readonly number[]): number => Math.hypot(v[0]!, v[1]!, v[2]!);

/**
 * Operador do IFC que leva a geometria do protótipo ao pavimento: o eixo `i` é a coluna `i` normalizada e a escala `i` é o comprimento dela.
 * Exato para matriz afim sem cisalhamento (o caso da cortina: eixos ortogonais com escala): `M · p = t + Σ xᵢ · escalaᵢ · eixoᵢ`. A cota da origem
 * sai na cota do pavimento (`elev`). Matriz degenerada, com escala abaixo de 1 µm ou não finita, devolve `null` (a peça não sai).
 */
function operadorDe(c: IfcCtx, m: readonly number[], elev: number): number | null {
  if (m.length !== 12 || !m.every(Number.isFinite)) return null;
  const cols = [coluna(m, 0), coluna(m, 1), coluna(m, 2)];
  const escalas = cols.map(comprimento);
  if (escalas.some((s) => !(s >= EPS_ESCALA))) return null;
  const [e1, e2, e3] = cols.map((v, i) => v.map((x) => x / escalas[i]!));
  const origem = c.w.add('IFCCARTESIANPOINT', [list([num(m[3]!), num(m[7]!), num(m[11]! - elev)])]);
  return c.w.add('IFCCARTESIANTRANSFORMATIONOPERATOR3DNONUNIFORM', [
    ref(direction(c.w, e1![0]!, e1![1]!, e1![2]!)),
    ref(direction(c.w, e2![0]!, e2![1]!, e2![2]!)),
    ref(origem),
    num(escalas[0]!),
    ref(direction(c.w, e3![0]!, e3![1]!, e3![2]!)),
    num(escalas[1]!),
    num(escalas[2]!),
  ]);
}

/**
 * `IFCREPRESENTATIONMAP` de um protótipo: a malha em comprimento unitário, com origem na identidade. Criada uma vez por protótipo (a mesma para
 * todas as cortinas). Malha inválida devolve `null`: as peças dele não saem.
 */
function mapaDoProtipo(c: IfcCtx, proto: IfcCurtainPrototypeGeo, mapas: Map<number, number | null>): number | null {
  const known = mapas.get(proto.proto);
  if (known !== undefined) return known;
  let id: number | null = null;
  const face = faceSetOf(c.w, proto.mesh, 0);
  if (face !== null) {
    const rep = c.w.add('IFCSHAPEREPRESENTATION', [ref(c.ctx), stepString('Body'), stepString('Tessellation'), list([ref(face)])]);
    id = c.w.add('IFCREPRESENTATIONMAP', [ref(axis3(c.w, [0, 0, 0])), ref(rep)]);
  }
  mapas.set(proto.proto, id);
  return id;
}

/** `Qto_CurtainWallBaseQuantities` da parede: comprimento, área bruta, vidro e sólido visíveis e comprimento de montante. Valor não finito sai. */
function quantidadesDaCortina(c: IfcCtx, curtain: number, key: string, g: IfcCurtainWallGeo): void {
  const q = g.quantities;
  const linhas: Array<[string, number, 'IFCQUANTITYLENGTH' | 'IFCQUANTITYAREA']> = [
    ['Length', q.length, 'IFCQUANTITYLENGTH'],
    ['GrossArea', q.grossArea, 'IFCQUANTITYAREA'],
    ['GlassArea', q.glassArea, 'IFCQUANTITYAREA'],
    ['SolidArea', q.solidArea, 'IFCQUANTITYAREA'],
    ['MullionLength', q.mullionLength, 'IFCQUANTITYLENGTH'],
  ];
  const refs: string[] = [];
  for (const [nome, valor, tipo] of linhas) {
    if (!Number.isFinite(valor)) continue;
    refs.push(ref(c.w.add(tipo, [stepString(nome), OMIT, OMIT, num(valor), OMIT])));
  }
  if (refs.length === 0) return;
  const set = c.w.add('IFCELEMENTQUANTITY', [gid(`qto:${key}`), OMIT, stepString('Qto_CurtainWallBaseQuantities'), OMIT, OMIT, list(refs)]);
  c.w.add('IFCRELDEFINESBYPROPERTIES', [gid(`qto:${key}:rel`), OMIT, OMIT, OMIT, list([ref(curtain)]), ref(set)]);
}

/** Entidade de tipo: criada na primeira ocorrência e reaproveitada pelas demais do mesmo tipo do modelo. */
function tipoDe(mapa: Map<Id, TypeEntry>, typeId: Id, criar: () => number): TypeEntry {
  const known = mapa.get(typeId);
  if (known) return known;
  const entry: TypeEntry = { id: criar(), members: [] };
  mapa.set(typeId, entry);
  return entry;
}

/** Nome da peça no idioma da exportação (PT e ES em português; os demais em inglês, como no guarda-corpo). */
const nomeDaPeca = (lang: string, chave: 'montante' | 'canto' | 'vidro' | 'solido'): string => {
  const nomes = { montante: ['montante', 'mullion'], canto: ['canto', 'corner'], vidro: ['painel de vidro', 'glass panel'], solido: ['painel sólido', 'solid panel'] } as const;
  return nomes[chave][lang === 'pt' || lang === 'es' ? 0 : 1];
};

/** Montante em canto (`corner`): sai como `USERDEFINED` com `ObjectType` `CORNER`. */
const ehCanto = (mont: MullionType | undefined): boolean => mont?.profile.shape === 'corner';

/** Uma parede cortina: o `IFCCURTAINWALL`, as peças e as suas relações. Parede sem nível, sem tipo de cortina ou sem geometria não sai. */
function addCurtainWall(c: IfcCtx, g: IfcCurtainWallGeo, protos: ReadonlyMap<number, IfcCurtainPrototypeGeo>, estado: CurtainEstado): void {
  const wall = c.p.elements[g.wallId];
  if (!isWall(wall)) return;
  const type = c.p.wallTypes[wall.typeId];
  const st = storeyOf(c, wall.levelId);
  if (!st || !isCurtainType(type)) return;
  const lang = langOf(c);
  const name = wall.mark ? `${type.name} ${wall.mark}` : type.name;
  const place = localPlacement(c.w, st.place, [0, 0, 0]);
  const curtain = c.w.add('IFCCURTAINWALL', [gid(`curtain:${g.wallId}`), OMIT, stepString(name), OMIT, OMIT, ref(place), OMIT, optStr(wall.mark), OMIT]);
  c.products?.set(g.wallId, curtain);
  st.contained.push(curtain);
  tipoDe(estado.tiposParede, type.id, () =>
    c.w.add('IFCCURTAINWALLTYPE', [gid(`curtainwalltype:${type.id}`), OMIT, stepString(type.name), OMIT, OMIT, OMIT, OMIT, OMIT, OMIT, en('NOTDEFINED')]),
  ).members.push(curtain);

  const external = c.external.has(g.wallId);
  const wallProps: Array<[string, PropValue]> = [['Reference', type.code?.trim() || type.name], ['IsExternal', external]];
  if (type.fireRating != null) wallProps.push(['FireRating', `${type.fireRating} min`]);
  if (type.thermalU != null) wallProps.push(['ThermalTransmittance', type.thermalU]);
  if (type.acousticRw != null) wallProps.push(['AcousticRating', `${type.acousticRw} dB`]);
  addPropertySet(c, `pset:curtain:${g.wallId}`, 'Pset_CurtainWallCommon', wallProps, curtain);
  quantidadesDaCortina(c, curtain, `curtain:${g.wallId}`, g);

  const parts: number[] = [];
  const porProto = new Map<number, number[]>();
  let indice = 0;
  for (const inst of g.instances) {
    const proto = protos.get(inst.proto);
    if (!proto) continue;
    const map = mapaDoProtipo(c, proto, estado.mapas);
    if (map === null) continue;
    const operator = operadorDe(c, inst.matrix, st.elev);
    if (operator === null) continue;
    const mapped = c.w.add('IFCMAPPEDITEM', [ref(map), ref(operator)]);
    const rep = c.w.add('IFCSHAPEREPRESENTATION', [ref(c.ctx), stepString('Body'), stepString('MappedRepresentation'), list([ref(mapped)])]);
    const shape = c.w.add('IFCPRODUCTDEFINITIONSHAPE', [OMIT, OMIT, list([ref(rep)])]);
    const pPlace = localPlacement(c.w, st.place, [0, 0, 0]);
    const id = indice++;
    let entidade: number;
    if (proto.papel === 0) {
      const mont = proto.typeId !== null ? estado.montantes[proto.typeId] : undefined;
      const canto = ehCanto(mont);
      const peca = `${name} - ${nomeDaPeca(lang, canto ? 'canto' : 'montante')}`;
      entidade = c.w.add('IFCMEMBER', [
        gid(`curtain:${g.wallId}:member:${id}`),
        OMIT,
        stepString(peca),
        OMIT,
        canto ? stepString('CORNER') : OMIT,
        ref(pPlace),
        ref(shape),
        OMIT,
        en(canto ? 'USERDEFINED' : 'MULLION'),
      ]);
      if (proto.typeId !== null && mont) {
        const tipo = proto.typeId;
        tipoDe(estado.tiposMontante, tipo, () =>
          c.w.add('IFCMEMBERTYPE', [gid(`membertype:${tipo}`), OMIT, stepString(mont.name), OMIT, OMIT, OMIT, OMIT, OMIT, OMIT, en('MULLION')]),
        ).members.push(entidade);
      }
      const props: Array<[string, PropValue]> = [['Reference', mont?.code?.trim() || mont?.name || 'montante'], ['IsExternal', external], ['LoadBearing', false]];
      addPropertySet(c, `pset:curtain:${g.wallId}:member:${id}`, 'Pset_MemberCommon', props, entidade);
    } else {
      const pn = proto.typeId !== null ? estado.paineis[proto.typeId] : undefined;
      const vidro = proto.papel === 1;
      const peca = `${name} - ${nomeDaPeca(lang, vidro ? 'vidro' : 'solido')}`;
      entidade = c.w.add('IFCPLATE', [
        gid(`curtain:${g.wallId}:plate:${id}`),
        OMIT,
        stepString(peca),
        OMIT,
        OMIT,
        ref(pPlace),
        ref(shape),
        OMIT,
        en(vidro ? 'CURTAIN_PANEL' : 'SHEET'),
      ]);
      if (proto.typeId !== null && pn) {
        const tipo = proto.typeId;
        tipoDe(estado.tiposPainel, tipo, () =>
          c.w.add('IFCPLATETYPE', [gid(`platetype:${tipo}`), OMIT, stepString(pn.name), OMIT, OMIT, OMIT, OMIT, OMIT, OMIT, en(pn.kind === 'glass' ? 'CURTAIN_PANEL' : 'SHEET')]),
        ).members.push(entidade);
      }
      const props: Array<[string, PropValue]> = [['Reference', pn?.code?.trim() || pn?.name || 'painel'], ['IsExternal', external]];
      if (pn?.fireRating?.trim()) props.push(['FireRating', pn.fireRating.trim()]);
      if (typeof pn?.uValue === 'number' && Number.isFinite(pn.uValue)) props.push(['ThermalTransmittance', pn.uValue]);
      addPropertySet(c, `pset:curtain:${g.wallId}:plate:${id}`, 'Pset_PlateCommon', props, entidade);
    }
    parts.push(entidade);
    const lista = porProto.get(inst.proto) ?? [];
    lista.push(entidade);
    porProto.set(inst.proto, lista);
  }
  if (parts.length > 0) c.w.add('IFCRELAGGREGATES', [gid(`curtainagg:${g.wallId}`), OMIT, OMIT, OMIT, ref(curtain), list(parts.map(ref))]);
  // Material por protótipo: uma associação com todas as peças dele (cor e transparência do vidro vêm do material).
  for (const [protoId, members] of porProto) {
    const proto = protos.get(protoId);
    if (!proto || proto.materialId === null) continue;
    c.w.add('IFCRELASSOCIATESMATERIAL', [gid(`mat:curtain:${g.wallId}:${protoId}`), OMIT, OMIT, OMIT, list(members.map(ref)), ref(materialOf(c, proto.materialId))]);
  }
}

/**
 * Paredes cortina resolvidas pelo kernel: `IFCCURTAINWALL` contido no pavimento, com as peças agregadas e as relações de tipo. Chamar depois dos
 * pavimentos e antes de `addQuantities`. Sem cortina resolvida, não escreve nada.
 */
export function addCurtainWalls(c: IfcCtx, geo: IfcCurtainGeo): void {
  const protos = new Map(geo.prototypes.map((p) => [p.proto, p] as const));
  const estado: CurtainEstado = {
    mapas: new Map(),
    tiposParede: new Map(),
    tiposMontante: new Map(),
    tiposPainel: new Map(),
    montantes: mullionTypesOf(c.p),
    paineis: curtainPanelTypesOf(c.p),
  };
  for (const g of geo.walls) addCurtainWall(c, g, protos, estado);
  for (const [prefixo, mapa] of [
    ['curtainwalltyperel', estado.tiposParede],
    ['membertyperel', estado.tiposMontante],
    ['platetyperel', estado.tiposPainel],
  ] as const) {
    for (const [typeId, entry] of mapa) {
      if (entry.members.length === 0) continue;
      c.w.add('IFCRELDEFINESBYTYPE', [gid(`${prefixo}:${typeId}`), OMIT, OMIT, OMIT, list(entry.members.map(ref)), ref(entry.id)]);
    }
  }
}

/** Aviso de exportação: a cortina sem geometria do kernel saiu como parede genérica (`IFCWALL`). */
export function avisoCortinaSemKernel(c: IfcCtx, nome: string): void {
  c.avisos?.push(t(langOf(c), 'io_ifc_curtain_without_kernel', { name: nome }));
}

/** Contorno das cortinas do kernel para decidir a face externa: as paredes comuns e as cortinas entram juntas no teste de vizinhança. */
export const footprintsDaCortina = (geo: IfcGeometry): IfcWallGeo[] =>
  (geo.curtains?.walls ?? []).map((w) => ({ wallId: w.wallId, footprints: [w.footprint], baseZ: 0, height: 0 }));
