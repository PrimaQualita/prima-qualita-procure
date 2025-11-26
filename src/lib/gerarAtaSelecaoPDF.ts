import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';

interface EmpresaParticipante {
  razao_social: string;
  cnpj: string;
  email: string;
  fornecedor_id: string;
}

interface ItemVencedor {
  numero_item: number;
  descricao: string;
  fornecedor_id: string;
  fornecedor_nome: string;
  valor_final: number;
}

interface MensagemNegociacao {
  created_at: string;
  mensagem: string;
  tipo_remetente: string;
  fornecedor_nome: string;
  numero_item: number;
}

interface FornecedorInabilitado {
  razao_social: string;
  cnpj: string;
  itens_afetados: number[];
  motivo_inabilitacao: string;
  data_inabilitacao: string;
}

const formatarProtocoloExibicao = (uuid: string): string => {
  const limpo = uuid.replace(/-/g, '').toUpperCase().substring(0, 16);
  return `${limpo.substring(0, 4)}-${limpo.substring(4, 8)}-${limpo.substring(8, 12)}-${limpo.substring(12, 16)}`;
};

const formatarCNPJ = (cnpj: string): string => {
  const numeros = cnpj.replace(/\D/g, '');
  return numeros.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};

const formatarMoeda = (valor: number): string => {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const formatarDataExtenso = (dataStr: string): string => {
  const data = new Date(dataStr);
  const meses = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
  ];
  const dia = data.getDate();
  const mes = meses[data.getMonth()];
  const ano = data.getFullYear();
  return `${dia} de ${mes} de ${ano}`;
};

const formatarHora = (horaStr: string): string => {
  return horaStr.substring(0, 5);
};

