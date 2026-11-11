/**
 * Leitura das saídas das consultas da parede cortina (decisão 0056, fase 1; consultas 100, 101, 102, 104 e 105). Cada função recebe o que `CenaV2.consultar`
 * devolve (um array tipado por nome de saída) e devolve objetos nomeados; nada aqui calcula geometria. O formato de cada saída está no JSON do contrato
 * (`crates/geom-wasm/schema/cena-v11.json`).
 */
import { ID_AUSENTE_CORTINA } from './kernelCortinaTabelas.ts';

export type SaidasCortina = Record<string, ArrayLike<number>>;

const ausente = (n: number): number | null => (n === ID_AUSENTE_CORTINA ? null : n);
const eixoDe = (n: number): 'u' | 'v' => (n === 0 ? 'u' : 'v');
const get = (s: SaidasCortina, nome: string): ArrayLike<number> => {
  const v = s[nome];
  if (!v) throw new Error(`kernelCortina: a saída "${nome}" não veio na consulta`);
  return v;
};

// ───────────── 100 cortina_grade ─────────────

export interface LinhaGradeCortina {
  cortina: number;
  eixo: 'u' | 'v';
  /** 1 a n-1 (0 e n são as bordas, que não são linhas). */
  indice: number;
  /** 0 gerada, 1 extra, 2 manual. */
  origem: number;
  flags: number;
  pos: number;
}

export interface CelulaCortina {
  cortina: number;
  i: number;
  j: number;
  regiao: number;
  /** `id_num` do tipo de painel. */
  painel: number;
  flags: number;
  s0: number;
  s1: number;
  z0: number;
  z1: number;
}

export interface SegmentoCortina {
  cortina: number;
  /** Índice GLOBAL da linha: U = 0..nu (0 borda início, nu borda fim), V = nu+1..nu+1+nv (nu+1 borda base). */
  linha: number;
  k: number;
  removido: boolean;
  /** `id_num` do tipo de montante; `null` = sem montante no papel. */
  montante: number | null;
  de: number;
  ate: number;
}

export interface GradeCortina {
  linhas: LinhaGradeCortina[];
  celulas: CelulaCortina[];
  segmentos: SegmentoCortina[];
}

export function lerGradeCortina(s: SaidasCortina): GradeCortina {
  const [l, lp, c, cr, sg, se] = ['linhas', 'linhas_pos', 'celulas', 'celulas_ret', 'segmentos', 'segmentos_ext'].map((n) => get(s, n));
  const linhas: LinhaGradeCortina[] = [];
  for (let k = 0; k < l!.length / 5; k++) linhas.push({ cortina: l![5 * k]!, eixo: eixoDe(l![5 * k + 1]!), indice: l![5 * k + 2]!, origem: l![5 * k + 3]!, flags: l![5 * k + 4]!, pos: lp![k]! });
  const celulas: CelulaCortina[] = [];
  for (let k = 0; k < c!.length / 6; k++) {
    celulas.push({ cortina: c![6 * k]!, i: c![6 * k + 1]!, j: c![6 * k + 2]!, regiao: c![6 * k + 3]!, painel: c![6 * k + 4]!, flags: c![6 * k + 5]!, s0: cr![4 * k]!, s1: cr![4 * k + 1]!, z0: cr![4 * k + 2]!, z1: cr![4 * k + 3]! });
  }
  const segmentos: SegmentoCortina[] = [];
  for (let k = 0; k < sg!.length / 5; k++) {
    segmentos.push({ cortina: sg![5 * k]!, linha: sg![5 * k + 1]!, k: sg![5 * k + 2]!, removido: sg![5 * k + 3]! === 1, montante: ausente(sg![5 * k + 4]!), de: se![2 * k]!, ate: se![2 * k + 1]! });
  }
  return { linhas, celulas, segmentos };
}

// ───────────── 101 cortina_malha ─────────────

export interface ProtoCortina {
  proto: number;
  /** 0 montante, 1 painel de vidro, 2 painel sólido. */
  papel: number;
  tipo: number;
  material: number | null;
  /** Vértices `x, y, z` do protótipo (cópia) e índices LOCAIS a ele. */
  vertices: Float64Array;
  indices: Uint32Array;
}

export interface InstanciaCortina {
  cortina: number;
  proto: number;
  papel: number;
  refI: number;
  refJ: number;
  transparente: boolean;
  /** 12 números: três linhas `[r0 r1 r2 t]` (linha-maior); mundo = M · (x, y, z, 1). */
  matriz: Float64Array;
}

export interface MalhaCortina {
  protos: ProtoCortina[];
  instancias: InstanciaCortina[];
}

