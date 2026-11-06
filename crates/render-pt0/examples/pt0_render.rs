//! Medição da fase 2 do protótipo: céu, um rebote difuso, custo por passe, corretude e ruído.
//!
//! Três modos na GPU (ver `Modo`): (a) só sol direto, (b) sol + céu, (c) sol + céu + um rebote.
//! Para cada modo: 9 passes cronometrados (mediana), 64 passes no total, e uma segunda cadeia de
//! 64 passes com outra semente, para o ruído (a diferença entre as duas cadeias tira o valor
//! esperado e deixa só o ruído).
//!
//! Corretude: (a) é comparado com a sombra direta da CPU (`referencia::direto_cpu`). (b) e (c) são
//! comparados com o tracer completo do `render-core` (`renderizar_imagem`, com `--cpu-ref-spp`
//! amostras). O tracer do `render-core` devolve RGBA8 já com tone mapping; o valor linear é
//! recuperado por tabela (inverso exato da curva, 256 entradas), com erro de meio código de 8 bits.
//!
//! Uso (tudo opcional): `cargo run --release --example pt0_render -- --saida <dir> --largura 640
//!   --altura 360 --spp 64 --raio-sol-graus 0 --ref-spp 256 --cpu-ref-spp 256
//!   --regiao-parede x,y,w,h`
//!
//! Saídas em `<dir>`: `sol_direto.png` (a), `sol_ceu.png` (b), `sol_ceu_rebote_n64.png` (c),
//! `sol_ceu_rebote_n16.png`, `cpu_direto.png` (sombra direta da CPU) e `cpu_ref.png` (tracer
//! completo do `render-core`, só para a prova visual).
//!
//! Ferramenta de medição, não parte do render de produção.

use std::sync::atomic::AtomicBool;
use std::time::Instant;

use render_core::cena::Cena;
use render_core::tonemap::{aces, mapear_cor};
use render_core::vetor::Vec3;
use render_core::{renderizar_imagem, Trabalho};
use render_pt0::bvh::Bvh;
use render_pt0::gpu::{Ceu, Modo, Prototipo};
use render_pt0::{luminancia, referencia};

/// Uma cadeia: tempos por passe, média em N = 16 e média em N = spp.
type Medicao = (Vec<f64>, Vec<[f32; 3]>, Vec<[f32; 3]>);

/// Uma medição de modo: tempos por passe da cadeia A, médias em N = 16 e N = spp das cadeias A e B.
type Cadeia = (Vec<f64>, Vec<[f32; 3]>, Vec<[f32; 3]>, Vec<[f32; 3]>, Vec<[f32; 3]>);

/// Semente da cadeia principal e da cadeia independente (ruído).
const SEMENTE_A: u32 = 7;
const SEMENTE_B: u32 = 11;

#[derive(Debug)]
struct Opcoes {
    cena: String,
    saida: String,
    largura: u32,
    altura: u32,
    spp: u32,
    raio_sol_graus: f64,
    ref_spp: u32,
    cpu_ref_spp: u32,
    modelo_spp: u32,
    parede: Option<[u32; 4]>,
}

fn ler_retangulo(texto: &str) -> Result<[u32; 4], String> {
    let partes: Result<Vec<u32>, _> = texto.split(',').map(str::parse).collect();
    match partes.map_err(|e| format!("retângulo '{texto}': {e}"))?.as_slice() {
        [x, y, w, h] => Ok([*x, *y, *w, *h]),
        _ => Err(format!("retângulo '{texto}' precisa de x,y,w,h")),
    }
}

fn ler_opcoes() -> Result<Opcoes, String> {
    let mut o = Opcoes {
        cena: format!("{}/../render-engine/tests/fixtures/cena-h1.hstr", env!("CARGO_MANIFEST_DIR")),
        saida: ".".into(),
        largura: 640,
        altura: 360,
        spp: 64,
        raio_sol_graus: 0.0,
        ref_spp: 256,
        cpu_ref_spp: 256,
        modelo_spp: 64,
        parede: None,
    };
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0;
    while i < args.len() {
        let valor = || args.get(i + 1).cloned().ok_or_else(|| format!("{} sem valor", args[i]));
        match args[i].as_str() {
            "--cena" => o.cena = valor()?,
            "--saida" => o.saida = valor()?,
            "--largura" => o.largura = valor()?.parse().map_err(|e| format!("{e}"))?,
            "--altura" => o.altura = valor()?.parse().map_err(|e| format!("{e}"))?,
            "--spp" => o.spp = valor()?.parse().map_err(|e| format!("{e}"))?,
            "--raio-sol-graus" => o.raio_sol_graus = valor()?.parse().map_err(|e| format!("{e}"))?,
            "--ref-spp" => o.ref_spp = valor()?.parse().map_err(|e| format!("{e}"))?,
            "--cpu-ref-spp" => o.cpu_ref_spp = valor()?.parse().map_err(|e| format!("{e}"))?,
            "--modelo-spp" => o.modelo_spp = valor()?.parse().map_err(|e| format!("{e}"))?,
            "--regiao-parede" => o.parede = Some(ler_retangulo(&valor()?)?),
            outro => return Err(format!("argumento desconhecido: {outro}")),
        }
        i += 2;
    }
    if o.spp < 16 {
        return Err("--spp precisa ser pelo menos 16 (o ruído usa N = 16 e N = spp)".into());
    }
    Ok(o)
}