const formatarDataHora = (dataStr: string): string => {
  const data = new Date(dataStr);
  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

export async function gerarAtaSelecaoPDF(selecaoId: string): Promise<{ url: string; nome: string; protocolo: string }> {
  // Buscar dados da seleção
  const { data: selecao, error: selecaoError } = await supabase
    .from('selecoes_fornecedores')
    .select(`
      *,
      processos_compras (
        numero_processo_interno,
        objeto_resumido,
        contratos_gestao (
          nome_contrato,
          ente_federativo
        )
      ),
      cotacoes_precos:cotacao_relacionada_id (
        titulo_cotacao,
        descricao_cotacao
      )
    `)
    .eq('id', selecaoId)
    .single();

  if (selecaoError || !selecao) {
    throw new Error('Erro ao buscar dados da seleção');
  }

  // Buscar empresas participantes (propostas enviadas)
  const { data: propostas, error: propostasError } = await supabase
    .from('selecao_propostas_fornecedor')
    .select(`
      fornecedor_id,
      fornecedores (
        razao_social,
        cnpj,
        email
      )
    `)
    .eq('selecao_id', selecaoId);

  if (propostasError) {
    throw new Error('Erro ao buscar propostas');
  }

  const empresasParticipantes: EmpresaParticipante[] = (propostas || []).map(p => ({
    razao_social: (p.fornecedores as any)?.razao_social || '',
    cnpj: (p.fornecedores as any)?.cnpj || '',
    email: (p.fornecedores as any)?.email || '',
    fornecedor_id: p.fornecedor_id
  }));

  // Buscar itens e identificar vencedores (lances vencedores)
  const { data: lancesVencedores, error: lancesError } = await supabase
    .from('lances_fornecedores')
    .select(`
      numero_item,
      valor_lance,
      fornecedor_id,
      fornecedores (
        razao_social
      )
    `)
    .eq('selecao_id', selecaoId)
    .eq('indicativo_lance_vencedor', true);

  // Buscar itens da cotação relacionada para descrições
  let itensDescricoes: Record<number, string> = {};
  if (selecao.cotacao_relacionada_id) {
    const { data: itensCotacao } = await supabase
      .from('itens_cotacao')
      .select('numero_item, descricao')
      .eq('cotacao_id', selecao.cotacao_relacionada_id);
    
    if (itensCotacao) {
      itensCotacao.forEach(item => {
        itensDescricoes[item.numero_item] = item.descricao;
      });
    }
  }

  const itensVencedores: ItemVencedor[] = (lancesVencedores || []).map(lance => ({
    numero_item: lance.numero_item || 0,
    descricao: itensDescricoes[lance.numero_item || 0] || `Item ${lance.numero_item}`,
    fornecedor_id: lance.fornecedor_id,
    fornecedor_nome: (lance.fornecedores as any)?.razao_social || '',
    valor_final: lance.valor_lance
  }));

  // Buscar mensagens de negociação
  const { data: mensagens, error: mensagensError } = await supabase
    .from('mensagens_negociacao')
    .select(`
      created_at,
      mensagem,
      tipo_remetente,
      numero_item,
      fornecedor_id,
      fornecedores (
        razao_social
      )
    `)
    .eq('selecao_id', selecaoId)
    .order('created_at', { ascending: true });

  const mensagensNegociacao: MensagemNegociacao[] = (mensagens || []).map(m => ({
    created_at: m.created_at,
    mensagem: m.mensagem,
    tipo_remetente: m.tipo_remetente,
    fornecedor_nome: (m.fornecedores as any)?.razao_social || 'Fornecedor',
    numero_item: m.numero_item
  }));

  // Buscar fornecedores inabilitados
  const { data: inabilitados, error: inabilitadosError } = await supabase
    .from('fornecedores_inabilitados_selecao')
    .select(`
      itens_afetados,
      motivo_inabilitacao,
      data_inabilitacao,
      fornecedores (
        razao_social,
        cnpj
      )
    `)
    .eq('selecao_id', selecaoId)
    .eq('revertido', false);

  const fornecedoresInabilitados: FornecedorInabilitado[] = (inabilitados || []).map((inab: any) => ({
    razao_social: inab.fornecedores?.razao_social || '',
    cnpj: inab.fornecedores?.cnpj || '',
    itens_afetados: inab.itens_afetados || [],
    motivo_inabilitacao: inab.motivo_inabilitacao,
    data_inabilitacao: inab.data_inabilitacao
  }));

  // Buscar data/hora de início (primeiro item aberto ou primeira mensagem)
  const { data: primeiroItem } = await supabase
    .from('itens_abertos_lances')
    .select('data_abertura')
    .eq('selecao_id', selecaoId)
    .order('data_abertura', { ascending: true })
    .limit(1)
    .single();

  let dataHoraInicio = primeiroItem?.data_abertura || mensagens?.[0]?.created_at || new Date().toISOString();

  // Buscar usuário gerador
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

  // Gerar PDF
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const marginLeft = 20;
  const marginRight = 20;
  const contentWidth = pageWidth - marginLeft - marginRight;
  let currentY = 20;

  const protocolo = uuidv4();
  const protocoloFormatado = formatarProtocoloExibicao(protocolo);

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
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(`ATA DA SESSÃO PÚBLICA DA SELEÇÃO DE FORNECEDORES Nº ${selecao.numero_selecao || '---'}`, pageWidth / 2, currentY, { align: "center" });
  currentY += 12;

  // OBJETO
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("OBJETO", marginLeft, currentY);
  currentY += 6;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const objetoTexto = selecao.descricao || (selecao.processos_compras as any)?.objeto_resumido || selecao.titulo_selecao;
  const objetoLinhas = doc.splitTextToSize(objetoTexto, contentWidth);
  objetoLinhas.forEach((linha: string) => {
    checkNewPage(6);
    doc.text(linha, marginLeft, currentY, { align: "justify", maxWidth: contentWidth });
    currentY += 5;
  });
  currentY += 6;

  // PREÂMBULO
  checkNewPage(50);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("PREÂMBULO", marginLeft, currentY);
  currentY += 6;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  
  const preambulo = `Aos ${formatarDataExtenso(selecao.data_sessao_disputa)}, às ${formatarHora(selecao.hora_sessao_disputa)} horas, reuniu-se a Comissão do Departamento de Compras para atuar na Sessão Pública de Seleção de Fornecedores nº ${selecao.numero_selecao || '---'}, e Processo nº ${(selecao.processos_compras as any)?.numero_processo_interno || '---'}.`;
  
  const preambuloLinhas = doc.splitTextToSize(preambulo, contentWidth);
  preambuloLinhas.forEach((linha: string) => {
    checkNewPage(6);
    doc.text(linha, marginLeft, currentY, { align: "justify", maxWidth: contentWidth });
    currentY += 5;
  });
  currentY += 4;

  // Início da sessão
  doc.text(`Início da sessão: ${formatarDataHora(dataHoraInicio)}`, marginLeft, currentY);
  currentY += 8;

  // Lista de empresas participantes
  if (empresasParticipantes.length > 0) {
    const nomesEmpresas = empresasParticipantes.map(e => e.razao_social).join(', ');
    const participacaoTexto = `Participaram do certame as empresas: ${nomesEmpresas}.`;
    const participacaoLinhas = doc.splitTextToSize(participacaoTexto, contentWidth);
    participacaoLinhas.forEach((linha: string) => {
      checkNewPage(6);
      doc.text(linha, marginLeft, currentY, { align: "justify", maxWidth: contentWidth });
      currentY += 5;
    });
  }
  currentY += 8;

  // Tabela de empresas participantes
  checkNewPage(60);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("EMPRESAS PARTICIPANTES", marginLeft, currentY);
  currentY += 6;

  const tabelaEmpresas = empresasParticipantes.map(e => [
    e.razao_social,
    formatarCNPJ(e.cnpj),
    e.email
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['EMPRESA', 'CNPJ', 'E-MAIL']],
    body: tabelaEmpresas,
    theme: 'grid',
    headStyles: { fillColor: [66, 66, 66], fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    margin: { left: marginLeft, right: marginRight },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 45 },
      2: { cellWidth: 55 }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 10;

  // HABILITADOS - Vencedores por item
  checkNewPage(60);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("HABILITADOS", marginLeft, currentY);
  currentY += 6;

  if (itensVencedores.length > 0) {
    // Agrupar por fornecedor
    const vencedoresPorFornecedor: Record<string, { nome: string; itens: number[]; valores: number[] }> = {};
    itensVencedores.forEach(item => {
      if (!vencedoresPorFornecedor[item.fornecedor_id]) {
        vencedoresPorFornecedor[item.fornecedor_id] = {
          nome: item.fornecedor_nome,
          itens: [],
          valores: []
        };
      }
      vencedoresPorFornecedor[item.fornecedor_id].itens.push(item.numero_item);
      vencedoresPorFornecedor[item.fornecedor_id].valores.push(item.valor_final);
    });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    Object.values(vencedoresPorFornecedor).forEach(fornecedor => {
      const itensStr = fornecedor.itens.sort((a, b) => a - b).join(', ');
      const valorTotal = fornecedor.valores.reduce((a, b) => a + b, 0);
      const textoVencedor = `A empresa ${fornecedor.nome} foi declarada HABILITADA e VENCEDORA dos itens: ${itensStr}. Valor total: ${formatarMoeda(valorTotal)}.`;
      const linhas = doc.splitTextToSize(textoVencedor, contentWidth);
      linhas.forEach((linha: string) => {
        checkNewPage(6);
        doc.text(linha, marginLeft, currentY, { align: "justify", maxWidth: contentWidth });
        currentY += 5;
      });
      currentY += 3;
    });
  } else {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Nenhum fornecedor habilitado até o momento.", marginLeft, currentY);
    currentY += 6;
  }
  currentY += 6;

  // INABILITADOS
  if (fornecedoresInabilitados.length > 0) {
    checkNewPage(60);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("INABILITADOS", marginLeft, currentY);
    currentY += 6;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    fornecedoresInabilitados.forEach(inab => {
      checkNewPage(20);
      const itensStr = inab.itens_afetados.sort((a, b) => a - b).join(', ');
      const textoInab = `A empresa ${inab.razao_social} (CNPJ: ${formatarCNPJ(inab.cnpj)}) foi INABILITADA nos itens: ${itensStr}.`;
      const linhas = doc.splitTextToSize(textoInab, contentWidth);
      linhas.forEach((linha: string) => {
        doc.text(linha, marginLeft, currentY, { align: "justify", maxWidth: contentWidth });
        currentY += 5;
      });
      
      // Motivo da inabilitação
      const motivoTexto = `Motivo: ${inab.motivo_inabilitacao}`;
      const motivoLinhas = doc.splitTextToSize(motivoTexto, contentWidth - 10);
      doc.setFont("helvetica", "italic");
      motivoLinhas.forEach((linha: string) => {
        checkNewPage(5);
        doc.text(linha, marginLeft + 10, currentY);
        currentY += 5;
      });
      doc.setFont("helvetica", "normal");
      currentY += 4;
    });
    currentY += 4;
  }

  // NEGOCIAÇÃO - Chat
  if (mensagensNegociacao.length > 0) {
    checkNewPage(50);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("REGISTRO DE NEGOCIAÇÃO", marginLeft, currentY);
    currentY += 8;

    // Agrupar mensagens por item
    const mensagensPorItem: Record<number, MensagemNegociacao[]> = {};
    mensagensNegociacao.forEach(msg => {
      if (!mensagensPorItem[msg.numero_item]) {
        mensagensPorItem[msg.numero_item] = [];
      }
      mensagensPorItem[msg.numero_item].push(msg);
    });

    Object.keys(mensagensPorItem).sort((a, b) => Number(a) - Number(b)).forEach(itemNum => {
      checkNewPage(30);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(`Item ${itemNum}:`, marginLeft, currentY);
      currentY += 5;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");

      mensagensPorItem[Number(itemNum)].forEach(msg => {
        checkNewPage(15);
        const remetente = msg.tipo_remetente === 'gestor' ? 'Comissão' : msg.fornecedor_nome;
        const dataHora = formatarDataHora(msg.created_at);
        
        doc.setFont("helvetica", "bold");
        doc.text(`[${dataHora}] ${remetente}:`, marginLeft + 5, currentY);
        currentY += 4;
        
        doc.setFont("helvetica", "normal");
        const msgLinhas = doc.splitTextToSize(msg.mensagem, contentWidth - 10);
        msgLinhas.forEach((linha: string) => {
          checkNewPage(5);
          doc.text(linha, marginLeft + 10, currentY);
          currentY += 4;
        });
        currentY += 2;
      });
      currentY += 4;
    });
  }

  // ENCERRAMENTO
  checkNewPage(40);
  currentY += 5;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("ENCERRAMENTO", marginLeft, currentY);
  currentY += 6;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const encerramento = `Nada mais a ser tratado, foi lavrada a presente Ata que registra todos os atos praticados durante a Sessão Pública de Seleção de Fornecedores.`;
  const encerramentoLinhas = doc.splitTextToSize(encerramento, contentWidth);
  encerramentoLinhas.forEach((linha: string) => {
    doc.text(linha, marginLeft, currentY, { align: "justify", maxWidth: contentWidth });
    currentY += 5;
  });

  // Certificação Digital
  currentY += 15;
  checkNewPage(60);

  const verificationUrl = `${window.location.origin}/verificar-ata?protocolo=${protocolo}`;
  
  // Calcular altura necessária para o conteúdo
  doc.setFontSize(8);
  const urlLines = doc.splitTextToSize(verificationUrl, contentWidth - 10);
  const certHeight = 38 + (urlLines.length * 3.5);
  
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
  const nomeArquivo = `ata-selecao-${selecao.numero_selecao || selecaoId.substring(0, 8)}-${Date.now()}.pdf`;
  const storagePath = `atas-selecao/${selecaoId}/${nomeArquivo}`;

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
    protocolo: protocoloFormatado
  };
}

interface Assinatura {
  fornecedor_id: string;
  razao_social: string;
  cnpj: string;
  data_assinatura: string;
  ip_assinatura: string;
  status_assinatura: string;
}

export async function atualizarAtaComAssinaturas(ataId: string): Promise<void> {
  // Buscar dados da ata
  const { data: ata, error: ataError } = await supabase
    .from('atas_selecao')
    .select('*, selecoes_fornecedores(*)')
    .eq('id', ataId)
    .single();

  if (ataError || !ata) {
    console.error('Erro ao buscar ata:', ataError);
    throw new Error('Erro ao buscar dados da ata');
  }

  // Buscar todas as assinaturas desta ata
  const { data: assinaturas, error: assinaturasError } = await supabase
    .from('atas_assinaturas_fornecedor')
    .select(`
      fornecedor_id,
      data_assinatura,
      ip_assinatura,
      status_assinatura,
      fornecedores (
        razao_social,
        cnpj
      )
    `)
    .eq('ata_id', ataId)
    .order('data_assinatura', { ascending: true });

  if (assinaturasError) {
    console.error('Erro ao buscar assinaturas:', assinaturasError);
    throw new Error('Erro ao buscar assinaturas');
  }

  const assinaturasFormatadas: Assinatura[] = (assinaturas || []).map(a => ({
    fornecedor_id: a.fornecedor_id,
    razao_social: (a.fornecedores as any)?.razao_social || '',
    cnpj: (a.fornecedores as any)?.cnpj || '',
    data_assinatura: a.data_assinatura || '',
    ip_assinatura: a.ip_assinatura || '',
    status_assinatura: a.status_assinatura
  }));

  // Buscar PDF existente
  const response = await fetch(ata.url_arquivo);
  const existingPdfBytes = await response.arrayBuffer();

  // Usar pdf-lib para modificar o PDF existente
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Adicionar nova página de assinaturas
  const page = pdfDoc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();
  const marginLeft = 40;
  const marginRight = 40;
  let currentY = height - 50;

  // Título
  page.drawText('TERMO DE ACEITE E ASSINATURA DIGITAL', {
    x: marginLeft,
    y: currentY,
    size: 14,
    font: helveticaBold,
    color: rgb(0.13, 0.27, 0.53),
  });
  currentY -= 30;

  // Subtítulo
  page.drawText(`Ata de Seleção - Protocolo: ${ata.protocolo}`, {
    x: marginLeft,
    y: currentY,
    size: 10,
    font: helveticaFont,
    color: rgb(0.3, 0.3, 0.3),
  });
  currentY -= 25;

  // Linha separadora
  page.drawLine({
    start: { x: marginLeft, y: currentY },
    end: { x: width - marginRight, y: currentY },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });
  currentY -= 25;

  // Lista de assinaturas
  page.drawText('ASSINATURAS DOS FORNECEDORES VENCEDORES', {
    x: marginLeft,
    y: currentY,
    size: 11,
    font: helveticaBold,
    color: rgb(0, 0, 0),
  });
  currentY -= 20;

  for (const assinatura of assinaturasFormatadas) {
    // Box para cada assinatura
    const boxHeight = 55;
    const boxY = currentY - boxHeight;

    // Fundo do box
    page.drawRectangle({
      x: marginLeft,
      y: boxY,
      width: width - marginLeft - marginRight,
      height: boxHeight,
      color: assinatura.status_assinatura === 'aceito' ? rgb(0.95, 1, 0.95) : rgb(1, 0.98, 0.9),
      borderColor: assinatura.status_assinatura === 'aceito' ? rgb(0.2, 0.7, 0.2) : rgb(0.9, 0.7, 0.2),
      borderWidth: 1,
    });

    // Nome da empresa
    page.drawText(assinatura.razao_social, {
      x: marginLeft + 10,
      y: currentY - 15,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    // CNPJ
    page.drawText(`CNPJ: ${formatarCNPJ(assinatura.cnpj)}`, {
      x: marginLeft + 10,
      y: currentY - 28,
      size: 9,
      font: helveticaFont,
      color: rgb(0.3, 0.3, 0.3),
    });

    // Status e data
    if (assinatura.status_assinatura === 'aceito' && assinatura.data_assinatura) {
      const dataFormatada = new Date(assinatura.data_assinatura).toLocaleString('pt-BR');
      page.drawText(`✓ ACEITO DIGITALMENTE em ${dataFormatada}`, {
        x: marginLeft + 10,
        y: currentY - 42,
        size: 9,
        font: helveticaBold,
        color: rgb(0.1, 0.5, 0.1),
      });
    } else {
      page.drawText('⏳ Pendente de assinatura', {
        x: marginLeft + 10,
        y: currentY - 42,
        size: 9,
        font: helveticaFont,
        color: rgb(0.7, 0.5, 0),
      });
    }

    currentY -= (boxHeight + 10);

    // Se não houver mais espaço, adicionar nova página
    if (currentY < 100) {
      const newPage = pdfDoc.addPage([595, 842]);
      currentY = height - 50;
    }
  }

  // Rodapé com informações de verificação
  const footerY = 50;
  page.drawLine({
    start: { x: marginLeft, y: footerY + 20 },
    end: { x: width - marginRight, y: footerY + 20 },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });

  page.drawText('Este documento possui certificação digital conforme Lei 14.063/2020', {
    x: marginLeft,
    y: footerY,
    size: 8,
    font: helveticaFont,
    color: rgb(0.5, 0.5, 0.5),
  });

  page.drawText('Travessa do Ouvidor, 21, Sala 503, Centro, Rio de Janeiro - RJ, CEP: 20.040-040', {
    x: marginLeft,
    y: footerY - 12,
    size: 7,
    font: helveticaFont,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Salvar PDF modificado
  const modifiedPdfBytes = await pdfDoc.save();
  const pdfBlob = new Blob([new Uint8Array(modifiedPdfBytes) as BlobPart], { type: 'application/pdf' });

  // Extrair o path do storage da URL
  const urlParts = ata.url_arquivo.split('/processo-anexos/');
  if (urlParts.length < 2) {
    throw new Error('URL do arquivo inválida');
  }
  const storagePath = urlParts[1];

  // Upload do PDF atualizado
  const { error: uploadError } = await supabase.storage
    .from('processo-anexos')
    .upload(storagePath, pdfBlob, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    console.error('Erro ao fazer upload do PDF atualizado:', uploadError);
    throw uploadError;
  }

  console.log('PDF da ata atualizado com sucesso com as assinaturas');
}
