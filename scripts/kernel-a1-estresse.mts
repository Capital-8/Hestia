// Projetos de estresse para a sub-etapa A1 do kernel Rust (decisão 0047): paredes aleatórias (determinísticas pela
// semente) com nós de 2 a 5 paredes, T, cantos por geometria, ângulos oblíquos, arcos, junção esquadria e encosto
// (com flip), `noJoin`, linhas de localização, paredes invertidas, tipos com prioridade própria, sem estrutura,
// camada de espessura zero e cotas diferentes (junção só entre paredes que se encontram em altura).
// Nada de projeto real: só geometria sintética.
import { ProjectStore, createEmptyProject, makeLevel, makeWall, type Command, type Id, type JoinConfig, type LocationLine, type Project, type WallType } from '@hestia/model';

/** Gerador pseudoaleatório determinístico (mulberry32). */
export function aleatorio(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const camada = (fn: WallType['layers'][number]['function'], espessura: number, extra: Partial<WallType['layers'][number]> = {}): WallType['layers'][number] => ({
  function: fn,
  materialId: 'mat_reboco',
  thickness: espessura,
  wraps: false,
  ...extra,
});

/** Tipos extras: prioridade própria, sem estrutura e com membrana de espessura zero. */
function tiposExtras(base: WallType): WallType[] {
  const t = (id: string, layers: WallType['layers']): WallType => ({ ...base, id, name: id, code: id, layers });
  return [
    t('wt_x_prio', [camada('finish1', 0.01), camada('structure', 0.12), camada('substrate', 0.03, { priority: 1 }), camada('finish2', 0.005)]),
    t('wt_x_semestrutura', [camada('finish1', 0.02), camada('thermal', 0.06), camada('finish2', 0.02)]),
    t('wt_x_membrana', [camada('finish2', 0.002), camada('membrane', 0), camada('structure', 0.2), camada('substrate', 0.02), camada('finish2', 0.002)]),
  ];
}

const LINHAS: LocationLine[] = ['wallCenter', 'coreCenter', 'finishExterior', 'finishInterior', 'coreExterior', 'coreInterior'];

export interface OpcoesEstresse {
  /** Paredes por pavimento (padrão 40). */
  paredes?: number;
  /** Pavimentos (padrão 2). */
  pavimentos?: number;
  /** Fração de paredes curvas (padrão 0,12). */
  curvas?: number;
  /** Adiciona ruído de até 3 cm nas pontas (testa a tolerância de junção de 2 cm). Padrão: sim. */
  ruido?: boolean;
}

export function projetoDeEstresse(semente: number, opcoes: OpcoesEstresse = {}): Project {
  const r = aleatorio(semente);
  const quantas = opcoes.paredes ?? 40;
  const pavimentos = opcoes.pavimentos ?? 2;
  const pCurva = opcoes.curvas ?? 0.12;
  const ruido = opcoes.ruido ?? true;
  const store = new ProjectStore(createEmptyProject(`Estresse ${semente}`));
  const base = Object.values(store.project.wallTypes)[0]!;
  const tipos = [...Object.keys(store.project.wallTypes), ...tiposExtras(base).map((t) => t.id)];
  const cmds: Command[] = tiposExtras(base).map((wallType) => ({ type: 'upsertWallType', wallType }));
  const niveis: Id[] = [];
  for (let i = 0; i < pavimentos; i++) {
    const id = i === 0 ? 'lv_0' : i === 1 ? 'lv_1' : `lv_x${i}`;
    niveis.push(id);
    cmds.push({ type: 'upsertLevel', level: makeLevel({ id, name: `Pav ${i}`, elevation: i * 3 }) });
  }
  const escolhe = <T,>(v: readonly T[]): T => v[Math.floor(r() * v.length)]!;
  const passos = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 1],
    [1, -1],
    [2, 1],
    [-1, 2],
  ] as const;
  for (const levelId of niveis) {
    for (let i = 0; i < quantas; i++) {
      const gx = Math.floor(r() * 9);
      const gy = Math.floor(r() * 9);
      const [dx, dy] = escolhe(passos);
      const k = 1 + Math.floor(r() * 3);
      const jit = (): number => (ruido && r() < 0.35 ? (r() - 0.5) * 0.06 : 0);
      const a = { x: gx * 1.5 + jit(), y: gy * 1.5 + jit() };
      const b = { x: (gx + dx * k) * 1.5 + jit(), y: (gy + dy * k) * 1.5 + jit() };
      const corda = Math.hypot(b.x - a.x, b.y - a.y);
      const junta = (): JoinConfig => ({ kind: r() < 0.4 ? 'miter' : 'butt', flip: r() < 0.25 });
      const sag = r() < pCurva ? (r() < 0.5 ? 1 : -1) * Math.max(0.05, r() * corda * 0.5) : 0;
      const baixa = r() < 0.12;
      cmds.push({
        type: 'addWall',
        wall: makeWall({
          id: `w_${semente}_${levelId}_${i}`,
          typeId: escolhe(tipos),
          levelId,
          a,
          b,
          locationLine: r() < 0.5 ? 'wallCenter' : escolhe(LINHAS),
          flipped: r() < 0.2,
          noJoinStart: r() < 0.05,
          noJoinEnd: r() < 0.05,
          joinStart: junta(),
          joinEnd: junta(),
          sag,
          baseOffset: baixa ? 1.8 : 0,
          height: baixa ? 0.7 : 2.8,
        }),
      });
    }
  }
  store.exec({ type: 'batch', commands: cmds });
  return store.project;
}

