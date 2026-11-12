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
import type { ExtremidadeCortinaKernel } from './cortinaExtremidades.ts';
import {
  COLUNAS_CORTINA,
  ENUM_CORTINA,
  AJUSTE_ESQUADRIA,
  ALINHAMENTO_ESQUADRIA,
  FLAGS_EXTREMIDADE,
  FLAG_CORTINA_HOSPEDADA,
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
  /** Sobrescritas da fase 2 (ADR 0056 §4.3), na forma que o kernel recebe. */
  sobrescritas?: SobrescritasCortinaKernel;
  /**
   * Vizinhança das duas pontas (fase 3, seção 110): início e fim. Ausente = nenhuma vizinha nas duas (a cortina termina no eixo do nó, como na fase 2).
   * `noJoin` de cada ponta vem do modelo (`Wall.noJoinStart/End`).
   */
  extremidades?: readonly ExtremidadeCortinaKernel[];
  /** Cortina embutida numa parede comum (fase 5, seção 113): o vão no hospedeiro. A posição da cortina (a, b, zBase, height) já é o espelho dele. */
  hospedeiro?: HospedeiroCortinaKernel;
}

/** Vão da cortina embutida no hospedeiro (`CurtainHost` do modelo): centro ao longo do hospedeiro a partir de `a`, largura, peitoril sobre a base e altura (m). */
export interface HospedeiroCortinaKernel {
  wallId: string;
  offset: number;
  width: number;
  sill: number;
  height: number;
}

/** Esquadria numa célula (fase 5, seção 112): a chave da célula é a de `celulasSobrescritas`; `tipoAbertura` é o id de um tipo de `EntradaCenaCortina.tiposAbertura`. */
export interface EsquadriaCelulaKernel {
  i: number;
  j: number;
  nu: number;
  nv: number;
  s: number;
  z: number;
  tipoAbertura: string;
  flipHand: boolean;
  flipFacing: boolean;
  /** 'cell' (padrão) preenche a célula; 'grid' = a grade foi ajustada ao tamanho nominal. */
  fit?: 'cell' | 'grid';
  align?: 'center' | 'start' | 'end';
  /** Peitoril por instância (m). Ausente ou null = a base da região. */
  sillOverride?: number | null;
}

/** Tipo de abertura da seção 7 (`tipos_abertura`), sem `id_num`: as colunas por nome (ver `colunasDoTipoAbertura` de `kernelA3.ts`). */
export interface TipoAberturaKernel {
  id: string;
  valores: Readonly<Record<string, number>>;
}

/**
 * Sobrescritas de uma cortina (fase 2). `comprimentoGravado` é o comprimento do eixo na gravação (m): a posição de uma linha não travada acompanha a
 * fração `pos / comprimentoGravado`. Segmento de linha gerada: `linha` é o índice gravado (0 ou `n` é a borda), `posNorm` a posição normalizada da linha
 * e `n` o nº de células do eixo na gravação. Segmento de linha extra: `linha` é o `id` da extra.
 */
export interface SobrescritasCortinaKernel {
  linhasExtras?: readonly { id: string; eixo: 'u' | 'v'; pos: number; travada?: boolean; comprimentoGravado: number; montante?: string }[];
  segmentosRemovidos?: readonly { eixo: 'u' | 'v'; origem: 'gerada' | 'extra'; linha: number | string; posNorm?: number; n?: number; k: number; nk: number; mid: number }[];
  /** `montante`: ausente = herda do eixo; `null` = sem montante; um id = o tipo. */
  linhasSobrescritas?: readonly { eixo: 'u' | 'v'; linha: number; n: number; posNorm: number; pos?: number; travada?: boolean; comprimentoGravado: number; montante?: string | null }[];
  celulasSobrescritas?: readonly { i: number; j: number; nu: number; nv: number; s: number; z: number; painel: string }[];
  /** Esquadrias nas células (fase 5, seção 112). */
  esquadrias?: readonly EsquadriaCelulaKernel[];
}

export type { ExtremidadeCortinaKernel } from './cortinaExtremidades.ts';

export interface EntradaCenaCortina {
  montantes: readonly MontanteKernel[];
  paineis: readonly PainelKernel[];
  tipos: readonly TipoCortinaKernel[];
  cortinas: readonly CortinaKernel[];
  /** Tipos de abertura (seção 7) que as esquadrias das células referenciam; só os usados. */
  tiposAbertura?: readonly TipoAberturaKernel[];
  /** `hospedeiro_num` (a `id_num` da parede hospedeira na seção 1 do kernel das paredes) de uma cortina embutida; ausente ou sem resposta = `ID_AUSENTE`. */
  hospedeiroNum?: (wallId: string) => number | undefined;
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
  /** id do tipo de abertura -> `id_num` na seção 7 (fase 5). */
  tipoAberturaDe: Map<string, number>;
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
 * Monta as seções 100 a 113 (mais a 7, os tipos de abertura das esquadrias). Entram só os tipos de cortina usados por alguma cortina e, deles, os montantes e painéis referenciados; cortina de tipo
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

