/**
 * AUDITORIA DO OURO (docs/vistas/FASE-2A.md, "O ouro nesta etapa"): prova que a troca do armazenamento (esquema 24) só
 * muda a saída do programa pelas diferenças previstas, ANTES de regravar o ouro.
 *
 * Compara a saída ATUAL de cada vista com o ouro gravado em `vistas/base` (lido do git, para a auditoria continuar
 * reproduzível depois da regravação) e classifica o que mudou:
 *  - D1: o id da anotação copiada ganha o sufixo `__<idDaVista>` (cobertura e área). Normalizado: o sufixo é removido do
 *        texto novo antes de comparar; conta as linhas que só diferiam por ele.
 *  - D2: na vista de área, anotação antes herdada passa a aparecer em `selecao` (agora é selecionável). Conta os acertos
 *        (ponto, id) novos; só vale se for da planta que herdava no arquivo v23 e se o id é de anotação da vista. O clique
 *        devolve o item do topo: onde a anotação passa a ser acertada ela pode tomar o lugar de outro item (ex.: o ambiente).
 *  - D3: a vista de cobertura de nível SEM telhado deixa de ter as anotações do piso. Prova por oráculo: restaura as
 *        anotações na cobertura (cópia do piso, como era) e exige que a saída volte a ser igual ao ouro. Conta as linhas
 *        que sumiram.
 *  - NÃO PREVISTA: qualquer outra diferença (defeito, ou decisão a relatar).
 *
 * Roda com `npm run test:vistas-ouro -- --auditar` (imprime a tabela e falha se houver NÃO PREVISTA).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { copyAnnotationsToView, ANNOTATION_FAMILIES, type Project } from '@hestia/model';
import { abrirProjeto, chavesDasVistas, saidasDaVista, saidasDoProjeto } from './adaptador.ts';

const raiz = fileURLToPath(new URL('./', import.meta.url));
/** Raiz do repositório (o git resolve `ref:caminho` a partir dela). */
const repo = fileURLToPath(new URL('../../', import.meta.url));
const REF = process.env.VISTAS_OURO_BASE ?? 'vistas/base';
const arquivoSeguro = (s: string): string => s.replace(/[^A-Za-z0-9_.-]/g, '_');

export type Classe = 'D1' | 'D2' | 'D3' | 'NAO_PREVISTA';

export interface Achado {
  projeto: string;
  arquivo: string;
  classe: Classe;
  /** Quantidade de linhas (D1, D3, NAO_PREVISTA) ou de acertos (D2) desta classe no arquivo. */
  quantidade: number;
  nota: string;
}

/** Ouro de um projeto no `vistas/base` (git); sem git ou sem a referência, o que está na pasta de trabalho. */
function ouroDoBase(projeto: string): Map<string, string> {
  const dir = `tests/vistas-ouro/ouro/${projeto}`;
  const out = new Map<string, string>();
  try {
    const nomes = execFileSync('git', ['ls-tree', '--name-only', `${REF}:${dir}/`], { encoding: 'utf8', cwd: repo }).split('\n').filter((f) => f.endsWith('.txt'));
    for (const f of nomes) out.set(f, execFileSync('git', ['show', `${REF}:${dir}/${f}`], { encoding: 'utf8', cwd: repo, maxBuffer: 1 << 28 }));
    if (out.size > 0) return out;
  } catch {
    // cai no ouro da pasta de trabalho
  }
  const pasta = `${raiz}ouro/${projeto}`;
  if (existsSync(pasta)) for (const f of readdirSync(pasta).filter((x) => x.endsWith('.txt'))) out.set(f, readFileSync(`${pasta}/${f}`, 'utf8'));
  return out;
}

/** Saídas atuais de todas as vistas do projeto: nome do arquivo de ouro → texto. */
function saidasAtuais(p: Project): Map<string, string> {
  const out = new Map<string, string>();
  for (const [saida, texto] of Object.entries(saidasDoProjeto(p))) out.set(`projeto.${saida}.txt`, texto);
  for (const chave of chavesDasVistas(p)) for (const [saida, texto] of Object.entries(saidasDaVista(p, chave))) out.set(`${arquivoSeguro(chave)}.${saida}.txt`, texto);
  return out;
}

const escapa = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** D1: tira o sufixo `__<idDaVista>` das cópias. Devolve o texto normalizado. */
function normalizaD1(texto: string, viewIds: readonly string[]): string {
  if (viewIds.length === 0) return texto;
  return texto.replace(new RegExp(`__(?:${viewIds.map(escapa).join('|')})(?![A-Za-z0-9_])`, 'g'), '');
}

const linhasDe = (t: string): string[] => t.split('\n').filter((l) => l !== '');
/** Linha sem o índice posicional (`labels[24] = …` → `labels = …`): a ordem dos itens não é o que se compara. */
const semIndice = (l: string): string => l.replace(/^(\w+)\[\d+\]/, '$1');

