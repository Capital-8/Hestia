//! Céu do protótipo: porta em Rust de `render-engine/src/shader.wgsl` (`radiancia_ceu` e o halo do
//! Sol do fundo), na mesma forma usada pelo WGSL de `ceu.wgsl`.
//!
//! Fonte: a função do motor é `radiancia_ceu` em `shader.wgsl` (não `ceu.rs::radiancia`, que é
//! a versão de CPU com outras cores de chão). Mesmo horizonte, mesmo zênite, mesmo disco e mesmo
//! halo. O teste `tests/ceu_wgsl.rs` compara o WGSL com esta função em direções fixas; o teste
//! `constantes_batem_com_o_motor` abaixo compara as constantes com `shader.wgsl`.
//!
//! Irradiância: o céu do rebote e o do ponto primário (modo 1) usam a irradiância difusa SH9 do
//! céu **sem disco e sem halo**. Motivo do disco fora: o sol já entra por amostragem explícita
//! (sombra por raio) em cada ponto; contar o disco também no céu somaria a mesma luz duas vezes.

/// Horizonte: `CEU_PADRAO` clareado 20% em direção ao branco (`shader.wgsl`).
pub const CEU_HORIZONTE: [f32; 3] = [0.488, 0.616, 0.80];
/// Zênite.
pub const CEU_ZENITE: [f32; 3] = [0.20, 0.40, 0.82];
/// Chão abaixo do horizonte (`CHAO_AMBIENTE`).
pub const CEU_CHAO: [f32; 3] = [0.18, 0.16, 0.13];
/// cos(6°): raio angular do disco solar.
pub const COS_DISCO_SOLAR: f32 = 0.9945219;
/// Radiância do disco, em múltiplos da intensidade do Sol.
pub const FATOR_DISCO_SOLAR: f32 = 2.0;
/// Halo do Sol, só no céu de fundo (`HALO_SOL` em `shader.wgsl`).
pub const HALO_SOL: f32 = 0.25;
/// Expoente do halo (`cos^n`).
pub const HALO_SOL_EXPOENTE: f32 = 96.0;

/// Amostras de Fibonacci da projeção SH9 (mesmo número do motor).
pub const AMOSTRAS_SH: usize = 4096;
/// Ângulo áureo, passo da espiral de Fibonacci.
const ANGULO_AUREO: f64 = 2.399_963_229_728_653;

fn misturar(a: [f32; 3], b: [f32; 3], t: f32) -> [f32; 3] {
    [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
    ]
}

fn normalizar(v: [f32; 3]) -> [f32; 3] {
    let c = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    [v[0] / c, v[1] / c, v[2] / c]
}

fn produto(a: [f32; 3], b: [f32; 3]) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/// Radiância do céu numa direção unitária `dir` (Z para cima), como `radiancia_ceu` do motor.
///
/// `sol_dir` é a direção para o Sol (normalizada aqui). `com_disco` liga o disco solar.
pub fn radiancia(dir: [f32; 3], sol_dir: [f32; 3], intensidade: f32, com_disco: bool) -> [f32; 3] {
    let z = dir[2];
    let mut cor = if z >= 0.0 {
        misturar(CEU_HORIZONTE, CEU_ZENITE, z.clamp(0.0, 1.0).powf(0.6))
    } else {
        let s = (-z / 0.25).clamp(0.0, 1.0);
        misturar(CEU_HORIZONTE, CEU_CHAO, s * s * (3.0 - 2.0 * s))
    };
    let sol = normalizar(sol_dir);
    if com_disco && intensidade > 0.0 && sol[2] > 0.0 && produto(dir, sol) >= COS_DISCO_SOLAR {
        let brilho = intensidade * FATOR_DISCO_SOLAR;
        cor = [cor[0] + brilho, cor[1] + brilho, cor[2] + brilho];
    }
    cor
}

/// Halo do Sol no céu de fundo (`fs_ceu` do motor). Vale só para o ponto primário que não acerta.
pub fn halo_sol(dir: [f32; 3], sol_dir: [f32; 3], intensidade: f32) -> f32 {
    let sol = normalizar(sol_dir);
    if intensidade > 0.0 && sol[2] > 0.0 {
        HALO_SOL * intensidade * produto(dir, sol).max(0.0).powf(HALO_SOL_EXPOENTE)
    } else {
        0.0
    }
}

