/**
 * Adaptador da parede cortina para o kernel Rust (decisão 0056, fase 1; esquema v14, seções 100 a 105). NÃO calcula geometria: só monta as seções a
 * partir de uma entrada neutra (os tipos de montante e de painel, os tipos de cortina e as cortinas, já com os nomes do modelo: `fixedNumber`, `justify`,
 * `minRemainder`...). O Rust não conhece o `Project`; quem liga o adaptador ao modelo (`wallCurtainTypes.ts`, fase 0) e ao render (`cortina3d.ts`) é a
 * integração da fase 1, e o adaptador NÃO está ligado a nenhum render ainda.
 *
 * A cortina SAI da seção 1 `paredes` (o `kernelA1.ts` a exclui) e entra só aqui: o resolvedor de junções por camadas nunca a vê.
 *
 * Numeração estável: cada linha tem um `id_num` internado por uma chave textual. Passando a cena anterior em `anterior`, as chaves que já existiam mantêm o
 * número e as novas ganham o próximo; assim editar uma cortina só muda as linhas dela. O envio e a diferença por linhas ficam em `kernelCortinaEnvio.ts`; as
 * tabelas, em `kernelCortinaTabelas.ts`; a leitura das saídas das consultas, em `kernelCortinaConsultas.ts`.
 */
import {
  COLUNAS_CORTINA,
  ENUM_CORTINA,
  HERDA_CORTINA,
  ID_AUSENTE_CORTINA,
  NOMES_SECOES_CORTINA,
  codigoCortina,
  type ColunasCortina,
  type NomeSecaoCortina,
} from './kernelCortinaTabelas.ts';

export * from './kernelCortinaTabelas.ts';
export * from './kernelCortinaEnvio.ts';
export * from './kernelCortinaConsultas.ts';

// ───────────── entrada (contrato; os campos seguem o ADR 0056 §4.2 e §4.3) ─────────────

export type ModoGradeKernel = 'fixedNumber' | 'fixedDistance' | 'maxDistance' | 'manual';

/** Um eixo da grade. Na instância todo campo é opcional (ausente = herda do tipo); no tipo, só `mode` é obrigatório. */
export interface EixoGradeKernel {
  mode: ModoGradeKernel;
  count?: number;
  distance?: number;
  justify?: 'start' | 'center' | 'end';
  positions?: number[];
  anchor?: 'start' | 'end';
  offset?: number;
  angle?: number;
  minRemainder?: number;
}

/** Sobrescrita de eixo da instância: qualquer campo, inclusive `mode`. */
export type EixoGradeParcialKernel = Partial<EixoGradeKernel>;

export interface MontanteKernel {
  id: string;
  shape: 'rect' | 'round' | 'L' | 'trapezoid' | 'corner';
  width: number;
  depth: number;
  thickness?: number;
  widthBack?: number;
  offset?: number;
  position?: 'normalToFace' | 'parallelToGround';
  materialId?: string | null;
}

export interface PainelKernel {
  id: string;
  kind: 'glass' | 'solid' | 'empty';
  thickness: number;
  offset?: number;
  /** Quanto o painel entra no montante (m). Ausente = o padrão do Rust (0,012). */
  bite?: number;
  materialId?: string | null;
  /** Tipo de vidro do modelo, como número (informativo). */
  glassKind?: number;
}

export interface MontantesDoTipoKernel {
  interiorVertical: string | null;
  interiorHorizontal: string | null;
  borderStart: string | null;
  borderEnd: string | null;
  borderBottom: string | null;
  borderTop: string | null;
  corner: string | null;
  joinPriority: 'vertical' | 'horizontal';
}

export interface TipoCortinaKernel {
  id: string;
  depth: number;
  u: EixoGradeKernel;
  v: EixoGradeKernel;
  mullions: MontantesDoTipoKernel;
  defaultPanelTypeId: string;
  /** Célula livre com lado menor que isto gera aviso (m). Ausente = o padrão do Rust (0,15). */
  minCell?: number;
  facetMaxChord?: number;
  chainGrid?: 'segment' | 'chain';
}

export interface CortinaKernel {
  id: string;
  /** `nivel_num`: o índice do nível em `p.levels`. */
  levelNum: number;
  typeId: string;
  a: { x: number; y: number };
  b: { x: number; y: number };
  /** Cota absoluta da base e altura (vêm de `wallZRange`; a cortina não as calcula). */
  zBase: number;
  height: number;
  sag?: number;
  flipped?: boolean;
  locationLine?: keyof typeof ENUM_CORTINA.locationLine;
  grid?: { u?: EixoGradeParcialKernel; v?: EixoGradeParcialKernel };
  defaultPanelTypeId?: string | null;
}

export interface EntradaCenaCortina {
  montantes: readonly MontanteKernel[];
  paineis: readonly PainelKernel[];
  tipos: readonly TipoCortinaKernel[];
  cortinas: readonly CortinaKernel[];
  /** `material_num` de um material do modelo (o mesmo mapa da cena das paredes, se houver); `null` ou ausente = `ID_AUSENTE`. */
  materialNum?: (id: string | null | undefined) => number;
}

