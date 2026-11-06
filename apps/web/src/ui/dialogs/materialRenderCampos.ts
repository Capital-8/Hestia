import {
  materialEmissive,
  materialIor,
  materialMapping,
  materialMetallic,
  materialRoughness,
  materialTexture,
  materialTransmission,
  validarMaterialPbr,
  type Material,
  type MaterialEmissive,
  type MaterialPbrPatch,
  type MaterialTexture,
  type MaterialTexturePreset,
} from '@hestia/model';

/** Campos da aba Render da janela de materiais. */
export type CampoRender = 'textura' | 'escala' | 'rugosidade' | 'metalicidade' | 'transmissao' | 'ior' | 'emissao';

/** Valor enviado por um campo: preset (textura), número (deslizantes e escala) ou parte da emissão. `undefined` volta ao padrão. */
export type ValorDoCampo = MaterialTexturePreset | number | Partial<MaterialEmissive> | undefined;

export type ResultadoPatch = { ok: true; patch: MaterialPbrPatch } | { ok: false; erro: string };

/** Escala mínima da textura, em metros por repetição. */
export const ESCALA_MINIMA = 0.1;

/** Textura de catálogo: 'nenhum' remove o preset. */
export const PRESETS_TEXTURA: ReadonlyArray<readonly [MaterialTexturePreset, string]> = [
  ['nenhum', 'Nenhuma'],
  ['reboco', 'Reboco'],
  ['tijolo', 'Tijolo'],
  ['madeira', 'Madeira'],
  ['telha', 'Telha'],
  ['pedra', 'Pedra'],
  ['concreto', 'Concreto'],
  ['metal', 'Metal'],
  ['piso', 'Piso'],
];

/** Valores que a janela mostra: sempre o valor efetivo, com o padrão quando o campo não existe. */
export interface ValoresRender {
  textura: MaterialTexturePreset;
  escala: number;
  rugosidade: number;
  metalicidade: number;
  transmissao: number;
  ior: number;
  emissao: MaterialEmissive;
}

const EMISSAO_PADRAO: MaterialEmissive = { color: '#ffffff', intensity: 0 };

/** Valor efetivo de cada campo (lido pelos leitores de materialPbr.ts, nunca pelo campo cru). */
export function valorEfetivo(m: Material): ValoresRender {
  return {
    textura: materialTexture(m)?.preset ?? 'nenhum',
    escala: materialMapping(m).scale,
    rugosidade: materialRoughness(m),
    metalicidade: materialMetallic(m),
    transmissao: materialTransmission(m),
    ior: materialIor(m),
    emissao: materialEmissive(m) ?? { ...EMISSAO_PADRAO },
  };
}

/** Campo numérico de `Material` que cada deslizante/número grava. */
const CHAVE_NUMERICA: Record<'rugosidade' | 'metalicidade' | 'transmissao' | 'ior', 'roughness' | 'metallic' | 'transmission' | 'ior'> = {
  rugosidade: 'roughness',
  metalicidade: 'metallic',
  transmissao: 'transmission',
  ior: 'ior',
};

const MENSAGEM_ESCALA = `Escala da textura deve ser de pelo menos ${ESCALA_MINIMA.toString().replace('.', ',')} m por repetição.`;

/** Mensagem pt-BR para um valor fora da faixa de cada campo (usada também pela janela ao recusar a digitação). */
export function mensagemCampo(campo: CampoRender): string {
  switch (campo) {
    case 'escala': return MENSAGEM_ESCALA;
    case 'rugosidade': return 'Rugosidade deve estar entre 0 e 1.';
    case 'metalicidade': return 'Metalicidade deve estar entre 0 e 1.';
    case 'transmissao': return 'Transmissão deve estar entre 0 e 1.';
    case 'ior': return 'Índice de refração (IOR) deve estar entre 1 e 3.';
    case 'emissao': return 'Intensidade de emissão não pode ser negativa.';
    case 'textura': return 'Textura desconhecida.';
  }
}

/** Aplica um patch a uma cópia do material (undefined remove o campo), como o comando faz. */
function aplicarPatch(m: Material, patch: MaterialPbrPatch): Material {
  const candidato: Record<string, unknown> = { ...m };
  for (const [chave, valor] of Object.entries(patch)) {
    if (valor === undefined) delete candidato[chave];
    else candidato[chave] = valor;
  }
  return candidato as unknown as Material;
}

/** Textura com o preset trocado: mantém os mapas de arquivo; sem nenhum mapa, a textura some. */
function texturaComPreset(m: Material, preset: MaterialTexturePreset | undefined): MaterialTexture | undefined {
  const resto: MaterialTexture = { ...materialTexture(m) };
  delete resto.preset;
  if (preset === undefined || preset === 'nenhum') return Object.keys(resto).length > 0 ? resto : undefined;
  return { ...resto, preset };
}

/**
 * Patch que a janela envia para um campo da aba Render: só aquele campo. Recusa o valor antes de gravar, com a
 * mensagem em pt-BR, validando o material resultante com `validarMaterialPbr`.
 */
export function patchDoCampo(m: Material, campo: CampoRender, valor: ValorDoCampo): ResultadoPatch {
  let patch: MaterialPbrPatch;
  if (campo === 'textura') {
    if (valor !== undefined && typeof valor !== 'string') return { ok: false, erro: mensagemCampo(campo) };
    if (valor !== undefined && !PRESETS_TEXTURA.some(([p]) => p === valor)) return { ok: false, erro: mensagemCampo(campo) };
    patch = { texture: texturaComPreset(m, valor as MaterialTexturePreset | undefined) };
  } else if (campo === 'escala') {
    if (valor === undefined) patch = { mapping: undefined };
    else if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < ESCALA_MINIMA) return { ok: false, erro: mensagemCampo(campo) };
    else patch = { mapping: { ...m.mapping, scale: valor } };
  } else if (campo === 'emissao') {
    if (valor !== undefined && typeof valor !== 'object') return { ok: false, erro: mensagemCampo(campo) };
    patch = { emissive: valor === undefined ? undefined : { ...(materialEmissive(m) ?? EMISSAO_PADRAO), ...valor } };
  } else {
    if (valor !== undefined && typeof valor !== 'number') return { ok: false, erro: mensagemCampo(campo) };
    patch = { [CHAVE_NUMERICA[campo]]: valor } as MaterialPbrPatch;
  }
  const issue = validarMaterialPbr(aplicarPatch(m, patch));
  if (issue) return { ok: false, erro: issue };
  return { ok: true, patch };
}

/** Indica se o campo foi definido explicitamente (há um valor próprio, não o padrão). */
export function campoDefinido(m: Material, campo: CampoRender): boolean {
  switch (campo) {
    case 'textura': return materialTexture(m)?.preset !== undefined;
    case 'escala': return m.mapping?.scale !== undefined;
    case 'emissao': return m.emissive !== undefined;
    default: return m[CHAVE_NUMERICA[campo]] !== undefined;
  }
}
