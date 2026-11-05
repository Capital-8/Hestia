/* eslint-disable max-lines -- o parser é um leitor sequencial de seções/entidades; dividir por seção duplicaria o estado */
import type { CadLayer, CadPath, CadText, CadUnit } from '@hestia/model';
import type { DxfPoint } from './dxf.ts';
import { t, type Lang } from './i18n.ts';

/**
 * Importador de DXF (fase 5): lê o arquivo de outro programa e devolve as camadas, os traços e os textos para virarem um
 * `CadDrawing`. A geometria sai em METROS (a unidade do `$INSUNITS` é aplicada) e no sistema do arquivo (x, y; y para
 * cima). A inserção (ponto, rotação, escala) e o nível ficam com quem chama.
 */

/** O que o parser devolve, já em metros e sem transformação de inserção. */
export interface DxfImportResult {
  /** Nome do desenho (normalmente o nome do arquivo, sem extensão). */
  name: string;
  /** Unidade detectada no `$INSUNITS` (ausente no arquivo = metros). */
  unit: CadUnit;
  /** Metros por unidade do arquivo (mm = 0,001; ft = 0,3048). */
  unitScale: number;
  layers: CadLayer[];
  paths: CadPath[];
  texts: CadText[];
  /** Caixa do desenho em metros (unidade já aplicada). */
  extents: { min: DxfPoint; max: DxfPoint };
  /** O que foi ignorado ou aproximado (HATCH, DIMENSION, OCS fora do plano, bloco sem suporte...). */
  warnings: string[];
}

/** Metros por unidade de desenho (a saída do parser é sempre em metros). */
export const METROS_POR_UNIDADE: Record<CadUnit, number> = { mm: 0.001, cm: 0.01, m: 1, ft: 0.3048, in: 0.0254 };