  const tipoAberturaDe = new Map<string, number>();
  for (const t of [...(e.tiposAbertura ?? [])].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const n = idDe('tipos_abertura', t.id);
    tipoAberturaDe.set(t.id, n);
    push('tipos_abertura', { id_num: n, ...t.valores });
  }
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

  /** Sobrescritas da fase 2 de uma cortina: linhas extras (106), segmentos removidos (107), linhas geradas sobrescritas (108) e painéis por célula (109). */
  function sobrescrever(cortina: number, chaveCortina: string, s: SobrescritasCortinaKernel): void {
    const extras = new Map<string, number>();
    for (const x of s.linhasExtras ?? []) {
      const id = idDe('cortina_linhas_extras', `${chaveCortina}:${x.id}`);
      extras.set(x.id, id);
      push('cortina_linhas_extras', {
        id_num: id,
        cortina_num: cortina,
        eixo: ENUM_CORTINA.eixo[x.eixo],
        pos: x.pos,
        travada: x.travada ? 1 : 0,
        comp_gravado: x.comprimentoGravado,
        montante_num: x.montante === undefined ? ID_AUSENTE_CORTINA : montante(x.montante),
      });
    }
    (s.segmentosRemovidos ?? []).forEach((x, k) => {
      const extra = x.origem === 'extra';
      const linha = extra ? extras.get(String(x.linha)) : Number(x.linha);
      if (linha === undefined) throw new Error(`kernelCortina: segmento removido de linha extra inexistente "${String(x.linha)}"`);
      if (!extra && (x.posNorm === undefined || x.n === undefined)) throw new Error('kernelCortina: segmento de linha gerada sem posNorm e n');
      push('cortina_segmentos_removidos', {
        id_num: idDe('cortina_segmentos_removidos', `${chaveCortina}:${k}`),
        cortina_num: cortina,
        eixo: ENUM_CORTINA.eixo[x.eixo],
        origem: extra ? 1 : 0,
        linha_num: linha,
        pos_norm: extra ? NAN : x.posNorm!,
        n: extra ? ID_AUSENTE_CORTINA : x.n!,
        k: x.k,
        nk: x.nk,
        mid: x.mid,
      });
    });
    (s.linhasSobrescritas ?? []).forEach((x, k) =>
      push('cortina_linhas_sobrescritas', {
        id_num: idDe('cortina_linhas_sobrescritas', `${chaveCortina}:${k}`),
        cortina_num: cortina,
        eixo: ENUM_CORTINA.eixo[x.eixo],
        linha_num: x.linha,
        pos_norm: x.posNorm,
        n: x.n,
        travada: x.travada ? 1 : 0,
        pos: ouNaN(x.pos),
        comp_gravado: x.comprimentoGravado,
        montante_modo: x.montante === undefined ? 0 : x.montante === null ? 1 : 2,
        montante_num: x.montante ? montante(x.montante) : ID_AUSENTE_CORTINA,
      }),
    );
    (s.celulasSobrescritas ?? []).forEach((x, k) =>
      push('cortina_celulas_sobrescritas', {
        id_num: idDe('cortina_celulas_sobrescritas', `${chaveCortina}:${k}`),
        cortina_num: cortina,
        i: x.i,
        j: x.j,
        s: x.s,
        z: x.z,
        nu: x.nu,
        nv: x.nv,
        painel_num: painel(x.painel),
      }),
    );
  }

  /** Esquadrias das células (seção 112): a chave da célula e o tipo da seção 7; tipo desconhecido não entra. */
  function esquadrias(cortina: number, chaveCortina: string, lista: readonly EsquadriaCelulaKernel[]): void {
    lista.forEach((x, k) => {
      const tipo = tipoAberturaDe.get(x.tipoAbertura);
      if (tipo === undefined) return;
      push('cortina_celulas_abertura', {
        id_num: idDe('cortina_celulas_abertura', `${chaveCortina}:${k}`),
        cortina_num: cortina,
        i: x.i,
        j: x.j,
        s: x.s,
        z: x.z,
        nu: x.nu,
        nv: x.nv,
        tipo_abertura_num: tipo,
        flip_mao: x.flipHand ? 1 : 0,
        flip_sentido: x.flipFacing ? 1 : 0,
        ajuste: x.fit === 'grid' ? AJUSTE_ESQUADRIA.grade : AJUSTE_ESQUADRIA.preencher,
        alinhamento: ALINHAMENTO_ESQUADRIA[x.align ?? 'center'],
        soleira: typeof x.sillOverride === 'number' ? Math.max(0, x.sillOverride) : NAN,
      });
    });
  }

