//! Números pseudoaleatórios determinísticos e amostragem por cosseno, espelho de `pt0.wgsl`.
//!
//! O hash PCG e a amostragem têm a mesma aritmética do WGSL. Cada pixel e cada passe partem de um
//! estado derivado de (x, y, passe, semente), então o resultado não depende da ordem de execução.

use std::f32::consts::PI;

/// Hash PCG de uma linha (igual a `pcg` do WGSL).
pub fn pcg(valor: u32) -> u32 {
    let estado = valor.wrapping_mul(747_796_405).wrapping_add(2_891_336_453);
    let palavra = ((estado >> ((estado >> 28) + 4)) ^ estado).wrapping_mul(277_803_737);
    (palavra >> 22) ^ palavra
}

/// Próximo número em [0, 1) a partir do estado (igual a `aleatorio` do WGSL).
pub fn uniforme(estado: &mut u32) -> f32 {
    *estado = pcg(*estado);
    *estado as f32 * (1.0 / 4_294_967_296.0)
}

/// Direção do sol amostrada no cone de meia-abertura `raio` (radianos) em torno de `sol`, como
/// `direcao_sol` do WGSL. Densidade uniforme no ângulo sólido do cone (o disco solar visto da
/// Terra). Com `raio <= 0`, devolve `sol` (sol pontual). `1 - cos(raio)` é calculado como
/// `2 sen²(raio/2)`: com um raio de 0,25 grau, `1 - cos` em f32 perderia quase todos os dígitos.
pub fn direcao_disco_solar(sol: [f32; 3], raio: f32, u1: f32, u2: f32) -> [f32; 3] {
    if raio <= 0.0 {
        return sol;
    }
    let meio_seno = (0.5 * raio).sin();
    let cos_t = 1.0 - u1 * (2.0 * meio_seno * meio_seno);
    let sen_t = (1.0 - cos_t * cos_t).max(0.0).sqrt();
    let phi = 2.0 * PI * u2;
    let ajuda = if sol[2].abs() < 0.999 { [0.0, 0.0, 1.0] } else { [1.0, 0.0, 0.0] };
    let t1 = normalizar(produto_vetorial(ajuda, sol));
    let t2 = produto_vetorial(sol, t1);
    let (c, s) = (sen_t * phi.cos(), sen_t * phi.sin());
    normalizar([
        t1[0] * c + t2[0] * s + sol[0] * cos_t,
        t1[1] * c + t2[1] * s + sol[1] * cos_t,
        t1[2] * c + t2[2] * s + sol[2] * cos_t,
    ])
}

fn produto_vetorial(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

fn normalizar(a: [f32; 3]) -> [f32; 3] {
    let c = (a[0] * a[0] + a[1] * a[1] + a[2] * a[2]).sqrt();
    [a[0] / c, a[1] / c, a[2] / c]
}

/// Direção amostrada com densidade cos θ / π, em coordenadas locais (Z é a normal).
///
/// `u1` e `u2` em [0, 1). Método do disco de Malley: o disco é amostrado uniformemente e erguido
/// até a esfera. A média de cos θ é 2/3.
pub fn cosseno_local(u1: f32, u2: f32) -> [f32; 3] {
    let raio = u1.sqrt();
    let phi = 2.0 * PI * u2;
    [raio * phi.cos(), raio * phi.sin(), (1.0 - u1).max(0.0).sqrt()]
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn uniforme_fica_em_zero_um_e_e_deterministico() {
        let mut a = 42u32;
        let mut b = 42u32;
        for _ in 0..1000 {
            let x = uniforme(&mut a);
            assert!((0.0..1.0).contains(&x));
            assert_eq!(x, uniforme(&mut b));
        }
    }

    #[test]
    fn disco_solar_fica_dentro_do_angulo() {
        // Sol a 52 graus de elevação, disco de raio 0,25 grau (diâmetro de 0,5 grau, como o sol real).
        let sol = {
            let el = 52.0f32.to_radians();
            let az = 324.46f32.to_radians();
            [el.cos() * az.cos(), el.cos() * az.sin(), el.sin()]
        };
        let raio = 0.25f32.to_radians();
        let limite = raio.cos();
        let mut estado = 99u32;
        let mut maior_angulo = 0.0f32;
        for _ in 0..20_000 {
            let d = direcao_disco_solar(sol, raio, uniforme(&mut estado), uniforme(&mut estado));
            let comprimento = (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt();
            assert!((comprimento - 1.0).abs() < 1.0e-5);
            let cosseno = d[0] * sol[0] + d[1] * sol[1] + d[2] * sol[2];
            assert!(cosseno >= limite - 1.0e-6, "amostra fora do cone: cos {cosseno} < {limite}");
            maior_angulo = maior_angulo.max(cosseno.clamp(-1.0, 1.0).acos());
        }
        // As amostras cobrem o disco inteiro (não ficam todas no centro).
        assert!(maior_angulo > 0.9 * raio, "cobertura do disco: {maior_angulo} de {raio}");
    }

    #[test]
    fn disco_solar_com_raio_zero_e_o_sol() {
        let sol = [0.0, 0.6, 0.8];
        assert_eq!(direcao_disco_solar(sol, 0.0, 0.3, 0.7), sol);
        // u1 = 0 é o eixo do cone, qualquer que seja u2.
        let d = direcao_disco_solar(sol, 0.0045, 0.0, 0.4);
        assert!((d[1] - sol[1]).abs() < 1.0e-6 && (d[2] - sol[2]).abs() < 1.0e-6);
    }

    #[test]
    fn cosseno_local_fica_no_hemisferio_de_cima() {
        let mut estado = 7u32;
        for _ in 0..1000 {
            let d = cosseno_local(uniforme(&mut estado), uniforme(&mut estado));
            let comprimento = (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt();
            assert!((comprimento - 1.0).abs() < 1.0e-5);
            assert!(d[2] >= 0.0);
        }
    }
}
