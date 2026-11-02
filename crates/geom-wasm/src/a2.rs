//! Consulta `itens_pintados` (sub-etapa A2 da fatia A, decisão 0047): itens por camada (`buildItems`) e
//! pintor (`paint`) de cada grupo de paredes de um nível, só em planta. A codificação das saídas está em
//! `schema/cena-v3.json`.
//!
//! Este arquivo só orquestra o que `resolveLevel` faz antes de `solveCluster` (grupos, pontas livres,
//! paredes que atravessam um T, corte da planta) e codifica o resultado; a geometria está em `camadas`,
//! `envolvimento`, `itens` e `pintor`.

use std::collections::{BTreeMap, BTreeSet};

use crate::a1::quadros_do_nivel;
use crate::cena::Cena;
use crate::consultas::Saida;
use crate::esquema::{ENTRADA, NIVEL_TODOS};
use crate::grupos::agrupar_paredes;
use crate::itens::{construir_itens, ContextoDoItem, Item, TipoDosItens, CORTE_PADRAO};
use crate::juncoes::{calcular_pontas, estado_da_ponta, Estado};
use crate::pintor::pintar;
use crate::MultiPoligono;

/// Opções de planta (`PlanResolveOptions`) que a consulta recebe.
pub struct OpcoesDePlanta {
    /// `cutZ` (cota absoluta); `None`: o corte fica 1,20 m acima da base de cada parede.
    pub corte_z: Option<f64>,
    /// `outlineWalls` (id_num).
    pub contorno: BTreeSet<u32>,
}

/// Saídas em construção: níveis de índice (formas -> polígonos -> anéis -> pontos).
#[derive(Default)]
struct Codificador {
    itens: Vec<u32>,
    itens_num: Vec<f64>,
    formas_cab: Vec<u32>,
    poligonos: Vec<u32>,
    aneis: Vec<u32>,
    pontos: Vec<f64>,
}

impl Codificador {
    /// Acrescenta uma forma e devolve `(ini, n)` em polígonos.
    fn forma(&mut self, m: &MultiPoligono) -> (u32, u32) {
        let ini = (self.poligonos.len() / 2) as u32;
        for p in m {
            self.poligonos.push((self.aneis.len() / 2) as u32);
            self.poligonos.push(p.len() as u32);
            for a in p {
                self.aneis.push((self.pontos.len() / 2) as u32);
                self.aneis.push(a.len() as u32);
                for q in a {
                    self.pontos.push(q[0]);
                    self.pontos.push(q[1]);
                }
            }
        }
        (ini, m.len() as u32)
    }

    fn item(&mut self, it: &Item, grupo: u32, fragmento: &MultiPoligono) {
        self.itens.extend([
            it.parede,
            grupo,
            it.faixa as u32,
            it.indice,
            it.material,
            it.nucleo as u32,
            it.em_planta as u32,
            it.contorno as u32,
            it.atravessa as u32,
        ]);
        self.itens_num.extend([it.prioridade, it.ordem, it.nucleo_t, it.z0, it.z1, it.espessura]);
        let (bi, bn) = self.forma(&it.forma);
        let (fi, fn_) = self.forma(fragmento);
        self.formas_cab.extend([bi, bn, fi, fn_]);
    }
}