// ───────────── cena ─────────────

/** Número interno por chave textual, estável entre montagens quando se reaproveita o mapa anterior. */
interface Internador {
  mapa: Map<string, number>;
  proximo: number;
}

export interface CenaCortina {
  secoes: Record<NomeSecaoCortina, ColunasCortina>;
  nLinhas: Record<NomeSecaoCortina, number>;
  internadores: Record<NomeSecaoCortina, Internador>;
  /** id da cortina -> `id_num`; é o `cortina_num` das saídas das consultas. */
  cortinaDe: Map<string, number>;
  tipoDe: Map<string, number>;
  montanteDe: Map<string, number>;
  painelDe: Map<string, number>;
}

const novoInternador = (): Internador => ({ mapa: new Map(), proximo: 1 });

const vazias = (): Record<NomeSecaoCortina, ColunasCortina> =>
  Object.fromEntries(NOMES_SECOES_CORTINA.map((n) => [n, Object.fromEntries(COLUNAS_CORTINA[n].map((c) => [c, [] as number[]]))])) as Record<NomeSecaoCortina, ColunasCortina>;

const NAN = Number.NaN;

/** Valor numérico ou NaN (campo ausente, que o Rust trata como "herda" ou "padrão"). */
const ouNaN = (v: number | undefined): number => (v === undefined ? NAN : v);

/** Linha de `grades_cortina` a partir de um eixo (campo ausente = herda: 255 nos `u8`, `ID_AUSENTE` no `u32`, NaN nos `f64`). */
function linhaDeGrade(id: number, dono: number, donoNum: number, eixo: number, a: EixoGradeParcialKernel): Record<string, number> {
  return {
    id_num: id,
    dono,
    dono_num: donoNum,
    eixo,
    modo: a.mode === undefined ? HERDA_CORTINA : codigoCortina(ENUM_CORTINA.modo, a.mode, 'modo da grade'),
    numero: a.count === undefined ? ID_AUSENTE_CORTINA : a.count,
    distancia: ouNaN(a.distance),
    justificacao: a.justify === undefined ? HERDA_CORTINA : codigoCortina(ENUM_CORTINA.justificacao, a.justify, 'justificação'),
    ancora: a.anchor === undefined ? HERDA_CORTINA : codigoCortina(ENUM_CORTINA.ancora, a.anchor, 'âncora'),
    deslocamento: ouNaN(a.offset),
    angulo: ouNaN(a.angle),
    resto_minimo: ouNaN(a.minRemainder),
  };
}

/**
 * Monta as seções 100 a 105. Entram só os tipos de cortina usados por alguma cortina e, deles, os montantes e painéis referenciados; cortina de tipo
 * inexistente é um erro de quem chama (o validador do modelo já aponta o tipo ausente).
 */
