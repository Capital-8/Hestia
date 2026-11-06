//! Tone mapping AgX, balanço de branco e exposição automática para cores calculadas na CPU.
//!
//! Só o fundo de limpeza e as estimativas da exposição automática usam este caminho. O shader
//! aplica as mesmas curvas aos pixels, então o fundo e a cena terminam no mesmo espaço de cor.
//! As constantes do AgX estão em `shader.wgsl` (`AGX_*`) e aqui; o teste de sincronia confere.

/// Matriz de inset do AgX, por colunas (projeção de cores para o espaço de contraste).
const AGX_INSET: [[f64; 3]; 3] = [
    [0.856_627_153_315_983, 0.137_318_972_929_847, 0.111_898_212_999_95],
    [0.095_121_240_538_158_8, 0.761_241_990_602_591, 0.076_799_418_603_190_3],
    [0.048_251_606_145_858_3, 0.101_439_036_467_562, 0.811_302_368_396_859],
];

/// Matriz de outset do AgX, por colunas (volta ao espaço linear de saída).
const AGX_OUTSET: [[f64; 3]; 3] = [
    [1.127_100_581_814_436_8, -0.141_329_763_498_438_3, -0.141_329_763_498_438_26],
    [-0.110_606_643_096_603_23, 1.157_823_702_216_272, -0.110_606_643_096_602_94],
    [-0.016_493_938_717_834_573, -0.016_493_938_717_834_257, 1.251_936_406_595_040_5],
];

/// Limite inferior, em EV (log2 da luz linear), que o AgX comprime para o preto.
pub const AGX_EV_MIN: f64 = -12.473_93;
/// Limite superior, em EV, que o AgX comprime para o branco.
pub const AGX_EV_MAX: f64 = 4.026_069;

/// Cinza médio da cena (18% de refletância), alvo da exposição automática.
pub const CINZA_MEDIO: f64 = 0.18;

/// Temperatura neutra do balanço de branco: 6500 K, sem correção.
pub const TEMPERATURA_NEUTRA_K: f64 = 6500.0;

/// Faixa aceita para a temperatura do balanço de branco, em kelvin (fora dela o ganho diverge).
pub const TEMPERATURA_MINIMA_K: f64 = 2000.0;
/// Ver `TEMPERATURA_MINIMA_K`.
pub const TEMPERATURA_MAXIMA_K: f64 = 20000.0;

/// Limite da exposição automática, em EV em torno de 1 (±8 EV).
pub const LIMITE_EXPOSICAO_AUTOMATICA_EV: f64 = 8.0;

fn mat_vec(m: &[[f64; 3]; 3], v: [f64; 3]) -> [f64; 3] {
    let mut saida = [0.0; 3];
    for (coluna, escala) in m.iter().zip(v) {
        for (c, valor) in saida.iter_mut().enumerate() {
            *valor += coluna[c] * escala;
        }
    }
    saida
}

/// Polinômio de contraste do AgX (6ª ordem), aplicado depois da compressão em log.
fn contraste_agx(x: f64) -> f64 {
    let x2 = x * x;
    let x4 = x2 * x2;
    15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232
}

/// Tone mapping AgX de luz linear (já exposta e balanceada) para luz linear de saída, em [0, 1].
/// Espelho de `tonemapear` no shader. A curva é monotônica e limitada: cores mais claras nunca
/// ficam mais escuras, e a saída não passa de 1.
pub fn agx(cor: [f64; 3]) -> [f64; 3] {
    let c = mat_vec(&AGX_INSET, cor.map(|v| v.max(0.0)));
    let c = c.map(|v| {
        ((v.max(1.0e-10).log2() - AGX_EV_MIN) / (AGX_EV_MAX - AGX_EV_MIN)).clamp(0.0, 1.0)
    });
    let c = mat_vec(&AGX_OUTSET, c.map(contraste_agx));
    c.map(|v| v.max(0.0).powf(2.2).clamp(0.0, 1.0))
}

