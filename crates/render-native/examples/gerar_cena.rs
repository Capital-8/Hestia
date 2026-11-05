//! Gera `cena-teste.hstr` com uma casa simples, sem depender de JavaScript.
//!
//! Uso (a partir de `crates/render-native`):
//! `cargo run --release --example gerar_cena -- cena-teste.hstr`

use std::path::PathBuf;

use render_core::camera::Camera;
use render_core::cena::{Lote, Material, PartesCena, Sol};
use render_core::vetor::Vec3;
use render_core::Cena;

const GRAMA: usize = 0;
const PAREDE: usize = 1;
const TELHADO: usize = 2;
const PORTA: usize = 3;
const JANELA: usize = 4;
const CHAMINE: usize = 5;
const BEIRAL: usize = 6;
const PEDRA: usize = 7;

struct Construtor {
    posicoes: Vec<f64>,
    indices_por_material: Vec<Vec<u32>>,
}

impl Construtor {
    fn novo(n_materiais: usize) -> Self {
        Self {
            posicoes: Vec::new(),
            indices_por_material: vec![Vec::new(); n_materiais],
        }
    }

    fn vertice(&mut self, p: [f64; 3]) -> u32 {
        let indice = (self.posicoes.len() / 3) as u32;
        self.posicoes.extend_from_slice(&p);
        indice
    }

    fn triangulo(&mut self, a: [f64; 3], b: [f64; 3], c: [f64; 3], material: usize) {
        let ia = self.vertice(a);
        let ib = self.vertice(b);
        let ic = self.vertice(c);
        self.indices_por_material[material].extend_from_slice(&[ia, ib, ic]);
    }

    fn quad(&mut self, pontos: [[f64; 3]; 4], material: usize) {
        self.triangulo(pontos[0], pontos[1], pontos[2], material);
        self.triangulo(pontos[0], pontos[2], pontos[3], material);
    }

    fn caixa(&mut self, centro: [f64; 3], tamanho: [f64; 3], material: usize) {
        let (cx, cy, cz) = (centro[0], centro[1], centro[2]);
        let (hx, hy, hz) = (tamanho[0] * 0.5, tamanho[1] * 0.5, tamanho[2] * 0.5);
        let p = [
            [cx - hx, cy - hy, cz - hz],
            [cx + hx, cy - hy, cz - hz],
            [cx + hx, cy + hy, cz - hz],
            [cx - hx, cy + hy, cz - hz],
            [cx - hx, cy - hy, cz + hz],
            [cx + hx, cy - hy, cz + hz],
            [cx + hx, cy + hy, cz + hz],
            [cx - hx, cy + hy, cz + hz],
        ];
        self.quad([p[0], p[1], p[2], p[3]], material); // fundo (-Z)
        self.quad([p[4], p[7], p[6], p[5]], material); // topo (+Z)
        self.quad([p[0], p[4], p[5], p[1]], material); // frente (-Y)
        self.quad([p[3], p[2], p[6], p[7]], material); // trás (+Y)
        self.quad([p[0], p[3], p[7], p[4]], material); // esquerda (-X)
        self.quad([p[1], p[5], p[6], p[2]], material); // direita (+X)
    }

    fn concluir(self) -> (Vec<f64>, Vec<u32>, Vec<Lote>) {
        let mut indices = Vec::new();
        let mut lotes = Vec::new();
        for (material, lista) in self.indices_por_material.iter().enumerate() {
            if lista.is_empty() {
                continue;
            }
            let inicio = indices.len() as u32;
            indices.extend_from_slice(lista);
            lotes.push(Lote {
                inicio_indices: inicio,
                quantidade_indices: lista.len() as u32,
                material: material as u32,
            });
        }
        (self.posicoes, indices, lotes)
    }
}

fn materiais() -> Vec<Material> {
    let m = |cor, rugosidade, metalico| Material {
        cor_base: cor,
        rugosidade,
        metalico,
        opacidade: 1.0,
        transmissao: 0.0,
        ior: 1.5,
        emissivo: [0.0, 0.0, 0.0],
    };
    vec![
        m([0.10, 0.26, 0.09], 0.95, 0.0), // grama
        m([0.80, 0.76, 0.66], 0.85, 0.0), // parede
        m([0.42, 0.12, 0.07], 0.70, 0.0), // telhado
        m([0.24, 0.11, 0.05], 0.55, 0.0), // porta
        m([0.20, 0.42, 0.60], 0.12, 0.0), // janela
        m([0.34, 0.17, 0.12], 0.90, 0.0), // chaminé
        m([0.90, 0.88, 0.82], 0.60, 0.0), // beiral
        m([0.30, 0.30, 0.32], 0.92, 0.0), // pedra
    ]
}

