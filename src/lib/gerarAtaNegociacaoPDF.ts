import jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';

interface MensagemAta {
  remetente: string;
  tipoRemetente: string;
  mensagem: string;
  dataHora: string;
}

interface GerarAtaNegociacaoParams {
  selecaoId: string;
  numeroItem: number;
  fornecedorId: string;
  fornecedorNome: string;
  tituloSelecao: string;
  mensagens: MensagemAta[];
}

// Função para formatar protocolo UUID no formato XXXX-XXXX-XXXX-XXXX para exibição
const formatarProtocoloExibicao = (uuid: string): string => {
  const limpo = uuid.replace(/-/g, '').toUpperCase().substring(0, 16);
  return `${limpo.substring(0, 4)}-${limpo.substring(4, 8)}-${limpo.substring(8, 12)}-${limpo.substring(12, 16)}`;
};

const formatDateTime = (dateStr: string) => {
  return new Date(dateStr).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

// Função para gerar Ata de um item específico (chat privado)
export async function gerarAtaNegociacaoPDF({
  selecaoId,
  numeroItem,
  fornecedorId,
  fornecedorNome,
  tituloSelecao,
  mensagens,
}: GerarAtaNegociacaoParams): Promise<{ url: string; nome: string; protocolo: string }> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const marginLeft = 20;
  const marginRight = 20;
  const contentWidth = pageWidth - marginLeft - marginRight;
  let currentY = 20;

  // Gerar protocolo único
  const protocolo = uuidv4();
  const protocoloFormatado = formatarProtocoloExibicao(protocolo);

  // Buscar dados do usuário gerador
  const { data: { user } } = await supabase.auth.getUser();
  let nomeResponsavel = "Sistema";
  
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("nome_completo")
      .eq("id", user.id)
      .single();
    
    if (profile) {
      nomeResponsavel = profile.nome_completo;
    }
  }

  // Função para adicionar rodapé
  const addFooter = () => {
    doc.setFontSize(8);
    doc.setTextColor(128);
    doc.text(
      "Travessa do Ouvidor, 21, Sala 503, Centro, Rio de Janeiro - RJ, CEP: 20.040-040",
      pageWidth / 2,
      pageHeight - 10,
      { align: "center" }
    );
    doc.setTextColor(0);
  };

  // Função para verificar e adicionar nova página
  const checkNewPage = (requiredHeight: number = 40) => {
    if (currentY + requiredHeight > pageHeight - 30) {
      addFooter();
      doc.addPage();
      currentY = 20;
      return true;
    }
    return false;
  };

  // Título
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("ATA DE NEGOCIAÇÃO", pageWidth / 2, currentY, { align: "center" });
  currentY += 10;

  // Subtítulo
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Item ${numeroItem} - ${tituloSelecao}`, pageWidth / 2, currentY, { align: "center" });
  currentY += 15;

  // Informações da negociação
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("INFORMAÇÕES DA NEGOCIAÇÃO", marginLeft, currentY);
  currentY += 7;

  doc.setFont("helvetica", "normal");
  doc.text(`Fornecedor: ${fornecedorNome}`, marginLeft, currentY);
  currentY += 5;
  doc.text(`Item: ${numeroItem}`, marginLeft, currentY);
  currentY += 5;
  doc.text(`Data de Geração: ${new Date().toLocaleString("pt-BR")}`, marginLeft, currentY);
  currentY += 5;
  doc.text(`Total de Mensagens: ${mensagens.length}`, marginLeft, currentY);
  currentY += 12;

  // Linha separadora
  doc.setDrawColor(200);
  doc.line(marginLeft, currentY, pageWidth - marginRight, currentY);
  currentY += 10;

  // Título da transcrição
  doc.setFont("helvetica", "bold");
  doc.text("TRANSCRIÇÃO CRONOLÓGICA DAS MENSAGENS", marginLeft, currentY);
  currentY += 10;

  // Mensagens em ordem cronológica
  doc.setFontSize(9);
  mensagens.forEach((msg, index) => {
    checkNewPage(30);

    // Data/hora e remetente
    doc.setFont("helvetica", "bold");
    const tipoLabel = msg.tipoRemetente === "gestor" ? "[GESTOR]" : "[FORNECEDOR]";
    const headerText = `${formatDateTime(msg.dataHora)} - ${tipoLabel} ${msg.remetente}`;
    doc.text(headerText, marginLeft, currentY);
    currentY += 5;

    // Mensagem
    doc.setFont("helvetica", "normal");
    const linhasMensagem = doc.splitTextToSize(msg.mensagem, contentWidth);
    
    linhasMensagem.forEach((linha: string) => {
      checkNewPage(6);
      doc.text(linha, marginLeft + 5, currentY);
      currentY += 5;
    });

    currentY += 5;

    // Linha separadora entre mensagens
    if (index < mensagens.length - 1) {
      doc.setDrawColor(230);
      doc.line(marginLeft, currentY, pageWidth - marginRight, currentY);
      currentY += 8;
    }
  });

  // Certificação Digital
  currentY += 15;
  checkNewPage(60);

  const verificationUrl = `${window.location.origin}/verificar-ata?protocolo=${protocolo}`;
  
  // Calcular altura necessária para o conteúdo
  doc.setFontSize(8);
  const urlLines = doc.splitTextToSize(verificationUrl, contentWidth - 10);
  const certHeight = 50 + (urlLines.length * 3.5);
  
  const certY = currentY;
  
  // Fundo cinza
  doc.setFillColor(245, 245, 245);
  doc.rect(marginLeft, certY, contentWidth, certHeight, 'F');
  
  // Borda
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(marginLeft, certY, contentWidth, certHeight, 'S');

  // Título em azul escuro
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 139);
  doc.text("CERTIFICAÇÃO DIGITAL - AUTENTICIDADE DO DOCUMENTO", marginLeft + contentWidth / 2, certY + 8, { align: "center" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  
  let certTextY = certY + 17;
  
  // Protocolo
  doc.text(`Protocolo: ${protocoloFormatado}`, marginLeft + 5, certTextY);
  certTextY += 5;
  
  // Responsável
  doc.text(`Responsável: ${nomeResponsavel}`, marginLeft + 5, certTextY);
  certTextY += 6;
  
  // Verificação - Label
  doc.setFont("helvetica", "bold");
  doc.text("Verificar autenticidade em:", marginLeft + 5, certTextY);
  certTextY += 4;
  
  // URL como link clicável com quebra de linha
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 255);
  doc.setFontSize(8);
  urlLines.forEach((linha: string, index: number) => {
    doc.textWithLink(linha, marginLeft + 5, certTextY + (index * 3.5), { url: verificationUrl });
  });
  certTextY += urlLines.length * 3.5 + 2;
  
  // Texto legal
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(7);
  doc.text("Este documento possui certificação digital conforme Lei 14.063/2020", marginLeft + 5, certTextY);
  doc.setTextColor(0, 0, 0);

  // Rodapé
  addFooter();

  // Salvar PDF
  const pdfBlob = doc.output('blob');
  const nomeArquivo = `ata-negociacao-item-${numeroItem}-${Date.now()}.pdf`;
  const storagePath = `atas-negociacao/${selecaoId}/${nomeArquivo}`;

  const { error: uploadError } = await supabase.storage
    .from('processo-anexos')
    .upload(storagePath, pdfBlob, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    console.error('Erro ao fazer upload:', uploadError);
    throw uploadError;
  }

  const { data: { publicUrl } } = supabase.storage
    .from('processo-anexos')
    .getPublicUrl(storagePath);

  // Salvar registro da ata na tabela para verificação
  const { error: insertError } = await supabase
    .from('atas_selecao')
    .insert({
      selecao_id: selecaoId,
      protocolo: protocolo,
      nome_arquivo: nomeArquivo,
      url_arquivo: publicUrl,
      usuario_gerador_id: user?.id || null,
      data_geracao: new Date().toISOString()
    });

  if (insertError) {
    console.error('Erro ao salvar registro da ata:', insertError);
    // Não lançamos erro para não impedir o fluxo, apenas logamos
  }

  return {
    url: publicUrl,
    nome: nomeArquivo,
    protocolo: protocoloFormatado,
  };
}
