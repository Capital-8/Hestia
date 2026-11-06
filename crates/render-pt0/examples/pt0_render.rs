//! Prova do protótipo: renderiza uma cena HSTR com a GPU (acumulação progressiva), compara a
//! sombra direta com a referência de CPU e mede tempos e ruído.
//!
//! Uso (tudo opcional, com padrões):
//! `cargo run --release --example pt0_render -- --cena <hstr> --saida <dir> --largura 640 --altura 360
//!   --spp 64 --tile 0 --raio-sol-graus 0 --ref-spp 256 --cpu-ref-spp 64
//!   --regiao-parede x,y,w,h --regiao-penumbra x,y,w,h`
//!
//! Saídas em `<dir>`: `pt_n16.png`, `pt_n64.png` (GPU, N amostras), `cpu_direto.png` (referência
//! de CPU só com sol direto) e `cpu_ref.png` (tracer completo do `render-core`, com céu e rebotes;
//! só para a prova visual, não entra nas métricas).
//!
//! Ferramenta de medição, não parte do render de produção.

use std::sync::atomic::AtomicBool;
use std::time::Instant;

use render_core::cena::Cena;
use render_core::tonemap::mapear_cor;
use render_core::vetor::Vec3;
use render_core::Trabalho;
use render_pt0::bvh::Bvh;
use render_pt0::gpu::Prototipo;
use render_pt0::{luminancia, referencia};

#[derive(Debug)]
struct Opcoes {
    cena: String,
    saida: String,
    largura: u32,
    altura: u32,
    spp: u32,
    tile: u32,
    raio_sol_graus: f64,
    ref_spp: u32,
    cpu_ref_spp: u32,
    parede: Option<[u32; 4]>,
    penumbra: Option<[u32; 4]>,
}

fn ler_retangulo(texto: &str) -> Result<[u32; 4], String> {
    let partes: Result<Vec<u32>, _> = texto.split(',').map(str::parse).collect();
    match partes.map_err(|e| format!("retângulo '{texto}': {e}"))?.as_slice() {
        [x, y, w, h] => Ok([*x, *y, *w, *h]),
        _ => Err(format!("retângulo '{texto}' precisa de x,y,w,h")),
    }
}

fn ler_opcoes() -> Result<Opcoes, String> {
    let padrao_cena = format!(
        "{}/../render-engine/tests/fixtures/cena-h1.hstr",
        env!("CARGO_MANIFEST_DIR")
    );
    let mut o = Opcoes {
        cena: padrao_cena,
        saida: ".".into(),
        largura: 640,
        altura: 360,
        spp: 64,
        tile: 0,
        raio_sol_graus: 0.0,
        ref_spp: 256,
        cpu_ref_spp: 64,
        parede: None,
        penumbra: None,
    };
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0;
    while i < args.len() {
        let valor = || args.get(i + 1).cloned().ok_or_else(|| format!("{} sem valor", args[i]));
        let chave = args[i].as_str();
        match chave {
            "--cena" => o.cena = valor()?,
            "--saida" => o.saida = valor()?,
            "--largura" => o.largura = valor()?.parse().map_err(|e| format!("{e}"))?,
            "--altura" => o.altura = valor()?.parse().map_err(|e| format!("{e}"))?,
            "--spp" => o.spp = valor()?.parse().map_err(|e| format!("{e}"))?,
            "--tile" => o.tile = valor()?.parse().map_err(|e| format!("{e}"))?,
            "--raio-sol-graus" => o.raio_sol_graus = valor()?.parse().map_err(|e| format!("{e}"))?,
            "--ref-spp" => o.ref_spp = valor()?.parse().map_err(|e| format!("{e}"))?,
            "--cpu-ref-spp" => o.cpu_ref_spp = valor()?.parse().map_err(|e| format!("{e}"))?,
            "--regiao-parede" => o.parede = Some(ler_retangulo(&valor()?)?),
            "--regiao-penumbra" => o.penumbra = Some(ler_retangulo(&valor()?)?),
            outro => return Err(format!("argumento desconhecido: {outro}")),
        }
        i += 2;
    }
    Ok(o)
}

