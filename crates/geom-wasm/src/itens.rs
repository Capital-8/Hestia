//! Itens por camada de uma parede, portados de `buildItems`, `flatT` e `Item` (`resolve.ts`) e de
//! `layerCoreFlags` (`junctionPlanar.ts`) na sub-etapa A2 (decisão 0047). Reproduz o TypeScript: mesma ordem
//! de itens (camadas do tipo, depois faixas verticais), mesmos limiares, mesma caixa.

use crate::camadas::{contorno_da_camada, ponto_no_corte, Borda};
use crate::envolvimento::retornos_de_ponta;
use crate::geo2d::arredonda_js;
use crate::juncoes::{Corda, Corte};
use crate::quadro::{para_local, s_na_profundidade, Quadro, TipoCalc};
use crate::secoes_a1::FaixaLinha;
use crate::MultiPoligono;

/// `EPS_Z` de `resolve.ts`.
pub const EPS_Z: f64 = 1e-6;
/// Altura (relativa à base) do plano de corte da planta quando não há `cutZ`.
pub const CORTE_PADRAO: f64 = 1.2;
/// `FUNCTION_PRIORITY.finish2`.
const PRIORIDADE_FINISH2: f64 = 5.0;

/// Caixa `[minx, miny, maxx, maxy]` (`Box` do TS).
pub type Caixa4 = [f64; 4];

/// `boxesOverlap` com `pad = 0`.
pub fn caixas_se_cruzam(a: &Caixa4, b: &Caixa4) -> bool {
    a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]
}

/// `boxOf(shape.flatMap(p => p[0] ?? []))`: caixa dos anéis externos (vazia = infinitos, nunca cruza).
pub fn caixa_dos_externos(forma: &MultiPoligono) -> Caixa4 {
    let mut b = [f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY];
    for p in forma {
        if let Some(anel) = p.first() {
            for q in anel {
                if q[0] < b[0] {
                    b[0] = q[0];
                }
                if q[1] < b[1] {
                    b[1] = q[1];
                }
                if q[0] > b[2] {
                    b[2] = q[0];
                }
                if q[1] > b[3] {
                    b[3] = q[1];
                }
            }
        }
    }
    b
}

/// `Item` do TS (sem `uid`, que só serve de chave de cache).
#[derive(Clone, Debug)]
pub struct Item {
    /// Índice do quadro da parede.
    pub quadro: usize,
    pub parede: u32,
    /// Faixa vertical (o `layerIndex` do TS é `-(indice + 1)`) ou camada.
    pub faixa: bool,
    pub indice: u32,
    pub material: u32,
    pub prioridade: f64,
    pub nucleo: bool,
    pub ordem: f64,
    pub nucleo_t: f64,
    pub atravessa: bool,
    pub z0: f64,
    pub z1: f64,
    pub em_planta: bool,
    pub contorno: bool,
    pub espessura: f64,
    pub forma: MultiPoligono,
    pub caixa: Caixa4,
}

impl Item {
    /// `layerIndex` do TS.
    pub fn camada(&self) -> i64 {
        if self.faixa {
            -(self.indice as i64 + 1)
        } else {
            self.indice as i64
        }
    }
}

/// O que `buildItems` lê do tipo além do que o `Quadro` já tem.
pub struct TipoDosItens<'a> {
    pub calc: &'a TipoCalc,
    pub material: &'a [u32],
    pub envolve: &'a [bool],
    /// `WallType.wrapEnds`: 0 none, 1 exterior, 2 interior, 3 both.
    pub wrap_ends: u8,
    pub faixas: &'a [FaixaLinha],
}

/// `layerCoreFlags`: da primeira à última camada de estrutura; sem estrutura, tudo é núcleo.
pub fn marcas_de_nucleo(funcoes: &[u8]) -> Vec<bool> {
    let idx: Vec<usize> = funcoes.iter().enumerate().filter(|(_, &f)| f == 0).map(|(i, _)| i).collect();
    let (Some(&primeiro), Some(&ultimo)) = (idx.first(), idx.last()) else {
        return funcoes.iter().map(|_| true).collect();
    };
    (0..funcoes.len()).map(|i| i >= primeiro && i <= ultimo).collect()
}

/// `flatT`: posição t do corte reto de uma face (ou do ponto da extremidade, se o corte não é reto).
fn t_plano(f: &Quadro, which: usize, corte: &Corte, s_face: f64) -> f64 {
    // sideAt(f, spec, sFace) é o mesmo corte nos dois lados.
    if let Corte::Reto(t) = corte {
        return *t;
    }
    para_local(f, ponto_no_corte(f, which, corte, s_face, Borda::Baixa)).0
}

