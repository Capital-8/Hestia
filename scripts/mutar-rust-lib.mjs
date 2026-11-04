// Funções puras da ferramenta de mutação de Rust (`scripts/mutar-rust.mjs`), separadas para poder testá-las
// em `tests/mutar-rust.test.ts` sem Node filho, sem wasm e sem Rust. Só módulos nativos.

/** Os quatro resultados possíveis de uma mutação. */
export const RESULTADOS = Object.freeze(['MORTA', 'SOBREVIVEU', 'COMPILA_ERRO', 'TIMEOUT']);

/**
 * Aplica `de -> para` na linha `linha` (1-based) de `texto`, trocando só a primeira ocorrência.
 * Retorna `{ texto, linhaAntes, linhaDepois }` com o texto inteiro reconstruído (preserva CRLF/LF).
 * Lança `Error` com mensagem clara se a linha não existe, se `de` não está na linha ou se os campos são inválidos.
 */
export function editarTexto(texto, linha, de, para) {
  if (typeof texto !== 'string') throw new Error('conteúdo do arquivo deve ser texto.');
  if (!Number.isInteger(linha) || linha < 1) throw new Error(`linha deve ser um inteiro >= 1, recebi ${String(linha)}.`);
  if (typeof de !== 'string' || de.length === 0) throw new Error('`de` deve ser um texto não vazio.');
  if (typeof para !== 'string') throw new Error('`para` deve ser um texto.');
  const linhas = texto.split('\n');
  if (linha > linhas.length) throw new Error(`linha ${linha} não existe no arquivo (tem ${linhas.length} linhas).`);
  const linhaAntes = linhas[linha - 1];
  const i = linhaAntes.indexOf(de);
  if (i < 0) throw new Error(`trecho \`de\` (${de}) não foi encontrado na linha ${linha}.`);
  const linhaDepois = linhaAntes.slice(0, i) + para + linhaAntes.slice(i + de.length);
  const copia = [...linhas];
  copia[linha - 1] = linhaDepois;
  return { texto: copia.join('\n'), linhaAntes, linhaDepois };
}

/**
 * Classifica o resultado de uma mutação a partir da execução do teste:
 * estouro de tempo vence tudo (TIMEOUT); exit 0 significa que o teste não pegou a mutação (SOBREVIVEU);
 * qualquer outro exit code é o teste reprovando (MORTA).
 */
export function classificarResultado({ exitCode, tempoEsgotado }) {
  if (tempoEsgotado) return 'TIMEOUT';
  if (exitCode === 0) return 'SOBREVIVEU';
  return 'MORTA';
}

/** Aceita um caminho ou uma lista de caminhos de teste; retorna sempre um array. */
export function testesDaMutacao(m) {
  return Array.isArray(m.teste) ? [...m.teste] : [m.teste];
}

/** União ordenada dos arquivos de teste de todas as mutações (para o baseline). */
export function uniaoTestes(lista) {
  const vistos = new Set();
  const out = [];
  for (const m of lista) for (const t of testesDaMutacao(m)) if (!vistos.has(t)) { vistos.add(t); out.push(t); }
  return out;
}

/**
 * Valida a lista sem tocar em disco: `lerTexto(arquivo)` retorna o conteúdo ou `null` se não existir.
 * Retorna a lista de mensagens de erro (vazia quando tudo ok): ids únicos, campos presentes, arquivo existe,
 * linha existe, `de` está na linha, `teste` é caminho ou lista de caminhos.
 */
export function validarLista(lista, lerTexto) {
  const erros = [];
  if (!Array.isArray(lista) || lista.length === 0) return ['a lista deve ser um JSON com array não vazio de mutações.'];
  const ids = new Set();
  lista.forEach((m, i) => {
    const onde = `mutação ${i + 1}${m && m.id ? ` (id "${m.id}")` : ''}`;
    if (!m || typeof m !== 'object') { erros.push(`${onde}: entrada deve ser um objeto.`); return; }
    if (typeof m.id !== 'string' || m.id.length === 0) erros.push(`${onde}: \`id\` deve ser um texto não vazio.`);
    else if (ids.has(m.id)) erros.push(`${onde}: \`id\` duplicado na lista.`);
    else ids.add(m.id);
    if (typeof m.arquivo !== 'string' || m.arquivo.length === 0) erros.push(`${onde}: \`arquivo\` deve ser um caminho não vazio.`);
    if (typeof m.teste !== 'string' && !(Array.isArray(m.teste) && m.teste.length > 0 && m.teste.every((t) => typeof t === 'string' && t.length > 0))) {
      erros.push(`${onde}: \`teste\` deve ser um caminho ou uma lista não vazia de caminhos.`);
    }
    if (m.recorte !== undefined && typeof m.recorte !== 'string') erros.push(`${onde}: \`recorte\` deve ser texto.`);
    if (typeof m.de !== 'string' || m.de.length === 0) erros.push(`${onde}: \`de\` deve ser um texto não vazio.`);
    if (typeof m.para !== 'string') erros.push(`${onde}: \`para\` deve ser um texto.`);
    if (typeof m.arquivo === 'string' && m.arquivo.length > 0) {
      const texto = lerTexto(m.arquivo);
      if (texto === null || texto === undefined) erros.push(`${onde}: arquivo não existe: ${m.arquivo}`);
      else {
        try { editarTexto(texto, m.linha, m.de ?? '', m.para ?? ''); }
        catch (e) { erros.push(`${onde}: ${e.message}`); }
      }
    }
  });
  return erros;
}

