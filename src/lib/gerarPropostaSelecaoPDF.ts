import jsPDF from 'jspdf';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { createClient } from '@supabase/supabase-js';
import { gerarHashDocumento } from './certificacaoDigital';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

const formatarCNPJ = (cnpj: string): string => {
  const apenasNumeros = cnpj.replace(/[^\d]/g, '');
  if (apenasNumeros.length !== 14) return cnpj;
  return `${apenasNumeros.slice(0, 2)}.${apenasNumeros.slice(2, 5)}.${apenasNumeros.slice(5, 8)}/${apenasNumeros.slice(8, 12)}-${apenasNumeros.slice(12, 14)}`;
};

const gerarProtocolo = (): string => {
  const parte1 = Math.floor(1000 + Math.random() * 9000);
  const parte2 = Math.floor(1000 + Math.random() * 9000);
  const parte3 = Math.floor(1000 + Math.random() * 9000);
  const parte4 = Math.floor(1000 + Math.random() * 9000);
  return `${parte1}-${parte2}-${parte3}-${parte4}`;
};

interface ItemProposta {
  numero_item: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  valor_unitario_ofertado: number;
  marca: string | null;
}

interface DadosFornecedor {
  razao_social: string;
  cnpj: string;
  email?: string;
}

export async function gerarPropostaSelecaoPDF(
  propostaId: string,
  fornecedor: DadosFornecedor,
  valorTotal: number,
  observacoes: string | null,
  tituloSelecao: string
): Promise<{ url: string; nome: string; hash: string }> {
  try {
    // Buscar itens da proposta
    const { data: itens, error: itensError } = await supabaseAnon
      .from('selecao_respostas_itens_fornecedor')
      .select('*')
      .eq('proposta_id', propostaId)
      .order('numero_item');

    if (itensError) throw itensError;

    const itensFormatados: ItemProposta[] = (itens || []).map((item: any) => ({
      numero_item: item.numero_item,
      descricao: item.descricao,
      quantidade: item.quantidade,
      unidade: item.unidade,
      valor_unitario_ofertado: item.valor_unitario_ofertado,
      marca: item.marca
    }));

    // Criar PDF básico com jsPDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 20;

    // Título
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('PROPOSTA COMERCIAL', pageWidth / 2, yPos, { align: 'center' });
    yPos += 10;

    doc.setFontSize(12);
    doc.text(tituloSelecao, pageWidth / 2, yPos, { align: 'center' });
    yPos += 15;

    // Dados do Fornecedor
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('DADOS DO FORNECEDOR', 15, yPos);
    yPos += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Razão Social: ${fornecedor.razao_social}`, 15, yPos);
    yPos += 5;
    doc.text(`CNPJ: ${formatarCNPJ(fornecedor.cnpj)}`, 15, yPos);
    yPos += 5;
    if (fornecedor.email) {
      doc.text(`E-mail: ${fornecedor.email}`, 15, yPos);
      yPos += 5;
    }
    yPos += 5;

    // Tabela de Itens
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('ITENS DA PROPOSTA', 15, yPos);
    yPos += 7;

    // Cabeçalho da tabela
    doc.setFontSize(9);
    doc.text('Item', 15, yPos);
    doc.text('Descrição', 30, yPos);
    doc.text('Marca', 95, yPos);
    doc.text('Qtd', 125, yPos);
    doc.text('Unid.', 140, yPos);
    doc.text('Valor Unit.', 160, yPos);
    doc.text('Valor Total', 185, yPos);
    yPos += 5;

    // Linha separadora
    doc.line(15, yPos, pageWidth - 15, yPos);
    yPos += 5;

    // Itens
    doc.setFont('helvetica', 'normal');
    itensFormatados.forEach((item) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }

      const valorTotal = item.quantidade * item.valor_unitario_ofertado;
      
      doc.text(item.numero_item.toString(), 15, yPos);
      
      const descricaoLinhas = doc.splitTextToSize(item.descricao, 60);
      doc.text(descricaoLinhas, 30, yPos);
      
      doc.text(item.marca || '-', 95, yPos);
      doc.text(item.quantidade.toLocaleString('pt-BR'), 125, yPos);
      doc.text(item.unidade, 140, yPos);
      doc.text(item.valor_unitario_ofertado.toLocaleString('pt-BR', { 
        style: 'currency', 
        currency: 'BRL' 
      }), 160, yPos);
      doc.text(valorTotal.toLocaleString('pt-BR', { 
        style: 'currency', 
        currency: 'BRL' 
      }), 185, yPos);
      
      yPos += Math.max(5 * descricaoLinhas.length, 6);
    });

    yPos += 5;
    doc.line(15, yPos, pageWidth - 15, yPos);
    yPos += 7;

    // Valor Total
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('VALOR TOTAL DA PROPOSTA:', 15, yPos);
    doc.text(valorTotal.toLocaleString('pt-BR', { 
      style: 'currency', 
      currency: 'BRL' 
    }), 185, yPos, { align: 'right' });
    yPos += 10;

    // Observações
    if (observacoes && observacoes.trim()) {
      yPos += 5;
      doc.setFont('helvetica', 'bold');
      doc.text('OBSERVAÇÕES:', 15, yPos);
      yPos += 5;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const obsLinhas = doc.splitTextToSize(observacoes, pageWidth - 30);
      doc.text(obsLinhas, 15, yPos);
      yPos += 5 * obsLinhas.length;
    }

    // Converter para ArrayBuffer
    const pdfBuffer = doc.output('arraybuffer');
    
    // Adicionar certificação digital com pdf-lib
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];
    const { height } = lastPage.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const protocolo = gerarProtocolo();
    const dataHora = new Date().toLocaleString('pt-BR');
    const hashDocumento = await gerarHashDocumento(pdfBuffer);

    // Posicionar certificação no final do documento
    let certYPos = Math.min(yPos + 20, height - 120);
    if (certYPos < 100) {
      const newPage = pdfDoc.addPage();
      certYPos = newPage.getHeight() - 120;
    }

    const certWidth = 500;
    const certHeight = 90;
    const certX = 50;

    // Fundo cinza claro
    lastPage.drawRectangle({
      x: certX,
      y: height - certYPos - certHeight,
      width: certWidth,
      height: certHeight,
      color: rgb(0.95, 0.95, 0.95),
      borderColor: rgb(0.7, 0.7, 0.7),
      borderWidth: 1,
    });

    // Título
    lastPage.drawText('CERTIFICAÇÃO DIGITAL', {
      x: certX + 150,
      y: height - certYPos - 20,
      size: 12,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    // Protocolo
    lastPage.drawText(`Protocolo: ${protocolo}`, {
      x: certX + 10,
      y: height - certYPos - 40,
      size: 9,
      font: font,
      color: rgb(0, 0, 0),
    });

    // Data/Hora
    lastPage.drawText(`Data/Hora: ${dataHora}`, {
      x: certX + 10,
      y: height - certYPos - 52,
      size: 9,
      font: font,
      color: rgb(0, 0, 0),
    });

    // Link de verificação
    const linkText = `Verificar autenticidade em: ${window.location.origin}/verificar-proposta?protocolo=${protocolo}`;
    lastPage.drawText(linkText, {
      x: certX + 10,
      y: height - certYPos - 64,
      size: 8,
      font: font,
      color: rgb(0, 0, 0.8),
    });

    // Hash
    lastPage.drawText(`Hash: ${hashDocumento.substring(0, 40)}...`, {
      x: certX + 10,
      y: height - certYPos - 76,
      size: 7,
      font: font,
      color: rgb(0.3, 0.3, 0.3),
    });

    const pdfBytes = await pdfDoc.save();
    const pdfBlob = new Uint8Array(pdfBytes);
    const blob = new Blob([pdfBlob], { type: 'application/pdf' });

    // Upload para Supabase Storage
    const nomeArquivo = `proposta-selecao-${propostaId}-${Date.now()}.pdf`;
    const filePath = `propostas-selecao/${nomeArquivo}`;

    const { error: uploadError } = await supabaseAnon.storage
      .from('processo-anexos')
      .upload(filePath, blob);

    if (uploadError) throw uploadError;

    return {
      url: filePath,
      nome: nomeArquivo,
      hash: hashDocumento
    };
  } catch (error) {
    console.error('Erro ao gerar PDF da proposta de seleção:', error);
    throw error;
  }
}