/// Parâmetros de um pavimento que `buildItems` recebe de fora.
pub struct ContextoDoItem {
    pub grupo_z0: f64,
    pub grupo_z1: f64,
    pub atravessa: bool,
    pub corte_planta: f64,
    pub parede_de_contorno: bool,
}

/// `buildItems(f, ends, freeEnds, z, through, planCut, outlineWall)`.
pub fn construir_itens(
    f: &Quadro,
    quadro: usize,
    tipo: &TipoDosItens<'_>,
    fim: &[Corte; 2],
    cordas: &[Corda],
    livres: &[usize],
    ctx: &ContextoDoItem,
) -> Result<Vec<Item>, u32> {
    let mut items: Vec<Item> = Vec::new();
    let nucleo_t = arredonda_js((tipo.calc.nucleo_ate - tipo.calc.nucleo_de) * 1e6) / 1e6;
    let funcoes: Vec<u8> = tipo.calc.camadas.iter().map(|c| c.funcao).collect();
    let espessuras: Vec<f64> = tipo.calc.camadas.iter().map(|c| c.espessura).collect();
    let marcas = marcas_de_nucleo(&funcoes);
    // endWraps: camada -> retornos acumulados nas pontas livres (ordem a, b).
    let mut envoltas: std::collections::BTreeMap<usize, MultiPoligono> = std::collections::BTreeMap::new();
    if tipo.wrap_ends != 0 {
        for &which in livres {
            for r in retornos_de_ponta(f, &funcoes, &espessuras, tipo.envolve, which, tipo.wrap_ends) {
                envoltas.entry(r.indice).or_default().extend(r.poly);
            }
        }
    }
    let planta = |z0: f64, z1: f64| z0 <= ctx.corte_planta + EPS_Z && z1 >= ctx.corte_planta - EPS_Z;
    #[allow(clippy::too_many_arguments)]
    let mut cria = |faixa: bool, indice: u32, material: u32, prioridade: f64, espessura: f64, forma: MultiPoligono, z0: f64, z1: f64| {
        let em_planta = planta(z0, z1);
        items.push(Item {
            quadro,
            parede: f.id,
            faixa,
            indice,
            material,
            prioridade,
            nucleo: !faixa && marcas.get(indice as usize).copied().unwrap_or(false),
            ordem: f.ordem,
            nucleo_t,
            atravessa: ctx.atravessa,
            z0,
            z1,
            em_planta,
            contorno: ctx.parede_de_contorno && !em_planta,
            espessura,
            caixa: caixa_dos_externos(&forma),
            forma,
        });
    };
    for (i, c) in tipo.calc.camadas.iter().enumerate() {
        if c.espessura < 1e-6 {
            continue;
        }
        let anel = contorno_da_camada(f, fim, cordas, s_na_profundidade(f, c.de), s_na_profundidade(f, c.ate))?;
        let mut forma: MultiPoligono = vec![vec![anel.iter().map(|p| [p.x, p.y]).collect()]];
        if let Some(w) = envoltas.get(&i) {
            forma.extend(w.iter().cloned());
        }
        let material = tipo.material.get(i).copied().ok_or(crate::esquema::ENTRADA)?;
        cria(false, i as u32, material, c.prioridade, c.espessura, forma, ctx.grupo_z0, ctx.grupo_z1);
    }
    // Faixas verticais (rodapé, barra de azulejo): fora da espessura da parede, com prioridade de acabamento.
    for (k, st) in tipo.faixas.iter().enumerate() {
        let z0 = ctx.grupo_z0 + st.z0.max(0.0);
        let z1 = ctx.grupo_z1.min(ctx.grupo_z0 + st.z1);
        if z1 - z0 < EPS_Z || st.espessura < 1e-6 {
            continue;
        }
        let s_face = if st.interior { f.s_int } else { f.s_ext };
        let para_fora = if st.interior { -f.sign } else { f.sign };
        let ta = t_plano(f, 0, &fim[0], s_face);
        let tb = t_plano(f, 1, &fim[1], s_face);
        let anel = contorno_da_camada(f, &[Corte::Reto(ta), Corte::Reto(tb)], &[], s_face, s_face + para_fora * st.espessura)?;
        let forma: MultiPoligono = vec![vec![anel.iter().map(|p| [p.x, p.y]).collect()]];
        cria(true, k as u32, st.material, PRIORIDADE_FINISH2, st.espessura, forma, z0, z1);
    }
    Ok(items)
}
