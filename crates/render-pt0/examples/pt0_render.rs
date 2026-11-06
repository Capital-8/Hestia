//! Medição do protótipo (fase 3): corretude contra o tracer do `render-core`, custo por passe e ruído.
//!
//! Três partes, todas com o mesmo `Prototipo` na GPU:
//! 1. Legado da fase 2: (a) só sol direto, (b) sol + céu SH, (c) sol + céu SH + um rebote, com céu do
//!    motor e com céu uniforme. Serve de regressão: os números têm de bater com a fase 2.
//! 2. Fase 3, todas com céu uniforme (o fundo da cena, como o render-core): `direto`, `+ambiente`
//!    (termo da referência, `0,3 * albedo * céu`), `+especular` (Blinn-Phong), `+ambiente +especular`,
//!    e profundidade 2, 3 e 4 com os termos acima em cada vértice.
//! 3. `--diagnostico` (sem corretude): custo do raio de sombra e da travessia por força bruta, e a
//!    ordem de medição (para a anomalia da fase 2, em que o modo (a) era mais lento que o (b)).
//!
//! Cada configuração: duas cadeias de `spp` passes com sementes diferentes. O tempo por passe é a
//! mediana das passagens da cadeia A (com o tempo total). O ruído é std(A - B) / sqrt(2) numa região
//! plana (`--regiao-parede`).
//!
//! Corretude: as linhas são comparadas com o tracer completo do `render-core` (`renderizar_imagem`,
//! `--cpu-ref-spp` amostras, RGBA8 com tone mapping, invertido por tabela). A sombra direta da CPU
//! (`--ref-spp`) serve de referência do termo direto. Os dois resultados ficam em `--cache`, porque
//! são determinísticos para a mesma cena e as mesmas amostras.
//!
//! Uso (tudo opcional): `cargo run --release --example pt0_render -- --saida <dir> --cache <dir>
//!   --largura 640 --altura 360 --spp 64 --raio-sol-graus 0 --ref-spp 256 --cpu-ref-spp 256
//!   --regiao-parede x,y,w,h [--diagnostico]`
//!
//! Ferramenta de medição, não parte do render de produção.

use std::sync::atomic::AtomicBool;
use std::time::Instant;

use render_core::cena::Cena;
use render_core::tonemap::{aces, mapear_cor};
use render_core::vetor::Vec3;
use render_core::{renderizar_imagem, Trabalho};
use render_pt0::bvh::Bvh;
use render_pt0::gpu::{
    Ambiente, Ceu, Configuracao, Especular, Modo, Prototipo, DIAG_FORCA_BRUTA, DIAG_SEM_SOMBRA,
};
use render_pt0::{luminancia, referencia};

/// Uma cadeia: tempos por passe, médias em N = 16 e N = spp da cadeia A, e médias em N = 16 e N = spp da cadeia B.
type Cadeia = (Vec<f64>, Vec<[f32; 3]>, Vec<[f32; 3]>, Vec<[f32; 3]>, Vec<[f32; 3]>);

/// Semente da cadeia principal e da cadeia independente (ruído).
const SEMENTE_A: u32 = 7;
const SEMENTE_B: u32 = 11;
/// Semente da segunda referência do render-core. O `Rng::novo` do render-core mistura a semente e a
/// amostra com XOR nos mesmos bits baixos: as sementes 1 e 2 com 4 ou 64 amostras geram o mesmo
/// conjunto de sequências (imagem idêntica). 256 usa só bits acima dos 8 da amostra, então é independente.
const SEMENTE_REFERENCIA_B: u32 = 256;

