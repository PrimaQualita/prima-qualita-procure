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
  checkNewPage(50);

  const certY = currentY;
  const certHeight = 40;
  
  doc.setDrawColor(150);
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(marginLeft, certY, contentWidth, certHeight, 3, 3, 'FD');

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("CERTIFICAÇÃO DIGITAL", marginLeft + contentWidth / 2, certY + 8, { align: "center" });

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  
  const certContent = [
    `Protocolo: ${protocoloFormatado}`,
    `Responsável: ${nomeResponsavel}`,
    `Verificação: ${window.location.origin}/verificar-ata?protocolo=${protocolo}`,
  ];

  let certTextY = certY + 16;
  certContent.forEach(line => {
    const lines = doc.splitTextToSize(line, contentWidth - 10);
    lines.forEach((l: string) => {
      doc.text(l, marginLeft + 5, certTextY);
      certTextY += 5;
    });
  });

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

  return {
    url: publicUrl,
    nome: nomeArquivo,
    protocolo: protocoloFormatado
  };
}
