import type { DominioLigacao } from './familia/tiposLigacao.ts';
import type { Id } from './types.ts';

/*
 * CONTRATO das REDES de MEP no projeto (ADR 0061 §D6, CONTRATO.md §7). SÓ tipos. Um sistema agrupa as ligações
 * conectadas de um mesmo domínio (ex.: "Esgoto primário"); a conexão entre duas instâncias é guardada na própria
 * instância (`Component.ligacoes`), nos dois lados (simétrica).
 */

export interface SistemaMep {
  id: Id;
  nome: string;
  dominio: DominioLigacao;
  /** Cor de exibição (#rrggbb); ausente = a do domínio. */
  cor?: string;
}

/** Conexão de uma ligação desta instância com a ligação de outra. */
export interface ConexaoComponente {
  componenteId: Id;
  ligacaoId: string;
  sistemaId?: Id;
}
