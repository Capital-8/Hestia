//! Céu analítico e irradiância difusa em harmônicos esféricos de ordem 2 (SH9).
//!
//! O céu é um gradiente de horizonte a zênite, com o chão abaixo do horizonte e um disco solar.
//! A irradiância é calculada uma vez por cena (`sh9_irradiancia`) por integração numérica sobre a
//! esfera e enviada ao shader num buffer separado de `Uniformes`.
//!
//! Fórmulas (Ramamoorthi & Hanrahan 2001, "An Efficient Representation for Irradiance
//! Environment Maps"):
//! - Base real de SH: Y00 = 0.282095; Y1-1 = 0.488603·y; Y10 = 0.488603·z; Y11 = 0.488603·x;
//!   Y2-2 = 1.092548·xy; Y2-1 = 1.092548·yz; Y20 = 0.315392·(3z²-1); Y21 = 1.092548·xz;
//!   Y22 = 0.546274·(x²-y²).
//! - Projeção da radiância L: L_lm = ∫ L(ω) Y_lm(ω) dω, estimada com N amostras de Fibonacci
//!   (peso 4π/N).
//! - Convolução de irradiância: E_lm = A_l · L_lm, com A0 = π, A1 = 2π/3, A2 = π/4.
//! - Avaliação: E(n) = Σ_lm E_lm · Y_lm(n). As constantes c1..c5 de RH são esses mesmos
//!   produtos A_l·Y_lm já dobrados (c4 = A0·Y00, c2 = A1·Y1/2, c1 = A2·Y22, c3 = A2·3·Y20,
//!   c5 = A2·Y20), por isso o shader soma os 9 termos diretamente.
//!
//! As cores do céu e do chão ficam em constantes; `shader.wgsl` repete os mesmos valores, então
//! qualquer mudança aqui deve ir também para lá.

use crate::constantes::{CEU_PADRAO, CHAO_AMBIENTE};

/// Horizonte: `CEU_PADRAO` clareado 20% em direção ao branco.
const HORIZONTE: [f32; 3] = [
    (CEU_PADRAO[0] + (1.0 - CEU_PADRAO[0]) * 0.2) as f32,
    (CEU_PADRAO[1] + (1.0 - CEU_PADRAO[1]) * 0.2) as f32,
    (CEU_PADRAO[2] + (1.0 - CEU_PADRAO[2]) * 0.2) as f32,
];

/// Zênite: azul mais saturado.
const ZENITE: [f32; 3] = [0.20, 0.40, 0.82];

/// Cor do chão, usada abaixo do horizonte.
const CHAO: [f32; 3] = [
    CHAO_AMBIENTE[0] as f32,
    CHAO_AMBIENTE[1] as f32,
    CHAO_AMBIENTE[2] as f32,
];

/// cos(6°): raio angular do disco solar.
const COS_DISCO_SOLAR: f32 = 0.994_521_9;

/// Radiância do disco solar, em múltiplos da intensidade do Sol.
const FATOR_DISCO_SOLAR: f32 = 2.0;

/// Névoa de distância, em metros a partir da câmera: nula até `NEVOA_INICIO_M` e cheia a partir de
/// `NEVOA_FIM_M`. Nesta cena o chão de render vai até ~90 m, e a casa fica entre ~19 m e ~37 m, então
/// a névoa começa depois da casa e termina na borda do chão, que assim some contra o horizonte.
/// Espelho de `NEVOA_INICIO_M` e `NEVOA_FIM_M` em `shader.wgsl` (o teste de sincronia lê de lá).
pub const NEVOA_INICIO_M: f64 = 40.0;
/// Ver `NEVOA_INICIO_M`.
pub const NEVOA_FIM_M: f64 = 85.0;

