// Portão do orquestrador: confere uma ficha entregue pelo executor. NÃO confia no relatório dele.
// Uso: node docs/handoff/componentes/gate.mjs --dir <worktree> --base <branch-base> --allow "a.ts,b/*.ts" --tests "arquivo.test.ts[,...]"
// Saída: uma linha por verificação (OK/FALHA) e `PORTAO: APROVADO|REPROVADO`. Código de saída 0 só se aprovado.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const arg = (nome, padrao = '') => {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] ?? padrao : padrao;
};
const dir = path.resolve(arg('dir', '.'));
const base = arg('base', 'HEAD~1');
const allow = arg('allow').split(',').map((s) => s.trim()).filter(Boolean);
const tests = arg('tests').split(',').map((s) => s.trim()).filter(Boolean);
const filtro = arg('filtro');
let falhas = 0;

const roda = (cmd, args) => spawnSync(cmd, args, { cwd: dir, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
const ultima = (r) => (r.stdout + r.stderr).trim().split(/\r?\n/).filter(Boolean).slice(-3).join(' | ');
const registra = (nome, ok, extra = '') => { console.log(`${ok ? 'OK    ' : 'FALHA '} ${nome}${extra ? ` — ${extra}` : ''}`); if (!ok) falhas++; };
const casa = (arquivo, padrao) => new RegExp(`^${padrao.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`).test(arquivo);

// 1. só arquivos permitidos mudaram (commits desde a base + o que ficou sem commit)
const diff = roda('git', ['diff', '--name-only', `${base}...HEAD`]).stdout.split(/\r?\n/).filter(Boolean);
const solto = roda('git', ['status', '--porcelain']).stdout.split(/\r?\n/).filter(Boolean).map((l) => l.slice(3).trim().replace(/"/g, ''));
const mudados = [...new Set([...diff, ...solto])];
const fora = mudados.filter((f) => !allow.some((p) => casa(f, p)));
registra('escopo: só arquivos permitidos', fora.length === 0, fora.length ? `fora da lista: ${fora.join(', ')}` : `${mudados.length} arquivo(s)`);
registra('tudo commitado', solto.length === 0, solto.join(', '));

// 2. tipos, lint, testes da ficha, fronteiras
const tsc = roda('npx', ['tsc', '-p', 'tsconfig.json', '--noEmit']);
registra('tsc', tsc.status === 0, tsc.status === 0 ? '' : ultima(tsc));
const alvos = mudados.filter((f) => /\.(ts|tsx)$/.test(f) && existsSync(path.join(dir, f)));
if (alvos.length) {
  const lint = roda('npx', ['eslint', '--max-warnings', '0', ...alvos]);
  registra('eslint (0 avisos)', lint.status === 0, lint.status === 0 ? '' : ultima(lint));
}
if (tests.length) {
  const vt = roda('npx', ['vitest', 'run', '--testTimeout=120000', ...(filtro ? ['-t', JSON.stringify(filtro)] : []), ...tests]);
  registra(`vitest (${tests.length} arquivo(s))`, vt.status === 0, ultima(vt));
}
const fr = roda('node', ['scripts/check-boundaries.mjs']);
registra('fronteiras', fr.status === 0, fr.status === 0 ? '' : ultima(fr));

console.log(`PORTAO: ${falhas === 0 ? 'APROVADO' : 'REPROVADO'} (${falhas} falha(s))`);
process.exit(falhas === 0 ? 0 : 1);
