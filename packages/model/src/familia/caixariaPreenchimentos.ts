import {
  FITA_CAIXARIA,
  addAfim,
  afim,
  formatarAfim,
  formulaDobradicasPorAltura,
  idUnico,
  limparId,
  scaleAfim,
  subAfim,
  type Afim,
  type BordasExternas,
  type CaixaAfim,
} from './caixariaAfim.ts';
import type { Ferragem, Peca } from './tipos.ts';
import type { PreenchimentoVao, Vao } from './tiposCaixaria.ts';

function bordasDaFrente(
  caixa: CaixaAfim,
  bordas: BordasExternas,
  montagem: 'sobreposta' | 'embutida',
  folga: number,
): { x0: Afim; x1: Afim; z0: Afim; z1: Afim; y: string } {
  if (montagem === 'embutida') {
    return {
      x0: addAfim(caixa.x0, afim(0, 0, folga)),
      x1: subAfim(caixa.x1, afim(0, 0, folga)),
      z0: addAfim(caixa.z0, afim(0, 0, folga)),
      z1: subAfim(caixa.z1, afim(0, 0, folga)),
      y: formatarAfim(caixa.y0, 'P'),
    };
  }
  const ovEsq = bordas.esq ? afim(0, 1, -folga) : afim(0, 0.5, -folga / 2);
  const ovDir = bordas.dir ? afim(0, 1, -folga) : afim(0, 0.5, -folga / 2);
  const ovBase = bordas.base ? afim(0, 1, -folga) : afim(0, 0.5, -folga / 2);
  const ovTopo = bordas.topo
    ? afim(0, 1, -folga)
    : bordas.topoAberto
      ? afim(0, 0, -folga)
      : afim(0, 0.5, -folga / 2);

  return {
    x0: subAfim(caixa.x0, ovEsq),
    x1: addAfim(caixa.x1, ovDir),
    z0: subAfim(caixa.z0, ovBase),
    z1: addAfim(caixa.z1, ovTopo),
    y: '-18',
  };
}

