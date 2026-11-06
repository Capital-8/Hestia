//! A travessia da BVH (a mesma lógica do `pt0.wgsl`) concorda com a força bruta.
//!
//! Dois casos: uma cena sintética (triângulos aleatórios, determinística) e a cena-h1 do
//! `render-engine`. Em cada um, 1000 raios aleatórios: o acerto mais próximo e o teste de sombra
//! (`algum_acerto`) precisam bater com a varredura de todos os triângulos.

use render_core::cena::{Cena, Lote, Material, PartesCena};
use render_core::camera::Camera;
use render_pt0::bvh::{intersectar_forca_bruta, Bvh};

/// Gerador xorshift determinístico (sem dependência extra).
struct Aleatorio(u64);

impl Aleatorio {
    fn proximo(&mut self) -> f64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        (self.0 >> 11) as f64 / (1u64 << 53) as f64
    }

    fn faixa(&mut self, minimo: f64, maximo: f64) -> f64 {
        minimo + (maximo - minimo) * self.proximo()
    }

    fn ponto(&mut self, lado: f64) -> [f32; 3] {
        [
            self.faixa(-lado, lado) as f32,
            self.faixa(-lado, lado) as f32,
            self.faixa(-lado, lado) as f32,
        ]
    }

    fn direcao(&mut self) -> [f32; 3] {
        loop {
            let v = [
                self.faixa(-1.0, 1.0),
                self.faixa(-1.0, 1.0),
                self.faixa(-1.0, 1.0),
            ];
            let c2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
            if (0.01..=1.0).contains(&c2) {
                let c = c2.sqrt();
                return [(v[0] / c) as f32, (v[1] / c) as f32, (v[2] / c) as f32];
            }
        }
    }
}

fn cena_sintetica(triangulos: usize, semente: u64) -> Cena {
    let mut rng = Aleatorio(semente);
    let mut posicoes = Vec::with_capacity(triangulos * 9);
    let mut indices = Vec::with_capacity(triangulos * 3);
    for t in 0..triangulos {
        let centro = [
            rng.faixa(-2.0, 2.0),
            rng.faixa(-2.0, 2.0),
            rng.faixa(-2.0, 2.0),
        ];
        for _ in 0..3 {
            for c in centro {
                posicoes.push(c + rng.faixa(-0.5, 0.5));
            }
        }
        indices.extend([(3 * t) as u32, (3 * t + 1) as u32, (3 * t + 2) as u32]);
    }
    let metade = (indices.len() / 2) as u32;
    let lotes = vec![
        Lote {
            inicio_indices: 0,
            quantidade_indices: metade - metade % 3,
            material: 0,
        },
        Lote {
            inicio_indices: metade - metade % 3,
            quantidade_indices: indices.len() as u32 - (metade - metade % 3),
            material: 1,
        },
    ];
    let materiais = vec![Material::padrao(), Material::padrao()];
    Cena::nova(PartesCena {
        posicoes,
        indices,
        normais: Vec::new(),
        materiais,
        texturas: Vec::new(),
        lotes,
        sol: render_core::cena::Sol::padrao(),
        fundo: None,
        camera: Camera::identidade(),
    })
    .expect("cena sintética válida")
}

