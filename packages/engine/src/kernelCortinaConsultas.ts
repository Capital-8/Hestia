/**
 * Leitura das saídas das consultas da parede cortina (decisão 0056, fase 1; consultas 100, 101, 102, 104, 105 e, da fase 5, a 107). Cada função recebe o que `CenaV2.consultar`
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

/**
 * Peça avulsa (`grupos`, fase 3): esquadria de montante L, trapézio e canto, e o montante de canto entre cortinas. Uma malha no MUNDO por
 * (cortina, papel, material, transparência). Os vértices são só os da peça (cópia) e os índices são LOCAIS a ela.
 */
export interface PecaAvulsaCortina {
  cortina: number;
  /** 0 montante (é o único papel que sai em `grupos` hoje). */
  papel: number;
  /** `material_num` do montante ou da esquadria; `null` = sem material. */
  material: number | null;
  /** Vidro de esquadria (o contrato já prevê; hoje sai 0). */
  transparente: boolean;
  /** Vértices `x, y, z` do MUNDO e índices LOCAIS (3 por triângulo). */
  vertices: Float64Array;
  indices: Uint32Array;
}

export interface MalhaCortina {
  protos: ProtoCortina[];
  instancias: InstanciaCortina[];
  grupos: PecaAvulsaCortina[];
}

/** Lê `grupos` (6 valores por grupo), `vertices_av` e `indices_av` (índices ABSOLUTOS) e devolve cada grupo com vértices e índices próprios. */
function lerPecasAvulsas(s: SaidasCortina): PecaAvulsaCortina[] {
  const [g, va, ia] = ['grupos', 'vertices_av', 'indices_av'].map((n) => get(s, n));
  if (g!.length % 6 !== 0) throw new Error('kernelCortina: a saída "grupos" não tem 6 valores por grupo');
  if (va!.length % 3 !== 0) throw new Error('kernelCortina: a saída "vertices_av" não tem 3 valores por vértice');
  const nv = va!.length / 3;
  const out: PecaAvulsaCortina[] = [];
  for (let k = 0; k < g!.length / 6; k++) {
    const [cortina, papel, material, primeiro, n, transp] = [0, 1, 2, 3, 4, 5].map((o) => g![6 * k + o]!);
    if (transp! > 1) throw new Error(`kernelCortina: o grupo ${k} tem "transparente" fora de 0 e 1`);
    if (n! % 3 !== 0 || primeiro! + n! > ia!.length) throw new Error(`kernelCortina: o grupo ${k} aponta índices fora de "indices_av"`);
    // Vértices de cada peça são contíguos no Rust: a faixa vai do menor ao maior índice que ela usa.
    const abs: number[] = [];
    for (let q = 0; q < n!; q++) {
      const i = ia![primeiro! + q]!;
      if (i >= nv) throw new Error(`kernelCortina: o grupo ${k} usa o vértice ${i} de ${nv}`);
      abs.push(i);
    }
    const base = abs.length ? abs.reduce((a, b) => Math.min(a, b), Infinity) : 0;
    const topo = abs.length ? abs.reduce((a, b) => Math.max(a, b), 0) : -1;
    out.push({
      cortina: cortina!,
      papel: papel!,
      material: ausente(material!),
      transparente: transp! === 1,
      vertices: Float64Array.from({ length: 3 * (topo - base + 1) }, (_, q) => va![3 * base + q]!),
      indices: Uint32Array.from(abs, (i) => i - base),
    });
  }
  return out;
}

