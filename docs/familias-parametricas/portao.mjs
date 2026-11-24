// Portão de uma ficha: lê "Arquivos permitidos" da ficha e chama o portão genérico do repositório.
// Uso (da raiz do worktree da ficha): node docs/familias-parametricas/portao.mjs <ID> [--base claude/lucid-euler-ddb7j6] [--extra "a.ts,b/*.ts"]
// Só caminhos entre crases entram na lista; linhas sem caminho (ex.: "testes correspondentes") exigem --extra.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const id = process.argv[2];
if (!id) { console.error('uso: portao.mjs <ID> [--base b] [--extra lista]'); process.exit(2); }
const arg = (n, d = '') => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] ?? d : d; };
const ficha = readFileSync(`docs/familias-parametricas/fichas/${id}.md`, 'utf8');
const secao = ficha.split('## Arquivos permitidos')[1]?.split('## Proibido')[0] ?? '';
const allow = [...secao.matchAll(/^- `([^`]+)`/gm)].map((m) => m[1]);
const extra = arg('extra').split(',').map((s) => s.trim()).filter(Boolean);
const tests = allow.filter((p) => /\.test\.tsx?$/.test(p) && !p.includes('*'));
allow.push('docs/familias-parametricas/ESTADO.md', ...extra);
const r = spawnSync('node', ['docs/handoff/componentes/gate.mjs', '--dir', '.', '--base', arg('base', 'claude/lucid-euler-ddb7j6'), '--allow', allow.join(','), '--tests', tests.join(',')], { stdio: 'inherit' });
process.exit(r.status ?? 1);
