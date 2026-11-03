//! Consulta `pisos_lajes_nivel` (sub-etapa B1 da fatia B, decisão 0050 §3): `resolveFloors` e `resolveSlabs` de um nível, mais o
//! contorno ESTÁTICO de `layerOutlines` (o que não lê paredes).
//!
//! O que o Rust calcula: o topo e as cotas de cada camada (somadas do topo para baixo, como no TS), a marca de núcleo
//! (`layerCoreFlags`), a membrana, a prioridade efetiva, o término explícito, o contorno de cada camada pela regra do término
//! (`face`, `nucleo`, `passa`, `ate`, `{cm}` e o `auto` pelo núcleo), o limite no perímetro externo (`limiteExterno`) e o corte dos furos
//! de escada e rampa (`cutStairOpenings`).
//!
//! O que o JS envia pronto (fronteira da decisão 0050 §2): os circuitos fechados dos pisos e lajes vinculados e o perímetro externo
//! (`contornos_vinculados`; `enclosed.ts` é da fatia D), o `problem` de `resolveBoundary`, e os furos de escada e rampa por elemento
//! (`furos_nivel`; `holesFor(openingsOnLevel(nivel), cota da face inferior)`, que depende do tipo do elemento e, na laje inclinada, de
//! `coverUnderside`). Nada disso é recalculado aqui.
//!
//! O que fica para a B2: a região da camada menos (ou mais) a zona bloqueada das paredes do nível (`regionMinusWalls` e `regionPlusWalls`,
//! `terminoBlock.ts`). Nas camadas em que o TS consulta paredes (`face` e `nucleo` fora de vinculado, `passa` em vinculado, `ate`, e o
//! `auto` de perímetro pelo núcleo fora do núcleo do elemento) o Rust devolve a região SEM paredes e marca `precisa_paredes` = 1.
//!
//! Escala: o corte dos furos e o limite externo usam 1 nm (`ESCALA_FINA`), como o pintor da A2 (o `polygon-clipping` do TS não quantiza;
//! a 1 µm o contorno de um piso de alguns metros muda de área mais que 1e-6 m², ver decisões 0048 e 0050). O deslocamento `{cm}` usa o
//! offset de 1 µm (o `offsetMulti` do TS também trabalha em inteiros de 1 µm).

use std::collections::{BTreeMap, HashMap, HashSet};

use crate::a2::Codificador;
use crate::cena::Cena;
use crate::consultas::Saida;
use crate::esquema::{ENTRADA, NIVEL_TODOS};
use crate::itens::marcas_de_nucleo;
use crate::ops::{diferenca_com_escala, interseccao_com_escala, offset, ESCALA_FINA};
use crate::secoes_b::*;
use crate::{Anel, MultiPoligono};

/// `FUNCTION_PRIORITY` (packages/model/src/priority.ts), na ordem de `funcao` (structure, substrate, thermal, membrane, finish1, finish2).
const PRIORIDADE_DA_FUNCAO: [f64; 6] = [1.0, 2.0, 3.0, 3.0, 4.0, 5.0];
/// Espessura abaixo da qual a camada é membrana (`isMembraneLayer`).
const ESPESSURA_DE_MEMBRANA: f64 = 1e-6;

#[derive(Clone, Copy, Debug, PartialEq)]
enum Termino {
    Auto,
    Face,
    Nucleo,
    Passa,
    Ate,
    Cm(f64),
}

fn termino_de(c: &CamadaLinha) -> Termino {
    match c.termino {
        TERMINO_FACE => Termino::Face,
        TERMINO_NUCLEO => Termino::Nucleo,
        TERMINO_PASSA => Termino::Passa,
        TERMINO_ATE => Termino::Ate,
        TERMINO_CM => Termino::Cm(c.termino_valor),
        _ => Termino::Auto,
    }
}

/// Uma camada resolvida.
struct CamadaResolvida {
    indice: u32,
    material: u32,
    z0: f64,
    z1: f64,
    prioridade: f64,
    nucleo: bool,
    membrana: bool,
    explicita: bool,
    precisa_paredes: bool,
    poligono: MultiPoligono,
}

/// Um piso ou uma laje resolvido.
struct ElementoResolvido {
    laje: bool,
    id: u32,
    tipo: u32,
    problema: u8,
    inclinacao: Option<Inclinacao>,
    topo_z: f64,
    base_z: f64,
    poligono: MultiPoligono,
    camadas: Vec<CamadaResolvida>,
}

type AneisPorPapel = BTreeMap<(u8, u32), Vec<Anel>>;

/// Agrupa os vértices de um elemento em anéis, por `(papel, poligono)`. `ENTRADA` se um índice de vértice repete ou deixa lacuna num anel,
/// ou se a numeração dos anéis de um polígono deixa lacuna.
fn montar_aneis(linhas: &[&PontoLinha]) -> Result<AneisPorPapel, u32> {
    let mut por_anel: BTreeMap<(u8, u32, u32), Vec<(u32, [f64; 2])>> = BTreeMap::new();
    for l in linhas {
        por_anel.entry((l.papel, l.poligono, l.anel)).or_default().push((l.indice, [l.x, l.y]));
    }
    let mut saida: AneisPorPapel = BTreeMap::new();
    for ((papel, poligono, anel), mut pts) in por_anel {
        pts.sort_by_key(|p| p.0);
        if pts.iter().enumerate().any(|(i, p)| p.0 as usize != i) {
            return Err(ENTRADA);
        }
        let aneis = saida.entry((papel, poligono)).or_default();
        // os anéis chegam em ordem crescente de número: tem de ser 0, 1, 2, ...
        if anel as usize != aneis.len() {
            return Err(ENTRADA);
        }
        aneis.push(pts.into_iter().map(|p| p.1).collect());
    }
    Ok(saida)
}

/// Linhas de vértice de cada elemento do nível, por `(tipo_el, elemento)`.
fn por_elemento<'a>(m: &'a BTreeMap<u32, PontoLinha>, do_nivel_set: &HashSet<(u8, u32)>) -> HashMap<(u8, u32), Vec<&'a PontoLinha>> {
    let mut r: HashMap<(u8, u32), Vec<&PontoLinha>> = HashMap::new();
    for l in m.values() {
        let k = (l.tipo_el, l.elemento);
        if do_nivel_set.contains(&k) {
            r.entry(k).or_default().push(l);
        }
    }
    r
}

/// Caixa de todos os pontos (`boxOf(polygon.flat(2))`); vazia = `[+inf, +inf, -inf, -inf]`, que não cruza nada.
fn caixa_total(m: &MultiPoligono) -> [f64; 4] {
    let mut c = [f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY];
    for p in m {
        for a in p {
            for q in a {
                c[0] = c[0].min(q[0]);
                c[1] = c[1].min(q[1]);
                c[2] = c[2].max(q[0]);
                c[3] = c[3].max(q[1]);
            }
        }
    }
    c
}

