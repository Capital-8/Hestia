// Projetos de estresse da sub-etapa A3a do kernel Rust (decisão 0047 §7): os da A1 (`projetoDeEstresse`: paredes retas e
// curvas, linhas de localização, paredes invertidas, tipos de espessura variada) com aberturas determinísticas pela
// semente: todo o catálogo padrão (130 tipos: as 16 famílias de planta, 0 a 4 folhas, composição, nominalRef leaf),
// tipos sintéticos com folga do vão (inclusive negativa, que vale 0), vão livre, vãos largos, overrides de peitoril (inclusive
// 0) e de altura (inclusive 0 e negativo), flips e deslocamentos por toda a parede. Mais os casos de limiar da A3a.
// Nada de projeto real: só geometria sintética.
import { ProjectStore, compositionOfType, createEmptyProject, makeWall, openingTypeById, type Command, type Opening, type OpeningType, type Project, type WallType, type WrapMode } from '@hestia/model';
import { aleatorio, projetoDeEstresse, type OpcoesEstresse } from './kernel-a1-estresse.mts';

/** Tipos sintéticos de abertura, acrescentados ao catálogo (não passam por `upsertOpeningType`: a folga negativa é recusada lá de propósito). */
export function tiposSinteticos(base: OpeningType): OpeningType[] {
  const t = (id: string, extra: Partial<OpeningType>): OpeningType => ({ ...base, id, name: id, code: id, composition: undefined, nominalRef: undefined, spanGap: undefined, roughOversize: undefined, ...extra }) as OpeningType;
  return [
    t('ot_x_folga', { kind: 'door', width: 0.8, height: 2.1, sill: 0, plan: 'swing', leaves: 1, roughOversize: { w: 0.04, h: 0.02 } }),
    t('ot_x_folga_negativa', { kind: 'door', width: 1.6, height: 2.1, sill: 0, plan: 'double', leaves: 2, roughOversize: { w: -0.1, h: -0.05 } }),
    t('ot_x_janela', { kind: 'window', width: 1.2, height: 1.2, sill: 1.0, plan: 'casement', leaves: 2, roughOversize: { w: 0.02, h: 0.02 } }),
    t('ot_x_livre', { kind: 'door', width: 2.4, height: 2.2, sill: 0, plan: 'fixed', leaves: 0 }),
    t('ot_x_larga', { kind: 'door', width: 3.2, height: 2.4, sill: 0, plan: 'garage', leaves: 1, roughOversize: { w: 0.05, h: 0.05 } }),
    ...tiposDeRetorno(t),
    t('ot_x_folha', { kind: 'window', width: 1.0, height: 1.0, sill: 0.9, plan: 'sliding', leaves: 2, nominalRef: 'leaf', spanGap: { w: 0.1, h: 0.06 } }),
  ];
}

const FECHAMENTOS: Array<OpeningType['closure']> = ['inherit', 'none', 'exterior', 'interior', 'both'];
const ESTILOS: Array<NonNullable<OpeningType['frameStyle']>> = ['rebate', 'simple', 'aduela', 'block'];

/**
 * Tipos de abertura da A3b: fechamento (inherit e os quatro modos) x estilo do batente (com folha), vão livre, janelas,
 * alizar do tipo e da composição, modos de profundidade do batente, perfis largos e vãos estreitos (a camada não cabe).
 */
