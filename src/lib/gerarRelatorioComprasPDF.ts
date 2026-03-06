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
  mesAno: string; // formato "Janeiro/2026"
  periodoInicio: string; // formato "YYYY-MM-DD"
  periodoFim: string; // formato "YYYY-MM-DD"
  usuarioNome: string;
  usuarioCpf: string;
}

interface ResultadoRelatorio {
  url: string;
  fileName: string;
  protocolo: string;
}

// Carregar imagem como base64
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
    totalProcessosContratos: number;
  }> = [];

  for (const cg of dados.contratosGestao) {
    // Processos: abertos ou em trâmite (não concluído/cancelado) no período
    const { data: processos } = await supabase
      .from('processos_compras')
      .select('id, numero_processo_interno, objeto_resumido, tipo, valor_estimado_anual, valor_total_cotacao, status_processo, ano_referencia, data_abertura, created_at')
      .eq('contrato_gestao_id', cg.id)
      .not('status_processo', 'in', '("concluido","cancelado")')
      .gte('created_at', dados.periodoInicio)
      .lte('created_at', dados.periodoFim + 'T23:59:59');

    // Também incluir processos abertos antes do período mas ainda em trâmite
    const { data: processosEmTramite } = await supabase
      .from('processos_compras')
      .select('id, numero_processo_interno, objeto_resumido, tipo, valor_estimado_anual, valor_total_cotacao, status_processo, ano_referencia, data_abertura, created_at')
      .eq('contrato_gestao_id', cg.id)
      .not('status_processo', 'in', '("concluido","cancelado")')
      .lt('created_at', dados.periodoInicio);

    // Combinar e deduplicate
    const todosProcessos = [...(processos || [])];
    const idsExistentes = new Set(todosProcessos.map(p => p.id));
    for (const p of (processosEmTramite || [])) {
      if (!idsExistentes.has(p.id)) {
        todosProcessos.push(p);
      }
    }

    // Contratos vigentes no período
    const { data: contratosVigentes } = await supabase
      .from('contratos_terceiros')
      .select('id, codigo_interno, objeto, valor_atual, inicio_vigencia, fim_vigencia_atual, status, fornecedor_id')
      .eq('contrato_gestao_id', cg.id)
      .eq('status', 'vigente');

    // Buscar razão social dos fornecedores dos contratos
    const fornecedorIds = (contratosVigentes || [])
      .filter(c => c.fornecedor_id)
      .map(c => c.fornecedor_id!);

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

    // Adicionar razão social aos contratos
    const contratosComFornecedor = (contratosVigentes || []).map(c => ({
      ...c,
      fornecedor_razao_social: c.fornecedor_id ? (fornecedoresMap[c.fornecedor_id] || 'N/A') : 'N/A'
    }));

    dadosPorCG.push({
      cg,
      processos: todosProcessos,
      contratos: contratosComFornecedor,
      totalProcessosContratos: todosProcessos.length + contratosComFornecedor.length,
    });
  }

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

  const adicionarCabecalhoRodape = (pagina: number) => {
    // Logo topo
    try { doc.addImage(base64Logo, 'PNG', 15, 5, pageWidth - 30, 20); } catch {}
    // Marca d'água
    try {
      const gState = (doc as any).GState;
      if (gState) {
        const gs = new gState({ opacity: 0.06 });
        (doc as any).setGState(gs);
      }
      doc.addImage(base64MarcaDagua, 'PNG', pageWidth / 2 - 40, pageHeight / 2 - 40, 80, 80);
      if (gState) {
        const gsNormal = new gState({ opacity: 1 });
        (doc as any).setGState(gsNormal);
      }
    } catch {}
    // Rodapé
    try { doc.addImage(base64Rodape, 'PNG', 15, pageHeight - 20, pageWidth - 30, 15); } catch {}
    // Número da página
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(`Página ${pagina}`, pageWidth - 25, pageHeight - 8);
  };

  // ====== PÁGINA 1: RELATÓRIO PRINCIPAL ======
  adicionarCabecalhoRodape(1);

  let y = 32;

  // Título
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 139);
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
  doc.setTextColor(0, 0, 139);
  doc.text('INDICADORES QUALITATIVOS', pageWidth / 2, y, { align: 'center' });

  y += 8;

  // Tabela principal
  const tableHeaders = [
    ['CONTRATO DE GESTÃO / ANO', 'PROCESSOS E CONTRATOS', '%'],
  ];

  const tableBody: string[][] = [];

  for (const d of dadosPorCG) {
    const percentual = totalGeral > 0 ? ((d.totalProcessosContratos / totalGeral) * 100) : 0;
    tableBody.push([
      d.cg.nome_contrato,
      d.totalProcessosContratos.toString(),
      percentual.toFixed(2) + '%',
    ]);
  }

  // Linha de total
  const percentualTotal = totalGeral > 0 ? '100,00%' : '0,00%';
  tableBody.push(['Total', totalGeral.toString(), percentualTotal]);

  autoTable(doc, {
    startY: y,
    head: tableHeaders,
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [0, 0, 139],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 9,
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: 90 },
      1: { halign: 'center', cellWidth: 50 },
      2: { halign: 'center', cellWidth: 40 },
    },
    margin: { left: 15, right: 15 },
    didParseCell: (data: any) => {
      // Última linha (total) em negrito
      if (data.row.index === tableBody.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [230, 230, 250];
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Texto descritivo
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

  // Verificar se cabe a certificação na página atual
  if (y > pageHeight - 80) {
    doc.addPage();
    adicionarCabecalhoRodape(doc.getNumberOfPages());
    y = 35;
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
    doc.addPage();
    paginaAtual++;
    adicionarCabecalhoRodape(paginaAtual);

    let yAnexo = 32;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 139);
    doc.text(`ANEXO - ${d.cg.nome_contrato}`, pageWidth / 2, yAnexo, { align: 'center' });
    yAnexo += 5;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(`Ente Federativo: ${d.cg.ente_federativo} | Período: ${dados.mesAno}`, pageWidth / 2, yAnexo, { align: 'center' });
    yAnexo += 8;

    // Processos em trâmite
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`Processos em Trâmite (${d.processos.length})`, 15, yAnexo);
    yAnexo += 3;

    if (d.processos.length > 0) {
      const statusLabels: Record<string, string> = {
        planejado: 'ABERTO',
        em_cotacao: 'EM COTAÇÃO',
        cotacao_concluida: 'COTAÇÃO CONCLUÍDA',
        em_selecao: 'EM SELEÇÃO',
        contratado: 'CONTRATADO',
        contratacao: 'EM CONTRATAÇÃO',
      };

      autoTable(doc, {
        startY: yAnexo,
        head: [['Nº Processo', 'Objeto', 'Tipo', 'Valor Estimado', 'Status']],
        body: d.processos.map(p => [
          p.numero_processo_interno,
          stripHtml(p.objeto_resumido).substring(0, 60),
          p.tipo?.replace(/_/g, ' ') || 'N/A',
          formatarMoeda(p.valor_total_cotacao || p.valor_estimado_anual || 0),
          statusLabels[p.status_processo] || p.status_processo?.replace(/_/g, ' ').toUpperCase() || 'N/A',
        ]),
        theme: 'grid',
        headStyles: { fillColor: [0, 100, 0], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7 },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 65 },
          2: { cellWidth: 25 },
          3: { cellWidth: 30, halign: 'right' },
          4: { cellWidth: 30, halign: 'center' },
        },
        margin: { left: 15, right: 15 },
        didDrawPage: () => {
          paginaAtual = doc.getNumberOfPages();
          adicionarCabecalhoRodape(paginaAtual);
        },
      });
      yAnexo = (doc as any).lastAutoTable.finalY + 8;
    } else {
      yAnexo += 3;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.text('Nenhum processo em trâmite no período.', 15, yAnexo);
      yAnexo += 8;
    }

    // Verificar se precisa nova página
    if (yAnexo > pageHeight - 60) {
      doc.addPage();
      paginaAtual++;
      adicionarCabecalhoRodape(paginaAtual);
      yAnexo = 35;
    }

    // Contratos vigentes
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`Contratos Vigentes (${d.contratos.length})`, 15, yAnexo);
    yAnexo += 3;

    if (d.contratos.length > 0) {
      autoTable(doc, {
        startY: yAnexo,
        head: [['Código', 'Objeto', 'Fornecedor', 'Valor Atual', 'Vigência']],
        body: d.contratos.map((c: any) => [
          c.codigo_interno,
          (c.objeto || '').substring(0, 50),
          (c.fornecedor_razao_social || 'N/A').substring(0, 35),
          formatarMoeda(c.valor_atual || 0),
          c.fim_vigencia_atual ? c.fim_vigencia_atual.split('-').reverse().join('/') : 'N/A',
        ]),
        theme: 'grid',
        headStyles: { fillColor: [0, 0, 139], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7 },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 48 },
          2: { cellWidth: 40 },
          3: { cellWidth: 28, halign: 'right' },
          4: { cellWidth: 25, halign: 'center' },
        },
        margin: { left: 15, right: 15 },
        didDrawPage: () => {
          paginaAtual = doc.getNumberOfPages();
          adicionarCabecalhoRodape(paginaAtual);
        },
      });
      yAnexo = (doc as any).lastAutoTable.finalY + 5;
    } else {
      yAnexo += 3;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.text('Nenhum contrato vigente no período.', 15, yAnexo);
      yAnexo += 5;
    }

    // Resumo do CG
    if (yAnexo > pageHeight - 40) {
      doc.addPage();
      paginaAtual++;
      adicionarCabecalhoRodape(paginaAtual);
      yAnexo = 35;
    }

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`Resumo - ${d.cg.nome_contrato}:`, 15, yAnexo);
    yAnexo += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`• Processos em trâmite: ${d.processos.length}`, 20, yAnexo);
    yAnexo += 4;
    doc.text(`• Contratos vigentes: ${d.contratos.length}`, 20, yAnexo);
    yAnexo += 4;
    doc.text(`• Total (processos + contratos): ${d.totalProcessosContratos}`, 20, yAnexo);
    yAnexo += 4;
    const pct = totalGeral > 0 ? ((d.totalProcessosContratos / totalGeral) * 100).toFixed(2) : '0.00';
    doc.text(`• Representatividade no total: ${pct}%`, 20, yAnexo);
  }

  // Salvar no storage
  const pdfOutput = doc.output('arraybuffer');
  // Remover caracteres especiais do nome do arquivo para evitar erro de storage
  const mesAnoSafe = dados.mesAno
    .replace('/', '_')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
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

  // Salvar blob local e abrir
  const blob = new Blob([pdfOutput], { type: 'application/pdf' });
  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, '_blank');

  return {
    url: urlData.publicUrl,
    fileName,
    protocolo,
  };
};
