import type { DominioLigacao } from './familia/tiposLigacao.ts';
import type { Id, Project } from './types.ts';

/*
 * CONTRATO das REDES de MEP no projeto (ADR 0061 §D6, CONTRATO.md §7). Um sistema agrupa as ligações
 * conectadas de um mesmo domínio (ex.: "Esgoto primário"); a conexão entre duas instâncias é guardada na própria
 * instância (`Component.ligacoes`), nos dois lados (simétrica). Os comandos estão em `mepCommands.ts`.
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

/** Instância com o necessário para checar as conexões (o `Component` inteiro serve). */
interface InstanciaLigavel {
  id: Id;
  familyId: string;
  ligacoes?: Record<string, ConexaoComponente>;
}

const temLigacao = (p: Pick<Project, 'componentFamilies'>, familyId: string, ligacaoId: string): boolean =>
  p.componentFamilies?.[familyId]?.ligacoes?.some((l) => l.id === ligacaoId) ?? false;

/**
 * Motivo (em português) pelo qual as conexões da instância são inválidas, ou `null`. Checagem MÍNIMA (ficha C3): a conexão aponta
 * para uma instância e uma ligação que existem, é recíproca e o sistema existe. A compatibilidade (domínio, seção, direção) é da C4.
 */
export function conexoesIssue(p: Project, c: InstanciaLigavel): string | null {
  for (const [ligacaoId, cx] of Object.entries(c.ligacoes ?? {})) {
    if (!temLigacao(p, c.familyId, ligacaoId)) return `A ligação "${ligacaoId}" não existe na família do componente.`;
    if (cx.componenteId === c.id) return 'Um componente não pode se conectar a si mesmo.';
    const outro = p.elements[cx.componenteId];
    if (outro?.kind !== 'component') return `Conexão aponta para um componente que não existe: ${cx.componenteId}.`;
    if (!temLigacao(p, outro.familyId, cx.ligacaoId)) return `A ligação "${cx.ligacaoId}" não existe na família do componente conectado.`;
    const volta = outro.ligacoes?.[cx.ligacaoId];
    if (volta?.componenteId !== c.id || volta.ligacaoId !== ligacaoId) return 'A conexão não é recíproca: a outra ponta não aponta de volta.';
    if (cx.sistemaId !== undefined && !p.sistemasMep?.[cx.sistemaId]) return `Sistema de MEP inexistente: ${cx.sistemaId}.`;
    if (cx.sistemaId !== volta.sistemaId) return 'As duas pontas da conexão estão em sistemas diferentes.';
  }
  return null;
}

/** Problemas de conexão do projeto inteiro (para a verificação do modelo): um por instância com defeito. */
export function problemasDeConexoes(p: Project): { elementId: Id; mensagem: string }[] {
  const out: { elementId: Id; mensagem: string }[] = [];
  for (const e of Object.values(p.elements)) {
    if (e.kind !== 'component' || !e.ligacoes) continue;
    const mensagem = conexoesIssue(p, e);
    if (mensagem) out.push({ elementId: e.id, mensagem });
  }
  return out;
}