export function compilarPreenchimento(
  vao: Vao,
  caixa: CaixaAfim,
  bordas: BordasExternas,
  p: PreenchimentoVao,
  pecas: Peca[],
  ferragens: Ferragem[],
  pecasUsadas: Set<string>,
  ferragensUsadas: Set<string>,
): void {
  if (p.tipo === 'nenhum') return;
  const vid = limparId(vao.id);
  const fita4 = { n: FITA_CAIXARIA, s: FITA_CAIXARIA, l: FITA_CAIXARIA, o: FITA_CAIXARIA };

  switch (p.tipo) {
    case 'porta': {
      const folga = p.folga ?? 2;
      const fr = bordasDaFrente(caixa, bordas, p.montagem, folga);
      const pw = subAfim(fr.x1, fr.x0);
      const ph = subAfim(fr.z1, fr.z0);
      const hStr = formatarAfim(ph, 'A');
      const zStr = formatarAfim(fr.z0, 'A');

      if (p.estilo === 'giro_1' || p.estilo === 'basculante') {
        const nome = p.estilo === 'basculante' ? 'Porta basculante' : 'Porta';
        pecas.push({
          id: idUnico(`cx_porta_${vid}_1`, pecasUsadas),
          nome,
          papel: 'porta',
          eixo: 'y',
          origem: [formatarAfim(fr.x0, 'L'), fr.y, zStr],
          tamanho: [formatarAfim(pw, 'L'), hStr],
          espessura: '18',
          material: 'mat_porta',
          fita: fita4,
          veio: p.estilo === 'basculante' ? 'a' : 'b',
          grupo: vao.id,
        });
        if (p.estilo === 'basculante') {
          ferragens.push({ id: idUnico(`cx_fer_articulador_${vid}`, ferragensUsadas), nome: 'Articulador', quantidade: '2' });
        } else {
          ferragens.push({ id: idUnico(`cx_fer_dobradica_${vid}`, ferragensUsadas), nome: 'Dobradiça', quantidade: formulaDobradicasPorAltura(hStr) });
        }
        ferragens.push({ id: idUnico(`cx_fer_puxador_${vid}`, ferragensUsadas), nome: 'Puxador', quantidade: '1' });
      } else if (p.estilo === 'giro_2') {
        const wFolha = subAfim(scaleAfim(pw, 0.5), afim(0, 0, folga / 2));
        const xDir = addAfim(fr.x0, addAfim(scaleAfim(pw, 0.5), afim(0, 0, folga / 2)));
        const wStr = formatarAfim(wFolha, 'L');
        pecas.push(
          { id: idUnico(`cx_porta_${vid}_1`, pecasUsadas), nome: 'Porta esquerda', papel: 'porta', eixo: 'y', origem: [formatarAfim(fr.x0, 'L'), fr.y, zStr], tamanho: [wStr, hStr], espessura: '18', material: 'mat_porta', fita: fita4, veio: 'b', grupo: vao.id },
          { id: idUnico(`cx_porta_${vid}_2`, pecasUsadas), nome: 'Porta direita', papel: 'porta', eixo: 'y', origem: [formatarAfim(xDir, 'L'), fr.y, zStr], tamanho: [wStr, hStr], espessura: '18', material: 'mat_porta', fita: fita4, veio: 'b', grupo: vao.id },
        );
        ferragens.push(
          { id: idUnico(`cx_fer_dobradica_${vid}`, ferragensUsadas), nome: 'Dobradiça', quantidade: `(${formulaDobradicasPorAltura(hStr)}) * 2` },
          { id: idUnico(`cx_fer_puxador_${vid}`, ferragensUsadas), nome: 'Puxador', quantidade: '2' },
        );
      } else {
        const nFolhas = Math.max(2, Math.min(8, Math.round(p.folhasCorrer ?? 2)));
        const passoX = scaleAfim(pw, 1 / nFolhas);
        const wFolha = addAfim(passoX, afim(0, 0, 15));
        const wStr = formatarAfim(wFolha, 'L');
        const yBase = p.montagem === 'sobreposta' ? -18 : 0;
        for (let k = 0; k < nFolhas; k++) {
          const xK = addAfim(fr.x0, scaleAfim(passoX, k));
          const yK = yBase - (k % 2) * 22;
          pecas.push({
            id: idUnico(`cx_porta_${vid}_${k + 1}`, pecasUsadas),
            nome: `Porta de correr ${k + 1}`,
            papel: 'porta',
            eixo: 'y',
            origem: [formatarAfim(xK, 'L'), String(yK), zStr],
            tamanho: [wStr, hStr],
            espessura: '18',
            material: 'mat_porta',
            fita: fita4,
            veio: 'b',
            grupo: vao.id,
          });
        }
        ferragens.push(
          { id: idUnico(`cx_fer_correr_${vid}`, ferragensUsadas), nome: 'Kit porta de correr', quantidade: '1' },
          { id: idUnico(`cx_fer_puxador_${vid}`, ferragensUsadas), nome: 'Puxador', quantidade: String(nFolhas) },
        );
      }
      break;
    }

    case 'gavetas': {
      const qty = Math.max(1, Math.min(24, Math.round(p.quantidade)));
      const gavetoes = Math.max(0, Math.min(qty, Math.round(p.gavetoes ?? 0)));
      const folga = p.folga ?? 3;
      const fr = bordasDaFrente(caixa, bordas, p.montagem, folga);
      const pw = subAfim(fr.x1, fr.x0);
      const ph = subAfim(fr.z1, fr.z0);
      const wInt = subAfim(caixa.x1, caixa.x0);
      const profDisp = formatarAfim(subAfim(subAfim(caixa.y1, caixa.y0), afim(0, 0, 50)), 'P');
      const profCaixa = `min(500, ${profDisp})`;
      const profCaixaMenosEsp = `min(500, ${profDisp}) - esp`;
      const xLatE = formatarAfim(addAfim(caixa.x0, afim(0, 0, 13)), 'L');
      const xLatD = formatarAfim(subAfim(caixa.x1, afim(0, 1, 13)), 'L');
      const xTras = formatarAfim(addAfim(caixa.x0, afim(0, 1, 13)), 'L');
      const wCaixa = formatarAfim(subAfim(wInt, afim(0, 2, 26)), 'L');

      if (gavetoes === 0) {
        const slotH = scaleAfim(ph, 1 / qty);
        const hFrente = subAfim(slotH, afim(0, 0, folga));
        const hCaixa = subAfim(hFrente, afim(0, 0, 40));
        const slotStr = formatarAfim(slotH, 'A');
        const zBaseFrente = formatarAfim(addAfim(fr.z0, afim(0, 0, folga / 2)), 'A');
        const zBaseCaixa = formatarAfim(addAfim(fr.z0, afim(0, 0, folga / 2 + 20)), 'A');
        const zBaseFundo = formatarAfim(addAfim(fr.z0, afim(0, 0, folga / 2 + 28)), 'A');
        const rep = String(qty);

        pecas.push(
          { id: idUnico(`cx_gav_frente_${vid}`, pecasUsadas), nome: 'Frente de gaveta', papel: 'frente_gaveta', eixo: 'y', origem: [formatarAfim(fr.x0, 'L'), fr.y, `${zBaseFrente} + (i - 1) * (${slotStr})`], tamanho: [formatarAfim(pw, 'L'), formatarAfim(hFrente, 'A')], espessura: '18', material: 'mat_porta', fita: fita4, veio: 'a', repetir: rep, grupo: vao.id },
          { id: idUnico(`cx_gav_latE_${vid}`, pecasUsadas), nome: 'Lateral esquerda gaveta', papel: 'lateral', eixo: 'x', origem: [xLatE, formatarAfim(caixa.y0, 'P'), `${zBaseCaixa} + (i - 1) * (${slotStr})`], tamanho: [profCaixa, formatarAfim(hCaixa, 'A')], espessura: 'esp', material: 'corpo', fita: { n: FITA_CAIXARIA }, veio: 'a', repetir: rep, grupo: vao.id },
          { id: idUnico(`cx_gav_latD_${vid}`, pecasUsadas), nome: 'Lateral direita gaveta', papel: 'lateral', eixo: 'x', origem: [xLatD, formatarAfim(caixa.y0, 'P'), `${zBaseCaixa} + (i - 1) * (${slotStr})`], tamanho: [profCaixa, formatarAfim(hCaixa, 'A')], espessura: 'esp', material: 'corpo', fita: { n: FITA_CAIXARIA }, veio: 'a', repetir: rep, grupo: vao.id },
          { id: idUnico(`cx_gav_tras_${vid}`, pecasUsadas), nome: 'Traseira gaveta', papel: 'painel', eixo: 'y', origem: [xTras, profCaixaMenosEsp, `${zBaseCaixa} + (i - 1) * (${slotStr})`], tamanho: [wCaixa, formatarAfim(hCaixa, 'A')], espessura: 'esp', material: 'corpo', veio: 'a', repetir: rep, grupo: vao.id },
          { id: idUnico(`cx_gav_fundo_${vid}`, pecasUsadas), nome: 'Fundo gaveta', papel: 'fundo', eixo: 'z', origem: [xTras, formatarAfim(caixa.y0, 'P'), `${zBaseFundo} + (i - 1) * (${slotStr})`], tamanho: [wCaixa, profCaixaMenosEsp], espessura: '6', material: 'mat_fundo', veio: 'livre', repetir: rep, grupo: vao.id },
        );
      } else {
        const pesoTotal = qty + gavetoes;
        let offsetPeso = 0;
        for (let k = 0; k < qty; k++) {
          const peso = k < gavetoes ? 2 : 1;
          const zSlot = addAfim(fr.z0, scaleAfim(ph, offsetPeso / pesoTotal));
          const slotH = scaleAfim(ph, peso / pesoTotal);
          const hFrente = subAfim(slotH, afim(0, 0, folga));
          const hCaixa = subAfim(hFrente, afim(0, 0, 40));
          const zF = addAfim(zSlot, afim(0, 0, folga / 2));
          const zC = addAfim(zF, afim(0, 0, 20));
          const zFd = addAfim(zF, afim(0, 0, 28));
          const sufixo = `${vid}_${k + 1}`;
          pecas.push(
            { id: idUnico(`cx_gav_frente_${sufixo}`, pecasUsadas), nome: `Frente gaveta ${k + 1}`, papel: 'frente_gaveta', eixo: 'y', origem: [formatarAfim(fr.x0, 'L'), fr.y, formatarAfim(zF, 'A')], tamanho: [formatarAfim(pw, 'L'), formatarAfim(hFrente, 'A')], espessura: '18', material: 'mat_porta', fita: fita4, veio: 'a', grupo: vao.id },
            { id: idUnico(`cx_gav_latE_${sufixo}`, pecasUsadas), nome: `Lateral esq. gaveta ${k + 1}`, papel: 'lateral', eixo: 'x', origem: [xLatE, formatarAfim(caixa.y0, 'P'), formatarAfim(zC, 'A')], tamanho: [profCaixa, formatarAfim(hCaixa, 'A')], espessura: 'esp', material: 'corpo', fita: { n: FITA_CAIXARIA }, veio: 'a', grupo: vao.id },
            { id: idUnico(`cx_gav_latD_${sufixo}`, pecasUsadas), nome: `Lateral dir. gaveta ${k + 1}`, papel: 'lateral', eixo: 'x', origem: [xLatD, formatarAfim(caixa.y0, 'P'), formatarAfim(zC, 'A')], tamanho: [profCaixa, formatarAfim(hCaixa, 'A')], espessura: 'esp', material: 'corpo', fita: { n: FITA_CAIXARIA }, veio: 'a', grupo: vao.id },
            { id: idUnico(`cx_gav_tras_${sufixo}`, pecasUsadas), nome: `Traseira gaveta ${k + 1}`, papel: 'painel', eixo: 'y', origem: [xTras, profCaixaMenosEsp, formatarAfim(zC, 'A')], tamanho: [wCaixa, formatarAfim(hCaixa, 'A')], espessura: 'esp', material: 'corpo', veio: 'a', grupo: vao.id },
            { id: idUnico(`cx_gav_fundo_${sufixo}`, pecasUsadas), nome: `Fundo gaveta ${k + 1}`, papel: 'fundo', eixo: 'z', origem: [xTras, formatarAfim(caixa.y0, 'P'), formatarAfim(zFd, 'A')], tamanho: [wCaixa, profCaixaMenosEsp], espessura: '6', material: 'mat_fundo', veio: 'livre', grupo: vao.id },
          );
          offsetPeso += peso;
        }
      }

      ferragens.push(
        { id: idUnico(`cx_fer_corredica_${vid}`, ferragensUsadas), nome: 'Corrediça telescópica', quantidade: String(qty) },
        { id: idUnico(`cx_fer_puxador_${vid}`, ferragensUsadas), nome: 'Puxador', quantidade: String(qty) },
      );
      break;
    }

    case 'cabideiro': {
      const offset = Math.max(0, p.alturaOffsetTopo ?? 60);
      const midY = subAfim(scaleAfim(addAfim(caixa.y0, caixa.y1), 0.5), afim(0, 0, 12.5));
      const zCab = subAfim(caixa.z1, afim(0, 0, offset + 25));
      pecas.push({
        id: idUnico(`cx_cabideiro_${vid}`, pecasUsadas),
        nome: 'Cabideiro',
        papel: 'generica',
        eixo: 'z',
        origem: [formatarAfim(caixa.x0, 'L'), formatarAfim(midY, 'P'), formatarAfim(zCab, 'A')],
        tamanho: [formatarAfim(subAfim(caixa.x1, caixa.x0), 'L'), '25'],
        espessura: '25',
        material: 'aluminio',
        grupo: vao.id,
      });
      ferragens.push({ id: idUnico(`cx_fer_suporte_cab_${vid}`, ferragensUsadas), nome: 'Suporte de cabideiro', quantidade: '2' });
      break;
    }

    case 'ripado': {
      const larg = Math.max(5, p.larguraRipa);
      const espac = Math.max(0, p.espacamento);
      const prof = Math.max(5, p.profundidadeRipa ?? 20);
      const passo = larg + espac;
      const yRipa = formatarAfim(subAfim(caixa.y1, afim(0, 0, prof)), 'P');
      if (p.direcao === 'vertical') {
        const wStr = formatarAfim(subAfim(caixa.x1, caixa.x0), 'L');
        pecas.push({
          id: idUnico(`cx_ripado_${vid}`, pecasUsadas),
          nome: 'Ripado vertical',
          papel: 'painel',
          eixo: 'x',
          origem: [`${formatarAfim(caixa.x0, 'L')} + (i - 1) * ${passo}`, yRipa, formatarAfim(caixa.z0, 'A')],
          tamanho: [String(prof), formatarAfim(subAfim(caixa.z1, caixa.z0), 'A')],
          espessura: String(larg),
          material: 'corpo',
          fita: { n: FITA_CAIXARIA },
          repetir: `clamp(floor((${wStr} + ${espac}) / ${passo}), 1, 64)`,
          grupo: vao.id,
        });
      } else {
        const hStr = formatarAfim(subAfim(caixa.z1, caixa.z0), 'A');
        pecas.push({
          id: idUnico(`cx_ripado_${vid}`, pecasUsadas),
          nome: 'Ripado horizontal',
          papel: 'painel',
          eixo: 'z',
          origem: [formatarAfim(caixa.x0, 'L'), yRipa, `${formatarAfim(caixa.z0, 'A')} + (i - 1) * ${passo}`],
          tamanho: [formatarAfim(subAfim(caixa.x1, caixa.x0), 'L'), String(prof)],
          espessura: String(larg),
          material: 'corpo',
          fita: { n: FITA_CAIXARIA },
          repetir: `clamp(floor((${hStr} + ${espac}) / ${passo}), 1, 64)`,
          grupo: vao.id,
        });
      }
      break;
    }

    case 'sapateira': {
      const qty = Math.max(1, Math.min(32, Math.round(p.quantidade)));
      const hVao = formatarAfim(subAfim(caixa.z1, caixa.z0), 'A');
      const dVao = formatarAfim(subAfim(caixa.y1, addAfim(caixa.y0, afim(0, 0, 20))), 'P');
      pecas.push({
        id: idUnico(`cx_sapateira_${vid}`, pecasUsadas),
        nome: 'Prateleira sapateira',
        papel: 'prateleira',
        eixo: 'z',
        origem: [formatarAfim(caixa.x0, 'L'), formatarAfim(addAfim(caixa.y0, afim(0, 0, 20)), 'P'), `${formatarAfim(caixa.z0, 'A')} + i * (${hVao} - ${qty} * esp) / ${qty + 1} + (i - 1) * esp`],
        tamanho: [formatarAfim(subAfim(caixa.x1, caixa.x0), 'L'), dVao],
        espessura: 'esp',
        material: 'corpo',
        fita: { n: FITA_CAIXARIA },
        veio: 'a',
        repetir: String(qty),
        grupo: vao.id,
      });
      ferragens.push({ id: idUnico(`cx_fer_pino_sap_${vid}`, ferragensUsadas), nome: 'Pino de prateleira', quantidade: String(4 * qty) });
      break;
    }
  }
}
