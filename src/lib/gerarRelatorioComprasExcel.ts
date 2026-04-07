import ExcelJS from 'exceljs';
import { supabase } from '@/integrations/supabase/client';
import { stripHtml } from './htmlUtils';

interface ContratoGestaoRelatorio {
  id: string;
  nome_contrato: string;
  ente_federativo: string;
}

interface DadosRelatorioExcel {
  contratosGestao: ContratoGestaoRelatorio[];
  mesAno: string;
  periodoInicio: string;
  periodoFim: string;
}

const formatarMoeda = (valor: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

const statusLabels: Record<string, string> = {
  planejado: 'ABERTO',
  em_cotacao: 'EM COTAÇÃO',
  cotacao_concluida: 'COTAÇÃO CONCLUÍDA',
  em_selecao: 'EM SELEÇÃO',
  contratado: 'CONTRATADO',
  contratacao: 'EM CONTRATAÇÃO',
  concluido: 'CONCLUÍDO',
  dispensa: 'DISPENSA',
};

const corPrimaria = '1C91D9';
const corPrimariaClara = 'ADE0F5';
const corLinhaAlternada = 'F5F5FF';
const corBranco = 'FFFFFF';

const estiloHeaderPrincipal: Partial<ExcelJS.Style> = {
  font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Calibri' },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${corPrimaria}` } },
  alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
  border: {
    top: { style: 'thin' }, bottom: { style: 'thin' },
    left: { style: 'thin' }, right: { style: 'thin' },
  },
};

const estiloHeaderAba: Partial<ExcelJS.Style> = {
  font: { bold: true, color: { argb: 'FF000000' }, size: 10, name: 'Calibri' },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${corPrimariaClara}` } },
  alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
  border: {
    top: { style: 'thin' }, bottom: { style: 'thin' },
    left: { style: 'thin' }, right: { style: 'thin' },
  },
};

const estiloCelula = (alternada: boolean): Partial<ExcelJS.Style> => ({
  font: { size: 10, name: 'Calibri' },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: alternada ? `FF${corLinhaAlternada}` : `FF${corBranco}` } },
  alignment: { vertical: 'middle', wrapText: true },
  border: {
    top: { style: 'thin' }, bottom: { style: 'thin' },
    left: { style: 'thin' }, right: { style: 'thin' },
  },
});

const estiloTotalRow: Partial<ExcelJS.Style> = {
  font: { bold: true, size: 10, name: 'Calibri' },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E6FA' } },
  alignment: { horizontal: 'center', vertical: 'middle' },
  border: {
    top: { style: 'thin' }, bottom: { style: 'thin' },
    left: { style: 'thin' }, right: { style: 'thin' },
  },
};

export const gerarRelatorioComprasExcel = async (dados: DadosRelatorioExcel): Promise<void> => {
  // ===== FETCH DATA (same logic as PDF) =====
  const dadosPorCG: Array<{
    cg: ContratoGestaoRelatorio;
    processos: any[];
    contratos: any[];
    totalProcessos: number;
    totalContratos: number;
    totalProcessosContratos: number;
  }> = [];

  for (const cg of dados.contratosGestao) {
    const { data: processos } = await supabase
      .from('processos_compras')
      .select('id, numero_processo_interno, objeto_resumido, tipo, valor_estimado_anual, valor_total_cotacao, status_processo, ano_referencia, data_abertura, created_at, contrato_gestao_id, requer_selecao')
      .eq('contrato_gestao_id', cg.id)
      .not('status_processo', 'in', '("concluido","cancelado")')
      .gte('created_at', dados.periodoInicio)
      .lte('created_at', dados.periodoFim + 'T23:59:59');

    const { data: processosEmTramite } = await supabase
      .from('processos_compras')
      .select('id, numero_processo_interno, objeto_resumido, tipo, valor_estimado_anual, valor_total_cotacao, status_processo, ano_referencia, data_abertura, created_at, contrato_gestao_id, requer_selecao')
      .eq('contrato_gestao_id', cg.id)
      .not('status_processo', 'in', '("concluido","cancelado")')
      .lt('created_at', dados.periodoInicio);

    const { data: processosConcluidos } = await supabase
      .from('processos_compras')
      .select('id, numero_processo_interno, objeto_resumido, tipo, valor_estimado_anual, valor_total_cotacao, status_processo, ano_referencia, data_abertura, created_at, contrato_gestao_id, requer_selecao')
      .eq('contrato_gestao_id', cg.id)
      .eq('status_processo', 'concluido')
      .gte('created_at', dados.periodoInicio)
      .lte('created_at', dados.periodoFim + 'T23:59:59');

    const todosProcessos = [...(processos || [])];
    const idsExistentes = new Set(todosProcessos.map(p => p.id));
    for (const p of (processosEmTramite || [])) {
      if (!idsExistentes.has(p.id)) todosProcessos.push(p);
    }
    for (const p of (processosConcluidos || [])) {
      if (!idsExistentes.has(p.id)) {
        todosProcessos.push(p);
        idsExistentes.add(p.id);
      }
    }

    const processosIds = todosProcessos.map(p => p.id);
    let contratosVinculadosMap: Record<string, string> = {};
    let homologacaoDatasMap: Record<string, string> = {};

    if (processosIds.length > 0) {
      const { data: processosParaContratar } = await supabase
        .from('processos_para_contratar')
        .select('processo_compra_id, id')
        .in('processo_compra_id', processosIds);

      if (processosParaContratar && processosParaContratar.length > 0) {
        const ppcIds = processosParaContratar.map(ppc => ppc.id);
        const { data: contratosVinc } = await supabase
          .from('contratos_terceiros')
          .select('processo_para_contratar_id, codigo_interno')
          .in('processo_para_contratar_id', ppcIds);

        if (contratosVinc) {
          const ppcToProcesso: Record<string, string> = {};
          for (const ppc of processosParaContratar) ppcToProcesso[ppc.id] = ppc.processo_compra_id;
          for (const cv of contratosVinc) {
            if (cv.processo_para_contratar_id) {
              const procId = ppcToProcesso[cv.processo_para_contratar_id];
              if (procId) {
                contratosVinculadosMap[procId] = contratosVinculadosMap[procId]
                  ? contratosVinculadosMap[procId] + ', ' + cv.codigo_interno
                  : cv.codigo_interno;
              }
            }
          }
        }
      }

      const cotacaoIds: string[] = [];
      const { data: cotacoesAll } = await supabase
        .from('cotacoes_precos')
        .select('id, processo_compra_id')
        .in('processo_compra_id', processosIds);

      const cotacaoToProcesso: Record<string, string> = {};
      if (cotacoesAll) {
        for (const c of cotacoesAll) {
          cotacaoIds.push(c.id);
          cotacaoToProcesso[c.id] = c.processo_compra_id;
        }
      }

      // Build map of which processes require selection
      const processosRequerSelecaoMap: Record<string, boolean> = {};
      for (const p of todosProcessos) {
        processosRequerSelecaoMap[p.id] = !!p.requer_selecao;
      }

      if (cotacaoIds.length > 0) {
        // Autorização only for compra direta (processes that DON'T require selection)
        const { data: autorizacoes } = await supabase
          .from('autorizacoes_processo')
          .select('cotacao_id, data_geracao')
          .in('cotacao_id', cotacaoIds);

        if (autorizacoes) {
          for (const a of autorizacoes) {
            const procId = cotacaoToProcesso[a.cotacao_id];
            if (procId && !homologacaoDatasMap[procId] && !processosRequerSelecaoMap[procId]) {
              homologacaoDatasMap[procId] = a.data_geracao.split('T')[0].split('-').reverse().join('/');
            }
          }
        }
      }

      const { data: selecoes } = await supabase
        .from('selecoes_fornecedores')
        .select('id, cotacao_relacionada_id')
        .in('cotacao_relacionada_id', cotacaoIds);

      if (selecoes && selecoes.length > 0) {
        const selecaoIds = (selecoes as any[]).map(s => s.id);
        const selecaoToCotacao: Record<string, string> = {};
        for (const s of (selecoes as any[])) selecaoToCotacao[s.id] = s.cotacao_relacionada_id;

        const { data: homologacoes } = await supabase
          .from('homologacoes_selecao')
          .select('selecao_id, data_geracao')
          .in('selecao_id', selecaoIds);

        if (homologacoes) {
          for (const h of homologacoes) {
            const cotId = selecaoToCotacao[h.selecao_id];
            if (cotId) {
              const procId = cotacaoToProcesso[cotId];
              if (procId && !homologacaoDatasMap[procId]) {
                homologacaoDatasMap[procId] = h.data_geracao.split('T')[0].split('-').reverse().join('/');
              }
            }
          }
        }
      }
    }

    const { data: contratosVigentes } = await supabase
      .from('contratos_terceiros')
      .select('id, codigo_interno, objeto, valor_atual, inicio_vigencia, fim_vigencia_atual, status, fornecedor_id, fornecedor_nome_manual')
      .eq('contrato_gestao_id', cg.id)
      .eq('status', 'vigente');

    const fornecedorIds = (contratosVigentes || []).filter(c => c.fornecedor_id).map(c => c.fornecedor_id!);
    let fornecedoresMap: Record<string, string> = {};
    if (fornecedorIds.length > 0) {
      const { data: fornecedores } = await supabase
        .from('fornecedores')
        .select('id, razao_social')
        .in('id', fornecedorIds);
      if (fornecedores) fornecedoresMap = Object.fromEntries(fornecedores.map(f => [f.id, f.razao_social]));
    }

    const contratosComFornecedor = (contratosVigentes || []).map(c => ({
      ...c,
      fornecedor_razao_social: c.fornecedor_id
        ? (fornecedoresMap[c.fornecedor_id] || c.fornecedor_nome_manual || 'N/A')
        : (c.fornecedor_nome_manual || 'N/A'),
    }));

    const processosEnriquecidos = todosProcessos.map(p => {
      const isConcluido = p.status_processo === 'concluido';
      const temContrato = !!contratosVinculadosMap[p.id];
      return {
        ...p,
        contratos_vinculados: temContrato ? contratosVinculadosMap[p.id] : (isConcluido ? 'SEM CONTRATO' : '-'),
        data_homologacao: homologacaoDatasMap[p.id] || '',
      };
    });

    dadosPorCG.push({
      cg,
      processos: processosEnriquecidos,
      contratos: contratosComFornecedor,
      totalProcessos: processosEnriquecidos.length,
      totalContratos: contratosComFornecedor.length,
      totalProcessosContratos: processosEnriquecidos.length + contratosComFornecedor.length,
    });
  }

  const totalGeralProcessos = dadosPorCG.reduce((s, d) => s + d.totalProcessos, 0);
  const totalGeralContratos = dadosPorCG.reduce((s, d) => s + d.totalContratos, 0);
  const totalGeral = dadosPorCG.reduce((s, d) => s + d.totalProcessosContratos, 0);

  // ===== BUILD WORKBOOK =====
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Prima Qualitá Saúde';
  wb.created = new Date();

  // ====== ABA 1: RELATÓRIO (resumo quantitativo) ======
  const wsRelatorio = wb.addWorksheet('Relatório');

  // Título
  wsRelatorio.mergeCells('A1:E1');
  const tituloCell = wsRelatorio.getCell('A1');
  tituloCell.value = `RELATÓRIO QUALITATIVO DE COMPRAS - ${dados.mesAno.toUpperCase()}`;
  tituloCell.font = { bold: true, size: 14, color: { argb: `FF${corPrimaria}` }, name: 'Calibri' };
  tituloCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsRelatorio.getRow(1).height = 30;

  wsRelatorio.mergeCells('A2:E2');
  const subCell = wsRelatorio.getCell('A2');
  subCell.value = `Período: ${dados.mesAno}`;
  subCell.font = { size: 10, name: 'Calibri', italic: true };
  subCell.alignment = { horizontal: 'center' };

  // Header row
  const headerRow = wsRelatorio.getRow(4);
  const headers = ['CONTRATO DE GESTÃO', 'PROCESSOS', 'CONTRATOS', 'TOTAL', '%'];
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.style = estiloHeaderPrincipal;
  });
  headerRow.height = 22;

  // Data rows
  dadosPorCG.forEach((d, idx) => {
    const row = wsRelatorio.getRow(5 + idx);
    const percentual = totalGeral > 0 ? ((d.totalProcessosContratos / totalGeral) * 100) : 0;
    const valores = [d.cg.nome_contrato, d.totalProcessos, d.totalContratos, d.totalProcessosContratos, percentual / 100];
    valores.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      const estilo = estiloCelula(idx % 2 === 1);
      cell.style = { ...estilo, alignment: { ...estilo.alignment, horizontal: i === 0 ? 'left' : 'center' } };
    });
    row.getCell(5).numFmt = '0.00%';
    row.height = 20;
  });

  // Total row
  const totalRowIdx = 5 + dadosPorCG.length;
  const totalRow = wsRelatorio.getRow(totalRowIdx);
  const totalVals = ['TOTAL', totalGeralProcessos, totalGeralContratos, totalGeral, totalGeral > 0 ? 1 : 0];
  totalVals.forEach((v, i) => {
    const cell = totalRow.getCell(i + 1);
    cell.value = v;
    cell.style = { ...estiloTotalRow, alignment: { ...estiloTotalRow.alignment, horizontal: i === 0 ? 'left' : 'center' } };
  });
  totalRow.getCell(5).numFmt = '0.00%';
  totalRow.height = 22;

  // Column widths
  wsRelatorio.getColumn(1).width = 45;
  wsRelatorio.getColumn(2).width = 16;
  wsRelatorio.getColumn(3).width = 16;
  wsRelatorio.getColumn(4).width = 14;
  wsRelatorio.getColumn(5).width = 12;

  // ====== ABA 2: PROCESSOS (todos juntos, ordenados) ======
  const todosProcessos: any[] = [];
  for (const d of dadosPorCG) {
    for (const p of d.processos) {
      todosProcessos.push({ ...p, cg_nome: d.cg.nome_contrato });
    }
  }
  todosProcessos.sort((a, b) => (a.numero_processo_interno || '').localeCompare(b.numero_processo_interno || ''));

  const wsProcessos = wb.addWorksheet('Processos');
  wsProcessos.mergeCells('A1:G1');
  const tituloProcCell = wsProcessos.getCell('A1');
  tituloProcCell.value = `CONTROLE DE PROCESSOS - ${dados.mesAno.toUpperCase()}`;
  tituloProcCell.font = { bold: true, size: 14, color: { argb: `FF${corPrimaria}` }, name: 'Calibri' };
  tituloProcCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsProcessos.getRow(1).height = 30;

  const procHeaders = ['PROCESSO', 'DATA', 'CONTRATO DE GESTÃO', 'OBJETO', 'STATUS', 'CONTRATOS', 'AUT./HOMOL.'];
  const procHeaderRow = wsProcessos.getRow(3);
  procHeaders.forEach((h, i) => {
    const cell = procHeaderRow.getCell(i + 1);
    cell.value = h;
    cell.style = estiloHeaderPrincipal;
  });
  procHeaderRow.height = 22;

  todosProcessos.forEach((p: any, pIdx: number) => {
    const row = wsProcessos.getRow(4 + pIdx);
    const vals = [
      p.numero_processo_interno || 'N/A',
      p.data_abertura ? p.data_abertura.split('-').reverse().join('/') : (p.created_at ? p.created_at.split('T')[0].split('-').reverse().join('/') : 'N/A'),
      p.cg_nome,
      stripHtml(p.objeto_resumido || ''),
      statusLabels[p.status_processo] || p.status_processo?.replace(/_/g, ' ').toUpperCase() || 'N/A',
      p.contratos_vinculados || '-',
      p.data_homologacao || '',
    ];
    vals.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      const estilo = estiloCelula(pIdx % 2 === 1);
      cell.style = { ...estilo, alignment: { ...estilo.alignment, horizontal: [0, 1, 4, 5, 6].includes(i) ? 'center' : 'left' } };
    });
    row.height = 18;
  });

  wsProcessos.getColumn(1).width = 16;
  wsProcessos.getColumn(2).width = 14;
  wsProcessos.getColumn(3).width = 28;
  wsProcessos.getColumn(4).width = 50;
  wsProcessos.getColumn(5).width = 20;
  wsProcessos.getColumn(6).width = 18;
  wsProcessos.getColumn(7).width = 16;

  // ====== ABA 3: CONTRATOS (todos juntos, ordenados) ======
  const todosContratos: any[] = [];
  for (const d of dadosPorCG) {
    for (const c of d.contratos) {
      todosContratos.push({ ...c, cg_nome: d.cg.nome_contrato, cg_ente: d.cg.ente_federativo });
    }
  }
  todosContratos.sort((a, b) => (a.codigo_interno || '').localeCompare(b.codigo_interno || ''));

  const wsContratos = wb.addWorksheet('Contratos');
  wsContratos.mergeCells('A1:E1');
  const tituloContrCell = wsContratos.getCell('A1');
  tituloContrCell.value = `CONTRATOS VIGENTES - ${dados.mesAno.toUpperCase()}`;
  tituloContrCell.font = { bold: true, size: 14, color: { argb: `FF${corPrimaria}` }, name: 'Calibri' };
  tituloContrCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsContratos.getRow(1).height = 30;

  const contrHeaders = ['Nº CONTRATO', 'OBJETO', 'PARTE CONTRATADA', 'INÍCIO DA VIGÊNCIA', 'TÉRMINO DA VIGÊNCIA'];
  const contrHeaderRow = wsContratos.getRow(3);
  contrHeaders.forEach((h, i) => {
    const cell = contrHeaderRow.getCell(i + 1);
    cell.value = h;
    cell.style = estiloHeaderPrincipal;
  });
  contrHeaderRow.height = 22;

  todosContratos.forEach((c: any, cIdx: number) => {
    const row = wsContratos.getRow(4 + cIdx);
    const vals = [
      c.codigo_interno || 'N/A',
      c.objeto || '',
      c.fornecedor_razao_social || 'N/A',
      c.inicio_vigencia ? c.inicio_vigencia.split('-').reverse().join('/') : 'N/A',
      c.fim_vigencia_atual ? c.fim_vigencia_atual.split('-').reverse().join('/') : 'N/A',
    ];
    vals.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      const estilo = estiloCelula(cIdx % 2 === 1);
      cell.style = { ...estilo, alignment: { ...estilo.alignment, horizontal: [0, 3, 4].includes(i) ? 'center' : 'left' } };
    });
    row.height = 18;
  });

  wsContratos.getColumn(1).width = 18;
  wsContratos.getColumn(2).width = 50;
  wsContratos.getColumn(3).width = 40;
  wsContratos.getColumn(4).width = 22;
  wsContratos.getColumn(5).width = 22;

  // ===== DOWNLOAD =====
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Relatório de Compras - ${dados.mesAno}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
