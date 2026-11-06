//! Medição do denoise (fase 6) na casa de alto padrão, 1280 x 720, câmera da cena.
//!
//! 1. Referência convergida: N = `--n-ref` (1024 por padrão) em duas cadeias independentes (sementes 13
//!    e 17), sem denoise. A média das duas é a referência. A diferença entre elas dá o ruído da própria
//!    referência (sigma = std(R1 - R2) / 2 numa região plana).
//! 2. Duas cadeias de teste (sementes 7 e 11) até 64 amostras. Em N = 8, 16, 32 e 64, cada conjunto de
//!    parâmetros do denoise roda sobre o acumulado daquele instante, com o G-buffer do passe 0.
//! 3. Métricas contra a referência, para o sem denoise e para cada conjunto: RMSE e erro relativo médio
//!    de luminância (sum |g - r| / sum r); ruído numa região plana (sigma = std(A - B)/sqrt 2); desvio
//!    padrão da fachada (textura); largura 10-90 % de uma aresta casa/céu.
//! 4. Prova visual: PNG de N = 16 sem denoise, N = 16 com o perfil padrão e a referência.
//!
//! Uso: `cargo run --release --example denoise_casa -- --cena <casa_tex.hstr> --saida <dir>
//!   [--n-ref 1024] [--parede x,y,w,h] [--borda y,x0,x1]`

use std::time::Instant;

use render_core::cena::Cena;
use render_core::tonemap::mapear_cor;
use render_core::vetor::Vec3;
use render_pt0::bvh::Bvh;
use render_pt0::denoise::{Parametros, Perfil};
use render_pt0::gpu::{Ambiente, Ceu, Configuracao, Especular, Prototipo};
use render_pt0::luminancia;

const SEMENTES_REF: (u32, u32) = (13, 17);
const SEMENTES_TESTE: (u32, u32) = (7, 11);
const NS: [u32; 4] = [8, 16, 32, 64];
const LARGURA: u32 = 1280;
const ALTURA: u32 = 720;
const RAIO_SOL_GRAUS: f32 = 0.25;

struct Opcoes {
    cena: String,
    saida: String,
    n_ref: u32,
    parede: [u32; 4],
    borda: (u32, u32, u32),
}

fn ler_opcoes() -> Result<Opcoes, String> {
    let mut cena = String::new();
    let mut saida = String::new();
    let mut n_ref = 1024u32;
    // Região plana da fachada direita (parede branca, entre a cornija e o telhado, sem janela) e linha de
    // uma aresta casa/céu (y, x0, x1): a parede direita contra o céu, na câmera padrão.
    let mut parede = [750u32, 458, 35, 32];
    let mut borda = (400u32, 950u32, 990u32);
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0;
    while i < args.len() {
        let valor = || args.get(i + 1).cloned().ok_or_else(|| format!("{} sem valor", args[i]));
        match args[i].as_str() {
            "--cena" => cena = valor()?,
            "--saida" => saida = valor()?,
            "--n-ref" => n_ref = valor()?.parse().map_err(|e| format!("{e}"))?,
            "--parede" => parede = ler_quatro(&valor()?)?,
            "--borda" => {
                let [y, x0, x1] = ler_tres(&valor()?)?;
                borda = (y, x0, x1);
            }
            outro => return Err(format!("argumento desconhecido: {outro}")),
        }
        i += 2;
    }
    if cena.is_empty() || saida.is_empty() {
        return Err("uso: --cena <arquivo.hstr> --saida <dir>".into());
    }
    if n_ref < 2 || !n_ref.is_multiple_of(2) {
        return Err("--n-ref precisa ser par (duas cadeias)".into());
    }
    Ok(Opcoes {
        cena,
        saida,
        n_ref,
        parede,
        borda,
    })
}