export function lerMalhaCortina(s: SaidasCortina): MalhaCortina {
  const [p, v, ix, inst, m] = ['prototipos', 'vertices', 'indices', 'instancias', 'matrizes'].map((n) => get(s, n));
  const grupos = lerPecasAvulsas(s);
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
  return { protos, instancias, grupos };
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

// ───────────── 107 cortina_celula_porta ─────────────

/** Esquadria numa célula (vão virtual) como o kernel a devolve: coordenadas da cortina (`s` ao longo do eixo a partir do início da própria cortina, `z` acima da base dela). */
export interface PortaCortina {
  cortina: number;
  /** Célula canônica da região (a de menor índice). */
  i: number;
  j: number;
  /** `id_num` do tipo na seção 7 (`tipos_abertura`). */
  tipoAbertura: number;
  /** Ajuste da grade (`ajuste` 1) em vez de preencher a célula. */
  grade: boolean;
  flipMao: boolean;
  flipSentido: boolean;
  /** O tipo é janela (senão, porta). */
  janela: boolean;
  /** Lados em que existe montante (o batente próprio da esquadria é omitido ali, ADR §7.6). */
  lados: { esquerda: boolean; direita: boolean; base: boolean; topo: boolean };
  /** `FLAGS_ESQUADRIA` (soleira derivada, vão limitado, folha mínima, fora do piso, região de mais de uma célula). */
  flags: number;
  /** O vão: `s0..s1 × z0..z1`. */
  s0: number;
  s1: number;
  z0: number;
  z1: number;
  /** Profundidade do sistema (m). */
  profundidade: number;
  /** Peitoril efetivo (m acima da base livre da região). */
  soleira: number;
  larguraLivre: number;
  alturaLivre: number;
  folhaMinima: number;
  /** Base da região, em z acima da base da cortina. */
  zRegiao: number;
}

/** Linha de grade que o ajuste à esquadria pede (`linhas` e `linhas_pos`). */
export interface LinhaAjusteCortina {
  cortina: number;
  i: number;
  j: number;
  eixo: 'u' | 'v';
  /** Posição em metros. */
  pos: number;
}

export interface PortasCortina {
  portas: PortaCortina[];
  linhas: LinhaAjusteCortina[];
}

/** Lê `portas`, `vaos`, `linhas` e `linhas_pos`; recusa tamanho incoerente, booleano fora de 0 e 1, `lados` fora de 4 bits e vão não finito ou invertido. */
export function lerPortasCortina(s: SaidasCortina): PortasCortina {
  const [p, v, l, lp] = ['portas', 'vaos', 'linhas', 'linhas_pos'].map((n) => get(s, n));
  if (p!.length % 10 !== 0) throw new Error('kernelCortina: a saída "portas" não tem 10 valores por esquadria');
  const n = p!.length / 10;
  if (v!.length !== 10 * n) throw new Error(`kernelCortina: a saída "vaos" tem ${v!.length} valores e "portas" pede ${10 * n}`);
  if (l!.length % 4 !== 0) throw new Error('kernelCortina: a saída "linhas" não tem 4 valores por linha');
  if (lp!.length !== l!.length / 4) throw new Error(`kernelCortina: "linhas_pos" tem ${lp!.length} posições e "linhas" pede ${l!.length / 4}`);
  const portas: PortaCortina[] = [];
  for (let k = 0; k < n; k++) {
    const r = (o: number) => p![10 * k + o]!;
    const x = (o: number) => v![10 * k + o]!;
    for (const [o, nome] of [[4, 'ajuste'], [5, 'flip_mao'], [6, 'flip_sentido'], [7, 'janela']] as const) {
      if (r(o) > 1) throw new Error(`kernelCortina: a esquadria ${k} tem "${nome}" fora de 0 e 1`);
    }
    if (r(8) > 15) throw new Error(`kernelCortina: a esquadria ${k} tem "lados" fora dos 4 bits`);
    for (let q = 0; q < 10; q++) if (!Number.isFinite(x(q))) throw new Error(`kernelCortina: a esquadria ${k} tem um valor de vão que não é número`);
    if (x(1) < x(0) || x(3) < x(2)) throw new Error(`kernelCortina: a esquadria ${k} tem o vão invertido`);
    const lados = r(8);
    portas.push({
      cortina: r(0),
      i: r(1),
      j: r(2),
      tipoAbertura: r(3),
      grade: r(4) === 1,
      flipMao: r(5) === 1,
      flipSentido: r(6) === 1,
      janela: r(7) === 1,
      lados: { esquerda: (lados & 1) !== 0, direita: (lados & 2) !== 0, base: (lados & 4) !== 0, topo: (lados & 8) !== 0 },
      flags: r(9),
      s0: x(0),
      s1: x(1),
      z0: x(2),
      z1: x(3),
      profundidade: x(4),
      soleira: x(5),
      larguraLivre: x(6),
      alturaLivre: x(7),
      folhaMinima: x(8),
      zRegiao: x(9),
    });
  }
  const linhas: LinhaAjusteCortina[] = [];
  for (let k = 0; k < l!.length / 4; k++) {
    if (l![4 * k + 3]! > 1) throw new Error(`kernelCortina: a linha de ajuste ${k} tem "eixo" fora de 0 e 1`);
    linhas.push({ cortina: l![4 * k]!, i: l![4 * k + 1]!, j: l![4 * k + 2]!, eixo: eixoDe(l![4 * k + 3]!), pos: lp![k]! });
  }
  return { portas, linhas };
}
