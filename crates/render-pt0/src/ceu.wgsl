// Céu do protótipo (crates/render-pt0). Porta de render-engine/src/shader.wgsl (radiancia_ceu e
// o halo do Sol do fundo) e de src/ceu.rs. Concatenado antes de pt0.wgsl; também compilado sozinho
// pelo teste tests/ceu_wgsl.rs, que compara com a versão Rust nas mesmas direções.
// As constantes são espelhos de shader.wgsl; o teste constantes_batem_com_o_motor (ceu.rs) lê de lá.

const CEU_HORIZONTE: vec3<f32> = vec3<f32>(0.488, 0.616, 0.80);
const CEU_ZENITE: vec3<f32> = vec3<f32>(0.20, 0.40, 0.82);
const CEU_CHAO: vec3<f32> = vec3<f32>(0.18, 0.16, 0.13);
const COS_DISCO_SOLAR: f32 = 0.9945219;
const FATOR_DISCO_SOLAR: f32 = 2.0;
const HALO_SOL: f32 = 0.25;
const HALO_SOL_EXPOENTE: f32 = 96.0;

// Radiância do céu numa direção unitária. `com_disco` liga o disco solar (só no raio primário).
fn radiancia_ceu(dir: vec3<f32>, sol_bruto: vec3<f32>, intensidade: f32, com_disco: bool) -> vec3<f32> {
  var cor: vec3<f32>;
  if (dir.z >= 0.0) {
    cor = mix(CEU_HORIZONTE, CEU_ZENITE, pow(clamp(dir.z, 0.0, 1.0), 0.6));
  } else {
    let s = clamp(-dir.z / 0.25, 0.0, 1.0);
    cor = mix(CEU_HORIZONTE, CEU_CHAO, s * s * (3.0 - 2.0 * s));
  }
  let sol_dir = normalize(sol_bruto);
  if (com_disco && intensidade > 0.0 && sol_dir.z > 0.0 && dot(dir, sol_dir) >= COS_DISCO_SOLAR) {
    cor = cor + vec3<f32>(intensidade * FATOR_DISCO_SOLAR);
  }
  return cor;
}

// Halo do Sol: só no céu de fundo do raio primário (fs_ceu do motor).
fn halo_sol(dir: vec3<f32>, sol_bruto: vec3<f32>, intensidade: f32) -> f32 {
  let sol_dir = normalize(sol_bruto);
  if (intensidade > 0.0 && sol_dir.z > 0.0) {
    return HALO_SOL * intensidade * pow(max(dot(dir, sol_dir), 0.0), HALO_SOL_EXPOENTE);
  }
  return 0.0;
}

// Irradiância difusa do céu na normal n a partir dos 9 coeficientes já convoluídos (layout de
// `ceu::para_buffer`): E(n) = soma de E_k * Y_k(n), com as bases reais de SH de ordem 2.
fn irradiancia_em(e: array<vec4<f32>, 9>, n: vec3<f32>) -> vec3<f32> {
  let x = n.x;
  let y = n.y;
  let z = n.z;
  var r = e[0].rgb * 0.282095;
  r = r + e[1].rgb * (0.488603 * y);
  r = r + e[2].rgb * (0.488603 * z);
  r = r + e[3].rgb * (0.488603 * x);
  r = r + e[4].rgb * (1.092548 * x * y);
  r = r + e[5].rgb * (1.092548 * y * z);
  r = r + e[6].rgb * (0.315392 * (3.0 * z * z - 1.0));
  r = r + e[7].rgb * (1.092548 * x * z);
  r = r + e[8].rgb * (0.546274 * (x * x - y * y));
  return r;
}