export function lerMalhaCortina(s: SaidasCortina): MalhaCortina {
  const [p, v, ix, inst, m] = ['prototipos', 'vertices', 'indices', 'instancias', 'matrizes'].map((n) => get(s, n));
  const protos: ProtoCortina[] = [];
  for (let k = 0; k < p!.length / 8; k++) {
    const r = (o: number) => p![8 * k + o]!;
    protos.push({
      proto: r(0),
      papel: r(1),
      tipo: r(2),
      material: ausente(r(3)),
      vertices: Float64Array.from(Array.from({ length: 3 * r(5) }, (_, q) => v![3 * r(4) + q]!)),
      indices: Uint32Array.from(Array.from({ length: r(7) }, (_, q) => ix![r(6) + q]!)),
    });
  }
  const instancias: InstanciaCortina[] = [];
  for (let k = 0; k < inst!.length / 6; k++) {
    instancias.push({
      cortina: inst![6 * k]!,
      proto: inst![6 * k + 1]!,
      papel: inst![6 * k + 2]!,
      refI: inst![6 * k + 3]!,
      refJ: inst![6 * k + 4]!,
      transparente: inst![6 * k + 5]! === 1,
      matriz: Float64Array.from(Array.from({ length: 12 }, (_, q) => m![12 * k + q]!)),
    });
  }
  return { protos, instancias };
}

// ───────────── 102 cortina_planta ─────────────

export interface LinhaPlantaCortina {
  cortina: number;
  /** 0 contorno, 1 vidro, 2 montante, 3 painel sólido. */
  papel: number;
  /** 0 cortado, 1 projetado, 2 oculto. */
  estilo: number;
  /** Contornos fechados repetem o primeiro ponto no fim; a linha do eixo do vidro (detalhe 0) é aberta. */
  pontos: Array<{ x: number; y: number }>;
}

export function lerPlantaCortina(s: SaidasCortina): LinhaPlantaCortina[] {
  const l = get(s, 'linhas');
  const p = get(s, 'pontos');
  const out: LinhaPlantaCortina[] = [];
  let ini = 0;
  for (let k = 0; k < l.length / 4; k++) {
    const n = l[4 * k + 3]!;
    out.push({ cortina: l[4 * k]!, papel: l[4 * k + 1]!, estilo: l[4 * k + 2]!, pontos: Array.from({ length: n }, (_, q) => ({ x: p[2 * (ini + q)]!, y: p[2 * (ini + q) + 1]! })) });
    ini += n;
  }
  return out;
}

// ───────────── 104 quant_cortina ─────────────

export interface LinhaQuantCortina {
  cortina: number;
  /** 0 a 5 montante (por papel), 10 vidro, 11 painel sólido, 12 painel vazio, 20 sistema. */
  papel: number;
  /** `id_num` do tipo (montante ou painel; 0 no sistema). */
  tipo: number;
  material: number | null;
  n: number;
  comprimento: number;
  area: number;
  areaLiquida: number;
  volume: number;
}

export function lerQuantCortina(s: SaidasCortina): LinhaQuantCortina[] {
  const l = get(s, 'linhas');
  const v = get(s, 'valores');
  return Array.from({ length: l.length / 5 }, (_, k) => ({
    cortina: l[5 * k]!,
    papel: l[5 * k + 1]!,
    tipo: l[5 * k + 2]!,
    material: ausente(l[5 * k + 3]!),
    n: l[5 * k + 4]!,
    comprimento: v[4 * k]!,
    area: v[4 * k + 1]!,
    areaLiquida: v[4 * k + 2]!,
    volume: v[4 * k + 3]!,
  }));
}

// ───────────── 105 cortina_avisos ─────────────

export interface AvisoCortina {
  cortina: number;
  /** `AVISO_CORTINA` de `kernelCortinaTabelas.ts`. */
  codigo: number;
  i: number | null;
  j: number | null;
  medido: number;
  limite: number;
  x: number;
  y: number;
  z: number;
}

export function lerAvisosCortina(s: SaidasCortina): AvisoCortina[] {
  const a = get(s, 'avisos');
  const v = get(s, 'valores');
  return Array.from({ length: a.length / 4 }, (_, k) => ({
    cortina: a[4 * k]!,
    codigo: a[4 * k + 1]!,
    i: ausente(a[4 * k + 2]!),
    j: ausente(a[4 * k + 3]!),
    medido: v[5 * k]!,
    limite: v[5 * k + 1]!,
    x: v[5 * k + 2]!,
    y: v[5 * k + 3]!,
    z: v[5 * k + 4]!,
  }));
}
