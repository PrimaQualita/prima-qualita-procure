import jsPDF from 'jspdf';
import { gerarHashDocumento, adicionarCertificacaoDigital } from './certificacaoDigital';
import { v4 as uuidv4 } from 'uuid';
import { stripHtml } from './htmlUtils';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

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

// Função para formatar valores em Real brasileiro com separadores
const formatarMoeda = (valor: number): string => {
  return new Intl.NumberFormat('pt-BR', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  }).format(valor);
};

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

    const doc = new jsPDF();
    const dataEnvio = new Date().toLocaleString('pt-BR');
    
    // Criar conteúdo para hash
    const conteudoHash = `
      Proposta Seleção: ${propostaId}
      Fornecedor: ${fornecedor.razao_social}
      CNPJ: ${fornecedor.cnpj}
      Data: ${dataEnvio}
      Valor Total: ${valorTotal.toFixed(2)}
      Itens: ${JSON.stringify(itensFormatados)}
    `;
    
    const hash = await gerarHashDocumento(conteudoHash);
    
    const itensOrdenados = [...itensFormatados].sort((a, b) => a.numero_item - b.numero_item);
    
    let y = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const margemEsquerda = 15;
    const larguraUtil = pageWidth - 30;

    // Cabeçalho
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(14, 165, 233); // Azul
    doc.text('PROPOSTA DE SELEÇÃO DE FORNECEDORES', pageWidth / 2, y, { align: 'center' });
    y += 12;

    // Informações da Seleção
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(tituloSelecao, margemEsquerda, y);
    y += 5;
    
    doc.setFont('helvetica', 'normal');
    doc.text(`Data de Envio: ${dataEnvio}`, margemEsquerda, y);
    y += 10;

    // Dados do Fornecedor
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Dados do Fornecedor', margemEsquerda, y);
    y += 7;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Razão Social: ${fornecedor.razao_social}`, margemEsquerda, y);
    y += 5;
    doc.text(`CNPJ: ${fornecedor.cnpj}`, margemEsquerda, y);
    y += 5;
    
    if (fornecedor.email) {
      doc.text(`E-mail: ${fornecedor.email}`, margemEsquerda, y);
      y += 5;
    }
    y += 3;

    // Itens Cotados
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Itens Cotados', margemEsquerda, y);
    y += 8;

    // Cabeçalho da tabela
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Item', margemEsquerda + 2, y, { align: 'center' });
    doc.text('Descrição', margemEsquerda + 10, y);
    doc.text('Qtd', margemEsquerda + 78, y, { align: 'center' });
    doc.text('Unid', margemEsquerda + 98, y, { align: 'center' });
    doc.text('Marca', margemEsquerda + 125, y, { align: 'center' });
    doc.text('Vlr Unit (R$)', margemEsquerda + 157, y, { align: 'right' });
    doc.text('Vlr Total (R$)', larguraUtil + margemEsquerda, y, { align: 'right' });
    y += 2;
    
    doc.setLineWidth(0.5);
    doc.line(margemEsquerda, y, larguraUtil + margemEsquerda, y);
    y += 5;

    // Itens
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    
    for (const item of itensOrdenados) {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }

      const valorItemTotal = item.quantidade * item.valor_unitario_ofertado;
      
      // Item (centralizado)
      doc.text(item.numero_item.toString(), margemEsquerda + 2, y, { align: 'center' });
      
      // Descrição (justificada)
      const descricaoMaxWidth = 60;
      const descricaoLimpa = stripHtml(item.descricao);
      const descricaoLines = doc.splitTextToSize(descricaoLimpa, descricaoMaxWidth);
      doc.text(descricaoLines[0], margemEsquerda + 10, y, { align: 'justify' });
      
      // Quantidade (centralizada)
      doc.text(formatarMoeda(item.quantidade), margemEsquerda + 78, y, { align: 'center' });
      
      // Unidade (centralizada)
      doc.text(item.unidade, margemEsquerda + 98, y, { align: 'center' });
      
      // Marca (centralizada)
      const marcaMaxWidth = 35;
      const marcaText = item.marca && item.marca.trim() !== '' ? item.marca : '-';
      const marcaLines = doc.splitTextToSize(marcaText, marcaMaxWidth);
      doc.text(marcaLines[0], margemEsquerda + 125, y, { align: 'center' });
      
      // Valores (alinhados à direita)
      doc.text(formatarMoeda(item.valor_unitario_ofertado), margemEsquerda + 157, y, { align: 'right' });
      doc.text(formatarMoeda(valorItemTotal), larguraUtil + margemEsquerda, y, { align: 'right' });
      
      y += 6;
    }

    // Linha de separação
    y += 2;
    doc.setLineWidth(0.5);
    doc.line(margemEsquerda, y, larguraUtil + margemEsquerda, y);
    y += 6;

    // Valor total
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('VALOR TOTAL DA PROPOSTA:', margemEsquerda + 100, y);
    doc.text(`R$ ${formatarMoeda(valorTotal)}`, larguraUtil + margemEsquerda, y, { align: 'right' });
    y += 10;

    // Observações
    if (observacoes && observacoes.trim()) {
      if (y > 250) {
        doc.addPage();
        y = 20;
      }
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Observações:', margemEsquerda, y);
      y += 6;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const obsLines = doc.splitTextToSize(observacoes, larguraUtil);
      doc.text(obsLines, margemEsquerda, y);
      y += obsLines.length * 5 + 8;
    }

    // Certificação Digital
    if (y > 220) {
      doc.addPage();
      y = 20;
    }

    const protocolo = uuidv4();
    const linkVerificacao = `${window.location.origin}/verificar-proposta?protocolo=${protocolo}`;

    adicionarCertificacaoDigital(doc, {
      protocolo,
      dataHora: dataEnvio,
      responsavel: fornecedor.razao_social,
      cpf: fornecedor.cnpj,
      hash,
      linkVerificacao
    }, y);

    // Gerar PDF como blob
    const pdfBlob = doc.output('blob');
    
    // Upload para Supabase Storage
    const nomeArquivo = `proposta-selecao-${propostaId}-${Date.now()}.pdf`;
    const filePath = `propostas-selecao/${nomeArquivo}`;

    const { error: uploadError } = await supabaseAnon.storage
      .from('processo-anexos')
      .upload(filePath, pdfBlob);

    if (uploadError) throw uploadError;

    return {
      url: filePath,
      nome: nomeArquivo,
      hash: hash
    };
  } catch (error) {
    console.error('Erro ao gerar PDF da proposta de seleção:', error);
    throw error;
  }
}
