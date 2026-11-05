/**
 * Nome da pasta de um projeto na biblioteca.
 *
 * O sistema de arquivos do Windows (e o macOS, sem diferenciar maiúsculas) tem regras que quebram um nome "bonito":
 * caracteres proibidos, ponto ou espaço no fim, nomes reservados (CON, PRN, LPT1…) e limite de caminho. Aqui o nome do
 * projeto (que o usuário digita livremente) vira um nome de pasta seguro — e único dentro da raiz.
 */

/** Caracteres proibidos no Windows (e problemáticos em qualquer sistema). */
// eslint-disable-next-line no-control-regex -- \u0000-\u001F são exatamente os caracteres de controle proibidos em nomes.
const PROIBIDOS = /[<>:"/\\|?*\u0000-\u001F]/g;
/** Nomes de dispositivo reservados: `CON`, `NUL`, `COM1`… qualquer extensão. */
const RESERVADOS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
/** Espaço para o caminho completo no Windows (260 caracteres): a raiz e os arquivos já ocupam boa parte. */
export const MAX_NOME_PASTA = 64;

/** Nome de pasta seguro para o projeto. Vazio (ou só inválido) cai em `Projeto`. */
export function nomeDePasta(nome: string): string {
  const limpo = nome
    .replace(PROIBIDOS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Windows: ponto e espaço no fim são descartados pelo sistema e criam pastas "invisíveis".
    .replace(/[. ]+$/, '')
    .slice(0, MAX_NOME_PASTA)
    .replace(/[. ]+$/, '');
  if (!limpo) return 'Projeto';
  // `CON.txt` continua sendo o dispositivo CON: basta o prefixo bater.
  const base = limpo.split('.')[0] ?? limpo;
  return RESERVADOS.test(base) ? `_${limpo}`.slice(0, MAX_NOME_PASTA) : limpo;
}

/**
 * Nome único entre os já ocupados, comparando sem diferenciar maiúsculas (o Windows trata `Casa` e `casa` como a mesma
 * pasta). O segundo vira `Casa (2)`, o terceiro `Casa (3)`…
 */
export function nomeDePastaUnico(nome: string, ocupados: readonly string[]): string {
  const base = nomeDePasta(nome);
  const usados = new Set(ocupados.map((n) => n.toLocaleLowerCase()));
  if (!usados.has(base.toLocaleLowerCase())) return base;
  for (let i = 2; i < 1000; i += 1) {
    const candidato = `${base} (${i})`.slice(0, MAX_NOME_PASTA);
    if (!usados.has(candidato.toLocaleLowerCase())) return candidato;
  }
  // Improvável: 1000 cópias do mesmo nome. Um sufixo numérico solto resolve sem laço infinito.
  return `${base} (${Date.now().toString(36)})`.slice(0, MAX_NOME_PASTA);
}

/** O nome do projeto (campo `name`) a partir do nome da pasta, quando o documento não traz um. */
export function nomeDoProjeto(pasta: string): string {
  const semSufixo = pasta.replace(/\s*\(\d+\)$/, '').trim();
  return semSufixo || pasta;
}
