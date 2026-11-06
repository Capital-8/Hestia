// Prova de sincronia do céu e da irradiância (só para gpu.rs::avaliar_ceu). Não entra no protótipo.
// Entradas: xyz = direção unitária, w = 1 se o disco está ligado.
// Saídas (dois blocos no mesmo buffer): [0, n) = céu (rgb) e halo (w); [n, 2n) = irradiância (rgb).

struct Prova {
  sol: vec4<f32>,
  coef: array<vec4<f32>, 9>,
};

@group(0) @binding(0) var<uniform> prova: Prova;
@group(0) @binding(1) var<storage, read> entradas: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> saidas: array<vec4<f32>>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  let n = arrayLength(&entradas);
  if (i >= n) {
    return;
  }
  let e = entradas[i];
  let cor = radiancia_ceu(e.xyz, prova.sol.xyz, prova.sol.w, e.w > 0.5);
  saidas[i] = vec4<f32>(cor, halo_sol(e.xyz, prova.sol.xyz, prova.sol.w));
  saidas[n + i] = vec4<f32>(irradiancia_em(prova.coef, e.xyz), 0.0);
}