/// `boxesOverlap(a, b)` com `pad = 0` (fronteira inclusiva).
fn caixas_se_tocam(a: &[f64; 4], b: &[f64; 4]) -> bool {
    a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]
}

/// Interpretação do `polygon-clipping` do TS (que corta e intersecta os contornos): um polígono é o anel externo MENOS os furos, e a parte de um
/// furo que passa do anel externo é descartada. Sob `NonZero` (a regra do `i_overlay`) essa parte viraria uma região a mais; aqui cada polígono com
/// furos vira `externo - furos` antes da booleana. Furo manual de elemento vinculado que a sala deixou para fora do circuito é o caso real.
fn como_o_polygon_clipping(m: &MultiPoligono) -> Result<MultiPoligono, u32> {
    if m.iter().all(|p| p.len() < 2) {
        return Ok(m.clone());
    }
    let mut saida: MultiPoligono = Vec::with_capacity(m.len());
    for p in m {
        let Some(externo) = p.first() else { continue };
        if p.len() < 2 {
            saida.push(p.clone());
            continue;
        }
        let mut args: Vec<MultiPoligono> = vec![vec![vec![externo.clone()]]];
        args.extend(p.iter().skip(1).map(|h| vec![vec![h.clone()]]));
        saida.extend(diferenca_com_escala(&args, ESCALA_FINA)?);
    }
    Ok(saida)
}

/// `cutStairOpenings(polygon, openings)`: sem furos, ou com a caixa dos furos longe da do contorno, devolve o próprio contorno.
fn cortar_furos(m: &MultiPoligono, furos: &MultiPoligono) -> Result<MultiPoligono, u32> {
    if furos.is_empty() || !caixas_se_tocam(&caixa_total(m), &caixa_total(furos)) {
        return Ok(m.clone());
    }
    diferenca_com_escala(&[como_o_polygon_clipping(m)?, furos.clone()], ESCALA_FINA)
}

/// `[[room[0], ...holes, ...room.slice(1)]]` (`withHoles`).
fn com_furos_manuais(sala: &[Anel], manuais: &[Anel]) -> MultiPoligono {
    let mut p: Vec<Anel> = Vec::with_capacity(1 + manuais.len() + sala.len());
    if let Some(a) = sala.first() {
        p.push(a.clone());
    }
    p.extend(manuais.iter().cloned());
    p.extend(sala.iter().skip(1).cloned());
    vec![p]
}

/// Contorno de cada camada (`layerOutlines` sem paredes): `(região, precisa_paredes)`.
fn contornos_das_camadas(linha: &ElementoLinha, camadas: &[CamadaLinha], nucleo: &[bool], base: &MultiPoligono, manuais: &[Anel], vinc: &AneisPorPapel) -> Result<Vec<(MultiPoligono, bool)>, u32> {
    let perimetro = linha.modo == MODO_PERIMETRO;
    let origem = linha.modo != MODO_SEM_ORIGEM;
    let vinculado = origem && linha.vinculado && !perimetro && linha.tem_semente;
    let perimetro_nucleo = !vinculado && perimetro && linha.extend_nucleo;
    let fallback = || -> Vec<(MultiPoligono, bool)> { camadas.iter().map(|_| (base.clone(), false)).collect() };
    let termino: Vec<Termino> = camadas.iter().map(termino_de).collect();
    let anel_do_perimetro = |papel: u8| anel_perimetro(vinc, papel);
    // Limite no perímetro externo (decisão 0027): corta a região da camada no contorno externo da edificação.
    let limite = |i: usize, m: MultiPoligono| -> Result<MultiPoligono, u32> {
        let papel = match camadas[i].limite_externo {
            LIMITE_PAREDE => PAPEL_PERIMETRO_ACABAMENTO,
            LIMITE_NUCLEO => PAPEL_PERIMETRO_NUCLEO,
            _ => return Ok(m),
        };
        match anel_do_perimetro(papel) {
            Some(anel) => interseccao_com_escala(&como_o_polygon_clipping(&m)?, &vec![vec![anel.clone()]], ESCALA_FINA),
            None => Ok(m),
        }
    };
    let deslocada = |m: &MultiPoligono, cm: f64| -> Result<MultiPoligono, u32> { offset(m, cm / 100.0) };
    let mut saida: Vec<(MultiPoligono, bool)> = Vec::with_capacity(camadas.len());
    if perimetro {
        // F6 (0023 §2): a borda externa tem a face de acabamento e a do núcleo, como as paredes internas.
        let borda = |papel: u8| -> Option<MultiPoligono> {
            anel_do_perimetro(papel).map(|r| {
                let mut p: Vec<Anel> = vec![r.clone()];
                p.extend(manuais.iter().cloned());
                vec![p]
            })
        };
        let Some(acabamento) = borda(PAPEL_PERIMETRO_ACABAMENTO) else { return Ok(fallback()) };
        let precisa_nucleo = termino.iter().any(|t| matches!(t, Termino::Nucleo | Termino::Passa | Termino::Ate));
        let nucleo_poly = if precisa_nucleo { borda(PAPEL_PERIMETRO_NUCLEO) } else { None };
        let referencia = nucleo_poly.clone().unwrap_or_else(|| acabamento.clone());
        for (i, t) in termino.iter().enumerate() {
            let (m, precisa) = match *t {
                Termino::Passa => (base.clone(), false),
                Termino::Ate => (referencia.clone(), true),
                Termino::Cm(cm) => (if cm == 0.0 { acabamento.clone() } else { deslocada(&acabamento, cm)? }, false),
                Termino::Nucleo => (nucleo_poly.clone().unwrap_or_else(|| acabamento.clone()), false),
                Termino::Face => (acabamento.clone(), false),
                Termino::Auto => {
                    if !perimetro_nucleo {
                        (acabamento.clone(), false)
                    } else if nucleo[i] {
                        (base.clone(), false)
                    } else {
                        (base.clone(), true)
                    }
                }
            };
            saida.push((limite(i, m)?, precisa));
        }
        return Ok(saida);
    }
    let circuito = |papel: u8| -> Option<MultiPoligono> { vinc.get(&(papel, 0)).filter(|r| !r.is_empty()).map(|r| com_furos_manuais(r, manuais)) };
    let acabamento = if !vinculado || linha.modo == MODO_PAREDES_ACABAMENTO { Some(base.clone()) } else { circuito(PAPEL_CIRCUITO_ACABAMENTO) };
    let Some(acabamento) = acabamento else { return Ok(fallback()) };
    let precisa_nucleo = vinculado && termino.iter().enumerate().any(|(i, t)| matches!(t, Termino::Nucleo | Termino::Passa | Termino::Ate) || (*t == Termino::Auto && nucleo[i]));
    let nucleo_poly: Option<MultiPoligono> = if !vinculado || linha.modo == MODO_PAREDES_NUCLEO {
        Some(base.clone())
    } else if precisa_nucleo {
        circuito(PAPEL_CIRCUITO_NUCLEO)
    } else {
        None
    };
    let referencia = nucleo_poly.clone().unwrap_or_else(|| acabamento.clone());
    for (i, t) in termino.iter().enumerate() {
        let (m, precisa) = match *t {
            Termino::Cm(cm) => (if vinculado && cm != 0.0 { deslocada(&acabamento, cm)? } else { base.clone() }, false),
            Termino::Face => {
                if vinculado {
                    (acabamento.clone(), false)
                } else {
                    (base.clone(), true)
                }
            }
            Termino::Nucleo => {
                if vinculado {
                    (referencia.clone(), false)
                } else {
                    (base.clone(), true)
                }
            }
            Termino::Passa => {
                if vinculado {
                    (referencia.clone(), true)
                } else {
                    (base.clone(), false)
                }
            }
            Termino::Ate => (referencia.clone(), true),
            Termino::Auto => match (&nucleo_poly, nucleo[i]) {
                (Some(n), true) => (n.clone(), false),
                _ => (acabamento.clone(), false),
            },
        };
        saida.push((limite(i, m)?, precisa));
    }
    Ok(saida)
}

