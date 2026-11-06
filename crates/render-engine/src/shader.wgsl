// PBR direto do render-native: Cook-Torrance/GGX, sol direcional com mapa de sombra
// (PCSS: penumbra física), ambiente por céu analítico com irradiância SH9 (ver ceu.rs), tone mapping AgX e
// codificação sRGB.
//
// Convenções:metros, Z para cima, normais de face; a conversão do recorte WebGL para
// profundidade 0..1 já vem pronta em `view_proj`.

const PI: f32 = 3.141592653589793;

struct Uniformes {
  view_proj: mat4x4<f32>,
  camera: vec4<f32>,
  sol: vec4<f32>,
  sol_cor: vec4<f32>,
  ceu: vec4<f32>,
  chao: vec4<f32>,
  parametros: vec4<f32>,
  resolucao: vec4<f32>,
  // Inversa de view_proj: leva um ponto NDC de volta ao mundo. Só o passe do céu de fundo lê.
  inversa_vp: mat4x4<f32>,
  // Ganhos RGB do balanço de branco (1,1,1 = 6500 K, neutro), aplicados à luz linear antes do tone
  // mapping (ver `balanco_branco` em ceu.rs/cor.rs). w livre.
  balanco: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniformes;
// Mapa de sombra do Sol em cascatas: um array de profundidade, uma camada por cascata (ver
// cascatas.rs). Só o passe principal lê.
@group(0) @binding(1) var sombra: texture_depth_2d_array;
@group(0) @binding(2) var comparador: sampler_comparison;
// Irradiância SH9 do céu já convoluída (E_lm = A_l · L_lm), w livre. Calculada em ceu.rs.
@group(0) @binding(3) var<uniform> sh: array<vec4<f32>, 9>;
// Oclusão ambiente da região (R8, 1 = sem oclusão), já desfocada. Só o passe principal lê.
@group(0) @binding(4) var oclusao_ambiente: texture_2d<f32>;
// Uniforme extra dos passes de oclusão (pré-passe, SSAO e desfoque). Espelha ssao.rs.
@group(0) @binding(5) var<uniform> camera_extra: CameraExtra;
// Pré-passe: normal de visão em xyz e profundidade linear em metros em w (0 sem geometria).
@group(0) @binding(6) var gbuffer: texture_2d<f32>;
// Oclusão bruta do SSAO, antes do desfoque (só o desfoque lê).
@group(0) @binding(7) var oclusao_bruta: texture_2d<f32>;
// Cópia da cor opaca já resolvida da região (sRGB codificado, como a final). Só o passe de vidro
// lê; é a "cor de tela" que a refração desloca. Ver motor.rs (passe de vidro).
@group(0) @binding(8) var cor_tela: texture_2d<f32>;
// Cascatas de sombra (ver cascatas.rs, `CascatasGpu`): matrizes, escalas, limites e a direção da
// câmera. Só o passe principal lê.
@group(0) @binding(9) var<uniform> cascatas: CascatasGpu;
// Matriz da luz de uma cascata, no passe de sombra (cada cascata tem um bind group com offset).
@group(0) @binding(10) var<uniform> luz_sombra: mat4x4<f32>;

// Número de cascatas (igual a NUMERO_CASCATAS em cascatas.rs; teste de sincronia).
const CASCATAS: u32 = 3u;
// Fração do intervalo de cada cascata em que ela mistura com a seguinte (igual a FRACAO_MISTURA
// em cascatas.rs; teste de sincronia).
const FRACAO_MISTURA: f32 = 0.1;

// Uma cascata: matriz da luz (recorte 0..1 em profundidade), faixa e reservado. 256 bytes, o
// passo do offset dinâmico do passe de sombra.
struct CascataGpu {
  luz_vp: mat4x4<f32>,
  // (profundidade do volume da luz em m, metros por texel, reservado, reservado).
  faixa: vec4<f32>,
  reservado: array<vec4<f32>, 11>,
};

// Buffer de cascatas. Profundidade de visão = (mundo - olho) · frente. Os limites s_0..s_K valem
// nos escalares de `limites` (s_0 é o plano próximo e s_K o distante).
struct CascatasGpu {
  cascatas: array<CascataGpu, CASCATAS>,
  frente: vec4<f32>,
  limites: array<vec4<f32>, 2>,
  // (metros por texel do mapa único de antes: escala as distâncias do PCSS, como antes).
  referencia: vec4<f32>,
};

// ---- Texturas de material (grupo 1, só o passe principal; ver pipeline.rs, texturas.rs e motor.rs) ----
// Um array por mapa: uma camada por textura da cena, todas no mesmo tamanho e com a mesma cadeia de
// mips. O vértice guarda a camada de cada mapa (`texturas`); SEM_TEXTURA = o canal não tem textura.
// Os arrays são amostrados com gradientes explícitos (textureSampleGrad), que não exigem fluxo
// uniforme, então a camada pode variar por pixel.
const SEM_TEXTURA: u32 = 0xffffffffu;
@group(1) @binding(0) var amostrador_textura: sampler;
@group(1) @binding(1) var texturas_albedo: texture_2d_array<f32>;
@group(1) @binding(2) var texturas_normal: texture_2d_array<f32>;
@group(1) @binding(3) var texturas_rugosidade: texture_2d_array<f32>;
@group(1) @binding(4) var texturas_metalico: texture_2d_array<f32>;

// Mesmo valor de constantes.rs (AMOSTRAS_AO). O teste de sincronia lê esta linha.
const AMOSTRAS_AO: u32 = 16u;

struct CameraExtra {
  projecao: mat4x4<f32>,
  projecao_inversa: mat4x4<f32>,
  visao: mat4x4<f32>,
  imagem: vec4<f32>,
  alvo: vec4<f32>,
  gbuffer_origem: vec4<f32>,
  ao_origem: vec4<f32>,
  // (raio em metros, margem em pixels, viés em metros, reservado).
  ssao: vec4<f32>,
  kernel: array<vec4<f32>, AMOSTRAS_AO>,
};

// Céu analítico: mesmos valores de src/ceu.rs (manter sincronizado).
const CEU_HORIZONTE: vec3<f32> = vec3<f32>(0.488, 0.616, 0.80);
const CEU_ZENITE: vec3<f32> = vec3<f32>(0.20, 0.40, 0.82);
const CEU_CHAO: vec3<f32> = vec3<f32>(0.18, 0.16, 0.13);
const COS_DISCO_SOLAR: f32 = 0.9945219;
const FATOR_DISCO_SOLAR: f32 = 2.0;

struct Entrada {
  @location(0) posicao: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) cor: vec3<f32>,
  @location(3) rugosidade: f32,
  @location(4) metalico: f32,
  @location(5) emissivo: vec3<f32>,
  // Superfície procedural: tipo (0 liso ... 7 tijolo) e escala (metros por repetição).
  @location(6) tipo: f32,
  @location(7) escala: f32,
  // Opacidade do material: 1 opaco. Abaixo de 1 (ou tipo 6), o triângulo vai ao passe de vidro.
  @location(8) opacidade: f32,
  // Índices de textura do material: albedo, normal, rugosidade, metálico (SEM_TEXTURA = nenhum).
  @location(9) texturas: vec4<u32>,
  // Média linear RGB da textura de albedo do material (ver texturas.rs, media_linear_rgb).
  @location(10) media_albedo: vec3<f32>,
};

struct SaidaSombra {
  @builtin(position) clip: vec4<f32>,
};

