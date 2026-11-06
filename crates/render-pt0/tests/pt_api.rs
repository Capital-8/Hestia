//! Testes com GPU da API pública do modo pt (`Pt0`), comparados com o protótipo (`Prototipo`) na mesma
//! cena, configuração e sementes. Marcados `#[ignore]`: rode com
//! `cargo test --test pt_api -- --ignored --nocapture`.
//!
//! Cena: a variável `HESTIA_CENA_PT` aponta para um `.hstr` (ex.: a casa com textura); sem ela, usa o
//! fixture `render-engine/tests/fixtures/cena-h1.hstr`.

use std::cell::Cell;
use std::sync::atomic::{AtomicBool, Ordering};

use render_core::cena::Cena;
use render_pt0::bvh::Bvh;
use render_pt0::denoise::{Parametros, Perfil};
use render_pt0::gpu::{criar_dispositivo, Ceu, Configuracao, Prototipo};
use render_pt0::{ErroPt, Limites, Opcoes, Pt0};

const SEMENTE: u32 = 7;
const GIB: u64 = 1024 * 1024 * 1024;

fn carregar_cena() -> Cena {
    let caminho = std::env::var("HESTIA_CENA_PT").unwrap_or_else(|_| {
        concat!(env!("CARGO_MANIFEST_DIR"), "/../render-engine/tests/fixtures/cena-h1.hstr").to_string()
    });
    let bytes = std::fs::read(&caminho).unwrap_or_else(|e| panic!("cena {caminho}: {e}"));
    Cena::decodificar(&bytes).unwrap_or_else(|e| panic!("cena {caminho} inválida: {e}"))
}

/// Raio do sol do exemplo `casa` (0,25 grau), calculado do mesmo jeito.
fn raio_sol() -> f32 {
    0.25f64.to_radians() as f32
}

fn pt0(orcamento_bytes: u64) -> Pt0 {
    let (nome, dispositivo, fila) = criar_dispositivo().expect("GPU");
    println!("GPU: {nome}");
    Pt0::novo(
        dispositivo,
        fila,
        Limites {
            orcamento_bytes,
            lado_maximo_textura: 16_384,
        },
    )
    .expect("Pt0::novo")
}

/// Média por pixel de um acumulado RGBA32F (soma e contagem no alfa), como o exemplo `casa`.
fn media_do_acumulado(acumulado: &[f32]) -> Vec<[f32; 3]> {
    acumulado
        .chunks_exact(4)
        .map(|c| {
            let n = c[3].max(1.0);
            [c[0] / n, c[1] / n, c[2] / n]
        })
        .collect()
}

/// (diferença média absoluta por canal, diferença máxima, média de referência por canal).
fn comparar(a: &[[f32; 3]], b: &[[f32; 3]]) -> (f64, f64, f64) {
    assert_eq!(a.len(), b.len(), "tamanhos diferentes");
    let mut soma = 0.0f64;
    let mut maximo = 0.0f64;
    let mut referencia = 0.0f64;
    for (p, q) in a.iter().zip(b) {
        for k in 0..3 {
            let d = f64::from(p[k] - q[k]).abs();
            soma += d;
            maximo = maximo.max(d);
            referencia += f64::from(q[k]).abs();
        }
    }
    let n = (a.len() * 3) as f64;
    (soma / n, maximo, referencia / n)
}

#[test]
#[ignore = "requer GPU"]
fn pt0_coincide_com_o_prototipo_sem_denoise() {
    let cena = carregar_cena();
    let (largura, altura, n) = (320u32, 180u32, 8u32);

    let bvh = Bvh::construir(&cena).expect("bvh");
    let mut proto = Prototipo::iniciar(&cena, &bvh, largura, altura, raio_sol()).expect("protótipo");
    proto.definir_ceu(Ceu::Motor).expect("céu");
    proto.definir_mapas(true, true);
    proto.definir_configuracao(Configuracao::referencia(4)).expect("config");
    for i in 0..n {
        proto.passe(i, SEMENTE, 0).expect("passe do protótipo");
    }
    let referencia = media_do_acumulado(&proto.acumulado().expect("acumulado"));

    let pt = pt0(2 * GIB);
    let cena_pt = pt.carregar_cena(&cena).expect("carregar_cena");
    let opcoes = Opcoes {
        raio_sol: raio_sol(),
        semente: SEMENTE,
        ..Opcoes::default()
    };
    let mut acumulacao = pt
        .iniciar(&cena_pt, &cena.camera, largura, altura, opcoes)
        .expect("iniciar");
    for i in 1..=n {
        assert_eq!(acumulacao.passe().expect("passe"), i);
    }
    let radiancia = acumulacao.radiancia().expect("radiância");
    let (media, maximo, media_ref) = comparar(&radiancia, &referencia);
    println!(
        "sem denoise: diferença média {media:.3e}, máxima {maximo:.3e}, média de referência {media_ref:.4} (linear)"
    );
    assert!(
        media <= 1e-3 * media_ref.max(1e-6),
        "diferença média {media:.3e} acima de 0,1% da média {media_ref:.4}"
    );
}

