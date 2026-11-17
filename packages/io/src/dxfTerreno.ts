import type { CadUnit } from '@hestia/model';
import { campo, lerCabecalho, lerPares, numero, registros, separarSecoes, METROS_POR_UNIDADE, type Registro } from './dxfImport.ts';

/**
 * Leitor de DXF de levantamento topográfico (ficha I1). Lê as entidades com cota e as separa por camada em pontos, polilinhas
 * de cota constante (candidatas a curva de nível) e polilinhas de cota variável (candidatas a linha de quebra). Só
 * produz as FONTES do terreno: não gera malha, curva de nível nem perfil (isso é do kernel). Tudo em metros (a unidade do
 * arquivo é aplicada em x, y e z), no sistema do arquivo.
 *
 * Entidades lidas: `POINT`, `LWPOLYLINE` (elevação no código 38), `POLYLINE` (3D com cota por `VERTEX`, ou 2D com a
 * elevação do cabeçalho), `LINE` e `3DFACE` (só os vértices, como pontos). Blocos (`INSERT`) não são expandidos.
 */

/** Polilinha de cota constante: candidata a curva de nível. `xy` = x0, y0, x1, y1... */
export interface PolilinhaConstante {
  z: number;
  xy: number[];
  fechada: boolean;
}

/** Contagens de uma camada, só das entidades COM cota (as sem cota ficam em `semCota`). */
export interface ContagemCamada {
  /** Entidades lidas com cota (POINT, LINE, polilinhas e 3DFACE contam 1 cada). */
  entidades: number;
  /** Pontos soltos (POINT e vértices de 3DFACE). */
  pontos: number;
  constantes: number;
  variaveis: number;
  /** Entidades com z = 0 em arquivo que tem outras cotas, ignoradas por padrão (um ponto de 3DFACE conta como entidade). */
  semCota: number;
}

export interface CamadaLevantamento {
  nome: string;
  /** x0, y0, z0, x1, y1, z1... */
  pontos: number[];
  constantes: PolilinhaConstante[];
  /** Polilinhas de cota variável: x0, y0, z0, x1... Se fechada no arquivo, o primeiro vértice é repetido no fim. */
  variaveis: number[][];
  contagem: ContagemCamada;
  /** Faixa de z das entidades com cota (null = nenhuma). */
  zMin: number | null;
  zMax: number | null;
}

/** Avisos do leitor, por código (a interface traduz): `bulge` arcos tratados como retas; `malha` POLYLINE de malha ignorada;
 * `bloco` INSERT não expandido; `unidade` INSUNITS desconhecido (assumido metros). `n` = quantas ocorrências. */
export interface AvisoLevantamento {
  codigo: 'bulge' | 'malha' | 'bloco' | 'unidade';
  n: number;
}

export interface LevantamentoDxf {
  nome: string;
  /** Unidade aplicada (a do arquivo, ou a pedida em `opcoes.unit`). */
  unit: CadUnit;
  /** Unidade declarada no arquivo (`$INSUNITS`). */
  unitDetectada: CadUnit;
  unitScale: number;
  camadas: CamadaLevantamento[];
  /** O arquivo tem alguma cota diferente de zero. */
  temCotas: boolean;
  /** Faixa de z de todas as entidades com cota (null = nenhuma). */
  zMin: number | null;
  zMax: number | null;
  avisos: AvisoLevantamento[];
}

export interface OpcoesLevantamento {
  /** Força a unidade (ausente = a do `$INSUNITS`). */
  unit?: CadUnit;
  /** Trata z = 0 como cota válida mesmo em arquivo com outras cotas (padrão: ignora e conta à parte). */
  incluirSemCota?: boolean;
}

type Xyz = [number, number, number];

/** Entidade lida (valores crus do arquivo, ainda sem a unidade) à espera de saber se o arquivo tem cotas. */
type Candidata =
  | { tipo: 'ponto'; camada: string; p: Xyz }
  | { tipo: 'face'; camada: string; ps: Xyz[] }
  | { tipo: 'poli'; camada: string; ps: Xyz[]; fechada: boolean };

const IGUAL = 1e-9;
const num = (r: Registro, c: number): number => numero(r, c) ?? 0;

/** Camada do registro (código 8); vazia vira `0`. */
const camadaDe = (r: Registro): string => (campo(r, 8) ?? '').trim() || '0';