#[derive(Debug)]
struct Opcoes {
    cena: String,
    saida: String,
    cache: Option<String>,
    largura: u32,
    altura: u32,
    spp: u32,
    raio_sol_graus: f64,
    ref_spp: u32,
    cpu_ref_spp: u32,
    modelo_spp: u32,
    parede: Option<[u32; 4]>,
    diagnostico: bool,
    aquecimento: u32,
    pausa_ms: u64,
    /// Compara uma segunda referência do render-core (outra semente) com a primeira: o ruído da referência.
    ref_ruido: bool,
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
        cache: None,
        largura: 640,
        altura: 360,
        spp: 64,
        raio_sol_graus: 0.0,
        ref_spp: 256,
        cpu_ref_spp: 256,
        modelo_spp: 64,
        parede: None,
        diagnostico: false,
        aquecimento: 0,
        pausa_ms: 0,
        ref_ruido: false,
    };
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--diagnostico" || args[i] == "--ref-ruido" {
            if args[i] == "--diagnostico" {
                o.diagnostico = true;
            } else {
                o.ref_ruido = true;
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
            "--raio-sol-graus" => o.raio_sol_graus = valor()?.parse().map_err(|e| format!("{e}"))?,
            "--ref-spp" => o.ref_spp = valor()?.parse().map_err(|e| format!("{e}"))?,
            "--cpu-ref-spp" => o.cpu_ref_spp = valor()?.parse().map_err(|e| format!("{e}"))?,
            "--modelo-spp" => o.modelo_spp = valor()?.parse().map_err(|e| format!("{e}"))?,
            "--regiao-parede" => o.parede = Some(ler_retangulo(&valor()?)?),
            "--aquecimento" => o.aquecimento = valor()?.parse().map_err(|e| format!("{e}"))?,
            "--pausa-ms" => o.pausa_ms = valor()?.parse().map_err(|e| format!("{e}"))?,
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
/// Devolve também o viés com sinal: (Σ Y_gpu − Σ Y_ref) / Σ Y_ref.
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

/// Uma cadeia de `spp` passes numa configuração. Devolve os tempos por passe e as médias em N = 16 e N = spp.
fn rodar_cadeia(
    proto: &mut Prototipo,
    configuracao: Configuracao,
    spp: u32,
    semente: u32,
) -> Result<Medicao, String> {
    proto.limpar();
    proto.definir_configuracao(configuracao)?;
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

/// Tempos por passe da cadeia A, médias em N = 16 e N = spp das cadeias A e B.
type Medicao = (Vec<f64>, Vec<[f32; 3]>, Vec<[f32; 3]>);

/// Duas cadeias da mesma configuração: a principal (cronometrada) e a independente (só para o ruído).
fn rodar_par(proto: &mut Prototipo, configuracao: Configuracao, spp: u32) -> Result<Cadeia, String> {
    let (tempos, m16, mfinal) = rodar_cadeia(proto, configuracao, spp, SEMENTE_A)?;
    let (_, b16, bfinal) = rodar_cadeia(proto, configuracao, spp, SEMENTE_B)?;
    Ok((tempos, m16, mfinal, b16, bfinal))
}

/// Mediana, mínimo e máximo de uma lista de tempos (ms).
fn resumo(tempos: &[f64]) -> (f64, f64, f64) {
    let mut ordenados = tempos.to_vec();
    ordenados.sort_by(f64::total_cmp);
    (ordenados[ordenados.len() / 2], ordenados[0], ordenados[ordenados.len() - 1])
}

/// Configurações da fase 3, com céu uniforme. Cada uma é cumulativa ou isolada, como indicado no rótulo.
fn configuracoes_fase3() -> Vec<(&'static str, &'static str, Configuracao)> {
    let base = |profundidade: u32, ambiente: Ambiente, especular: Especular| Configuracao {
        profundidade,
        ambiente,
        especular,
        diagnostico: 0,
    };
    vec![
        ("direto", "f3_direto", base(1, Ambiente::Nenhum, Especular::Nenhum)),
        ("+ambiente (referência)", "f3_ambiente", base(1, Ambiente::Referencia, Especular::Nenhum)),
        ("+especular", "f3_especular", base(1, Ambiente::Nenhum, Especular::BlinnPhong)),
        ("+ambiente +especular", "f3_amb_espec", base(1, Ambiente::Referencia, Especular::BlinnPhong)),
        ("profundidade 2", "f3_prof2", base(2, Ambiente::Referencia, Especular::BlinnPhong)),
        ("profundidade 3", "f3_prof3", base(3, Ambiente::Referencia, Especular::BlinnPhong)),
        ("profundidade 4", "f3_prof4", base(4, Ambiente::Referencia, Especular::BlinnPhong)),
    ]
}

/// Referências de corretude para as métricas de uma linha.
struct Referencias {
    /// Luminância do tracer completo do render-core.
    lum: Vec<f64>,
    /// Indireta de referência: tracer completo menos sombra direta.
    ind: Vec<f64>,
    /// Superfície (o raio do centro acerta geometria).
    sup: Vec<bool>,
    /// Faces diretas: superfície com sol direto na referência.
    direta: Vec<bool>,
    todos: Vec<bool>,
}

struct Metricas {
    geral: f64,
    viés: f64,
    superficie: f64,
    diretas: f64,
    indireta: f64,
}

/// Métricas de uma linha. `base_ind` é a luminância da GPU no termo direto (a), para a indireta.
fn medir(g: &[f64], base_ind: &[f64], r: &Referencias) -> Metricas {
    let (geral, viés) = diferenca_relativa(g, &r.lum, &r.todos);
    let (superficie, _) = diferenca_relativa(g, &r.lum, &r.sup);
    let (diretas, _) = diferenca_relativa(g, &r.lum, &r.direta);
    let ind_g: Vec<f64> = g.iter().zip(base_ind).map(|(x, a)| x - a).collect();
    let (indireta, _) = diferenca_relativa(&ind_g, &r.ind, &r.sup);
    Metricas {
        geral,
        viés,
        superficie,
        diretas,
        indireta,
    }
}

fn imprimir_metricas(rotulo: &str, m: &Metricas) {
    println!(
        "  ({rotulo}) geral {:.2} % (viés {:+.2} %) | superfície {:.2} % | faces diretas {:.2} % | indireta {:.2} %",
        m.geral * 100.0,
        m.viés * 100.0,
        m.superficie * 100.0,
        m.diretas * 100.0,
        m.indireta * 100.0
    );
}

/// Ruído: desvio padrão de (A − B)/√2 numa região plana, para N = 16 e N = spp.
fn ruido(a: &[[f32; 3]], b: &[[f32; 3]], largura: u32, r: [u32; 4]) -> f64 {
    let diferenca: Vec<f64> = a
        .iter()
        .zip(b)
        .map(|(x, y)| f64::from(luminancia(*x) - luminancia(*y)) / std::f64::consts::SQRT_2)
        .collect();
    desvio_regiao(&diferenca, largura, r)
}

/// Lê um cache binário, se existir e tiver o tamanho esperado.
fn ler_cache(o: &Opcoes, nome: &str, bytes_esperados: usize) -> Option<Vec<u8>> {
    let dir = o.cache.as_ref()?;
    let bytes = std::fs::read(format!("{dir}/{nome}")).ok()?;
    (bytes.len() == bytes_esperados).then_some(bytes)
}

fn gravar_cache(o: &Opcoes, nome: &str, bytes: &[u8]) -> Result<(), String> {
    if let Some(dir) = &o.cache {
        std::fs::create_dir_all(dir).map_err(|e| format!("{dir}: {e}"))?;
        std::fs::write(format!("{dir}/{nome}"), bytes).map_err(|e| format!("{dir}/{nome}: {e}"))?;
    }
    Ok(())
}

/// Diagnóstico de custo (parte 3): mesma configuração com e sem raio de sombra, com e sem BVH, e a
/// mesma medição repetida em outra posição da ordem, para separar custo real de efeito de ordem.
fn rodar_diagnostico(proto: &mut Prototipo, spp: u32, aquecimento: u32, pausa_ms: u64) -> Result<(), String> {
    let direto = Configuracao::from(Modo::SolDireto);
    let sh = Configuracao::from(Modo::SolCeu);
    let com = |diagnostico: u32| Configuracao {
        diagnostico,
        ..direto
    };
    let sequencia: Vec<(&str, Configuracao)> = vec![
        ("(a) direto, 1.ª posição", direto),
        ("(b) SH, 2.ª posição", sh),
        ("(a) direto, depois de (b)", direto),
        ("(a) sem raio de sombra", com(DIAG_SEM_SOMBRA)),
        ("(a) travessia por força bruta", com(DIAG_FORCA_BRUTA)),
        ("(a) sem sombra e força bruta", com(DIAG_SEM_SOMBRA | DIAG_FORCA_BRUTA)),
        ("(b) SH, depois de (a)", sh),
        ("(a) direto, última posição", direto),
    ];
    if pausa_ms > 0 {
        std::thread::sleep(std::time::Duration::from_millis(pausa_ms));
    }
    // Aquecimento sem medir: passes da configuração direta, para testar se o tempo lento é de subida da GPU.
    proto.limpar();
    proto.definir_configuracao(direto)?;
    for amostra in 0..aquecimento {
        proto.passe(amostra, SEMENTE_A, 0)?;
    }
    println!("\nDiagnóstico de custo ({spp} passes por linha, GPU, ms por passe; céu uniforme, sem corretude; aquecimento {aquecimento} passes, pausa {pausa_ms} ms):");
    for (rotulo, configuracao) in sequencia {
        let (tempos, _, _) = rodar_cadeia(proto, configuracao, spp, SEMENTE_A)?;
        let (mediana, minimo, maximo) = resumo(&tempos);
        let primeiros: Vec<String> = tempos.iter().take(5).map(|t| format!("{t:.1}")).collect();
        let total_s: f64 = tempos.iter().sum::<f64>() / 1000.0;
        println!(
            "  {rotulo}: mediana {mediana:.2} (mín {minimo:.2}, máx {maximo:.2}), total {total_s:.2} s; primeiros 5: [{}]",
            primeiros.join(", ")
        );
    }
    Ok(())
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
    for (i, m) in cena.materiais.iter().enumerate() {
        println!(
            "  material {i}: cor {:?} rugosidade {:.2} metálico {:.2} transmissão {:.2} emissivo {:?}",
            m.cor_base, m.rugosidade, m.metalico, m.transmissao, m.emissivo
        );
    }
    let bvh = Bvh::construir(&cena)?;
    let raio_sol = o.raio_sol_graus.to_radians() as f32;
    let mut proto = Prototipo::iniciar(&cena, &bvh, o.largura, o.altura, raio_sol)?;
    println!("GPU: {} | imagem {}x{} | sol {}", proto.adaptador(), o.largura, o.altura, if raio_sol > 0.0 { "disco" } else { "pontual" });

    // Aquecimento: um passe sem medir, para o clock da GPU subir antes da primeira medição.
    proto.limpar();
    proto.definir_modo(Modo::SolCeuRebote);
    proto.passe(0, SEMENTE_A, 0)?;
    // Aquecimento longo (opcional, --aquecimento n): tira a GPU do estado de baixo clock após ociosidade.
    for amostra in 0..o.aquecimento {
        proto.passe(amostra, SEMENTE_A, 0)?;
    }

    if o.diagnostico {
        proto.definir_ceu(Ceu::Uniforme)?;
        return rodar_diagnostico(&mut proto, o.spp, o.aquecimento, o.pausa_ms);
    }

    let modos = [
        (Modo::SolDireto, "a"),
        (Modo::SolCeu, "b"),
        (Modo::SolCeuRebote, "c"),
    ];
    // Legado da fase 2, céu do motor: (a), (b) e (c).
    proto.definir_ceu(Ceu::Motor)?;
    let mut cadeias = Vec::new();
    for (modo, _) in modos {
        cadeias.push(rodar_par(&mut proto, Configuracao::from(modo), o.spp)?);
    }
    // Legado da fase 2, céu uniforme do fundo da cena (como o render-core): (b) e (c).
    proto.definir_ceu(Ceu::Uniforme)?;
    let cadeias_uniforme: Vec<Cadeia> = [Modo::SolCeu, Modo::SolCeuRebote]
        .into_iter()
        .map(|modo| rodar_par(&mut proto, Configuracao::from(modo), o.spp))
        .collect::<Result<_, _>>()?;
    // Fase 3, céu uniforme.
    let fase3 = configuracoes_fase3();
    let cadeias_f3: Vec<Cadeia> = fase3
        .iter()
        .map(|(_, _, c)| rodar_par(&mut proto, *c, o.spp))
        .collect::<Result<_, _>>()?;
    proto.definir_ceu(Ceu::Motor)?;

    println!("\nCusto por passe ({}x{}, GPU, mediana de {} passes; total de {} amostras):", o.largura, o.altura, o.spp, o.spp);
    for ((modo, rotulo), (tempos, _, _, _, _)) in modos.iter().zip(&cadeias) {
        let (mediana, minimo, maximo) = resumo(tempos);
        let total_s: f64 = tempos.iter().sum::<f64>() / 1000.0;
        println!("  ({rotulo}) {modo:?}: mediana {mediana:.2} ms/passe (mín {minimo:.2}, máx {maximo:.2}), total {total_s:.2} s");
    }
    for ((rotulo, _, _), (tempos, _, _, _, _)) in fase3.iter().zip(&cadeias_f3) {
        let (mediana, minimo, maximo) = resumo(tempos);
        let total_s: f64 = tempos.iter().sum::<f64>() / 1000.0;
        println!("  (fase 3, uniforme) {rotulo}: mediana {mediana:.2} ms/passe (mín {minimo:.2}, máx {maximo:.2}), total {total_s:.2} s");
    }

    // Ruído: diferença entre as duas cadeias independentes, dividida por sqrt(2), numa região plana.
    if let Some(r) = o.parede {
        println!("\nRuído na região {:?} (desvio padrão da luminância, sigma = std(A-B)/sqrt(2)):", r);
        for ((_, rotulo), (_, m16, mfinal, b16, bfinal)) in modos.iter().zip(&cadeias) {
            let s16 = ruido(m16, b16, o.largura, r);
            let s64 = ruido(mfinal, bfinal, o.largura, r);
            println!("  ({rotulo}) N=16: {s16:.5}  N={}: {s64:.5}  razão {:.2}", o.spp, s16 / s64);
        }
        for ((rotulo, _, _), (_, m16, mfinal, b16, bfinal)) in fase3.iter().zip(&cadeias_f3) {
            let s16 = ruido(m16, b16, o.largura, r);
            let s64 = ruido(mfinal, bfinal, o.largura, r);
            println!("  (fase 3, {rotulo}) N=16: {s16:.5}  N={}: {s64:.5}  razão {:.2}", o.spp, s16 / s64);
        }
    }

    // Referência de sol direto na CPU (fase 1), para a máscara de faces diretas. Com cache.
    let t_direto = Instant::now();
    let nome_direto = format!("direto_{}x{}_s{}_r{}.bin", o.largura, o.altura, o.ref_spp, o.raio_sol_graus);
    let n_px = (o.largura * o.altura) as usize;
    let direto_ref: Vec<[f32; 3]> = match ler_cache(&o, &nome_direto, n_px * 12) {
        Some(bytes) => {
            println!("\nreferência CPU sol direto: cache {nome_direto}");
            bytes
                .chunks_exact(12)
                .map(|c| {
                    let f = |i: usize| f32::from_le_bytes([c[i], c[i + 1], c[i + 2], c[i + 3]]);
                    [f(0), f(4), f(8)]
                })
                .collect()
        }
        None => {
            let calculada = referencia::direto_cpu(&cena, o.largura, o.altura, o.ref_spp, 1, f64::from(raio_sol))?;
            let bytes: Vec<u8> = calculada.iter().flat_map(|p| p.iter().flat_map(|v| v.to_le_bytes())).collect();
            gravar_cache(&o, &nome_direto, &bytes)?;
            println!(
                "\nreferência CPU sol direto ({} amostras): {:.1} s",
                o.ref_spp,
                t_direto.elapsed().as_secs_f64()
            );
            calculada
        }
    };
    salvar_png(&format!("{}/cpu_direto.png", o.saida), &direto_ref, o.largura, o.altura)?;
    let mascara_superficie = referencia::mascara_superficie(&cena, o.largura, o.altura)?;

    // Tracer completo do render-core: céu, especular e rebotes. Referência de corretude.
    if o.cpu_ref_spp > 0 {
        let nome_completo = format!("completo_{}x{}_s{}.rgba", o.largura, o.altura, o.cpu_ref_spp);
        let rgba: Vec<u8> = match ler_cache(&o, &nome_completo, n_px * 4) {
            Some(bytes) => {
                println!("tracer completo do render-core: cache {nome_completo}");
                bytes
            }
            None => {
                let trabalho = Trabalho::novo(o.largura, o.altura, 1.0).map_err(|e| format!("{e:?}"))?;
                let cancelado = AtomicBool::new(false);
                let t = Instant::now();
                let rgba = renderizar_imagem(&cena, &trabalho, o.cpu_ref_spp, 1, &cancelado).map_err(|e| format!("{e:?}"))?;
                println!(
                    "tracer completo do render-core ({} amostras, céu e rebotes): {:.1} s",
                    o.cpu_ref_spp,
                    t.elapsed().as_secs_f64()
                );
                gravar_cache(&o, &nome_completo, &rgba)?;
                rgba
            }
        };
        let png = render_core::imagem::codificar_png(o.largura, o.altura, &rgba).map_err(|e| format!("{e:?}"))?;
        std::fs::write(format!("{}/cpu_ref.png", o.saida), png).map_err(|e| e.to_string())?;
        let referencia_lin = rgba_para_linear(&rgba, &tabela_inversa());
        let ref_lum = luminancias(&referencia_lin);
        let direto_lum = luminancias(&direto_ref);
        let ind_ref: Vec<f64> = ref_lum.iter().zip(&direto_lum).map(|(r, d)| r - d).collect();
        let sup: Vec<bool> = mascara_superficie.clone();
        let direta: Vec<bool> = sup.iter().zip(&direto_lum).map(|(s, d)| *s && *d > 1.0e-3).collect();
        let todos = vec![true; ref_lum.len()];
        let referencias = Referencias {
            lum: ref_lum.clone(),
            ind: ind_ref,
            sup: sup.clone(),
            direta: direta.clone(),
            todos,
        };
        let ind_a = luminancias(&cadeias[0].2);

        println!("\nCorretude (diferença média de luminância vs tracer do render-core; viés com sinal):");
        println!(
            "  faces diretas = superfícies com sol direto na referência ({} px); superfície = {} px",
            direta.iter().filter(|b| **b).count(),
            sup.iter().filter(|b| **b).count()
        );
        // Legado da fase 2.
        let legado: Vec<(&str, &Vec<[f32; 3]>)> = vec![
            ("a", &cadeias[0].2),
            ("b, céu do motor", &cadeias[1].2),
            ("c, céu do motor", &cadeias[2].2),
            ("b, céu uniforme", &cadeias_uniforme[0].2),
            ("c, céu uniforme", &cadeias_uniforme[1].2),
        ];
        for (rotulo, imagem) in &legado {
            let g = luminancias(imagem);
            imprimir_metricas(rotulo, &medir(&g, &ind_a, &referencias));
        }
        // Fase 3.
        println!("  -- fase 3, céu uniforme --");
        for ((rotulo, _, _), (_, _, mfinal, _, _)) in fase3.iter().zip(&cadeias_f3) {
            let g = luminancias(mfinal);
            imprimir_metricas(rotulo, &medir(&g, &ind_a, &referencias));
        }
        // Ruído da própria referência: o tracer com outra semente contra o da semente 1 (mesmas métricas;
        // a diferença é ruído de duas referências, ou seja, cerca de sqrt(2) vezes o ruído de uma).
        if o.ref_ruido {
            let nome_outra = format!("completo_{}x{}_s{}_semente256.rgba", o.largura, o.altura, o.cpu_ref_spp);
            let rgba2: Vec<u8> = match ler_cache(&o, &nome_outra, n_px * 4) {
                Some(bytes) => bytes,
                None => {
                    let trabalho = Trabalho::novo(o.largura, o.altura, 1.0).map_err(|e| format!("{e:?}"))?;
                    let cancelado = AtomicBool::new(false);
                    let rgba2 = renderizar_imagem(&cena, &trabalho, o.cpu_ref_spp, SEMENTE_REFERENCIA_B, &cancelado).map_err(|e| format!("{e:?}"))?;
                    gravar_cache(&o, &nome_outra, &rgba2)?;
                    rgba2
                }
            };
            let ref2_lum = luminancias(&rgba_para_linear(&rgba2, &tabela_inversa()));
            let m = medir(&ref2_lum, &ind_a, &referencias);
            imprimir_metricas("referência, semente 2 contra semente 1 (ruído da referência)", &m);
        }

        // Ruído da GPU: cadeia B contra cadeia A de cada configuração (mesmo N). A diferença média entre
        // duas cadeias independentes é sqrt(2) vezes o erro de uma cadeia contra o valor esperado.
        println!("  -- ruído da GPU (cadeia B contra A, N = {}; divida por sqrt(2) para o erro de uma cadeia) --", o.spp);
        for ((rotulo, _, _), (_, _, mfinal, _, bfinal)) in fase3.iter().zip(&cadeias_f3) {
            let a_lum = luminancias(mfinal);
            let b_lum = luminancias(bfinal);
            let (geral_ruido, _) = diferenca_relativa(&b_lum, &a_lum, &referencias.todos);
            let (diretas_ruido, _) = diferenca_relativa(&b_lum, &a_lum, &referencias.direta);
            println!("  ({rotulo}) geral {:.2} % | faces diretas {:.2} %", geral_ruido * 100.0, diretas_ruido * 100.0);
        }

        // Termo direto isolado: a GPU (direto) contra a sombra direta da CPU, na superfície.
        let g_direto = luminancias(&cadeias_f3[0].2);
        let (direto_vs_cpu, _) = diferenca_relativa(&g_direto, &direto_lum, &sup);
        println!("  (direto da GPU contra sombra direta da CPU, superfície) {:.3} %", direto_vs_cpu * 100.0);
        let (direto_vs_ref, _) = diferenca_relativa(&direto_lum, &ref_lum, &direta);
        println!(
            "  (referência CPU sol direto contra o tracer completo, faces diretas) {:.2} %",
            direto_vs_ref * 100.0
        );

        // Modelo da GPU em CPU (só o legado da fase 2): separa erro de implementação de diferença de modelo.
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
                let imagem = &legado.iter().find(|(nome, _)| *nome == rotulo).ok_or("linha da GPU ausente")?.1;
                let g = luminancias(imagem);
                let ind_c: Vec<f64> = cpu_lum.iter().zip(&direto_lum).map(|(c, d)| c - d).collect();
                let referencias_modelo = Referencias {
                    lum: cpu_lum.clone(),
                    ind: ind_c,
                    sup: sup.clone(),
                    direta: direta.clone(),
                    todos: vec![true; cpu_lum.len()],
                };
                let m = medir(&g, &ind_a, &referencias_modelo);
                println!(
                    "  ({rotulo}) geral {:.2} % (viés {:+.2} %) | superfície {:.2} % | faces diretas {:.2} % | indireta {:.2} % ({:.1} s)",
                    m.geral * 100.0,
                    m.viés * 100.0,
                    m.superficie * 100.0,
                    m.diretas * 100.0,
                    m.indireta * 100.0,
                    t.elapsed().as_secs_f64()
                );
            }
        }
    }

    // Imagens da prova visual (N = spp), legado e fase 3.
    for ((_, rotulo), (_, _, mfinal, _, _)) in modos.iter().zip(&cadeias) {
        let nome = match *rotulo {
            "a" => "sol_direto.png",
            "b" => "sol_ceu.png",
            _ => "sol_ceu_rebote_n64.png",
        };
        salvar_png(&format!("{}/{nome}", o.saida), mfinal, o.largura, o.altura)?;
    }
    for ((_, arquivo, _), (_, _, mfinal, _, _)) in fase3.iter().zip(&cadeias_f3) {
        salvar_png(&format!("{}/{arquivo}_n{}.png", o.saida, o.spp), mfinal, o.largura, o.altura)?;
    }
    println!("\nsaídas em {}", o.saida);
    Ok(())
}
