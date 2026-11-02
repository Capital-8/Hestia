import { importIfc, type IfcImportProgress, type IfcImportStage, type ImportReport, type ImportResult } from '@hestia/io';
import { editor } from './controller.ts';
import { desempacotarProjetoIfc } from './ifcMalha.ts';
import type { ResultadoWorker } from './ifcWorker.ts';
import type { Lang } from './i18n.ts';

/** Fase da importação vista pela janela: a leitura do arquivo mais as fases do importador. */
export type FaseImportacao = IfcImportStage | 'read';

/** Progresso pronto para a barra: fase, fração de 0 a 1 já ponderada e contagem da fase (quando houver). */
export interface ProgressoImportacao {
  fase: FaseImportacao;
  fracao: number;
  feito: number;
  total: number;
}

export interface OpcoesImportacaoIfc {
  onProgress?: (progresso: ProgressoImportacao) => void;
  sinal?: AbortSignal;
}

/**
 * Importação IFC pela interface (menu Arquivo → Importar IFC…). O importador do `@hestia/io` monta um projeto
 * novo; aqui ele entra no editor como um arquivo aberto, para as próximas edições e o Salvar valerem para o Hestia.
 */
export async function importIfcFile(file: File, opcoes: OpcoesImportacaoIfc = {}): Promise<{ name: string; report: ImportReport }> {
  opcoes.onProgress?.({ fase: 'read', fracao: 0, feito: 0, total: file.size });
  const text = await file.text();
  opcoes.onProgress?.({ fase: 'read', fracao: FAIXAS.read[1], feito: file.size, total: file.size });
  const { project, report } = await importIfcText(text, opcoes.onProgress);
  const name = nomeDoProjeto(file.name);
  editor.load(project, name);
  return { name, report };
}

/**
 * Tempo máximo que a janela espera pelo worker. O arquivo de 50 MB leva poucos segundos; o teto existe só para uma
 * promessa que nunca resolve se o worker travar (um bug), e agora a barra mostra o andamento em vez de parecer parado.
 */
const LIMITE_WORKER_MS = 120_000;

/** O que o `ifcWorker` devolve: progresso, o resultado empacotado ou a mensagem do erro que ele lançou. */
type RespostaIfcWorker = { progress: IfcImportProgress } | { result: ResultadoWorker } | { error: string };

/** O worker não pôde ser criado nem carregado: vale repetir na thread principal (o resultado é o mesmo). */
class WorkerIndisponivel extends Error {}

/** O importador falhou dentro do worker: repetir na thread principal daria o mesmo erro. */
class FalhaImportacao extends Error {}

/** O worker estourou o tempo: repetir na thread principal travaria a janela pelo mesmo tempo. */
class TempoEsgotado extends Error {}

/** O usuário cancelou a importação. */
class Cancelada extends Error {}

/**
 * Cada fase ocupa uma faixa da barra, proporcional ao que ela pesa num IFC grande (o parsing domina, a geometria
 * genérica vem em seguida). A fração da fase é distribuída dentro da faixa.
 */
const FAIXAS: Record<FaseImportacao, [number, number]> = {
  read: [0, 0.04],
  parse: [0.04, 0.3],
  relations: [0.3, 0.33],
  levels: [0.33, 0.37],
  walls: [0.37, 0.47],
  openings: [0.47, 0.55],
  slabs: [0.55, 0.63],
  generic: [0.63, 0.98],
  finish: [0.98, 1],
};

/** Converte o progresso cru do importador em fração da barra inteira. */
function paraBarra(p: IfcImportProgress): ProgressoImportacao {
  const [inicio, fim] = FAIXAS[p.stage];
  const parte = p.total > 0 ? Math.max(0, Math.min(1, p.done / p.total)) : 0;
  return { fase: p.stage, fracao: inicio + (fim - inicio) * parte, feito: p.done, total: p.total };
}

/**
 * Roda o `importIfc` num worker dedicado (`ifcWorker.ts`) para o arquivo grande não congelar a interface.
 * Rejeita com `WorkerIndisponivel`, `FalhaImportacao`, `TempoEsgotado` ou `Cancelada`; `importIfcText` decide o fallback.
 */
function importarNoWorker(text: string, onProgress?: (p: ProgressoImportacao) => void, sinal?: AbortSignal): Promise<ImportResult> {
  return new Promise<ImportResult>((resolve, reject) => {
    let worker: Worker;
    try {
      // O Vite (dev e build) reconhece o `new URL(..., import.meta.url)` e empacota o worker à parte.
      worker = new Worker(new URL('./ifcWorker.ts', import.meta.url), { type: 'module' });
    } catch (erro) {
      reject(new WorkerIndisponivel(erro instanceof Error ? erro.message : String(erro)));
      return;
    }

    let encerrado = false;
    /** Termina o worker uma única vez, qualquer que seja o desfecho. */
    const encerrar = (): boolean => {
      if (encerrado) return false;
      encerrado = true;
      clearTimeout(timer);
      sinal?.removeEventListener('abort', abortar);
      worker.terminate();
      return true;
    };
    const abortar = (): void => {
      if (encerrar()) reject(new Cancelada('Importação cancelada.'));
    };

    // Só é chamado depois desta linha (pelo estouro do tempo ou por uma resposta), então o `const` abaixo já existe.
    const timer = setTimeout(() => {
      if (encerrar()) reject(new TempoEsgotado(`A importação IFC passou de ${LIMITE_WORKER_MS / 1000} s e foi cancelada.`));
    }, LIMITE_WORKER_MS);

    if (sinal) {
      if (sinal.aborted) {
        abortar();
        return;
      }
      sinal.addEventListener('abort', abortar, { once: true });
    }

    worker.onmessage = (evento: MessageEvent<RespostaIfcWorker>) => {
      const resposta = evento.data;
      if ('progress' in resposta) {
        onProgress?.(paraBarra(resposta.progress));
        return;
      }
      if (!encerrar()) return;
      if ('error' in resposta) reject(new FalhaImportacao(resposta.error));
      else resolve({ project: desempacotarProjetoIfc(resposta.result), report: resposta.result.report });
    };

    // Script do worker que não carrega (ou worker que morre): a janela ainda pode importar na thread principal.
    worker.onerror = (evento) => {
      if (encerrar()) reject(new WorkerIndisponivel(evento.message || 'O worker de importação IFC não carregou.'));
    };

    worker.postMessage({ text });
  });
}

