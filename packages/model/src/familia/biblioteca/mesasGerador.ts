import type { Familia, Ferragem, Parametro, Peca, Tipo } from '../tipos.ts';
import {
  bloco, chapaZ, comprimento, contornoElipse, contornoOctogono, contornoOval, derivado, enumerado, ESP_TAMPO, MATERIAL_TAMPO, nova, placaX, placaY, TIPOS_TAMPO,
} from './novosApoio.ts';

/*
 * Gerador das mesas da Biblioteca (jantar, centro, lateral, bancada alta, escritório): um tampo (retangular, redondo de 64 lados,
 * oval ou extensível) em madeira, vidro, mármore ou quartzo sobre uma base escolhida (4 pés, pedestal prismático, cavalete,
 * trapézio, cruz, laterais, prateleira). Só chapas planas; o tampo redondo é um polígono. As peças de cada base e de cada
 * tampo só existem quando o `quando` casa, então a caixa externa é sempre o tampo (L × P × A).
 */

export type FormaTampo = 'ret' | 'redonda' | 'oval' | 'ext';
export type BaseMesa = 'pes4' | 'pedestal' | 'cavalete' | 'trapezio' | 'cruz' | 'laterais' | 'prateleira';

const ROTULO_BASE: Record<BaseMesa, string> = {
  pes4: '4 pés', pedestal: 'Pedestal prismático', cavalete: 'Cavalete', trapezio: 'Trapézio', cruz: 'Cruz', laterais: 'Laterais em painel', prateleira: '4 pés com prateleira',
};
const ROTULO_FORMA: Record<FormaTampo, string> = { ret: 'Retangular', redonda: 'Redonda', oval: 'Oval', ext: 'Extensível' };

export interface ConfigMesa {
  id: string;
  nome: string;
  descricao: string;
  formas: FormaTampo[];
  L: [number, number, number];
  A: [number, number, number];
  P: [number, number, number];
  bases: BaseMesa[];
  /** Espessura (mm) das pernas e dos painéis da base. */
  perna: number;
  painel: number;
  extensao?: [number, number, number];
  tipos: Tipo[];
  tipoPadrao: string;
  /** Frases do tipo de uso para a descrição. */
  ferragens?: Ferragem[];
}

const redondo = (f: FormaTampo): boolean => f === 'redonda' || f === 'oval';

function parametros(c: ConfigMesa, ext: boolean): Parametro[] {
  const ps: Parametro[] = [
    comprimento('L', ext ? 'Comprimento fechado' : 'Largura', c.L[0], c.L[1], c.L[2]),
    comprimento('A', 'Altura', c.A[0], c.A[1], c.A[2]),
    comprimento('P', 'Profundidade', c.P[0], c.P[1], c.P[2]),
  ];
  if (ext && c.extensao) ps.push(comprimento('extensao', 'Extensão aberta (total)', c.extensao[0], c.extensao[1], c.extensao[2], 50));
  if (c.formas.length > 1) ps.push(enumerado('formato', 'Formato do tampo', c.formas[0]!, c.formas.map((f) => [f, ROTULO_FORMA[f]] as const)));
  ps.push(enumerado('tipoTampo', 'Tipo de tampo', 'madeira', TIPOS_TAMPO));
  ps.push(enumerado('base', 'Base', c.bases[0]!, c.bases.map((b) => [b, ROTULO_BASE[b]] as const)));
  const semRect = c.formas.every(redondo);
  const ex = (cond: string, a: string, b: string): string => (c.formas.length > 1 ? `${cond} ? ${a} : ${b}` : (semRect ? b : a));
  const eRed = 'formato == "redonda"';
  ps.push(
    derivado('espT', 'Espessura do tampo', ESP_TAMPO),
    derivado('hB', 'Altura da base', 'A - espT'),
    derivado('eP', 'Espessura da perna', String(c.perna)),
    derivado('eC', 'Espessura do painel', String(c.painel)),
    derivado('xo', 'Início do corpo', ext ? 'extensao / 2' : '0'),
    derivado('ix', 'Recuo X dos pés', ex(eRed, 'min(eP, L * 0.1)', 'L * 0.2')),
    derivado('iy', 'Recuo Y dos pés', ex(eRed, 'min(eP, P * 0.1)', 'P * 0.2')),
    derivado('ic', 'Recuo X do painel', ex(eRed, 'min(150, L * 0.15)', 'L * 0.2')),
    derivado('ip', 'Recuo Y do painel', ex(eRed, 'min(80, P * 0.15)', 'P * 0.2')),
  );
  return ps;
}

