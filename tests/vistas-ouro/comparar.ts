/**
 * Comparação do ouro: só texto, sem conhecer o projeto. A diferença sai legível: arquivo, número da linha e as primeiras
 * linhas que divergem (gravada × atual), cada uma cortada para caber na tela.
 */

const CORTE = 220;
const corta = (s: string | undefined): string => (s === undefined ? '(sem linha)' : s.length > CORTE ? `${s.slice(0, CORTE)}… [+${s.length - CORTE} caracteres]` : s);

/** Descrição das primeiras linhas divergentes entre dois textos, ou `null` se iguais. */
export function diferenca(esperado: string, obtido: string, maxLinhas = 5): string | null {
  if (esperado === obtido) return null;
  const e = esperado.split('\n');
  const o = obtido.split('\n');
  const out: string[] = [];
  let total = 0;
  for (let i = 0; i < Math.max(e.length, o.length); i++) {
    if (e[i] === o[i]) continue;
    total += 1;
    if (total <= maxLinhas) out.push(`    linha ${i + 1}:`, `      gravado: ${corta(e[i])}`, `      agora:   ${corta(o[i])}`);
  }
  return `${out.join('\n')}\n    (${total} linha(s) divergentes; gravado ${e.length - 1} linhas, agora ${o.length - 1})`;
}

/** Mensagem de falha de um projeto: uma seção por arquivo de ouro que mudou, sumiu ou apareceu. */
export function relatorio(projeto: string, gravado: Map<string, string>, atual: Map<string, string>): string | null {
  const partes: string[] = [];
  for (const nome of [...new Set([...gravado.keys(), ...atual.keys()])].sort()) {
    const g = gravado.get(nome);
    const a = atual.get(nome);
    if (g === undefined) partes.push(`  [NOVA SAÍDA] ${projeto}/${nome}: não existe no ouro gravado`);
    else if (a === undefined) partes.push(`  [SAÍDA SUMIU] ${projeto}/${nome}: existe no ouro gravado e não foi mais gerada`);
    else {
      const d = diferenca(g, a);
      if (d) partes.push(`  [DIFERE] ${projeto}/${nome}\n${d}`);
    }
  }
  return partes.length ? partes.join('\n') : null;
}