/** Vértices do LWPOLYLINE (pares 10/20 em sequência) com a elevação do código 38; conta se há `bulge`. */
function lerLwpolyline(r: Registro): { ps: Xyz[]; fechada: boolean; bulge: boolean } {
  const z = num(r, 38);
  const ps: Xyz[] = [];
  let x: number | null = null;
  let bulge = false;
  for (const [codigo, valor] of r.pares) {
    const n = Number(valor.trim());
    if (codigo === 10) x = Number.isFinite(n) ? n : null;
    else if (codigo === 20 && x !== null) {
      if (Number.isFinite(n)) ps.push([x, n, z]);
      x = null;
    } else if (codigo === 42 && n !== 0) bulge = true;
  }
  return { ps, fechada: (num(r, 70) & 1) === 1, bulge };
}

/** POLYLINE e seus VERTEX; `fim` é o índice do último registro consumido. */
function lerPolyline(regs: Registro[], inicio: number): { ps: Xyz[]; fechada: boolean; malha: boolean; fim: number } {
  const cab = regs[inicio]!;
  const flag = num(cab, 70);
  const tresD = (flag & 8) !== 0;
  const elevacao = numero(cab, 30);
  const ps: Xyz[] = [];
  let j = inicio + 1;
  for (; j < regs.length && regs[j]!.tipo === 'VERTEX'; j++) {
    const v = regs[j]!;
    // Vértice de quadro de spline (flag 16) não é ponto da linha.
    if ((num(v, 70) & 16) !== 0) continue;
    const x = numero(v, 10);
    const y = numero(v, 20);
    if (x === undefined || y === undefined) continue;
    ps.push([x, y, tresD ? num(v, 30) : elevacao ?? num(v, 30)]);
  }
  const fim = regs[j]?.tipo === 'SEQEND' ? j : j - 1;
  return { ps, fechada: (flag & 1) === 1, malha: (flag & (16 | 64)) !== 0, fim };
}

/** Vértices distintos do 3DFACE (o 4º vértice repetido no 3º, comum em face triangular, conta uma vez). */
function lerFace(r: Registro): Xyz[] {
  const ps: Xyz[] = [];
  for (let k = 0; k < 4; k++) {
    const x = numero(r, 10 + k);
    const y = numero(r, 20 + k);
    if (x === undefined || y === undefined) continue;
    const p: Xyz = [x, y, num(r, 30 + k)];
    const ultimo = ps.at(-1);
    if (ultimo && ultimo[0] === p[0] && ultimo[1] === p[1] && ultimo[2] === p[2]) continue;
    ps.push(p);
  }
  return ps;
}

/** Todos os z iguais (dentro de 1e-9)? */
const zConstante = (ps: readonly Xyz[]): boolean => ps.every((p) => Math.abs(p[2] - ps[0]![2]) <= IGUAL);

/** Junta faixa de z. */
function faixa(c: { zMin: number | null; zMax: number | null }, z: number): void {
  c.zMin = c.zMin === null ? z : Math.min(c.zMin, z);
  c.zMax = c.zMax === null ? z : Math.max(c.zMax, z);
}

/**
 * Lê o texto de um DXF de levantamento. As camadas saem na ordem em que aparecem; só entram as que têm entidade lida.
 * `nome` é o nome do arquivo (sem extensão), devolvido em `nome`.
 */
