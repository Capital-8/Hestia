/**
 * Estabilidade de escadas e guarda-corpos sobre a CÓPIA de um projeto real de prédio (nunca imprime nomes, ids nem coordenadas; só agregados).
 * Uso: npx vite-node scripts/estabilidade-predio.mts caminho/da/copia.json [ciclos] [escadasPorNivel]
 * O cenário é o de `tests/helpers/estabilidadeEscadas.ts`: escadas retas, L, U e livres (com e sem acabamento e bocel, guarda-corpo dos dois lados,
 * sobrepostas e ligando níveis não vizinhos) em todos os níveis; depois 3D, plantas, cortes, 4 elevações, ocultar/isolar, mover/copiar, desfazer/refazer,
 * salvar/reabrir e IFC. Roda o ciclo `ciclos` vezes e confere o heap e o resumo.
 */
import { existsSync, readFileSync } from 'node:fs';
import { iniciarDespachoKernel, servicoGuardaCorpo } from '@hestia/engine';
import { ProjectStore, migrateProject } from '@hestia/model';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { cicloCompleto, heapAposColeta, inserirEscadas, novoContexto, tiposDeEscadaDoCenario } from '../tests/helpers/estabilidadeEscadas.ts';

const caminho = caminhoDoWasm();
if (existsSync(caminho)) {
  await iniciarDespachoKernel({ fatiaA: true, fatiaB: true, sombra: false }, async () => readFileSync(caminho));
  await new Promise((r) => setTimeout(r, 1000));
}
const [arquivo, ciclosTxt, porNivelTxt] = process.argv.slice(2);
const store = new ProjectStore(migrateProject(JSON.parse(readFileSync(arquivo!, 'utf8'))));
store.exec({ type: 'batch', commands: tiposDeEscadaDoCenario().map((stairType) => ({ type: 'upsertStairType' as const, stairType })) });
const antes = Object.keys(store.project.elements).length;
const semEscadas = porNivelTxt === '0';
const ins = semEscadas ? { escadas: [...Object.keys(store.project.elements).filter((k) => store.project.elements[k]!.kind === 'stair')], guardas: [] } : inserirEscadas(store, { porNivel: Number(porNivelTxt ?? 3), longas: 4, sobrepostas: true });
console.log(`niveis ${store.project.levels.length} | elementos antes ${antes} | escadas inseridas ${ins.escadas.length} | guarda-corpos ${ins.guardas.length}`);
const ctx = novoContexto();
const ciclos = Number(ciclosTxt ?? 3);
const heaps: number[] = [];
const resumos: string[] = [];
for (let i = 0; i < ciclos; i++) {
  const r = cicloCompleto(store, ctx, ins, i);
  resumos.push(r.resumo);
  heaps.push(heapAposColeta());
  const porNome = new Map<string, number[]>();
  for (const p of r.passos) porNome.set(p.nome, [...(porNome.get(p.nome) ?? []), p.ms]);
  const linha = [...porNome].map(([n, v]) => `${n} ${Math.max(...v).toFixed(0)}`).join(' | ');
  console.log(`ciclo ${i + 1}: maior passo ${r.maiorPasso.toFixed(0)} ms | máximos por passo: ${linha}`);
}
console.log('heap MB', heaps.map((h) => Math.round(h / 1048576)).join(' '), '| resumos distintos entre ciclos de mesma rodada:', new Set(resumos).size);
servicoGuardaCorpo().encerrar();
process.exit(0);
