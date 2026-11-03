import type { Malha, PecaResolvida } from '@hestia/engine';
import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from 'three';

/*
 * Lógica pura do visualizador 3D da família (sem WebGL, testável em Node). FICHA E3-visual.
 * Testes em `logica.test.ts`. Unidades: metros.
 */

export type NivelDetalhe3d = 'grosso' | 'medio' | 'fino';

/** Cores por papel (inteiro 0xRRGGBB), usadas quando não há material resolvido. */
const CORES_POR_PAPEL: Readonly<Record<string, number>> = {
  porta: 0xe9d6b4,
  frente_gaveta: 0xe9d6b4,
  tampo: 0x8c6a4a,
  fundo: 0xb9b2a6,
  rodape: 0xc9a97a,
};
const COR_VAZIO = 0x4a90d9;
const COR_PADRAO = 0xd8b98b;

/** Converte "#rrggbb" num inteiro; devolve null quando o texto não é um hexadecimal válido. */
function corDoTexto(texto: string): number | null {
  const achado = /^#([0-9a-f]{6})$/i.exec(texto.trim());
  if (!achado) return null;
  const valor = Number.parseInt(achado[1]!, 16);
  return Number.isFinite(valor) ? valor : null;
}

/**
 * Cor (inteiro 0xRRGGBB) de uma peça. Regras, em ordem: peça vazia → 0x4a90d9; `materiais[p.material]` se existir (texto "#rrggbb");
 * senão por papel: porta e frente_gaveta 0xe9d6b4; tampo 0x8c6a4a; fundo 0xb9b2a6; rodape 0xc9a97a; qualquer outro 0xd8b98b.
 * Determinística; nunca lança.
 */
export function corDaPeca(p: PecaResolvida, materiais: Readonly<Record<string, string>> = {}): number {
  if (p.vazio) return COR_VAZIO;
  if (p.material !== null) {
    const texto = materiais[p.material];
    if (texto !== undefined) {
      const cor = corDoTexto(texto);
      if (cor !== null) return cor;
    }
  }
  return CORES_POR_PAPEL[p.papel] ?? COR_PADRAO;
}

/** Limita um número ao intervalo [0, 1]; valores não finitos viram 0. */
function limitarFator(fator: number): number {
  if (!Number.isFinite(fator)) return 0;
  return fator <= 0 ? 0 : fator >= 1 ? 1 : fator;
}

/** Centro X da peça (origem + metade da extensão). */
function centroXDaPeca(p: PecaResolvida): number {
  return p.origem[0] + p.extensao[0] / 2;
}

/**
 * Deslocamento (m) de uma peça na vista explodida. `fator` 0..1 (fora disso é limitado); distância base D = 0,25 m × fator.
 * `centro` = centro da caixa da família. Por papel: lateral → ±X (para −X se o centro X da peça está à esquerda de `centro[0]`,
 * senão +X) de D; porta e frente_gaveta → −Y de 1,2·D; fundo → +Y de D; tampo e topo → +Z de D; base e rodape → −Z de 0,5·D;
 * demais papéis → zero. Com fator 0 devolve [0,0,0] para todos.
 */
export function deslocamentoDeExplosao(p: PecaResolvida, fator: number, centro: readonly [number, number, number]): [number, number, number] {
  const k = limitarFator(fator);
  const d = 0.25 * k;
  if (d === 0) return [0, 0, 0];
  switch (p.papel) {
    case 'lateral':
      return [centroXDaPeca(p) < centro[0] ? -d : d, 0, 0];
    case 'porta':
    case 'frente_gaveta':
      return [0, -1.2 * d, 0];
    case 'fundo':
      return [0, d, 0];
    case 'tampo':
    case 'topo':
      return [0, 0, d];
    case 'base':
    case 'rodape':
      return [0, 0, -0.5 * d];
    default:
      return [0, 0, 0];
  }
}

/** Papéis que somem quando as portas são escondidas. */
function ePorta(p: PecaResolvida): boolean {
  return p.papel === 'porta' || p.papel === 'frente_gaveta';
}

/** Papéis mostrados no detalhe 'grosso' (além das peças vazias). */
const PAPEIS_GROSSO: ReadonlySet<string> = new Set(['lateral', 'base', 'tampo', 'porta', 'frente_gaveta', 'painel']);

/**
 * Filtro de visibilidade por nível de detalhe e portas. `portas` falso esconde porta e frente_gaveta. Detalhe: 'fino' mostra tudo;
 * 'medio' esconde travessa e rodape; 'grosso' mostra só lateral, base, tampo, porta, frente_gaveta e painel. Peça vazia é sempre visível.
 */
export function pecaVisivel(p: PecaResolvida, detalhe: NivelDetalhe3d, portas: boolean): boolean {
  if (p.vazio) return true;
  if (!portas && ePorta(p)) return false;
  if (detalhe === 'fino') return true;
  if (detalhe === 'medio') return p.papel !== 'travessa' && p.papel !== 'rodape';
  return PAPEIS_GROSSO.has(p.papel);
}

/** Geometria do three a partir da malha: atributos `position` e `normal` (3 componentes, Float32) e `index` (Uint32). */
export function geometriaDaMalha(m: Malha): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new Float32BufferAttribute(m.normals, 3));
  g.setIndex(new Uint32BufferAttribute(m.indices, 1));
  return g;
}

/** Esfera que envolve as peças não vazias (centro da caixa e metade da diagonal). Sem peças: centro [0,0,0], raio 1. */
export function esferaDeEnquadramento(pecas: readonly PecaResolvida[]): { centro: [number, number, number]; raio: number } {
  let temPeca = false;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const p of pecas) {
    if (p.vazio) continue;
    temPeca = true;
    for (let eixo = 0; eixo < 3; eixo++) {
      const inicio = p.origem[eixo]!;
      const fim = inicio + p.extensao[eixo]!;
      if (inicio < min[eixo]!) min[eixo] = inicio;
      if (fim > max[eixo]!) max[eixo] = fim;
    }
  }
  if (!temPeca) return { centro: [0, 0, 0], raio: 1 };
  const centro: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  const raio = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
  return { centro, raio };
}

/** Distância da câmera para a esfera caber na tela: `raio / sin(min(fovV, fovH) / 2)` com `fovH = 2·atan(tan(fovV/2)·aspecto)`, mais 10% de folga. */
export function distanciaDeEnquadramento(raio: number, fovVerticalGraus: number, aspecto: number): number {
  const fovV = (fovVerticalGraus * Math.PI) / 180;
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * Math.max(aspecto, 1e-6));
  const seno = Math.sin(Math.min(fovV, fovH) / 2);
  return (raio / Math.max(Math.abs(seno), 1e-6)) * 1.1;
}