fn main() {
    let destino = std::env::args_os()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("cena-teste.hstr"));

    let mut c = Construtor::novo(materiais().len());

    // Terreno e calçada de entrada.
    c.quad(
        [
            [-20.0, -20.0, 0.0],
            [20.0, -20.0, 0.0],
            [20.0, 20.0, 0.0],
            [-20.0, 20.0, 0.0],
        ],
        GRAMA,
    );
    c.caixa([0.0, -5.6, 0.04], [1.7, 3.6, 0.08], PEDRA);

    // Laje e paredes externas.
    c.caixa([0.0, 0.0, 0.12], [6.4, 5.4, 0.24], PEDRA);
    c.caixa([0.0, 2.4, 1.5], [6.0, 0.2, 3.0], PAREDE);
    c.caixa([0.0, -2.4, 1.5], [6.0, 0.2, 3.0], PAREDE);
    c.caixa([2.9, 0.0, 1.5], [0.2, 4.8, 3.0], PAREDE);
    c.caixa([-2.9, 0.0, 1.5], [0.2, 4.8, 3.0], PAREDE);

    // Empenas triangulares (fecham o vão sob o telhado).
    c.triangulo([3.0, -2.5, 3.0], [3.0, 2.5, 3.0], [3.0, 0.0, 4.75], PAREDE);
    c.triangulo(
        [-3.0, 2.5, 3.0],
        [-3.0, -2.5, 3.0],
        [-3.0, 0.0, 4.75],
        PAREDE,
    );

    // Duas águas do telhado, com beiral.
    c.quad(
        [
            [-3.35, -3.10, 3.0],
            [3.35, -3.10, 3.0],
            [3.35, 0.0, 4.75],
            [-3.35, 0.0, 4.75],
        ],
        TELHADO,
    );
    c.quad(
        [
            [3.35, 3.10, 3.0],
            [-3.35, 3.10, 3.0],
            [-3.35, 0.0, 4.75],
            [3.35, 0.0, 4.75],
        ],
        TELHADO,
    );
    c.caixa([0.0, 0.0, 4.78], [6.9, 0.22, 0.16], BEIRAL);
    c.caixa([0.0, -3.12, 2.98], [6.9, 0.12, 0.12], BEIRAL);
    c.caixa([0.0, 3.12, 2.98], [6.9, 0.12, 0.12], BEIRAL);

    // Porta e janelas (levemente à frente da parede para evitar z-fighting).
    c.quad(
        [
            [-0.55, -2.515, 0.02],
            [0.55, -2.515, 0.02],
            [0.55, -2.515, 2.15],
            [-0.55, -2.515, 2.15],
        ],
        PORTA,
    );
    for (x0, x1) in [(-2.15, -1.05), (1.05, 2.15)] {
        c.quad(
            [
                [x0 - 0.08, -2.512, 1.02],
                [x1 + 0.08, -2.512, 1.02],
                [x1 + 0.08, -2.512, 2.30],
                [x0 - 0.08, -2.512, 2.30],
            ],
            BEIRAL,
        );
        c.quad(
            [
                [x0, -2.520, 1.10],
                [x1, -2.520, 1.10],
                [x1, -2.520, 2.22],
                [x0, -2.520, 2.22],
            ],
            JANELA,
        );
    }
    c.quad(
        [
            [2.912, -0.60, 1.20],
            [2.912, 0.60, 1.20],
            [2.912, 0.60, 2.20],
            [2.912, -0.60, 2.20],
        ],
        JANELA,
    );

    // Chaminé atravessando a água norte.
    c.caixa([1.9, 1.25, 4.25], [0.70, 0.70, 2.0], CHAMINE);
    c.caixa([1.9, 1.25, 5.28], [0.86, 0.86, 0.14], BEIRAL);

    // Dois arbustos para dar escala.
    c.caixa([-3.9, -3.4, 0.45], [0.9, 0.9, 0.9], GRAMA);
    c.caixa([3.9, -3.6, 0.55], [1.1, 1.1, 1.1], GRAMA);

    let (posicoes, indices, lotes) = c.concluir();
    let camera = Camera::olhando_para(
        Vec3::novo(9.5, -11.5, 7.0),
        Vec3::novo(0.0, 0.0, 2.2),
        Vec3::novo(0.0, 0.0, 1.0),
        0.72,
        16.0 / 9.0,
        0.1,
        200.0,
    )
    .expect("câmera do exemplo");

    let cena = Cena::nova(PartesCena {
        posicoes,
        indices,
        normais: Vec::new(),
        materiais: materiais(),
        lotes,
        sol: Sol {
            azimute: 135.0,
            elevacao: 45.0,
            intensidade: 3.0,
        },
        fundo: Some([0.36, 0.52, 0.75]),
        camera,
    });

    match cena {
        Ok(cena) => match std::fs::write(&destino, cena.codificar()) {
            Ok(()) => println!(
                "cena de teste salva em '{}' ({} triângulos)",
                destino.display(),
                cena.quantidade_triangulos()
            ),
            Err(erro) => {
                eprintln!("falha ao gravar '{}': {erro}", destino.display());
                std::process::exit(1);
            }
        },
        Err(erro) => {
            eprintln!("cena de teste inválida: {erro}");
            std::process::exit(1);
        }
    }
}