/// Anel externo do perímetro (papéis 2 e 3), ou `None` se o JS recebeu null.
fn anel_perimetro(vinc: &AneisPorPapel, papel: u8) -> Option<&Anel> {
    vinc.get(&(papel, 0)).and_then(|r| r.first())
}

/// Contorno resolvido de um elemento vinculado (`resolveBoundary`): os anéis do circuito do modo, ou `None` se o JS não o achou.
fn contorno_vinculado(linha: &ElementoLinha, vinc: &AneisPorPapel) -> Option<Vec<Anel>> {
    match linha.modo {
        MODO_PERIMETRO => {
            let papel = if linha.extend_nucleo { PAPEL_PERIMETRO_NUCLEO } else { PAPEL_PERIMETRO_ACABAMENTO };
            anel_perimetro(vinc, papel).map(|a| vec![a.clone()])
        }
        MODO_PAREDES_ACABAMENTO | MODO_PAREDES_NUCLEO => {
            if !linha.tem_semente {
                return None;
            }
            let papel = if linha.modo == MODO_PAREDES_NUCLEO { PAPEL_CIRCUITO_NUCLEO } else { PAPEL_CIRCUITO_ACABAMENTO };
            vinc.get(&(papel, 0)).filter(|r| !r.is_empty()).cloned()
        }
        _ => None,
    }
}

/// `resolveFloors`/`resolveSlabs` de UM elemento. `None` quando o TS o pula (contorno com menos de 3 pontos, polígono todo furado).
fn resolver_elemento(laje: bool, id: u32, linha: &ElementoLinha, camadas: &[CamadaLinha], estatico: &[Anel], vinc: &AneisPorPapel, furos: &MultiPoligono) -> Result<Option<ElementoResolvido>, u32> {
    let mut contorno: Anel = estatico.first().cloned().unwrap_or_default();
    let manuais: Vec<Anel> = estatico.iter().skip(1).cloned().collect();
    let mut furos_do_contorno = manuais.clone();
    let mut problema = 0;
    if linha.vinculado && linha.modo != MODO_SEM_ORIGEM {
        if let Some(r) = contorno_vinculado(linha, vinc) {
            if let Some(externo) = r.first() {
                contorno = externo.clone();
                furos_do_contorno.extend(r.iter().skip(1).cloned());
            }
        }
        problema = linha.problema;
    }
    if contorno.len() < 3 {
        return Ok(None);
    }
    let topo_z = linha.cota_nivel + linha.desloc;
    let mut z = topo_z;
    let limites: Vec<(f64, f64)> = camadas
        .iter()
        .map(|l| {
            let r = (z - l.espessura, z);
            z = r.0;
            r
        })
        .collect();
    let base_z = z;
    let nucleo = marcas_de_nucleo(&camadas.iter().map(|c| c.funcao).collect::<Vec<_>>());
    let mut poligono_base: Vec<Anel> = vec![contorno];
    poligono_base.extend(furos_do_contorno);
    let base: MultiPoligono = vec![poligono_base];
    let poligono = cortar_furos(&base, furos)?;
    if poligono.is_empty() {
        return Ok(None);
    }
    let contornos = contornos_das_camadas(linha, camadas, &nucleo, &base, &manuais, vinc)?;
    let mut feitos: Vec<(MultiPoligono, MultiPoligono)> = Vec::new();
    let mut saida: Vec<CamadaResolvida> = Vec::with_capacity(camadas.len());
    for (i, l) in camadas.iter().enumerate() {
        let (m, precisa) = &contornos[i];
        // `memoCut`: a mesma forma não é recortada duas vezes (e a do próprio elemento reaproveita `poligono`).
        let cortada = if *m == base {
            poligono.clone()
        } else if let Some(par) = feitos.iter().find(|p| &p.0 == m) {
            par.1.clone()
        } else {
            let c = cortar_furos(m, furos)?;
            feitos.push((m.clone(), c.clone()));
            c
        };
        let ate = l.termino == TERMINO_FACE || l.termino == TERMINO_NUCLEO || l.termino == TERMINO_PASSA || l.termino == TERMINO_ATE;
        saida.push(CamadaResolvida {
            indice: l.indice,
            material: l.material,
            z0: limites[i].0,
            z1: limites[i].1,
            prioridade: l.prioridade.unwrap_or(PRIORIDADE_DA_FUNCAO[l.funcao as usize]),
            nucleo: nucleo[i],
            membrana: l.funcao == FUNCAO_MEMBRANA || l.espessura < ESPESSURA_DE_MEMBRANA,
            explicita: ate,
            precisa_paredes: *precisa,
            poligono: cortada,
        });
    }
    Ok(Some(ElementoResolvido { laje, id, tipo: linha.tipo, problema, inclinacao: linha.inclinacao, topo_z, base_z, poligono, camadas: saida }))
}