// ---------------------------------------------------------------------------------------------------------------
// Casos de limiar. Para cada limiar numérico de decisão do motor de junções, um projeto com a variável de decisão
// logo abaixo do valor nominal e outro logo acima (margem relativa `MARGEM_LIMIAR`). Os dois lados caem em ramos
// diferentes do motor (TypeScript em packages/engine/src; Rust em crates/geom-wasm/src): se o Rust trocar o limiar por
// um valor vizinho, a comparação com o TypeScript diverge em pelo menos um dos lados. Os limiares sem caso dedicado
// (e o motivo) estão em `LIMIARES_SEM_CASO`.

/** Margem relativa de cada lado do limiar. Não se afrouxa: é a resolução que o teste exige. */
export const MARGEM_LIMIAR = 1e-6;

export interface CasoDeLimiar {
  /** Limiar e ponto de decisão no motor (ver `DESCRITORES_DE_LIMIAR`). */
  limiar: string;
  /** Lado do valor nominal em que a variável de decisão cai (margem `MARGEM_LIMIAR`). */
  lado: 'abaixo' | 'acima';
  /** Valor nominal do limiar neste caso (já com o `tol` do projeto, quando o limiar depende dele). */
  valor: number;
  projeto: Project;
}

interface PontoCaso {
  x: number;
  y: number;
}

interface ParedeCaso {
  id: string;
  a: PontoCaso;
  b: PontoCaso;
  tipo?: string;
  ja?: JoinConfig['kind'];
  jb?: JoinConfig['kind'];
  sag?: number;
  base?: number;
}

/** Tipo de parede de referência: espessura 0,20 m (um só layer estrutural, sem prioridade). */
const TIPO_PADRAO = 'wt_lim_20';
/** Tipo fino: espessura 0,02 m (para os limiares de piso de 0,05 m e de amostragem). */
const TIPO_FINO = 'wt_lim_02';
const ESPESSURA_PADRAO = 0.2;
const TOLS_DEPENDENTES = [0.02, 0.05];

function tipoCom(id: string, espessura: number): WallType {
  const base = Object.values(createEmptyProject().wallTypes)[0]!;
  return { ...base, id, name: id, code: id, layers: [{ function: 'structure', materialId: 'mat_reboco', thickness: espessura, wraps: false }] };
}

