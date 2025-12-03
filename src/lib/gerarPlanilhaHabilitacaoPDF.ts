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

interface FornecedorResposta {
  fornecedor: {
    id: string;
    razao_social: string;
    cnpj: string;
  };
  itens: {
    numero_item: number;
    valor_unitario_ofertado: number;
    percentual_desconto?: number;
    marca?: string;
  }[];
  valor_total: number;
  rejeitado: boolean;
  itens_rejeitados: number[];
  motivo_rejeicao?: string;
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

const formatarPercentual = (valor: number): string => {
  return valor.toLocaleString('pt-BR', { 
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + '%';
};

const formatarCNPJ = (cnpj: string): string => {
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
};

const decodeHtmlEntities = (text: string): string => {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
};

export async function gerarPlanilhaHabilitacaoPDF(
  processo: { numero: string; objeto: string },
  cotacao: { titulo_cotacao: string },
  itens: ItemCotacao[],
  respostas: FornecedorResposta[],
  dadosProtocolo: DadosProtocolo,
  criterioJulgamento?: string
): Promise<{ blob: Blob; storagePath: string }> {
  const doc = new jsPDF({ 
    orientation: "landscape", 
    unit: "mm", 
    format: "a4" 
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;

  // Carregar imagens
  let logoExpandidoBase64 = "";
  let rodapeExpandidoBase64 = "";
  
  try {
    const logoResponse = await fetch("/src/assets/prima-qualita-logo-horizontal.png");
    const logoBlob = await logoResponse.blob();
    logoExpandidoBase64 = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(logoBlob);
    });
  } catch (e) {
    console.log("Logo expandido não encontrado");
  }

  try {
    const rodapeResponse = await fetch("/src/assets/capa-processo-rodape.png");
    const rodapeBlob = await rodapeResponse.blob();
    rodapeExpandidoBase64 = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(rodapeBlob);
    });
  } catch (e) {
    console.log("Rodapé expandido não encontrado");
  }

  const adicionarCabecalhoERodape = () => {
    // Logo expandido no topo (ocupando toda largura com margens de 1.5mm)
    if (logoExpandidoBase64) {
      const logoMargin = 1.5;
      const logoWidth = pageWidth - (logoMargin * 2);
      const logoHeight = 25;
      doc.addImage(logoExpandidoBase64, "PNG", logoMargin, logoMargin, logoWidth, logoHeight);
    }
    
    // Rodapé expandido no final
    if (rodapeExpandidoBase64) {
      const rodapeMargin = 1.5;
      const rodapeWidth = pageWidth - (rodapeMargin * 2);
      const rodapeHeight = 15;
      doc.addImage(rodapeExpandidoBase64, "PNG", rodapeMargin, pageHeight - rodapeHeight - rodapeMargin, rodapeWidth, rodapeHeight);
    }
  };

  // Primeira página
  adicionarCabecalhoERodape();

  let yPosition = 35;

  // Título
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("PLANILHA DE HABILITAÇÃO", pageWidth / 2, yPosition, { align: "center" });
  yPosition += 10;

  // Informações do processo
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Processo:  ${processo.numero}`, margin, yPosition);
  yPosition += 6;
  
  const objetoLimpo = decodeHtmlEntities(processo.objeto.replace(/<[^>]*>/g, ''));
  const objetoLinhas = doc.splitTextToSize(`Objeto:  ${objetoLimpo}`, pageWidth - 2 * margin);
  doc.text(objetoLinhas, margin, yPosition);
  yPosition += objetoLinhas.length * 5 + 4;

  doc.text(`Cotação:  ${cotacao.titulo_cotacao}`, margin, yPosition);
  yPosition += 8;

  // Legenda
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 0, 0);
  doc.text("■ Vermelho = Empresa/Item Inabilitado", margin, yPosition);
  doc.setTextColor(0, 0, 0);
  yPosition += 8;

  // Construir colunas da tabela
  const colunas: any[] = [
    { header: "Item", dataKey: "item" },
    { header: "Descrição", dataKey: "descricao" },
    { header: "Qtd", dataKey: "quantidade" },
    { header: "Unid", dataKey: "unidade" }
  ];

  // Adicionar colunas por fornecedor
  respostas.forEach((resposta, idx) => {
    const nomeAbreviado = resposta.fornecedor.razao_social.substring(0, 20);
    colunas.push({
      header: `${nomeAbreviado}${resposta.rejeitado ? ' (INAB.)' : ''}`,
      dataKey: `fornecedor_${idx}`
    });
  });

  // Construir dados da tabela
  const dados: any[] = [];
  const isDesconto = criterioJulgamento === "desconto" || criterioJulgamento === "maior_percentual_desconto";

  itens.forEach((item) => {
    const linha: any = {
      item: item.numero_item,
      descricao: decodeHtmlEntities(item.descricao),
      quantidade: item.quantidade,
      unidade: item.unidade
    };

    respostas.forEach((resposta, idx) => {
      const itemResposta = resposta.itens.find(i => i.numero_item === item.numero_item);
      if (itemResposta) {
        if (isDesconto) {
          linha[`fornecedor_${idx}`] = formatarPercentual(itemResposta.percentual_desconto || itemResposta.valor_unitario_ofertado);
        } else {
          linha[`fornecedor_${idx}`] = formatarMoeda(itemResposta.valor_unitario_ofertado);
        }
      } else {
        linha[`fornecedor_${idx}`] = "-";
      }
    });

    dados.push(linha);
  });

  // Gerar tabela
  autoTable(doc, {
    columns: colunas,
    body: dados,
    startY: yPosition,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 7,
      cellPadding: 2,
      overflow: 'linebreak',
      halign: 'center',
      valign: 'middle'
    },
    headStyles: {
      fillColor: [41, 128, 185],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center'
    },
    columnStyles: {
      item: { cellWidth: 12, halign: 'center' },
      descricao: { cellWidth: 60, halign: 'left' },
      quantidade: { cellWidth: 15, halign: 'center' },
      unidade: { cellWidth: 15, halign: 'center' }
    },
    didParseCell: (data) => {
      // Marcar empresas/itens inabilitados em vermelho
      if (data.section === 'body' && data.column.dataKey && typeof data.column.dataKey === 'string' && data.column.dataKey.startsWith('fornecedor_')) {
        const fornecedorIdx = parseInt(data.column.dataKey.replace('fornecedor_', ''));
        const resposta = respostas[fornecedorIdx];
        const numeroItem = dados[data.row.index]?.item;
        
        // Verificar se fornecedor está totalmente inabilitado ou item específico
        if (resposta && (resposta.rejeitado || resposta.itens_rejeitados.includes(numeroItem))) {
          data.cell.styles.textColor = [255, 0, 0];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    didDrawCell: (data) => {
      // Cabeçalho de fornecedor inabilitado também em vermelho
      if (data.section === 'head' && data.column.dataKey && typeof data.column.dataKey === 'string' && data.column.dataKey.startsWith('fornecedor_')) {
        const fornecedorIdx = parseInt(data.column.dataKey.replace('fornecedor_', ''));
        const resposta = respostas[fornecedorIdx];
        
        if (resposta && resposta.rejeitado) {
          // Redesenhar o cabeçalho em vermelho
          doc.setFillColor(180, 0, 0);
          doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(7);
          doc.setFont("helvetica", "bold");
          const text = data.cell.text.join(' ');
          doc.text(text, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: 'center' });
        }
      }
    },
    didDrawPage: (data) => {
      adicionarCabecalhoERodape();
    }
  });

  // Seção de empresas inabilitadas com motivos
  const empresasInabilitadas = respostas.filter(r => r.rejeitado || r.itens_rejeitados.length > 0);
  
  if (empresasInabilitadas.length > 0) {
    let currentY = (doc as any).lastAutoTable.finalY + 10;
    
    if (currentY > pageHeight - 60) {
      doc.addPage();
      adicionarCabecalhoERodape();
      currentY = 35;
    }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(180, 0, 0);
    doc.text("EMPRESAS INABILITADAS", margin, currentY);
    doc.setTextColor(0, 0, 0);
    currentY += 6;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    empresasInabilitadas.forEach((empresa) => {
      if (currentY > pageHeight - 40) {
        doc.addPage();
        adicionarCabecalhoERodape();
        currentY = 35;
      }

      doc.setFont("helvetica", "bold");
      doc.text(`• ${empresa.fornecedor.razao_social}`, margin, currentY);
      doc.setFont("helvetica", "normal");
      currentY += 5;
      
      doc.text(`  CNPJ: ${formatarCNPJ(empresa.fornecedor.cnpj)}`, margin, currentY);
      currentY += 5;

      if (empresa.rejeitado) {
        doc.text(`  Status: Inabilitado totalmente`, margin, currentY);
        currentY += 5;
      } else if (empresa.itens_rejeitados.length > 0) {
        doc.text(`  Status: Inabilitado nos itens: ${empresa.itens_rejeitados.join(', ')}`, margin, currentY);
        currentY += 5;
      }

      if (empresa.motivo_rejeicao) {
        const motivoLinhas = doc.splitTextToSize(`  Motivo: ${empresa.motivo_rejeicao}`, pageWidth - 2 * margin - 10);
        doc.text(motivoLinhas, margin, currentY);
        currentY += motivoLinhas.length * 4 + 2;
      }

      currentY += 3;
    });
  }

  // Certificação Digital
  let certY = (doc as any).lastAutoTable?.finalY || 150;
  if (empresasInabilitadas.length > 0) {
    certY = doc.internal.pageSize.getHeight() - 50;
  } else {
    certY += 15;
  }
  
  if (certY > pageHeight - 45) {
    doc.addPage();
    adicionarCabecalhoERodape();
    certY = 35;
  }

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("CERTIFICAÇÃO DIGITAL", margin, certY);
  certY += 5;

  doc.setFont("helvetica", "normal");
  doc.text(`Protocolo:  ${dadosProtocolo.protocolo}`, margin, certY);
  certY += 5;
  doc.text(`Responsável:  ${dadosProtocolo.usuario.nome_completo}`, margin, certY);
  certY += 5;
  
  const baseUrl = window.location.origin;
  const linkVerificacao = `${baseUrl}/verificar-planilha?protocolo=${dadosProtocolo.protocolo}`;
  doc.text(`Verificação:  ${linkVerificacao}`, margin, certY);

  // Gerar blob
  const blob = doc.output("blob");
  const storagePath = `planilhas-habilitacao/${processo.numero.replace(/\//g, '-')}_habilitacao_${Date.now()}.pdf`;

  return { blob, storagePath };
}