export function lerLevantamentoDxf(texto: string, nome = 'Levantamento', opcoes: OpcoesLevantamento = {}): LevantamentoDxf {
  const secoes = separarSecoes(lerPares(texto));
  const avisosCab: string[] = [];
  const cab = lerCabecalho(secoes.get('HEADER') ?? [], avisosCab, 'pt');
  const unit = opcoes.unit ?? cab.unit;
  const escala = METROS_POR_UNIDADE[unit];
  const regs = registros(secoes.get('ENTITIES') ?? []);
  const contagemAviso = { bulge: 0, malha: 0, bloco: 0 };

  const candidatas: Candidata[] = [];
  let temCotas = false;
  const marca = (ps: readonly Xyz[]): void => {
    if (ps.some((p) => p[2] !== 0)) temCotas = true;
  };
  for (let i = 0; i < regs.length; i++) {
    const r = regs[i]!;
    switch (r.tipo) {
      case 'POINT': {
        const x = numero(r, 10);
        const y = numero(r, 20);
        if (x === undefined || y === undefined) break;
        const p: Xyz = [x, y, num(r, 30)];
        marca([p]);
        candidatas.push({ tipo: 'ponto', camada: camadaDe(r), p });
        break;
      }
      case 'LINE': {
        const x1 = numero(r, 10);
        const y1 = numero(r, 20);
        const x2 = numero(r, 11);
        const y2 = numero(r, 21);
        if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) break;
        const ps: Xyz[] = [[x1, y1, num(r, 30)], [x2, y2, num(r, 31)]];
        marca(ps);
        candidatas.push({ tipo: 'poli', camada: camadaDe(r), ps, fechada: false });
        break;
      }
      case 'LWPOLYLINE': {
        const l = lerLwpolyline(r);
        if (l.bulge) contagemAviso.bulge++;
        if (l.ps.length < 2) break;
        marca(l.ps);
        candidatas.push({ tipo: 'poli', camada: camadaDe(r), ps: l.ps, fechada: l.fechada });
        break;
      }
      case 'POLYLINE': {
        const l = lerPolyline(regs, i);
        i = l.fim;
        if (l.malha) {
          contagemAviso.malha++;
          break;
        }
        if (l.ps.length < 2) break;
        marca(l.ps);
        candidatas.push({ tipo: 'poli', camada: camadaDe(r), ps: l.ps, fechada: l.fechada });
        break;
      }
      case '3DFACE': {
        const ps = lerFace(r);
        if (ps.length === 0) break;
        marca(ps);
        candidatas.push({ tipo: 'face', camada: camadaDe(r), ps });
        break;
      }
      case 'INSERT':
        contagemAviso.bloco++;
        break;
      default:
        break;
    }
  }

  const ignorarZero = temCotas && opcoes.incluirSemCota !== true;
  const porNome = new Map<string, CamadaLevantamento>();
  const vistosFace = new Map<string, Set<string>>();
  const camadaDo = (n: string): CamadaLevantamento => {
    let c = porNome.get(n);
    if (!c) {
      c = { nome: n, pontos: [], constantes: [], variaveis: [], contagem: { entidades: 0, pontos: 0, constantes: 0, variaveis: 0, semCota: 0 }, zMin: null, zMax: null };
      porNome.set(n, c);
    }
    return c;
  };
  const esc = (p: Xyz): Xyz => [p[0] * escala, p[1] * escala, p[2] * escala];
  const semCota = (p: Xyz): boolean => ignorarZero && p[2] === 0;

  for (const c of candidatas) {
    const camada = camadaDo(c.camada);
    if (c.tipo === 'ponto' || c.tipo === 'face') {
      const ps = c.tipo === 'ponto' ? [c.p] : c.ps;
      for (const p of ps) {
        if (c.tipo === 'face') {
          const chave = `${p[0]}|${p[1]}|${p[2]}`;
          const vistos = vistosFace.get(camada.nome) ?? new Set<string>();
          vistosFace.set(camada.nome, vistos);
          if (vistos.has(chave)) continue;
          vistos.add(chave);
        }
        if (semCota(p)) {
          camada.contagem.semCota++;
          continue;
        }
        const [x, y, z] = esc(p);
        camada.pontos.push(x, y, z);
        camada.contagem.pontos++;
        camada.contagem.entidades++;
        faixa(camada, z);
      }
      continue;
    }
    if (c.ps.every(semCota)) {
      camada.contagem.semCota++;
      continue;
    }
    const ps = c.ps.map(esc);
    camada.contagem.entidades++;
    for (const p of ps) faixa(camada, p[2]);
    if (zConstante(c.ps)) {
      camada.constantes.push({ z: ps[0]![2], xy: ps.flatMap((p) => [p[0], p[1]]), fechada: c.fechada });
      camada.contagem.constantes++;
    } else {
      const v = ps.flatMap((p) => p);
      if (c.fechada) v.push(ps[0]![0], ps[0]![1], ps[0]![2]);
      camada.variaveis.push(v);
      camada.contagem.variaveis++;
    }
  }

  const camadas = [...porNome.values()];
  let zMin: number | null = null;
  let zMax: number | null = null;
  for (const c of camadas) {
    if (c.zMin !== null) zMin = zMin === null ? c.zMin : Math.min(zMin, c.zMin);
    if (c.zMax !== null) zMax = zMax === null ? c.zMax : Math.max(zMax, c.zMax);
  }
  const avisos: AvisoLevantamento[] = [];
  if (contagemAviso.bulge > 0) avisos.push({ codigo: 'bulge', n: contagemAviso.bulge });
  if (contagemAviso.malha > 0) avisos.push({ codigo: 'malha', n: contagemAviso.malha });
  if (contagemAviso.bloco > 0) avisos.push({ codigo: 'bloco', n: contagemAviso.bloco });
  if (avisosCab.length > 0) avisos.push({ codigo: 'unidade', n: 1 });
  return { nome, unit, unitDetectada: cab.unit, unitScale: escala, camadas, temCotas, zMin, zMax, avisos };
}