/// Converte luminância linear em PNG com o tone mapping do `render-core` (exposição 1).
fn salvar_png(caminho: &str, pixels: &[[f32; 3]], largura: u32, altura: u32) -> Result<(), String> {
    let mut rgba = Vec::with_capacity(pixels.len() * 4);
    for p in pixels {
        let cor = Vec3::novo(f64::from(p[0]), f64::from(p[1]), f64::from(p[2]));
        let [r, g, b] = mapear_cor(cor, 1.0);
        rgba.extend_from_slice(&[r, g, b, 255]);
    }
    let png = render_core::imagem::codificar_png(largura, altura, &rgba).map_err(|e| format!("{e:?}"))?;
    std::fs::write(caminho, png).map_err(|e| format!("{caminho}: {e}"))
}

/// Média por pixel do acumulado (alfa = contagem de amostras).
fn media_do_acumulado(acumulado: &[f32]) -> Vec<[f32; 3]> {
    acumulado
        .chunks_exact(4)
        .map(|c| {
            let n = c[3].max(1.0);
            [c[0] / n, c[1] / n, c[2] / n]
        })
        .collect()
}

/// Tabela código de 8 bits sRGB -> radiância linear, inversa exata de `aces` e `linear_para_srgb`.
fn tabela_inversa() -> [f32; 256] {
    let mut tabela = [0.0f32; 256];
    for (codigo, saida) in tabela.iter_mut().enumerate() {
        let v = codigo as f64 / 255.0;
        // Inverso da sRGB: a = aces(x).
        let a = if v <= 0.040_45 {
            v / 12.92
        } else {
            ((v + 0.055) / 1.055).powf(2.4)
        };
        // Bisseção em x: aces é monótona crescente.
        let (mut baixo, mut alto) = (0.0f64, 60.0f64);
        for _ in 0..80 {
            let meio = 0.5 * (baixo + alto);
            if aces(meio) < a {
                baixo = meio;
            } else {
                alto = meio;
            }
        }
        *saida = (0.5 * (baixo + alto)) as f32;
    }
    tabela
}

fn rgba_para_linear(rgba: &[u8], tabela: &[f32; 256]) -> Vec<[f32; 3]> {
    rgba.chunks_exact(4)
        .map(|c| [tabela[c[0] as usize], tabela[c[1] as usize], tabela[c[2] as usize]])
        .collect()
}

/// Desvio padrão da luminância numa região.
fn desvio_regiao(pixels: &[f64], largura: u32, r: [u32; 4]) -> f64 {
    let [x0, y0, w, h] = r;
    let mut valores = Vec::with_capacity((w * h) as usize);
    for y in y0..y0 + h {
        for x in x0..x0 + w {
            valores.push(pixels[(y * largura + x) as usize]);
        }
    }
    let n = valores.len() as f64;
    let media = valores.iter().sum::<f64>() / n;
    (valores.iter().map(|v| (v - media).powi(2)).sum::<f64>() / n).sqrt()
}

/// Luminância linear por pixel (Rec. 709) como f64.
fn luminancias(pixels: &[[f32; 3]]) -> Vec<f64> {
    pixels.iter().map(|p| f64::from(luminancia(*p))).collect()
}

/// Diferença média relativa: Σ|Y_gpu − Y_ref| / Σ Y_ref, sobre os pixels com `mascara` verdadeira.
fn diferenca_relativa(gpu: &[f64], referencia_px: &[f64], mascara: &[bool]) -> (f64, f64) {
    let mut soma_dif = 0.0;
    let mut soma_ref = 0.0;
    let mut soma_gpu = 0.0;
    for i in 0..gpu.len() {
        if mascara[i] {
            soma_dif += (gpu[i] - referencia_px[i]).abs();
            soma_ref += referencia_px[i];
            soma_gpu += gpu[i];
        }
    }
    (soma_dif / soma_ref, (soma_gpu - soma_ref) / soma_ref)
}