struct Saida {
  @builtin(position) clip: vec4<f32>,
  @location(0) mundo: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) cor: vec3<f32>,
  @location(3) rugosidade: f32,
  @location(4) metalico: f32,
  @location(5) emissivo: vec3<f32>,
  @location(6) tipo: f32,
  @location(7) escala: f32,
  @location(8) opacidade: f32,
  // Inteiro: interpolação plana (o material é o mesmo em todo o triângulo).
  @location(9) @interpolate(flat) texturas: vec4<u32>,
  @location(10) @interpolate(flat) media_albedo: vec3<f32>,
};

@vertex
fn vs_sombra(e: Entrada) -> SaidaSombra {
  var s: SaidaSombra;
  s.clip = luz_sombra * vec4<f32>(e.posicao, 1.0);
  return s;
}

@vertex
fn vs_principal(e: Entrada) -> Saida {
  var s: Saida;
  s.clip = u.view_proj * vec4<f32>(e.posicao, 1.0);
  s.mundo = e.posicao;
  s.normal = e.normal;
  s.cor = e.cor;
  s.rugosidade = e.rugosidade;
  s.metalico = e.metalico;
  s.emissivo = e.emissivo;
  s.tipo = e.tipo;
  s.escala = e.escala;
  s.opacidade = e.opacidade;
  s.texturas = e.texturas;
  s.media_albedo = e.media_albedo;
  return s;
}

// GGX / Trowbridge-Reitz.
fn distribuicao_ggx(ndh: f32, alfa: f32) -> f32 {
  let a2 = alfa * alfa;
  let denominador = ndh * ndh * (a2 - 1.0) + 1.0;
  return a2 / max(PI * denominador * denominador, 1.0e-7);
}

// Geometria de Smith com aproximação de Schlick-GGX.
fn geometria_smith(ndv: f32, ndl: f32, alfa: f32) -> f32 {
  let k = (alfa + 1.0) * (alfa + 1.0) / 8.0;
  let gv = ndv / max(ndv * (1.0 - k) + k, 1.0e-7);
  let gl = ndl / max(ndl * (1.0 - k) + k, 1.0e-7);
  return gv * gl;
}

fn fresnel_schlick(vdh: f32, f0: vec3<f32>) -> vec3<f32> {
  let base = pow(1.0 - vdh, 5.0);
  return f0 + (vec3<f32>(1.0) - f0) * base;
}

// Tone mapping AgX (Troy Sobotka, 2023), na forma usada pelo Blender e pelo three.js: entra em
// luz linear Rec.709, faz a projeção de cores (inset), leva a log2 e comprime entre AGX_EV_MIN e
// AGX_EV_MAX com um polinômio de contraste de 6ª ordem, desfaz a projeção (outset) e linearizia com
// potência 2,2. Não corta matizes saturados como a curva ACES. Espelho de cor.rs::agx (teste de
// sincronia lê as constantes daqui). A exposição entra antes, em EV via 2^EV no chamador.
const AGX_INSET: mat3x3<f32> = mat3x3<f32>(
  vec3<f32>(0.856627153315983, 0.137318972929847, 0.11189821299995),
  vec3<f32>(0.0951212405381588, 0.761241990602591, 0.0767994186031903),
  vec3<f32>(0.0482516061458583, 0.101439036467562, 0.811302368396859));
