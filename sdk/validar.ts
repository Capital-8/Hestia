/**
 * Validação de uma pasta de suplemento com o MESMO validador do app (`openPackageFolder` + `validateManifestAny`), mais
 * conferências úteis a quem escreve (handler citado que não existe no script, arquivo de entrada vazio). Devolve
 * problemas legíveis em português, sem executar o código do suplemento.
 */
import { openPackageFolder, PkgError, ZipReadError, type ZipEntryData } from '@hestia/io';
import { validateManifestAny, type ManifestV2Issue } from '@hestia/plugin-api';

export interface Problema {
  nivel: 'erro' | 'aviso';
  mensagem: string;
}

export interface ResultadoValidacao {
  ok: boolean;
  /** `id` do manifesto, quando deu para ler. */
  id?: string;
  problemas: Problema[];
}

/** Explica um problema do validador do manifesto em português (código técnico entre colchetes). */
export function descreverProblema(i: ManifestV2Issue): string {
  const campo = 'path' in i ? i.path : 'field' in i ? i.field : '';
  switch (i.code) {
    case 'not_object': return 'O manifesto precisa ser um objeto JSON [not_object].';
    case 'manifest_too_large': return 'O manifesto passa de 256 KiB [manifest_too_large].';
    case 'bad_manifest_version': return `"manifestVersion" deve ser 2 (veio "${i.got}") [bad_manifest_version].`;
    case 'bad_field': return `Campo inválido ou ausente: "${campo}" [bad_field]. Veja o limite de tamanho e o formato em docs/plugins/10-referencia-da-api.md.`;
    case 'unknown_capability': return `Permissão desconhecida: "${i.capability}" [unknown_capability].`;
    case 'bad_api_version': return `"hestiaApi" mal formada ("${i.got}"): use "major.minor", por exemplo "1.0" [bad_api_version].`;
    case 'api_incompatible': return `"hestiaApi" ${i.got} não é aceita por este Hestia: use a mesma versão maior e menor igual ou anterior [api_incompatible].`;
    case 'capability_not_allowed': return `A permissão "${i.capability}" não é permitida neste runtime [capability_not_allowed].`;
    case 'missing_dependency': return `A permissão "${i.capability}" exige também "${i.requires}"; acrescente-a em "capabilities" [missing_dependency].`;
    case 'too_many': return `Entradas demais em "${campo}" (máximo 200) [too_many].`;
    case 'duplicate_id': return `Id repetido em "${campo}" [duplicate_id].`;
    case 'unknown_ref': return `"${campo}" aponta para algo que não existe no manifesto [unknown_ref].`;
    case 'missing_capability': return `"${campo}" precisa da permissão "${i.capability}" em "capabilities" [missing_capability].`;
    case 'runtime_conflict': return `"${campo}" não vale para este runtime [runtime_conflict].`;
  }
}

const POR_CODIGO: Record<string, string> = {
  no_manifest: 'Falta o manifest.json na raiz da pasta.',
  manifest_json: 'O manifest.json não é JSON válido (veja vírgulas e aspas).',
  manifest_big: 'O manifest.json é grande demais.',
  manifest_field: 'Campo do manifesto inválido',
  file_type: 'Tipo de arquivo não permitido no pacote (aceitos: json, js, mjs, svg, png, md, txt)',
  wasm: 'Arquivos .wasm não são aceitos nesta versão',
  entry_missing: 'O arquivo de entrada ("entry") não existe na pasta',
  bad_path: 'Caminho de arquivo inválido',
  too_many_files: 'Arquivos demais (máximo 200)',
  too_big_file: 'Arquivo grande demais (máximo 8 MiB)',
  too_big_total: 'Conteúdo grande demais (máximo 16 MiB)',
};

/** Nomes de função que o manifesto manda chamar (handlers, `onCommit`, exportadores e importadores de script). */
export function handlersCitados(raw: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const c = (raw.contributes ?? {}) as Record<string, unknown>;
  const lista = (k: string): Array<Record<string, unknown>> => (Array.isArray(c[k]) ? (c[k] as Array<Record<string, unknown>>) : []);
  const run = (a: unknown): void => {
    const r = a as { type?: unknown; ref?: unknown } | undefined;
    if (r && r.type === 'handler' && typeof r.ref === 'string') out.add(r.ref);
  };
  for (const x of lista('commands')) run(x.run);
  for (const d of lista('dialogs')) for (const a of Array.isArray(d.actions) ? (d.actions as Array<Record<string, unknown>>) : []) run(a.run);
  for (const k of ['tools']) for (const x of lista(k)) if (typeof x.onCommit === 'string') out.add(x.onCommit);
  for (const k of ['importers', 'exporters', 'checks']) for (const x of lista(k)) if (typeof x.handler === 'string') out.add(x.handler);
  return [...out].sort();
}