/// Executa `itens_pintados(nivel_num, tol_juncao, opcoes)`.
pub fn itens_pintados(cena: &Cena, nivel: u32, tol: f64, opcoes: &OpcoesDePlanta) -> Result<Vec<Saida>, u32> {
    if nivel == NIVEL_TODOS {
        return Err(ENTRADA);
    }
    let frames = quadros_do_nivel(cena, nivel)?;
    let res = calcular_pontas(&frames, tol);
    let grupos = agrupar_paredes(&frames, &res.pontas);
    // joinStatus de cada extremidade, uma vez (o TS guarda em memo por `wallId|which`).
    let estados: Vec<[Estado; 2]> = (0..frames.len()).map(|i| [estado_da_ponta(&frames, i, 0, tol), estado_da_ponta(&frames, i, 1, tol)]).collect();

    // Tipos já montados (calc + material/envolve/faixas), por tipo_num.
    struct TipoMontado {
        calc: std::rc::Rc<crate::quadro::TipoCalc>,
        material: Vec<u32>,
        envolve: Vec<bool>,
        wrap_ends: u8,
        faixas: Vec<crate::secoes_a1::FaixaLinha>,
    }
    let mut tipos: BTreeMap<u32, TipoMontado> = BTreeMap::new();
    for f in &frames {
        let tn = cena.a1.quadros.get(&f.id).ok_or(ENTRADA)?.tipo;
        if tipos.contains_key(&tn) {
            continue;
        }
        let camadas = cena.a1.camadas_do_tipo(tn)?;
        tipos.insert(
            tn,
            TipoMontado {
                calc: std::rc::Rc::clone(&f.tipo),
                material: camadas.iter().map(|c| c.material).collect(),
                envolve: camadas.iter().map(|c| c.envolve).collect(),
                wrap_ends: cena.a1.tipos.get(&tn).ok_or(ENTRADA)?.wrap_ends,
                faixas: cena.a1.faixas_do_tipo(tn)?,
            },
        );
    }

    let mut cod = Codificador::default();
    for (gi, grupo) in grupos.iter().enumerate() {
        // Paredes que atravessam um T: hospedeiras das extremidades `tee` do grupo.
        let mut atravessam: BTreeSet<usize> = BTreeSet::new();
        for &i in grupo {
            for e in 0..2 {
                if let Estado::Tee(h) = &estados[i][e] {
                    atravessam.insert(*h);
                }
            }
        }
        let mut itens: Vec<Item> = Vec::new();
        for &i in grupo {
            let f = &frames[i];
            let z = cena.a1.paredes_z.get(&f.id).ok_or(ENTRADA)?;
            let tn = cena.a1.quadros.get(&f.id).ok_or(ENTRADA)?.tipo;
            let t = tipos.get(&tn).ok_or(ENTRADA)?;
            let livres: Vec<usize> = (0..2).filter(|&e| matches!(estados[i][e], Estado::Livre | Estado::Proibida)).collect();
            let p = res.pontas.get(i).ok_or(ENTRADA)?;
            let ctx = ContextoDoItem {
                grupo_z0: z.z0,
                grupo_z1: z.z0 + z.altura,
                atravessa: atravessam.contains(&i),
                // Sem `cutZ`, o corte fica 1,20 m acima da base desta parede (como antes).
                corte_planta: opcoes.corte_z.unwrap_or(z.z0 + CORTE_PADRAO),
                parede_de_contorno: opcoes.contorno.contains(&f.id),
            };
            let tipo = TipoDosItens { calc: &t.calc, material: &t.material, envolve: &t.envolve, wrap_ends: t.wrap_ends, faixas: &t.faixas };
            itens.extend(construir_itens(f, i, &tipo, &p.fim, &p.cordas, &livres, &ctx)?);
        }
        let em_planta: Vec<usize> = (0..itens.len()).filter(|&k| itens[k].em_planta).collect();
        let de_contorno: Vec<usize> = (0..itens.len()).filter(|&k| itens[k].contorno).collect();
        let plano = pintar(&em_planta.iter().map(|&k| &itens[k]).collect::<Vec<_>>())?;
        // Paredes só de contorno (fora do corte) pintam só entre si: não cortam as paredes que o corte atravessa.
        let contorno = pintar(&de_contorno.iter().map(|&k| &itens[k]).collect::<Vec<_>>())?;
        let vazio: MultiPoligono = Vec::new();
        let mut do_plano = vec![None; itens.len()];
        for (p, &k) in em_planta.iter().enumerate() {
            do_plano[k] = plano.get(p);
        }
        let mut do_contorno = vec![None; itens.len()];
        for (p, &k) in de_contorno.iter().enumerate() {
            do_contorno[k] = contorno.get(p);
        }
        for (k, it) in itens.iter().enumerate() {
            let fragmento = if it.em_planta {
                do_plano[k].unwrap_or(&vazio)
            } else if it.contorno {
                do_contorno[k].unwrap_or(&vazio)
            } else {
                &vazio
            };
            cod.item(it, gi as u32, fragmento);
        }
    }
    Ok(vec![
        Saida::U32(cod.itens),
        Saida::F64(cod.itens_num),
        Saida::U32(cod.formas_cab),
        Saida::U32(cod.poligonos),
        Saida::U32(cod.aneis),
        Saida::F64(cod.pontos),
    ])
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::a1::testes_util::{cena_com, f64s, u32s, tipo_simples, Par};
    use crate::consultas::executar;
    use crate::esquema::CONSULTA_ITENS_PINTADOS as Q;
    use crate::pintor::area_da_forma;

    fn forma_de(s: &[Saida], ini: u32, n: u32) -> MultiPoligono {
        let pol = u32s(&s[3]);
        let an = u32s(&s[4]);
        let pt = f64s(&s[5]);
        let mut m = Vec::new();
        for k in ini..ini + n {
            let (ia, na) = (pol[2 * k as usize], pol[2 * k as usize + 1]);
            let mut p = Vec::new();
            for a in ia..ia + na {
                let (ip, np) = (an[2 * a as usize], an[2 * a as usize + 1]);
                p.push((ip..ip + np).map(|q| [pt[2 * q as usize], pt[2 * q as usize + 1]]).collect());
            }
            m.push(p);
        }
        m
    }

    #[test]
    fn tee_a_parede_que_atravessa_vence_e_o_ramal_para_na_face() {
        let host = Par::nova(1, (0.0, 0.0), (6.0, 0.0));
        let ramal = Par::nova(2, (3.0, 3.0), (3.0, 0.0));
        let mut c = cena_com(&[host, ramal], &[tipo_simples()]);
        // paredes_z: as duas na cota 0 com 2,8 m
        let bz = [crate::a1::testes_util::c32(&[1, 2]), crate::a1::testes_util::c64(&[0.0, 0.0]), crate::a1::testes_util::c64(&[2.8, 2.8])].concat();
        c.definir_secao(crate::esquema::SECAO_PAREDES_Z, 2, &bz).expect("paredes_z");
        let s = executar(&mut c, Q, &[0.0, 0.02, 0.0, 0.0, 0.0]).expect("consulta");
        let itens = u32s(&s[0]);
        assert_eq!(itens.len(), 2 * 9);
        // item 0: hospedeira (atravessa = 1), item 1: ramal (atravessa = 0)
        assert_eq!((itens[0], itens[8]), (1, 1));
        assert_eq!((itens[9], itens[9 + 8]), (2, 0));
        let cab = u32s(&s[2]);
        let bruto = forma_de(&s, cab[0], cab[1]);
        let frag = forma_de(&s, cab[2], cab[3]);
        assert!((area_da_forma(&bruto) - 6.0 * 0.2).abs() < 1e-9);
        assert!((area_da_forma(&frag) - 6.0 * 0.2).abs() < 1e-9, "a hospedeira não perde área");
        // o ramal (3 m a partir de y = 3 até a face em y = 0,1) perde só o trecho dentro da hospedeira
        let frag2 = forma_de(&s, cab[6], cab[7]);
        assert!((area_da_forma(&frag2) - 2.9 * 0.2).abs() < 1e-6, "área do ramal {}", area_da_forma(&frag2));
    }

    #[test]
    fn argumentos_variaveis_sao_validados() {
        let mut c = cena_com(&[Par::nova(1, (0.0, 0.0), (4.0, 0.0))], &[tipo_simples()]);
        let bz = [crate::a1::testes_util::c32(&[1]), crate::a1::testes_util::c64(&[0.0]), crate::a1::testes_util::c64(&[2.8])].concat();
        c.definir_secao(crate::esquema::SECAO_PAREDES_Z, 1, &bz).expect("paredes_z");
        assert!(executar(&mut c, Q, &[0.0, 0.02, 0.0, 0.0, 0.0]).is_ok());
        assert_eq!(executar(&mut c, Q, &[0.0, 0.02, 0.0, 0.0]).err(), Some(ENTRADA));
        assert_eq!(executar(&mut c, Q, &[0.0, 0.02, 2.0, 0.0, 0.0]).err(), Some(ENTRADA));
        assert_eq!(executar(&mut c, Q, &[0.0, 0.02, 0.0, 0.0, 2.0, 1.0]).err(), Some(ENTRADA));
        assert_eq!(executar(&mut c, Q, &[0.0, 0.02, 1.0, 5.0, 1.0, 1.0]).is_ok(), true);
        // cota de corte acima da parede: item sem planta; contorno o pinta só entre contornos
        let s = executar(&mut c, Q, &[0.0, 0.02, 1.0, 5.0, 1.0, 1.0]).expect("consulta");
        let itens = u32s(&s[0]);
        assert_eq!((itens[6], itens[7]), (0, 1), "fora do corte e de contorno");
        let cab = u32s(&s[2]);
        assert!(cab[3] > 0, "o contorno tem fragmento");
        // sem paredes_z => ENTRADA
        c.remover(crate::esquema::SECAO_PAREDES_Z, &[1]).expect("remover");
        assert_eq!(executar(&mut c, Q, &[0.0, 0.02, 0.0, 0.0, 0.0]).err(), Some(ENTRADA));
    }
}