function projetoCaso(nome: string, paredes: ParedeCaso[], tol: number): Project {
  const p = createEmptyProject(nome);
  p.settings = { ...p.settings, joinTolerance: tol };
  for (const t of [tipoCom(TIPO_PADRAO, ESPESSURA_PADRAO), tipoCom(TIPO_FINO, 0.02)]) p.wallTypes[t.id] = t;
  const store = new ProjectStore(p);
  const commands: Command[] = paredes.map((w) => ({
    type: 'addWall',
    wall: makeWall({
      id: w.id,
      typeId: w.tipo ?? TIPO_PADRAO,
      levelId: 'lv_0',
      a: w.a,
      b: w.b,
      locationLine: 'wallCenter',
      flipped: false,
      noJoinStart: false,
      noJoinEnd: false,
      joinStart: { kind: w.ja ?? 'butt', flip: false },
      joinEnd: { kind: w.jb ?? 'butt', flip: false },
      sag: w.sag ?? 0,
      baseOffset: w.base ?? 0,
      height: 2.8,
    }),
  }));
  store.exec({ type: 'batch', commands });
  return store.project;
}

/** Ângulo θ com f(θ) = (0,1 + 0,01·cos θ)/sen θ = d (a tangente de um ramal ao eixo do hospedeiro). f é decrescente. */
function anguloDoRamal(d: number): number {
  let lo = 1e-3;
  let hi = Math.PI / 2 - 1e-6;
  for (let i = 0; i < 200; i++) {
    const m = (lo + hi) / 2;
    if ((0.1 + 0.01 * Math.cos(m)) / Math.sin(m) > d) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

interface DescritorDeLimiar {
  limiar: string;
  /** Valor nominal do limiar (pode depender do `tol` do projeto). */
  nominal: (tol: number) => number;
  /** Projeto com a variável de decisão `x` (o lado da margem já aplicado). */
  monta: (x: number, tol: number) => Project;
  /** Quando o limiar depende do `tol` do projeto: repete o caso para cada um destes valores. */
  tols?: number[];
}

const cos = (s: number): number => Math.sqrt(1 - s * s);

/**
 * Um descritor por limiar. A variável de decisão está no comentário de cada um: é a grandeza que o motor compara
 * com o limiar. Números de linha no Rust: crates/geom-wasm/src/juncoes.rs (salvo indicação).
 */
const DESCRITORES_DE_LIMIAR: DescritorDeLimiar[] = [
  {
    // |cross| de duas paredes que se encontram (resolveNode; juncoes.rs:672): colineares se |sen| < 0,035.
    limiar: 'COLINEAR_SIN · par de 2 paredes no nó',
    nominal: () => 0.035,
    monta: (s) =>
      projetoCaso('lim-colinear-2', [
        { id: 'A', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, ja: 'miter', jb: 'miter' },
        { id: 'B', a: { x: 4, y: 0 }, b: { x: 4 + 3 * cos(s), y: 3 * s }, ja: 'miter', jb: 'miter' },
      ], 0.02),
  },
  {
    // Par colinear num nó de 3 paredes (resolveNode; juncoes.rs:682): |sen| < 0,035 e cosseno negativo.
    limiar: 'COLINEAR_SIN · par colinear em nó de 3 paredes',
    nominal: () => 0.035,
    monta: (s) =>
      projetoCaso('lim-colinear-3', [
        { id: 'A', a: { x: -4, y: 0 }, b: { x: 0, y: 0 } },
        { id: 'B', a: { x: 0, y: 0 }, b: { x: 3 * cos(s), y: 3 * s } },
        { id: 'C', a: { x: 0, y: 0 }, b: { x: 0, y: 3 } },
      ], 0.02),
  },
  {
    // Canto por geometria (cornerHostOf; juncoes.rs:199): ponta a 1 cm do eixo do hospedeiro, |sen| do ângulo < 0,035.
    limiar: 'COLINEAR_SIN · canto por geometria (ponta perto da face)',
    nominal: () => 0.035,
    monta: (s) =>
      projetoCaso('lim-colinear-canto', [
        { id: 'H', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, ja: 'miter' },
        { id: 'R', a: { x: 0.01, y: 0.05 }, b: { x: 0.01 + 4 * cos(s), y: 0.05 + 4 * s }, ja: 'miter' },
      ], 0.02),
  },
  {
    // Lacuna reflexa entre duas paredes de um nó de 3 (formaCanto; juncoes.rs:661): |sen| >= 0,035 forma canto.
    limiar: 'PARALELA · lacuna reflexa num nó de 3 paredes',
    nominal: () => 0.035,
    monta: (s) => {
      const psi = Math.asin(s);
      return projetoCaso('lim-paralela', [
        { id: 'W0', a: { x: 0, y: 0 }, b: { x: 3, y: 0 } },
        { id: 'Wm', a: { x: 0, y: 0 }, b: { x: 3 * Math.cos(psi / 2), y: 3 * Math.sin(psi / 2) } },
        { id: 'Wp', a: { x: 0, y: 0 }, b: { x: 3 * Math.cos(psi), y: 3 * Math.sin(psi) } },
      ], 0.02);
    },
  },
  {
    // Encosto (findTee; juncoes.rs:239): |cross(ramal, parede)| < 0,1 não é encosto.
    limiar: 'TEE_SIN · encosto no meio da parede',
    nominal: () => 0.1,
    monta: (s) =>
      projetoCaso('lim-tee-angulo', [
        { id: 'H', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } },
        { id: 'R', a: { x: 2, y: 0 }, b: { x: 2 + 3 * cos(s), y: 3 * s } },
      ], 0.02),
  },
  {
    // Extremidades a distância `tol` no mesmo nó (groupEnds, parceiros; juncoes.rs:154, 182).
    limiar: 'TOL · distância entre extremidades (ponta a)',
    nominal: (tol) => tol,
    monta: (d, tol) =>
      projetoCaso('lim-tol-agrupa', [
        { id: 'A', a: { x: -4, y: 0 }, b: { x: 0, y: 0 }, ja: 'miter', jb: 'miter' },
        { id: 'B', a: { x: 0, y: d }, b: { x: 0, y: 4 } },
      ], tol),
    tols: TOLS_DEPENDENTES,
  },
  {
    // Mesmo limiar com a extremidade b da outra parede (parceiros, juncoes.rs:185).
    limiar: 'TOL · distância entre extremidades (ponta b)',
    nominal: (tol) => tol,
    monta: (d, tol) =>
      projetoCaso('lim-tol-agrupa-b', [
        { id: 'A', a: { x: -4, y: 0 }, b: { x: 0, y: 0 }, ja: 'miter', jb: 'miter' },
        { id: 'B', a: { x: 0, y: 4 }, b: { x: 0, y: d } },
      ], tol),
    tols: TOLS_DEPENDENTES,
  },
  {
    // Canto: afastamento ao longo do eixo da parede hospedeira (cornerHostOf; juncoes.rs:205). Variável = t.
    limiar: 'TOL · canto, afastamento ao longo do eixo (t)',
    nominal: (tol) => tol,
    monta: (x, tol) =>
      projetoCaso('lim-tol-canto-t', [
        { id: 'H', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, ja: 'miter' },
        { id: 'R', a: { x: x, y: 0.05 }, b: { x: x, y: 3 }, ja: 'miter' },
      ], tol),
    tols: TOLS_DEPENDENTES,
  },
  {
    // Canto: afastamento transversal, espessura/2 + tol (cornerHostOf; juncoes.rs:208). Variável = |s|.
    limiar: 'TOL · canto, afastamento transversal (espessura/2 + tol)',
    nominal: (tol) => ESPESSURA_PADRAO / 2 + tol,
    monta: (y, tol) =>
      projetoCaso('lim-tol-canto-s', [
        { id: 'H', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, ja: 'miter' },
        { id: 'R', a: { x: 0.01, y: y }, b: { x: 0.01, y: 3 }, ja: 'miter' },
      ], tol),
    tols: TOLS_DEPENDENTES,
  },
  {
    // Encosto: afastamento transversal, espessura/2 + tol (findTee; juncoes.rs:232). Variável = |s|.
    limiar: 'TOL · encosto, afastamento transversal (espessura/2 + tol)',
    nominal: (tol) => ESPESSURA_PADRAO / 2 + tol,
    monta: (y, tol) =>
      projetoCaso('lim-tol-tee-s', [
        { id: 'H', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } },
        { id: 'R', a: { x: 2, y: y }, b: { x: 2, y: 3 } },
      ], tol),
    tols: TOLS_DEPENDENTES,
  },
  {
    // Encosto além da ponta da hospedeira (findTee; juncoes.rs:229, bound +). A ponta b de H fica tomada por um
    // nó com K, então o canto não a usa e o encosto é que decide. Variável = x (passa de L).
    limiar: 'TOL · encosto além da ponta b da hospedeira (t > L + tol)',
    nominal: (tol) => tol,
    monta: (x, tol) =>
      projetoCaso('lim-tol-tee-fim', [
        { id: 'H', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, jb: 'miter' },
        { id: 'K', a: { x: 4, y: 0 }, b: { x: 4, y: -3 }, ja: 'miter' },
        { id: 'R', a: { x: 4 + x, y: 0.05 }, b: { x: 4 + x, y: 3 } },
      ], tol),
    tols: TOLS_DEPENDENTES,
  },
  {
    // Encosto antes da ponta a da hospedeira (findTee; juncoes.rs:229, bound −). Simétrico ao anterior.
    limiar: 'TOL · encosto antes da ponta a da hospedeira (t < −tol)',
    nominal: (tol) => tol,
    monta: (x, tol) =>
      projetoCaso('lim-tol-tee-ini', [
        { id: 'H', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, ja: 'miter' },
        { id: 'K', a: { x: 0, y: 0 }, b: { x: 0, y: -3 }, ja: 'miter' },
        { id: 'R', a: { x: -x, y: 0.05 }, b: { x: -x, y: 3 } },
      ], tol),
    tols: TOLS_DEPENDENTES,
  },
  {
    // Sobreposição vertical (zOverlap; juncoes.rs:115): 1e-6 m absoluto. Variável = m, com z0(B) = 2,8 − m.
    limiar: 'Z_OVERLAP · sobreposição vertical de 1 µm',
    nominal: () => 1e-6,
    monta: (m) =>
      projetoCaso('lim-zoverlap', [
        { id: 'A', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, ja: 'miter', jb: 'miter' },
        { id: 'B', a: { x: 4, y: 0 }, b: { x: 4, y: 3 }, ja: 'miter', base: 2.8 - m },
      ], 0.02),
  },
  {
    // Cap da esquadria: distância da quina ao nó = (t/2)/sen(α/2) vs LIMITE_ESQUADRIA·max(0,05; t) = 6·0,2 = 1,2.
    limiar: 'LIMITE_ESQUADRIA · esquadria (cap = 6·t)',
    nominal: () => 1.2,
    monta: (d) => {
      const alfa = 2 * Math.asin(0.1 / d);
      return projetoCaso('lim-esquadria', [
        { id: 'W1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, ja: 'miter' },
        { id: 'W2', a: { x: 0, y: 0 }, b: { x: 4 * Math.cos(alfa), y: 4 * Math.sin(alfa) }, ja: 'miter' },
      ], 0.02);
    },
  },
  {
    // Piso de 0,05 m no cap da esquadria (max(0,05; t)): parede de 0,02 m, cap = 6·0,05 = 0,3.
    limiar: 'LIMITE_ESQUADRIA · piso de 0,05 m (parede de 0,02 m)',
    nominal: () => 0.3,
    monta: (d) => {
      const alfa = 2 * Math.asin(0.01 / d);
      return projetoCaso('lim-esquadria-piso', [
        { id: 'W1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, tipo: TIPO_FINO, ja: 'miter' },
        { id: 'W2', a: { x: 0, y: 0 }, b: { x: 4 * Math.cos(alfa), y: 4 * Math.sin(alfa) }, tipo: TIPO_FINO, ja: 'miter' },
      ], 0.02);
    },
  },
  {
    // Degraus: |t| da quina externa (com pareamento 'butt') contra o mesmo cap 6·t = 1,2 (stairSpec, `ok`).
    // Variável = |t| = (t/2)·cot(α/2).
    limiar: 'LIMITE_ESQUADRIA · degraus (|t| da quina ≤ cap)',
    nominal: () => 1.2,
    monta: (v) => {
      const alfa = 2 * Math.atan(0.1 / v);
      return projetoCaso('lim-degraus', [
        { id: 'W1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } },
        { id: 'W2', a: { x: 0, y: 0 }, b: { x: 4 * Math.cos(alfa), y: 4 * Math.sin(alfa) } },
      ], 0.02);
    },
  },
  {
    // Linha de centro (centerlineHit; juncoes.rs:497): |den| < 0,05 sem ponto. Variável = |sen| do ramal, com a
    // ponta do ramal 1 cm fora do eixo da parede A (dentro de tol), para que o encontro seja longe da ponta.
    limiar: 'CENTERLINE · |sen| do ramal com a linha de centro',
    nominal: () => 0.05,
    monta: (s) =>
      projetoCaso('lim-centro', [
        { id: 'A', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } },
        { id: 'B', a: { x: 0, y: 0.01 }, b: { x: 3 * cos(s), y: 0.01 + 3 * s } },
      ], 0.02),
  },
  {
    // Clamp de 0,01 m no corte do ramal, ponta a (buttAgainst; juncoes.rs:448): min(t, L − 0,01). Variável = t_raw
    // da face externa do hospedeiro sobre o ramal (L = 0,3 m, ramal de 0,02 m). Nominal = L − 0,01 = 0,29.
    limiar: 'CLAMP 0,01 · corte de ramal (ponta a, t ≤ L − 0,01)',
    nominal: () => 0.29,
    monta: (d) => {
      const t = anguloDoRamal(d);
      return projetoCaso('lim-clamp-a', [
        { id: 'H', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } },
        { id: 'R', a: { x: 2, y: 0 }, b: { x: 2 + 0.3 * Math.cos(t), y: 0.3 * Math.sin(t) }, tipo: TIPO_FINO },
      ], 0.02);
    },
  },
  {
    // Clamp de 0,01 m no corte do ramal, ponta b (juncoes.rs:450): max(t, 0,01). Simétrico ao anterior (ramal
    // refletido pelo nó): t_raw = L − d, cai abaixo de 0,01 quando d > L − 0,01.
    limiar: 'CLAMP 0,01 · corte de ramal (ponta b, t ≥ 0,01)',
    nominal: () => 0.29,
    monta: (d) => {
      const t = anguloDoRamal(d);
      return projetoCaso('lim-clamp-b', [
        { id: 'H', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } },
        { id: 'R', a: { x: 2 - 0.3 * Math.cos(t), y: -0.3 * Math.sin(t) }, b: { x: 2, y: 0 }, tipo: TIPO_FINO },
      ], 0.02);
    },
  },
  {
    // Lado do ramal sobre o eixo do hospedeiro (buttAgainst; juncoes.rs:428): |s − sMid| > 1e-6 decide o lado pelo
    // sinal de s; abaixo disso, decide pelo sentido do ramal. Variável = s do ponto de encosto.
    limiar: 'LADO 1e-6 · lado do ramal sobre o eixo do hospedeiro',
    nominal: () => 1e-6,
    monta: (s0) =>
      projetoCaso('lim-lado', [
        { id: 'H', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } },
        { id: 'R', a: { x: 2, y: s0 }, b: { x: 2, y: s0 - 3 } },
      ], 0.02),
  },
  {
    // Caixas dos grupos (clusterWalls; grupos.rs:10 CLUSTER_PAD = 0,02): duas caixas com folga de 0,02 cada lado se
    // tocam quando a distância entre eixos é ≤ 0,2 + 2·0,02 = 0,24. Variável = distância entre eixos.
    limiar: 'CLUSTER_PAD · caixas dos grupos (2·0,02 + espessura)',
    nominal: () => 0.24,
    monta: (b) =>
      projetoCaso('lim-grupo', [
        { id: 'A', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } },
        { id: 'B', a: { x: 0, y: b }, b: { x: 4, y: b } },
      ], 0.02),
  },
  {
    // Flecha mínima de arco (arcFromSagitta; geo2d.rs:120): |flecha| < 1e-6 é reta. Variável = flecha.
    limiar: 'ARCO · flecha mínima (1e-6)',
    nominal: () => 1e-6,
    monta: (f) =>
      projetoCaso('lim-arco', [{ id: 'A', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, sag: f }], 0.02),
  },
  {
    // Corda mínima do quadro (buildFrame; quadro.rs:133 e frame.ts:56): corda < 1e-4 não vira parede. Variável = corda.
    limiar: 'QUADRO · corda mínima (1e-4)',
    nominal: () => 1e-4,
    monta: (c) => projetoCaso('lim-corda', [{ id: 'A', a: { x: 0, y: 0 }, b: { x: c, y: 0 } }], 0.02),
  },
];

