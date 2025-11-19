import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { gerarHashDocumento } from './certificacaoDigital';

interface ItemCotacao {
  numero_item: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  lote_numero?: number;
  lote_descricao?: string;
}

interface RespostaFornecedor {
  fornecedor: {
    razao_social: string;
    cnpj: string;
    email?: string;
  };
  itens: {
    numero_item: number;
    valor_unitario_ofertado: number;
    marca?: string;
  }[];
  valor_total: number;
}

interface DadosProtocolo {
  protocolo: string;
  usuario: {
    nome_completo: string;
    cpf: string;
  };
}

const formatarMoeda = (valor: number): string => {
  return valor.toLocaleString('pt-BR', { 
    style: 'currency', 
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

// Decodificar entidades HTML
const decodeHtmlEntities = (text: string): string => {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
};

export async function gerarPlanilhaConsolidadaPDF(
  processo: { numero: string; objeto: string },
  cotacao: { titulo_cotacao: string },
  itens: ItemCotacao[],
  respostas: RespostaFornecedor[],
  dadosProtocolo: DadosProtocolo
): Promise<Blob> {
  console.log('🚀 INICIANDO GERAÇÃO DA PLANILHA CONSOLIDADA');
  console.log('📊 Dados recebidos:', {
    processo: processo.numero,
    cotacao: cotacao.titulo_cotacao,
    totalItens: itens.length,
    totalRespostas: respostas.length,
    fornecedores: respostas.map(r => r.fornecedor.razao_social)
  });

  const doc = new jsPDF({ 
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margemEsquerda = 15;
  const margemDireita = 15;
  const larguraUtil = pageWidth - margemEsquerda - margemDireita;
  
  let y = 20;
  
  console.log('📄 Dimensões do documento:', { pageWidth, pageHeight, larguraUtil });

  // Informações da Cotação
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('PLANILHA CONSOLIDADA DE PROPOSTAS', pageWidth / 2, y, { align: 'center' });
  y += 7;
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Processo: ${processo.numero}`, pageWidth / 2, y, { align: 'center' });
  y += 6;
  
  // Decodificar o objeto antes de exibir
  const objetoDecodificado = decodeHtmlEntities(processo.objeto);
  const objetoLinhas = doc.splitTextToSize(objetoDecodificado, larguraUtil);
  objetoLinhas.forEach((linha: string, index: number) => {
    doc.text(linha, pageWidth / 2, y + (index * 5), { align: 'center' });
  });

  y += (objetoLinhas.length * 5) + 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Cotação:', margemEsquerda, y);
  doc.setFont('helvetica', 'normal');
  doc.text(cotacao.titulo_cotacao, margemEsquerda + 25, y);
  
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Data:', margemEsquerda, y);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date().toLocaleDateString('pt-BR'), margemEsquerda + 25, y);

  y += 10;

  console.log('🔧 Preparando dados da tabela...');
  
  // Preparar dados da tabela
  const colunas = [
    { header: 'Item', dataKey: 'item' },
    { header: 'Descrição', dataKey: 'descricao' },
    { header: 'Qtd', dataKey: 'quantidade' },
    { header: 'Unid.', dataKey: 'unidade' }
  ];

  // Adicionar colunas de fornecedores com CNPJ e Email
  respostas.forEach((resposta, index) => {
    const headerText = `${resposta.fornecedor.razao_social}\nCNPJ: ${resposta.fornecedor.cnpj}${resposta.fornecedor.email ? '\n' + resposta.fornecedor.email : ''}`;
    colunas.push({
      header: headerText,
      dataKey: `fornecedor_${index}`
    });
  });

  console.log(`📋 Total de colunas: ${colunas.length}`);

  // Preparar linhas
  const linhas: any[] = [];
  
  console.log(`📊 Gerando planilha com ${itens.length} itens e ${respostas.length} fornecedores`);
  
  itens.forEach(item => {
    const linha: any = {
      item: item.numero_item.toString(),
      descricao: item.descricao,
      quantidade: item.quantidade.toString(),
      unidade: item.unidade
    };

    respostas.forEach((resposta, index) => {
      const respostaItem = resposta.itens.find(i => i.numero_item === item.numero_item);
      linha[`fornecedor_${index}`] = respostaItem 
        ? formatarMoeda(respostaItem.valor_unitario_ofertado)
        : '-';
    });

    linhas.push(linha);
  });

  console.log(`📋 Total de linhas preparadas: ${linhas.length}`);

  // Adicionar linha de totais
  const linhaTotais: any = {
    item: '',
    descricao: 'VALOR TOTAL',
    quantidade: '',
    unidade: ''
  };

  respostas.forEach((resposta, index) => {
    linhaTotais[`fornecedor_${index}`] = formatarMoeda(resposta.valor_total);
  });

  linhas.push(linhaTotais);

  console.log('✅ Dados da tabela preparados com sucesso');
  console.log('🎨 Iniciando renderização da tabela com autoTable...');



  // Gerar tabela com suporte para grande volume de dados
  try {
    autoTable(doc, {
      startY: y,
      head: [colunas.map(c => c.header)],
      body: linhas.map(linha => colunas.map(col => linha[col.dataKey] || '')),
      theme: 'grid',
      headStyles: {
        fillColor: [37, 99, 235],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center',
        cellPadding: 2
      },
      bodyStyles: {
        fontSize: 7,
        textColor: [0, 0, 0],
        minCellHeight: 5,
        cellPadding: 1.5
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 55 },
        2: { cellWidth: 12, halign: 'center' },
        3: { cellWidth: 12, halign: 'center' }
      },
      margin: { left: margemEsquerda, right: margemDireita, top: 20, bottom: 30 },
      showHead: 'everyPage',
      pageBreak: 'auto',
      rowPageBreak: 'avoid',
      tableWidth: 'auto',
      didParseCell: function(data) {
        // Destacar linha de totais
        if (data.row.index === linhas.length - 1) {
          data.cell.styles.fillColor = [226, 232, 240];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fontSize = 8;
        }
      },
      didDrawPage: function(data) {
        // Rodapé em todas as páginas
        const pageCount = (doc as any).internal.getNumberOfPages();
        
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text(
          'Prima Qualitá Saúde',
          pageWidth / 2,
          pageHeight - 15,
          { align: 'center' }
        );
        doc.text(
          'Travessa do Ouvidor, 21, Sala 503, Centro, Rio de Janeiro - RJ, CEP: 20.040-040',
          pageWidth / 2,
          pageHeight - 10,
          { align: 'center' }
        );
        
        // Número da página
        doc.text(
          `Página ${data.pageNumber} de ${pageCount}`,
          pageWidth / 2,
          pageHeight - 5,
          { align: 'center' }
        );
      }
    });
    
    console.log('✅ Tabela renderizada com sucesso!');
  } catch (error) {
    console.error('❌ ERRO ao renderizar tabela:', error);
    throw error;
  }

  // Pegar a posição Y após a tabela
  const finalY = (doc as any).lastAutoTable.finalY;
  
  console.log(`📍 Tabela finalizada na posição Y: ${finalY}`);

  // Verificar se precisa de nova página para certificação
  let y2 = finalY + 15;
  if (y2 > pageHeight - 50) {
    doc.addPage();
    y2 = 20;
    console.log('📄 Nova página adicionada para certificação');
  }

  console.log('🔐 Gerando certificação digital...');
  
  // Gerar hash do conteúdo
  const conteudoParaHash = JSON.stringify({
    processo: processo.numero,
    cotacao: cotacao.titulo_cotacao,
    itens,
    respostas: respostas.map(r => ({
      fornecedor: r.fornecedor.cnpj,
      total: r.valor_total
    })),
    protocolo: dadosProtocolo.protocolo
  });

  const hash = await gerarHashDocumento(conteudoParaHash);
  const linkVerificacao = `${window.location.origin}/verificar-planilha?protocolo=${dadosProtocolo.protocolo}`;

  console.log(`🔐 Hash gerado: ${hash.substring(0, 20)}...`);

  // Certificação digital
  doc.setFillColor(245, 245, 245);
  doc.rect(margemEsquerda, y2, larguraUtil, 35, 'F');
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(margemEsquerda, y2, larguraUtil, 35, 'S');

  y2 += 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 139);
  doc.text('CERTIFICAÇÃO DIGITAL', pageWidth / 2, y2, { align: 'center' });
  
  y2 += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  
  doc.text(`Protocolo: ${dadosProtocolo.protocolo}`, margemEsquerda + 3, y2);
  y2 += 5;
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')} por ${dadosProtocolo.usuario.nome_completo}`, margemEsquerda + 3, y2);
  y2 += 5;
  doc.text(`Hash: ${hash.substring(0, 60)}...`, margemEsquerda + 3, y2);
  y2 += 5;
  
  doc.setTextColor(0, 0, 255);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.text(`Verifique em: ${linkVerificacao}`, margemEsquerda + 3, y2);

  console.log(`✅ PDF gerado com sucesso - Total de páginas: ${(doc as any).internal.getNumberOfPages()}`);
  
  const blob = doc.output('blob');
  console.log(`📦 Blob gerado com tamanho: ${(blob.size / 1024).toFixed(2)} KB`);

  return blob;
}