function tampos(c: ConfigMesa): Peca[] {
  const out: Peca[] = [];
  const multi = c.formas.length > 1;
  for (const f of c.formas) {
    for (const [tipo] of TIPOS_TAMPO) {
      const mat = MATERIAL_TAMPO[tipo]!;
      const q = `tipoTampo == "${tipo}"${multi ? ` && formato == "${f}"` : ''}`;
      const sufixo = multi ? `_${f}` : '';
      const base: Partial<Peca> = { fita: { n: 'fita_pvc' }, veio: 'a' };
      if (f === 'ret' || f === 'ext') {
        out.push(chapaZ(`tampo_${tipo}${sufixo}`, `Tampo (${tipo})`, 'tampo', 'xo', '0', 'hB', 'L', 'P', 'espT', mat, { ...base, quando: q }));
        if (f === 'ext') out.push(chapaZ(`aba_${tipo}`, `Aba extensível (${tipo})`, 'tampo', '(i - 1) * (xo + L)', '0', 'hB', 'xo', 'P', 'espT', mat, { ...base, quando: `extensao > 0 && ${q}`, repetir: '2' }));
      } else {
        out.push(chapaZ(`tampo_${tipo}${sufixo}`, `Tampo (${tipo})`, 'tampo', '0', '0', 'hB', 'L', 'P', 'espT', mat, { ...base, quando: q, contorno: f === 'redonda' ? contornoElipse('L', 'P') : contornoOval('L', 'P') }));
      }
    }
  }
  return out;
}

