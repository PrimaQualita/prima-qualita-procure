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
    
    // Se for preços públicos (CNPJ 00000000000000), mostrar o nome do usuário
    if (fornecedor.cnpj === '00000000000000') {
      doc.text(`Fonte: ${fornecedor.razao_social}`, 20, y + 16);
      doc.text(`Responsável: ${usuarioNome || 'Sistema'}`, 20, y + 22);
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
    doc.text('ITEM', 18, y);
    doc.text('DESCRIÇÃO', 35, y);
    doc.text('QTD', 120, y);
    doc.text('UNID', 140, y);
    doc.text('VL. UNIT.', 160, y);
    doc.text('VL. TOTAL', 180, y, { align: 'right' });
    
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
        doc.text('ITEM', 18, y);
        doc.text('DESCRIÇÃO', 35, y);
        doc.text('QTD', 120, y);
        doc.text('UNID', 140, y);
        doc.text('VL. UNIT.', 160, y);
        doc.text('VL. TOTAL', 180, y, { align: 'right' });
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

      doc.text(itemCotacao.numero_item.toString(), 18, y);
      
      const descricaoLinhas = doc.splitTextToSize(itemCotacao.descricao, 80);
      doc.text(descricaoLinhas[0], 35, y);
      
      doc.text(itemCotacao.quantidade.toFixed(2), 120, y);
      doc.text(itemCotacao.unidade, 140, y);
      doc.text(`R$ ${valorUnitario.toFixed(2)}`, 160, y);
      doc.text(`R$ ${valorTotalItem.toFixed(2)}`, 193, y, { align: 'right' });
      
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
    doc.text(`VALOR TOTAL: R$ ${valorTotal.toFixed(2)}`, 193, y, { align: 'right' });
    
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
    
    // Se houver comprovantes, mesclar os PDFs
    if (comprovantes.length > 0) {
      for (const comprovante of comprovantes) {
        try {
          const comprovanteBytes = await comprovante.arrayBuffer();
          const pdfComprovante = await PDFDocument.load(comprovanteBytes);
          
          const pageIndices = pdfComprovante.getPageIndices();
          const copiedPages = await pdfFinal.copyPages(pdfComprovante, pageIndices);
          
          copiedPages.forEach((page) => {
            pdfFinal.addPage(page);
          });
        } catch (error) {
          console.error('Erro ao mesclar comprovante:', error);
        }
      }
    }

    // Salvar PDF mesclado (sem certificação) e calcular hash
    const pdfMescladoBytes = await pdfFinal.save();
    const hash = await gerarHashDocumento(pdfMescladoBytes as unknown as ArrayBuffer);
    
    console.log('Hash calculado do PDF final:', hash);

    // Adicionar página de certificação
    const novaPagina = pdfFinal.addPage();
    const { width, height } = novaPagina.getSize();
    const font = await pdfFinal.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfFinal.embedFont(StandardFonts.HelveticaBold);

    // Desenhar retângulo de fundo
    novaPagina.drawRectangle({
      x: 40,
      y: height - 200,
      width: width - 80,
      height: 180,
      color: rgb(0.96, 0.96, 0.96),
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });

    // Título
    novaPagina.drawText('CERTIFICAÇÃO DIGITAL - AUTENTICIDADE DO DOCUMENTO', {
      x: width / 2 - 200,
      y: height - 50,
      size: 12,
      font: fontBold,
      color: rgb(0, 0, 0.55),
    });

    let yPos = height - 75;
    const fontSize = 10;
    const lineHeight = 15;

    // Protocolo
    novaPagina.drawText(`Protocolo: ${protocolo}`, {
      x: 50,
      y: yPos,
      size: fontSize,
      font: font,
    });
    yPos -= lineHeight;

    // Data/Hora
    novaPagina.drawText(`Data/Hora de Geração: ${dataGeracao}`, {
      x: 50,
      y: yPos,
      size: fontSize,
      font: font,
    });
    yPos -= lineHeight;

    // Responsável
    const responsavel = usuarioNome || fornecedor.razao_social;
    const cpfCnpj = usuarioCpf || fornecedor.cnpj;
    novaPagina.drawText(`Responsável pela Geração: ${responsavel} - CPF/CNPJ: ${cpfCnpj}`, {
      x: 50,
      y: yPos,
      size: fontSize,
      font: font,
    });
    yPos -= lineHeight;

    // Hash (quebrado em 2 linhas se necessário)
    novaPagina.drawText('Hash de Validação:', {
      x: 50,
      y: yPos,
      size: fontSize,
      font: fontBold,
    });
    yPos -= lineHeight;

    const hashParte1 = hash.substring(0, 64);
    const hashParte2 = hash.substring(64);
    
    novaPagina.drawText(hashParte1, {
      x: 50,
      y: yPos,
      size: 8,
      font: font,
      color: rgb(0.2, 0.2, 0.2),
    });
    
    if (hashParte2) {
      yPos -= 12;
      novaPagina.drawText(hashParte2, {
        x: 50,
        y: yPos,
        size: 8,
        font: font,
        color: rgb(0.2, 0.2, 0.2),
      });
    }

    yPos -= lineHeight;

    // Link de verificação
    const linkVerificacao = `${window.location.origin}/verificar-proposta?protocolo=${protocolo}`;
    novaPagina.drawText('Verificar autenticidade em:', {
      x: 50,
      y: yPos,
      size: fontSize,
      font: fontBold,
    });
    yPos -= lineHeight;

    novaPagina.drawText(linkVerificacao, {
      x: 50,
      y: yPos,
      size: 8,
      font: font,
      color: rgb(0, 0, 1),
    });
    yPos -= lineHeight;

    // Texto legal
    novaPagina.drawText('Este documento possui certificação digital conforme Lei 14.063/2020', {
      x: 50,
      y: yPos,
      size: 7,
      font: font,
      color: rgb(0.3, 0.3, 0.3),
    });

    // Salvar PDF final com certificação
    const pdfFinalComCertBytes = await pdfFinal.save();
    const pdfFinalBlob = new Blob([pdfFinalComCertBytes as unknown as BlobPart], { type: 'application/pdf' });

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
