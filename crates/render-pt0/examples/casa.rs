//! Casa de alto padrão (fase 4 do protótipo): medições de tempo, ruído e corretude.
//!
//! Partes, todas com o mesmo `Prototipo`:
//! 1. Carga: decodificação do HSTR, construção da BVH (tempo e profundidade) e subida para a GPU.
//! 2. Passe final (1280 x 720 por padrão): caminho de 4 vértices, sol com disco de `--raio-sol-graus`,
//!    especular Blinn-Phong da referência (ou GGX com `--ggx`), ambiente da referência (0,3 x albedo x
//!    céu do motor) e céu do motor como fundo. Duas cadeias de `spp` passes (sementes 7 e 11): tempo
//!    por passe (mediana, mín, máx), total, passe mais lento (watchdog), e o ruído numa região plana
//!    (`--parede`) com N = 16 e N = spp. A imagem da cadeia A em N = spp vai para `pt_n<spp>.png`.
//! 3. Travessia isolada: o mesmo passe só com sol direto (profundidade 1), para separar a travessia da BVH
//!    do custo de sombreamento e dos rebotes.
//! 4. `--corretude`: a mesma casa em `--ref-largura` x `--ref-altura` contra o tracer completo do
//!    `render-core` (céu uniforme, sol pontual, como nas fases anteriores). Métricas por categoria de
//!    material: todas, difusas (sem metal nem vidro), metal e vidro. O vidro e o metal diferem por desenho
//!    (ver `pt0.wgsl`), então ficam separados.
//!
//! Uso: `cargo run --release --example casa -- --cena <casa.hstr> --saida <dir> [--cache <dir>]
//!   [--largura 1280 --altura 720 --spp 64 --tile 0 --raio-sol-graus 0.25 --ggx --parede x,y,w,h
//!    --corretude --ref-largura 320 --ref-altura 180 --ref-spp 256]`
//!
//! Ferramenta de medição, não parte do render de produção.

use std::sync::atomic::AtomicBool;
use std::time::Instant;

use render_core::cena::Cena;
use render_core::matematica::{inverter, transformar};
use render_core::tonemap::{aces, mapear_cor};
use render_core::vetor::Vec3;
use render_core::{renderizar_imagem, Trabalho};
use render_pt0::bvh::Bvh;
use render_pt0::gpu::{e_vidro, Ambiente, Ceu, Configuracao, Especular, Prototipo};
use render_pt0::{luminancia, referencia};

const SEMENTE_A: u32 = 7;
const SEMENTE_B: u32 = 11;
/// Semente da referência do render-core (a mesma da corretude da fase 3).
const SEMENTE_REFERENCIA: u32 = 1;
/// Tolerância do deslocamento da origem do raio (igual ao tracer de CPU).
const EPSILON_CPU: f64 = 1.0e-4;