/// Fator de névoa de distância: 0 até `NEVOA_INICIO_M`, 1 a partir de `NEVOA_FIM_M`, com
/// suavização de Hermite (smoothstep) entre os dois. Espelho de `fator_nevoa` no shader.
pub fn fator_nevoa(distancia: f64) -> f64 {
    let t = ((distancia - NEVOA_INICIO_M) / (NEVOA_FIM_M - NEVOA_INICIO_M)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// Número de amostras de Fibonacci usadas na projeção SH.
pub const AMOSTRAS_SH: usize = 4096;

/// Ângulo áureo em radianos, passo da espiral de Fibonacci.
const ANGULO_AUREO: f64 = 2.399_963_229_728_653;

fn misturar(a: [f32; 3], b: [f32; 3], t: f32) -> [f32; 3] {
    [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
    ]
}

/// Radiância do céu analítico na direção `dir` (vetor unitário, Z para cima).
///
/// `sol_dir` é a direção **para o Sol**. O disco só aparece com `sol_ativo`, intensidade positiva
/// e Sol acima do horizonte.
pub fn radiancia(dir: [f32; 3], sol_dir: [f32; 3], sol_intensidade: f32, sol_ativo: bool) -> [f32; 3] {
    let z = dir[2];
    let mut cor = if z >= 0.0 {
        misturar(HORIZONTE, ZENITE, z.clamp(0.0, 1.0).powf(0.6))
    } else {
        let s = (-z / 0.25).clamp(0.0, 1.0);
        misturar(HORIZONTE, CHAO, s * s * (3.0 - 2.0 * s))
    };

    let comprimento_sol = (sol_dir[0] * sol_dir[0] + sol_dir[1] * sol_dir[1] + sol_dir[2] * sol_dir[2]).sqrt();
    if sol_ativo && sol_intensidade > 0.0 && comprimento_sol > 1.0e-9 && sol_dir[2] > 0.0 {
        let cosseno = (dir[0] * sol_dir[0] + dir[1] * sol_dir[1] + dir[2] * sol_dir[2]) / comprimento_sol;
        if cosseno >= COS_DISCO_SOLAR {
            let brilho = sol_intensidade * FATOR_DISCO_SOLAR;
            cor = [cor[0] + brilho, cor[1] + brilho, cor[2] + brilho];
        }
    }
    cor
}

/// Base real de SH de ordem 2 (9 termos), na ordem: 00, 1-1, 10, 11, 2-2, 2-1, 20, 21, 22.
fn base_sh(d: [f64; 3]) -> [f64; 9] {
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

/// Irradiância SH9 de uma função de radiância qualquer (`f` recebe direções unitárias).
///
/// Devolve os 9 coeficientes **já convoluídos** (E_lm = A_l · L_lm), um RGB por coeficiente.
/// Existe separado de `sh9_irradiancia` para o teste de céu uniforme.
pub fn sh9_irradiancia_de<F: Fn([f32; 3]) -> [f32; 3]>(f: F) -> [[f32; 3]; 9] {
    let n = AMOSTRAS_SH;
    let mut projecao = [[0.0f64; 3]; 9];
    for i in 0..n {
        let z = 1.0 - (2.0 * i as f64 + 1.0) / n as f64;
        let r = (1.0 - z * z).max(0.0).sqrt();
        let phi = i as f64 * ANGULO_AUREO;
        let dir = [r * phi.cos(), r * phi.sin(), z];
        let valor = f([dir[0] as f32, dir[1] as f32, dir[2] as f32]);
        let base = base_sh(dir);
        for k in 0..9 {
            for c in 0..3 {
                projecao[k][c] += valor[c] as f64 * base[k];
            }
        }
    }

    // Peso de Monte Carlo (4π/N) e fatores de convolução A0 = π, A1 = 2π/3, A2 = π/4.
    let peso = 4.0 * std::f64::consts::PI / n as f64;
    let fator_banda = [
        std::f64::consts::PI,
        2.0 * std::f64::consts::PI / 3.0,
        2.0 * std::f64::consts::PI / 3.0,
        2.0 * std::f64::consts::PI / 3.0,
        std::f64::consts::PI / 4.0,
        std::f64::consts::PI / 4.0,
        std::f64::consts::PI / 4.0,
        std::f64::consts::PI / 4.0,
        std::f64::consts::PI / 4.0,
    ];
    let mut saida = [[0.0f32; 3]; 9];
    for k in 0..9 {
        for c in 0..3 {
            saida[k][c] = (projecao[k][c] * peso * fator_banda[k]) as f32;
        }
    }
    saida
}

/// Coeficientes SH9 da irradiância do céu analítico para o Sol dado (ver `radiancia`).
pub fn sh9_irradiancia(sol_dir: [f32; 3], sol_intensidade: f32, sol_ativo: bool) -> [[f32; 3]; 9] {
    sh9_irradiancia_de(|dir| radiancia(dir, sol_dir, sol_intensidade, sol_ativo))
}

/// Converte os coeficientes RGB para o layout do buffer (`array<vec4<f32>, 9>`, w = 0).
pub fn para_buffer(coeficientes: &[[f32; 3]; 9]) -> [[f32; 4]; 9] {
    coeficientes.map(|c| [c[0], c[1], c[2], 0.0])
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn nevoa_e_zero_na_distancia_zero_e_um_longe() {
        assert_eq!(fator_nevoa(0.0), 0.0);
        assert_eq!(fator_nevoa(NEVOA_INICIO_M), 0.0);
        assert!((fator_nevoa(1.0e6) - 1.0).abs() < 1.0e-12);
        assert_eq!(fator_nevoa(NEVOA_FIM_M), 1.0);
    }

    #[test]
    fn nevoa_cresce_de_forma_monotonica_e_fica_em_zero_um() {
        let mut anterior = 0.0;
        for i in 0..=400 {
            let f = fator_nevoa(f64::from(i) * 0.5);
            assert!((0.0..=1.0).contains(&f));
            assert!(f >= anterior - 1.0e-12, "névoa caiu em {}", f64::from(i) * 0.5);
            anterior = f;
        }
    }

    #[test]
    fn constantes_da_nevoa_batem_com_o_shader() {
        const SHADER: &str = include_str!("shader.wgsl");
        let valor = |nome: &str| -> f64 {
            let trecho = format!("const {nome}: f32 = ");
            let inicio = SHADER.find(&trecho).expect("constante no shader") + trecho.len();
            let fim = inicio + SHADER[inicio..].find(';').expect("fim da constante");
            SHADER[inicio..fim].trim().parse().expect("número")
        };
        assert!((valor("NEVOA_INICIO_M") - NEVOA_INICIO_M).abs() < 1.0e-6);
        assert!((valor("NEVOA_FIM_M") - NEVOA_FIM_M).abs() < 1.0e-6);
    }

    const SOL: [f32; 3] = [0.6, 0.0, 0.8];

    fn luminancia(c: [f32; 3]) -> f32 {
        0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    }

    fn unitario(d: [f32; 3]) -> [f32; 3] {
        let n = (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt();
        [d[0] / n, d[1] / n, d[2] / n]
    }

    #[test]
    fn acima_do_horizonte_nao_e_mais_escuro_que_abaixo() {
        let sem_sol = [0.0, 0.0, 0.0];
        for angulo in [0.0f32, 0.3, 0.7, 1.2, 1.5] {
            let acima = unitario([angulo.cos(), 0.2, angulo.sin()]);
            let abaixo = [acima[0], acima[1], -acima[2]];
            let la = luminancia(radiancia(acima, sem_sol, 0.0, false));
            let lb = luminancia(radiancia(abaixo, sem_sol, 0.0, false));
            assert!(la >= lb, "ângulo {angulo}: acima {la} < abaixo {lb}");
        }
    }

    #[test]
    fn disco_solar_aumenta_a_radiancia_perto_do_sol() {
        let sol = unitario(SOL);
        let perto = radiancia(sol, SOL, 3.0, true);
        let longe = radiancia(unitario([-0.8, 0.3, 0.5]), SOL, 3.0, true);
        assert!(luminancia(perto) > luminancia(longe) + 1.0);
        let sem_disco = radiancia(sol, SOL, 3.0, false);
        assert!(luminancia(perto) > luminancia(sem_disco) + 1.0);
    }

    #[test]
    fn sol_abaixo_do_horizonte_nao_gera_disco() {
        let sol_baixo = unitario([0.6, 0.0, -0.8]);
        let dir = sol_baixo;
        let com_flag = radiancia(dir, sol_baixo, 3.0, true);
        let sem_flag = radiancia(dir, sol_baixo, 3.0, false);
        assert_eq!(com_flag, sem_flag);
    }

    #[test]
    fn sh9_de_radiancia_uniforme_tem_so_o_termo_l0() {
        let constante = [0.5f32, 0.4, 0.3];
        let coef = sh9_irradiancia_de(|_| constante);
        // E00 = π · L00 · Y00, com L00 = L · 4π · Y00: E00 = π · L · 4π · Y00² ; E(n) = π · L.
        let esperado = std::f32::consts::PI;
        for (c, (valor, referencia)) in coef[0].iter().zip(constante).enumerate() {
            let valor_l0 = valor * 0.282_095;
            assert!((valor_l0 - esperado * referencia).abs() < 1.0e-3, "L0 canal {c}: {valor_l0}");
        }
        for (k, termo) in coef.iter().enumerate().skip(1) {
            for (c, valor) in termo.iter().enumerate() {
                assert!(valor.abs() < 1.0e-3, "termo {k} canal {c} = {valor}");
            }
        }
    }

    #[test]
    fn sh9_do_sol_tem_termos_de_ordem_superior_nao_nulos() {
        let coef = sh9_irradiancia(SOL, 3.0, true);
        assert!(coef[0][0] > 0.0);
        assert!(coef[1..].iter().any(|c| c[0].abs() > 1.0e-3));
    }

    #[test]
    fn buffer_tem_w_zero() {
        let buf = para_buffer(&[[1.0, 2.0, 3.0]; 9]);
        assert!(buf.iter().all(|v| v[3] == 0.0 && v[0] == 1.0));
        assert_eq!(std::mem::size_of_val(&buf), 9 * 16);
    }
}
