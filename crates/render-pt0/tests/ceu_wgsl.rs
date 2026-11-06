//! O céu e a irradiância do WGSL (`ceu.wgsl`) batem com a versão Rust (`ceu.rs`) nas mesmas
//! direções. Roda na GPU real; sem adaptador de hardware, o teste avisa e passa sem comparar.

use render_pt0::ceu;
use render_pt0::gpu::{avaliar_ceu, criar_dispositivo};

fn unitario(v: [f32; 3]) -> [f32; 3] {
    let c = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    [v[0] / c, v[1] / c, v[2] / c]
}

fn sol_teste() -> ([f32; 3], f32) {
    // Azimute 135°, elevação 45°, intensidade 3 (padrão da cena-h1).
    let az = 135f32.to_radians();
    let el = 45f32.to_radians();
    ([el.cos() * az.cos(), el.cos() * az.sin(), el.sin()], 3.0)
}

#[test]
fn ceu_do_wgsl_bate_com_rust() {
    let (sol, intensidade) = sol_teste();
    // Direções fixas: zênite, horizonte, acima e abaixo, perto do sol (dentro do disco e do halo),
    // fora do disco e abaixo do horizonte.
    let dirs = [
        [0.0, 0.0, 1.0],
        [1.0, 0.0, 0.0],
        unitario([0.5, 0.5, 0.7]),
        [0.0, 0.6, -0.8],
        [0.6, 0.0, -0.8],
        [-0.8, 0.3, 0.5],
        unitario([sol[0], sol[1], sol[2]]),
        unitario([sol[0] + 0.05, sol[1], sol[2]]),
        unitario([sol[0] + 0.2, sol[1] - 0.1, sol[2] + 0.1]),
    ];
    let mut entradas = Vec::new();
    for d in dirs {
        entradas.push((d, true));
        entradas.push((d, false));
    }
    let coef = ceu::irradiancia_sh(None);
    // Sem adaptador de hardware o teste não tem o que comparar. Qualquer outra falha (shader que
    // não compila, por exemplo) quebra o teste.
    if let Err(erro) = criar_dispositivo() {
        eprintln!("ceu_wgsl: {erro}; teste ignorado");
        return;
    }
    let (gpu, irradiancia_gpu) = avaliar_ceu(&entradas, sol, intensidade, &coef).expect("prova do céu na GPU");

    let tolerancia = 1.0e-4f32;
    for (i, (d, disco)) in entradas.iter().enumerate() {
        let rust = ceu::radiancia(*d, sol, intensidade, *disco);
        let halo = ceu::halo_sol(*d, sol, intensidade);
        for c in 0..3 {
            assert!(
                (gpu[i][c] - rust[c]).abs() < tolerancia,
                "direção {d:?} disco {disco} canal {c}: GPU {} Rust {}",
                gpu[i][c],
                rust[c]
            );
        }
        assert!((gpu[i][3] - halo).abs() < tolerancia, "halo em {d:?}: GPU {} Rust {halo}", gpu[i][3]);
    }
    // A mesma função de irradiância (SH9 já convoluída) avaliada nas mesmas normais.
    for (i, (d, _)) in entradas.iter().enumerate() {
        let rust = ceu::irradiancia_em(&coef, *d);
        for c in 0..3 {
            assert!(
                (irradiancia_gpu[i][c] - rust[c]).abs() < tolerancia,
                "irradiância em {d:?} canal {c}: GPU {} Rust {}",
                irradiancia_gpu[i][c],
                rust[c]
            );
        }
    }
}
