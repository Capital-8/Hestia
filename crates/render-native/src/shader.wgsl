// PBR direto do render-native: Cook-Torrance/GGX, sol direcional com mapa de sombra
// (PCF 3x3), ambiente hemisférico, tone mapping ACES e codificação sRGB.
//
// Convenções:metros, Z para cima, normais de face; a conversão do recorte WebGL para
// profundidade 0..1 já vem pronta em `view_proj`.

const PI: f32 = 3.141592653589793;

struct Uniformes {
  view_proj: mat4x4<f32>,
  luz_vp: mat4x4<f32>,
  camera: vec4<f32>,
  sol: vec4<f32>,
  sol_cor: vec4<f32>,
  ceu: vec4<f32>,
  chao: vec4<f32>,
  parametros: vec4<f32>,
  resolucao: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniformes;
@group(0) @binding(1) var sombra: texture_depth_2d;
@group(0) @binding(2) var comparador: sampler_comparison;

struct Entrada {
  @location(0) posicao: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) cor: vec3<f32>,
  @location(3) rugosidade: f32,
  @location(4) metalico: f32,
  @location(5) emissivo: vec3<f32>,
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
};

@vertex
fn vs_sombra(e: Entrada) -> SaidaSombra {
  var s: SaidaSombra;
  s.clip = u.luz_vp * vec4<f32>(e.posicao, 1.0);
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

fn aces(x: vec3<f32>) -> vec3<f32> {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  let numerador = x * (a * x + b);
  let denominador = x * (c * x + d) + e;
  return clamp(numerador / denominador, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn linear_para_srgb(c: vec3<f32>) -> vec3<f32> {
  let baixo = c * 12.92;
  let alto = 1.055 * pow(max(c, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.4)) - 0.055;
  return select(alto, baixo, c <= vec3<f32>(0.0031308));
}

// Sombra direcional com PCF 3x3. Devolve 1.0 fora do mapa e em superfícies iluminadas.
fn fator_sombra(mundo: vec3<f32>, normal: vec3<f32>, ndl: f32) -> f32 {
  let deslocamento = normal * (0.015 + 0.05 * (1.0 - ndl));
  let posicao = u.luz_vp * vec4<f32>(mundo + deslocamento, 1.0);
  if (posicao.w <= 0.0) {
    return 1.0;
  }
  let ndc = posicao.xyz / posicao.w;
  let uv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || ndc.z > 1.0) {
    return 1.0;
  }

  // Viés constante + dependente do ângulo, suficiente para 2048² em metros.
  let referencia = ndc.z - (0.0008 + 0.0015 * (1.0 - ndl));
  let texel = u.parametros.z;
  var soma = 0.0;
  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      let desloc = vec2<f32>(f32(x), f32(y)) * texel;
      soma = soma + textureSampleCompare(sombra, comparador, uv + desloc, referencia);
    }
  }
  return soma / 9.0;
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

  let luz = normalize(u.sol.xyz);
  let intensidade = u.sol.w;
  let ndl = max(dot(normal, luz), 0.0);
  let ndv = max(dot(normal, visao), 1.0e-4);
  let rugosidade = clamp(e.rugosidade, 0.04, 1.0);
  let alfa = rugosidade * rugosidade;
  let metalico = clamp(e.metalico, 0.0, 1.0);
  let base = max(e.cor, vec3<f32>(0.0));
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

  // Ambiente hemisférico: céu acima, luz refletida do chão abaixo.
  let ambiente = mix(u.chao.rgb, u.ceu.rgb, clamp(normal.z * 0.5 + 0.5, 0.0, 1.0))
    * u.parametros.y;
  let difuso_ambiente = ambiente * base * (1.0 - metalico);
  let especular_ambiente = ambiente * f0 * (0.1 + 0.4 * (1.0 - rugosidade));

  let cor = direto + difuso_ambiente + especular_ambiente + e.emissivo;
  let tonemapeado = aces(cor * u.parametros.x);
  return vec4<f32>(linear_para_srgb(tonemapeado), 1.0);
}