/**
 * Importa o texto de um IFC. Com `Worker` (navegador), o trabalho pesado sai da thread principal; sem ele
 * (Node, testes) ou se o worker não puder ser criado/carregado, cai no `importIfc` síncrono — mesmo resultado.
 */
export async function importIfcText(
  text: string,
  onProgress?: (p: ProgressoImportacao) => void,
  sinal?: AbortSignal,
): Promise<ImportResult> {
  if (typeof Worker === 'undefined') return importIfc(text, undefined, onProgress ? (p) => onProgress(paraBarra(p)) : undefined);
  try {
    return await importarNoWorker(text, onProgress, sinal);
  } catch (erro) {
    if (erro instanceof WorkerIndisponivel) return importIfc(text, undefined, onProgress ? (p) => onProgress(paraBarra(p)) : undefined);
    throw erro;
  }
}

/** "casa.ifc" vira "casa.hestia.json": o IFC original não é sobrescrito pelo Salvar. */
export function nomeDoProjeto(nome: string): string {
  const base = nome.trim().replace(/\.ifc$/i, '');
  return `${base || 'projeto'}.hestia.json`;
}

/** Resumo legível do relatório do importador, para a faixa do menu Arquivo e a barra de status. */
export interface ResumoImportacao {
  /** O que entrou, na ordem das categorias: "13 paredes, 5 portas, 11 janelas · 2 níveis". */
  texto: string;
  /** O que a v1 não representa, por classe IFC: "IFCSTAIR: 3". */
  ignorados: string[];
  /** Formas aproximadas e avisos do importador (o primeiro item pode resumir as aproximações). */
  avisos: string[];
}

/** Ordem das categorias do relatório no resumo (as chaves são as que o importador usa). */
const CATEGORIAS = ['paredes', 'portas', 'janelas', 'pisos', 'lajes', 'forros', 'ambientes', 'grades'] as const;

interface Nomes {
  readonly categorias: Readonly<Record<string, readonly [string, string]>>;
  readonly nivel: readonly [string, string];
  readonly nada: string;
  readonly aproximadas: string;
}

/** Singular e plural de cada categoria; o relatório só tem estas chaves, mas chaves novas caem no próprio nome. */
const NOMES: Record<Lang, Nomes> = {
  pt: {
    categorias: {
      paredes: ['parede', 'paredes'],
      portas: ['porta', 'portas'],
      janelas: ['janela', 'janelas'],
      pisos: ['piso', 'pisos'],
      lajes: ['laje', 'lajes'],
      forros: ['forro', 'forros'],
      ambientes: ['ambiente', 'ambientes'],
      grades: ['grade', 'grades'],
    },
    nivel: ['nível', 'níveis'],
    nada: 'Nenhum elemento reconhecido',
    aproximadas: 'Formas aproximadas',
  },
  en: {
    categorias: {
      paredes: ['wall', 'walls'],
      portas: ['door', 'doors'],
      janelas: ['window', 'windows'],
      pisos: ['floor', 'floors'],
      lajes: ['slab', 'slabs'],
      forros: ['ceiling', 'ceilings'],
      ambientes: ['room', 'rooms'],
      grades: ['grid', 'grids'],
    },
    nivel: ['level', 'levels'],
    nada: 'No recognizable elements',
    aproximadas: 'Approximate shapes',
  },
};

const contar = (n: number, nomes: readonly [string, string]): string => `${n} ${n === 1 ? nomes[0] : nomes[1]}`;

/** Contagens na ordem das categorias; chaves fora da lista entram depois, em ordem alfabética. */
function partesDe(contagem: Record<string, number>, L: Nomes): string[] {
  const conhecidas = CATEGORIAS.filter((c) => (contagem[c] ?? 0) > 0).map((c) => contar(contagem[c] ?? 0, L.categorias[c] ?? [c, c]));
  const extras = Object.entries(contagem)
    .filter(([c, n]) => n > 0 && !(CATEGORIAS as readonly string[]).includes(c))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([c, n]) => contar(n, [c, c]));
  return [...conhecidas, ...extras];
}

/** Resumo do relatório, sem tocar no DOM. `report.levels` já vem do importador (sempre ao menos 1). */
export function resumoImportacao(report: ImportReport, lang: Lang = 'pt'): ResumoImportacao {
  const L = NOMES[lang];
  const elementos = partesDe(report.imported, L);
  const niveis = report.levels > 0 ? contar(report.levels, L.nivel) : '';
  const texto = [elementos.length ? elementos.join(', ') : L.nada, niveis].filter(Boolean).join(' · ');
  const ignorados = Object.entries(report.skipped)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([classe, n]) => `${classe}: ${n}`);
  const aproximadas = partesDe(report.approximate, L);
  const avisos = [...(aproximadas.length ? [`${L.aproximadas}: ${aproximadas.join(', ')}`] : []), ...report.warnings];
  return { texto, ignorados, avisos };
}