/// Base real de SH de ordem 2 (9 termos), na ordem do motor: 00, 1-1, 10, 11, 2-2, 2-1, 20, 21, 22.
pub fn base_sh(d: [f32; 3]) -> [f32; 9] {
    let (x, y, z) = (d[0], d[1], d[2]);
    [
        0.282_095,
        0.488_603 * y,
        0.488_603 * z,
        0.488_603 * x,
        1.092_548 * x * y,
        1.092_548 * y * z,
        0.315_392 * (3.0 * z * z - 1.0),
        1.092_548 * x * z,
        0.546_274 * (x * x - y * y),
    ]
}

/// Irradiância difusa em `n` a partir dos 9 coeficientes já convoluídos: E(n) = Σ E_k · Y_k(n).
pub fn irradiancia_em(coeficientes: &[[f32; 3]; 9], n: [f32; 3]) -> [f32; 3] {
    let base = base_sh(n);
    let mut e = [0.0f32; 3];
    for (c, valor) in coeficientes.iter().zip(base) {
        for k in 0..3 {
            e[k] += c[k] * valor;
        }
    }
    e
}

/// Projeção SH9 de uma função de radiância (`f` recebe direções unitárias), com os fatores de
/// convolução A0 = π, A1 = 2π/3, A2 = π/4. Mesma conta de `ceu.rs::sh9_irradiancia_de`.
pub fn irradiancia_sh_de<F: Fn([f32; 3]) -> [f32; 3]>(f: F) -> [[f32; 3]; 9] {
    let n = AMOSTRAS_SH;
    let mut projecao = [[0.0f64; 3]; 9];
    for i in 0..n {
        let z = 1.0 - (2.0 * i as f64 + 1.0) / n as f64;
        let r = (1.0 - z * z).max(0.0).sqrt();
        let phi = i as f64 * ANGULO_AUREO;
        let dir = [r * phi.cos(), r * phi.sin(), z];
        let valor = f([dir[0] as f32, dir[1] as f32, dir[2] as f32]);
        let base = base_sh([dir[0] as f32, dir[1] as f32, dir[2] as f32]);
        for k in 0..9 {
            for c in 0..3 {
                projecao[k][c] += f64::from(valor[c]) * f64::from(base[k]);
            }
        }
    }
    let peso = 4.0 * std::f64::consts::PI / n as f64;
    let pi = std::f64::consts::PI;
    let fator = [
        pi,
        2.0 * pi / 3.0,
        2.0 * pi / 3.0,
        2.0 * pi / 3.0,
        pi / 4.0,
        pi / 4.0,
        pi / 4.0,
        pi / 4.0,
        pi / 4.0,
    ];
    let mut saida = [[0.0f32; 3]; 9];
    for k in 0..9 {
        for c in 0..3 {
            saida[k][c] = (projecao[k][c] * peso * fator[k]) as f32;
        }
    }
    saida
}

/// Irradiância SH9 do céu do protótipo: sem disco e sem halo. Com `fundo` explícito, o céu é a
/// cor uniforme e a irradiância é π·L (só o termo de ordem 0).
pub fn irradiancia_sh(fundo: Option<[f32; 3]>) -> [[f32; 3]; 9] {
    match fundo {
        Some(cor) => irradiancia_sh_de(|_| cor),
        None => irradiancia_sh_de(|dir| radiancia(dir, [0.0, 0.0, 1.0], 0.0, false)),
    }
}

/// Converte os coeficientes RGB para o layout do uniforme (`array<vec4<f32>, 9>`, w = 0).
pub fn para_buffer(coeficientes: &[[f32; 3]; 9]) -> [[f32; 4]; 9] {
    coeficientes.map(|c| [c[0], c[1], c[2], 0.0])
}

#[cfg(test)]
mod testes {
    use super::*;

    fn unitario(d: [f32; 3]) -> [f32; 3] {
        normalizar(d)
    }

    fn lum(c: [f32; 3]) -> f32 {
        crate::luminancia(c)
    }