function bases(c: ConfigMesa): Peca[] {
  const out: Peca[] = [];
  const q = (b: BaseMesa): { quando: string } => ({ quando: `base == "${b}"` });
  const M = 'madeira_macica';
  if (c.bases.includes('pes4') || c.bases.includes('prateleira')) {
    const dentro = c.bases.includes('pes4') && c.bases.includes('prateleira') ? '(base == "pes4" || base == "prateleira")' : c.bases.includes('pes4') ? 'base == "pes4"' : 'base == "prateleira"';
    const quando = { quando: dentro };
    out.push(
      bloco('pe1', 'Pé frontal esquerdo', 'xo + ix', 'iy', '0', 'eP', 'eP', 'hB', M, quando),
      bloco('pe2', 'Pé frontal direito', 'xo + L - ix - eP', 'iy', '0', 'eP', 'eP', 'hB', M, quando),
      bloco('pe3', 'Pé traseiro esquerdo', 'xo + ix', 'P - iy - eP', '0', 'eP', 'eP', 'hB', M, quando),
      bloco('pe4', 'Pé traseiro direito', 'xo + L - ix - eP', 'P - iy - eP', '0', 'eP', 'eP', 'hB', M, quando),
    );
    if (c.bases.includes('prateleira')) {
      out.push(chapaZ('prateleiraBase', 'Prateleira inferior', 'prateleira', 'xo + ix + eP', 'iy + eP', 'hB * 0.25', 'L - 2 * ix - 2 * eP', 'P - 2 * iy - 2 * eP', '18', M, q('prateleira')));
    }
  }
  if (c.bases.includes('pedestal')) {
    out.push(
      bloco('sapata', 'Sapata do pedestal', 'xo + L / 2 - min(L, P) * 0.25', 'P / 2 - min(L, P) * 0.25', '0', 'min(L, P) * 0.5', 'min(L, P) * 0.5', '30', M, q('pedestal')),
      bloco('coluna', 'Coluna octogonal', 'xo + L / 2 - 70', 'P / 2 - 70', '30', '140', '140', 'hB - 30', M, { ...q('pedestal'), contorno: contornoOctogono(140) }),
    );
  }
  if (c.bases.includes('cavalete')) {
    out.push(
      placaX('cavE', 'Cavalete esquerdo', 'lateral', 'xo + ic', 'ip', '0', 'P - 2 * ip', 'hB', 'eC', M, q('cavalete')),
      placaX('cavD', 'Cavalete direito', 'lateral', 'xo + L - ic - eC', 'ip', '0', 'P - 2 * ip', 'hB', 'eC', M, q('cavalete')),
      bloco('travCav', 'Travessa do cavalete', 'xo + ic + eC', 'P / 2 - 30', 'hB * 0.55', 'L - 2 * ic - 2 * eC', '60', '60', M, q('cavalete')),
    );
  }
  if (c.bases.includes('trapezio')) {
    const pts: Array<[string, string]> = [['0', '0'], ['P - 2 * ip', '0'], ['(P - 2 * ip) * 0.75', 'hB'], ['(P - 2 * ip) * 0.25', 'hB']];
    out.push(
      placaX('trapE', 'Trapézio esquerdo', 'lateral', 'xo + ic', 'ip', '0', 'P - 2 * ip', 'hB', 'eC', M, { ...q('trapezio'), contorno: { tipo: 'poligono', pontos: pts } }),
      placaX('trapD', 'Trapézio direito', 'lateral', 'xo + L - ic - eC', 'ip', '0', 'P - 2 * ip', 'hB', 'eC', M, { ...q('trapezio'), contorno: { tipo: 'poligono', pontos: pts } }),
      bloco('travTrap', 'Travessa do trapézio', 'xo + ic + eC', 'P / 2 - 30', 'hB - 140', 'L - 2 * ic - 2 * eC', '60', '60', M, q('trapezio')),
    );
  }
  if (c.bases.includes('cruz')) {
    out.push(
      bloco('barraX', 'Barra da cruz (X)', 'xo + L / 2 - L * 0.4', 'P / 2 - 40', '0', 'L * 0.8', '80', '50', M, q('cruz')),
      bloco('barraY', 'Barra da cruz (Y)', 'xo + L / 2 - 40', 'P / 2 - P * 0.4', '50', '80', 'P * 0.8', '50', M, q('cruz')),
      bloco('colunaCruz', 'Coluna da cruz', 'xo + L / 2 - 50', 'P / 2 - 50', '100', '100', '100', 'hB - 100', M, q('cruz')),
    );
  }
  if (c.bases.includes('laterais')) {
    out.push(
      placaX('latE', 'Lateral esquerda', 'lateral', 'xo + ic', '0', '0', 'P', 'hB', 'eC', M, q('laterais')),
      placaX('latD', 'Lateral direita', 'lateral', 'xo + L - ic - eC', '0', '0', 'P', 'hB', 'eC', M, q('laterais')),
      placaY('fundoLat', 'Travessa de fundo', 'travessa', 'xo + ic + eC', 'P - 18', 'hB - 250', 'L - 2 * ic - 2 * eC', '250', '18', M, q('laterais')),
    );
  }
  return out;
}

/** Monta a família de mesa a partir da configuração. */
export function gerarMesa(c: ConfigMesa): Familia {
  const ext = c.formas.includes('ext');
  const comPe = c.bases.filter((b) => b === 'pes4' || b === 'prateleira');
  const ferr: Ferragem[] = c.ferragens ?? [
    ...(comPe.length > 0 ? [{ id: 'pe', nome: 'Pé regulável', quantidade: '4', quando: comPe.map((b) => `base == "${b}"`).join(' || ') }] : []),
    { id: 'cavilha', nome: 'Cavilha 8 × 30', quantidade: '8' },
    { id: 'minifix', nome: 'Parafuso minifix', quantidade: '4' },
  ];
  return nova({
    id: c.id,
    nome: c.nome,
    categoria: 'mobiliario',
    descricao: c.descricao,
    parametros: parametros(c, ext),
    pecas: [...tampos(c), ...bases(c)],
    ferragens: ferr,
    tipos: c.tipos,
    tipoPadrao: c.tipoPadrao,
  });
}