/// Pisos e depois lajes do nível, cada grupo em ordem crescente de `ordem` (empate por `id_num`).
pub fn pisos_lajes_nivel(cena: &Cena, nivel: u32) -> Result<Vec<Saida>, u32> {
    if nivel == NIVEL_TODOS {
        return Err(ENTRADA);
    }
    let b = &cena.b;
    let ordenados = |m: &BTreeMap<u32, ElementoLinha>| -> Vec<(u32, ElementoLinha)> {
        let mut v: Vec<(u32, ElementoLinha)> = m.iter().filter(|(_, l)| l.nivel == nivel).map(|(k, l)| (*k, *l)).collect();
        v.sort_by(|a, c| a.1.ordem.partial_cmp(&c.1.ordem).unwrap_or(std::cmp::Ordering::Equal).then(a.0.cmp(&c.0)));
        v
    };
    let pisos = ordenados(&b.pisos);
    let lajes = ordenados(&b.lajes);
    let do_nivel: HashSet<(u8, u32)> = pisos.iter().map(|p| (0u8, p.0)).chain(lajes.iter().map(|l| (1u8, l.0))).collect();
    let estaticos = por_elemento(&b.estaticos, &do_nivel);
    let vinculados = por_elemento(&b.vinculados, &do_nivel);
    let furos = por_elemento(&b.furos, &do_nivel);
    let mut resolvidos: Vec<ElementoResolvido> = Vec::new();
    for (laje, lista) in [(false, &pisos), (true, &lajes)] {
        let tipos = if laje { &b.tipos_laje } else { &b.tipos_piso };
        for (id, linha) in lista {
            // Tipo ausente: o TS pula o elemento (a validação do modelo é quem avisa).
            if !tipos.contains_key(&linha.tipo) {
                continue;
            }
            let camadas = b.camadas_do_tipo(laje, linha.tipo)?;
            let chave = (laje as u8, *id);
            let est = match estaticos.get(&chave) {
                Some(l) => montar_aneis(l)?.remove(&(0, 0)).unwrap_or_default(),
                None => Vec::new(),
            };
            let vinc = match vinculados.get(&chave) {
                Some(l) => montar_aneis(l)?,
                None => AneisPorPapel::new(),
            };
            let mut multi: MultiPoligono = Vec::new();
            if let Some(l) = furos.get(&chave) {
                for ((_, _), aneis) in montar_aneis(l)? {
                    multi.push(aneis);
                }
            }
            if let Some(r) = resolver_elemento(laje, *id, linha, &camadas, &est, &vinc, &multi)? {
                resolvidos.push(r);
            }
        }
    }
    let mut cod = Codificador::default();
    let (mut elementos, mut elementos_num, mut camadas_u, mut camadas_num) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    for r in &resolvidos {
        let (pi, pn) = cod.forma(&r.poligono);
        let inc = r.inclinacao;
        elementos.extend([r.laje as u32, r.id, r.tipo, r.problema as u32, inc.is_some() as u32, (camadas_u.len() / 8) as u32, r.camadas.len() as u32, pi, pn]);
        match inc {
            Some(s) => elementos_num.extend([r.topo_z, r.base_z, s.origem[0], s.origem[1], s.direcao[0], s.direcao[1], s.percentual]),
            None => elementos_num.extend([r.topo_z, r.base_z, 0.0, 0.0, 0.0, 0.0, 0.0]),
        }
        for c in &r.camadas {
            // A camada com o contorno do elemento aponta para o mesmo polígono da saída (como `memoCut` reaproveita o objeto).
            let (ci, cn) = if c.poligono == r.poligono { (pi, pn) } else { cod.forma(&c.poligono) };
            camadas_u.extend([c.indice, c.material, c.nucleo as u32, c.membrana as u32, c.explicita as u32, c.precisa_paredes as u32, ci, cn]);
            camadas_num.extend([c.z0, c.z1, c.prioridade]);
        }
    }
    Ok(vec![
        Saida::U32(elementos),
        Saida::F64(elementos_num),
        Saida::U32(camadas_u),
        Saida::F64(camadas_num),
        Saida::U32(cod.poligonos),
        Saida::U32(cod.aneis),
        Saida::F64(cod.pontos),
    ])
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::a1::testes_util::{c32, c64, c8, f64s, u32s};
    use crate::consultas::executar;
    use crate::esquema::{CONSULTA_PISOS_LAJES_NIVEL as Q, SECAO_CAMADAS_LAJE, SECAO_CAMADAS_PISO, SECAO_CONTORNOS_ESTATICOS, SECAO_CONTORNOS_VINCULADOS, SECAO_FUROS_NIVEL, SECAO_LAJES, SECAO_PISOS, SECAO_TIPOS_LAJE, SECAO_TIPOS_PISO};
    use crate::pintor::area_da_forma;

    /// Camada de teste: (espessura, função, término, valor do término, limite externo, prioridade).
    type Cam = (f64, u8, u8, f64, u8, Option<f64>);
    /// Anel de teste: (tipo_el, elemento, papel ou polígono, anel, pontos).
    type AnelT = (u8, u32, u32, u32, Vec<[f64; 2]>);

    fn simples(e: f64, f: u8) -> Cam {
        (e, f, 0, 0.0, 0, None)
    }

    /// Elemento de teste (piso ou laje).
    #[derive(Clone)]
    struct El {
        id: u32,
        nivel: u32,
        tipo: u32,
        ordem: f64,
        cota: f64,
        desloc: f64,
        modo: u8,
        vinculado: bool,
        semente: bool,
        nucleo: bool,
        problema: u8,
        inc: Option<([f64; 2], [f64; 2], f64)>,
    }

    fn el(id: u32) -> El {
        El { id, nivel: 0, tipo: 1, ordem: id as f64, cota: 3.0, desloc: 0.0, modo: 0, vinculado: false, semente: false, nucleo: false, problema: 0, inc: None }
    }

    fn bytes_el(es: &[El], laje: bool) -> Vec<u8> {
        let u = |f: &dyn Fn(&El) -> u8| -> Vec<u8> { es.iter().map(f).collect() };
        let g = |f: &dyn Fn(&El) -> f64| -> Vec<f64> { es.iter().map(f).collect() };
        let mut b = [
            c32(&es.iter().map(|e| e.id).collect::<Vec<_>>()),
            c32(&es.iter().map(|e| e.nivel).collect::<Vec<_>>()),
            c32(&es.iter().map(|e| e.tipo).collect::<Vec<_>>()),
            c64(&g(&|e| e.ordem)),
            c64(&g(&|e| e.cota)),
            c64(&g(&|e| e.desloc)),
            c8(&u(&|e| e.modo)),
            c8(&u(&|e| e.vinculado as u8)),
            c8(&u(&|e| e.semente as u8)),
            c8(&u(&|e| e.nucleo as u8)),
            c8(&u(&|e| e.problema)),
        ]
        .concat();
        if laje {
            b.extend(
                [
                    c8(&u(&|e| e.inc.is_some() as u8)),
                    c64(&g(&|e| e.inc.map_or(0.0, |i| i.0[0]))),
                    c64(&g(&|e| e.inc.map_or(0.0, |i| i.0[1]))),
                    c64(&g(&|e| e.inc.map_or(0.0, |i| i.1[0]))),
                    c64(&g(&|e| e.inc.map_or(0.0, |i| i.1[1]))),
                    c64(&g(&|e| e.inc.map_or(0.0, |i| i.2))),
                ]
                .concat(),
            );
        }
        b
    }

    fn bytes_tipos(ts: &[(u32, Vec<Cam>)]) -> Vec<u8> {
        [c32(&ts.iter().map(|t| t.0).collect::<Vec<_>>()), c32(&ts.iter().map(|t| t.1.len() as u32).collect::<Vec<_>>())].concat()
    }

    fn bytes_camadas(ts: &[(u32, Vec<Cam>)]) -> (u32, Vec<u8>) {
        let (mut ids, mut tipo, mut ix, mut esp, mut fun) = (vec![], vec![], vec![], vec![], vec![]);
        let (mut tem, mut pri, mut mat, mut ter, mut tv, mut lim) = (vec![], vec![], vec![], vec![], vec![], vec![]);
        for (tn, cs) in ts {
            for (i, c) in cs.iter().enumerate() {
                ids.push(ids.len() as u32 + 1);
                tipo.push(*tn);
                ix.push(i as u32);
                esp.push(c.0);
                fun.push(c.1);
                tem.push(c.5.is_some() as u8);
                pri.push(c.5.unwrap_or(0.0));
                mat.push(*tn * 100 + i as u32);
                ter.push(c.2);
                tv.push(c.3);
                lim.push(c.4);
            }
        }
        let n = ids.len() as u32;
        (n, [c32(&ids), c32(&tipo), c32(&ix), c64(&esp), c8(&fun), c8(&tem), c64(&pri), c32(&mat), c8(&ter), c64(&tv), c8(&lim)].concat())
    }

    /// Vértices das seções de contorno e de furo (colunas conforme a seção).
    fn bytes_pontos(secao: u32, aneis: &[AnelT]) -> (u32, Vec<u8>) {
        let (mut te, mut el, mut pp, mut an, mut ix, mut x, mut y) = (vec![], vec![], vec![], vec![], vec![], vec![], vec![]);
        for (t, e, p, a, pts) in aneis {
            for (i, q) in pts.iter().enumerate() {
                te.push(*t);
                el.push(*e);
                pp.push(*p);
                an.push(*a);
                ix.push(i as u32);
                x.push(q[0]);
                y.push(q[1]);
            }
        }
        let n = x.len() as u32;
        let ids: Vec<u32> = (1..=n).collect();
        let mut b = [c32(&ids), c8(&te), c32(&el)].concat();
        if secao == SECAO_CONTORNOS_VINCULADOS {
            b.extend(c8(&pp.iter().map(|v| *v as u8).collect::<Vec<_>>()));
        }
        if secao == SECAO_FUROS_NIVEL {
            b.extend(c32(&pp));
        }
        b.extend([c32(&an), c32(&ix), c64(&x), c64(&y)].concat());
        (n, b)
    }

    fn ret(x0: f64, y0: f64, x1: f64, y1: f64) -> Vec<[f64; 2]> {
        vec![[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
    }

    struct Montada {
        cena: Cena,
    }

    /// Cena com pisos (tipo 1 = `tp`), lajes (tipo 1 = `tl`) e os contornos pedidos.
    fn montar(pisos: &[El], tp: &[Cam], lajes: &[El], tl: &[Cam], estaticos: &[AnelT], vinc: &[AnelT], furos: &[AnelT]) -> Montada {
        let mut c = Cena::novo();
        c.definir_secao(SECAO_PISOS, pisos.len() as u32, &bytes_el(pisos, false)).expect("pisos");
        c.definir_secao(SECAO_LAJES, lajes.len() as u32, &bytes_el(lajes, true)).expect("lajes");
        let ts = [(1, tp.to_vec())];
        c.definir_secao(SECAO_TIPOS_PISO, 1, &bytes_tipos(&ts)).expect("tipos piso");
        let (n, b) = bytes_camadas(&ts);
        c.definir_secao(SECAO_CAMADAS_PISO, n, &b).expect("camadas piso");
        let tl2 = [(1, tl.to_vec())];
        c.definir_secao(SECAO_TIPOS_LAJE, 1, &bytes_tipos(&tl2)).expect("tipos laje");
        let (n, b) = bytes_camadas(&tl2);
        c.definir_secao(SECAO_CAMADAS_LAJE, n, &b).expect("camadas laje");
        for (secao, dados) in [(SECAO_CONTORNOS_ESTATICOS, estaticos), (SECAO_CONTORNOS_VINCULADOS, vinc), (SECAO_FUROS_NIVEL, furos)] {
            let (n, b) = bytes_pontos(secao, dados);
            c.definir_secao(secao, n, &b).expect("pontos");
        }
        Montada { cena: c }
    }

    fn consulta(m: &mut Montada) -> Vec<Saida> {
        executar(&mut m.cena, Q, &[0.0]).expect("pisos_lajes_nivel")
    }

    fn ceramico() -> Vec<Cam> {
        vec![simples(0.01, 4), simples(0.02, 1), simples(0.04, 1), simples(0.12, 0)]
    }

    /// Área da forma `ini..ini+n` (faixa em `poligonos`) da saída.
    fn area_da_saida(s: &[Saida], ini: u32, n: u32) -> f64 {
        let (pol, aneis, pts) = (u32s(&s[4]), u32s(&s[5]), f64s(&s[6]));
        let forma: MultiPoligono = (ini..ini + n)
            .map(|p| {
                let (ai, an) = (pol[2 * p as usize], pol[2 * p as usize + 1]);
                (ai..ai + an)
                    .map(|a| {
                        let (pi, pn) = (aneis[2 * a as usize], aneis[2 * a as usize + 1]);
                        (pi..pi + pn).map(|q| [pts[2 * q as usize], pts[2 * q as usize + 1]]).collect()
                    })
                    .collect()
            })
            .collect();
        area_da_forma(&forma)
    }

    #[test]
    fn piso_simples_cotas_nucleo_prioridade_e_area() {
        let mut p = el(7);
        p.desloc = 0.12;
        let mut m = montar(&[p], &ceramico(), &[], &[], &[(0, 7, 0, 0, ret(0.0, 0.0, 4.0, 3.0))], &[], &[]);
        let s = consulta(&mut m);
        assert_eq!(&u32s(&s[0])[..7], &[0, 7, 1, 0, 0, 0, 4]);
        let n = f64s(&s[1]);
        assert_eq!(n[0], 3.0 + 0.12);
        assert!((n[1] - (3.12 - 0.19)).abs() < 1e-12);
        let cam = u32s(&s[2]);
        assert_eq!(cam.len(), 4 * 8);
        // marcas de núcleo (estrutura só na última), membrana, explícita, precisa_paredes
        let nucleo: Vec<u32> = cam.chunks(8).map(|c| c[2]).collect();
        assert_eq!(nucleo, [0, 0, 0, 1]);
        assert!(cam.chunks(8).all(|c| c[3] == 0 && c[4] == 0 && c[5] == 0));
        let z = f64s(&s[3]);
        assert_eq!((z[0], z[1], z[2]), (3.12 - 0.01, 3.12, 4.0));
        assert_eq!(z[3 * 3 + 2], 1.0);
        // sequência sem lacuna
        for k in 0..3 {
            assert_eq!(z[3 * k], z[3 * (k + 1) + 1]);
        }
        let u = u32s(&s[0]);
        assert!((area_da_saida(&s, u[7], u[8]) - 12.0).abs() < 1e-12);
        // todas as camadas têm o contorno do piso
        for c in cam.chunks(8) {
            assert_eq!((c[6], c[7]), (u[7], u[8]), "camada com o mesmo contorno reaproveita o polígono");
        }
    }

    #[test]
    fn membrana_de_espessura_zero_tem_z0_igual_a_z1_e_prioridade_da_funcao() {
        let tipo = vec![simples(0.03, 4), simples(0.0, 3), (0.10, 0, 0, 0.0, 0, Some(7.0))];
        let mut m = montar(&[], &[], &[el(1)], &tipo, &[(1, 1, 0, 0, ret(0.0, 0.0, 2.0, 2.0))], &[], &[]);
        let s = consulta(&mut m);
        let cam = u32s(&s[2]);
        assert_eq!(cam.chunks(8).map(|c| c[3]).collect::<Vec<_>>(), [0, 1, 0]);
        let z = f64s(&s[3]);
        assert_eq!(z[3], z[4], "membrana: z0 = z1");
        assert_eq!((z[2], z[5], z[8]), (4.0, 3.0, 7.0), "prioridade da função e a explícita");
        // membrana por função, mesmo com espessura
        let tipo = vec![simples(0.05, 3), simples(0.1, 0)];
        let mut m = montar(&[el(1)], &tipo, &[], &[], &[(0, 1, 0, 0, ret(0.0, 0.0, 2.0, 2.0))], &[], &[]);
        assert_eq!(u32s(&consulta(&mut m)[2])[3], 1);
    }

    #[test]
    fn furo_de_escada_recorta_o_poligono_e_longe_nao_mexe() {
        // furo no meio: 1 x 1 dentro de 4 x 3
        let furo = vec![(0u8, 1u32, 0u32, 0u32, ret(1.0, 1.0, 2.0, 2.0))];
        let est = vec![(0u8, 1u32, 0u32, 0u32, ret(0.0, 0.0, 4.0, 3.0))];
        let mut m = montar(&[el(1)], &ceramico(), &[], &[], &est, &[], &furo);
        let s = consulta(&mut m);
        let u = u32s(&s[0]);
        assert!((area_da_saida(&s, u[7], u[8]) - 11.0).abs() < 1e-9);
        assert!(u32s(&s[2]).chunks(8).all(|c| area_da_saida(&s, c[6], c[7]) > 10.999));
        // furo longe: o contorno sai exatamente como entrou (mesmos vértices, sem quantizar)
        let longe = vec![(0u8, 1u32, 0u32, 0u32, ret(10.0, 10.0, 11.0, 11.0))];
        let est2 = vec![(0u8, 1u32, 0u32, 0u32, vec![[0.123456789, 0.0], [4.0, 0.0000001], [4.0, 3.0], [0.0, 3.0]])];
        let mut m = montar(&[el(1)], &ceramico(), &[], &[], &est2, &[], &longe);
        let s = consulta(&mut m);
        assert_eq!(f64s(&s[6])[..2], [0.123456789, 0.0]);
        // furo que cobre tudo: o elemento não sai
        let tudo = vec![(0u8, 1u32, 0u32, 0u32, ret(-1.0, -1.0, 9.0, 9.0))];
        let mut m = montar(&[el(1)], &ceramico(), &[], &[], &est, &[], &tudo);
        assert!(consulta(&mut m)[0].is_empty());
    }

    #[test]
    fn furo_manual_que_passa_do_contorno_nao_vira_regiao_a_mais() {
        // contorno 0..2 x 0..2 com um furo manual de 1 x 1 que passa da borda direita (x de 1,5 a 2,5): o TS (polygon-clipping) descarta o que
        // passa do contorno; sob NonZero a parte de fora (0,5 x 1) viraria uma região a mais
        let est = vec![(0u8, 1u32, 0u32, 0u32, ret(0.0, 0.0, 2.0, 2.0)), (0u8, 1u32, 0u32, 1u32, ret(1.5, 0.5, 2.5, 1.5))];
        let longe = vec![(0u8, 1u32, 0u32, 0u32, ret(20.0, 20.0, 21.0, 21.0))];
        // com furo de escada na caixa do contorno (uma booleana acontece)
        let perto = vec![(0u8, 1u32, 0u32, 0u32, ret(0.2, 0.2, 0.4, 0.4))];
        let mut m = montar(&[el(1)], &ceramico(), &[], &[], &est, &[], &perto);
        let s = consulta(&mut m);
        let u = u32s(&s[0]);
        assert_eq!(u[8], 1, "uma só peça");
        assert!((area_da_saida(&s, u[7], u[8]) - (4.0 - 0.5 - 0.04)).abs() < 1e-9, "área = contorno - (furo dentro) - furo de escada");
        // sem booleana nenhuma o TS devolve o polígono como veio (com o furo que passa) e o Rust também
        let mut m = montar(&[el(1)], &ceramico(), &[], &[], &est, &[], &longe);
        let s = consulta(&mut m);
        let u = u32s(&s[0]);
        assert_eq!(u[8], 1);
        assert_eq!(u32s(&s[1]).len(), 0);
        assert!((area_da_saida(&s, u[7], u[8]) - (4.0 - 1.0)).abs() < 1e-9, "sem booleana: área do polígono cru");
    }

    #[test]
    fn laje_inclinada_leva_a_inclinacao_e_as_cotas_na_origem() {
        let mut l = el(3);
        l.desloc = -0.05;
        l.inc = Some(([1.0, 2.0], [0.0, 1.0], 2.5));
        let tipo = vec![simples(0.02, 1), simples(0.12, 0)];
        let mut m = montar(&[], &[], &[l], &tipo, &[(1, 3, 0, 0, ret(0.0, 0.0, 5.0, 4.0))], &[], &[]);
        let s = consulta(&mut m);
        assert_eq!(&u32s(&s[0])[..5], &[1, 3, 1, 0, 1]);
        let n = f64s(&s[1]);
        assert!((n[0] - 2.95).abs() < 1e-12 && (n[1] - 2.81).abs() < 1e-12);
        assert_eq!(&n[2..], &[1.0, 2.0, 0.0, 1.0, 2.5]);
        let z = f64s(&s[3]);
        assert!((z[1] - 2.95).abs() < 1e-12 && (z[0] - 2.93).abs() < 1e-12 && (z[3] - 2.81).abs() < 1e-12);
    }

    #[test]
    fn pisos_antes_das_lajes_em_ordem_e_id() {
        let (mut a, mut b, mut c) = (el(5), el(2), el(9));
        a.ordem = 1.0;
        b.ordem = 3.0;
        c.ordem = 1.0;
        let est: Vec<AnelT> = [5u32, 2, 9].iter().map(|&i| (0u8, i, 0u32, 0u32, ret(0.0, 0.0, 1.0, 1.0))).collect();
        let lj = vec![(1u8, 4u32, 0u32, 0u32, ret(0.0, 0.0, 1.0, 1.0))];
        let mut l = el(4);
        l.ordem = 0.0;
        let mut m = montar(&[a, b, c], &ceramico(), &[l], &[simples(0.12, 0)], &[est, lj].concat(), &[], &[]);
        let s = consulta(&mut m);
        let ids: Vec<(u32, u32)> = u32s(&s[0]).chunks(9).map(|c| (c[0], c[1])).collect();
        assert_eq!(ids, [(0, 5), (0, 9), (0, 2), (1, 4)]);
    }

    #[test]
    fn vinculado_usa_o_circuito_leva_problema_e_marca_o_que_precisa_de_paredes() {
        // piso vinculado pelo acabamento: circuito 2 x 2 com uma ilha; o contorno gravado (4 x 4) é substituído
        let mut p = el(1);
        p.modo = MODO_PAREDES_ACABAMENTO;
        p.vinculado = true;
        p.semente = true;
        let est = vec![(0u8, 1u32, 0u32, 0u32, ret(0.0, 0.0, 4.0, 4.0))];
        let sala = vec![
            (0u8, 1u32, PAPEL_CIRCUITO_ACABAMENTO as u32, 0u32, ret(0.0, 0.0, 2.0, 2.0)),
            (0u8, 1u32, PAPEL_CIRCUITO_ACABAMENTO as u32, 1u32, ret(0.5, 0.5, 1.0, 1.0)),
        ];
        let tipo = vec![simples(0.01, 4), (0.12, 0, TERMINO_PASSA, 0.0, 0, None)];
        let mut m = montar(&[p.clone()], &tipo, &[], &[], &est, &sala, &[]);
        let s = consulta(&mut m);
        let u = u32s(&s[0]);
        assert!((area_da_saida(&s, u[7], u[8]) - (4.0 - 0.25)).abs() < 1e-9, "circuito com a ilha");
        let cam = u32s(&s[2]);
        // camada 0 (auto, fora do núcleo): acabamento = base; camada 1 (passa, vinculada): precisa de paredes, região de referência
        assert_eq!((cam[5], cam[8 + 5]), (0, 1));
        assert_eq!(cam[8 + 4], 1, "passa é regra explícita");
        // circuito aberto: sem linhas, o contorno gravado vale, o problema vem do JS e as camadas ficam com a base
        p.problema = 1;
        let mut m = montar(&[p], &tipo, &[], &[], &est, &[], &[]);
        let s = consulta(&mut m);
        let u = u32s(&s[0]);
        assert_eq!(u[3], 1);
        assert!((area_da_saida(&s, u[7], u[8]) - 16.0).abs() < 1e-9);
        // (o `passa` de elemento vinculado continua pedindo paredes, mesmo sem circuito do núcleo: a referência cai no acabamento)
        assert_eq!(u32s(&s[2]).chunks(8).map(|c| c[5]).collect::<Vec<_>>(), [0, 1]);
        assert!(u32s(&s[2]).chunks(8).all(|c| (c[6], c[7]) == (u[7], u[8])));
    }

    #[test]
    fn estatico_com_face_e_nucleo_marca_paredes_e_passa_nao() {
        let tipo = vec![(0.01, 4, TERMINO_FACE, 0.0, 0, None), (0.02, 1, TERMINO_NUCLEO, 0.0, 0, None), (0.12, 0, TERMINO_PASSA, 0.0, 0, None), simples(0.1, 2)];
        let mut m = montar(&[el(1)], &tipo, &[], &[], &[(0, 1, 0, 0, ret(0.0, 0.0, 3.0, 3.0))], &[], &[]);
        let s = consulta(&mut m);
        assert_eq!(u32s(&s[2]).chunks(8).map(|c| c[5]).collect::<Vec<_>>(), [1, 1, 0, 0]);
        assert_eq!(u32s(&s[2]).chunks(8).map(|c| c[4]).collect::<Vec<_>>(), [1, 1, 1, 0]);
    }

    #[test]
    fn perimetro_com_deslocamento_e_limite_externo() {
        // perímetro: acabamento 6 x 6, núcleo 5 x 5; camada 0 = face, 1 = nucleo, 2 = {cm: 10}, 3 = auto com limite no núcleo
        let mut p = el(1);
        p.modo = MODO_PERIMETRO;
        p.vinculado = true;
        let tipo = vec![
            (0.01, 4, TERMINO_FACE, 0.0, 0, None),
            (0.02, 1, TERMINO_NUCLEO, 0.0, 0, None),
            (0.03, 1, TERMINO_CM, 10.0, 0, None),
            (0.1, 0, TERMINO_AUTO, 0.0, LIMITE_NUCLEO, None),
        ];
        let est = vec![(0u8, 1u32, 0u32, 0u32, ret(0.0, 0.0, 1.0, 1.0))];
        let vinc = vec![
            (0u8, 1u32, PAPEL_PERIMETRO_ACABAMENTO as u32, 0u32, ret(0.0, 0.0, 6.0, 6.0)),
            (0u8, 1u32, PAPEL_PERIMETRO_NUCLEO as u32, 0u32, ret(0.5, 0.5, 5.5, 5.5)),
        ];
        let mut m = montar(&[p], &tipo, &[], &[], &est, &vinc, &[]);
        let s = consulta(&mut m);
        let u = u32s(&s[0]);
        assert!((area_da_saida(&s, u[7], u[8]) - 36.0).abs() < 1e-9, "contorno resolvido = perímetro do acabamento (extend finish)");
        let cam = u32s(&s[2]);
        let a: Vec<f64> = cam.chunks(8).map(|c| area_da_saida(&s, c[6], c[7])).collect();
        assert!((a[0] - 36.0).abs() < 1e-6, "face = acabamento, {a:?}");
        assert!((a[1] - 25.0).abs() < 1e-6, "nucleo = núcleo");
        assert!((a[2] - 6.2f64 * 6.2).abs() < 1e-4, "cm 10 avança 10 cm: {a:?}");
        assert!((a[3] - 25.0).abs() < 1e-6, "limite no núcleo corta a camada auto a 5 x 5: {a:?}");
    }

    #[test]
    fn entradas_invalidas() {
        let est = vec![(0u8, 1u32, 0u32, 0u32, ret(0.0, 0.0, 1.0, 1.0))];
        // nível reservado
        let mut m = montar(&[el(1)], &ceramico(), &[], &[], &est, &[], &[]);
        assert_eq!(executar(&mut m.cena, Q, &[f64::from(u32::MAX)]).err(), Some(ENTRADA));
        assert_eq!(executar(&mut m.cena, Q, &[0.5]).err(), Some(ENTRADA));
        assert_eq!(executar(&mut m.cena, Q, &[]).err(), Some(ENTRADA));
        // tipo ausente: o piso é ignorado como no TS; contorno com 2 pontos: idem
        let mut sem_tipo = el(1);
        sem_tipo.tipo = 99;
        let mut m = montar(&[sem_tipo], &ceramico(), &[], &[], &est, &[], &[]);
        assert!(consulta(&mut m)[0].is_empty());
        let curto = vec![(0u8, 1u32, 0u32, 0u32, vec![[0.0, 0.0], [1.0, 0.0]])];
        let mut m = montar(&[el(1)], &ceramico(), &[], &[], &curto, &[], &[]);
        assert!(consulta(&mut m)[0].is_empty());
        let mut m = montar(&[el(1)], &ceramico(), &[], &[], &[], &[], &[]);
        assert!(consulta(&mut m)[0].is_empty(), "sem linhas de contorno");
        // lacuna no índice de vértice
        let mut m = montar(&[el(1)], &ceramico(), &[], &[], &est, &[], &[]);
        let (n, mut b) = bytes_pontos(SECAO_CONTORNOS_ESTATICOS, &est);
        // coluna `indice` (5ª): id (16 bytes), tipo_el (8), elemento (16), anel (16) vêm antes
        let pos = 16 + 8 + 16 + 16;
        b[pos..pos + 4].copy_from_slice(&5u32.to_le_bytes());
        m.cena.definir_secao(SECAO_CONTORNOS_ESTATICOS, n, &b).expect("decodifica");
        assert_eq!(executar(&mut m.cena, Q, &[0.0]).err(), Some(ENTRADA));
        // n_camadas que não bate com as linhas
        let mut m = montar(&[el(1)], &ceramico(), &[], &[], &est, &[], &[]);
        m.cena.definir_secao(SECAO_TIPOS_PISO, 1, &bytes_tipos(&[(1, vec![simples(0.1, 0)])])).expect("tipo");
        assert_eq!(executar(&mut m.cena, Q, &[0.0]).err(), Some(ENTRADA));
        // enums e valores fora do domínio, e chave duplicada, na decodificação
        let mut c = Cena::novo();
        let ts = [(1u32, vec![simples(0.1, 6)])];
        let (n, b) = bytes_camadas(&ts);
        assert_eq!(c.definir_secao(SECAO_CAMADAS_PISO, n, &b).err(), Some(ENTRADA), "funcao 6");
        let ts = [(1u32, vec![(0.1, 0, 6, 0.0, 0, None)])];
        let (n, b) = bytes_camadas(&ts);
        assert_eq!(c.definir_secao(SECAO_CAMADAS_PISO, n, &b).err(), Some(ENTRADA), "termino 6");
        let ts = [(1u32, vec![(f64::NAN, 0, 0, 0.0, 0, None)])];
        let (n, b) = bytes_camadas(&ts);
        assert_eq!(c.definir_secao(SECAO_CAMADAS_PISO, n, &b).err(), Some(ENTRADA), "espessura NaN");
        let mut ruim = el(1);
        ruim.modo = 4;
        assert_eq!(c.definir_secao(SECAO_PISOS, 1, &bytes_el(&[ruim], false)).err(), Some(ENTRADA), "modo 4");
        assert_eq!(c.definir_secao(SECAO_PISOS, 2, &bytes_el(&[el(1), el(1)], false)).err(), Some(ENTRADA), "chave duplicada");
        let mut nv = el(1);
        nv.nivel = u32::MAX;
        assert_eq!(c.definir_secao(SECAO_PISOS, 1, &bytes_el(&[nv], false)).err(), Some(ENTRADA), "nível reservado");
        let mut na = el(1);
        na.cota = f64::INFINITY;
        assert_eq!(c.definir_secao(SECAO_PISOS, 1, &bytes_el(&[na], false)).err(), Some(ENTRADA), "cota infinita");
        let (n, mut b) = bytes_pontos(SECAO_CONTORNOS_VINCULADOS, &[(0, 1, 9, 0, ret(0.0, 0.0, 1.0, 1.0))]);
        assert_eq!(c.definir_secao(SECAO_CONTORNOS_VINCULADOS, n, &b).err(), Some(ENTRADA), "papel 9");
        b.truncate(b.len() - 8);
        assert_eq!(c.definir_secao(SECAO_CONTORNOS_VINCULADOS, n, &b).err(), Some(ENTRADA), "tamanho incoerente");
    }

    #[test]
    fn upsert_e_remocao_seguem_as_secoes() {
        let est = vec![(0u8, 1u32, 0u32, 0u32, ret(0.0, 0.0, 2.0, 2.0)), (0u8, 2u32, 0u32, 0u32, ret(0.0, 0.0, 3.0, 3.0))];
        let (a, b2) = (el(1), el(2));
        let mut m = montar(&[a, b2.clone()], &ceramico(), &[], &[], &est, &[], &[]);
        assert_eq!(u32s(&consulta(&mut m)[0]).len(), 18);
        // remove o piso 1
        m.cena.remover(SECAO_PISOS, &[1]).expect("remover");
        let s = consulta(&mut m);
        assert_eq!(u32s(&s[0]).chunks(9).map(|c| c[1]).collect::<Vec<_>>(), [2]);
        // upsert do piso 2 com outro deslocamento: o resultado muda; o piso 1 volta com o upsert
        let mut novo = b2;
        novo.desloc = 0.5;
        m.cena.upsert(SECAO_PISOS, 2, &bytes_el(&[novo, el(1)], false)).expect("upsert");
        let s = consulta(&mut m);
        let u = u32s(&s[0]);
        assert_eq!(u.chunks(9).map(|c| c[1]).collect::<Vec<_>>(), [1, 2]);
        assert_eq!(f64s(&s[1])[7], 3.5);
        // remover o contorno do piso 1 o tira da saída (as quatro linhas de vértice dele são as de id 1 a 4)
        m.cena.remover(SECAO_CONTORNOS_ESTATICOS, &[1, 2, 3, 4]).expect("remover");
        assert_eq!(u32s(&consulta(&mut m)[0]).chunks(9).map(|c| c[1]).collect::<Vec<_>>(), [2]);
        // remover as camadas do tipo é ENTRADA (n_camadas não bate)
        m.cena.remover(SECAO_CAMADAS_PISO, &[1]).expect("remover");
        assert_eq!(executar(&mut m.cena, Q, &[0.0]).err(), Some(ENTRADA));
    }

    #[test]
    fn outro_nivel_nao_aparece_e_a_saida_e_deterministica() {
        let est = vec![(0u8, 1u32, 0u32, 0u32, ret(0.0, 0.0, 2.0, 2.0)), (0u8, 2u32, 0u32, 0u32, ret(0.0, 0.0, 3.0, 3.0))];
        let mut b = el(2);
        b.nivel = 1;
        let mut m = montar(&[el(1), b], &ceramico(), &[], &[], &est, &[], &[]);
        let um = consulta(&mut m);
        assert_eq!(u32s(&um[0]).chunks(9).map(|c| c[1]).collect::<Vec<_>>(), [1]);
        assert_eq!(um, consulta(&mut m));
        let s1 = executar(&mut m.cena, Q, &[1.0]).expect("nível 1");
        assert_eq!(u32s(&s1[0]).chunks(9).map(|c| c[1]).collect::<Vec<_>>(), [2]);
    }
}