function tiposDeRetorno(t: (id: string, extra: Partial<OpeningType>) => OpeningType): OpeningType[] {
  const out: OpeningType[] = [];
  for (const c of FECHAMENTOS) {
    for (const e of ESTILOS) out.push(t(`ot_r_${c}_${e}`, { kind: e === 'simple' || e === 'block' ? 'window' : 'door', width: 0.9, height: 2.1, sill: e === 'simple' || e === 'block' ? 0.9 : 0, plan: 'swing', leaves: 1, closure: c, frameStyle: e }));
    out.push(t(`ot_r_${c}_livre`, { kind: 'door', width: 1.0, height: 2.1, sill: 0, plan: 'fixed', leaves: 0, closure: c }));
  }
  const comAlizar = t('ot_r_alizar', { kind: 'door', width: 0.9, height: 2.1, sill: 0, plan: 'swing', leaves: 1, closure: 'both', casing: { width: 0.08, thickness: 0.02 } });
  out.push(comAlizar);
  const base = t('ot_r_alizar_comp', { kind: 'door', width: 0.9, height: 2.1, sill: 0, plan: 'swing', leaves: 1, closure: 'both', casing: { width: 0.07, thickness: 0.02 } });
  const composicao = compositionOfType(base);
  out.push({ ...base, id: 'ot_r_alizar_comp', casing: undefined, composition: composicao });
  out.push({ ...base, id: 'ot_r_alizar_comp_nenhum', name: 'ot_r_alizar_comp_nenhum', casing: undefined, composition: { ...composicao, casing: { ...composicao.casing!, faces: 'none' } } } as OpeningType);
  for (const modo of ['wall', 'core', 'fixed'] as const) {
    for (const [fd, fw, lt] of [[0.09, 0.04, 0.035], [0.5, 0.12, 0.06], [0, 0.02, 0.02]] as const) {
      out.push(t(`ot_r_prof_${modo}_${fd}`, { kind: 'door', width: 1.2, height: 2.1, sill: 0, plan: 'swing', leaves: 1, closure: 'both', frameDepthMode: modo, frameDepth: fd, frameWidth: fw, leafThickness: lt }));
      out.push(t(`ot_r_janela_${modo}_${fd}`, { kind: 'window', width: 1.4, height: 1.1, sill: 1, plan: 'casement', leaves: 2, closure: 'both', frameStyle: 'simple', frameDepthMode: modo, frameDepth: fd, frameWidth: fw }));
    }
  }
  for (const w of [0.05, 0.07, 0.1, 0.12]) out.push(t(`ot_r_estreito_${w}`, { kind: 'door', width: w, height: 2.1, sill: 0, plan: 'fixed', leaves: 0, closure: 'both' }));
  return out;
}

/** Tipos de parede da A3b: camadas que envolvem (inclusive uma de 5e-7 m, abaixo do piso) e os quatro `wrapInserts`. */
export function tiposDeParedeRetorno(base: WallType): WallType[] {
  const c = (fn: WallType['layers'][number]['function'], espessura: number, wraps: boolean): WallType['layers'][number] => ({ function: fn, materialId: 'mat_reboco', thickness: espessura, wraps });
  const modos: WrapMode[] = ['none', 'exterior', 'interior', 'both'];
  const out = modos.map((m) => ({ ...base, id: `wt_r_${m}`, name: `wt_r_${m}`, code: `wt_r_${m}`, wrapInserts: m, layers: [c('finish1', 0.02, true), c('substrate', 0.015, true), c('structure', 0.14, false), c('substrate', 0.02, true), c('finish2', 0.01, true)] }) as WallType);
  out.push({ ...base, id: 'wt_r_assimetrico', name: 'wt_r_assimetrico', code: 'wt_r_assimetrico', wrapInserts: 'both', layers: [c('finish2', 0.03, true), c('finish1', 0.0000005, true), c('structure', 0.1, false), c('finish2', 0.03, true)] } as WallType);
  return out;
}

export interface OpcoesEstresseA3a extends OpcoesEstresse {
  /** Probabilidade de uma parede ter aberturas (padrão 0,8). */
  comVaos?: number;
  /** Troca o tipo de 70% das paredes por tipos com camadas que envolvem (A3b). Padrão: sim. */
  comTiposDeRetorno?: boolean;
}