/** Diferença de multiconjuntos de linhas (sem índice): o que só tem num lado e o que só tem no outro. */
function diferencaDeLinhas(gravado: string, atual: string, ignoraIndice: boolean): { removidas: string[]; adicionadas: string[] } {
  const f = ignoraIndice ? semIndice : (l: string): string => l;
  const conta = new Map<string, number>();
  for (const l of linhasDe(gravado)) conta.set(f(l), (conta.get(f(l)) ?? 0) + 1);
  const adicionadas: string[] = [];
  for (const l of linhasDe(atual)) {
    const k = f(l);
    const n = conta.get(k) ?? 0;
    if (n > 0) conta.set(k, n - 1);
    else adicionadas.push(l);
  }
  const removidas = [...conta.entries()].flatMap(([k, n]) => Array.from({ length: n }, () => k));
  return { removidas, adicionadas };
}

/** `acertos.<ponto> = ["a","b"]` → mapa ponto → ids. */
function acertosDe(texto: string): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const l of linhasDe(texto)) {
    const r = /^acertos\.(\S+) = (\[.*\])$/.exec(l);
    if (r) m.set(r[1]!, JSON.parse(r[2]!) as string[]);
  }
  return m;
}

const nota = (xs: string[], n = 2): string => xs.slice(0, n).map((x) => (x.length > 110 ? `${x.slice(0, 110)}…` : x)).join(' | ');

/** D3: oráculo. Devolve o projeto com as anotações do piso restauradas nas coberturas dos níveis sem telhado. */
function comD3Restaurado(p: Project, semTelhado: ReadonlySet<string>): Project {
  const q = structuredClone(p);
  for (const v of q.planViews) {
    if (v.showRoofOnTop !== true || !semTelhado.has(v.levelId)) continue;
    const piso = q.planViews.find((x) => x.id === `pv_${v.levelId}`)!;
    v.annotations = copyAnnotationsToView(piso.annotations, v.id, Object.fromEntries(ANNOTATION_FAMILIES.map((f) => [f, true])));
  }
  return q;
}

/** Audita um projeto do ouro. `bruto` é o JSON v23 (para saber quem herdava e quem tem telhado). */
export function auditarProjeto(projeto: string, bruto: Record<string, unknown>): Achado[] {
  const p = abrirProjeto(bruto);
  const gravado = ouroDoBase(projeto);
  const atual = saidasAtuais(p);
  const viewIds = p.planViews.map((v) => v.id);
  const elementos = Object.values((bruto.elements as Record<string, { kind: string; levelId?: string }>) ?? {});
  const semTelhado = new Set((bruto.levels as Array<{ id: string }>).map((l) => l.id).filter((id) => !elementos.some((e) => e.kind === 'roof' && e.levelId === id)));
  const herdam = new Set(((bruto.areaPlans as Array<{ id: string; annotations?: unknown }> | undefined) ?? []).filter((a) => a.annotations === undefined).map((a) => a.id));
  const achados: Achado[] = [];
  const add = (arquivo: string, classe: Classe, quantidade: number, n: string): void => {
    achados.push({ projeto, arquivo, classe, quantidade, nota: n });
  };

  // Oráculo da D3 (renderizado uma vez por vista de cobertura de nível sem telhado, sob demanda).
  let oraculo: Map<string, string> | null = null;
  const saidaDoOraculo = (nome: string): string | undefined => {
    oraculo ??= saidasAtuais(comD3Restaurado(p, semTelhado));
    return oraculo.get(nome);
  };

  for (const nome of [...new Set([...gravado.keys(), ...atual.keys()])].sort()) {
    const g = gravado.get(nome);
    const bruta = atual.get(nome);
    if (g === undefined || bruta === undefined) {
      add(nome, 'NAO_PREVISTA', 1, g === undefined ? 'saída nova sem ouro gravado' : 'saída do ouro não foi mais gerada');
      continue;
    }
    const a = normalizaD1(bruta, viewIds);
    const mudouPorD1 = bruta !== a ? linhasDe(bruta).filter((l, i) => l !== linhasDe(a)[i]).length : 0;
    if (mudouPorD1 > 0) add(nome, 'D1', mudouPorD1, 'id de anotação copiada com sufixo `__<idDaVista>`');
    if (a === g) continue;

    const chave = /^(roof|area|floor)_(.+?)\.(lista|selecao|dxf|ocultos|avisos|quantitativos|prancha)\.txt$/.exec(nome);
    const tipo = chave?.[1];
    const id = chave?.[2];
    const saida = chave?.[3];

    // D3: cobertura de nível sem telhado. A saída restaurada (oráculo) tem de voltar a ser IGUAL ao ouro.
    if (tipo === 'roof' && id && semTelhado.has(id) && saida) {
      const o = saidaDoOraculo(nome);
      if (o !== undefined && normalizaD1(o, viewIds) === g) {
        const d = diferencaDeLinhas(g, a, saida === 'lista');
        add(nome, 'D3', d.removidas.length, `a cobertura do nível sem telhado deixou de repetir ${d.removidas.length} item(ns) do piso${d.adicionadas.length ? ` (e ${d.adicionadas.length} mudaram de lugar)` : ''}; restaurando as anotações a saída volta a ser igual ao ouro`);
        continue;
      }
    }

    // D2: planta de área que herdava; só acertos novos de seleção, todos de anotação da própria vista.
    if (tipo === 'area' && id && herdam.has(id) && saida === 'selecao') {
      const ga = acertosDe(g);
      const aa = acertosDe(a);
      const idsDaVista = new Set(Object.values(p.planViews.find((v) => v.id === id)!.annotations).flat().map((x) => (x as { id: string }).id).map((x) => normalizaD1(x, viewIds)));
      const novos: string[] = [];
      const outros: string[] = [];
      for (const ponto of new Set([...ga.keys(), ...aa.keys()])) {
        const antes = new Set(ga.get(ponto) ?? []);
        const depois = new Set(aa.get(ponto) ?? []);
        const chegou = [...depois].filter((x) => !antes.has(x));
        for (const x of chegou) (idsDaVista.has(x) ? novos : outros).push(`${ponto}: ${x}`);
        // O clique devolve o item do topo: onde a anotação agora é selecionável ela passa na frente (ex.: do ambiente), o que é a D2.
        for (const x of antes) if (!depois.has(x) && !chegou.some((y) => idsDaVista.has(y))) outros.push(`${ponto}: sumiu ${x}`);
      }
      // As linhas `acertosPorId`/`pontos` são derivadas dos acertos: conferem pela recontagem.
      const recontaOk = (() => {
        const conta = (m: Map<string, string[]>): Map<string, number> => {
          const c = new Map<string, number>();
          for (const ids of m.values()) for (const x of ids) c.set(x, (c.get(x) ?? 0) + 1);
          return c;
        };
        const c = conta(aa);
        const lidas = new Map(linhasDe(a).flatMap((l) => { const r = /^acertosPorId\.(\S+) = (\d+)$/.exec(l); return r ? [[r[1]!, Number(r[2])] as const] : []; }));
        return [...c.entries()].every(([k, v]) => lidas.get(k) === v) && lidas.size === c.size;
      })();
      const pontosIguais = linhasDe(g).find((l) => l.startsWith('pontos =')) === linhasDe(a).find((l) => l.startsWith('pontos ='));
      if (outros.length === 0 && novos.length > 0 && recontaOk && pontosIguais) {
        add(nome, 'D2', novos.length, `${novos.length} acerto(s) novo(s) de anotação antes herdada, agora selecionável (ex.: ${novos.slice(0, 3).join('; ')})`);
        continue;
      }
      add(nome, 'NAO_PREVISTA', outros.length || 1, `seleção da área difere além da D2: ${nota(outros)}`);
      continue;
    }

    const d = diferencaDeLinhas(g, a, saida === 'lista');
    add(nome, 'NAO_PREVISTA', d.removidas.length + d.adicionadas.length, `sumiram ${d.removidas.length} / apareceram ${d.adicionadas.length}: ${nota(d.removidas)} => ${nota(d.adicionadas)}`);
  }
  return achados;
}

