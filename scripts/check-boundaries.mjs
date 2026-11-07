// Fronteiras entre camadas (docs/01 §1): dependências só descem.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ALLOWED = {
  geom: [],
  model: ['geom'],
  engine: ['geom', 'model'],
  tools: ['geom', 'model', 'engine'],
  render: ['geom', 'model', 'engine', 'tools'],
  // Exceção consciente (2026-10-29): o exportador IFC precisa dos quantitativos/contornos RESOLVIDOS do motor para
  // `IfcSpace` e `Qto_*`; o importador e o DXF continuam usando só `model`. Ver docs/ifc/exportacao.md §Arquitetura.
  io: ['model', 'engine'],
  // Pacote sem dependências: contrato público de plugins e protocolo (docs/plugins).
  'plugin-api': [],
  web: ['geom', 'model', 'engine', 'tools', 'render', 'io', 'plugin-api'],
};

function* files(dir) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|tsx)$/.test(f)) yield p;
  }
}

let bad = 0;
for (const [pkg, allowed] of Object.entries(ALLOWED)) {
  const root = pkg === 'web' ? 'apps/web/src' : `packages/${pkg}/src`;
  for (const file of files(root)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/from\s+['"]@hestia\/([a-z]+)['"]/g)) {
      const dep = m[1];
      if (dep !== pkg && !allowed.includes(dep)) {
        console.error(`${file}: "${pkg}" não pode importar "@hestia/${dep}"`);
        bad++;
      }
    }
    // Núcleo sem interface: nada de DOM/React em geom, model e engine.
    if (['geom', 'model', 'engine'].includes(pkg) && /from\s+['"](react|three)['"]|document\.|window\./.test(src) && !file.endsWith('.test.ts')) {
      console.error(`${file}: camada "${pkg}" não pode depender de DOM/React/three`);
      bad++;
    }
  }
}
if (bad) process.exit(1);
console.log('fronteiras ok');
