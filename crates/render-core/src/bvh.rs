//! BVH de triângulos com divisão pela mediana do eixo mais largo.
//!
//! A construção é feita uma vez por cena (fora do laço de pixels); a travessia usa uma pilha de
//! tamanho fixo para não alocar por raio. Raios de sombra param no primeiro acerto.

use crate::cena::Triangulo;
use crate::vetor::{Aabb, Vec3};

const FOLHA_MAXIMA: usize = 8;
const PILHA_MAXIMA: usize = 96;

pub(crate) struct AcertoGeometrico {
    pub t: f64,
    pub u: f64,
    pub v: f64,
    pub triangulo: u32,
}

struct No {
    caixa: Aabb,
    inicio: u32,
    quantidade: u32,
    esquerda: u32,
    direita: u32,
}

pub(crate) struct Bvh {
    nos: Vec<No>,
    ordem: Vec<u32>,
}

impl Bvh {
    pub(crate) fn construir(triangulos: &[Triangulo]) -> Self {
        let mut ordem: Vec<u32> = (0..triangulos.len() as u32).collect();
        let mut nos = Vec::with_capacity(triangulos.len() * 2);
        if !triangulos.is_empty() {
            let fim = ordem.len();
            montar_no(&mut nos, &mut ordem, triangulos, 0, fim);
        }
        Self { nos, ordem }
    }

    pub(crate) fn intersectar(
        &self,
        triangulos: &[Triangulo],
        origem: Vec3,
        direcao: Vec3,
        t_min: f64,
        t_max: f64,
    ) -> Option<AcertoGeometrico> {
        if self.nos.is_empty() {
            return None;
        }
        let inv = Vec3::novo(1.0 / direcao.x, 1.0 / direcao.y, 1.0 / direcao.z);
        let mut melhor_t = t_max;
        let mut melhor = None;
        let mut pilha = [0u32; PILHA_MAXIMA];
        let mut topo = 1usize;
        pilha[0] = 0;

        while topo > 0 {
            topo -= 1;
            let no = &self.nos[pilha[topo] as usize];
            if no.caixa.intersectar(origem, inv, t_min, melhor_t).is_none() {
                continue;
            }
            if no.quantidade > 0 {
                let inicio = no.inicio as usize;
                let fim = inicio + no.quantidade as usize;
                for &indice in &self.ordem[inicio..fim] {
                    if let Some((t, u, v)) = intersectar_triangulo(
                        &triangulos[indice as usize],
                        origem,
                        direcao,
                        t_min,
                        melhor_t,
                    ) {
                        melhor_t = t;
                        melhor = Some(AcertoGeometrico {
                            t,
                            u,
                            v,
                            triangulo: indice,
                        });
                    }
                }
            } else if topo + 2 <= PILHA_MAXIMA {
                pilha[topo] = no.esquerda;
                pilha[topo + 1] = no.direita;
                topo += 2;
            }
        }
        melhor
    }

    pub(crate) fn algum_acerto(
        &self,
        triangulos: &[Triangulo],
        origem: Vec3,
        direcao: Vec3,
        t_min: f64,
        t_max: f64,
    ) -> bool {
        if self.nos.is_empty() {
            return false;
        }
        let inv = Vec3::novo(1.0 / direcao.x, 1.0 / direcao.y, 1.0 / direcao.z);
        let mut pilha = [0u32; PILHA_MAXIMA];
        let mut topo = 1usize;
        pilha[0] = 0;

        while topo > 0 {
            topo -= 1;
            let no = &self.nos[pilha[topo] as usize];
            if no.caixa.intersectar(origem, inv, t_min, t_max).is_none() {
                continue;
            }
            if no.quantidade > 0 {
                let inicio = no.inicio as usize;
                let fim = inicio + no.quantidade as usize;
                for &indice in &self.ordem[inicio..fim] {
                    if intersectar_triangulo(
                        &triangulos[indice as usize],
                        origem,
                        direcao,
                        t_min,
                        t_max,
                    )
                    .is_some()
                    {
                        return true;
                    }
                }
            } else if topo + 2 <= PILHA_MAXIMA {
                pilha[topo] = no.esquerda;
                pilha[topo + 1] = no.direita;
                topo += 2;
            }
        }
        false
    }
}