/// Converte luminância linear em PNG com o mesmo tone mapping do `render-core` (exposição 1).
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

/// Desvio padrão espacial de Y dentro de um retângulo (em região de valor real constante, é ruído).
fn desvio_regiao(pixels: &[[f32; 3]], largura: u32, r: [u32; 4]) -> f64 {
    let [x0, y0, w, h] = r;
    let mut valores = Vec::with_capacity((w * h) as usize);
    for y in y0..y0 + h {
        for x in x0..x0 + w {
            valores.push(f64::from(luminancia(pixels[(y * largura + x) as usize])));
        }
    }
    let n = valores.len() as f64;
    let media = valores.iter().sum::<f64>() / n;
    (valores.iter().map(|v| (v - media).powi(2)).sum::<f64>() / n).sqrt()
}

/// Erro quadrático médio de luminância dentro de um retângulo, contra a referência.
fn erro_regiao(pixels: &[[f32; 3]], referencia_px: &[[f32; 3]], largura: u32, r: [u32; 4]) -> f64 {
    let [x0, y0, w, h] = r;
    let mut soma = 0.0;
    for y in y0..y0 + h {
        for x in x0..x0 + w {
            let i = (y * largura + x) as usize;
            let d = f64::from(luminancia(pixels[i]) - luminancia(referencia_px[i]));
            soma += d * d;
        }
    }
    (soma / f64::from(w * h)).sqrt()
}

/// Diferença média relativa de luminância: média de |Y_gpu - Y_ref| dividida pela média de Y_ref.
/// Pixels de fundo (Y_ref = 0) entram no cálculo; o valor sem fundo sai à parte.
fn comparar(gpu: &[[f32; 3]], referencia_px: &[[f32; 3]]) -> (f64, f64, f64) {
    let mut soma_dif = 0.0;
    let mut soma_ref = 0.0;
    let mut soma_gpu = 0.0;
    let mut soma_dif_sem_fundo = 0.0;
    let mut soma_ref_sem_fundo = 0.0;
    for (g, r) in gpu.iter().zip(referencia_px) {
        let yg = f64::from(luminancia(*g));
        let yr = f64::from(luminancia(*r));
        soma_dif += (yg - yr).abs();
        soma_ref += yr;
        soma_gpu += yg;
        if yr > 0.0 {
            soma_dif_sem_fundo += (yg - yr).abs();
            soma_ref_sem_fundo += yr;
        }
    }
    let total = soma_dif / soma_ref;
    let sem_fundo = soma_dif_sem_fundo / soma_ref_sem_fundo;
    let vies = (soma_gpu - soma_ref) / soma_ref;
    (total, sem_fundo, vies)
}