/**
 * Limiares que NÃO têm caso dedicado, com o motivo. São ou tie-breakers de ponto flutuante (sem efeito observável
 * sobre a topologia ou as coordenadas em geometria realista), ou casos que pedem geometria degenerada que o
 * quadro já descarta antes. `TOL_JUNCAO_PADRAO` (juncoes.rs:18) é declarado mas não é lido por nenhuma decisão.
 */
export const LIMIARES_SEM_CASO: Array<{ limiar: string; motivo: string }> = [
  { limiar: 'TOL_JUNCAO_PADRAO 0,02 (juncoes.rs:18)', motivo: 'constante não usada: a tolerância efetiva é o argumento `tol` da consulta' },
  { limiar: 'dist(O,K) < 1e-6 (planeSpecs; juncoes.rs:568)', motivo: 'corte plano degenerado (O e K coincidentes), exige canto tangente exato' },
  { limiar: 'λ em [−1e-6, 1+1e-6] (planeHit; quadro.rs:299)', motivo: 'interseção do corte plano na borda do segmento; sem efeito fora do canto curvo tangente' },
  { limiar: '|tHi − tLo| < 1e-9 (buttAgainst; juncoes.rs:471)', motivo: 'tie-breaker: exige ramal com espessura ~1e-9·tg(θ); fica no ruído de ponto flutuante' },
  { limiar: 'arredondamento 1e7 e d > 1e-7 (quebras da esquadria; juncoes.rs:305)', motivo: 'remove quebras duplicadas por arredondamento; efeito só em profundidades quase coincidentes' },
  { limiar: 'discriminantes −1e-10 e d < 1e-12 (lineCircle, circleCircle; quadro.rs:245-260)', motivo: 'tangência exata: os dois ramos devolvem o mesmo ponto' },
  { limiar: 'chord < 1e-6 (arcFromSagitta; geo2d.rs:120)', motivo: 'inalcançável: buildFrame já descarta cordas < 1e-4' },
  { limiar: '|tHigh − tLow| < 1e-9 (stairSpec; joinSides.ts:144)', motivo: 'tie-breaker de faixa quase vertical, como o de buttAgainst' },
  { limiar: 'Limpeza do clamp 0,01 no corte da linha de centro (ate_a_linha_de_centro; juncoes.rs:525)', motivo: 'o encontro com a linha de centro não cai a 1 cm da ponta nos casos construídos (ver CLAMP)' },
];

/**
 * Casos de limiar, nos dois lados de cada limiar (margem `MARGEM_LIMIAR` relativa), prontos para o diferencial TS x
 * Rust. Determinísticos: não dependem de semente.
 */
export function casosDeLimiar(): CasoDeLimiar[] {
  const casos: CasoDeLimiar[] = [];
  for (const d of DESCRITORES_DE_LIMIAR) {
    for (const tol of d.tols ?? [0.02]) {
      const valor = d.nominal(tol);
      const nome = d.tols ? `${d.limiar} · tol=${tol}` : d.limiar;
      const lados: Array<['abaixo' | 'acima', number]> = [
        ['abaixo', valor * (1 - MARGEM_LIMIAR)],
        ['acima', valor * (1 + MARGEM_LIMIAR)],
      ];
      for (const [lado, x] of lados) casos.push({ limiar: nome, lado, valor, projeto: d.monta(x, tol) });
    }
  }
  return casos;
}
