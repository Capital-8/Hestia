import { corDoMaterialInstalacao, destinoDaFamilia, familiaDaBiblioteca, MAPA_ACABAMENTOS, MATERIAL_NEUTRO, resolverMaterialVisualCorpo, type Familia } from '@hestia/model';
import { malhaDasPecas, malhaDosCorpos, resolverFamilia, type Malha } from '@hestia/engine';

/*
 * Miniatura MEP por silhueta real (ficha B7). As famílias de tubulação, conexão, caixa e dispositivo guardam a geometria em
 * CORPOS (extrusão, revolução, varredura), não em peças de mobiliário; a miniatura de frente só desenhava peças e saía cinza.
 * Aqui os sólidos (peças e corpos, com o tipo padrão) viram triângulos numa vista isométrica fixa, pintados com a cor do
 * material de cada um. Nada de renderizador novo: a geometria vem de `resolverFamilia` e das malhas do motor.
 */

export interface TrianguloSilhueta {
  /** Caminho SVG do triângulo (`M x y L x y L x y Z`), em unidades do viewBox. */
  d: string;
  /** Cor de preenchimento já sombreada ("rgb(r,g,b)"). */
  cor: string;
}

export interface SilhuetaMep {
  largura: number;
  altura: number;
  /** Do fundo para a frente: pintar nesta ordem produz o desenho certo. */
  triangulos: TrianguloSilhueta[];
}

/** Painéis de sistema (ficha J1): as famílias desses painéis são as MEP que usam esta miniatura. */
const PAINEIS_MEP: ReadonlySet<string> = new Set(['hidraulica', 'eletrico', 'hvac']);

/** Cor de reserva para material sem cor conhecida: o mesmo cinza neutro do 3D. */
const COR_NEUTRA = corDoMaterialInstalacao(MATERIAL_NEUTRO) ?? '#a9adb2';

/** Margem livre entre o desenho e a borda, em unidades do SVG. */
const MARGEM = 4;

/** Isométrica: a horizontal (x, y) gira 30° e o eixo vertical (z) fica na vertical da tela. */
const COS30 = Math.cos(Math.PI / 6);
const SEN30 = 0.5;

/** Direção do observador (1, 1, 1): só as faces com normal voltada para ele entram. */
const RAIZ3 = Math.sqrt(3);

/** Direção da luz (vem de cima e da frente): dá o contraste entre as faces. */
const LUZ = normalizar([-0.4, 0.5, 0.8]);

const cache = new Map<string, SilhuetaMep | null>();

/** Esvazia o cache das silhuetas (testes e mudança de conteúdo da família). */
export function limparCacheSilhuetasMep(): void {
  cache.clear();
}

/** Família de tubulação, conexão, caixa, eletroduto, dispositivo, duto, terminal ou equipamento (painéis hidráulica, elétrico e HVAC). */
export function ehFamiliaMep(familia: Familia): boolean {
  return PAINEIS_MEP.has(destinoDaFamilia(familia.categoria)?.painel ?? '');
}

/** Cor base "#rrggbb" do material de um corpo ou peça (id do projeto, catálogo, apelido `mat_*` ou cinza neutro; nunca madeira). */
export function corBaseDoMaterial(material: string | null): string {
  const id = resolverMaterialVisualCorpo(material, {}, (x) => MAPA_ACABAMENTOS[x] !== undefined);
  return corDoMaterialInstalacao(id) ?? MAPA_ACABAMENTOS[id]?.cor ?? COR_NEUTRA;
}

/**
 * Silhueta isométrica do tipo padrão da família, ou `null` quando ela não tem nenhum sólido (aí a Miniatura usa o
 * retângulo de sempre). Determinística: a mesma família dá o mesmo resultado.
 */
export function silhuetaMep(familia: Familia, largura = 120, altura = 64): SilhuetaMep | null {
  const chave = `${familia.id}|${largura}|${altura}`;
  if (cache.has(chave)) return cache.get(chave) ?? null;
  const res = resolverFamilia(familia, { biblioteca: familiaDaBiblioteca });
  const pecas = res.pecas;
  const corpos = res.corpos ?? [];
  const fontes: Fonte[] = [
    { malha: malhaDasPecas(pecas).solidas, corDe: (i) => corBaseDoMaterial(pecas[i]?.material ?? null) },
    { malha: malhaDosCorpos(corpos).solidas, corDe: (i) => corBaseDoMaterial(corpos[i]?.material ?? null) },
  ];
  const silhueta = projetar(fontes, largura, altura);
  cache.set(chave, silhueta);
  return silhueta;
}

