//! Óptica do vidro, espelho de `pt0.wgsl` (`fresnel_schlick`, `refratar`): Fresnel de Schlick e a
//! refração vetorial de Snell. Os testes dos limites (ângulo crítico, incidência normal) ficam aqui,
//! porque a GPU não é testada linha a linha.
//!
//! Convenção: `n` aponta para quem olha, isto é, `dot(n, d) < 0` com `d` a direção do raio que chega.

/// Fator de Fresnel de Schlick: `f0 + (1 - f0) (1 - cos)^5`, com `cos` clampeado em [0, 1].
pub fn fresnel_schlick(cos_t: f32, f0: f32) -> f32 {
    let m = (1.0 - cos_t.clamp(0.0, 1.0)).clamp(0.0, 1.0);
    let m2 = m * m;
    f0 + (1.0 - f0) * m2 * m2 * m
}

/// Reflectância no ângulo normal de um dielétrico com IOR `ior`: `((1 - ior) / (1 + ior))^2`.
pub fn f0_dieletrico(ior: f32) -> f32 {
    let r = (1.0 - ior) / (1.0 + ior);
    r * r
}

/// Reflexão de `d` em torno de `n`: `d - 2 (d . n) n`.
pub fn refletir(d: [f32; 3], n: [f32; 3]) -> [f32; 3] {
    let k = 2.0 * produto_escalar(d, n);
    [d[0] - k * n[0], d[1] - k * n[1], d[2] - k * n[2]]
}

/// Refração de Snell, vetorial, como `refratar` do WGSL. `eta` é a razão entre os IOR (entrando no
/// vidro, `1 / ior`; saindo, `ior`). Devolve `None` na reflexão interna total (`sen_t > 1`).
pub fn refratar(d: [f32; 3], n: [f32; 3], eta: f32) -> Option<[f32; 3]> {
    let cos_i = -produto_escalar(d, n);
    let k = 1.0 - eta * eta * (1.0 - cos_i * cos_i);
    if k < 0.0 {
        return None;
    }
    let fator = eta * cos_i - k.sqrt();
    let v = [
        eta * d[0] + fator * n[0],
        eta * d[1] + fator * n[1],
        eta * d[2] + fator * n[2],
    ];
    let c = produto_escalar(v, v).sqrt();
    Some([v[0] / c, v[1] / c, v[2] / c])
}

fn produto_escalar(a: [f32; 3], b: [f32; 3]) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

#[cfg(test)]
mod testes {
    use super::*;

    fn perto(a: f32, b: f32, tol: f32) -> bool {
        (a - b).abs() <= tol
    }

    #[test]
    fn schlick_nos_limites() {
        let f0 = f0_dieletrico(1.5);
        // Incidência normal: F = F0 (0,04 para o vidro comum).
        assert!(perto(fresnel_schlick(1.0, f0), 0.04, 1.0e-6));
        assert!(perto(f0, 0.04, 1.0e-6));
        // Rasante: reflexão total.
        assert!(perto(fresnel_schlick(0.0, f0), 1.0, 1.0e-6));
        // Sem contraste de IOR (ior = 1), no ângulo normal não há reflexo. Só no normal: a aproximação
        // de Schlick dá (1 - cos)^5 > 0 em outros ângulos mesmo com f0 = 0, e isso é esperado.
        assert!(perto(fresnel_schlick(1.0, f0_dieletrico(1.0)), 0.0, 1.0e-6));
        // Crescente de normal para rasante.
        let mut anterior = 0.0;
        for k in 0..=100 {
            let f = fresnel_schlick(1.0 - k as f32 / 100.0, f0);
            assert!(f + 1.0e-6 >= anterior);
            anterior = f;
        }
    }

    #[test]
    fn snell_incidencia_normal_nao_desvia() {
        let d = [0.0, 0.0, -1.0];
        let n = [0.0, 0.0, 1.0];
        let t = refratar(d, n, 1.0 / 1.5).expect("sem reflexão interna");
        assert!(perto(t[2], -1.0, 1.0e-6) && perto(t[0], 0.0, 1.0e-6) && perto(t[1], 0.0, 1.0e-6));
    }

    /// Direção de um raio que faz `graus` com a normal, saindo de um plano com normal `n` = (0,0,1).
    fn raio_com_angulo(graus: f32) -> [f32; 3] {
        let a = graus.to_radians();
        [a.sin(), 0.0, -a.cos()]
    }

    #[test]
    fn snell_respeita_a_lei_dos_senos() {
        // Entrando no vidro (eta = 1 / 1,5): sen_t = sen_i / 1,5. O raio desce (z < 0) e a normal
        // voltada para ele é (0,0,1), com dot(n, d) < 0.
        let nf = [0.0, 0.0, 1.0];
        for graus in [5.0f32, 20.0, 35.0, 60.0, 80.0] {
            let d = raio_com_angulo(graus);
            let t = refratar(d, nf, 1.0 / 1.5).expect("entrando nunca tem reflexão total");
            let sen_i = graus.to_radians().sin();
            let sen_t = (t[0] * t[0] + t[1] * t[1]).sqrt();
            assert!(perto(sen_t, sen_i / 1.5, 1.0e-5), "{graus}: {sen_t} vs {}", sen_i / 1.5);
            assert!(t[2] < 0.0, "a refração atravessa a superfície");
        }
    }

    #[test]
    fn angulo_critico_do_vidro_para_o_ar() {
        // Saindo do vidro (eta = 1,5): ângulo crítico asin(1 / 1,5) = 41,81 graus.
        let nf = [0.0, 0.0, 1.0];
        // Dentro do vidro o raio vai para cima (dot(d, n) > 0 com n = (0,0,1)); usa-se d com z > 0.
        let abaixo = [(40.0f32).to_radians().sin(), 0.0, (40.0f32).to_radians().cos()];
        let acima = [(43.0f32).to_radians().sin(), 0.0, (43.0f32).to_radians().cos()];
        // Com a normal voltada para o raio (dot(n, d) < 0), a normal é -(0,0,1).
        let nq = [-nf[0], -nf[1], -nf[2]];
        assert!(refratar(abaixo, nq, 1.5).is_some(), "40 graus ainda refrata");
        assert!(refratar(acima, nq, 1.5).is_none(), "43 graus reflete por completo");
        let t = refratar(abaixo, nq, 1.5).expect("refrata");
        let sen_t = (t[0] * t[0] + t[1] * t[1]).sqrt();
        assert!(perto(sen_t, 1.5 * (40.0f32).to_radians().sin(), 1.0e-5));
    }

    #[test]
    fn reflexao_preserva_o_comprimento() {
        let d = [0.6f32, 0.0, -0.8];
        let r = refletir(d, [0.0, 0.0, 1.0]);
        assert!(perto(r[0], 0.6, 1.0e-6) && perto(r[2], 0.8, 1.0e-6));
    }
}
