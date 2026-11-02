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