interface Fonte {
  malha: Malha;
  /** Cor base do sólido de índice `i` (índice da peça ou do corpo na entrada). */
  corDe: (i: number) => string;
}

interface TrianguloProjetado {
  /** Vértices em (sx, sy) antes de caber no quadro. */
  pontos: [number, number][];
  /** Profundidade para a ordenação: maior fica mais perto do observador. */
  prof: number;
  cor: string;
}

function normalizar(v: readonly number[]): number[] {
  const m = Math.hypot(...v);
  return m > 0 ? v.map((x) => x / m) : [0, 0, 0];
}

function sombrear(hex: string, k: number): string {
  const ok = /^#[0-9a-f]{6}$/i.test(hex);
  const n = parseInt(ok ? hex.slice(1) : COR_NEUTRA.slice(1), 16);
  const canais = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c * k));
  return `rgb(${canais.join(',')})`;
}

function coletar(fontes: readonly Fonte[]): TrianguloProjetado[] {
  const saida: TrianguloProjetado[] = [];
  for (const { malha, corDe } of fontes) {
    for (let t = 0; t + 2 < malha.indices.length; t += 3) {
      const vertices = [malha.indices[t], malha.indices[t + 1], malha.indices[t + 2]];
      if (vertices.some((v) => v === undefined)) continue;
      const [ia, ib, ic] = vertices as [number, number, number];
      const n = [0, 1, 2].map((k) => malha.normals[ia * 3 + k] ?? 0);
      // Face de trás (normal para longe do observador): fica escondida pelo sólido, não entra.
      if ((n[0] ?? 0) + (n[1] ?? 0) + (n[2] ?? 0) <= 0) continue;
      const iluminacao = (n[0] ?? 0) * LUZ[0]! + (n[1] ?? 0) * LUZ[1]! + (n[2] ?? 0) * LUZ[2]!;
      const k = 0.6 + 0.4 * Math.max(0, iluminacao);
      const xyz = [ia, ib, ic].map((v) => [0, 1, 2].map((c) => malha.positions[v * 3 + c] ?? 0));
      const pontos = xyz.map(([x, y, z]): [number, number] => [(x! - y!) * COS30, (x! + y!) * SEN30 - z!]);
      const prof = xyz.reduce((acc, [x, y, z]) => acc + (x! + y! + z!), 0) / (3 * RAIZ3);
      const cor = sombrear(corDe(malha.pecaDoTriangulo[t / 3] ?? -1), k);
      saida.push({ pontos, prof, cor });
    }
  }
  return saida.sort((a, b) => a.prof - b.prof);
}

function projetar(fontes: readonly Fonte[], largura: number, altura: number): SilhuetaMep | null {
  const tris = coletar(fontes);
  const xs = tris.flatMap((t) => t.pontos.map((p) => p[0]));
  const ys = tris.flatMap((t) => t.pontos.map((p) => p[1]));
  if (xs.length === 0) return null;
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  const kx = spanX > 0 ? (largura - 2 * MARGEM) / spanX : Infinity;
  const ky = spanY > 0 ? (altura - 2 * MARGEM) / spanY : Infinity;
  const escala = Math.min(kx, ky);
  if (!Number.isFinite(escala) || escala <= 0) return null;
  const dx = (largura - spanX * escala) / 2 - minX * escala;
  const dy = (altura - spanY * escala) / 2 - minY * escala;
  const f = (v: number): string => String(Math.round(v * 100) / 100);
  const triangulos = tris.map((t): TrianguloSilhueta => {
    const [a, b, c] = t.pontos.map(([x, y]) => `${f(x * escala + dx)} ${f(y * escala + dy)}`);
    return { d: `M${a} L${b} L${c} Z`, cor: t.cor };
  });
  return { largura, altura, triangulos };
}