#[test]
#[ignore = "requer GPU"]
fn pt0_coincide_com_o_prototipo_com_denoise() {
    let cena = carregar_cena();
    let (largura, altura, n) = (320u32, 180u32, 8u32);

    let bvh = Bvh::construir(&cena).expect("bvh");
    let mut proto = Prototipo::iniciar(&cena, &bvh, largura, altura, raio_sol()).expect("protótipo");
    proto.definir_ceu(Ceu::Motor).expect("céu");
    proto.definir_mapas(true, true);
    proto.definir_configuracao(Configuracao::referencia(4)).expect("config");
    for i in 0..n {
        proto.passe(i, SEMENTE, 0).expect("passe do protótipo");
    }
    proto
        .denoise(&Parametros::perfil(Perfil::Padrao))
        .expect("denoise do protótipo");
    let referencia: Vec<[f32; 3]> = proto
        .denoised()
        .expect("denoised")
        .chunks_exact(4)
        .map(|c| [c[0], c[1], c[2]])
        .collect();

    let pt = pt0(2 * GIB);
    let cena_pt = pt.carregar_cena(&cena).expect("carregar_cena");
    let opcoes = Opcoes {
        denoise: true,
        raio_sol: raio_sol(),
        semente: SEMENTE,
        ..Opcoes::default()
    };
    let mut acumulacao = pt
        .iniciar(&cena_pt, &cena.camera, largura, altura, opcoes)
        .expect("iniciar");
    for _ in 0..n {
        acumulacao.passe().expect("passe");
    }
    let radiancia = acumulacao.radiancia().expect("radiância com denoise");
    let (media, maximo, media_ref) = comparar(&radiancia, &referencia);
    println!(
        "com denoise: diferença média {media:.3e}, máxima {maximo:.3e}, média de referência {media_ref:.4} (linear)"
    );
    assert!(
        media <= 1e-3 * media_ref.max(1e-6),
        "diferença média {media:.3e} acima de 0,1% da média {media_ref:.4}"
    );
}

#[test]
#[ignore = "requer GPU"]
fn imagem_final_nao_e_preta_e_tem_tom_do_motor() {
    let cena = carregar_cena();
    let pt = pt0(2 * GIB);
    let cena_pt = pt.carregar_cena(&cena).expect("carregar_cena");
    let cancelar = AtomicBool::new(false);
    let opcoes = Opcoes {
        raio_sol: raio_sol(),
        ..Opcoes::default()
    };
    let inicio = std::time::Instant::now();
    let imagem = pt
        .renderizar(&cena_pt, &cena.camera, 320, 180, 16, opcoes, &mut |_, _| {}, &cancelar)
        .expect("renderizar");
    println!("16 amostras 320x180 em {:.0} ms", inicio.elapsed().as_secs_f64() * 1000.0);
    assert_eq!(imagem.rgba.len(), 320 * 180 * 4);
    let soma: u64 = imagem.rgba.chunks_exact(4).map(|c| u64::from(c[0]) + u64::from(c[1]) + u64::from(c[2])).sum();
    let media = soma as f64 / (320.0 * 180.0 * 3.0);
    println!("média RGB da imagem: {media:.1} de 255");
    assert!(media > 5.0, "imagem praticamente preta (média {media:.1})");
    assert!(imagem.rgba.chunks_exact(4).all(|c| c[3] == 255), "alfa deve ser 255");
}

#[test]
#[ignore = "requer GPU"]
fn cancelamento_entre_passes_para_no_meio() {
    let cena = carregar_cena();
    let pt = pt0(2 * GIB);
    let cena_pt = pt.carregar_cena(&cena).expect("carregar_cena");
    let cancelar = AtomicBool::new(false);
    let vistos = Cell::new(0u32);
    let resultado = pt.renderizar(
        &cena_pt,
        &cena.camera,
        320,
        180,
        64,
        Opcoes::default(),
        &mut |feitas, _| {
            vistos.set(feitas);
            if feitas == 3 {
                cancelar.store(true, Ordering::SeqCst);
            }
        },
        &cancelar,
    );
    assert_eq!(resultado.err(), Some(ErroPt::Cancelado));
    assert_eq!(vistos.get(), 3, "deve parar logo após o passe em que cancelou");
}

#[test]
#[ignore = "requer GPU"]
fn memoria_recusa_com_numeros_antes_de_alocar() {
    let cena = carregar_cena();
    // Orçamento de 1 byte: nem a cena cabe.
    let pequeno = pt0(1);
    match pequeno.carregar_cena(&cena) {
        Err(ErroPt::Memoria { necessario, orcamento }) => {
            assert_eq!(orcamento, 1);
            assert!(necessario > 1);
            println!("recusa da cena: necessário {necessario} bytes, orçamento {orcamento}");
        }
        outro => panic!("esperava recusa de memória, veio {:?}", outro.map(|_| ())),
    }
    // Render de 16384x16384 com denoise nunca cabe em 2 GiB: recusado em `iniciar`, sem alocar.
    let pt = pt0(2 * GIB);
    let cena_pt = pt.carregar_cena(&cena).expect("carregar_cena");
    match pt.iniciar(&cena_pt, &cena.camera, 16_384, 16_384, Opcoes { denoise: true, ..Opcoes::default() }) {
        Err(ErroPt::Memoria { necessario, orcamento }) => {
            assert_eq!(orcamento, 2 * GIB);
            println!("recusa do render 16384x16384: necessário {:.0} MiB", necessario as f64 / 1_048_576.0);
        }
        outro => panic!("esperava recusa de memória, veio {:?}", outro.map(|_| ())),
    }
}
