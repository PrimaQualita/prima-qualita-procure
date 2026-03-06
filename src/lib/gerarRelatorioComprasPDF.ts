import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';
import capaLogo from '@/assets/capa-processo-logo.png';
import capaRodape from '@/assets/capa-processo-rodape.png';
import logoMarcaDagua from '@/assets/prima-qualita-logo.png';
import { adicionarCertificacaoDigital, gerarHashDocumento } from './certificacaoDigital';
import { stripHtml } from './htmlUtils';

interface ContratoGestaoRelatorio {
  id: string;
  nome_contrato: string;
  ente_federativo: string;
}

interface DadosRelatorioCompras {
  contratosGestao: ContratoGestaoRelatorio[];
  mesAno: string;
  periodoInicio: string;
  periodoFim: string;
  usuarioNome: string;
  usuarioCpf: string;
}

interface ResultadoRelatorio {
  url: string;
  fileName: string;
  protocolo: string;
}

const carregarImagem = (src: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } else {
        reject(new Error('Erro ao criar canvas'));
      }
    };
    img.onerror = () => reject(new Error('Erro ao carregar imagem'));
    img.src = src;
  });
};

const formatarMoeda = (valor: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

export const gerarRelatorioComprasPDF = async (dados: DadosRelatorioCompras): Promise<ResultadoRelatorio> => {
  const agora = new Date();
  const dataHora = agora.toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'medium' });
  const timestamp = agora.getTime();
  const protocoloNumerico = timestamp.toString().padStart(16, '0');
  const protocolo = protocoloNumerico.match(/.{1,4}/g)?.join('-') || protocoloNumerico;

  // Carregar dados de processos e contratos para cada CG
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
      .select('id, numero_processo_interno, objeto_resumido, tipo, valor_estimado_anual, valor_total_cotacao, status_processo, ano_referencia, data_abertura, created_at, contrato_gestao_id')
      .eq('contrato_gestao_id', cg.id)
      .not('status_processo', 'in', '("concluido","cancelado")')
      .gte('created_at', dados.periodoInicio)
      .lte('created_at', dados.periodoFim + 'T23:59:59');

    const { data: processosEmTramite } = await supabase
      .from('processos_compras')
      .select('id, numero_processo_interno, objeto_resumido, tipo, valor_estimado_anual, valor_total_cotacao, status_processo, ano_referencia, data_abertura, created_at, contrato_gestao_id')
      .eq('contrato_gestao_id', cg.id)
      .not('status_processo', 'in', '("concluido","cancelado")')
      .lt('created_at', dados.periodoInicio);

    // Also include concluded processes within the period
    const { data: processosConcluidos } = await supabase
      .from('processos_compras')
      .select('id, numero_processo_interno, objeto_resumido, tipo, valor_estimado_anual, valor_total_cotacao, status_processo, ano_referencia, data_abertura, created_at, contrato_gestao_id')
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

    // For concluded processes, try to get contract codes and homologation/report dates
    const processosIds = todosProcessos.map(p => p.id);
    let contratosVinculadosMap: Record<string, string> = {};
    let homologacaoDatasMap: Record<string, string> = {};

    if (processosIds.length > 0) {
      // Get contracts linked via processos_para_contratar
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
          for (const ppc of processosParaContratar) {
            ppcToProcesso[ppc.id] = ppc.processo_compra_id;
          }
          for (const cv of contratosVinc) {
            if (cv.processo_para_contratar_id) {
              const procId = ppcToProcesso[cv.processo_para_contratar_id];
              if (procId) {
                if (contratosVinculadosMap[procId]) {
                  contratosVinculadosMap[procId] += ', ' + cv.codigo_interno;
                } else {
                  contratosVinculadosMap[procId] = cv.codigo_interno;
                }
              }
            }
          }
        }
      }

      // Get authorization dates (compra direta) from autorizacoes_processo
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

      if (cotacaoIds.length > 0) {
        // Autorização de compra direta
        const { data: autorizacoes } = await supabase
          .from('autorizacoes_processo')
          .select('cotacao_id, data_geracao')
          .in('cotacao_id', cotacaoIds);

        if (autorizacoes) {
          for (const a of autorizacoes) {
            const procId = cotacaoToProcesso[a.cotacao_id];
            if (procId && !homologacaoDatasMap[procId]) {
              homologacaoDatasMap[procId] = a.data_geracao.split('T')[0].split('-').reverse().join('/');
            }
          }
        }
      }

      // Homologação de seleção
      const { data: selecoes } = await supabase
        .from('selecoes_fornecedores')
        .select('id, cotacao_relacionada_id')
        .in('cotacao_relacionada_id', cotacaoIds);

      if (selecoes && selecoes.length > 0) {
        const selecaoIds = (selecoes as any[]).map(s => s.id);
        const selecaoToCotacao: Record<string, string> = {};
        for (const s of (selecoes as any[])) {
          selecaoToCotacao[s.id] = s.cotacao_relacionada_id;
        }

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

    // Contratos vigentes
    const { data: contratosVigentes } = await supabase
      .from('contratos_terceiros')
      .select('id, codigo_interno, objeto, valor_atual, inicio_vigencia, fim_vigencia_atual, status, fornecedor_id')
      .eq('contrato_gestao_id', cg.id)
      .eq('status', 'vigente');

    const fornecedorIds = (contratosVigentes || []).filter(c => c.fornecedor_id).map(c => c.fornecedor_id!);
    let fornecedoresMap: Record<string, string> = {};
    if (fornecedorIds.length > 0) {
      const { data: fornecedores } = await supabase
        .from('fornecedores')
        .select('id, razao_social')
        .in('id', fornecedorIds);
      if (fornecedores) {
        fornecedoresMap = Object.fromEntries(fornecedores.map(f => [f.id, f.razao_social]));
      }
    }

    const contratosComFornecedor = (contratosVigentes || []).map(c => ({
      ...c,
      fornecedor_razao_social: c.fornecedor_id ? (fornecedoresMap[c.fornecedor_id] || 'N/A') : 'N/A'
    }));

    // Enrich processes with contract codes and dates
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

  const totalGeralProcessos = dadosPorCG.reduce((sum, d) => sum + d.totalProcessos, 0);
  const totalGeralContratos = dadosPorCG.reduce((sum, d) => sum + d.totalContratos, 0);
  const totalGeral = dadosPorCG.reduce((sum, d) => sum + d.totalProcessosContratos, 0);

  // Carregar imagens
  const [base64Logo, base64Rodape, base64MarcaDagua] = await Promise.all([
    carregarImagem(capaLogo),
    carregarImagem(capaRodape),
    carregarImagem(logoMarcaDagua),
  ]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const logoHeight = 40;
  const rodapeHeight = 25;

  const adicionarCabecalhoRodape = (pagina: number) => {
    // Logo expandindo igual requisição
    try { doc.addImage(base64Logo, 'PNG', 1.5, 0, pageWidth - 3, logoHeight); } catch {}
    // Marca d'água igual requisição (160x80, opacity 0.08)
    try {
      doc.saveGraphicsState();
      const gs = doc.GState({ opacity: 0.08 });
      doc.setGState(gs);
      doc.addImage(base64MarcaDagua, 'PNG', (pageWidth - 160) / 2, (pageHeight - 80) / 2, 160, 80);
      doc.restoreGraphicsState();
    } catch {}
    // Rodapé expandindo igual requisição
    try { doc.addImage(base64Rodape, 'PNG', 1.5, pageHeight - rodapeHeight, pageWidth - 3, rodapeHeight); } catch {}
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(`Página ${pagina}`, pageWidth - 25, pageHeight - 8);
  };

  // ====== PÁGINA 1: RELATÓRIO PRINCIPAL ======
  adicionarCabecalhoRodape(1);
  let y = logoHeight + 10;

  // Cor do logo (primary: HSL 195 77% 48% ≈ RGB 28, 145, 217)
  const corPrimaria: [number, number, number] = [28, 145, 217];

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...corPrimaria);
  doc.text(`Dados qualitativos ao mês de ${dados.mesAno}`, pageWidth / 2, y, { align: 'center' });

  y += 10;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text('De: Departamento de Compras', 15, y);
  y += 5;
  doc.text('Para: Diretoria Financeira', 15, y);

  y += 10;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...corPrimaria);
  doc.text('INDICADORES QUALITATIVOS', pageWidth / 2, y, { align: 'center' });
  y += 8;

  // Tabela principal com colunas separadas
  const tableHeaders = [
    ['CONTRATO DE GESTÃO / ANO', 'PROCESSOS', 'CONTRATOS', 'TOTAL', '%'],
  ];

  const tableBody: string[][] = [];
  for (const d of dadosPorCG) {
    const percentual = totalGeral > 0 ? ((d.totalProcessosContratos / totalGeral) * 100) : 0;
    tableBody.push([
      d.cg.nome_contrato,
      d.totalProcessos.toString(),
      d.totalContratos.toString(),
      d.totalProcessosContratos.toString(),
      percentual.toFixed(2) + '%',
    ]);
  }

  tableBody.push([
    'Total',
    totalGeralProcessos.toString(),
    totalGeralContratos.toString(),
    totalGeral.toString(),
    totalGeral > 0 ? '100,00%' : '0,00%',
  ]);

  autoTable(doc, {
    startY: y,
    head: tableHeaders,
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [0, 0, 139],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 8,
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: 70 },
      1: { halign: 'center', cellWidth: 25 },
      2: { halign: 'center', cellWidth: 25 },
      3: { halign: 'center', cellWidth: 25 },
      4: { halign: 'center', cellWidth: 25 },
    },
    margin: { left: 15, right: 15 },
    didParseCell: (data: any) => {
      if (data.row.index === tableBody.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [230, 230, 250];
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  const textoDescritivo = doc.splitTextToSize(
    'Além das informações apresentadas na planilha, anexamos os documentos comprobatórios pertinentes, conforme exigido pelo item 8 do Manual de Rateio, para validação e auditoria dos dados fornecidos.',
    pageWidth - 30
  );
  doc.text(textoDescritivo, 15, y);
  y += textoDescritivo.length * 4 + 5;

  doc.text('Agradecemos a atenção e permanecemos à disposição para quaisquer esclarecimentos adicionais.', 15, y);
  y += 12;

  // Certificação digital
  const baseUrl = window.location.origin;
  const linkVerificacao = `${baseUrl}/verificar-documento?protocolo=${protocolo}`;

  const hashContent = `relatorio-compras|${protocolo}|${dados.mesAno}|${totalGeral}|${dados.usuarioNome}`;
  const hash = await gerarHashDocumento(hashContent);

  if (y > pageHeight - 80) {
    doc.addPage();
    adicionarCabecalhoRodape(doc.getNumberOfPages());
    y = logoHeight + 10;
  }

  adicionarCertificacaoDigital(doc, {
    protocolo,
    dataHora,
    responsavel: dados.usuarioNome,
    cpf: dados.usuarioCpf,
    hash,
    linkVerificacao,
  }, y);

  // ====== PÁGINAS ANEXAS: PLANILHA POR CG ======
  let paginaAtual = doc.getNumberOfPages();

  for (const d of dadosPorCG) {
    // ---- PROCESSOS ----
    doc.addPage();
    paginaAtual++;
    adicionarCabecalhoRodape(paginaAtual);
    let yAnexo = logoHeight + 5;

    // Title bar like reference image
    doc.setFillColor(173, 216, 230);
    doc.rect(15, yAnexo, pageWidth - 30, 8, 'F');
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(15, yAnexo, pageWidth - 30, 8, 'S');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`CONTROLE DE PROCESSOS - ${dados.mesAno.toUpperCase()}`, pageWidth / 2, yAnexo + 5.5, { align: 'center' });
    yAnexo += 10;

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

    if (d.processos.length > 0) {
      autoTable(doc, {
        startY: yAnexo,
        head: [['PROCESSO', 'DATA', 'CONTRATO DE GESTÃO', 'OBJETO', 'STATUS', 'CONTRATOS', 'HOMOLOGAÇÃO\nRELATÓRIO FINAL']],
        body: d.processos.map((p: any) => [
          p.numero_processo_interno || 'N/A',
          p.data_abertura ? p.data_abertura.split('-').reverse().join('/') : (p.created_at ? p.created_at.split('T')[0].split('-').reverse().join('/') : 'N/A'),
          d.cg.nome_contrato,
          stripHtml(p.objeto_resumido || '').substring(0, 60),
          statusLabels[p.status_processo] || p.status_processo?.replace(/_/g, ' ').toUpperCase() || 'N/A',
          p.contratos_vinculados || 'SEM CONTRATO',
          p.data_homologacao || '',
        ]),
        theme: 'grid',
        headStyles: {
          fillColor: [173, 216, 230],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          fontSize: 7.5,
          halign: 'center',
          lineColor: [0, 0, 0],
          lineWidth: 0.3,
        },
        bodyStyles: {
          fontSize: 7,
          lineColor: [0, 0, 0],
          lineWidth: 0.2,
          cellPadding: 1.5,
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 18 },
          1: { halign: 'center', cellWidth: 18 },
          2: { halign: 'left', cellWidth: 30 },
          3: { halign: 'left', cellWidth: 40 },
          4: { halign: 'center', cellWidth: 22 },
          5: { halign: 'center', cellWidth: 24 },
          6: { halign: 'center', cellWidth: 24 },
        },
        margin: { left: 15, right: 15 },
        didDrawPage: () => {
          paginaAtual = doc.getNumberOfPages();
          adicionarCabecalhoRodape(paginaAtual);
        },
        alternateRowStyles: { fillColor: [245, 245, 255] },
      });
      yAnexo = (doc as any).lastAutoTable.finalY + 5;
    } else {
      yAnexo += 3;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(80, 80, 80);
      doc.text('Nenhum processo no período.', 15, yAnexo);
      yAnexo += 8;
    }

    // ---- CONTRATOS ----
    // Always start contracts on a new page
    doc.addPage();
    paginaAtual++;
    adicionarCabecalhoRodape(paginaAtual);
    yAnexo = logoHeight + 5;

    // Title bar with CG name
    doc.setFillColor(173, 216, 230);
    doc.rect(15, yAnexo, pageWidth - 30, 8, 'F');
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(15, yAnexo, pageWidth - 30, 8, 'S');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`${d.cg.nome_contrato} - ${d.cg.ente_federativo.toUpperCase()}`, pageWidth / 2, yAnexo + 5.5, { align: 'center' });
    yAnexo += 10;

    if (d.contratos.length > 0) {
      autoTable(doc, {
        startY: yAnexo,
        head: [['Nº CONTRATO', 'OBJETO', 'PARTE CONTRATADA', 'INÍCIO DA VIGÊNCIA', 'TÉRMINO DA VIGÊNCIA']],
        body: d.contratos.map((c: any) => [
          c.codigo_interno || 'N/A',
          (c.objeto || '').substring(0, 55),
          (c.fornecedor_razao_social || 'N/A').substring(0, 40),
          c.inicio_vigencia ? c.inicio_vigencia.split('-').reverse().join('/') : 'N/A',
          c.fim_vigencia_atual ? c.fim_vigencia_atual.split('-').reverse().join('/') : 'N/A',
        ]),
        theme: 'grid',
        headStyles: {
          fillColor: [173, 216, 230],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          fontSize: 7.5,
          halign: 'center',
          lineColor: [0, 0, 0],
          lineWidth: 0.3,
        },
        bodyStyles: {
          fontSize: 7,
          lineColor: [0, 0, 0],
          lineWidth: 0.2,
          cellPadding: 2,
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 24 },
          1: { halign: 'left', cellWidth: 42 },
          2: { halign: 'left', cellWidth: 46 },
          3: { halign: 'center', cellWidth: 28 },
          4: { halign: 'center', cellWidth: 28 },
        },
        margin: { left: 15, right: 15 },
        didDrawPage: () => {
          paginaAtual = doc.getNumberOfPages();
          adicionarCabecalhoRodape(paginaAtual);
        },
        alternateRowStyles: { fillColor: [245, 245, 255] },
      });
    } else {
      yAnexo += 3;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(80, 80, 80);
      doc.text('Nenhum contrato vigente no período.', 15, yAnexo);
    }
  }

  // Salvar no storage
  const pdfOutput = doc.output('arraybuffer');
  const mesAnoSafe = dados.mesAno
    .replace('/', '_')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '');
  const fileName = `Relatorio_Compras_${mesAnoSafe}_${Date.now()}.pdf`;
  const storagePath = `relatorios/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('processo-anexos')
    .upload(storagePath, pdfOutput, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage
    .from('processo-anexos')
    .getPublicUrl(storagePath);

  // Save protocol for verification
  await supabase.from('protocolos_documentos_processo').insert({
    protocolo,
    tipo_documento: 'relatorio_compras',
    nome_arquivo: fileName,
    url_arquivo: urlData.publicUrl,
    responsavel_nome: dados.usuarioNome,
    data_geracao: agora.toISOString(),
  });

  // Open PDF
  const blob = new Blob([pdfOutput], { type: 'application/pdf' });
  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, '_blank');

  return {
    url: urlData.publicUrl,
    fileName,
    protocolo,
  };
};
