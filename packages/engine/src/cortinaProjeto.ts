/**
 * Liga o modelo ao adaptador da parede cortina (decisão 0056, fase 1): do `Project` à `EntradaCenaCortina` do kernel (`kernelCortina.ts`), e as
 * assinaturas por cortina. TS puro, sem kernel: nada aqui calcula grade, peça ou vidro (isso é do Rust).
 *
 * Cortina = parede cujo tipo tem `family: 'curtain'` e `curtain` preenchido (`isCurtainType`). Ela NÃO entra no resolvedor de camadas da seção 1
 * (`paredesDeCamadasDoNivel` a exclui) e vai só para as seções 100 a 105.
 *
 * Fase 2: a instância entra com as sobrescritas JÁ traduzidas para o adaptador (`cortinaSobrescritas.ts`): linhas extras, segmentos removidos, linhas
 * sobrescritas e painéis por célula. Assinatura (ADR §9): `hashTexto` do que altera a geometria da cortina (eixo, flecha, cota e altura JÁ resolvidas
 * pelas anexações, tipo, tipos de montante e de painel referenciados, instância e sobrescritas). Mudar uma sobrescrita muda o hash da cortina e o do
 * nível; a chave de cache é sempre o hash, nunca a serialização da grade.
 */
import {
  curtainPanelTypesOf,
  isCurtainType,
  isWall,
  mullionTypesOf,
  openingTypeById,
  papeisDeMontante,
  wallLength,
  type CurtainPanelType,
  type CurtainSpec,
  type Id,
  type MullionType,
  type Project,
  type Wall,
  type WallType,
} from '@hestia/model';
import { hashTexto } from './assinaturasNivel.ts';
import { attachTargets } from './attachTargets.ts';
import { resolveAllRoofs } from './roofs.ts';
import { wallZRange, type WallZ } from './wallZ.ts';
import type { CortinaKernel, EixoGradeKernel, EntradaCenaCortina, MontanteKernel, PainelKernel, TipoCortinaKernel } from './kernelCortina.ts';
import { ID_AUSENTE_CORTINA } from './kernelCortinaTabelas.ts';
import { sobrescritasDaInstancia } from './cortinaSobrescritas.ts';
import { colunasDoTipoAbertura } from './kernelA3.ts';
import { extremidadesDaCortina, quadrosDosNiveis } from './cortinaExtremidades.ts';
import { DEFAULT_JOIN_TOL } from './joins.ts';

/** Parede cortina do projeto com o tipo já resolvido. */
export interface ParedeCortina {
  wall: Wall;
  tipo: WallType & { family: 'curtain'; curtain: CurtainSpec };
}

const temCortinaMemo = new WeakMap<Project, boolean>();

/** Esta parede é uma cortina? (tipo válido de cortina) */
export function ehParedeCortina(p: Project, w: Wall): boolean {
  return isCurtainType(p.wallTypes[w.typeId]);
}

/** Há alguma parede cortina no projeto? Memorizado por projeto (o motor é imutável), para a 3D e a planta perguntarem a cada quadro. */
export function temCortina(p: Project): boolean {
  let r = temCortinaMemo.get(p);
  if (r === undefined) {
    r = false;
    for (const e of Object.values(p.elements)) {
      if (isWall(e) && ehParedeCortina(p, e)) {
        r = true;
        break;
      }
    }
    temCortinaMemo.set(p, r);
  }
  return r;
}

const assinaturaMemo = new WeakMap<Project, string>();

/**
 * Hash de todas as cortinas do projeto (vazio sem cortina), para as chaves de cache de quem desenha (lote 3D, camada da planta): muda só quando a
 * geometria de alguma cortina muda. Memorizado por projeto; não precisa do kernel.
 */
export function assinaturaDasCortinas(p: Project): string {
  if (!temCortina(p)) return '';
  let h = assinaturaMemo.get(p);
  if (h === undefined) assinaturaMemo.set(p, (h = entradaCortinaDoProjeto(p).assinatura));
  return h;
}