  const ordenadas = [...e.cortinas].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // Os números de todas as cortinas antes das linhas: a seção 110 aponta para a vizinha, que pode vir depois na ordem.
  for (const c of ordenadas) cortinaDe.set(c.id, idDe('cortinas', c.id));

  /** Seção 110: uma linha por ponta (início e fim); sem `extremidades`, as duas pontas ficam sem vizinha. */
  function extremidades(cortina: number, c: CortinaKernel): void {
    for (const fim of ['start', 'end'] as const) {
      const x = c.extremidades?.find((y) => y.fim === fim);
      const vizinha = x?.vizinhaId ?? null;
      const cortinaVizinha = vizinha !== null && x!.vizinhaCortina ? cortinaDe.get(vizinha) : undefined;
      // Cortina vizinha que não está na cena (tipo inválido, outro nível): a ponta fica livre, como parede comum ausente.
      const ok = vizinha !== null && (!x!.vizinhaCortina || cortinaVizinha !== undefined);
      const id = idDe('cortina_extremidades', `${c.id}:${fim}`);
      const f = (i: number, face: 'face1' | 'face2'): number => (ok ? x![face][i]! : NAN);
      push('cortina_extremidades', {
        id_num: id,
        cortina_num: cortina,
        fim: fim === 'start' ? 0 : 1,
        // Parede comum: o número é só informativo (o Rust não a consulta), mas nunca pode ser `ID_AUSENTE`.
        vizinha_num: !ok ? ID_AUSENTE_CORTINA : cortinaVizinha ?? idDe('cortina_extremidades', `viz:${vizinha}`),
        vizinha_tipo: ok && x!.vizinhaCortina ? 1 : 0,
        lado: ok ? x!.lado : 2,
        flags: (x?.noJoin ? FLAGS_EXTREMIDADE.semJuncao : 0) | (ok && x!.atravessa ? FLAGS_EXTREMIDADE.atravessa : 0),
        angulo: ok ? x!.angulo : NAN,
        face1_ax: f(0, 'face1'),
        face1_ay: f(1, 'face1'),
        face1_bx: f(2, 'face1'),
        face1_by: f(3, 'face1'),
        face2_ax: f(0, 'face2'),
        face2_ay: f(1, 'face2'),
        face2_bx: f(2, 'face2'),
        face2_by: f(3, 'face2'),
        espessura_vizinha: ok ? x!.espessura : NAN,
      });
    }
  }

  for (const c of ordenadas) {
    const n = cortinaDe.get(c.id)!;
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
      // Bit 0: há sobrescrita de grade; bits 2 e 3: junção desligada no início e no fim (ADR §6.2; o Rust lê a de cada ponta da seção 110).
      flags: sobrescreveGrade | (c.hospedeiro ? FLAG_CORTINA_HOSPEDADA : 0) | (c.extremidades?.some((x) => x.fim === 'start' && x.noJoin) ? 4 : 0) | (c.extremidades?.some((x) => x.fim === 'end' && x.noJoin) ? 8 : 0),
      painel_padrao_num: c.defaultPanelTypeId ? painel(c.defaultPanelTypeId) : ID_AUSENTE_CORTINA,
      hosp_num: ID_AUSENTE_CORTINA,
    });
    for (const [eixo, a] of [[ENUM_CORTINA.eixo.u, c.grid?.u], [ENUM_CORTINA.eixo.v, c.grid?.v]] as const) if (a) grade(n, ENUM_CORTINA.dono.instancia, `c:${c.id}`, eixo, a);
    if (c.sobrescritas) sobrescrever(n, c.id, c.sobrescritas);
    if (c.sobrescritas?.esquadrias) esquadrias(n, c.id, c.sobrescritas.esquadrias);
    if (c.hospedeiro) {
      push('cortina_hospedes', {
        id_num: idDe('cortina_hospedes', c.id),
        cortina_num: n,
        hospedeiro_num: e.hospedeiroNum?.(c.hospedeiro.wallId) ?? ID_AUSENTE_CORTINA,
        deslocamento: c.hospedeiro.offset,
        largura: c.hospedeiro.width,
        peitoril: c.hospedeiro.sill,
        altura: c.hospedeiro.height,
      });
    }
    extremidades(n, c);
  }

  return { secoes, nLinhas, internadores, cortinaDe, tipoDe, montanteDe, painelDe, tipoAberturaDe };
}