const AGX_OUTSET: mat3x3<f32> = mat3x3<f32>(
  vec3<f32>(1.1271005818144368, -0.1413297634984383, -0.14132976349843826),
  vec3<f32>(-0.11060664309660323, 1.157823702216272, -0.11060664309660294),
  vec3<f32>(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
const AGX_EV_MIN: f32 = -12.47393;
const AGX_EV_MAX: f32 = 4.026069;

fn agx_contraste(x: vec3<f32>) -> vec3<f32> {
  let x2 = x * x;
  let x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}

// Tone mapping de luz linear (já exposta e balanceada) para luz linear de saída, em [0, 1].
fn tonemapear(cor: vec3<f32>) -> vec3<f32> {
  var c = AGX_INSET * max(cor, vec3<f32>(0.0));
  c = max(c, vec3<f32>(1.0e-10));
  c = clamp((log2(c) - AGX_EV_MIN) / (AGX_EV_MAX - AGX_EV_MIN), vec3<f32>(0.0), vec3<f32>(1.0));
  c = AGX_OUTSET * agx_contraste(c);
  return clamp(pow(max(c, vec3<f32>(0.0)), vec3<f32>(2.2)), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn linear_para_srgb(c: vec3<f32>) -> vec3<f32> {
  let baixo = c * 12.92;
  let alto = 1.055 * pow(max(c, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.4)) - 0.055;
  return select(alto, baixo, c <= vec3<f32>(0.0031308));
}

// Radiância do céu analítico numa direção unitária (mesma função de ceu.rs::radiancia).
fn radiancia_ceu(dir: vec3<f32>) -> vec3<f32> {
  var cor: vec3<f32>;
  if (dir.z >= 0.0) {
    cor = mix(CEU_HORIZONTE, CEU_ZENITE, pow(clamp(dir.z, 0.0, 1.0), 0.6));
  } else {
    let s = clamp(-dir.z / 0.25, 0.0, 1.0);
    cor = mix(CEU_HORIZONTE, CEU_CHAO, s * s * (3.0 - 2.0 * s));
  }
  let sol_dir = normalize(u.sol.xyz);
  let intensidade = u.sol.w;
  if (intensidade > 0.0 && sol_dir.z > 0.0 && dot(dir, sol_dir) >= COS_DISCO_SOLAR) {
    cor = cor + vec3<f32>(intensidade * FATOR_DISCO_SOLAR);
  }
  return cor;
}

// Névoa de distância (metros, da câmera): zero até NEVOA_INICIO_M, cheia a partir de NEVOA_FIM_M,
// com suavização de Hermite (smoothstep). A cor de névoa é a do horizonte (radiancia_ceu no
// horizonte), a mesma que o céu de fundo mostra abaixo do horizonte, então a borda do chão de
// render (a ~90 m nesta cena) some na cor do céu. Espelho de ceu.rs::fator_nevoa (teste de sincronia).
const NEVOA_INICIO_M: f32 = 40.0;
const NEVOA_FIM_M: f32 = 85.0;

// Halo do Sol no céu de fundo: intensidade relativa e expoente de cos^n (o disco de radiancia_ceu
// já cobre 6 graus; o halo cai em torno dele, até ~15 graus com n = 96). Só o fundo usa o halo,
// para que a irradiância SH e os reflexos fiquem como estavam.
const HALO_SOL: f32 = 0.25;
const HALO_SOL_EXPOENTE: f32 = 96.0;

fn fator_nevoa(distancia: f32) -> f32 {
  return smoothstep(NEVOA_INICIO_M, NEVOA_FIM_M, distancia);
}

// Irradiância difusa do céu em n: soma dos 9 termos de SH com as bases reais. Os coeficientes
// de `sh` já levam A0 = π, A1 = 2π/3 e A2 = π/4; as constantes c1..c5 de Ramamoorthi & Hanrahan
// são esses produtos com Y_lm (c4 = A0·Y00, c2 = A1·Y1/2, c1 = A2·Y22, c3 = A2·3·Y20, c5 = A2·Y20).
fn irradiancia_sh(n: vec3<f32>) -> vec3<f32> {
  let x = n.x;
  let y = n.y;
  let z = n.z;
  let e = sh[0].xyz * 0.282095
    + sh[1].xyz * (0.488603 * y)
    + sh[2].xyz * (0.488603 * z)
    + sh[3].xyz * (0.488603 * x)
    + sh[4].xyz * (1.092548 * x * y)
    + sh[5].xyz * (1.092548 * y * z)
    + sh[6].xyz * (0.315392 * (3.0 * z * z - 1.0))
    + sh[7].xyz * (1.092548 * x * z)
    + sh[8].xyz * (0.546274 * (x * x - y * y));
  return max(e, vec3<f32>(0.0));
}

// Sombra PCSS (Fernando, 2005) do Sol, por cascata: busca de bloqueadores, penumbra proporcional à
// distância bloqueador-receptor e PCF com disco de Vogel. Constantes espelhadas em src/sombra.rs (o
// teste de sincronia lê TAMANHO_LUZ_SOL deste arquivo). As distâncias da penumbra são físicas (metros);
// os limites em texels do mapa único de antes viram metros pela referência de `cascatas.referencia`.
const TAMANHO_LUZ_SOL: f32 = 0.02;
const AMOSTRAS_BLOQUEIO: i32 = 16;
const AMOSTRAS_PCF: i32 = 32;
const PENUMBRA_MIN_TEXEL: f32 = 1.0;
const PENUMBRA_MAX_TEXEL: f32 = 12.0;
const BUSCA_MIN_TEXEL: f32 = 1.0;
const BUSCA_MAX_TEXEL: f32 = 24.0;
const ANGULO_OURO: f32 = 2.399963229728653;
// Viés do mapa de sombra, em texels da cascata: 0,0008 e 0,0015 em profundidade NDC de uma
// ortográfica de 3 R (antes do CSM), com texel de 2,1 R / 2048. Escalado pelo texel de cada cascata.
const VIES_TEXEL_BASE: f32 = 2.3406;
const VIES_TEXEL_INCLINACAO: f32 = 4.3896;

// Ponto i de n num disco unitário (espiral de Vogel: distribuição quase uniforme e determinística).
fn disco(i: i32, n: i32) -> vec2<f32> {
  let r = sqrt((f32(i) + 0.5) / f32(n));
  let t = f32(i) * ANGULO_OURO;
  return vec2<f32>(cos(t), sin(t)) * r;
}

// Limite s_i do buffer de cascatas (i de 0 a CASCATAS).
fn limite(i: u32) -> f32 {
  return cascatas.limites[i / 4u][i % 4u];
}

// Sombra de uma cascata: 1.0 fora da janela, fora da profundidade e quando não há bloqueador.
fn sombra_cascata(k: u32, mundo: vec3<f32>, normal: vec3<f32>, ndl: f32) -> f32 {
  let c = cascatas.cascatas[k];
  let deslocamento = normal * (0.015 + 0.05 * (1.0 - ndl));
  let posicao = c.luz_vp * vec4<f32>(mundo + deslocamento, 1.0);
  if (posicao.w <= 0.0) {
    return 1.0;
  }
  let ndc = posicao.xyz / posicao.w;
  let uv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || ndc.z > 1.0 || ndc.z < 0.0) {
    return 1.0;
  }

  // Profundidade do volume e metros por texel desta cascata. O viés é escalado pelo texel; o PCSS
  // fica em metros, então a penumbra física não muda de uma cascata para outra.
  let profundidade_m = c.faixa.x;
  let texel_m = c.faixa.y;
  let texel_uv = u.parametros.z;
  let texel_referencia = cascatas.referencia.x;
  let bias_m = texel_m * (VIES_TEXEL_BASE + VIES_TEXEL_INCLINACAO * (1.0 - ndl));
  let referencia = ndc.z - bias_m / profundidade_m;
  // Distância do receptor ao plano próximo da cascata, em metros (sentido do Sol).
  let d_receptor = ndc.z * profundidade_m;
  let dimensao = vec2<i32>(textureDimensions(sombra));
  let centro = uv * vec2<f32>(dimensao);

  // 1. Busca de bloqueadores: raio proporcional ao tamanho da luz e à distância do receptor. Piso de
  // 1 texel desta cascata; teto de 24 texels do mapa de referência (o de antes).
  let busca_m = clamp(
    TAMANHO_LUZ_SOL * d_receptor,
    BUSCA_MIN_TEXEL * texel_m,
    BUSCA_MAX_TEXEL * texel_referencia
  );
  let busca_texel = busca_m / texel_m;
  var soma_bloqueio = 0.0;
  var bloqueadores = 0.0;
  for (var i = 0; i < AMOSTRAS_BLOQUEIO; i = i + 1) {
    let coord = vec2<i32>(floor(centro + disco(i, AMOSTRAS_BLOQUEIO) * busca_texel));
    let z = textureLoad(sombra, clamp(coord, vec2<i32>(0), dimensao - vec2<i32>(1)), i32(k), 0);
    if (z < referencia) {
      soma_bloqueio = soma_bloqueio + z;
      bloqueadores = bloqueadores + 1.0;
    }
  }
  if (bloqueadores < 0.5) {
    return 1.0;
  }
  let d_bloqueador = (soma_bloqueio / bloqueadores) * profundidade_m;

  // 2. Penumbra física (metros) = (d_receptor - d_bloqueador) * tamanho angular da luz. O piso é o
  // texel desta cascata (anti-serrilhado, como o texel do mapa único era antes); o teto é a penumbra
  // física de antes, em texels do mapa de referência, para a penumbra não mudar de cascata para cascata.
  let penumbra_m = max(d_receptor - d_bloqueador, 0.0) * TAMANHO_LUZ_SOL;
  let penumbra_m_limitada = clamp(
    penumbra_m,
    PENUMBRA_MIN_TEXEL * texel_m,
    PENUMBRA_MAX_TEXEL * texel_referencia
  );
  let penumbra_texel_uv = (penumbra_m_limitada / texel_m) * texel_uv;

  // 3. PCF com disco de raio = penumbra. textureSampleCompareLevel não usa derivadas, então pode
  // ficar depois de desvios que dependem da posição.
  var soma = 0.0;
  for (var i = 0; i < AMOSTRAS_PCF; i = i + 1) {
    let desloc = disco(i, AMOSTRAS_PCF) * penumbra_texel_uv;
    soma = soma + textureSampleCompareLevel(sombra, comparador, uv + desloc, i32(k), referencia);
  }
  return soma / f32(AMOSTRAS_PCF);
}

// Fator de sombra do Sol no ponto. Escolhe a cascata pela profundidade de visão (quantos limites
// internos ela passou) e mistura com a seguinte nos últimos FRACAO_MISTURA do intervalo.
// Sol abaixo do horizonte: 1.0, sem consultar o mapa.
fn fator_sombra(mundo: vec3<f32>, normal: vec3<f32>, ndl: f32) -> f32 {
  if (u.sol.w <= 0.0) {
    return 1.0;
  }
  let profundidade = dot(mundo - u.camera.xyz, cascatas.frente.xyz);
  var k = 0u;
  for (var i = 1u; i < CASCATAS; i = i + 1u) {
    if (profundidade >= limite(i)) {
      k = i;
    }
  }
  if (k + 1u < CASCATAS) {
    let fim = limite(k + 1u);
    let inicio = fim - FRACAO_MISTURA * (fim - limite(k));
    if (profundidade > inicio) {
      let t = smoothstep(inicio, fim, profundidade);
      return mix(
        sombra_cascata(k, mundo, normal, ndl),
        sombra_cascata(k + 1u, mundo, normal, ndl),
        t
      );
    }
  }
  return sombra_cascata(k, mundo, normal, ndl);
}

// ---- Superfícies procedurais (sem textura e sem UV) ----
// Tipos, como `Material::tipo` em render-core/src/cena.rs: 0 liso (não passa por aqui), 1 reboco,
// 2 madeira, 3 telha, 4 piso, 5 metal, 6 vidro (passe próprio, fs_vidro), 7 tijolo.
// Triplanar: cada eixo amostra o padrão no plano perpendicular; os pesos são |normal|^4 normalizados.
// Coordenada de padrão = posição / escala (metros por repetição). As dimensões abaixo valem para
// escala 1.0. Ruído: value noise 3D com hash inteiro (determinístico, sem textura amostrada).
const ESCALA_MINIMA: f32 = 0.001;
const EXPOENTE_TRIPLANAR: f32 = 4.0;
const ARGAMASSA: vec3<f32> = vec3<f32>(0.55, 0.53, 0.50);
const TELHA_FILEIRA: f32 = 0.34;
const TELHA_LARGURA: f32 = 0.42;
const TIJOLO_ALTURA: f32 = 0.065;
const TIJOLO_COMPRIMENTO: f32 = 0.21;
const PISO_PLACA: f32 = 0.6;
// Passo das diferenças finitas do relevo, como fração da escala (o relevo escala junto).
const PASSO_RELEVO: f32 = 0.002;
// Sementes que separam as projeções X, Y e Z do mesmo ruído.
const SEMENTE_EIXO_Y: f32 = 11.0;
const SEMENTE_EIXO_Z: f32 = 23.0;

struct Superficie {
  cor: vec3<f32>,
  rugosidade: f32,
  // Relevo em metros no padrão de escala 1.0 (0 quando o tipo não tem relevo).
  altura: f32,
};

// Hash inteiro de três coordenadas inteiras, em [0, 1). Determinístico e sem sin/fract de float.
fn hash3(x: i32, y: i32, z: i32) -> f32 {
  var h: u32 = bitcast<u32>(x) * 0x8da6b343u;
  h = (h ^ bitcast<u32>(y)) * 0xd8163841u;
  h = (h ^ bitcast<u32>(z)) * 0xcb1ab31fu;
  h = h ^ (h >> 15u);
  h = h * 0x2c1b3c6du;
  h = h ^ (h >> 12u);
  return f32(h & 0x00ffffffu) / 16777216.0;
}

// Value noise 3D em [0, 1] (interpolação suave cúbica entre os 8 vértices da célula).
fn ruido3(p: vec3<f32>) -> f32 {
  let i = floor(p);
  let f = p - i;
  let s = f * f * (3.0 - 2.0 * f);
  let x = i32(i.x);
  let y = i32(i.y);
  let z = i32(i.z);
  let a = mix(
    mix(hash3(x, y, z), hash3(x + 1, y, z), s.x),
    mix(hash3(x, y + 1, z), hash3(x + 1, y + 1, z), s.x),
    s.y
  );
  let b = mix(
    mix(hash3(x, y, z + 1), hash3(x + 1, y, z + 1), s.x),
    mix(hash3(x, y + 1, z + 1), hash3(x + 1, y + 1, z + 1), s.x),
    s.y
  );
  return mix(a, b, s.z);
}

// Fractal de 4 oitavas (ganho 0,5, frequência x2,03), normalizado para [0, 1].
fn fbm4(p: vec3<f32>) -> f32 {
  var soma = 0.0;
  var amplitude = 0.5;
  var q = p;
  for (var i = 0; i < 4; i = i + 1) {
    soma = soma + amplitude * ruido3(q);
    q = q * 2.03 + vec3<f32>(17.1, 9.3, 4.7);
    amplitude = amplitude * 0.5;
  }
  return soma / 0.9375;
}

// Padrão de um plano. `uv` está em metros (escala 1.0); `base` é a cor linear do material.
fn padrao_2d(tipo: i32, uv: vec2<f32>, semente: f32, base: vec3<f32>) -> Superficie {
  var s: Superficie;
  s.cor = base;
  s.rugosidade = 0.5;
  s.altura = 0.0;
  if (tipo == 1) {
    // Reboco: fbm de 4 oitavas, albedo ±6%, rugosidade alta, relevo de até 6 mm.
    let n = fbm4(vec3<f32>(uv * 6.0, semente));
    s.cor = base * (1.0 + (n - 0.5) * 0.12);
    s.rugosidade = 0.85 + (n - 0.5) * 0.1;
    s.altura = (n - 0.5) * 0.006;
  } else if (tipo == 2) {
    // Madeira: veios por seno de (x + ruído * k), faixas mais escuras onde o seno passa do limiar.
    let r = ruido3(vec3<f32>(uv.x * 1.5, uv.y * 0.4, semente));
    let veio = sin(2.0 * PI * (uv.x * 20.0 + r * 4.0)) * 0.5 + 0.5;
    let faixa = smoothstep(0.6, 0.95, veio);
    s.cor = base * mix(1.0, 0.62, faixa) * (1.0 + (r - 0.5) * 0.1);
    s.rugosidade = 0.5;
  } else if (tipo == 3) {
    // Telha: fileiras de 0,34 m, cada fileira deslocada meia telha, perfil arredondado e juntas
    // escuras. O deslocamento alterna pela paridade da fileira.
    let v = uv.y / TELHA_FILEIRA;
    let linha = floor(v);
    let fv = v - linha;
    var deslocamento = 0.0;
    if ((i32(linha) & 1) == 1) {
      deslocamento = 0.5;
    }
    let u = uv.x / TELHA_LARGURA + deslocamento;
    let fu = u - floor(u);
    let dist_fileira = min(fv, 1.0 - fv) * TELHA_FILEIRA;
    let dist_telha = min(fu, 1.0 - fu) * TELHA_LARGURA;
    let junta = 1.0 - smoothstep(0.0, 0.012, min(dist_fileira, dist_telha));
    let variacao = (hash3(i32(linha), i32(floor(u)), 7) - 0.5) * 0.08;
    s.cor = base * (1.0 - 0.45 * junta) * (1.0 + variacao);
    s.rugosidade = 0.7;
    s.altura = 0.03 * sin(PI * fv) - 0.01 * junta;
  } else if (tipo == 4) {
    // Piso: grade de 0,6 m, juntas 45% mais escuras e variação leve por placa.
    let w = uv / PISO_PLACA;
    let placa = floor(w);
    let f = w - placa;
    let distancia = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) * PISO_PLACA;
    let junta = 1.0 - smoothstep(0.002, 0.004, distancia);
    let variacao = (hash3(i32(placa.x), i32(placa.y), 5) - 0.5) * 0.06;
    s.cor = base * (1.0 + variacao) * (1.0 - 0.45 * junta);
    s.rugosidade = mix(0.35, 0.6, junta);
  } else if (tipo == 5) {
    // Metal: variação de albedo de ±3% e rugosidade baixa.
    let n = ruido3(vec3<f32>(uv * 12.0, semente));
    s.cor = base * (1.0 + (n - 0.5) * 0.06);
    s.rugosidade = 0.22 + (n - 0.5) * 0.05;
  } else if (tipo == 7) {
    // Tijolo: fileiras de 0,065 m, tijolos de 0,21 m com meia junta alternada, argamassa clara
    // nas juntas (4 a 6 mm de meia largura) e junta 2 mm recuada no relevo.
    let linha = floor(uv.y / TIJOLO_ALTURA);
    let fv = uv.y - linha * TIJOLO_ALTURA;
    var deslocamento = 0.0;
    if ((i32(linha) & 1) == 1) {
      deslocamento = TIJOLO_COMPRIMENTO * 0.5;
    }
    let u = uv.x + deslocamento;
    let indice = floor(u / TIJOLO_COMPRIMENTO);
    let fu = u - indice * TIJOLO_COMPRIMENTO;
    let borda = min(min(fv, TIJOLO_ALTURA - fv), min(fu, TIJOLO_COMPRIMENTO - fu));
    let junta = 1.0 - smoothstep(0.004, 0.006, borda);
    let variacao = (hash3(i32(linha), i32(indice), 3) - 0.5) * 0.12;
    s.cor = mix(base * (1.0 + variacao), ARGAMASSA, junta);
    s.rugosidade = mix(0.75, 0.95, junta);
    s.altura = -0.002 * junta;
  }
  return s;
}

// Pesos triplanares: |normal|^4 normalizado, para o padrão vir do plano mais alinhado à face.
fn pesos_triplanares(normal: vec3<f32>) -> vec3<f32> {
  let a = pow(abs(normal), vec3<f32>(EXPOENTE_TRIPLANAR));
  return a / max(a.x + a.y + a.z, 1.0e-6);
}

// Superfície do material no ponto do mundo, misturando as três projeções pelos pesos.
fn superficie_triplanar(tipo: i32, mundo: vec3<f32>, normal: vec3<f32>, base: vec3<f32>, escala: f32) -> Superficie {
  let w = pesos_triplanares(normal);
  let q = mundo / escala;
  let px = padrao_2d(tipo, q.yz, 0.0, base);
  let py = padrao_2d(tipo, vec2<f32>(q.x, q.z), SEMENTE_EIXO_Y, base);
  let pz = padrao_2d(tipo, q.xy, SEMENTE_EIXO_Z, base);
  var s: Superficie;
  s.cor = px.cor * w.x + py.cor * w.y + pz.cor * w.z;
  s.rugosidade = px.rugosidade * w.x + py.rugosidade * w.y + pz.rugosidade * w.z;
  s.altura = px.altura * w.x + py.altura * w.y + pz.altura * w.z;
  return s;
}

// Normal perturbada pelo gradiente numérico do relevo (diferenças finitas nos três eixos).
// O relevo em metros é altura * escala; o gradiente sai adimensional e independe da escala.
fn normal_com_relevo(tipo: i32, mundo: vec3<f32>, normal: vec3<f32>, base: vec3<f32>, escala: f32) -> vec3<f32> {
  let passo = PASSO_RELEVO * escala;
  let h0 = superficie_triplanar(tipo, mundo, normal, base, escala).altura * escala;
  let hx = superficie_triplanar(tipo, mundo + vec3<f32>(passo, 0.0, 0.0), normal, base, escala).altura * escala;
  let hy = superficie_triplanar(tipo, mundo + vec3<f32>(0.0, passo, 0.0), normal, base, escala).altura * escala;
  let hz = superficie_triplanar(tipo, mundo + vec3<f32>(0.0, 0.0, passo), normal, base, escala).altura * escala;
  let gradiente = vec3<f32>(hx - h0, hy - h0, hz - h0) / passo;
  let tangente = gradiente - normal * dot(gradiente, normal);
  return normalize(normal - tangente);
}

// Amostra a camada `camada` do array `tex` com os gradientes dados.
fn amostrar_camada(tex: texture_2d_array<f32>, camada: u32, uv: vec2<f32>, dx: vec2<f32>, dy: vec2<f32>) -> vec4<f32> {
  return textureSampleGrad(tex, amostrador_textura, uv, camada, dx, dy);
}

// Coordenadas triplanares de textura: uv de cada eixo (X, Y, Z), derivadas por pixel e o sinal da
// normal em cada eixo (orienta a projeção para a face). Mesma escala do padrão procedural: uma
// repetição da textura a cada `escala` metros. Em V, o topo da imagem aponta para +Z (paredes) ou
// para +Y (planos horizontais), então a normal de mapa em convenção OpenGL fica de pé.
struct Triplanar {
  uv: array<vec2<f32>, 3>,
  dx: array<vec2<f32>, 3>,
  dy: array<vec2<f32>, 3>,
  sinal: vec3<f32>,
};

// Chamada no topo de fs_principal, antes de qualquer ramo por material: dpdx/dpdy exigem fluxo
// uniforme, e aqui o fluxo ainda é uniforme.
fn triplanar_de(mundo: vec3<f32>, normal: vec3<f32>, escala: f32) -> Triplanar {
  let q = mundo / escala;
  let sx = select(-1.0, 1.0, normal.x >= 0.0);
  let sy = select(-1.0, 1.0, normal.y >= 0.0);
  let sz = select(-1.0, 1.0, normal.z >= 0.0);
  let uv_x = vec2<f32>(sx * q.y, -q.z);
  let uv_y = vec2<f32>(-sy * q.x, -q.z);
  let uv_z = vec2<f32>(sz * q.x, -q.y);
  var t: Triplanar;
  t.uv = array<vec2<f32>, 3>(uv_x, uv_y, uv_z);
  t.dx = array<vec2<f32>, 3>(dpdx(uv_x), dpdx(uv_y), dpdx(uv_z));
  t.dy = array<vec2<f32>, 3>(dpdy(uv_x), dpdy(uv_y), dpdy(uv_z));
  t.sinal = vec3<f32>(sx, sy, sz);
  return t;
}

struct AmostrasEixos {
  x: vec4<f32>,
  y: vec4<f32>,
  z: vec4<f32>,
};

// Uma camada de um array amostrada nos três eixos.
fn amostrar_eixos(tex: texture_2d_array<f32>, camada: u32, t: Triplanar) -> AmostrasEixos {
  var r: AmostrasEixos;
  r.x = amostrar_camada(tex, camada, t.uv[0], t.dx[0], t.dy[0]);
  r.y = amostrar_camada(tex, camada, t.uv[1], t.dx[1], t.dy[1]);
  r.z = amostrar_camada(tex, camada, t.uv[2], t.dx[2], t.dy[2]);
  return r;
}

// Whiteout (Golus) num eixo: `t` é a normal do mapa em espaço tangente (xy no plano, z ao longo da
// face) e `nf` é a normal base nesse referencial (tangente, binormal, eixo). Soma os xy e multiplica
// o z, então a inclinação da face base é mantida.
fn whiteout(t: vec3<f32>, nf: vec3<f32>, tangente: vec3<f32>, binormal: vec3<f32>, eixo: vec3<f32>) -> vec3<f32> {
  let c = normalize(vec3<f32>(t.xy + nf.xy, nf.z * t.z));
  return tangente * c.x + binormal * c.y + eixo * c.z;
}

// Normal de mapa para o mundo, com a orientação de tangente de triplanar_de: eixo X (T = sx*Y,
// B = Z), eixo Y (T = -sy*X, B = Z) e eixo Z (T = sz*X, B = Y). Os pesos são os triplanares |n|^4.
fn normal_de_mapa(mapa: AmostrasEixos, t: Triplanar, normal: vec3<f32>, peso: vec3<f32>) -> vec3<f32> {
  let sx = t.sinal.x;
  let sy = t.sinal.y;
  let sz = t.sinal.z;
  let tx = mapa.x.rgb * 2.0 - vec3<f32>(1.0);
  let ty = mapa.y.rgb * 2.0 - vec3<f32>(1.0);
  let tz = mapa.z.rgb * 2.0 - vec3<f32>(1.0);
  let wx = whiteout(
    tx,
    vec3<f32>(sx * normal.y, normal.z, sx * normal.x),
    vec3<f32>(0.0, sx, 0.0),
    vec3<f32>(0.0, 0.0, 1.0),
    vec3<f32>(sx, 0.0, 0.0)
  );
  let wy = whiteout(
    ty,
    vec3<f32>(-sy * normal.x, normal.z, sy * normal.y),
    vec3<f32>(-sy, 0.0, 0.0),
    vec3<f32>(0.0, 0.0, 1.0),
    vec3<f32>(0.0, sy, 0.0)
  );
  let wz = whiteout(
    tz,
    vec3<f32>(sz * normal.x, normal.y, sz * normal.z),
    vec3<f32>(sz, 0.0, 0.0),
    vec3<f32>(0.0, 1.0, 0.0),
    vec3<f32>(0.0, 0.0, sz)
  );
  return normalize(wx * peso.x + wy * peso.y + wz * peso.z);
}

@fragment
fn fs_principal(e: Saida) -> @location(0) vec4<f32> {
  let visao = normalize(u.camera.xyz - e.mundo);

  var normal = e.normal;
  if (length(normal) < 1.0e-6) {
    normal = vec3<f32>(0.0, 0.0, 1.0);
  }
  normal = normalize(normal);
  // Malhas de arquitetura podem ter enrolamento inconsistente; sombrear os dois lados
  // evita paredes pretas sem exigir culling.
  if (dot(normal, visao) < 0.0) {
    normal = -normal;
  }

  // Coordenadas triplanares e derivadas de textura, antes de qualquer ramo por material: dpdx e
  // dpdy precisam de fluxo uniforme, e aqui ele ainda é uniforme (não há return antes).
  let escala = max(e.escala, ESCALA_MINIMA);
  let tri = triplanar_de(e.mundo, normal, escala);
  let peso = pesos_triplanares(normal);
  let tex = e.texturas;

  // Superfície procedural (tipo 1 a 5 e 7): albedo, rugosidade e, nos tipos com relevo, a normal.
  // Liso (0) e vidro (6) mantêm a cor e a rugosidade do material, como antes. Com textura, o
  // procedural continua calculado (a rugosidade dele vale quando não há mapa de rugosidade), e a
  // relevo procedural só entra quando não há mapa de normal.
  let tipo = i32(floor(e.tipo + 0.5));
  let cor_material = max(e.cor, vec3<f32>(0.0));
  var base = cor_material;
  var rugosidade = clamp(e.rugosidade, 0.04, 1.0);
  var metalico = clamp(e.metalico, 0.0, 1.0);
  if (tipo != 0 && tipo != 6) {
    let sup = superficie_triplanar(tipo, e.mundo, normal, cor_material, escala);
    base = sup.cor;
    rugosidade = clamp(sup.rugosidade, 0.04, 1.0);
    if ((tipo == 1 || tipo == 3 || tipo == 7) && tex.y == SEM_TEXTURA) {
      normal = normal_com_relevo(tipo, e.mundo, normal, cor_material, escala);
    }
  }
  // Albedo de textura: a cor do material multiplica a textura normalizada pela média linear dela,
  // textura / média (média por canal, calculada na CPU). A textura varia em torno da cor do
  // material sem escurecê-la. A amostra é sRGB codificada: decodifica por canal antes de misturar.
  if (tex.x != SEM_TEXTURA) {
    let a = amostrar_eixos(texturas_albedo, tex.x, tri);
    let textura = linear_de_srgb(a.x.rgb) * peso.x
      + linear_de_srgb(a.y.rgb) * peso.y
      + linear_de_srgb(a.z.rgb) * peso.z;
    base = cor_material * (textura / max(e.media_albedo, vec3<f32>(1.0e-4)));
  }
  // Mapa de normal: whiteout triplanar sobre a normal base (o relevo procedural já não entra aqui).
  if (tex.y != SEM_TEXTURA) {
    normal = normal_de_mapa(amostrar_eixos(texturas_normal, tex.y, tri), tri, normal, peso);
  }
  // Rugosidade e metálico vêm do canal R da textura, quando o material tem o mapa.
  if (tex.z != SEM_TEXTURA) {
    let r = amostrar_eixos(texturas_rugosidade, tex.z, tri);
    rugosidade = clamp(r.x.r * peso.x + r.y.r * peso.y + r.z.r * peso.z, 0.04, 1.0);
  }
  if (tex.w != SEM_TEXTURA) {
    let m = amostrar_eixos(texturas_metalico, tex.w, tri);
    metalico = clamp(m.x.r * peso.x + m.y.r * peso.y + m.z.r * peso.z, 0.0, 1.0);
  }

  let luz = normalize(u.sol.xyz);
  let intensidade = u.sol.w;
  let ndl = max(dot(normal, luz), 0.0);
  let ndv = max(dot(normal, visao), 1.0e-4);
  let alfa = rugosidade * rugosidade;
  let f0 = mix(vec3<f32>(0.04), base, vec3<f32>(metalico));

  let meio = normalize(visao + luz);
  let ndh = max(dot(normal, meio), 0.0);
  let vdh = max(dot(visao, meio), 1.0e-4);
  let d = distribuicao_ggx(ndh, alfa);
  let g = geometria_smith(ndv, ndl, alfa);
  let f = fresnel_schlick(vdh, f0);
  let especular = (d * g * f) / max(4.0 * ndv * ndl, 1.0e-4);

  let sombra = fator_sombra(e.mundo, normal, ndl);
  let kd = (vec3<f32>(1.0) - f) * (1.0 - metalico);
  let direto = (kd * base / PI + especular) * u.sol_cor.rgb * intensidade * ndl * sombra;

  // Ambiente por iluminação baseada em céu: irradiância SH9 para o difuso (E/π é a radiância
  // difusa de Lambert); no especular, a radiância refletida do céu misturada com a irradiância
  // pela rugosidade. A força (u.parametros.y, 0.55) é a mesma escala de compatibilidade.
  let irradiancia = irradiancia_sh(normal) / PI;
  let difuso_ambiente = irradiancia * base * (1.0 - metalico) * u.parametros.y;
  let radiancia_refletida = radiancia_ceu(reflect(-visao, normal));
  let refletido = mix(radiancia_refletida, irradiancia, rugosidade);
  let especular_ambiente = refletido * f0 * (0.1 + 0.4 * (1.0 - rugosidade)) * u.parametros.y;

  // Oclusão ambiente (SSAO) só no termo ambiente: a luz direta do Sol e a emissão ficam intactas.
  // O pixel da região é o próprio índice da textura de oclusão, que tem o tamanho da região.
  let oclusao = textureLoad(oclusao_ambiente, vec2<i32>(e.clip.xy), 0).r;
  let ambiente = (difuso_ambiente + especular_ambiente) * oclusao;
  let cor = direto + ambiente + e.emissivo;
  // Névoa de distância: funde a cor linear com a do horizonte antes do tone mapping, para que a
  // borda do chão de render some contra o céu de fundo (ver fs_ceu).
  let hd = normalize(e.mundo.xy - u.camera.xy + vec2<f32>(1.0e-7, 0.0));
  let cor_horizonte = radiancia_ceu(vec3<f32>(hd, 0.0));
  let nevoa = fator_nevoa(length(e.mundo - u.camera.xyz));
  let tonemapeado = tonemapear(mix(cor, cor_horizonte, nevoa) * u.balanco.rgb * u.parametros.x);
  return vec4<f32>(linear_para_srgb(tonemapeado), 1.0);
}

// ---- Céu de fundo: passe em tela cheia, antes do opaco. Cada pixel recebe a radiância do céu na
// direção do raio que passa por ele (inversa de view_proj). Abaixo do horizonte o chão acaba, então
// o céu mostra a cor do horizonte (z limitado a 0), e não o chão escuro de radiancia_ceu.
struct SaidaCeu {
  @builtin(position) clip: vec4<f32>,
  @location(0) ndc: vec2<f32>,
};

@vertex
fn vs_ceu(@builtin(vertex_index) indice: u32) -> SaidaCeu {
  let x = f32((indice << 1u) & 2u);
  let y = f32(indice & 2u);
  var s: SaidaCeu;
  s.ndc = vec2<f32>(x * 2.0 - 1.0, 1.0 - y * 2.0);
  s.clip = vec4<f32>(s.ndc, 0.0, 1.0);
  return s;
}

@fragment
fn fs_ceu(e: SaidaCeu) -> @location(0) vec4<f32> {
  let p = u.inversa_vp * vec4<f32>(e.ndc, 0.5, 1.0);
  let dir = normalize(p.xyz / p.w - u.camera.xyz);
  let d = normalize(vec3<f32>(dir.xy, max(dir.z, 0.0)) + vec3<f32>(0.0, 0.0, 1.0e-6));
  var cor = radiancia_ceu(d);
  let sol_dir = normalize(u.sol.xyz);
  let intensidade = u.sol.w;
  if (intensidade > 0.0 && sol_dir.z > 0.0) {
    cor = cor + vec3<f32>(HALO_SOL * intensidade * pow(max(dot(d, sol_dir), 0.0), HALO_SOL_EXPOENTE));
  }
  let tonemapeado = tonemapear(cor * u.balanco.rgb * u.parametros.x);
  return vec4<f32>(linear_para_srgb(tonemapeado), 1.0);
}

// ---- Vidro (passe próprio, depois do opaco) ----
// Vidro = tipo 6 ou opacidade < 1. O passe opaco não desenha esses triângulos; este passe lê a cor
// opaca da janela (cor_tela, copiada antes; a janela é a região mais a margem da refração) e mistura:
//   saída = fundo_refratado * tint * (1 - opacidade) * (1 - F) + reflexo_do_céu * F + especular_do_Sol
// F é o Fresnel de Schlick com F0 = 0,04 (dielétrico, ior 1,5). A refração desloca o pixel de tela
// por normal_de_visão.xy * FRACAO_REFRACAO * altura da imagem inteira, então o deslocamento é o
// mesmo em todos os tiles: a janela tem margem de pelo menos o deslocamento máximo (motor.rs),
// e a leitura só é limitada pelas bordas da imagem, como na imagem inteira.
// Sem SSAO e sem sombra própria no vidro (é transparente; ver motor.rs). O reflexo é tonemapeado
// sozinho, porque o fundo já vem tonemapeado da cópia.
const F0_VIDRO: f32 = 0.04;
// Deslocamento máximo da refração, em fração da altura da imagem (0,02 de 360 px é ~7 px).
const FRACAO_REFRACAO: f32 = 0.02;

// Fresnel de Schlick escalar: F0 + (1 - F0)(1 - cos)^5. Espelhado em cor.rs::schlick_escalar.
fn schlick_escalar(cos_theta: f32, f0: f32) -> f32 {
  let x = clamp(1.0 - cos_theta, 0.0, 1.0);
  return f0 + (1.0 - f0) * x * x * x * x * x;
}

// sRGB para linear (curva exata), canal a canal.
fn linear_de_srgb(c: vec3<f32>) -> vec3<f32> {
  let baixo = c / 12.92;
  let alto = pow((c + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4));
  return select(alto, baixo, c <= vec3<f32>(0.04045));
}

@fragment
fn fs_vidro(e: Saida) -> @location(0) vec4<f32> {
  let visao = normalize(u.camera.xyz - e.mundo);
  var normal = e.normal;
  if (length(normal) < 1.0e-6) {
    normal = vec3<f32>(0.0, 0.0, 1.0);
  }
  normal = normalize(normal);
  if (dot(normal, visao) < 0.0) {
    normal = -normal;
  }

  // Refração: deslocamento de UV de tela pela normal de visão, limitado à cópia da região.
  let normal_visao = (camera_extra.visao * vec4<f32>(normal, 0.0)).xyz;
  let deslocamento = normal_visao.xy * FRACAO_REFRACAO * u.resolucao.y;
  let dimensao = vec2<i32>(textureDimensions(cor_tela));
  let pixel = vec2<i32>(floor(e.clip.xy + deslocamento));
  let fundo = linear_de_srgb(
    textureLoad(cor_tela, clamp(pixel, vec2<i32>(0), dimensao - vec2<i32>(1)), 0).rgb
  );

  // Transmissão = 1 - opacidade; a cor base do material é o tint absorvido.
  let transmissao = 1.0 - clamp(e.opacidade, 0.0, 1.0);
  let tint = max(e.cor, vec3<f32>(0.0));

  // Fresnel do céu: reflexo pela direção refletida e brilho do Sol com GGX de rugosidade baixa.
  let ndv = max(dot(normal, visao), 1.0e-4);
  let fresnel = schlick_escalar(ndv, F0_VIDRO);
  let luz = normalize(u.sol.xyz);
  let intensidade = u.sol.w;
  let ndl = max(dot(normal, luz), 0.0);
  let rugosidade = clamp(e.rugosidade, 0.04, 1.0);
  let alfa = rugosidade * rugosidade;
  let meio = normalize(visao + luz);
  let ndh = max(dot(normal, meio), 0.0);
  let vdh = max(dot(visao, meio), 1.0e-4);
  let d = distribuicao_ggx(ndh, alfa);
  let g = geometria_smith(ndv, ndl, alfa);
  let f_sol = fresnel_schlick(vdh, vec3<f32>(F0_VIDRO)).x;
  let especular_sol = (d * g * f_sol) / max(4.0 * ndv * ndl, 1.0e-4) * u.sol_cor.rgb * intensidade * ndl;
  let refletido = radiancia_ceu(reflect(-visao, normal)) * fresnel + especular_sol + e.emissivo;

  let transmitido = fundo * tint * transmissao * (1.0 - fresnel);
  let cor = transmitido + tonemapear(refletido * u.balanco.rgb * u.parametros.x);
  return vec4<f32>(linear_para_srgb(clamp(cor, vec3<f32>(0.0), vec3<f32>(1.0))), 1.0);
}

// ---- Oclusão ambiente em espaço de tela (SSAO) ----
// Pré-passe (fs_normais, com vs_principal) -> SSAO (fs_ssao) -> desfoque (fs_desfoque).
// Os três usam a janela da região com margem; as coordenadas globais são alvo.xy + pixel do passe,
// e cada textura tem a sua origem em gbuffer_origem / ao_origem. Ver ssao.rs.

// Triângulo que cobre a tela inteira (sem buffer de vértices).
@vertex
fn vs_tela_cheia(@builtin(vertex_index) indice: u32) -> @builtin(position) vec4<f32> {
  let x = f32((indice << 1u) & 2u);
  let y = f32(indice & 2u);
  return vec4<f32>(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
}

// Normal de visão (virada para a câmera) e profundidade linear em metros.
@fragment
fn fs_normais(e: Saida) -> @location(0) vec4<f32> {
  var normal = e.normal;
  if (length(normal) < 1.0e-6) {
    normal = vec3<f32>(0.0, 0.0, 1.0);
  }
  let normal_visao = normalize((camera_extra.visao * vec4<f32>(normalize(normal), 0.0)).xyz);
  let posicao = (camera_extra.visao * vec4<f32>(e.mundo, 1.0)).xyz;
  var n = normal_visao;
  if (dot(n, -posicao) < 0.0) {
    n = -n;
  }
  return vec4<f32>(n, -posicao.z);
}

// Posição de visão de um pixel global com profundidade linear conhecida: a inversa da projeção
// dá um ponto do raio do pixel, e a escala leva esse raio até a profundidade dada.
fn posicao_de_visao(g: vec2<f32>, profundidade: f32) -> vec3<f32> {
  let largura = camera_extra.imagem.x;
  let altura = camera_extra.imagem.y;
  let ndc = vec2<f32>((g.x + 0.5) / largura * 2.0 - 1.0, 1.0 - (g.y + 0.5) / altura * 2.0);
  let ponto = camera_extra.projecao_inversa * vec4<f32>(ndc, 0.5, 1.0);
  let direcao = ponto.xyz / ponto.w;
  return direcao * (profundidade / -direcao.z);
}

// Ruído de Bayer 4x4 em [0, 1), indexado pelo pixel global: repete a cada 4 pixels e é igual
// em todos os tiles.
fn ruido_bayer(g: vec2<i32>) -> f32 {
  var bayer = array<f32, 16>(
    0.0, 8.0, 2.0, 10.0,
    12.0, 4.0, 14.0, 6.0,
    3.0, 11.0, 1.0, 9.0,
    15.0, 7.0, 13.0, 5.0
  );
  let indice = (g.y & 3) * 4 + (g.x & 3);
  return bayer[indice] / 16.0;
}

// Oclusão de 1 canal: 1 - média de amostras ocluídas, com range check. Pixels sem geometria
// (w = 0) e pixels fora da textura do pré-passe ficam sem oclusão.
@fragment
fn fs_ssao(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  let g = vec2<i32>(camera_extra.alvo.xy) + vec2<i32>(pos.xy);
  let origem = vec2<i32>(camera_extra.gbuffer_origem.xy);
  let dim = vec2<i32>(textureDimensions(gbuffer));
  let local = g - origem;
  if (local.x < 0 || local.y < 0 || local.x >= dim.x || local.y >= dim.y) {
    return vec4<f32>(1.0, 0.0, 0.0, 1.0);
  }
  let central = textureLoad(gbuffer, local, 0);
  if (central.w <= 0.0) {
    return vec4<f32>(1.0, 0.0, 0.0, 1.0);
  }

  let n = normalize(central.xyz);
  let p = posicao_de_visao(vec2<f32>(g), central.w);
  let raio = camera_extra.ssao.x;
  let margem = i32(camera_extra.ssao.y);
  let vies = camera_extra.ssao.z;

  // Base tangente: o vetor aleatório (rotacionado por Bayer) é projetado no plano da superfície.
  let angulo = ruido_bayer(g) * 6.283185307;
  var t = vec3<f32>(cos(angulo), sin(angulo), 0.0);
  t = t - n * dot(t, n);
  if (dot(t, t) < 1.0e-8) {
    t = cross(n, vec3<f32>(0.0, 1.0, 0.0));
    if (dot(t, t) < 1.0e-8) {
      t = cross(n, vec3<f32>(1.0, 0.0, 0.0));
    }
  }
  t = normalize(t);
  let b = cross(n, t);

  var ocluidas = 0.0;
  for (var i = 0u; i < AMOSTRAS_AO; i = i + 1u) {
    let k = camera_extra.kernel[i].xyz;
    let amostra = p + (t * k.x + b * k.y + n * k.z) * raio;
    let clip = camera_extra.projecao * vec4<f32>(amostra, 1.0);
    if (clip.w <= 1.0e-6) {
      continue;
    }
    let ndc = clip.xy / clip.w;
    let largura = camera_extra.imagem.x;
    let altura = camera_extra.imagem.y;
    let s = vec2<i32>(floor(vec2<f32>((ndc.x * 0.5 + 0.5) * largura, (0.5 - ndc.y * 0.5) * altura)));
    // Alcance limitado pela margem: fora dela a amostra não tem dados de forma igual em todos os tiles.
    let desvio = abs(s - g);
    if (max(desvio.x, desvio.y) > margem) {
      continue;
    }
    let local_s = s - origem;
    if (local_s.x < 0 || local_s.y < 0 || local_s.x >= dim.x || local_s.y >= dim.y) {
      continue;
    }
    let cena = textureLoad(gbuffer, local_s, 0);
    if (cena.w <= 0.0) {
      continue;
    }
    // Oclusor: a superfície visível nesse pixel está à frente da amostra (profundidade menor).
    let profundidade_amostra = -amostra.z;
    let faixa = smoothstep(0.0, 1.0, raio / max(abs(central.w - cena.w), 1.0e-4));
    if (profundidade_amostra > cena.w + vies) {
      ocluidas = ocluidas + faixa;
    }
  }
  let ao = 1.0 - ocluidas / f32(AMOSTRAS_AO);
  return vec4<f32>(ao, 0.0, 0.0, 1.0);
}

// Desfoque bilateral 4x4 sobre a oclusão bruta: pesos gaussianos pela diferença de profundidade,
// para não misturar oclusão de uma parede com a de um objeto à frente ou atrás dela.
@fragment
fn fs_desfoque(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  let g = vec2<i32>(camera_extra.alvo.xy) + vec2<i32>(pos.xy);
  let origem_g = vec2<i32>(camera_extra.gbuffer_origem.xy);
  let origem_ao = vec2<i32>(camera_extra.ao_origem.xy);
  let dim_g = vec2<i32>(textureDimensions(gbuffer));
  let dim_ao = vec2<i32>(textureDimensions(oclusao_bruta));
  let local_g = g - origem_g;
  let local_ao = g - origem_ao;
  let prof_central = textureLoad(gbuffer, clamp(local_g, vec2<i32>(0), dim_g - vec2<i32>(1)), 0).w;
  if (prof_central <= 0.0) {
    return vec4<f32>(1.0, 0.0, 0.0, 1.0);
  }
  let tolerancia = 0.02 + 0.03 * prof_central;

  var soma = 0.0;
  var peso_total = 0.0;
  for (var dy = -2; dy < 2; dy = dy + 1) {
    for (var dx = -2; dx < 2; dx = dx + 1) {
      let d = vec2<i32>(dx, dy);
      let prof = textureLoad(gbuffer, clamp(local_g + d, vec2<i32>(0), dim_g - vec2<i32>(1)), 0).w;
      if (prof <= 0.0) {
        continue;
      }
      let ao = textureLoad(oclusao_bruta, clamp(local_ao + d, vec2<i32>(0), dim_ao - vec2<i32>(1)), 0).r;
      let dz = (prof - prof_central) / tolerancia;
      let peso = exp(-dz * dz);
      soma = soma + peso * ao;
      peso_total = peso_total + peso;
    }
  }
  return vec4<f32>(soma / max(peso_total, 1.0e-6), 0.0, 0.0, 1.0);
}