/** Lê o texto de `resultado.jsonl` e devolve o conjunto de ids já processados (linhas inválidas são ignoradas). */
export function idsProcessados(textoJsonl) {
  const ids = new Set();
  for (const linha of textoJsonl.split('\n')) {
    const t = linha.trim();
    if (!t) continue;
    try {
      const rec = JSON.parse(t);
      if (rec && typeof rec.id === 'string') ids.add(rec.id);
    } catch { /* linha corrompida: ignora */ }
  }
  return ids;
}

/** Devolve as últimas `n` linhas de `texto` (para o `saida_resumo` do resultado.jsonl). */
export function ultimasLinhas(texto, n) {
  const linhas = texto.replace(/\n+$/, '').split('\n');
  return linhas.slice(Math.max(0, linhas.length - n)).join('\n');
}

function celula(s) {
  return String(s).replace(/\|/g, '\\|');
}

/**
 * Monta o resumo em markdown a partir dos registros (ou de entradas `{ ...mutação, resultado }` no --dry):
 * tabela `# | arquivo:linha | de -> para | resultado | duração`, totais e o diff exato de cada SOBREVIVEU.
 */
export function montarResumo(registros) {
  const linhas = [
    '| # | arquivo:linha | de -> para | resultado | duração |',
    '|---:|---|---|---|---:|',
  ];
  registros.forEach((r, i) => {
    const dur = typeof r.duracao_s === 'number' ? `${r.duracao_s.toFixed(1)} s` : '—';
    linhas.push(`| ${i + 1} | ${celula(`${r.arquivo}:${r.linha}`)} | ${celula(`${r.de} -> ${r.para}`)} | ${celula(r.resultado)} | ${dur} |`);
  });
  const totais = RESULTADOS.map((k) => `${k}: ${registros.filter((r) => r.resultado === k).length}`).join(' | ');
  linhas.push('', `**Totais** — ${totais} | total: ${registros.length}`);
  const sobrevividas = registros.filter((r) => r.resultado === 'SOBREVIVEU' && r.linha_antes !== undefined);
  if (sobrevividas.length > 0) {
    linhas.push('', '## Sobreviveu (diff exato)');
    for (const r of sobrevividas) {
      linhas.push('', `### ${r.id} — ${r.arquivo}:${r.linha}`, '', '```diff', `-${r.linha_antes}`, `+${r.linha_depois}`, '```');
    }
  }
  return `${linhas.join('\n')}\n`;
}

/**
 * Interpreta `argv` (sem `node` e sem o nome do script). Uso:
 * `--lista <arquivo.json> --saida <pasta> [--timeout-min 20] [--baseline] [--dry]`.
 * Lança `Error` em flag ausente, valor faltando, timeout inválido ou flag desconhecida.
 */
export function parsearArgs(argv) {
  const opts = { lista: null, saida: null, timeoutMin: 20, baseline: false, dry: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lista' || a === '--saida' || a === '--timeout-min') {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} exige um valor.`);
      if (a === '--timeout-min') {
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) throw new Error(`--timeout-min deve ser um número > 0, recebi "${v}".`);
        opts.timeoutMin = n;
      } else opts[a.slice(2)] = v;
    } else if (a === '--baseline') opts.baseline = true;
    else if (a === '--dry') opts.dry = true;
    else throw new Error(`argumento desconhecido: ${a}`);
  }
  if (!opts.lista) throw new Error('falta --lista <arquivo.json>.');
  if (!opts.saida) throw new Error('falta --saida <pasta>.');
  return opts;
}