/// Uma cadeia de `spp` passes no modo dado. Devolve os tempos por passe e as médias em N = 16 e N = spp.
fn rodar_cadeia(
    proto: &mut Prototipo,
    modo: Modo,
    spp: u32,
    semente: u32,
) -> Result<Medicao, String> {
    proto.limpar();
    proto.definir_modo(modo);
    let mut tempos = Vec::with_capacity(spp as usize);
    let mut media16 = Vec::new();
    let mut media_final = Vec::new();
    for amostra in 0..spp {
        let t = Instant::now();
        proto.passe(amostra, semente, 0)?;
        tempos.push(t.elapsed().as_secs_f64() * 1000.0);
        let n = amostra + 1;
        if n == 16 {
            media16 = media_do_acumulado(&proto.acumulado()?);
        }
        if n == spp {
            media_final = media_do_acumulado(&proto.acumulado()?);
        }
    }
    Ok((tempos, media16, media_final))
}

/// Duas cadeias do mesmo modo: a principal (cronometrada) e a independente (só para o ruído).
fn rodar_par(proto: &mut Prototipo, modo: Modo, spp: u32) -> Result<Cadeia, String> {
    let (tempos, m16, mfinal) = rodar_cadeia(proto, modo, spp, SEMENTE_A)?;
    let (_, b16, bfinal) = rodar_cadeia(proto, modo, spp, SEMENTE_B)?;
    Ok((tempos, m16, mfinal, b16, bfinal))
}