/// Codifica um canal linear já tonemapeado para sRGB.
fn srgb_canal(x: f64) -> f64 {
    let x = x.clamp(0.0, 1.0);
    if x <= 0.003_130_8 {
        x * 12.92
    } else {
        1.055 * x.powf(1.0 / 2.4) - 0.055
    }
}

/// Cor de fundo linear -> sRGB tonemapeado (AgX) e codificado.
pub fn fundo_tonemapeado(cor_linear: [f64; 3], exposicao: f64) -> [f64; 3] {
    agx(cor_linear.map(|canal| canal * exposicao)).map(srgb_canal)
}

/// Cor RGB de um corpo negro na temperatura `k` (aproximação de Tanner Helland), em [0, 1].
fn corpo_negro_rgb(k: f64) -> [f64; 3] {
    let t = k.clamp(TEMPERATURA_MINIMA_K, TEMPERATURA_MAXIMA_K) / 100.0;
    let r = if t <= 66.0 {
        255.0
    } else {
        329.698_727_446 * (t - 60.0).powf(-0.133_204_759_2)
    };
    let g = if t <= 66.0 {
        99.470_802_586_1 * t.ln() - 161.119_568_166_1
    } else {
        288.122_169_528_3 * (t - 60.0).powf(-0.075_514_849_2)
    };
    let b = if t >= 66.0 {
        255.0
    } else if t <= 19.0 {
        0.0
    } else {
        138.517_731_223_1 * (t - 10.0).ln() - 305.044_792_730_7
    };
    [r, g, b].map(|v| v.clamp(0.0, 255.0) / 255.0)
}

/// Ganhos RGB do balanço de branco para uma luz de `temperatura_k` kelvin. Multiplicam a luz linear
/// antes do tone mapping e levam essa luz para o branco de 6500 K. Em 6500 K são (1, 1, 1). Luz
/// quente (abaixo de 6500 K) ganha azul; luz fria, vermelho.
pub fn ganhos_balanco_branco(temperatura_k: f64) -> [f64; 3] {
    let neutro = corpo_negro_rgb(TEMPERATURA_NEUTRA_K);
    let luz = corpo_negro_rgb(temperatura_k);
    [neutro[0] / luz[0], neutro[1] / luz[1], neutro[2] / luz[2]]
}

/// Exposição automática: multiplicador que leva a luminância média da cena (linear, sem exposição)
/// a `CINZA_MEDIO`, limitado a `LIMITE_EXPOSICAO_AUTOMATICA_EV` em torno de 1.
pub fn exposicao_automatica(luminancia_media_cena: f64) -> f64 {
    let limite = 2f64.powf(LIMITE_EXPOSICAO_AUTOMATICA_EV);
    (CINZA_MEDIO / luminancia_media_cena.max(1.0e-12)).clamp(1.0 / limite, limite)
}

/// Luminância linear média de uma cena, estimada a partir da imagem já tonemapeada (sRGB, RGBA8).
///
/// Não há o HDR de volta: a inversa do AgX é tabelada sobre o cinza (AGX de [g, g, g]) e aplicada à
/// luminância Rec.709 de cada pixel. Pixels estourados (255) caem no topo da curva inversa, então
/// a média deles é um limite superior. É uma estimativa para a exposição automática, não uma medida.
pub fn luminancia_media_da_cena(rgba: &[u8]) -> f64 {
    const PASSOS: usize = 4096;
    let luminancia_cinza = |g: f64| {
        let c = agx([g, g, g]);
        0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    };
    // Para cada luminância de saída numa grade uniforme em [0, 1], a luminância de cena que o AgX
    // leva até ela, por bisseção geométrica (a curva é crescente).
    let tabela: Vec<f64> = (0..PASSOS)
        .map(|i| {
            let alvo = i as f64 / (PASSOS - 1) as f64;
            let (mut lo, mut hi) = (1.0e-6f64, 1.0e4f64);
            for _ in 0..80 {
                let meio = (lo * hi).sqrt();
                if luminancia_cinza(meio) < alvo {
                    lo = meio;
                } else {
                    hi = meio;
                }
            }
            (lo * hi).sqrt()
        })
        .collect();
    let mut soma = 0.0;
    let mut n = 0usize;
    for px in rgba.chunks_exact(4) {
        let lin = px[..3].iter().map(|&v| {
            let v = f64::from(v) / 255.0;
            if v <= 0.040_45 {
                v / 12.92
            } else {
                ((v + 0.055) / 1.055).powf(2.4)
            }
        });
        let lin: Vec<f64> = lin.collect();
        let y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
        let indice = (y.clamp(0.0, 1.0) * (PASSOS - 1) as f64).round() as usize;
        soma += tabela[indice];
        n += 1;
    }
    if n == 0 {
        0.0
    } else {
        soma / n as f64
    }
}

