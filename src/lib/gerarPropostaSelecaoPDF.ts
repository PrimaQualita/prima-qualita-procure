import jsPDF from 'jspdf';
import { gerarHashDocumento, adicionarCertificacaoDigital } from './certificacaoDigital';
import { stripHtml } from './htmlUtils';
import { supabase } from '@/integrations/supabase/client';

interface ItemProposta {
  numero_item: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  marca: string | null;
  valor_unitario_ofertado: number;
}

interface DadosFornecedor {
  razao_social: string;
  cnpj: string;
  email?: string;
}

const formatarMoeda = (valor: number): string => {
  return new Intl.NumberFormat('pt-BR', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  }).format(valor);
};

// Função para gerar protocolo no formato customizado (XXXX-XXXX-XXXX-XXXX)
const gerarProtocolo = (): string => {
  const parte1 = Math.floor(1000 + Math.random() * 9000);
  const parte2 = Math.floor(1000 + Math.random() * 9000);
  const parte3 = Math.floor(1000 + Math.random() * 9000);
  const parte4 = Math.floor(1000 + Math.random() * 9000);
  return `${parte1}-${parte2}-${parte3}-${parte4}`;
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
    const { data: itens, error: itensError } = await supabase
      .from('selecao_respostas_itens_fornecedor')
      .select('*')
      .eq('proposta_id', propostaId)
      .order('numero_item');

    if (itensError) {
      console.error('Erro ao buscar itens:', itensError);
      throw itensError;
    }

    console.log('Itens carregados:', itens);

    if (!itens || itens.length === 0) {
      throw new Error('Nenhum item encontrado para esta proposta');
    }

    const itensFormatados: ItemProposta[] = itens.map((item: any) => ({
      numero_item: item.numero_item,
      descricao: item.descricao,
      quantidade: item.quantidade,
      unidade: item.unidade,
      valor_unitario_ofertado: item.valor_unitario_ofertado || 0,
      marca: item.marca
    }));

    const doc = new jsPDF();
    const dataEnvio = new Date().toLocaleString('pt-BR');
    const protocolo = gerarProtocolo(); // Formato XXXX-XXXX-XXXX-XXXX
    
    // Criar conteúdo para hash
    const conteudoHash = `
      Seleção: ${tituloSelecao}
      Fornecedor: ${fornecedor.razao_social}
      CNPJ: ${fornecedor.cnpj}
      Data: ${dataEnvio}
      Valor Total: ${valorTotal.toFixed(2)}
      Itens: ${JSON.stringify(itensFormatados)}
      Protocolo: ${protocolo}
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
    doc.setTextColor(14, 165, 233); // Azul do sistema
    doc.text('PROPOSTA DE SELEÇÃO DE FORNECEDORES', pageWidth / 2, y, { align: 'center' });
    y += 12;

    // Informações da Seleção
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    const tituloLines = doc.splitTextToSize(tituloSelecao, larguraUtil);
    doc.text(tituloLines, margemEsquerda, y);
    y += tituloLines.length * 5 + 3;
    
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
      y += 8;
    } else {
      y += 3;
    }

    // Tabela de Itens
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Itens Cotados', margemEsquerda, y);
    y += 8;

    // Cabeçalho da tabela
    doc.setFillColor(14, 165, 233); // Azul do sistema
    doc.rect(margemEsquerda, y - 5, larguraUtil, 8, 'F');
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    
    const colItem = margemEsquerda + 2;
    const colDesc = margemEsquerda + 15;
    const colQtd = margemEsquerda + 85;
    const colUni = margemEsquerda + 105;
    const colMarca = margemEsquerda + 125;
    const colValorUnit = margemEsquerda + 150;
    const colValorTotal = margemEsquerda + 170;
    
    doc.text('Item', colItem, y);
    doc.text('Descrição', colDesc, y);
    doc.text('Qtd', colQtd, y);
    doc.text('Unid', colUni, y);
    doc.text('Marca', colMarca, y);
    doc.text('Vlr Unit.', colValorUnit, y);
    doc.text('Vlr Total', colValorTotal, y);
    
    y += 5;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');

    // Linhas da tabela
    for (const item of itensOrdenados) {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }

      const valorTotalItem = item.quantidade * item.valor_unitario_ofertado;
      
      const descLines = doc.splitTextToSize(item.descricao, 65);
      const alturaLinha = Math.max(descLines.length * 4, 6);
      
      doc.setDrawColor(200, 200, 200);
      doc.line(margemEsquerda, y + alturaLinha, margemEsquerda + larguraUtil, y + alturaLinha);
      
      doc.text(item.numero_item.toString(), colItem, y + 3);
      doc.text(descLines, colDesc, y + 3);
      doc.text(item.quantidade.toString(), colQtd, y + 3);
      doc.text(item.unidade, colUni, y + 3);
      doc.text(item.marca || '-', colMarca, y + 3);
      doc.text(formatarMoeda(item.valor_unitario_ofertado), colValorUnit, y + 3);
      doc.text(formatarMoeda(valorTotalItem), colValorTotal, y + 3);
      
      y += alturaLinha;
    }

    y += 5;

    // Valor Total
    doc.setFillColor(240, 240, 240);
    doc.rect(margemEsquerda, y, larguraUtil, 8, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('VALOR TOTAL DA PROPOSTA:', colDesc, y + 5);
    doc.text(`R$ ${formatarMoeda(valorTotal)}`, colValorTotal, y + 5);
    
    y += 12;

    // Observações
    if (observacoes && observacoes.trim()) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Observações:', margemEsquerda, y);
      y += 5;
      
      doc.setFont('helvetica', 'normal');
      const obsLimpa = stripHtml(observacoes);
      const obsLines = doc.splitTextToSize(obsLimpa, larguraUtil);
      doc.text(obsLines, margemEsquerda, y);
      y += obsLines.length * 5 + 5;
    }

    // Buscar dados do fornecedor para certificação
    const { data: fornecedorData } = await supabase
      .from('fornecedores')
      .select('razao_social, cnpj, nome_socio_administrador')
      .eq('cnpj', fornecedor.cnpj)
      .single();

    // Certificação Digital usando função padrão completa
    if (y > 220) {
      doc.addPage();
      y = 20;
    }
    
    y += 5;
    const linkVerificacao = `https://prima-qualita-procure.lovable.app/verificar-proposta?protocolo=${protocolo}`;
    
    y = adicionarCertificacaoDigital(doc, {
      protocolo: protocolo,
      dataHora: dataEnvio,
      responsavel: fornecedorData?.nome_socio_administrador || fornecedor.razao_social,
      cpf: fornecedor.cnpj,
      hash: hash,
      linkVerificacao: linkVerificacao
    }, y);


    // Gerar PDF como blob
    const pdfBlob = doc.output('blob');
    
    // Upload para Supabase Storage
    const nomeArquivo = `proposta-selecao-${propostaId}-${Date.now()}.pdf`;
    const filePath = `propostas-selecao/${nomeArquivo}`;

    const { error: uploadError } = await supabase.storage
      .from('processo-anexos')
      .upload(filePath, pdfBlob, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
      console.error('Erro ao fazer upload:', uploadError);
      throw uploadError;
    }

    // Atualizar a proposta com o protocolo e hash
    const { error: updateError } = await supabase
      .from('selecao_propostas_fornecedor')
      .update({
        protocolo: protocolo,
        hash_certificacao: hash
      })
      .eq('id', propostaId);

    if (updateError) {
      console.error('Erro ao atualizar protocolo:', updateError);
      throw updateError;
    }

    console.log('Proposta atualizada com protocolo:', protocolo);

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
