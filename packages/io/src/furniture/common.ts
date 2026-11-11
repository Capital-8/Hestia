// Utilitarios comuns dos leitores de blocos: estatisticas, validacao e categoria sugerida do material.
import {
  IMPORT_LIMITS,
  type ImportCategory,
  type ImportedModel,
  type ImportStats,
} from './types';

export type ModelDraft = Omit<ImportedModel, 'stats'> & { stats?: Partial<ImportStats> };

/** Remove caminho de computador: so o nome do arquivo. */
export function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? '';
}

/** Soma de vertices e triangulos das definicoes (geometria unica, sem contar instancias). */
export function countGeometry(defs: ImportedModel['defs']): { vertices: number; triangles: number } {
  let vertices = 0;
  let triangles = 0;
  for (const d of defs) {
    vertices += d.positions.length / 3;
    triangles += d.indices.length / 3;
  }
  return { vertices, triangles };
}

/**
 * Fecha o modelo: calcula `stats`, valida a consistencia e acrescenta avisos.
 * Recusa (Error) quando passa de `IMPORT_LIMITS.refuseVerticesPerBlock` vertices; avisa acima de `warnVerticesPerBlock`.
 */
export function finalizeModel(draft: ModelDraft): ImportedModel {
  const { vertices, triangles } = countGeometry(draft.defs);

  if (vertices > IMPORT_LIMITS.refuseVerticesPerBlock) {
    throw new Error(
      // units-ok: contagem de vertices em mensagem, nao e grandeza do projeto
      `O bloco tem ${vertices.toLocaleString('pt-BR')} vertices, acima do limite de ` + // units-ok: contagem de vertices
        `${IMPORT_LIMITS.refuseVerticesPerBlock.toLocaleString('pt-BR')}. Use o modo leve (versao simplificada) ou reduza o modelo no programa de origem.`,
    );
  }

  const ids = new Set<string>();
  for (const d of draft.defs) {
    if (ids.has(d.id)) throw new Error(`Definicao duplicada no modelo importado: "${d.id}".`);
    ids.add(d.id);
    const nv = d.positions.length / 3;
    if (!Number.isInteger(nv)) throw new Error(`Definicao "${d.name}": posicoes nao multiplas de 3.`);
    if (d.normals.length !== d.positions.length) throw new Error(`Definicao "${d.name}": normais e posicoes com tamanhos diferentes.`);
    if (d.uvs.length !== 0 && d.uvs.length !== nv * 2) throw new Error(`Definicao "${d.name}": UVs com tamanho incorreto.`);
    if (d.indices.length % 3 !== 0) throw new Error(`Definicao "${d.name}": indices nao multiplos de 3.`);
    for (let i = 0; i < d.indices.length; i++) {
      if ((d.indices[i] as number) >= nv) throw new Error(`Definicao "${d.name}": indice fora do intervalo de vertices.`);
    }
    for (const g of d.groups) {
      if (g.start < 0 || g.count < 0 || g.start + g.count > d.indices.length || g.start % 3 !== 0 || g.count % 3 !== 0) {
        throw new Error(`Definicao "${d.name}": grupo de material invalido.`);
      }
      if (g.materialIndex < 0 || g.materialIndex >= draft.materials.length) {
        throw new Error(`Definicao "${d.name}": grupo aponta para material inexistente.`);
      }
    }
  }
  for (const inst of draft.instances) {
    if (!ids.has(inst.defId)) throw new Error(`Instancia aponta para definicao inexistente: "${inst.defId}".`);
    if (inst.transform.length !== 16 || inst.transform.some((v) => !Number.isFinite(v))) {
      throw new Error('Instancia com matriz de transformacao invalida.');
    }
  }
  for (const m of draft.materials) {
    if (m.textureIndex !== undefined && (m.textureIndex < 0 || m.textureIndex >= draft.textures.length)) {
      throw new Error(`Material "${m.name}": textura inexistente.`);
    }
  }

  const warnings = [...draft.warnings];
  if (vertices > IMPORT_LIMITS.warnVerticesPerBlock) {
    warnings.push(
      // units-ok: contagem de vertices em mensagem, nao e grandeza do projeto
      `Bloco pesado: ${vertices.toLocaleString('pt-BR')} vertices (aviso acima de ${IMPORT_LIMITS.warnVerticesPerBlock.toLocaleString('pt-BR')}). ` +
        'Considere o modo leve para navegar.',
    );
  }

  return {
    ...draft,
    warnings,
    stats: {
      vertices,
      triangles,
      definitions: draft.defs.length,
      instances: draft.instances.length,
      textures: draft.textures.length,
      sourceBytes: draft.stats?.sourceBytes ?? 0,
      ms: draft.stats?.ms ?? 0,
    },
  };
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// Ordem importa: o primeiro que casar vence. `\b` evita falsos positivos em palavras curtas.
const CATEGORY_RULES: Array<[ImportCategory, RegExp]> = [
  ['glass', /vidro|glass|mirror|espelho|cristal|transparen/],
  ['roof_tile', /telha|roof ?til|rooftil/],
  ['leather', /couro|leather|\bpu\b|courino|suede|camurca/],
  ['fabric', /tecido|fabric|cloth|linho|linen|veludo|velvet|algodao|cotton|\bfelt\b|feltro|carpet|tapete|\brug\b|cortina|curtain|textile|canvas|lona|wool|upholster|estofad/],
  ['wood', /madeira|wood|\boak\b|carvalho|walnut|nogueira|\bpine\b|pinus|mdf|compensado|plywood|bambu|bamboo|teak|teca|cedro|cedar|\bipe\b|freijo|jatoba|laminado|veneer|parquet|timber|maple|cherry|cerejeira|\bpau\b/],
  ['metal', /metal|\baco\b|steel|inox|chrome|cromad|cromo|aluminio|aluminum|aluminium|ferro|\biron\b|bronze|latao|brass|cobre|copper|\bouro\b|\bgold\b|\bprata\b|silver|galvaniz/],
  ['ceramic', /ceramic|porcelan|\btile\b|\btiles\b|azulejo|louca|ceramica|pastilha/],
  ['brick', /tijolo|brick/],
  ['concrete', /concret|\bconcreto\b|cimento|cement|cimenticio/],
  ['stone', /pedra|marmore|marble|granit|stone|travertin|ardosia|slate|quartz|calcario|limestone|rock\b/],
  ['asphalt', /asfalt|asphalt/],
  ['grass', /grama|grass|relva|lawn/],
  ['soil', /\bterra\b|\bsolo\b|\bsoil\b|\bdirt\b|areia|\bsand\b|gravel|cascalho/],
  ['plaster', /gesso|plaster|reboco|drywall|massa corrida|stucco|estuque|parede|wall/],
  ['paint', /tinta|paint|pintura|laca|lacquer|esmalte|enamel/],
  ['plastic', /plastic|pvc|acrilic|acrylic|polietileno|\babs\b|nylon|nailon|resina|resin|borracha|rubber|silicone|vinil|vinyl/],
];

/**
 * Categoria sugerida a partir do nome do material (PT/EN). `color` e `hasTexture` so desempatam quando o nome nao diz nada:
 * nome vazio/generico e sem textura em cor muito clara ou escura nao muda o padrao ('other').
 */
export function guessCategory(
  materialName: string,
  _color?: [number, number, number],
  _hasTexture?: boolean,
): ImportCategory {
  const n = normalize(materialName || '').replace(/[_\-.+/\\()]+/g, ' ');
  for (const [cat, re] of CATEGORY_RULES) {
    if (re.test(n)) return cat;
  }
  return 'other';
}

/** Tipo de imagem pelo cabecalho (nao pela extensao). So PNG e JPEG sao aceitos. */
export function sniffMime(data: Uint8Array): 'image/png' | 'image/jpeg' | null {
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'image/png';
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  return null;
}

/** Largura e altura em pixels lidas do cabecalho de PNG/JPEG (sem decodificar). */
export function imageSize(data: Uint8Array): { width: number; height: number } | null {
  const mime = sniffMime(data);
  if (mime === 'image/png') {
    if (data.length < 24) return null;
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  if (mime === 'image/jpeg') {
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let i = 2;
    while (i + 9 < data.length) {
      if (data[i] !== 0xff) { i++; continue; }
      const marker = data[i + 1] as number;
      if (marker === 0xff) { i++; continue; }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = dv.getUint16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: dv.getUint16(i + 5), width: dv.getUint16(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}