/** Paredes cortina do projeto, na ordem de criação (`order`). */
export function paredesCortina(p: Project): ParedeCortina[] {
  const out: ParedeCortina[] = [];
  for (const e of Object.values(p.elements)) {
    if (!isWall(e)) continue;
    const tipo = p.wallTypes[e.typeId];
    if (isCurtainType(tipo)) out.push({ wall: e, tipo });
  }
  return out.sort((a, b) => a.wall.order - b.wall.order);
}

/**
 * Paredes de um nível que passam pelo resolvedor de camadas (seção 1 do Rust e `resolveLevelTs`): as paredes comuns. A cortina fica de fora.
 * Sem cortina no projeto devolve a lista de entrada sem copiar.
 */
export function semCortina(p: Project, paredes: Wall[]): Wall[] {
  return temCortina(p) ? paredes.filter((w) => !ehParedeCortina(p, w)) : paredes;
}

/** Cota real (base e altura, com as anexações) das cortinas, por nível: uma resolução de pisos, lajes e telhados só se alguma cortina anexa. */
function zDasCortinas(p: Project, cortinas: readonly ParedeCortina[]): Map<Id, WallZ> {
  const porNivel = new Map<Id, Wall[]>();
  for (const c of cortinas) {
    const l = porNivel.get(c.wall.levelId);
    if (l) l.push(c.wall);
    else porNivel.set(c.wall.levelId, [c.wall]);
  }
  const out = new Map<Id, WallZ>();
  for (const paredes of porNivel.values()) {
    const { floors, slabs } = attachTargets(p, paredes, false);
    const roofs = paredes.some((w) => w.attachTopToRoof === true) ? resolveAllRoofs(p) : [];
    for (const w of paredes) out.set(w.id, wallZRange(p, w, floors, slabs, roofs));
  }
  return out;
}

/** Base e altura (z) de UMA parede cortina, a mesma que o adaptador manda ao kernel (`zBase`, `height`). */
export function zDaCortina(p: Project, w: Wall): WallZ | undefined {
  return zDasCortinas(p, [{ wall: w, tipo: p.wallTypes[w.typeId] as ParedeCortina['tipo'] }]).get(w.id);
}

const VIDRO = ['clear', 'ribbed', 'smoke', 'green', 'bronze', 'frosted', 'wired', 'laminated', 'tempered'];

const montanteDe = (m: MullionType): MontanteKernel => ({
  id: m.id,
  shape: m.profile.shape,
  width: m.profile.width,
  depth: m.profile.depth,
  ...(m.profile.thickness !== undefined ? { thickness: m.profile.thickness } : {}),
  ...(m.profile.widthBack !== undefined ? { widthBack: m.profile.widthBack } : {}),
  ...(m.offset !== undefined ? { offset: m.offset } : {}),
  ...(m.position !== undefined ? { position: m.position } : {}),
  materialId: m.materialId,
});

const painelDe = (pn: CurtainPanelType): PainelKernel => ({
  id: pn.id,
  kind: pn.kind,
  thickness: pn.thickness,
  ...(pn.offset !== undefined ? { offset: pn.offset } : {}),
  ...(pn.bite !== undefined ? { bite: pn.bite } : {}),
  materialId: pn.materialId,
  glassKind: Math.max(0, VIDRO.indexOf(pn.glassKind ?? 'clear')),
});

function tipoDe(t: WallType & { curtain: CurtainSpec }): TipoCortinaKernel {
  const c = t.curtain;
  // O limiar da sobra é do sistema inteiro (CurtainSpec.minRemainder): vale para os dois eixos.
  const eixo = (e: CurtainSpec['u']): EixoGradeKernel => ({ ...e, ...(c.minRemainder !== undefined ? { minRemainder: c.minRemainder } : {}) });
  return {
    id: t.id,
    depth: c.depth,
    u: eixo(c.u),
    v: eixo(c.v),
    mullions: { ...c.mullions },
    defaultPanelTypeId: c.defaultPanelTypeId,
    ...(c.minCell !== undefined ? { minCell: c.minCell } : {}),
    ...(c.facetMaxChord !== undefined ? { facetMaxChord: c.facetMaxChord } : {}),
  };
}