fn main() -> Result<(), String> {
    let o = ler_opcoes()?;
    std::fs::create_dir_all(&o.saida).map_err(|e| format!("{}: {e}", o.saida))?;
    let bytes = std::fs::read(&o.cena).map_err(|e| format!("{}: {e}", o.cena))?;
    let cena = Cena::decodificar(&bytes).map_err(|e| format!("{e:?}"))?;
    println!(
        "cena {}: {} triângulos, {} materiais, {} texturas, sol azimute {} elevação {} intensidade {}",
        o.cena,
        cena.quantidade_triangulos(),
        cena.materiais.len(),
        cena.texturas.len(),
        cena.sol.azimute,
        cena.sol.elevacao,
        cena.sol.intensidade
    );

    let t0 = Instant::now();
    let bvh = Bvh::construir(&cena)?;
    println!(
        "BVH: {} nós, {} triângulos, profundidade {}, construída em {:.1} ms",
        bvh.nos.len(),
        bvh.tris.len(),
        bvh.profundidade,
        t0.elapsed().as_secs_f64() * 1000.0
    );

    let raio_sol = (o.raio_sol_graus.to_radians()) as f32;
    let t1 = Instant::now();
    let mut proto = Prototipo::iniciar(&cena, &bvh, o.largura, o.altura, raio_sol)?;
    println!(
        "GPU: {} (inicialização {:.0} ms), imagem {}x{}, tile {}, sol {}",
        proto.adaptador(),
        t1.elapsed().as_secs_f64() * 1000.0,
        o.largura,
        o.altura,
        if o.tile == 0 { "imagem inteira".to_string() } else { o.tile.to_string() },
        if raio_sol > 0.0 { format!("disco {} graus", o.raio_sol_graus) } else { "pontual".into() }
    );

    // Referência de CPU (sol direto), com o mesmo raio do disco.
    let t2 = Instant::now();
    let ref_direta = referencia::direto_cpu(&cena, o.largura, o.altura, o.ref_spp, 1, f64::from(raio_sol))?;
    println!(
        "referência CPU (sol direto, {} amostras): {:.1} s",
        o.ref_spp,
        t2.elapsed().as_secs_f64()
    );
    salvar_png(&format!("{}/cpu_direto.png", o.saida), &ref_direta, o.largura, o.altura)?;

    // Passes da GPU, medidos um a um. Os checkpoints N = 16 e N = 64 saem do mesmo acumulado.
    let mut tempos_ms = Vec::with_capacity(o.spp as usize);
    let mut total_s = 0.0;
    let mut resultados: Vec<(u32, Vec<[f32; 3]>)> = Vec::new();
    for amostra in 0..o.spp {
        let t = Instant::now();
        proto.passe(amostra, 7, o.tile)?;
        let ms = t.elapsed().as_secs_f64() * 1000.0;
        tempos_ms.push(ms);
        total_s += ms / 1000.0;
        let n = amostra + 1;
        if n == 16 || n == 64 || n == o.spp {
            let media = media_do_acumulado(&proto.acumulado()?);
            resultados.push((n, media));
        }
    }
    let mut ordenados = tempos_ms.clone();
    ordenados.sort_by(f64::total_cmp);
    let mediana = ordenados[ordenados.len() / 2];
    println!(
        "passes: {} amostras, mediana {:.2} ms por passe 640x360 (mín {:.2}, máx {:.2}), total {:.2} s",
        o.spp,
        mediana,
        ordenados[0],
        ordenados[ordenados.len() - 1],
        total_s
    );

    for (n, media) in &resultados {
        if *n == 16 || *n == 64 {
            salvar_png(&format!("{}/pt_n{n}.png", o.saida), media, o.largura, o.altura)?;
        }
        let (total, sem_fundo, vies) = comparar(media, &ref_direta);
        println!(
            "N={n}: diferença média de luminância vs CPU direto = {:.2} % (sem fundo {:.2} %), viés = {:+.2} %",
            total * 100.0,
            sem_fundo * 100.0,
            vies * 100.0
        );
        if let Some(r) = o.parede {
            println!(
                "N={n}: superfície {:?}: desvio espacial {:.5}, erro RMS vs referência {:.5}",
                r,
                desvio_regiao(media, o.largura, r),
                erro_regiao(media, &ref_direta, o.largura, r)
            );
        }
        if let Some(r) = o.penumbra {
            println!(
                "N={n}: erro RMS de luminância na penumbra {:?} vs referência = {:.5} (desvio espacial {:.5})",
                r,
                erro_regiao(media, &ref_direta, o.largura, r),
                desvio_regiao(media, o.largura, r)
            );
        }
    }

    if o.cpu_ref_spp > 0 {
        let trabalho = Trabalho::novo(o.largura, o.altura, 1.0).map_err(|e| format!("{e:?}"))?;
        let cancelado = AtomicBool::new(false);
        let t3 = Instant::now();
        let png = render_core::renderizar_png(&cena, &trabalho, o.cpu_ref_spp, 1, &cancelado)
            .map_err(|e| format!("{e:?}"))?;
        std::fs::write(format!("{}/cpu_ref.png", o.saida), png).map_err(|e| e.to_string())?;
        println!(
            "tracer completo do render-core ({} amostras, com céu e rebotes): {:.1} s",
            o.cpu_ref_spp,
            t3.elapsed().as_secs_f64()
        );
    }
    println!("saídas em {}", o.saida);
    Ok(())
}