/// Compara 1000 raios: acerto mais próximo (distância e triângulo) e sombra (existe algum acerto).
fn comparar_com_forca_bruta(bvh: &Bvh, semente: u64, lado: f64) -> (usize, usize) {
    let mut rng = Aleatorio(semente);
    let mut acertos = 0usize;
    let mut sombras = 0usize;
    for _ in 0..1000 {
        let origem = rng.ponto(lado);
        let direcao = rng.direcao();
        let esperado = intersectar_forca_bruta(&bvh.tris, origem, direcao, 1.0e-4, 1.0e30);
        let obtido = bvh.intersectar(origem, direcao, 1.0e-4, 1.0e30);
        match (esperado, obtido) {
            (None, None) => {}
            (Some(e), Some(o)) => {
                acertos += 1;
                assert!(
                    (e.t - o.t).abs() <= 1.0e-4 * e.t.max(1.0),
                    "distância divergente: força bruta {} x BVH {} (raio {origem:?} {direcao:?})",
                    e.t,
                    o.t
                );
            }
            (e, o) => panic!("acerto divergente: força bruta {e:?} x BVH {o:?}"),
        }
        let sombra_bruta = intersectar_forca_bruta(&bvh.tris, origem, direcao, 1.0e-4, 1.0e30).is_some();
        let sombra_bvh = bvh.algum_acerto(origem, direcao, 1.0e-4, 1.0e30);
        assert_eq!(sombra_bruta, sombra_bvh, "sombra divergente no raio {origem:?} {direcao:?}");
        if sombra_bvh {
            sombras += 1;
        }
    }
    (acertos, sombras)
}

#[test]
fn bvh_concorda_com_forca_bruta_em_cena_sintetica() {
    let cena = cena_sintetica(600, 0x9E37_79B9_7F4A_7C15);
    let bvh = Bvh::construir(&cena).expect("bvh");
    assert!(bvh.profundidade <= render_pt0::bvh::PILHA);
    let (acertos, sombras) = comparar_com_forca_bruta(&bvh, 42, 2.5);
    // O teste só vale se houver acertos reais dos dois lados.
    assert!(acertos > 100, "poucos acertos ({acertos}); o teste não exercita a travessia");
    assert!(sombras > 100, "poucas sombras ({sombras})");
}

#[test]
fn bvh_concorda_com_forca_bruta_na_cena_h1() {
    let caminho = concat!(env!("CARGO_MANIFEST_DIR"), "/../render-engine/tests/fixtures/cena-h1.hstr");
    let bytes = std::fs::read(caminho).expect("fixture cena-h1.hstr");
    let cena = Cena::decodificar(&bytes).expect("cena-h1 decodifica");
    let bvh = Bvh::construir(&cena).expect("bvh");
    assert!(bvh.profundidade <= render_pt0::bvh::PILHA);
    // Raios de dentro da caixa da cena, para acertar de verdade.
    // A raiz (nó 0) envolve toda a cena.
    let (minimo, maximo) = (bvh.nos[0].caixa_min, bvh.nos[0].caixa_max);
    let centro = [0, 1, 2].map(|c| 0.5 * (minimo[c] + maximo[c]));
    let lado = [0, 1, 2].map(|c| 0.5 * (maximo[c] - minimo[c])).into_iter().fold(0.0f32, f32::max);
    let mut rng = Aleatorio(7);
    let mut acertos = 0usize;
    for _ in 0..1000 {
        let origem = [
            centro[0] + rng.faixa(-1.0, 1.0) as f32 * lado,
            centro[1] + rng.faixa(-1.0, 1.0) as f32 * lado,
            centro[2] + rng.faixa(-1.0, 1.0) as f32 * lado,
        ];
        let direcao = rng.direcao();
        let esperado = intersectar_forca_bruta(&bvh.tris, origem, direcao, 1.0e-4, 1.0e30);
        let obtido = bvh.intersectar(origem, direcao, 1.0e-4, 1.0e30);
        match (esperado, obtido) {
            (None, None) => {}
            (Some(e), Some(o)) => {
                acertos += 1;
                assert!((e.t - o.t).abs() <= 1.0e-4 * e.t.max(1.0), "distância divergente: {} x {}", e.t, o.t);
            }
            (e, o) => panic!("acerto divergente na cena-h1: {e:?} x {o:?}"),
        }
        assert_eq!(
            esperado.is_some(),
            bvh.algum_acerto(origem, direcao, 1.0e-4, 1.0e30),
            "sombra divergente na cena-h1"
        );
    }
    assert!(acertos > 100, "poucos acertos na cena-h1 ({acertos})");
}