/** Os tipos de montante e de painel que o sistema referencia existem? Sem isso o adaptador falharia; a cortina inválida só não é desenhada. */
function referenciasOk(c: CurtainSpec, mont: Record<Id, MullionType>, pain: Record<Id, CurtainPanelType>): boolean {
  if (!pain[c.defaultPanelTypeId]) return false;
  return papeisDeMontante(c.mullions).every((id) => id === null || mont[id] !== undefined);
}

/** Resultado da ligação modelo → kernel. */
export interface EntradaCortinaProjeto {
  entrada: EntradaCenaCortina;
  /** `nivel_num` por nível (índice em `p.levels`). */
  nivelDe: Map<Id, number>;
  /** Número do material por id (o mesmo que o adaptador grava nas seções). */
  materialDe: Map<Id, number>;
  /** Assinatura de cada cortina (hash). */
  assinaturas: Map<Id, string>;
  /** Hash de todas as cortinas e da ordem dos níveis: igual = a cena do kernel já está certa. */
  assinatura: string;
  /** Cortinas ignoradas por referência a tipo inexistente (o validador do modelo as aponta). */
  ignoradas: Id[];
}

/**
 * Projeto → entrada do adaptador. `materiaisAnteriores` mantém o número de cada material entre montagens (as seções só mudam onde o modelo mudou).
 */
