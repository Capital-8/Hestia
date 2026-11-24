import type { DominioLigacao, FluxoLigacao, NivelDetalhe, PapelCorpo, SecaoLigacao, VistaFamilia } from '@hestia/model';

/*
 * CONTRATO dos corpos e ligações RESOLVIDOS (ADR 0061 §D2/§D3, CONTRATO.md §2.3). É a FRONTEIRA com o Rust, como
 * `PecaResolvida`: só números, em METROS e RADIANOS, nada de texto de fórmula. SÓ tipos.
 */

/** Seção resolvida: contorno externo anti-horário e furos horários, pares (u, v) em m, origem no centro da seção. */
export interface PerfilResolvido {
  externo: number[];
  furos: number[][];
}

/** Caminho resolvido: pontos já com as curvas discretizadas (m) e o raio de curva aplicado em cada ponto (0 em reta). */
export interface CaminhoResolvido {
  pontos: number[];
  /** Índice, em `pontos` (trio x,y,z), dos pontos que são vértices originais (para cotas e conexões). */
  vertices: number[];
}

export type FormaCorpoResolvida =
  | { tipo: 'extrusao'; perfil: PerfilResolvido; comprimento: number }
  | { tipo: 'revolucao'; perfil: PerfilResolvido; angulo: number; segmentos: number }
  | { tipo: 'varredura'; perfil: PerfilResolvido; caminho: CaminhoResolvido }
  | { tipo: 'transicao'; perfilA: PerfilResolvido; perfilB: PerfilResolvido; comprimento: number; desvio: [number, number] };

export interface CorpoResolvido {
  id: string;
  nome: string;
  /** 1..n quando o corpo tem `repetir`; 1 caso contrário. */
  indice: number;
  papel: PapelCorpo;
  forma: FormaCorpoResolvida;
  /** Origem (m) e matriz de rotação 3×3 em ordem de linha (9 números) do quadro, já na família. */
  origem: [number, number, number];
  rotacao: number[];
  vazio: boolean;
  material: string | null;
  detalhe3d: NivelDetalhe[] | null;
  vistas: VistaFamilia[] | null;
  grupo: string | null;
}

export interface LigacaoResolvida {
  id: string;
  nome: string;
  dominio: DominioLigacao;
  sistema: string | null;
  secao: SecaoLigacao;
  /** Posição (m) e direção UNITÁRIA para fora, no sistema local da família. */
  posicao: [number, number, number];
  direcao: [number, number, number];
  /** m; 0 quando não se aplica à seção. */
  diametro: number;
  largura: number;
  altura: number;
  fluxo: FluxoLigacao;
  aceita: DominioLigacao[];
  propriedades: Record<string, number>;
  propagaParametro: string | null;
}