export function montarCenaCortina(e: EntradaCenaCortina, anterior?: CenaCortina): CenaCortina {
  const secoes = vazias();
  const nLinhas = Object.fromEntries(NOMES_SECOES_CORTINA.map((n) => [n, 0])) as Record<NomeSecaoCortina, number>;
  const internadores = Object.fromEntries(NOMES_SECOES_CORTINA.map((n) => [n, anterior ? { mapa: new Map(anterior.internadores[n].mapa), proximo: anterior.internadores[n].proximo } : novoInternador()])) as Record<NomeSecaoCortina, Internador>;
  const idDe = (secao: NomeSecaoCortina, chave: string): number => {
    const it = internadores[secao];
    let n = it.mapa.get(chave);
    if (n === undefined) {
      n = it.proximo++;
      it.mapa.set(chave, n);
    }
    return n;
  };
  const push = (secao: NomeSecaoCortina, valores: Record<string, number>): void => {
    for (const c of COLUNAS_CORTINA[secao]) {
      const v = valores[c];
      if (v === undefined) throw new Error(`kernelCortina: falta a coluna ${secao}.${c}`);
      secoes[secao][c]!.push(v);
    }
    nLinhas[secao]++;
  };
  const material = (id: string | null | undefined): number => (e.materialNum ? e.materialNum(id) : ID_AUSENTE_CORTINA);

  const tiposPorId = new Map(e.tipos.map((t) => [t.id, t]));
  const montantesPorId = new Map(e.montantes.map((m) => [m.id, m]));
  const paineisPorId = new Map(e.paineis.map((p) => [p.id, p]));
  const usados = [...new Set(e.cortinas.map((c) => c.typeId))].sort();
  const montanteDe = new Map<string, number>();
  const painelDe = new Map<string, number>();
  const tipoDe = new Map<string, number>();
  const cortinaDe = new Map<string, number>();

  const montante = (id: string | null): number => {
    if (id === null) return ID_AUSENTE_CORTINA;
    const m = montantesPorId.get(id);
    if (!m) throw new Error(`kernelCortina: tipo de montante inexistente "${id}"`);
    let n = montanteDe.get(id);
    if (n === undefined) {
      n = idDe('tipos_montante_cortina', id);
      montanteDe.set(id, n);
      push('tipos_montante_cortina', {
        id_num: n,
        forma: codigoCortina(ENUM_CORTINA.forma, m.shape, 'forma do montante'),
        largura: m.width,
        profundidade: m.depth,
        espessura: m.thickness ?? 0,
        largura2: m.widthBack ?? 0,
        deslocamento: m.offset ?? 0,
        posicao: codigoCortina(ENUM_CORTINA.posicao, m.position ?? 'normalToFace', 'posição do montante'),
        material_num: material(m.materialId),
      });
    }
    return n;
  };
  const painel = (id: string): number => {
    const p = paineisPorId.get(id);
    if (!p) throw new Error(`kernelCortina: tipo de painel inexistente "${id}"`);
    let n = painelDe.get(id);
    if (n === undefined) {
      n = idDe('tipos_painel_cortina', id);
      painelDe.set(id, n);
      push('tipos_painel_cortina', {
        id_num: n,
        tipo: codigoCortina(ENUM_CORTINA.painel, p.kind, 'tipo de painel'),
        espessura: p.thickness,
        deslocamento: p.offset ?? 0,
        encaixe: ouNaN(p.bite),
        material_num: material(p.materialId),
        vidro_tipo: p.glassKind ?? 0,
      });
    }
    return n;
  };

  for (const tid of usados) {
    const t = tiposPorId.get(tid);
    if (!t) throw new Error(`kernelCortina: tipo de cortina inexistente "${tid}"`);
    const n = idDe('tipos_cortina', t.id);
    tipoDe.set(t.id, n);
    const m = t.mullions;
    push('tipos_cortina', {
      id_num: n,
      profundidade: t.depth,
      painel_padrao_num: painel(t.defaultPanelTypeId),
      mont_int_v: montante(m.interiorVertical),
      mont_int_h: montante(m.interiorHorizontal),
      mont_borda_ini: montante(m.borderStart),
      mont_borda_fim: montante(m.borderEnd),
      mont_borda_base: montante(m.borderBottom),
      mont_borda_topo: montante(m.borderTop),
      mont_canto: montante(m.corner),
      prioridade: codigoCortina(ENUM_CORTINA.prioridade, m.joinPriority, 'prioridade de junção'),
      celula_minima: ouNaN(t.minCell),
      faceta_max: ouNaN(t.facetMaxChord),
      cadeia_grade: t.chainGrid === 'chain' ? 1 : 0,
    });
    for (const [eixo, a] of [[ENUM_CORTINA.eixo.u, t.u], [ENUM_CORTINA.eixo.v, t.v]] as const) grade(n, ENUM_CORTINA.dono.tipo, `t:${t.id}`, eixo, a);
  }

  /** Uma linha de `grades_cortina` e as posições manuais dela em `grade_posicoes_cortina`. */
  function grade(donoNum: number, dono: number, chaveDono: string, eixo: number, a: EixoGradeParcialKernel): void {
    const chave = `${chaveDono}:${eixo}`;
    const id = idDe('grades_cortina', chave);
    push('grades_cortina', linhaDeGrade(id, dono, donoNum, eixo, a));
    (a.positions ?? []).forEach((pos, k) => push('grade_posicoes_cortina', { id_num: idDe('grade_posicoes_cortina', `${chave}:${k}`), grade_num: id, ordem: k, pos }));
  }

  const ordenadas = [...e.cortinas].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const c of ordenadas) {
    const n = idDe('cortinas', c.id);
    cortinaDe.set(c.id, n);
    const tipo = tiposPorId.get(c.typeId);
    if (!tipo) throw new Error(`kernelCortina: tipo de cortina inexistente "${c.typeId}"`);
    const sobrescreveGrade = (c.grid?.u !== undefined || c.grid?.v !== undefined) ? 1 : 0;
    push('cortinas', {
      id_num: n,
      nivel_num: c.levelNum,
      tipo_num: tipoDe.get(c.typeId)!,
      ax: c.a.x,
      ay: c.a.y,
      bx: c.b.x,
      by: c.b.y,
      z_base: c.zBase,
      altura: c.height,
      sag: c.sag ?? 0,
      flipped: c.flipped ? 1 : 0,
      loc: codigoCortina(ENUM_CORTINA.locationLine, c.locationLine ?? 'wallCenter', 'linha de localização'),
      flags: sobrescreveGrade,
      painel_padrao_num: c.defaultPanelTypeId ? painel(c.defaultPanelTypeId) : ID_AUSENTE_CORTINA,
      hosp_num: ID_AUSENTE_CORTINA,
    });
    for (const [eixo, a] of [[ENUM_CORTINA.eixo.u, c.grid?.u], [ENUM_CORTINA.eixo.v, c.grid?.v]] as const) if (a) grade(n, ENUM_CORTINA.dono.instancia, `c:${c.id}`, eixo, a);
  }

  return { secoes, nLinhas, internadores, cortinaDe, tipoDe, montanteDe, painelDe };
}