/** Audita todos os projetos de `tests/vistas-ouro/projetos`. */
export function auditar(): Achado[] {
  const arquivos = readdirSync(`${raiz}projetos`).filter((f) => f.endsWith('.json')).sort();
  return arquivos.flatMap((f) => auditarProjeto(f.replace(/\.json$/, ''), JSON.parse(readFileSync(`${raiz}projetos/${f}`, 'utf8')) as Record<string, unknown>));
}

/** Tabela por projeto (D1, D2, D3, NÃO PREVISTAS: linhas ou acertos) e o detalhe arquivo por arquivo. */
export function tabela(achados: readonly Achado[]): string {
  const projetos = readdirSync(`${raiz}projetos`).filter((f) => f.endsWith('.json')).sort().map((f) => f.replace(/\.json$/, ''));
  const soma = (p: string, c: Classe): number => achados.filter((a) => a.projeto === p && a.classe === c).reduce((n, a) => n + a.quantidade, 0);
  const arqs = (p: string, c: Classe): number => achados.filter((a) => a.projeto === p && a.classe === c).length;
  const linhas = ['| projeto | D1 (linhas / arquivos) | D2 (acertos / arquivos) | D3 (linhas / arquivos) | NÃO PREVISTAS (linhas / arquivos) |', '|---|---|---|---|---|'];
  for (const p of projetos) linhas.push(`| ${p} | ${soma(p, 'D1')} / ${arqs(p, 'D1')} | ${soma(p, 'D2')} / ${arqs(p, 'D2')} | ${soma(p, 'D3')} / ${arqs(p, 'D3')} | ${soma(p, 'NAO_PREVISTA')} / ${arqs(p, 'NAO_PREVISTA')} |`);
  const det = achados.map((a) => `  [${a.classe}] ${a.projeto}/${a.arquivo} (${a.quantidade}): ${a.nota}`);
  return `${linhas.join('\n')}\n\nDetalhe:\n${det.join('\n')}`;
}