/** Projeto de estresse da A1 com aberturas nas paredes. */
export function projetoDeEstresseA3a(semente: number, opcoes: OpcoesEstresseA3a = {}): Project {
  const p0 = projetoDeEstresse(semente, opcoes);
  const r = aleatorio(semente * 104729 + 7);
  const catalogo = Object.values(p0.openingTypes);
  const sinteticos = tiposSinteticos(catalogo[0]!);
  const tiposP = tiposDeParedeRetorno(Object.values(p0.wallTypes)[0]!);
  const trocar = opcoes.comTiposDeRetorno ?? true;
  const sorteio = aleatorio(semente * 7919 + 3);
  const elementos = trocar
    ? Object.fromEntries(Object.entries(p0.elements).map(([id, e]) => [id, e.kind === 'wall' && sorteio() < 0.7 ? { ...e, typeId: tiposP[Math.floor(sorteio() * tiposP.length)]!.id } : e] as const))
    : p0.elements;
  const p: Project = {
    ...p0,
    elements: elementos,
    wallTypes: { ...p0.wallTypes, ...Object.fromEntries(tiposP.map((w) => [w.id, w] as const)) },
    openingTypes: { ...p0.openingTypes, ...Object.fromEntries(sinteticos.map((t) => [t.id, t] as const)) },
  };
  const tipos = [...catalogo, ...sinteticos];
  const escolhe = <T,>(v: readonly T[]): T => v[Math.floor(r() * v.length)]!;
  const cmds: Command[] = [];
  let n = 0;
  for (const w of Object.values(p.elements)) {
    if (w.kind !== 'wall' || r() >= (opcoes.comVaos ?? 0.8)) continue;
    const quantas = 1 + Math.floor(r() * 3);
    for (let k = 0; k < quantas; k++) {
      const t = escolhe(tipos);
      const o: Opening = {
        id: `o_${semente}_${n++}`,
        kind: t.kind,
        typeId: t.id,
        hostId: w.id,
        offset: r() * 8,
        flipHand: r() < 0.5,
        flipFacing: r() < 0.5,
        sillOverride: r() < 0.3 ? (r() < 0.25 ? 0 : r() * 1.2) : null,
        mark: '',
        ...(r() < 0.3 ? { heightOverride: r() < 0.2 ? (r() < 0.5 ? 0 : -0.5) : 0.4 + r() * 2.1 } : {}),
      };
      cmds.push({ type: 'addOpening', opening: o });
    }
  }
  const store = new ProjectStore(p);
  store.exec({ type: 'batch', commands: cmds });
  return store.project;
}

// ---------------------------------------------------------------------------------------------------------------
// Casos de limiar da A3a. Os limiares de decisão do TypeScript que o Rust reproduz: o sinal da altura do override
// (`openingHeight`: > 0), o override de peitoril (`??`: o 0 conta), o piso da folga (`nonNeg`), o piso do radicando do desvio
// da face em parede curva (`max(0, R² − h²)`) e a folga de 2 cm do furo. Cada caso é um projeto de uma parede e uma
// abertura; o par abaixo/acima cai em ramos diferentes do motor (o teste prova que o TS discrimina) e o Rust tem de
// acompanhá-lo nos dois lados. Sem margem relativa onde o nominal é 0 ou a variável é um flag.

export interface CasoDeLimiarA3a {
  limiar: string;
  lado: 'abaixo' | 'acima' | 'sensibilidade';
  projeto: Project;
}

interface VaoDoCaso {
  sag?: number;
  comprimento?: number;
  tipo: Partial<OpeningType>;
  vao?: Partial<Opening>;
}

function projetoDeVao({ sag = 0, comprimento = 6, tipo, vao }: VaoDoCaso, nome: string): Project {
  const p = createEmptyProject(nome);
  const base = Object.values(p.openingTypes)[0]!;
  const t = { ...base, id: 'ot_caso', name: 'caso', code: 'caso', composition: undefined, nominalRef: undefined, spanGap: undefined, roughOversize: undefined, kind: 'door', width: 0.8, height: 2.1, sill: 0.9, plan: 'swing', leaves: 1, ...tipo } as OpeningType;
  p.openingTypes[t.id] = t;
  const store = new ProjectStore(p);
  const cmds: Command[] = [
    { type: 'addWall', wall: makeWall({ id: 'W', typeId: p.defaults.wallTypeId, levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: comprimento, y: 0 }, locationLine: 'wallCenter', flipped: false, sag, height: 2.8 }) },
    { type: 'addOpening', opening: { id: 'O', kind: t.kind, typeId: t.id, hostId: 'W', offset: comprimento / 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '', ...vao } },
  ];
  store.exec({ type: 'batch', commands: cmds });
  const q = store.project;
  // sanidade: o tipo entrou como foi pedido
  if (openingTypeById(q, 'ot_caso') === undefined) throw new Error('tipo do caso ausente');
  return q;
}