    #[test]
    fn constantes_batem_com_o_motor() {
        const MOTOR: &str = include_str!("../../render-engine/src/shader.wgsl");
        let valor = |nome: &str| -> f32 {
            let trecho = format!("const {nome}: f32 = ");
            let inicio = MOTOR.find(&trecho).expect("constante no motor") + trecho.len();
            let fim = inicio + MOTOR[inicio..].find(';').expect("fim da constante");
            MOTOR[inicio..fim].trim().parse().expect("número")
        };
        assert_eq!(valor("COS_DISCO_SOLAR"), COS_DISCO_SOLAR);
        assert_eq!(valor("FATOR_DISCO_SOLAR"), FATOR_DISCO_SOLAR);
        assert_eq!(valor("HALO_SOL"), HALO_SOL);
        assert_eq!(valor("HALO_SOL_EXPOENTE"), HALO_SOL_EXPOENTE);
        let vetor = |nome: &str| -> [f32; 3] {
            let trecho = format!("const {nome}: vec3<f32> = vec3<f32>(");
            let inicio = MOTOR.find(&trecho).expect("vetor no motor") + trecho.len();
            let fim = inicio + MOTOR[inicio..].find(')').expect("fim do vetor");
            let partes: Vec<f32> = MOTOR[inicio..fim].split(',').map(|p| p.trim().parse().unwrap()).collect();
            [partes[0], partes[1], partes[2]]
        };
        assert_eq!(vetor("CEU_HORIZONTE"), CEU_HORIZONTE);
        assert_eq!(vetor("CEU_ZENITE"), CEU_ZENITE);
        assert_eq!(vetor("CEU_CHAO"), CEU_CHAO);
    }

    #[test]
    fn acima_do_horizonte_nao_e_mais_escuro_que_abaixo() {
        let sol = [0.6, 0.0, 0.8];
        for angulo in [0.0f32, 0.3, 0.7, 1.2, 1.5] {
            let acima = unitario([angulo.cos(), 0.2, angulo.sin()]);
            let abaixo = [acima[0], acima[1], -acima[2]];
            assert!(lum(radiancia(acima, sol, 0.0, false)) >= lum(radiancia(abaixo, sol, 0.0, false)));
        }
    }

    #[test]
    fn disco_e_halo_so_perto_do_sol() {
        let sol = unitario([0.6, 0.0, 0.8]);
        let longe = unitario([-0.8, 0.3, 0.5]);
        assert!(lum(radiancia(sol, sol, 3.0, true)) > lum(radiancia(longe, sol, 3.0, true)) + 1.0);
        assert_eq!(radiancia(sol, sol, 3.0, false), radiancia(sol, sol, 0.0, true));
        assert!(halo_sol(sol, sol, 3.0) > halo_sol(longe, sol, 3.0));
        assert_eq!(halo_sol(sol, [0.6, 0.0, -0.8], 3.0), 0.0);
    }

    #[test]
    fn sh9_de_radiancia_uniforme_tem_so_o_termo_l0() {
        let constante = [0.5f32, 0.4, 0.3];
        let coef = irradiancia_sh_de(|_| constante);
        // E(n) = π·L para céu uniforme; o termo de ordem 0 vale π·L/Y00.
        for n in [[0.0, 0.0, 1.0], [0.6, 0.0, 0.8], [1.0, 0.0, 0.0]] {
            let e = irradiancia_em(&coef, n);
            for c in 0..3 {
                assert!((e[c] - std::f32::consts::PI * constante[c]).abs() < 2.0e-3, "canal {c}: {}", e[c]);
            }
        }
    }

    #[test]
    fn irradiancia_sem_disco_bate_com_integracao_direta_na_face_horizontal() {
        // E = ∫ L(ω) cos θ dω sobre o hemisfério de cima, com Fibonacci de 400 mil pontos.
        let coef = irradiancia_sh(None);
        let n = 400_000usize;
        let mut soma = [0.0f64; 3];
        for i in 0..n {
            let z = (i as f64 + 0.5) / n as f64;
            let r = (1.0 - z * z).sqrt();
            let phi = i as f64 * ANGULO_AUREO;
            let dir = [(r * phi.cos()) as f32, (r * phi.sin()) as f32, z as f32];
            let l = radiancia(dir, [0.0, 0.0, 1.0], 0.0, false);
            for c in 0..3 {
                soma[c] += f64::from(l[c]) * z;
            }
        }
        // dω = 2π dz para o hemisfério (amostragem uniforme em z).
        let exato: Vec<f32> = soma.iter().map(|s| (s * 2.0 * std::f64::consts::PI / n as f64) as f32).collect();
        let sh = irradiancia_em(&coef, [0.0, 0.0, 1.0]);
        for c in 0..3 {
            let erro = (sh[c] - exato[c]).abs() / exato[c];
            assert!(erro < 0.03, "canal {c}: SH {} exato {} (erro {:.4})", sh[c], exato[c], erro);
        }
    }
}