export function entradaCortinaDoProjeto(p: Project, materiaisAnteriores?: ReadonlyMap<Id, number>): EntradaCortinaProjeto {
  const nivelDe = new Map<Id, number>(p.levels.map((l, i) => [l.id, i] as const));
  const materialDe = new Map<Id, number>(materiaisAnteriores ?? []);
  let proximo = Math.max(0, ...materialDe.values()) + 1;
  const materialNum = (id: string | null | undefined): number => {
    if (id === null || id === undefined) return ID_AUSENTE_CORTINA;
    let n = materialDe.get(id);
    if (n === undefined) materialDe.set(id, (n = proximo++));
    return n;
  };
  const mont = mullionTypesOf(p);
  const pain = curtainPanelTypesOf(p);
  const todas = paredesCortina(p).filter((c) => nivelDe.has(c.wall.levelId));
  const ignoradas: Id[] = [];
  const validas = todas.filter((c) => {
    const ok = referenciasOk(c.tipo.curtain, mont, pain);
    if (!ok) ignoradas.push(c.wall.id);
    return ok;
  });
  const z = zDasCortinas(p, validas);
  // Junção entre paredes (fase 3, seção 110): a vizinhança de cada ponta, com a tolerância de junção do projeto. Só os níveis que têm cortina entram.
  const zDeCortina = new Map<Id, { profundidade: number; z: { z0: number; top: number } }>(
    validas.map(({ wall, tipo }) => {
      const zz = z.get(wall.id)!;
      return [wall.id, { profundidade: tipo.curtain.depth, z: { z0: zz.z0, top: zz.z0 + zz.height } }] as const;
    }),
  );
  const quadros = quadrosDosNiveis(p, new Set(validas.map((c) => c.wall.levelId)), zDeCortina);
  const tolJuncao = p.settings?.joinTolerance ?? DEFAULT_JOIN_TOL;
  const tipos = new Map<Id, TipoCortinaKernel>();
  const montUsados = new Map<Id, MullionType>();
  const painUsados = new Map<Id, CurtainPanelType>();
  const aberturasUsadas = new Set<Id>();
  const cortinas: CortinaKernel[] = [];
  const assinaturas = new Map<Id, string>();
  for (const { wall: w, tipo } of validas) {
    const c = tipo.curtain;
    if (!tipos.has(tipo.id)) tipos.set(tipo.id, tipoDe(tipo));
    const doTipo = papeisDeMontante(c.mullions).filter((id): id is Id => id !== null);
    for (const id of doTipo) montUsados.set(id, mont[id]!);
    painUsados.set(c.defaultPanelTypeId, pain[c.defaultPanelTypeId]!);
    const inst = w.curtain;
    const painelDaInstancia = inst?.defaultPanelTypeId;
    if (painelDaInstancia && pain[painelDaInstancia]) painUsados.set(painelDaInstancia, pain[painelDaInstancia]!);
    const zz = z.get(w.id)!;
    // Sobrescritas (fase 2): a referência a montante ou painel ausente sai, e os tipos que elas usam entram na entrada.
    const sob = sobrescritasDaInstancia(inst, { u: wallLength(w), v: zz.height }, mont, pain, (id) => openingTypeById(p, id) !== undefined);
    for (const id of sob.montantes) montUsados.set(id, mont[id]!);
    for (const id of sob.paineis) painUsados.set(id, pain[id]!);
    for (const id of sob.aberturas) aberturasUsadas.add(id);
    const meu = quadros.get(w.levelId)?.find((q) => q.id === w.id);
    const ext = meu ? extremidadesDaCortina(meu, w, quadros.get(w.levelId)!, tolJuncao) : null;
    const k: CortinaKernel = {
      id: w.id,
      levelNum: nivelDe.get(w.levelId)!,
      typeId: tipo.id,
      a: { x: w.a.x, y: w.a.y },
      b: { x: w.b.x, y: w.b.y },
      zBase: zz.z0,
      height: zz.height,
      sag: w.sag,
      flipped: w.flipped,
      locationLine: w.locationLine,
      ...(inst?.grid && (inst.grid.u || inst.grid.v) ? { grid: { ...(inst.grid.u ? { u: inst.grid.u } : {}), ...(inst.grid.v ? { v: inst.grid.v } : {}) } } : {}),
      ...(painelDaInstancia && pain[painelDaInstancia] ? { defaultPanelTypeId: painelDaInstancia } : {}),
      ...(sob.sobrescritas ? { sobrescritas: sob.sobrescritas } : {}),
      ...(inst?.host ? { hospedeiro: { wallId: inst.host.wallId, offset: inst.host.offset, width: inst.host.width, sill: inst.host.sill, height: inst.host.height } } : {}),
      ...(ext && ext.some((x) => x.vizinhaId !== null || x.noJoin) ? { extremidades: ext } : {}),
    };
    cortinas.push(k);
    assinaturas.set(
      w.id,
      hashTexto(JSON.stringify([k, tipo.curtain, doTipo.map((id) => mont[id]), pain[c.defaultPanelTypeId], painelDaInstancia ? pain[painelDaInstancia] : null, inst ?? null, sob.aberturas.map((id) => openingTypeById(p, id) ?? null)])),
    );
  }
  const assinatura = hashTexto([...assinaturas].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([id, h]) => `${id}:${h}`).join('|') + `#${p.levels.map((l) => l.id).join(',')}`);
  return {
    entrada: {
      montantes: [...montUsados.values()].map(montanteDe),
      paineis: [...painUsados.values()].map(painelDe),
      tipos: [...tipos.values()],
      cortinas,
      tiposAbertura: [...aberturasUsadas].sort().map((id) => ({ id, valores: colunasDoTipoAbertura(openingTypeById(p, id)!) })),
      materialNum,
    },
    nivelDe,
    materialDe,
    assinaturas,
    assinatura,
    ignoradas,
  };
}

const porNivelMemo = new WeakMap<Project, Map<Id, string>>();

/**
 * Hash das cortinas de cada nível (só dos níveis que têm): a chave do lote 3D de um nível muda só quando uma cortina DELE muda (ADR §9). A cota e a
 * altura de cada cortina já entram na assinatura dela; a ordem dos níveis entra no hash geral (`assinatura`), não aqui.
 */
export function assinaturasDasCortinasPorNivel(p: Project): Map<Id, string> {
  if (!temCortina(p)) return new Map();
  let m = porNivelMemo.get(p);
  if (!m) {
    const e = entradaCortinaDoProjeto(p);
    const lista = new Map<Id, string[]>();
    for (const c of e.entrada.cortinas) {
      const nivel = p.elements[c.id]!;
      const l = isWall(nivel) ? nivel.levelId : '';
      const x = lista.get(l);
      const s = `${c.id}:${e.assinaturas.get(c.id)}`;
      if (x) x.push(s);
      else lista.set(l, [s]);
    }
    m = new Map([...lista].map(([l, xs]) => [l, hashTexto(xs.sort().join('|'))] as const));
    porNivelMemo.set(p, m);
  }
  return m;
}