#[derive(Debug)]
struct Opcoes {
    cena: String,
    saida: String,
    cache: Option<String>,
    largura: u32,
    altura: u32,
    spp: u32,
    tile: u32,
    raio_sol_graus: f64,
    ggx: bool,
    parede: Option<[u32; 4]>,
    corretude: bool,
    ref_largura: u32,
    ref_altura: u32,
    ref_spp: u32,
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
        cena: String::new(),
        saida: ".".into(),
        cache: None,
        largura: 1280,
        altura: 720,
        spp: 64,
        tile: 0,
        raio_sol_graus: 0.25,
        ggx: false,
        parede: None,
        corretude: false,
        ref_largura: 320,
        ref_altura: 180,
        ref_spp: 256,
    };
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--ggx" || args[i] == "--corretude" {
            if args[i] == "--ggx" {
                o.ggx = true;
            } else {
                o.corretude = true;
            }
            i += 1;
            continue;
        }
        let valor = || args.get(i + 1).cloned().ok_or_else(|| format!("{} sem valor", args[i]));
        match args[i].as_str() {
            "--cena" => o.cena = valor()?,
            "--saida" => o.saida = valor()?,
            "--cache" => o.cache = Some(valor()?),
            "--largura" => o.largura = valor()?.parse().map_err(|e| format!("{e}"))?,
            "--altura" => o.altura = valor()?.parse().map_err(|e| format!("{e}"))?,
            "--spp" => o.spp = valor()?.parse().map_err(|e| format!("{e}"))?,
            "--tile" => o.tile = valor()?.parse().map_err(|e| format!("{e}"))?,
            "--raio-sol-graus" => o.raio_sol_graus = valor()?.parse().map_err(|e| format!("{e}"))?,
            "--parede" => o.parede = Some(ler_retangulo(&valor()?)?),
            "--ref-largura" => o.ref_largura = valor()?.parse().map_err(|e| format!("{e}"))?,
            "--ref-altura" => o.ref_altura = valor()?.parse().map_err(|e| format!("{e}"))?,
            "--ref-spp" => o.ref_spp = valor()?.parse().map_err(|e| format!("{e}"))?,
            outro => return Err(format!("argumento desconhecido: {outro}")),
        }
        i += 2;
    }
    if o.cena.is_empty() {
        return Err("falta --cena <arquivo.hstr>".into());
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

/// Tabela código de 8 bits sRGB -> radiância linear, inversa de `aces` e `linear_para_srgb`.
fn tabela_inversa() -> [f32; 256] {
    let mut tabela = [0.0f32; 256];
    for (codigo, saida) in tabela.iter_mut().enumerate() {
        let v = codigo as f64 / 255.0;
        let a = if v <= 0.040_45 {
            v / 12.92
        } else {
            ((v + 0.055) / 1.055).powf(2.4)
        };
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

fn luminancias(pixels: &[[f32; 3]]) -> Vec<f64> {
    pixels.iter().map(|p| f64::from(luminancia(*p))).collect()
}

/// Desvio padrão de um vetor numa região retangular de largura `largura`.
fn desvio_regiao(valores: &[f64], largura: u32, r: [u32; 4]) -> f64 {
    let [x0, y0, w, h] = r;
    let mut amostras = Vec::with_capacity((w * h) as usize);
    for y in y0..y0 + h {
        for x in x0..x0 + w {
            amostras.push(valores[(y * largura + x) as usize]);
        }
    }
    let n = amostras.len() as f64;
    let media = amostras.iter().sum::<f64>() / n;
    (amostras.iter().map(|v| (v - media).powi(2)).sum::<f64>() / n).sqrt()
}

/// Ruído: sigma = std(A - B) / sqrt(2) na luminância, numa região plana.
fn ruido(a: &[[f32; 3]], b: &[[f32; 3]], largura: u32, r: [u32; 4]) -> f64 {
    let diferenca: Vec<f64> = a
        .iter()
        .zip(b)
        .map(|(x, y)| f64::from(luminancia(*x) - luminancia(*y)) / std::f64::consts::SQRT_2)
        .collect();
    desvio_regiao(&diferenca, largura, r)
}

/// Diferença média relativa: sum |g - r| / sum r, sobre `mascara`. Devolve também o viés com sinal.
fn diferenca_relativa(g: &[f64], r: &[f64], mascara: &[bool]) -> (f64, f64) {
    let mut soma_dif = 0.0;
    let mut soma_ref = 0.0;
    let mut soma_gpu = 0.0;
    for i in 0..g.len() {
        if mascara[i] {
            soma_dif += (g[i] - r[i]).abs();
            soma_ref += r[i];
            soma_gpu += g[i];
        }
    }
    (soma_dif / soma_ref, (soma_gpu - soma_ref) / soma_ref)
}

/// Mediana, mínimo e máximo de tempos (ms).
fn resumo(tempos: &[f64]) -> (f64, f64, f64) {
    let mut ordenados = tempos.to_vec();
    ordenados.sort_by(f64::total_cmp);
    (ordenados[ordenados.len() / 2], ordenados[0], ordenados[ordenados.len() - 1])
}

/// Uma cadeia de `spp` passes: tempos por passe (ms), média em N = 16 e média em N = spp.
type Cadeia = (Vec<f64>, Vec<[f32; 3]>, Vec<[f32; 3]>);

fn rodar_cadeia(proto: &mut Prototipo, spp: u32, semente: u32, tile: u32) -> Result<Cadeia, String> {
    proto.limpar();
    let mut tempos = Vec::with_capacity(spp as usize);
    let mut media16 = Vec::new();
    let mut media_final = Vec::new();
    for amostra in 0..spp {
        let t = Instant::now();
        proto.passe(amostra, semente, tile)?;
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

/// Categoria do material no primário, por pixel: 0 fundo, 1 difuso, 2 metal, 3 vidro. Usa o centro do pixel,
/// como `mascara_superficie`.
fn categorias(cena: &Cena, largura: u32, altura: u32) -> Result<Vec<u8>, String> {
    let inversa = inverter(&cena.camera.matriz_vp()).ok_or("matriz da câmera não inverte")?;
    let mut saida = Vec::with_capacity((largura * altura) as usize);
    for py in 0..altura {
        for px in 0..largura {
            let ndc_x = ((px as f64 + 0.5) / largura as f64) * 2.0 - 1.0;
            let ndc_y = 1.0 - ((py as f64 + 0.5) / altura as f64) * 2.0;
            let categoria = match raio_da_camera(&inversa, ndc_x, ndc_y) {
                None => 0,
                Some((origem, direcao)) => match cena.intersectar(origem, direcao, EPSILON_CPU, f64::INFINITY) {
                    None => 0,
                    Some(acerto) => {
                        let m = &cena.materiais[acerto.material];
                        if e_vidro(m) {
                            3
                        } else if m.metalico > 0.5 {
                            2
                        } else {
                            1
                        }
                    }
                },
            };
            saida.push(categoria);
        }
    }
    Ok(saida)
}

/// Mesma desprojeção de `tracer::raio_da_camera` (no render-core, privada).
fn raio_da_camera(inversa: &[f64; 16], ndc_x: f64, ndc_y: f64) -> Option<(Vec3, Vec3)> {
    let perto = transformar(inversa, [ndc_x, ndc_y, -1.0, 1.0]);
    let longe = transformar(inversa, [ndc_x, ndc_y, 1.0, 1.0]);
    if perto[3].abs() < 1.0e-12 || longe[3].abs() < 1.0e-12 {
        return None;
    }
    let p0 = Vec3::novo(perto[0] / perto[3], perto[1] / perto[3], perto[2] / perto[3]);
    let p1 = Vec3::novo(longe[0] / longe[3], longe[1] / longe[3], longe[2] / longe[3]);
    let direcao = (p1 - p0).normalizado();
    if direcao.comprimento() < 1.0e-12 {
        return None;
    }
    Some((p0, direcao))
}

/// Referência CPU da casa: tracer completo do render-core e sombra direta (sol pontual, céu uniforme).
/// Cada um com cache, porque a CPU é lenta e o resultado é determinístico para a mesma cena.
/// Par de imagens lineares (w x h): tracer completo e sombra direta.
type ParDeImagens = (Vec<[f32; 3]>, Vec<[f32; 3]>);

fn referencia_cpu(o: &Opcoes, cena: &Cena) -> Result<ParDeImagens, String> {
    let (w, h) = (o.ref_largura, o.ref_altura);
    let n_px = (w * h) as usize;
    let nome_completo = format!("casa_completo_{w}x{h}_s{}.rgba", o.ref_spp);
    let nome_direto = format!("casa_direto_{w}x{h}_s{}.bin", o.ref_spp);
    let cache = |nome: &str, bytes: usize| -> Option<Vec<u8>> {
        let dir = o.cache.as_ref()?;
        let lido = std::fs::read(format!("{dir}/{nome}")).ok()?;
        (lido.len() == bytes).then_some(lido)
    };
    let gravar = |nome: &str, bytes: &[u8]| -> Result<(), String> {
        if let Some(dir) = &o.cache {
            std::fs::create_dir_all(dir).map_err(|e| format!("{dir}: {e}"))?;
            std::fs::write(format!("{dir}/{nome}"), bytes).map_err(|e| format!("{dir}/{nome}: {e}"))?;
        }
        Ok(())
    };
    let rgba: Vec<u8> = match cache(&nome_completo, n_px * 4) {
        Some(b) => {
            println!("tracer completo do render-core: cache {nome_completo}");
            b
        }
        None => {
            let trabalho = Trabalho::novo(w, h, 1.0).map_err(|e| format!("{e:?}"))?;
            let cancelado = AtomicBool::new(false);
            let t = Instant::now();
            let b = renderizar_imagem(cena, &trabalho, o.ref_spp, SEMENTE_REFERENCIA, &cancelado)
                .map_err(|e| format!("{e:?}"))?;
            println!(
                "tracer completo do render-core ({w}x{h}, {} amostras): {:.1} s",
                o.ref_spp,
                t.elapsed().as_secs_f64()
            );
            gravar(&nome_completo, &b)?;
            b
        }
    };
    let tabela = tabela_inversa();
    let completo: Vec<[f32; 3]> = rgba
        .chunks_exact(4)
        .map(|c| [tabela[c[0] as usize], tabela[c[1] as usize], tabela[c[2] as usize]])
        .collect();
    let direto: Vec<[f32; 3]> = match cache(&nome_direto, n_px * 12) {
        Some(bytes) => bytes
            .chunks_exact(12)
            .map(|c| {
                let f = |i: usize| f32::from_le_bytes([c[i], c[i + 1], c[i + 2], c[i + 3]]);
                [f(0), f(4), f(8)]
            })
            .collect(),
        None => {
            let t = Instant::now();
            let calculada = referencia::direto_cpu(cena, w, h, o.ref_spp, 1, 0.0)?;
            println!("sombra direta da CPU ({} amostras): {:.1} s", o.ref_spp, t.elapsed().as_secs_f64());
            let bytes: Vec<u8> = calculada.iter().flat_map(|p| p.iter().flat_map(|v| v.to_le_bytes())).collect();
            gravar(&nome_direto, &bytes)?;
            calculada
        }
    };
    Ok((completo, direto))
}

/// Métricas de uma máscara: erro médio relativo e viés com sinal, da luminância total e da indireta.
struct Linha {
    rotulo: &'static str,
    pixels: usize,
    geral: f64,
    viés: f64,
    diretas: f64,
    indireta: f64,
}

fn linha(
    rotulo: &'static str,
    mascara: &[bool],
    gpu_total: &[f64],
    gpu_direta: &[f64],
    ref_total: &[f64],
    ref_direta: &[f64],
    faces_diretas: &[bool],
) -> Linha {
    let (geral, viés) = diferenca_relativa(gpu_total, ref_total, mascara);
    let mascara_diretas: Vec<bool> = mascara.iter().zip(faces_diretas).map(|(m, d)| *m && *d).collect();
    let (diretas, _) = diferenca_relativa(gpu_direta, ref_direta, &mascara_diretas);
    let ind_g: Vec<f64> = gpu_total.iter().zip(gpu_direta).map(|(t, d)| t - d).collect();
    let ind_r: Vec<f64> = ref_total.iter().zip(ref_direta).map(|(t, d)| t - d).collect();
    let (indireta, _) = diferenca_relativa(&ind_g, &ind_r, mascara);
    Linha {
        rotulo,
        pixels: mascara.iter().filter(|b| **b).count(),
        geral,
        viés,
        diretas,
        indireta,
    }
}

fn imprimir_linha(l: &Linha) {
    println!(
        "  {:<34} {:>7} px | geral {:6.2} % (viés {:+6.2} %) | faces diretas {:6.2} % | indireta {:6.2} %",
        l.rotulo,
        l.pixels,
        l.geral * 100.0,
        l.viés * 100.0,
        l.diretas * 100.0,
        l.indireta * 100.0
    );
}

fn corretude(o: &Opcoes, cena: &Cena, bvh: &Bvh) -> Result<(), String> {
    let (w, h) = (o.ref_largura, o.ref_altura);
    println!("\nCorretude vs tracer do render-core: {w}x{h}, {} amostras, céu uniforme, sol pontual", o.ref_spp);
    let (ref_total_rgb, ref_direta_rgb) = referencia_cpu(o, cena)?;
    let categorias = categorias(cena, w, h)?;
    let sup: Vec<bool> = categorias.iter().map(|c| *c != 0).collect();
    let difusa: Vec<bool> = categorias.iter().map(|c| *c == 1).collect();
    let metal: Vec<bool> = categorias.iter().map(|c| *c == 2).collect();
    let vidro: Vec<bool> = categorias.iter().map(|c| *c == 3).collect();
    let todas = vec![true; categorias.len()];
    let ref_total = luminancias(&ref_total_rgb);
    let ref_direta = luminancias(&ref_direta_rgb);
    // Faces diretas: superfície com sol direto na referência.
    let diretas: Vec<bool> = sup.iter().zip(&ref_direta).map(|(s, d)| *s && *d > 1.0e-3).collect();

    // GPU: céu uniforme e sol pontual, como a referência. Duas configurações: o caminho completo e o
    // direto (profundidade 1, sem ambiente nem especular), que é a base da indireta.
    let mut proto = Prototipo::iniciar(cena, bvh, w, h, 0.0)?;
    proto.definir_ceu(Ceu::Uniforme)?;
    let completo = Configuracao::referencia(4);
    let direto = Configuracao {
        profundidade: 1,
        ambiente: Ambiente::Nenhum,
        especular: Especular::Nenhum,
        diagnostico: 0,
    };
    proto.definir_configuracao(completo)?;
    let (_, _, gpu_total_rgb) = rodar_cadeia(&mut proto, o.ref_spp, SEMENTE_A, 0)?;
    proto.definir_configuracao(direto)?;
    let (_, _, gpu_direta_rgb) = rodar_cadeia(&mut proto, o.ref_spp, SEMENTE_A, 0)?;
    let gpu_total = luminancias(&gpu_total_rgb);
    let gpu_direta = luminancias(&gpu_direta_rgb);

    println!("  (diferença relativa: sum |GPU - ref| / sum ref, por máscara; indireta = total - direto)");
    let linhas = [
        linha("todas as posições", &todas, &gpu_total, &gpu_direta, &ref_total, &ref_direta, &diretas),
        linha("superfícies difusas", &difusa, &gpu_total, &gpu_direta, &ref_total, &ref_direta, &diretas),
        linha("superfícies metálicas", &metal, &gpu_total, &gpu_direta, &ref_total, &ref_direta, &diretas),
        linha("superfícies de vidro", &vidro, &gpu_total, &gpu_direta, &ref_total, &ref_direta, &diretas),
    ];
    for l in &linhas {
        imprimir_linha(l);
    }
    salvar_png(&format!("{}/corretude_gpu_{w}x{h}.png", o.saida), &gpu_total_rgb, w, h)?;
    salvar_png(&format!("{}/corretude_ref_{w}x{h}.png", o.saida), &ref_total_rgb, w, h)?;
    Ok(())
}

fn main() -> Result<(), String> {
    let o = ler_opcoes()?;
    std::fs::create_dir_all(&o.saida).map_err(|e| format!("{}: {e}", o.saida))?;
    let bytes = std::fs::read(&o.cena).map_err(|e| format!("{}: {e}", o.cena))?;
    let t = Instant::now();
    let cena = Cena::decodificar(&bytes).map_err(|e| format!("{e:?}"))?;
    println!(
        "cena: {} triângulos, {} materiais, {} lotes; decodificação {:.1} ms; fundo {:?}",
        cena.quantidade_triangulos(),
        cena.materiais.len(),
        cena.lotes.len(),
        t.elapsed().as_secs_f64() * 1000.0,
        cena.fundo
    );
    for (i, m) in cena.materiais.iter().enumerate() {
        let classe = if e_vidro(m) {
            "vidro"
        } else if m.metalico > 0.5 {
            "metal"
        } else {
            "difuso"
        };
        println!(
            "  material {i:2}: {classe:6} cor {:.2?} rugosidade {:.2} metálico {:.2} transmissão {:.2} opacidade {:.2} IOR {:.2} emissivo {:?}",
            m.cor_base, m.rugosidade, m.metalico, m.transmissao, m.opacidade, m.ior, m.emissivo
        );
    }

    let t = Instant::now();
    let bvh = Bvh::construir(&cena)?;
    let construcao_bvh = t.elapsed().as_secs_f64() * 1000.0;
    let folhas = bvh.nos.iter().filter(|n| n.n > 0).count();
    println!(
        "BVH: {} nós ({folhas} folhas), profundidade {}, construção {construcao_bvh:.1} ms",
        bvh.nos.len(),
        bvh.profundidade
    );

    let raio_sol = o.raio_sol_graus.to_radians() as f32;
    let t = Instant::now();
    let mut proto = Prototipo::iniciar(&cena, &bvh, o.largura, o.altura, raio_sol)?;
    println!(
        "GPU: {} | {}x{} | sol com raio {} grau | subida para a GPU {:.1} ms",
        proto.adaptador(),
        o.largura,
        o.altura,
        o.raio_sol_graus,
        t.elapsed().as_secs_f64() * 1000.0
    );

    // Passe final: céu do motor, caminho de 4 vértices, sol com disco, especular e ambiente da referência.
    let especular = if o.ggx { Especular::Ggx } else { Especular::BlinnPhong };
    let final_cfg = Configuracao {
        profundidade: 4,
        ambiente: Ambiente::Referencia,
        especular,
        diagnostico: 0,
    };
    proto.definir_ceu(Ceu::Motor)?;
    proto.definir_configuracao(final_cfg)?;
    proto.passe(0, SEMENTE_A, o.tile)?; // aquecimento
    let (tempos_a, m16_a, m_a) = rodar_cadeia(&mut proto, o.spp, SEMENTE_A, o.tile)?;
    let (tempos_b, m16_b, m_b) = rodar_cadeia(&mut proto, o.spp, SEMENTE_B, o.tile)?;
    let (mediana, minimo, maximo) = resumo(&tempos_a);
    let total_s: f64 = tempos_a.iter().sum::<f64>() / 1000.0;
    let pior = maximo;
    println!(
        "\nPasse final ({}x{}, profundidade 4, {}, sol raio {} grau, ambiente da referência, céu do motor):",
        o.largura,
        o.altura,
        if o.ggx { "GGX" } else { "Blinn-Phong" },
        o.raio_sol_graus
    );
    println!("  por passe: mediana {mediana:.1} ms (mín {minimo:.1}, máx {maximo:.1}); tile {}", if o.tile == 0 { "imagem inteira".to_string() } else { o.tile.to_string() });
    println!("  {} amostras (cadeia A): total {total_s:.2} s; watchdog: pior passe {pior:.1} ms (limite ~500 ms)", o.spp);
    let (mediana_b, _, _) = resumo(&tempos_b);
    println!("  cadeia B (outra semente): mediana {mediana_b:.1} ms por passe");

    // Travessia isolada: o mesmo passe só com sol direto (profundidade 1, sem ambiente nem especular).
    proto.definir_configuracao(Configuracao {
        profundidade: 1,
        ambiente: Ambiente::Nenhum,
        especular: Especular::Nenhum,
        diagnostico: 0,
    })?;
    let (tempos_dir, _, _) = rodar_cadeia(&mut proto, 16, SEMENTE_A, o.tile)?;
    let (mediana_dir, _, _) = resumo(&tempos_dir);
    println!("  só sol direto (BVH, sombra e 1 vértice): mediana {mediana_dir:.1} ms por passe (16 passes)");
    proto.definir_configuracao(final_cfg)?;

    let nome_final = format!("{}/pt_n{}.png", o.saida, o.spp);
    salvar_png(&nome_final, &m_a, o.largura, o.altura)?;
    salvar_png(&format!("{}/pt_n16.png", o.saida), &m16_a, o.largura, o.altura)?;
    println!("  imagem: {nome_final}");

    if let Some(r) = o.parede {
        let s16 = ruido(&m16_a, &m16_b, o.largura, r);
        let s_final = ruido(&m_a, &m_b, o.largura, r);
        println!(
            "\nRuído na região {:?} (sigma = std(A-B)/sqrt(2), luminância): N=16 {s16:.5} | N={} {s_final:.5} | razão {:.2}",
            r,
            o.spp,
            s16 / s_final
        );
    }

    drop(proto);
    if o.corretude {
        corretude(&o, &cena, &bvh)?;
    }
    println!("\nsaídas em {}", o.saida);
    Ok(())
}