fn main() -> Result<(), String> {
    let o = ler_opcoes()?;
    std::fs::create_dir_all(&o.saida).map_err(|e| format!("{}: {e}", o.saida))?;
    let bytes = std::fs::read(&o.cena).map_err(|e| format!("{}: {e}", o.cena))?;
    let cena = Cena::decodificar(&bytes).map_err(|e| format!("{e:?}"))?;
    println!(
        "cena: {} triângulos, {} materiais, sol azimute {} elevação {} intensidade {}, fundo {:?}",
        cena.quantidade_triangulos(),
        cena.materiais.len(),
        cena.sol.azimute,
        cena.sol.elevacao,
        cena.sol.intensidade,
        cena.fundo
    );
    let bvh = Bvh::construir(&cena)?;
    let raio_sol = o.raio_sol_graus.to_radians() as f32;
    let mut proto = Prototipo::iniciar(&cena, &bvh, o.largura, o.altura, raio_sol)?;
    println!("GPU: {} | imagem {}x{} | sol {}", proto.adaptador(), o.largura, o.altura, if raio_sol > 0.0 { "disco" } else { "pontual" });

    // Aquecimento: um passe sem medir, para o clock da GPU subir antes da mediana.
    proto.limpar();
    proto.definir_modo(Modo::SolCeuRebote);
    proto.passe(0, SEMENTE_A, 0)?;

    let modos = [
        (Modo::SolDireto, "a"),
        (Modo::SolCeu, "b"),
        (Modo::SolCeuRebote, "c"),
    ];
    // Céu do motor (padrão): (a), (b) e (c).
    proto.definir_ceu(Ceu::Motor)?;
    let mut cadeias = Vec::new();
    for (modo, _) in modos {
        cadeias.push(rodar_par(&mut proto, modo, o.spp)?);
    }
    // Céu uniforme do fundo da cena (como o render-core): (b) e (c). A (a) não depende do céu.
    proto.definir_ceu(Ceu::Uniforme)?;
    let cadeias_uniforme: Vec<Cadeia> = [Modo::SolCeu, Modo::SolCeuRebote]
        .into_iter()
        .map(|modo| rodar_par(&mut proto, modo, o.spp))
        .collect::<Result<_, _>>()?;
    proto.definir_ceu(Ceu::Motor)?;

    println!("\nCusto por passe ({}x{}, GPU, mediana de 9 passes; total de {} amostras):", o.largura, o.altura, o.spp);
    for ((modo, rotulo), (tempos, _, _, _, _)) in modos.iter().zip(&cadeias) {
        let mut primeiros: Vec<f64> = tempos.iter().take(9).copied().collect();
        primeiros.sort_by(f64::total_cmp);
        let mediana = primeiros[primeiros.len() / 2];
        let total_s: f64 = tempos.iter().sum::<f64>() / 1000.0;
        println!(
            "  ({rotulo}) {:?}: mediana {:.2} ms/passe (mín {:.2}, máx {:.2}), total {} amostras = {:.2} s",
            modo,
            mediana,
            primeiros[0],
            primeiros[primeiros.len() - 1],
            o.spp,
            total_s
        );
    }

    // Ruído: diferença entre as duas cadeias independentes, dividida por sqrt(2), numa região plana.
    let mut ruido_16_64 = Vec::new();
    if let Some(r) = o.parede {
        println!("\nRuído na região {:?} (desvio padrão da luminância, sigma = std(A-B)/sqrt(2)):", r);
        for ((_, rotulo), (_, m16, mfinal, b16, bfinal)) in modos.iter().zip(&cadeias) {
            let s16 = desvio_diferenca(m16, b16, o.largura, r);
            let s64 = desvio_diferenca(mfinal, bfinal, o.largura, r);
            println!("  ({rotulo}) N=16: {s16:.5}  N={}: {s64:.5}  razão {:.2}", o.spp, s16 / s64);
            ruido_16_64.push((s16, s64));
        }
    }

    // Referência de sol direto na CPU (fase 1), para a máscara de faces diretas.
    let t_direto = Instant::now();
    let direto_ref = referencia::direto_cpu(&cena, o.largura, o.altura, o.ref_spp, 1, f64::from(raio_sol))?;
    println!(
        "\nreferência CPU sol direto ({} amostras): {:.1} s",
        o.ref_spp,
        t_direto.elapsed().as_secs_f64()
    );
    salvar_png(&format!("{}/cpu_direto.png", o.saida), &direto_ref, o.largura, o.altura)?;
    let mascara_superficie = referencia::mascara_superficie(&cena, o.largura, o.altura)?;

    // Tracer completo do render-core: céu, especular e rebotes. Só a referência de corretude.
    if o.cpu_ref_spp > 0 {
        let trabalho = Trabalho::novo(o.largura, o.altura, 1.0).map_err(|e| format!("{e:?}"))?;
        let cancelado = AtomicBool::new(false);
        let t = Instant::now();
        let rgba = renderizar_imagem(&cena, &trabalho, o.cpu_ref_spp, 1, &cancelado).map_err(|e| format!("{e:?}"))?;
        println!(
            "tracer completo do render-core ({} amostras, céu e rebotes): {:.1} s",
            o.cpu_ref_spp,
            t.elapsed().as_secs_f64()
        );
        let png = render_core::imagem::codificar_png(o.largura, o.altura, &rgba).map_err(|e| format!("{e:?}"))?;
        std::fs::write(format!("{}/cpu_ref.png", o.saida), png).map_err(|e| e.to_string())?;
        let referencia_lin = rgba_para_linear(&rgba, &tabela_inversa());
        let ref_lum = luminancias(&referencia_lin);
        let direto_lum = luminancias(&direto_ref);
        // Indireta de referência: tracer completo menos sombra direta (inclui especular e o termo de
        // ambiente do tracer). Só como estimativa.
        let ind_ref: Vec<f64> = ref_lum.iter().zip(&direto_lum).map(|(r, d)| r - d).collect();
        let sup: Vec<bool> = mascara_superficie.clone();
        let direta: Vec<bool> = sup.iter().zip(&direto_lum).map(|(s, d)| *s && *d > 1.0e-3).collect();
        let todos = vec![true; ref_lum.len()];

        // Linhas: (rótulo, imagem final da GPU). A indireta usa a imagem (a) como base.
        let linhas: Vec<(String, Vec<[f32; 3]>)> = vec![
            ("a".into(), cadeias[0].2.clone()),
            ("b, céu do motor".into(), cadeias[1].2.clone()),
            ("c, céu do motor".into(), cadeias[2].2.clone()),
            ("b, céu uniforme".into(), cadeias_uniforme[0].2.clone()),
            ("c, céu uniforme".into(), cadeias_uniforme[1].2.clone()),
        ];
        let ind_a = luminancias(&cadeias[0].2);
        println!("\nCorretude (diferença média de luminância vs tracer do render-core; viés com sinal):");
        println!(
            "  faces diretas = superfícies com sol direto na referência ({} px); superfície = {} px",
            direta.iter().filter(|b| **b).count(),
            sup.iter().filter(|b| **b).count()
        );
        for (rotulo, mfinal) in &linhas {
            let g = luminancias(mfinal);
            let (geral, viés_geral) = diferenca_relativa(&g, &ref_lum, &todos);
            let (superficie, _) = diferenca_relativa(&g, &ref_lum, &sup);
            let (diretas, _) = diferenca_relativa(&g, &ref_lum, &direta);
            // Indireta: (GPU − GPU a) contra (referência − sombra direta da CPU), em superfícies.
            let ind_g: Vec<f64> = g.iter().zip(&ind_a).map(|(x, a)| x - a).collect();
            let (indireta, _) = diferenca_relativa(&ind_g, &ind_ref, &sup);
            println!(
                "  ({rotulo}) geral {:.2} % (viés {:+.2} %) | superfície {:.2} % | faces diretas {:.2} % | indireta {:.2} %",
                geral * 100.0,
                viés_geral * 100.0,
                superficie * 100.0,
                diretas * 100.0,
                indireta * 100.0
            );
        }
        let (direto_vs_ref, _) = diferenca_relativa(&direto_lum, &ref_lum, &direta);
        println!(
            "  (referência CPU sol direto contra o tracer completo, faces diretas) {:.2} %",
            direto_vs_ref * 100.0
        );

        // Modelo da GPU em CPU, com as mesmas contas (ver referencia::modelo_cpu). Separa erro de
        // implementação (GPU contra este modelo) de diferença de modelo (contra o render-core).
        if o.modelo_spp > 0 {
            let fundo_cena = cena.fundo.map(|c| [c[0] as f32, c[1] as f32, c[2] as f32]);
            let mut opcoes = vec![
                (Modo::SolCeu, "b, céu do motor", None),
                (Modo::SolCeuRebote, "c, céu do motor", None),
            ];
            if fundo_cena.is_some() {
                opcoes.push((Modo::SolCeu, "b, céu uniforme", fundo_cena));
                opcoes.push((Modo::SolCeuRebote, "c, céu uniforme", fundo_cena));
            }
            println!("\nModelo da GPU em CPU ({} amostras, mesmas contas): diferença média vs GPU de {} amostras", o.modelo_spp, o.spp);
            for (modo, rotulo, fundo) in opcoes {
                let t = Instant::now();
                let parametros = referencia::ParametrosModelo {
                    largura: o.largura,
                    altura: o.altura,
                    spp: o.modelo_spp,
                    semente: 1,
                    modo,
                    fundo_uniforme: fundo,
                    raio_sol: f64::from(raio_sol),
                };
                let cpu = referencia::modelo_cpu(&cena, &parametros)?;
                let cpu_lum = luminancias(&cpu);
                let gpu_img = &linhas.iter().find(|(nome, _)| nome == rotulo).ok_or("linha da GPU ausente")?.1;
                let g = luminancias(gpu_img);
                let ind_g: Vec<f64> = g.iter().zip(&ind_a).map(|(x, a)| x - a).collect();
                let ind_c: Vec<f64> = cpu_lum.iter().zip(&direto_lum).map(|(c, d)| c - d).collect();
                let (geral, viés) = diferenca_relativa(&g, &cpu_lum, &todos);
                let (superficie, _) = diferenca_relativa(&g, &cpu_lum, &sup);
                let (diretas, _) = diferenca_relativa(&g, &cpu_lum, &direta);
                let (indireta, _) = diferenca_relativa(&ind_g, &ind_c, &sup);
                println!(
                    "  ({rotulo}) geral {:.2} % (viés {:+.2} %) | superfície {:.2} % | faces diretas {:.2} % | indireta {:.2} % ({:.1} s)",
                    geral * 100.0,
                    viés * 100.0,
                    superficie * 100.0,
                    diretas * 100.0,
                    indireta * 100.0,
                    t.elapsed().as_secs_f64()
                );
            }
        }
    }

    // Imagens da prova visual (N = spp; e N = 16 do rebote, para ver o ruído).
    for ((_, rotulo), (_, _, mfinal, _, _)) in modos.iter().zip(&cadeias) {
        let nome = match *rotulo {
            "a" => "sol_direto.png",
            "b" => "sol_ceu.png",
            _ => "sol_ceu_rebote_n64.png",
        };
        salvar_png(&format!("{}/{nome}", o.saida), mfinal, o.largura, o.altura)?;
    }
    salvar_png(&format!("{}/sol_ceu_rebote_n16.png", o.saida), &cadeias[2].1, o.largura, o.altura)?;
    println!("\nsaídas em {}", o.saida);
    Ok(())
}

/// Desvio padrão de (A − B)/√2 numa região: estima o ruído de uma cadeia com N amostras.
fn desvio_diferenca(a: &[[f32; 3]], b: &[[f32; 3]], largura: u32, r: [u32; 4]) -> f64 {
    let diferenca: Vec<f64> = a
        .iter()
        .zip(b)
        .map(|(x, y)| f64::from(luminancia(*x) - luminancia(*y)) / std::f64::consts::SQRT_2)
        .collect();
    desvio_regiao(&diferenca, largura, r)
}