fn ler_quatro(texto: &str) -> Result<[u32; 4], String> {
    let partes: Result<Vec<u32>, _> = texto.split(',').map(str::parse).collect();
    match partes.map_err(|e| format!("'{texto}': {e}"))?.as_slice() {
        [a, b, c, d] => Ok([*a, *b, *c, *d]),
        _ => Err(format!("'{texto}' precisa de quatro números")),
    }
}

fn ler_tres(texto: &str) -> Result<[u32; 3], String> {
    let partes: Result<Vec<u32>, _> = texto.split(',').map(str::parse).collect();
    match partes.map_err(|e| format!("'{texto}': {e}"))?.as_slice() {
        [a, b, c] => Ok([*a, *b, *c]),
        _ => Err(format!("'{texto}' precisa de três números")),
    }
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

fn rgb_de_rgba(saida: &[f32]) -> Vec<[f32; 3]> {
    saida.chunks_exact(4).map(|c| [c[0], c[1], c[2]]).collect()
}

fn salvar_png(caminho: &str, pixels: &[[f32; 3]]) -> Result<(), String> {
    let mut rgba = Vec::with_capacity(pixels.len() * 4);
    for p in pixels {
        let cor = Vec3::novo(f64::from(p[0]), f64::from(p[1]), f64::from(p[2]));
        let [r, g, b] = mapear_cor(cor, 1.0);
        rgba.extend_from_slice(&[r, g, b, 255]);
    }
    let png = render_core::imagem::codificar_png(LARGURA, ALTURA, &rgba).map_err(|e| format!("{e:?}"))?;
    std::fs::write(caminho, png).map_err(|e| format!("{caminho}: {e}"))
}

fn lum_de(rgb: &[[f32; 3]]) -> Vec<f64> {
    rgb.iter().map(|p| f64::from(luminancia(*p))).collect()
}

/// Valores da região retangular `r` (x, y, w, h) de uma imagem de largura LARGURA.
fn regiao(valores: &[f64], r: [u32; 4]) -> Vec<f64> {
    let [x0, y0, w, h] = r;
    let mut saida = Vec::with_capacity((w * h) as usize);
    for y in y0..y0 + h {
        for x in x0..x0 + w {
            saida.push(valores[(y * LARGURA + x) as usize]);
        }
    }
    saida
}

fn desvio(v: &[f64]) -> f64 {
    let n = v.len() as f64;
    let media = v.iter().sum::<f64>() / n;
    (v.iter().map(|x| (x - media).powi(2)).sum::<f64>() / n).sqrt()
}

/// sigma = std(A - B) / sqrt 2 na região (ruído de uma amostra de cada cadeia).
fn sigma_ruido(a: &[f64], b: &[f64], r: [u32; 4]) -> f64 {
    let diferenca: Vec<f64> = a.iter().zip(b).map(|(x, y)| (x - y) / std::f64::consts::SQRT_2).collect();
    desvio(&regiao(&diferenca, r))
}

/// (RMSE, erro relativo médio) de luminância: sum |g - r| / sum r.
fn erro(g: &[f64], r: &[f64]) -> (f64, f64) {
    let n = g.len() as f64;
    let quadrado: f64 = g.iter().zip(r).map(|(a, b)| (a - b).powi(2)).sum::<f64>() / n;
    let absoluto: f64 = g.iter().zip(r).map(|(a, b)| (a - b).abs()).sum();
    let total: f64 = r.iter().sum();
    (quadrado.sqrt(), absoluto / total)
}

fn mediana(v: &mut [f64]) -> f64 {
    v.sort_by(f64::total_cmp);
    v[v.len() / 2]
}

/// Largura 10-90 % (em pixels) do degrau mais íngreme do perfil. Os platôs são médias de 4 pixels de
/// cada lado do degrau (o ruído da parede não entra no limiar), e os cruzamentos são procurados numa
/// janela curta em volta do degrau. `None` se o perfil não tem degrau medível.
fn largura_10_90(perfil: &[f64]) -> Option<f64> {
    let n = perfil.len();
    if n < 16 {
        return None;
    }
    let k = (0..n - 1).max_by(|&a, &b| (perfil[a + 1] - perfil[a]).abs().total_cmp(&(perfil[b + 1] - perfil[b]).abs()))?;
    let media = |r: std::ops::Range<usize>| -> f64 {
        let v = &perfil[r.start.min(n)..r.end.min(n)];
        v.iter().sum::<f64>() / v.len() as f64
    };
    let a = media(k.saturating_sub(7)..k.saturating_sub(3));
    let b = media(k + 5..k + 9);
    let limiar = |f: f64| a + f * (b - a);
    let (ini, fim) = (k.saturating_sub(4), (k + 5).min(n - 1));
    let cruza = |t: f64| -> Option<f64> {
        (ini..fim).find_map(|i| {
            let (v0, v1) = (perfil[i], perfil[i + 1]);
            ((v0 - t) * (v1 - t) <= 0.0 && v0 != v1).then(|| i as f64 + (t - v0) / (v1 - v0))
        })
    };
    let x10 = cruza(limiar(0.1))?;
    let x90 = cruza(limiar(0.9))?;
    Some((x90 - x10).abs())
}

/// Conjuntos de parâmetros medidos. O primeiro é o padrão do módulo.
fn conjuntos() -> Vec<(&'static str, Parametros)> {
    let padrao = Parametros::perfil(Perfil::Padrao);
    vec![
        ("Rapido (3 passos)", Parametros::perfil(Perfil::Rapido)),
        ("Padrao (5 passos)", padrao),
        ("Padrao, sigma_lum 1", Parametros { sigma_luminancia: 1.0, ..padrao }),
        ("Padrao, sigma_lum 4", Parametros { sigma_luminancia: 4.0, ..padrao }),
        ("Padrao, sigma_normal 128", Parametros { sigma_normal: 128.0, ..padrao }),
    ]
}

/// Uma cadeia de `n_max` passes. Em cada N de `snapshots`, `ao_snapshot` recebe a média crua daquele
/// instante (o acumulado muda depois, então o denoise tem de rodar aqui). Devolve os tempos por passe.
fn cadeia<F>(
    proto: &mut Prototipo,
    n_max: u32,
    semente: u32,
    snapshots: &[u32],
    mut ao_snapshot: F,
) -> Result<Vec<f64>, String>
where
    F: FnMut(&mut Prototipo, u32, Vec<[f32; 3]>) -> Result<(), String>,
{
    proto.limpar();
    let mut tempos = Vec::with_capacity(n_max as usize);
    for amostra in 0..n_max {
        let t = Instant::now();
        proto.passe(amostra, semente, 0)?;
        tempos.push(t.elapsed().as_secs_f64() * 1000.0);
        let n = amostra + 1;
        if snapshots.contains(&n) {
            let cru = media_do_acumulado(&proto.acumulado()?);
            ao_snapshot(proto, n, cru)?;
        }
    }
    Ok(tempos)
}

/// Roda o denoise sobre o acumulado atual e devolve a imagem e o tempo (ms) até a GPU terminar.
fn denoise_medido(proto: &mut Prototipo, p: &Parametros) -> Result<(Vec<[f32; 3]>, f64), String> {
    proto.sincronizar()?;
    let t = Instant::now();
    proto.denoise(p)?;
    proto.sincronizar()?;
    let ms = t.elapsed().as_secs_f64() * 1000.0;
    Ok((rgb_de_rgba(&proto.denoised()?), ms))
}

fn main() -> Result<(), String> {
    let o = ler_opcoes()?;
    std::fs::create_dir_all(&o.saida).map_err(|e| format!("{}: {e}", o.saida))?;
    let bytes = std::fs::read(&o.cena).map_err(|e| format!("{}: {e}", o.cena))?;
    let cena = Cena::decodificar(&bytes).map_err(|e| format!("{e:?}"))?;
    let bvh = Bvh::construir(&cena)?;
    let mut proto = Prototipo::iniciar(&cena, &bvh, LARGURA, ALTURA, RAIO_SOL_GRAUS.to_radians())?;
    println!("GPU: {} | {LARGURA}x{ALTURA} | parede {:?} | borda {:?}", proto.adaptador(), o.parede, o.borda);
    // Passe final da casa: céu do motor, 4 vértices, sol com disco, especular e ambiente da referência,
    // mapas de material e normal de mapa ligados (como `casa --` padrão).
    proto.definir_ceu(Ceu::Motor)?;
    proto.definir_mapas(true, true);
    proto.definir_configuracao(Configuracao {
        profundidade: 4,
        ambiente: Ambiente::Referencia,
        especular: Especular::BlinnPhong,
        diagnostico: 0,
    })?;
    proto.passe(0, SEMENTES_TESTE.0, 0)?; // aquecimento

    // 1. Referência em duas metades independentes.
    let metade = o.n_ref / 2;
    let t = Instant::now();
    let mut ref_partes = Vec::new();
    for semente in [SEMENTES_REF.0, SEMENTES_REF.1] {
        cadeia(&mut proto, metade, semente, &[metade], |_, _, cru| {
            ref_partes.push(cru);
            Ok(())
        })?;
    }
    println!("referência: {} passes em {:.1} s", o.n_ref, t.elapsed().as_secs_f64());
    let (r1, r2) = (&ref_partes[0], &ref_partes[1]);
    let referencia: Vec<[f32; 3]> = r1.iter().zip(r2).map(|(a, b)| [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5]).collect();
    salvar_png(&format!("{}/ref_n{}.png", o.saida, o.n_ref), &referencia)?;
    let lref = lum_de(&referencia);
    let (l1, l2) = (lum_de(r1), lum_de(r2));
    let sigma_ref = sigma_ruido(&l1, &l2, o.parede) / std::f64::consts::SQRT_2;
    let fachada_ref = desvio(&regiao(&lref, o.parede));
    println!("referência: ruído próprio na fachada sigma {sigma_ref:.5}; desvio da fachada {fachada_ref:.5}");

    // 2. Cadeias de teste, com o denoise de cada conjunto em cada N.
    let conj = conjuntos();
    // Por conjunto: tempos do denoise, e imagens (cadeia A e B) por N.
    let mut tempos_denoise: Vec<Vec<f64>> = vec![Vec::new(); conj.len()];
    let mut crua_a: Vec<Vec<[f32; 3]>> = Vec::new();
    let mut crua_b: Vec<Vec<[f32; 3]>> = Vec::new();
    let mut den_a: Vec<Vec<Vec<[f32; 3]>>> = vec![Vec::new(); conj.len()];
    let mut den_b: Vec<Vec<Vec<[f32; 3]>>> = vec![Vec::new(); conj.len()];
    let mut tempos_a = cadeia(&mut proto, 64, SEMENTES_TESTE.0, &NS, |p, _, cru| {
        for (k, (_, par)) in conj.iter().enumerate() {
            let (img, ms) = denoise_medido(p, par)?;
            tempos_denoise[k].push(ms);
            den_a[k].push(img);
        }
        crua_a.push(cru);
        Ok(())
    })?;
    cadeia(&mut proto, 64, SEMENTES_TESTE.1, &NS, |p, _, cru| {
        for (k, (_, par)) in conj.iter().enumerate() {
            let (img, _) = denoise_medido(p, par)?;
            den_b[k].push(img);
        }
        crua_b.push(cru);
        Ok(())
    })?;
    let passe_mediana = mediana(&mut tempos_a);
    println!("passe do path tracer: mediana {passe_mediana:.1} ms (64 passes, cadeia A)");

    // 3. Métricas. Índice 0..4 = N = 8, 16, 32, 64.
    // Largura 10-90 % da aresta na linha `borda` (0 = sem linha medida).
    let medir_linha = |imagem: &[[f32; 3]]| -> Option<f64> {
        if o.borda.0 == 0 {
            return None;
        }
        let l = lum_de(imagem);
        let (y, x0, x1) = o.borda;
        let perfil: Vec<f64> = (x0..=x1).map(|x| l[(y * LARGURA + x) as usize]).collect();
        largura_10_90(&perfil)
    };
    println!("\nReferência: borda 10-90 % {:?} px", medir_linha(&referencia));
    if o.borda.0 > 0 {
        let (y, x0, x1) = o.borda;
        let perfil: Vec<String> = (x0..=x1)
            .map(|x| format!("{:.3}", lref[(y * LARGURA + x) as usize]))
            .collect();
        println!("  perfil da borda (y {y}, x {x0}..{x1}): {}", perfil.join(" "));
    }

    println!("\nErro contra a referência (luminância linear, 1280x720):");
    println!("| N | conjunto | RMSE | erro rel. | ruído fachada | desvio fachada / ref | borda 10-90 % (px) |");
    println!("|---|---|---|---|---|---|---|");
    for (idx, &n) in NS.iter().enumerate() {
        let la = lum_de(&crua_a[idx]);
        let lb = lum_de(&crua_b[idx]);
        let (rmse, rel) = erro(&la, &lref);
        let sigma = sigma_ruido(&la, &lb, o.parede);
        let fachada = desvio(&regiao(&la, o.parede));
        println!(
            "| {n} | sem denoise | {rmse:.5} | {:.2} % | {sigma:.5} | {:.2} | {} |",
            rel * 100.0,
            fachada / fachada_ref,
            medir_linha(&crua_a[idx]).map_or("-".into(), |w| format!("{w:.2}"))
        );
        for (k, (nome, _)) in conj.iter().enumerate() {
            let da = lum_de(&den_a[k][idx]);
            let db = lum_de(&den_b[k][idx]);
            let (rmse_d, rel_d) = erro(&da, &lref);
            let sigma_d = sigma_ruido(&da, &db, o.parede);
            let fachada_d = desvio(&regiao(&da, o.parede));
            println!(
                "| {n} | {nome} | {rmse_d:.5} | {:.2} % | {sigma_d:.5} | {:.2} | {} |",
                rel_d * 100.0,
                fachada_d / fachada_ref,
                medir_linha(&den_a[k][idx]).map_or("-".into(), |w| format!("{w:.2}"))
            );
        }
    }

    // Diagnóstico do RMSE: pixels planos (faixa de luminância da referência em 3x3 abaixo de 0,03) contra
    // pixels de aresta. Se o erro do denoise estiver nas arestas, o RMSE não cai com N e o viés é local.
    let plano: Vec<bool> = (0..LARGURA * ALTURA)
        .map(|i| {
            let (x, y) = (i % LARGURA, i / LARGURA);
            if x == 0 || y == 0 || x + 1 >= LARGURA || y + 1 >= ALTURA {
                return false;
            }
            let mut v = Vec::with_capacity(9);
            for dy in 0..3u32 {
                for dx in 0..3u32 {
                    v.push(lref[((y + dy - 1) * LARGURA + (x + dx - 1)) as usize]);
                }
            }
            let (mn, mx) = v.iter().fold((f64::INFINITY, 0.0f64), |(a, b), &c| (a.min(c), b.max(c)));
            mx - mn < 0.03
        })
        .collect();
    let (qtd_plano, qtd_aresta) = (plano.iter().filter(|b| **b).count(), plano.iter().filter(|b| !**b).count());
    println!("\nRMSE por tipo de pixel ({qtd_plano} planos, {qtd_aresta} de aresta/textura forte):");
    let rmse_mascara = |g: &[f64], m: bool| -> (f64, f64) {
        let pares: Vec<(f64, f64)> = g.iter().zip(&lref).zip(&plano).filter(|(_, p)| **p == m).map(|((a, b), _)| (*a, *b)).collect();
        let n = pares.len() as f64;
        let rmse = (pares.iter().map(|(a, b)| (a - b).powi(2)).sum::<f64>() / n).sqrt();
        let vies = pares.iter().map(|(a, b)| a - b).sum::<f64>() / pares.iter().map(|(_, b)| b).sum::<f64>();
        (rmse, vies)
    };
    for (idx, &n) in NS.iter().enumerate() {
        if n != 16 && n != 64 {
            continue;
        }
        let la = lum_de(&crua_a[idx]);
        let ld = lum_de(&den_a[1][idx]);
        let (rp_c, vp_c) = rmse_mascara(&la, true);
        let (ra_c, va_c) = rmse_mascara(&la, false);
        let (rp_d, vp_d) = rmse_mascara(&ld, true);
        let (ra_d, va_d) = rmse_mascara(&ld, false);
        println!(
            "  N {n:2}: sem denoise planos RMSE {rp_c:.5} viés {:+.2} % | arestas RMSE {ra_c:.5} viés {:+.2} %",
            vp_c * 100.0,
            va_c * 100.0
        );
        println!(
            "         Padrao       planos RMSE {rp_d:.5} viés {:+.2} % | arestas RMSE {ra_d:.5} viés {:+.2} %",
            vp_d * 100.0,
            va_d * 100.0
        );
    }

    // Viés com sinal (média do denoise / média da referência - 1) em três regiões planas, em N = 16 e 64,
    // para ver se o erro é ruído ou deslocamento de cor.
    let regioes = [("céu", [100u32, 100, 150, 100]), ("telhado", [400, 300, 150, 60]), ("fachada", o.parede)];
    println!("\nViés com sinal (média / referência - 1), em luminância:");
    for (idx, &n) in NS.iter().enumerate() {
        if n != 16 && n != 64 {
            continue;
        }
        let la = lum_de(&crua_a[idx]);
        let ld = lum_de(&den_a[1][idx]);
        for (nome, r) in regioes {
            let m_ref = regiao(&lref, r).iter().sum::<f64>();
            let m_cru = regiao(&la, r).iter().sum::<f64>();
            let m_den = regiao(&ld, r).iter().sum::<f64>();
            println!(
                "  N {n:2} {nome:8}: sem denoise {:+.2} %, Padrao {:+.2} %",
                (m_cru / m_ref - 1.0) * 100.0,
                (m_den / m_ref - 1.0) * 100.0
            );
        }
    }

    // Tempo do denoise: 20 chamadas sobre o acumulado final (N = 64, cadeia B), GPU terminada.
    println!("\nTempo do denoise (ms, 20 chamadas sobre o N = 64 final, GPU terminada): mediana [mín, máx]");
    for (nome, par) in &conj {
        let mut tempos = Vec::with_capacity(20);
        for _ in 0..20 {
            tempos.push(denoise_medido(&mut proto, par)?.1);
        }
        let (minimo, maximo) = (tempos.iter().copied().fold(f64::INFINITY, f64::min), tempos.iter().copied().fold(0.0, f64::max));
        println!("  {nome}: {:.2} [{minimo:.2}, {maximo:.2}]", mediana(&mut tempos));
    }
    println!("  passe do path tracer (mediana, cadeia A): {passe_mediana:.1} ms");

    // Perfil da aresta com o denoise padrão em N = 16, para ver se o contorno ficou mais duro.
    if o.borda.0 > 0 {
        let (y, x0, x1) = o.borda;
        let ld = lum_de(&den_a[1][1]);
        let perfil: Vec<String> = (x0..=x1).map(|x| format!("{:.3}", ld[(y * LARGURA + x) as usize])).collect();
        println!("  perfil denoisado N=16 (y {y}, x {x0}..{x1}): {}", perfil.join(" "));
    }

    // 4. Prova visual: N = 16 sem denoise e com o padrão, e a referência (já salva).
    let idx16 = 1;
    salvar_png(&format!("{}/raw_n16.png", o.saida), &crua_a[idx16])?;
    salvar_png(&format!("{}/den_n16.png", o.saida), &den_a[1][idx16])?;
    println!("\nimagens em {}", o.saida);
    Ok(())
}