/** Nomes exportados como função no código do script (`export function f`, `export async function f`, `export const f =`). */
export function exportacoesDe(codigo: string): Set<string> {
  const out = new Set<string>();
  for (const m of codigo.matchAll(/export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g)) out.add(m[1]!);
  for (const m of codigo.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) out.add(m[1]!);
  for (const m of codigo.matchAll(/export\s*\{([^}]*)\}/g)) for (const n of m[1]!.split(',')) { const nome = n.trim().split(/\s+as\s+/).pop()?.trim(); if (nome) out.add(nome); }
  return out;
}

/** Valida os arquivos de uma pasta de suplemento (caminho relativo com `/` -> bytes). Nunca lança. */
export function validarArquivos(arquivos: readonly ZipEntryData[]): ResultadoValidacao {
  const problemas: Problema[] = [];
  const erro = (mensagem: string): void => void problemas.push({ nivel: 'erro', mensagem });
  const aviso = (mensagem: string): void => void problemas.push({ nivel: 'aviso', mensagem });
  let pacote;
  try {
    pacote = openPackageFolder(arquivos);
  } catch (e) {
    if (e instanceof PkgError || e instanceof ZipReadError) {
      const base = POR_CODIGO[e.code] ?? 'Pacote inválido';
      erro(`${base}${e.message && e.code !== 'no_manifest' && e.code !== 'manifest_json' ? `: ${e.message}` : ''} [${e.code}]`);
      // Erro de campo do manifesto: o leitor de pacote para no primeiro; o validador completo lista TODOS de uma vez.
      if (e.code === 'manifest_field') {
        try {
          const bruto = JSON.parse(new TextDecoder().decode(arquivos.find((a) => a.path === 'manifest.json')?.data ?? new Uint8Array())) as unknown;
          const v = validateManifestAny(bruto);
          if (!v.ok) for (const i of v.issues) erro(descreverProblema(i));
        } catch {
          /* o JSON já foi aceito pelo leitor; nada a acrescentar */
        }
      }
    } else erro(`Erro inesperado: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, problemas };
  }
  const raw = pacote.manifest.raw;
  const r = validateManifestAny(raw);
  if (!r.ok) for (const i of r.issues) erro(descreverProblema(i));
  if (r.ok && r.legacy) aviso('Manifesto 1.x (sem "manifestVersion"): vale só como processo externo, sem contribuições. Use "manifestVersion": 2.');
  if (pacote.manifest.runtime === 'script' && pacote.manifest.entry) {
    const bytes = pacote.files.get(pacote.manifest.entry);
    if (bytes) {
      const exportadas = exportacoesDe(new TextDecoder().decode(bytes));
      for (const h of handlersCitados(raw)) if (!exportadas.has(h)) erro(`O manifesto cita o handler "${h}", mas "${pacote.manifest.entry}" não exporta essa função [handler_missing].`);
    }
  }
  if (pacote.readme === undefined) aviso('Sem README.md: o texto aparece na tela de instalação e ajuda quem vai conceder permissões.');
  if (pacote.manifest.capabilities.length === 0) aviso('Nenhuma permissão pedida: o suplemento não poderá ler o modelo nem acrescentar interface.');
  return { ok: !problemas.some((p) => p.nivel === 'erro'), id: pacote.manifest.id, problemas };
}

/** Texto para o terminal: uma linha por problema. */
export function formatarProblemas(nome: string, res: ResultadoValidacao): string {
  if (res.problemas.length === 0) return `${nome}: ok`;
  return [`${nome}: ${res.ok ? 'ok, com avisos' : 'ERRO'}`, ...res.problemas.map((p) => `  ${p.nivel === 'erro' ? 'erro ' : 'aviso'}: ${p.mensagem}`)].join('\n');
}
