// Suplemento de exemplo "CSV de paredes" (runtime script; permissões model.read, model.write, io.import, io.export).
// O script roda num Worker sem DOM e sem rede. Toda porta do host é ASSÍNCRONA: use `await`.
// Coordenadas em metros (m). Formato do CSV: id;x1;y1;x2;y2 (a primeira linha pode ser o cabeçalho).

const fmt = (n) => String(Math.round(n * 1000) / 1000);

/**
 * Exportador: o host passa `{ project, fileName }` (cópia imutável do modelo) e entrega o texto devolvido como download.
 * Pode devolver texto, Uint8Array, ArrayBuffer ou `{ data, name }` (o nome precisa terminar em .csv).
 */
export function exportarParedes(_ctx, { project }) {
  const linhas = ['id;x1;y1;x2;y2'];
  for (const e of Object.values(project.elements ?? {})) {
    if (e.kind === 'wall') linhas.push([e.id, fmt(e.a.x), fmt(e.a.y), fmt(e.b.x), fmt(e.b.y)].join(';'));
  }
  return linhas.join('\n') + '\n';
}

/**
 * Importador: recebe `{ name, bytes }` (bytes é um ArrayBuffer com a cópia do arquivo) e devolve um LOTE DE COMANDOS.
 * O host mostra a prévia, pede confirmação e aplica tudo como um único passo de Desfazer. Ids novos vêm de `ctx.model.newId`.
 */
export async function importarParedes(ctx, { bytes }) {
  const texto = new TextDecoder().decode(new Uint8Array(bytes));
  const projeto = await ctx.model.read();
  const nivel = projeto.levels?.[0]?.id;
  const tipo = Object.keys(projeto.wallTypes ?? {})[0];
  if (!nivel || !tipo) throw new Error('o projeto precisa de um nível e de um tipo de parede');
  const comandos = [];
  let ignoradas = 0;
  for (const linha of texto.split(/\r?\n/)) {
    if (!linha.trim()) continue;
    const campos = linha.split(/[;,]/).map((c) => c.trim());
    // Aceita "x1;y1;x2;y2" ou "id;x1;y1;x2;y2" (o id do arquivo é só informativo: o host emite os ids novos).
    const nums = campos.slice(-4).map(Number);
    if (campos.length < 4 || nums.some((n) => !Number.isFinite(n))) { ignoradas += 1; continue; }
    const [x1, y1, x2, y2] = nums;
    if (x1 === x2 && y1 === y2) { ignoradas += 1; continue; }
    const id = await ctx.model.newId('w');
    comandos.push({
      type: 'addWall',
      wall: {
        id, kind: 'wall', typeId: tipo, levelId: nivel, a: { x: x1, y: y1 }, b: { x: x2, y: y2 },
        baseOffset: 0, topLevelId: null, height: 2.8, topOffset: 0,
        attachBottomToFloor: false, attachTopToFloor: false, attachTopToRoof: false,
        locationLine: 'wallCenter', flipped: false, noJoinStart: false, noJoinEnd: false,
        joinStart: { kind: 'butt', flip: false }, joinEnd: { kind: 'butt', flip: false },
        sag: 0, topProfile: null, mark: '', comments: '',
      },
    });
  }
  return { commands: comandos, report: ignoradas ? `${ignoradas} linha(s) ignorada(s) por formato inválido.` : undefined };
}