fn montar_no(
    nos: &mut Vec<No>,
    ordem: &mut [u32],
    triangulos: &[Triangulo],
    inicio: usize,
    fim: usize,
) -> u32 {
    debug_assert!(inicio < fim);
    let mut caixa = Aabb::vazia();
    let mut caixa_centroides = Aabb::vazia();
    for &indice in &ordem[inicio..fim] {
        let triangulo = &triangulos[indice as usize];
        caixa = caixa.uniao(triangulo.caixa);
        caixa_centroides = caixa_centroides.expandir(triangulo.centroide);
    }

    let indice_no = nos.len() as u32;
    if fim - inicio <= FOLHA_MAXIMA {
        nos.push(No {
            caixa,
            inicio: inicio as u32,
            quantidade: (fim - inicio) as u32,
            esquerda: 0,
            direita: 0,
        });
        return indice_no;
    }

    let extensao = caixa_centroides.extensao();
    let eixo = if extensao.x >= extensao.y && extensao.x >= extensao.z {
        0
    } else if extensao.y >= extensao.z {
        1
    } else {
        2
    };
    ordem[inicio..fim].sort_unstable_by(|&a, &b| {
        triangulos[a as usize]
            .centroide
            .comp(eixo)
            .total_cmp(&triangulos[b as usize].centroide.comp(eixo))
    });
    let meio = inicio + (fim - inicio) / 2;

    // Reserva o nó antes de recursar para que os filhos recebam índices estáveis.
    nos.push(No {
        caixa,
        inicio: 0,
        quantidade: 0,
        esquerda: 0,
        direita: 0,
    });
    let esquerda = montar_no(nos, ordem, triangulos, inicio, meio);
    let direita = montar_no(nos, ordem, triangulos, meio, fim);
    let no = &mut nos[indice_no as usize];
    no.esquerda = esquerda;
    no.direita = direita;
    indice_no
}

fn intersectar_triangulo(
    triangulo: &Triangulo,
    origem: Vec3,
    direcao: Vec3,
    t_min: f64,
    t_max: f64,
) -> Option<(f64, f64, f64)> {
    let aresta1 = triangulo.v1 - triangulo.v0;
    let aresta2 = triangulo.v2 - triangulo.v0;
    let pvec = direcao.cross(aresta2);
    let determinante = aresta1.dot(pvec);
    if determinante.abs() < 1.0e-12 {
        return None;
    }
    let inv_det = 1.0 / determinante;
    let tvec = origem - triangulo.v0;
    let u = tvec.dot(pvec) * inv_det;
    if !(0.0..=1.0).contains(&u) {
        return None;
    }
    let qvec = tvec.cross(aresta1);
    let v = direcao.dot(qvec) * inv_det;
    if v < 0.0 || u + v > 1.0 {
        return None;
    }
    let t = aresta2.dot(qvec) * inv_det;
    if t > t_min && t < t_max {
        Some((t, u, v))
    } else {
        None
    }
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::cena::{cena_teste_publica, Cena};

    #[test]
    fn bvh_acerta_e_erra_como_a_cena() {
        let cena: Cena = cena_teste_publica();
        let origem = Vec3::novo(0.0, -4.0, 0.8);
        let para_cima = Vec3::novo(0.0, 1.0, 0.0);
        assert!(cena.intersectar(origem, para_cima, 0.001, 100.0).is_some());
        assert!(cena.algum_acerto(origem, para_cima, 0.001, 100.0));
        // Aponta para longe do cubo e do chão.
        assert!(cena
            .intersectar(origem, Vec3::novo(0.0, 0.0, 1.0), 0.001, 100.0)
            .is_none());
    }
}
