import jsPDF from 'jspdf';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { supabase } from '@/integrations/supabase/client';
import { gerarHashDocumento } from './certificacaoDigital';

// Função para gerar protocolo no formato XXXX-XXXX-XXXX-XXXX
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
}

interface DadosFornecedor {
  razao_social: string;
  cnpj: string;
  endereco_comercial: string;
}

export async function gerarPropostaFornecedorPDF(
  respostaId: string,
  fornecedor: DadosFornecedor,
  valorTotal: number,
  observacoes: string | null,
  tituloCotacao: string,
  comprovantes: File[] = [],
  usuarioNome?: string,
  usuarioCpf?: string
): Promise<{ url: string; nome: string; hash: string }> {
  try {
    // Buscar itens da resposta
    const { data: itens, error: itensError } = await supabase
      .from('respostas_itens_fornecedor')
      .select(`
        valor_unitario_ofertado,
        itens_cotacao:item_cotacao_id (
          numero_item,
          descricao,
          quantidade,
          unidade
        )
      `)
      .eq('cotacao_resposta_fornecedor_id', respostaId);

    if (itensError) throw itensError;

    const dataGeracao = new Date().toLocaleString('pt-BR');

    const doc = new jsPDF();
    
    // Cores do sistema (HSL convertido para RGB)
    const corPrimaria = [0, 102, 102];
    const corSecundaria = [0, 102, 153];
    const corFundo = [209, 247, 247];
    const corTexto = [0, 71, 71];
    const corAccent = [128, 242, 242];
    
    let y = 0;

    // Cabeçalho com fundo colorido
    doc.setFillColor(corPrimaria[0], corPrimaria[1], corPrimaria[2]);
    doc.rect(0, 0, 210, 50, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('PROPOSTA DE PREÇOS PÚBLICOS', 105, 25, { align: 'center' });
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Ref: ${tituloCotacao}`, 105, 38, { align: 'center' });
    
    y = 60;

    // Bloco de informações do fornecedor com fundo
    doc.setFillColor(corFundo[0], corFundo[1], corFundo[2]);
    doc.rect(15, y, 180, 26, 'F');
    
    doc.setTextColor(corTexto[0], corTexto[1], corTexto[2]);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('FONTE DOS PREÇOS', 20, y + 8);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    // Se for preços públicos (CNPJ 00000000000000), mostrar apenas a fonte
    if (fornecedor.cnpj === '00000000000000') {
      doc.text(`Fonte: ${fornecedor.razao_social}`, 20, y + 16);
    } else {
      doc.text(`Nome: ${fornecedor.razao_social}`, 20, y + 16);
      doc.text(`CNPJ: ${fornecedor.cnpj}`, 20, y + 22);
    }
    
    y += 32;

    // Título da seção de itens
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(corPrimaria[0], corPrimaria[1], corPrimaria[2]);
    doc.text('ITENS DA PROPOSTA', 20, y);
    y += 8;

    // Cabeçalho da tabela com fundo
    doc.setFillColor(corSecundaria[0], corSecundaria[1], corSecundaria[2]);
    doc.rect(15, y - 5, 180, 8, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('ITEM', 20, y, { align: 'center' });
    doc.text('DESCRIÇÃO', 48, y, { align: 'center' });
    doc.text('QTD', 105, y, { align: 'center' });
    doc.text('UNID', 130, y, { align: 'center' });
    doc.text('VL. UNIT.', 158, y, { align: 'center' });
    doc.text('VL. TOTAL', 185, y, { align: 'center' });
    
    y += 6;
    doc.setTextColor(corTexto[0], corTexto[1], corTexto[2]);

    // Itens da proposta
    let isAlternate = false;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    for (const item of itens) {
      if (y > 260) {
        doc.addPage();
        y = 20;
        
        // Repetir cabeçalho da tabela
        doc.setFillColor(corSecundaria[0], corSecundaria[1], corSecundaria[2]);
        doc.rect(15, y - 5, 180, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('ITEM', 20, y, { align: 'center' });
        doc.text('DESCRIÇÃO', 48, y, { align: 'center' });
        doc.text('QTD', 105, y, { align: 'center' });
        doc.text('UNID', 130, y, { align: 'center' });
        doc.text('VL. UNIT.', 158, y, { align: 'center' });
        doc.text('VL. TOTAL', 185, y, { align: 'center' });
        y += 6;
        doc.setTextColor(corTexto[0], corTexto[1], corTexto[2]);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
      }

      const itemCotacao: any = item.itens_cotacao;
      const valorUnitario = item.valor_unitario_ofertado;
      const valorTotalItem = valorUnitario * itemCotacao.quantidade;

      // Fundo alternado para linhas
      if (isAlternate) {
        doc.setFillColor(corFundo[0], corFundo[1], corFundo[2]);
        doc.rect(15, y - 4, 180, 6, 'F');
      }

      doc.text(itemCotacao.numero_item.toString(), 20, y, { align: 'center' });
      
      const descricaoLinhas = doc.splitTextToSize(itemCotacao.descricao, 35);
      doc.text(descricaoLinhas[0], 28, y);
      
      doc.text(itemCotacao.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 105, y, { align: 'center' });
      doc.text(itemCotacao.unidade, 130, y, { align: 'center' });
      doc.text(valorUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 173, y, { align: 'right' });
      doc.text(valorTotalItem.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 193, y, { align: 'right' });
      
      y += 6;
      isAlternate = !isAlternate;
    }


    // Linha de separação
    y += 2;
    doc.setDrawColor(corSecundaria[0], corSecundaria[1], corSecundaria[2]);
    doc.setLineWidth(0.5);
    doc.line(15, y, 195, y);
    y += 8;

    // Valor total com destaque
    doc.setFillColor(corPrimaria[0], corPrimaria[1], corPrimaria[2]);
    doc.rect(120, y - 6, 75, 12, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`VALOR TOTAL: ${valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, 193, y, { align: 'right' });
    
    doc.setTextColor(corTexto[0], corTexto[1], corTexto[2]);
    y += 15;

    // Observações
    if (observacoes) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(corPrimaria[0], corPrimaria[1], corPrimaria[2]);
      doc.text('OBSERVAÇÕES:', 20, y);
      y += 7;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(corTexto[0], corTexto[1], corTexto[2]);
      const obsLines = doc.splitTextToSize(observacoes, 170);
      doc.text(obsLines, 20, y);
      y += obsLines.length * 5;
    }

    // Gerar protocolo
    const protocolo = gerarProtocolo();

    // Salvar o protocolo no banco
    const { error: protocoloError } = await supabase
      .from('cotacao_respostas_fornecedor')
      .update({ 
        protocolo: protocolo
      })
      .eq('id', respostaId);

    if (protocoloError) {
      console.error('Erro ao salvar protocolo:', protocoloError);
    }

    // Gerar PDF base como blob
    const pdfBlob = doc.output('blob');
    
    // Carregar PDF base com pdf-lib
    const pdfPropostaBytes = await pdfBlob.arrayBuffer();
    let pdfFinal = await PDFDocument.load(pdfPropostaBytes);
    
    // Adicionar certificação ANTES de mesclar comprovantes
    // Verificar se há espaço na última página
    const ultimaPagina = pdfFinal.getPage(pdfFinal.getPageCount() - 1);
    const { height } = ultimaPagina.getSize();
    
    // Se y atual for maior que 220, não há espaço suficiente - adicionar nova página
    let paginaCert;
    let yPosCert;
    
    if (y > height - 100) {
      // Criar nova página para certificação
      paginaCert = pdfFinal.addPage();
      yPosCert = height - 40;
    } else {
      // Usar a última página
      paginaCert = ultimaPagina;
      yPosCert = y + 10;
    }

    const { width } = paginaCert.getSize();
    const font = await pdfFinal.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfFinal.embedFont(StandardFonts.HelveticaBold);

    // Altura do quadro de certificação (ajustado com responsável)
    const alturaQuadro = 95;

    // Desenhar retângulo de fundo
    paginaCert.drawRectangle({
      x: 40,
      y: yPosCert - alturaQuadro,
      width: width - 80,
      height: alturaQuadro,
      color: rgb(0.96, 0.96, 0.96),
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });

    // Título
    paginaCert.drawText('CERTIFICAÇÃO DIGITAL', {
      x: width / 2 - 80,
      y: yPosCert - 15,
      size: 12,
      font: fontBold,
      color: rgb(0, 0, 0.55),
    });

    let yPos = yPosCert - 35;
    const fontSize = 10;
    const lineHeight = 15;

    // Responsável pela geração - SEMPRE o usuário que gerou quando for preços públicos
    const responsavel = fornecedor.cnpj === '00000000000000' 
      ? (usuarioNome || 'Não informado')
      : fornecedor.razao_social;
    
    paginaCert.drawText(`Responsável: ${responsavel}`, {
      x: 50,
      y: yPos,
      size: fontSize,
      font: font,
    });
    yPos -= lineHeight;

    // Protocolo
    paginaCert.drawText(`Protocolo: ${protocolo}`, {
      x: 50,
      y: yPos,
      size: fontSize,
      font: font,
    });
    yPos -= lineHeight;

    // Link de verificação
    const linkVerificacao = `${window.location.origin}/verificar-proposta?protocolo=${protocolo}`;
    paginaCert.drawText('Verificar autenticidade em:', {
      x: 50,
      y: yPos,
      size: 9,
      font: fontBold,
    });
    yPos -= 12;

    paginaCert.drawText(linkVerificacao, {
      x: 50,
      y: yPos,
      size: 7,
      font: font,
      color: rgb(0, 0, 1),
    });
    yPos -= 12;

    // Texto legal
    paginaCert.drawText('Este documento possui certificação digital conforme Lei 14.063/2020', {
      x: 50,
      y: yPos,
      size: 7,
      font: font,
      color: rgb(0.3, 0.3, 0.3),
    });

    // AGORA sim salvar e calcular hash
    const pdfComCertBytes = await pdfFinal.save();
    const hash = await gerarHashDocumento(pdfComCertBytes as unknown as ArrayBuffer);
    
    console.log('Hash calculado do PDF (com certificação, sem comprovantes):', hash);

    // Se houver comprovantes, carregar novamente e mesclar
    if (comprovantes.length > 0) {
      pdfFinal = await PDFDocument.load(pdfComCertBytes);
      
      for (const comprovante of comprovantes) {
        try {
          const comprovanteBytes = await comprovante.arrayBuffer();
          const pdfComprovante = await PDFDocument.load(comprovanteBytes);
          
          const pageIndices = pdfComprovante.getPageIndices();
          const copiedPages = await pdfFinal.copyPages(pdfComprovante, pageIndices);
          
          copiedPages.forEach((page) => {
            pdfFinal.addPage(page);
          });
          
          console.log('Comprovante mesclado:', comprovante.name);
        } catch (error) {
          console.error('Erro ao mesclar comprovante:', comprovante.name, error);
        }
      }
    }

    // Salvar PDF final (com certificação E comprovantes se houver)
    const pdfFinalBytes = await pdfFinal.save();
    const pdfFinalBlob = new Blob([pdfFinalBytes as unknown as BlobPart], { type: 'application/pdf' });

    const nomeArquivo = `proposta_${fornecedor.cnpj.replace(/[^\d]/g, '')}_${Date.now()}.pdf`;

    // Upload para o storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('processo-anexos')
      .upload(nomeArquivo, pdfFinalBlob, {
        contentType: 'application/pdf',
        cacheControl: '3600',
      });

    if (uploadError) throw uploadError;

    return {
      url: uploadData.path,
      nome: nomeArquivo,
      hash: hash
    };

  } catch (error) {
    console.error('Erro ao gerar PDF da proposta:', error);
    throw error;
  }
}