/** Código do `$INSUNITS` de cada unidade (o mesmo mapa do escritor, ao contrário). */
const UNIDADE_POR_INSUNITS: Record<number, CadUnit> = { 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm' };

/** Entidades conhecidas que a v1 não representa: viram um aviso por tipo (o parse continua). */
const NAO_SUPORTADAS: Record<string, 'io_dxf_skip_hatch' | 'io_dxf_skip_dimension' | 'io_dxf_skip_spline' | 'io_dxf_skip_ellipse' | 'io_dxf_skip_solid'> = {
  HATCH: 'io_dxf_skip_hatch',
  DIMENSION: 'io_dxf_skip_dimension',
  SPLINE: 'io_dxf_skip_spline',
  ELLIPSE: 'io_dxf_skip_ellipse',
  SOLID: 'io_dxf_skip_solid',
};

/** Entidades de estrutura, consumidas pelo laço principal sem aviso (não desenham sozinhas). */
const ESTRUTURAIS = new Set(['VERTEX', 'SEQEND', 'ATTRIB', 'ATTDEF', 'BLOCK', 'ENDBLK']);

/** Segmentos da tesselação de arcos e círculos (o modelo só tem polilinhas). */
const SEGMENTOS_ARCO = 48;

/** Profundidade máxima de blocos aninhados: um bloco que se insere em si mesmo não trava o parse. */
const PROFUNDIDADE_MAXIMA = 8;

/** Altura usada quando o TEXT/MTEXT não traz o código 40 (valor típico do DXF). */
const ALTURA_PADRAO = 2.5;

/** Par código/valor do arquivo (linhas alternadas). */
type Par = [number, string];

/** Registro do DXF: tipo (código 0) e os pares seguintes. */
interface Registro {
  tipo: string;
  pares: Par[];
}

/** Matriz afim 2D: x' = a·x + b·y + e; y' = c·x + d·y + f. */
interface Matriz {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const IDENTIDADE: Matriz = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** Definição de bloco: nome, ponto base e as entidades internas. */
interface Bloco {
  nome: string;
  base: DxfPoint;
  registros: Registro[];
}

/** O que a expansão das entidades acumula (já em unidades do arquivo). */
interface Coletor {
  paths: CadPath[];
  texts: CadText[];
  warnings: string[];
  /** Assuntos já avisados: um aviso por tipo, não por entidade. */
  avisados: Set<string>;
  lang: Lang;
}

/** Contexto da expansão: os blocos do arquivo e o limite de aninhamento. */
interface Contexto {
  blocos: Map<string, Bloco>;
  profundidadeMaxima: number;
}

/** Variáveis do HEADER já lidas (unidade e extensão). */
interface Cabecalho {
  unit: CadUnit;
  unitScale: number;
  extMin?: DxfPoint;
  extMax?: DxfPoint;
}

/** Estado de uma POLYLINE em leitura: vértices, flags e onde o laço principal deve continuar. */
interface Polilinha {
  vertices: DxfPoint[];
  fechada: boolean;
  tresD: boolean;
  malha: boolean;
  /** Índice do último registro consumido (VERTEX ou SEQEND). */
  fim: number;
}

/**
 * Lê o texto de um DXF (R12 ou R2000) e devolve o desenho em metros. Entidades suportadas na v1: LINE, LWPOLYLINE,
 * POLYLINE/VERTEX/SEQEND, ARC, CIRCLE, TEXT, MTEXT e INSERT (blocos expandidos, sem atributos). `name` vira o nome do
 * desenho; ausente = "CAD".
 */
export function parseDxfText(text: string, name = 'CAD', lang: Lang = 'pt'): DxfImportResult {
  const secoes = separarSecoes(lerPares(text));
  const warnings: string[] = [];
  const cabecalho = lerCabecalho(secoes.get('HEADER') ?? [], warnings, lang);
  const layers = lerCamadas(secoes.get('TABLES') ?? []);
  const blocos = new Map<string, Bloco>();
  for (const bloco of lerBlocos(secoes.get('BLOCKS') ?? [])) blocos.set(bloco.nome.toUpperCase(), bloco);
  const coletor: Coletor = { paths: [], texts: [], warnings, avisados: new Set(), lang };
  expandir(registros(secoes.get('ENTITIES') ?? []), IDENTIDADE, 0, null, coletor, { blocos, profundidadeMaxima: PROFUNDIDADE_MAXIMA });

  // A geometria do parser é sempre em metros: a unidade do arquivo vale em toda coordenada, altura e raio.
  const escala = cabecalho.unitScale;
  for (const path of coletor.paths) {
    for (const p of path.pts) {
      p.x *= escala;
      p.y *= escala;
    }
  }
  for (const texto of coletor.texts) {
    texto.at.x *= escala;
    texto.at.y *= escala;
    texto.height *= escala;
  }

  // Camadas referidas por entidades e ausentes da tabela LAYER entram no fim (cor ausente = 7).
  const nomes = new Set(layers.map((l) => l.name));
  for (const path of coletor.paths) {
    if (nomes.has(path.layer)) continue;
    nomes.add(path.layer);
    layers.push({ name: path.layer });
  }
  for (const texto of coletor.texts) {
    if (nomes.has(texto.layer)) continue;
    nomes.add(texto.layer);
    layers.push({ name: texto.layer });
  }

  return {
    name,
    unit: cabecalho.unit,
    unitScale: escala,
    layers,
    paths: coletor.paths,
    texts: coletor.texts,
    extents: calcularExtensoes(cabecalho, coletor),
    warnings: [...new Set(warnings)],
  };
}

/** Lê os pares código/valor (linhas alternadas), tolerando CRLF, LF e CR e um BOM no começo. */
function lerPares(text: string): Par[] {
  const linhas = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
  const pares: Par[] = [];
  let pendente: number | null = null;
  for (const linha of linhas) {
    if (pendente === null) {
      const bruto = linha.trim();
      const codigo = Number(bruto);
      if (bruto !== '' && Number.isInteger(codigo)) pendente = codigo;
      continue;
    }
    pares.push([pendente, linha]);
    pendente = null;
  }
  return pares;
}

/** Separa as seções do arquivo (HEADER, TABLES, BLOCKS, ENTITIES...) pelos marcadores 0/SECTION. */
function separarSecoes(pares: Par[]): Map<string, Par[]> {
  const secoes = new Map<string, Par[]>();
  let atual: Par[] | null = null;
  for (let i = 0; i < pares.length; i++) {
    const [codigo, valor] = pares[i]!;
    const nome = valor.trim().toUpperCase();
    if (codigo === 0 && nome === 'SECTION') {
      const secao = (pares[i + 1]?.[1] ?? '').trim().toUpperCase();
      atual = secoes.get(secao) ?? [];
      secoes.set(secao, atual);
      i++;
      continue;
    }
    if (codigo === 0 && nome === 'ENDSEC') {
      atual = null;
      continue;
    }
    atual?.push([codigo, valor]);
  }
  return secoes;
}

/** Agrupa os pares em registros pelo código 0. */
function registros(pares: Par[]): Registro[] {
  const out: Registro[] = [];
  for (const [codigo, valor] of pares) {
    if (codigo === 0) out.push({ tipo: valor.trim().toUpperCase(), pares: [] });
    else out.at(-1)?.pares.push([codigo, valor]);
  }
  return out;
}

/** Primeiro valor do código no registro. */
function campo(registro: Registro, codigo: number): string | undefined {
  return registro.pares.find(([c]) => c === codigo)?.[1];
}

/** Valor numérico do código no registro (ponto decimal; vírgula não é aceita). */
function numero(registro: Registro, codigo: number): number | undefined {
  const valor = campo(registro, codigo);
  if (valor === undefined) return undefined;
  const n = Number(valor.trim());
  return Number.isFinite(n) ? n : undefined;
}

/** Ponto (código x/y) do registro, se os dois existirem. */
function ponto(registro: Registro, codigoX: number, codigoY: number): DxfPoint | undefined {
  const x = numero(registro, codigoX);
  const y = numero(registro, codigoY);
  return x === undefined || y === undefined ? undefined : { x, y };
}

/** Ponto a partir de uma lista de pares (variáveis do HEADER, que não são registros). */
function pontoDosPares(pares: Par[] | undefined, codigoX: number, codigoY: number): DxfPoint | undefined {
  const x = pares?.find(([c]) => c === codigoX)?.[1];
  const y = pares?.find(([c]) => c === codigoY)?.[1];
  if (x === undefined || y === undefined) return undefined;
  const px = Number(x.trim());
  const py = Number(y.trim());
  return Number.isFinite(px) && Number.isFinite(py) ? { x: px, y: py } : undefined;
}

/** Aplica a matriz ao ponto. */
function aplicar(m: Matriz, p: DxfPoint): DxfPoint {
  return { x: m.a * p.x + m.b * p.y + m.e, y: m.c * p.x + m.d * p.y + m.f };
}

/** Compõe duas matrizes: `externa` aplicada depois de `interna`. */
function compor(externa: Matriz, interna: Matriz): Matriz {
  return {
    a: externa.a * interna.a + externa.b * interna.c,
    b: externa.a * interna.b + externa.b * interna.d,
    c: externa.c * interna.a + externa.d * interna.c,
    d: externa.c * interna.b + externa.d * interna.d,
    e: externa.a * interna.e + externa.b * interna.f + externa.e,
    f: externa.c * interna.e + externa.d * interna.f + externa.f,
  };
}

/** Cor ACI própria da entidade (0 = ByBlock e 256 = ByLayer não são cor própria). */
function corDe(registro: Registro): number | undefined {
  const cor = numero(registro, 62);
  return cor !== undefined && cor > 0 && cor < 256 ? cor : undefined;
}

/** Emite o aviso uma única vez por assunto. */
function avisar(coletor: Coletor, chave: string, texto: string): void {
  if (coletor.avisados.has(chave)) return;
  coletor.avisados.add(chave);
  coletor.warnings.push(texto);
}

/** Extrusão fora do plano XY: a geometria é projetada em planta, com um aviso. */
function verificarOcs(registro: Registro, coletor: Coletor): void {
  const ocs = numero(registro, 210);
  if (ocs !== undefined && Math.abs(ocs) > 1e-9) avisar(coletor, 'OCS', t(coletor.lang, 'io_dxf_ocs_projected'));
}

/** Lê o `$INSUNITS` e o `$EXTMIN`/`$EXTMAX` do HEADER. */
function lerCabecalho(pares: Par[], warnings: string[], lang: Lang): Cabecalho {
  const variaveis = new Map<string, Par[]>();
  let atual: string | null = null;
  for (const [codigo, valor] of pares) {
    if (codigo === 9) {
      atual = valor.trim().toUpperCase();
      variaveis.set(atual, []);
    } else if (atual !== null) {
      variaveis.get(atual)!.push([codigo, valor]);
    }
  }
  const valorDe = (nome: string, codigo: number): string | undefined => variaveis.get(nome)?.find(([c]) => c === codigo)?.[1];
  const bruto = valorDe('$INSUNITS', 70);
  const codigo = bruto === undefined ? 6 : Number(bruto.trim());
  let unit: CadUnit = 'm';
  const unidade = Number.isFinite(codigo) ? UNIDADE_POR_INSUNITS[codigo] : undefined;
  if (unidade !== undefined) unit = unidade;
  else if (codigo !== 0) warnings.push(t(lang, 'io_dxf_units_unknown', { raw: bruto ?? '?' }));
  const extMin = pontoDosPares(variaveis.get('$EXTMIN'), 10, 20);
  const extMax = pontoDosPares(variaveis.get('$EXTMAX'), 10, 20);
  return {
    unit,
    unitScale: METROS_POR_UNIDADE[unit],
    ...(extMin === undefined ? {} : { extMin }),
    ...(extMax === undefined ? {} : { extMax }),
  };
}

/** Camadas da tabela LAYER: nome (2) e cor ACI (62). */
function lerCamadas(pares: Par[]): CadLayer[] {
  const camadas: CadLayer[] = [];
  const vistos = new Set<string>();
  for (const registro of registros(pares)) {
    if (registro.tipo !== 'LAYER') continue;
    const nome = (campo(registro, 2) ?? '').trim();
    if (nome === '' || vistos.has(nome)) continue;
    vistos.add(nome);
    const cor = numero(registro, 62);
    camadas.push(cor === undefined ? { name: nome } : { name: nome, color: Math.abs(cor) });
  }
  return camadas;
}

/** Definições de bloco da seção BLOCKS: nome, ponto base (10/20) e as entidades entre BLOCK e ENDBLK. */
function lerBlocos(pares: Par[]): Bloco[] {
  const out: Bloco[] = [];
  const regs = registros(pares);
  for (let i = 0; i < regs.length; i++) {
    const registro = regs[i]!;
    if (registro.tipo !== 'BLOCK') continue;
    const nome = (campo(registro, 2) ?? '').trim();
    const base = ponto(registro, 10, 20) ?? { x: 0, y: 0 };
    const internos: Registro[] = [];
    for (i++; i < regs.length && regs[i]!.tipo !== 'ENDBLK'; i++) internos.push(regs[i]!);
    if (nome !== '') out.push({ nome, base, registros: internos });
  }
  return out;
}

/** Lê a POLYLINE e os VERTEX seguintes até o SEQEND; `fim` é onde o laço principal continua. */
function lerPolilinha(regs: Registro[], inicio: number): Polilinha {
  const registro = regs[inicio]!;
  const flag = numero(registro, 70) ?? 0;
  const vertices: DxfPoint[] = [];
  let j = inicio + 1;
  for (; j < regs.length; j++) {
    if (regs[j]!.tipo !== 'VERTEX') break;
    const p = ponto(regs[j]!, 10, 20);
    if (p) vertices.push(p);
  }
  const fim = regs[j]?.tipo === 'SEQEND' ? j : j - 1;
  return { vertices, fechada: (flag & 1) === 1, tresD: (flag & 8) !== 0, malha: (flag & (16 | 64)) !== 0, fim };
}

/** Círculo tesselado em 48 lados (48 pontos; a flag `closed` fecha o anel). */
function circulo(centro: DxfPoint, raio: number): DxfPoint[] {
  const pts: DxfPoint[] = [];
  for (let k = 0; k < SEGMENTOS_ARCO; k++) {
    const angulo = (Math.PI * 2 * k) / SEGMENTOS_ARCO;
    pts.push({ x: centro.x + raio * Math.cos(angulo), y: centro.y + raio * Math.sin(angulo) });
  }
  return pts;
}

/** Arco tesselado em 48 segmentos (49 pontos), de `inicioGraus` a `fimGraus`, anti-horário. */
function arco(centro: DxfPoint, raio: number, inicioGraus: number, fimGraus: number): DxfPoint[] {
  const inicio = (inicioGraus * Math.PI) / 180;
  let fim = (fimGraus * Math.PI) / 180;
  while (fim <= inicio) fim += Math.PI * 2;
  const pts: DxfPoint[] = [];
  for (let k = 0; k <= SEGMENTOS_ARCO; k++) {
    const angulo = inicio + ((fim - inicio) * k) / SEGMENTOS_ARCO;
    pts.push({ x: centro.x + raio * Math.cos(angulo), y: centro.y + raio * Math.sin(angulo) });
  }
  return pts;
}

/** Decodifica o escape `\U+XXXX` (o mesmo que o escritor do Hestia usa para o que não é ASCII). */
function decodificarTexto(texto: string): string {
  return texto.replace(/\\[Uu]\+([0-9A-Fa-f]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** Códigos de controle do TEXT: %%d (grau), %%c (diâmetro), %%p (±) e %%% (porcento). */
function decodificarControle(texto: string): string {
  return decodificarTexto(
    texto.replace(/%%[dD]/g, '°').replace(/%%[cC]/g, '⌀').replace(/%%[pP]/g, '±').replace(/%%%/g, '%'),
  );
}

/** Tira a formatação do MTEXT (`\P`, `\f...;`, chaves, `\~`) e decodifica `\U+XXXX`. */
function limparMtext(texto: string): string {
  const semFormatacao = texto
    .replace(/\\P/gi, '\n')
    .replace(/\\[fFhHcCwWqQtTaAp][^;]*;/g, '')
    .replace(/[{}]/g, '')
    .replace(/\\~/g, ' ')
    .replace(/\\\\/g, '\\');
  return decodificarTexto(semFormatacao);
}

/** Expande as entidades de uma lista (ENTITIES ou o conteúdo de um bloco) em traços e textos. */
function expandir(
  regs: Registro[],
  xf: Matriz,
  profundidade: number,
  camadaHerdada: string | null,
  out: Coletor,
  ctx: Contexto,
): void {
  /** Camada da entidade; sem código 8 ou em `0` dentro de bloco, herda a camada do INSERT. */
  const camadaDe = (registro: Registro): string => {
    const nome = (campo(registro, 8) ?? '').trim();
    return nome === '' || nome === '0' ? camadaHerdada ?? '0' : nome;
  };

  for (let i = 0; i < regs.length; i++) {
    const registro = regs[i]!;
    const tipo = registro.tipo;

    if (tipo === 'LINE') {
      const a = ponto(registro, 10, 20);
      const b = ponto(registro, 11, 21);
      if (!a || !b) continue;
      verificarOcs(registro, out);
      const cor = corDe(registro);
      out.paths.push({
        layer: camadaDe(registro),
        pts: [aplicar(xf, a), aplicar(xf, b)],
        closed: false,
        ...(cor === undefined ? {} : { color: cor }),
      });
      continue;
    }

    if (tipo === 'LWPOLYLINE') {
      verificarOcs(registro, out);
      const fechada = ((numero(registro, 70) ?? 0) & 1) === 1;
      const pts: DxfPoint[] = [];
      let x: number | null = null;
      let bulge = false;
      for (const [codigo, valor] of registro.pares) {
        if (codigo === 10) {
          const n = Number(valor.trim());
          x = Number.isFinite(n) ? n : null;
        } else if (codigo === 20 && x !== null) {
          const n = Number(valor.trim());
          if (Number.isFinite(n)) pts.push({ x, y: n });
          x = null;
        } else if (codigo === 42 && Number(valor.trim()) !== 0) {
          bulge = true;
        }
      }
      if (bulge) avisar(out, 'BULGE', t(out.lang, 'io_dxf_bulge_approx'));
      if (pts.length < 2) continue;
      const cor = corDe(registro);
      out.paths.push({
        layer: camadaDe(registro),
        pts: pts.map((p) => aplicar(xf, p)),
        closed: fechada,
        ...(cor === undefined ? {} : { color: cor }),
      });
      continue;
    }

    if (tipo === 'POLYLINE') {
      verificarOcs(registro, out);
      const polilinha = lerPolilinha(regs, i);
      i = polilinha.fim;
      if (polilinha.malha) {
        avisar(out, 'POLYLINE_MALHA', t(out.lang, 'io_dxf_skip_mesh'));
        continue;
      }
      if (polilinha.tresD) avisar(out, 'POLYLINE_3D', t(out.lang, 'io_dxf_3d_flattened'));
      if (polilinha.vertices.length < 2) continue;
      const cor = corDe(registro);
      out.paths.push({
        layer: camadaDe(registro),
        pts: polilinha.vertices.map((p) => aplicar(xf, p)),
        closed: polilinha.fechada,
        ...(cor === undefined ? {} : { color: cor }),
      });
      continue;
    }

    if (tipo === 'ARC' || tipo === 'CIRCLE') {
      verificarOcs(registro, out);
      const centro = ponto(registro, 10, 20) ?? { x: 0, y: 0 };
      const raio = numero(registro, 40) ?? 0;
      if (!(raio > 0)) {
        avisar(out, `${tipo}_SEM_RAIO`, t(out.lang, 'io_dxf_skip_radius', { type: tipo }));
        continue;
      }
      const cor = corDe(registro);
      const pts = tipo === 'CIRCLE' ? circulo(centro, raio) : arco(centro, raio, numero(registro, 50) ?? 0, numero(registro, 51) ?? 360);
      out.paths.push({
        layer: camadaDe(registro),
        pts: pts.map((p) => aplicar(xf, p)),
        closed: tipo === 'CIRCLE',
        ...(cor === undefined ? {} : { color: cor }),
      });
      continue;
    }

    if (tipo === 'TEXT') {
      verificarOcs(registro, out);
      const base = ponto(registro, 10, 20) ?? { x: 0, y: 0 };
      const alinhamento = ponto(registro, 11, 21);
      // Com alinhamento (72 ≠ 0) e o ponto 11/21, é ele que posiciona o texto.
      const at = (numero(registro, 72) ?? 0) !== 0 && alinhamento !== undefined ? alinhamento : base;
      const texto = decodificarControle(campo(registro, 1) ?? '');
      if (texto.trim() === '') continue;
      const altura = numero(registro, 40);
      const cor = corDe(registro);
      out.texts.push({
        layer: camadaDe(registro),
        at: aplicar(xf, at),
        text: texto,
        height: altura !== undefined && altura > 0 ? altura : ALTURA_PADRAO,
        rotation: numero(registro, 50) ?? 0,
        ...(cor === undefined ? {} : { color: cor }),
      });
      continue;
    }

    if (tipo === 'MTEXT') {
      verificarOcs(registro, out);
      const at = ponto(registro, 10, 20) ?? { x: 0, y: 0 };
      let bruto = '';
      for (const [codigo, valor] of registro.pares) if (codigo === 1 || codigo === 3) bruto += valor;
      const texto = limparMtext(bruto);
      if (texto.trim() === '') continue;
      const altura = numero(registro, 40);
      const giro = numero(registro, 50) ?? 0;
      // No MTEXT o código 50 é em RADIANOS; alguns escritores gravam graus. Fora de 0..2π, vale como graus.
      const rotation = Math.abs(giro) <= Math.PI * 2 ? (giro * 180) / Math.PI : giro;
      const cor = corDe(registro);
      out.texts.push({
        layer: camadaDe(registro),
        at: aplicar(xf, at),
        text: texto,
        height: altura !== undefined && altura > 0 ? altura : ALTURA_PADRAO,
        rotation,
        ...(cor === undefined ? {} : { color: cor }),
      });
      continue;
    }

    if (tipo === 'INSERT') {
      verificarOcs(registro, out);
      const nome = (campo(registro, 2) ?? '').trim();
      const bloco = ctx.blocos.get(nome.toUpperCase());
      if (bloco === undefined) {
        avisar(out, `BLOCO_${nome.toUpperCase()}`, t(out.lang, 'io_dxf_block_missing', { name: nome }));
        continue;
      }
      if (profundidade >= ctx.profundidadeMaxima) {
        avisar(out, 'PROFUNDIDADE', t(out.lang, 'io_dxf_block_depth', { name: nome, n: ctx.profundidadeMaxima }));
        continue;
      }
      const posicao = ponto(registro, 10, 20) ?? { x: 0, y: 0 };
      const sx = numero(registro, 41) ?? 1;
      const sy = numero(registro, 42) ?? 1;
      const giro = ((numero(registro, 50) ?? 0) * Math.PI) / 180;
      const cos = Math.cos(giro);
      const sen = Math.sin(giro);
      // p' = posição + R·S·(p − base do bloco)
      const a = cos * sx;
      const b = -sen * sy;
      const c = sen * sx;
      const d = cos * sy;
      const local: Matriz = {
        a,
        b,
        c,
        d,
        e: posicao.x - (a * bloco.base.x + b * bloco.base.y),
        f: posicao.y - (c * bloco.base.x + d * bloco.base.y),
      };
      expandir(bloco.registros, compor(xf, local), profundidade + 1, camadaDe(registro), out, ctx);
      continue;
    }

    if (ESTRUTURAIS.has(tipo)) continue;

    const aviso = NAO_SUPORTADAS[tipo];
    if (aviso !== undefined) avisar(out, tipo, t(out.lang, aviso));
    else avisar(out, `TIPO_${tipo}`, t(out.lang, 'io_dxf_skip_entity', { type: tipo }));
  }
}

/** Caixa do desenho: a do HEADER (`$EXTMIN`/`$EXTMAX`) ou a das entidades, já em metros. */
function calcularExtensoes(cabecalho: Cabecalho, coletor: Coletor): { min: DxfPoint; max: DxfPoint } {
  const escala = cabecalho.unitScale;
  if (cabecalho.extMin && cabecalho.extMax) {
    return {
      min: { x: cabecalho.extMin.x * escala, y: cabecalho.extMin.y * escala },
      max: { x: cabecalho.extMax.x * escala, y: cabecalho.extMax.y * escala },
    };
  }
  const pontos: DxfPoint[] = [...coletor.paths.flatMap((p) => p.pts), ...coletor.texts.map((t) => t.at)];
  if (pontos.length === 0) return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pontos) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}