/// Fresnel de Schlick escalar, `F0 + (1 - F0)(1 - cos)^5`, com `cos` limitado a `[0, 1]`.
/// Espelho de `schlick_escalar` em `shader.wgsl` (passe de vidro, F0 = 0,04 para ior 1,5).
pub fn schlick_escalar(cos_theta: f64, f0: f64) -> f64 {
    let x = (1.0 - cos_theta).clamp(0.0, 1.0);
    f0 + (1.0 - f0) * x.powi(5)
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn schlick_incidencia_normal_e_f0_e_rasante_e_um() {
        // Vidro (ior 1,5): F0 = ((n - 1) / (n + 1))^2 = 0,04.
        assert!((schlick_escalar(1.0, 0.04) - 0.04).abs() < 1.0e-12);
        assert!((schlick_escalar(0.0, 0.04) - 1.0).abs() < 1.0e-12);
        // Cosseno fora de [0, 1] é limitado: nada de F fora de [F0, 1].
        assert!((schlick_escalar(1.5, 0.04) - 0.04).abs() < 1.0e-12);
        assert!((schlick_escalar(-0.5, 0.04) - 1.0).abs() < 1.0e-12);
        // Meia incidência: 0,04 + 0,96 * 0,5^5 = 0,07.
        assert!((schlick_escalar(0.5, 0.04) - 0.07).abs() < 1.0e-12);
    }

    #[test]
    fn schlick_cresce_quando_o_angulo_abre() {
        let mut anterior = schlick_escalar(1.0, 0.04);
        for i in 1..=100 {
            let cos = 1.0 - f64::from(i) / 100.0;
            let f = schlick_escalar(cos, 0.04);
            assert!(f >= anterior - 1.0e-12, "F caiu em cos = {cos}");
            assert!((0.04..=1.0).contains(&f));
            anterior = f;
        }
    }

    #[test]
    fn preto_continua_preto_e_branco_quase_um() {
        let preto = fundo_tonemapeado([0.0, 0.0, 0.0], 1.0);
        assert!(preto.iter().all(|v| *v < 1.0e-6));
        let branco = fundo_tonemapeado([100.0, 100.0, 100.0], 1.0);
        assert!(branco.iter().all(|v| (0.0..=1.0).contains(v)));
        assert!(branco.iter().all(|v| *v > 0.95));
    }

    #[test]
    fn agx_e_monotonica_e_limitada() {
        // Cinza de 2^-14 a 2^14 linear, em passos de 1/64 de EV: a saída nunca cai e fica em [0, 1].
        let mut anterior = [0.0f64; 3];
        for i in -(14 * 64)..=(14 * 64) {
            let g = 2f64.powf(f64::from(i) / 64.0);
            let c = agx([g, g, g]);
            for k in 0..3 {
                assert!((0.0..=1.0).contains(&c[k]), "fora de [0, 1] em g = {g}");
                assert!(c[k] >= anterior[k] - 1.0e-9, "queda em g = {g}");
            }
            anterior = c;
        }
    }

    #[test]
    fn agx_limita_luz_forte_e_mantem_a_ordem_dos_canais() {
        let c = agx([50.0, 2.0, 0.5]);
        assert!(c.iter().all(|v| (0.0..=1.0).contains(v)));
        assert!(c[0] > c[1] && c[1] > c[2]);
    }

    #[test]
    fn balanco_de_6500_k_e_neutro() {
        let g = ganhos_balanco_branco(TEMPERATURA_NEUTRA_K);
        for (k, ganho) in g.iter().enumerate() {
            assert!((ganho - 1.0).abs() < 1.0e-12, "ganho {k} = {ganho}");
        }
    }

    #[test]
    fn balanco_corrige_a_cor_da_luz() {
        // Luz de 3000 K (quente): o ganho de azul sobe acima de 1,5 e o de vermelho fica abaixo.
        let quente = ganhos_balanco_branco(3000.0);
        assert!(quente[2] > quente[0] && quente[2] > 1.5);
        // Luz de 10000 K (fria): o ganho de vermelho passa o de azul.
        let fria = ganhos_balanco_branco(10000.0);
        assert!(fria[0] > fria[2]);
    }

    #[test]
    fn exposicao_automatica_leva_o_cinza_medio_a_neutro() {
        assert!((exposicao_automatica(CINZA_MEDIO) - 1.0).abs() < 1.0e-12);
        assert!((exposicao_automatica(CINZA_MEDIO / 2.0) - 2.0).abs() < 1.0e-12);
        // Limitada a 8 EV em cada sentido.
        let limite = 2f64.powf(LIMITE_EXPOSICAO_AUTOMATICA_EV);
        assert!((exposicao_automatica(1.0e-30) - limite).abs() < 1.0e-6);
        assert!((exposicao_automatica(1.0e30) - 1.0 / limite).abs() < 1.0e-18);
    }

    #[test]
    fn luminancia_da_cena_de_cinza_uniforme_fica_perto_do_valor_verdadeiro() {
        // Cena de cinza 0,18 linear, já tonemapeada (é o que a imagem guarda) e codificada em sRGB.
        // A estimativa devolve algo perto de 0,18.
        let saida = fundo_tonemapeado([0.18; 3], 1.0).map(|v| (v * 255.0).round() as u8);
        let imagem: Vec<u8> = (0..16)
            .flat_map(|_| [saida[0], saida[1], saida[2], 255])
            .collect();
        let media = luminancia_media_da_cena(&imagem);
        assert!((media - 0.18).abs() < 0.01, "estimativa {media}");
    }

    #[test]
    fn constantes_do_agx_batem_com_o_shader() {
        const SHADER: &str = include_str!("shader.wgsl");
        let valor = |nome: &str| -> f64 {
            let trecho = format!("const {nome}: f32 = ");
            let inicio = SHADER.find(&trecho).expect("constante no shader") + trecho.len();
            let fim = inicio + SHADER[inicio..].find(';').expect("fim da constante");
            SHADER[inicio..fim].trim().parse().expect("número")
        };
        assert!((valor("AGX_EV_MIN") - AGX_EV_MIN).abs() < 1.0e-6);
        assert!((valor("AGX_EV_MAX") - AGX_EV_MAX).abs() < 1.0e-6);
        // Primeira coluna da matriz de inset: a mesma no shader e aqui.
        assert!(SHADER.contains("vec3<f32>(0.856627153315983, 0.137318972929847, 0.11189821299995)"));
        assert!((AGX_INSET[0][0] - 0.856_627_153_315_983).abs() < 1.0e-12);
    }

    #[test]
    fn curva_e_monotonica_em_fundo() {
        let baixo = fundo_tonemapeado([0.05, 0.05, 0.05], 1.0)[0];
        let alto = fundo_tonemapeado([0.5, 0.5, 0.5], 1.0)[0];
        assert!(alto > baixo);
    }
}