/** Margem relativa de cada lado de um limiar contínuo, como a da A1. */
export const MARGEM_LIMIAR_A3A = 1e-6;

export function casosDeLimiarA3a(): CasoDeLimiarA3a[] {
  const c: CasoDeLimiarA3a[] = [];
  const par = (limiar: string, abaixo: VaoDoCaso, acima: VaoDoCaso, nome: string): void => {
    c.push({ limiar, lado: 'abaixo', projeto: projetoDeVao(abaixo, `${nome}-abaixo`) });
    c.push({ limiar, lado: 'acima', projeto: projetoDeVao(acima, `${nome}-acima`) });
  };
  // heightOverride > 0: 0 e negativo valem a altura do tipo; positivo, mesmo minúsculo, vale ele.
  par('heightOverride > 0 · zero (usa a do tipo) x 1e-9 (usa o override)', { tipo: {}, vao: { heightOverride: 0 } }, { tipo: {}, vao: { heightOverride: 1e-9 } }, 'altura-zero');
  par('heightOverride > 0 · -1e-9 (usa a do tipo) x 1e-9 (usa o override)', { tipo: {}, vao: { heightOverride: -1e-9 } }, { tipo: {}, vao: { heightOverride: 1e-9 } }, 'altura-negativa');
  // sillOverride ?? t.sill: null usa o do tipo; 0 é override.
  par('sillOverride ?? t.sill · null x 0 (o 0 conta como override)', { tipo: {}, vao: { sillOverride: null } }, { tipo: {}, vao: { sillOverride: 0 } }, 'peitoril-zero');
  par('sillOverride ?? t.sill · null x 1e-9', { tipo: {}, vao: { sillOverride: null } }, { tipo: {}, vao: { sillOverride: 1e-9 } }, 'peitoril-1e-9');
  // nonNeg da folga: negativa vale 0; positiva soma.
  par('roughOversize · negativa (vale 0) x positiva', { tipo: { roughOversize: { w: -0.05, h: -0.05 } } }, { tipo: { roughOversize: { w: 0.05, h: 0.05 } } }, 'folga');
  c.push({ limiar: 'roughOversize · folga negativa vale 0 (nonNeg)', lado: 'sensibilidade', projeto: projetoDeVao({ tipo: { roughOversize: { w: -0.05, h: -0.05 } } }, 'folga-negativa') });
  // Folga de 2 cm do furo (CUT_MARGIN), reta e curva: qualquer mutação muda o retângulo em milímetros.
  c.push({ limiar: 'CUT_MARGIN 0,02 · parede reta', lado: 'sensibilidade', projeto: projetoDeVao({ tipo: {} }, 'margem-reta') });
  c.push({ limiar: 'CUT_MARGIN 0,02 · parede curva', lado: 'sensibilidade', projeto: projetoDeVao({ sag: 1, tipo: {} }, 'margem-curva') });
  c.push({ limiar: 'cutHalfOf · desvio das faces, flecha negativa', lado: 'sensibilidade', projeto: projetoDeVao({ sag: -1.2, tipo: { width: 1.4 } }, 'desvio-negativo') });
  // Radicando do desvio: corda 1 m e flecha 0,5 m dão R = 0,5 m. Meia largura logo abaixo de R: radicando positivo;
  // logo acima: o piso em 0 (desvio = R) decide.
  const R = 0.5;
  par(
    'cutHalfOf · piso do radicando max(0, R² − h²) (meia largura 0,5 = R)',
    { comprimento: 1, sag: 0.5, tipo: { width: 2 * R * (1 - MARGEM_LIMIAR_A3A) } },
    { comprimento: 1, sag: 0.5, tipo: { width: 2 * R * (1 + MARGEM_LIMIAR_A3A) } },
    'radicando',
  );
  return c;
}
