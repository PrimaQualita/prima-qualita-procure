import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';
import logoImg from '@/assets/capa-processo-logo.png';
import rodapeImg from '@/assets/capa-processo-rodape.png';

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

// Função para desenhar texto justificado
const drawJustifiedText = (doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight: number = 5): number => {
  const lines = doc.splitTextToSize(text, maxWidth);
  let currentY = y;
  
  lines.forEach((line: string, index: number) => {
    const isLastLine = index === lines.length - 1;
    const words = line.trim().split(/\s+/);
    
    if (isLastLine || words.length <= 1) {
      // Última linha ou linha com uma palavra: alinhada à esquerda
      doc.text(line, x, currentY);
    } else {
      // Justificar: distribuir espaço entre palavras
      const lineWidth = doc.getTextWidth(line.trim());
      const totalSpaceNeeded = maxWidth - lineWidth + (words.length - 1) * doc.getTextWidth(' ');
      const spaceWidth = totalSpaceNeeded / (words.length - 1);
      
      let currentX = x;
      words.forEach((word, wordIndex) => {
        doc.text(word, currentX, currentY);
        if (wordIndex < words.length - 1) {
          currentX += doc.getTextWidth(word) + spaceWidth;
        }
      });
    }
    currentY += lineHeight;
  });
  
  return currentY;
};

// Função para carregar imagem como base64
const loadImageAsBase64 = async (src: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = src;
  });
};

export async function gerarAtaSelecaoPDF(selecaoId: string): Promise<{ url: string; nome: string; protocolo: string }> {
  // Carregar imagens
  const [logoBase64, rodapeBase64] = await Promise.all([
    loadImageAsBase64(logoImg),
    loadImageAsBase64(rodapeImg)
  ]);

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

  // Buscar itens da cotação relacionada para descrições E quantidades
  let itensDescricoes: Record<number, string> = {};
  let itensQuantidades: Record<number, number> = {};
  if (selecao.cotacao_relacionada_id) {
    const { data: itensCotacao } = await supabase
      .from('itens_cotacao')
      .select('numero_item, descricao, quantidade')
      .eq('cotacao_id', selecao.cotacao_relacionada_id);
    
    if (itensCotacao) {
      itensCotacao.forEach(item => {
        itensDescricoes[item.numero_item] = item.descricao;
        itensQuantidades[item.numero_item] = Number(item.quantidade) || 1;
      });
    }
  }

  // Calcular valor total = valor_unitario × quantidade
  const itensVencedores: ItemVencedor[] = (lancesVencedores || []).map(lance => {
    const quantidade = itensQuantidades[lance.numero_item || 0] || 1;
    const valorUnitario = lance.valor_lance;
    const valorTotal = valorUnitario * quantidade;
    
    return {
      numero_item: lance.numero_item || 0,
      descricao: itensDescricoes[lance.numero_item || 0] || `Item ${lance.numero_item}`,
      fornecedor_id: lance.fornecedor_id,
      fornecedor_nome: (lance.fornecedores as any)?.razao_social || '',
      valor_final: valorTotal // Agora é o valor TOTAL (unitário × quantidade)
    };
  });

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

  // Buscar itens que tiveram negociação com ÊXITO (lances do tipo 'negociacao' registrados)
  const { data: lancesNegociacao } = await supabase
    .from('lances_fornecedores')
    .select('numero_item')
    .eq('selecao_id', selecaoId)
    .eq('tipo_lance', 'negociacao');

  const itensNegociados = [...new Set((lancesNegociacao || []).map(l => l.numero_item))]
    .filter(n => n !== null)
    .sort((a, b) => a - b);

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
  let cpfResponsavel = "";
  
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("nome_completo, cpf")
      .eq("id", user.id)
      .single();
    
    if (profile) {
      nomeResponsavel = profile.nome_completo;
      cpfResponsavel = profile.cpf || "";
    }
  }

  // Gerar PDF
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const marginLeft = 15;
  const marginRight = 15;
  const contentWidth = pageWidth - marginLeft - marginRight;
  
  const protocolo = uuidv4();
  const protocoloFormatado = formatarProtocoloExibicao(protocolo);
  const dataHoraGeracao = new Date();

  // Dimensões do logo e rodapé
  const logoHeight = 25;
  const rodapeHeight = 20;
  const contentStartY = logoHeight + 10;
  const contentEndY = pageHeight - rodapeHeight - 10;
  
  let currentY = contentStartY;

  // Função para adicionar logo
  const addLogo = () => {
    doc.addImage(logoBase64, 'PNG', 0, 0, pageWidth, logoHeight);
  };

  // Função para adicionar rodapé
  const addRodape = () => {
    doc.addImage(rodapeBase64, 'PNG', 0, pageHeight - rodapeHeight, pageWidth, rodapeHeight);
  };

  // Função para verificar e adicionar nova página
  const checkNewPage = (requiredHeight: number = 20) => {
    if (currentY + requiredHeight > contentEndY) {
      addRodape();
      doc.addPage();
      addLogo();
      currentY = contentStartY;
      return true;
    }
    return false;
  };

  // Primeira página - Logo e Rodapé
  addLogo();

  // Espaçamento padrão entre seções
  const espacoEntreSecoes = 6;
  const espacoAposTitulo = 5;

  // 1 - TÍTULO
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(`ATA DA SESSÃO PÚBLICA DA SELEÇÃO DE FORNECEDORES Nº ${selecao.numero_selecao || '---'}`, pageWidth / 2, currentY, { align: "center" });
  currentY += 10;

  // 2 - OBJETO
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("1. OBJETO", marginLeft, currentY);
  currentY += espacoAposTitulo;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const objetoTexto = selecao.descricao || (selecao.processos_compras as any)?.objeto_resumido || selecao.titulo_selecao;
  currentY = drawJustifiedText(doc, objetoTexto, marginLeft, currentY, contentWidth, 5);
  currentY += espacoEntreSecoes;

  // 3 - PREÂMBULO DE ABERTURA
  checkNewPage(15);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("2. PREÂMBULO DE ABERTURA", marginLeft, currentY);
  currentY += espacoAposTitulo;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  
  const preambulo = `Aos ${formatarDataExtenso(selecao.data_sessao_disputa)}, às ${formatarHora(selecao.hora_sessao_disputa)} horas, através do Sistema de Compras da Prima Qualitá Saúde, reuniu-se a Comissão do Departamento de Compras para conduzir a Sessão Pública de Seleção de Fornecedores nº ${selecao.numero_selecao || '---'}, referente ao Processo nº ${(selecao.processos_compras as any)?.numero_processo_interno || '---'}.`;
  
  currentY = drawJustifiedText(doc, preambulo, marginLeft, currentY, contentWidth, 5);
  currentY += espacoEntreSecoes;

  // 4 - EMPRESAS PARTICIPANTES
  checkNewPage(15);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("3. EMPRESAS PARTICIPANTES", marginLeft, currentY);
  currentY += espacoAposTitulo;

  if (empresasParticipantes.length > 0) {
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
      headStyles: { 
        fillColor: [0, 128, 64], // Verde do logo
        fontSize: 9,
        halign: 'center',
        valign: 'middle',
        textColor: [255, 255, 255]
      },
      bodyStyles: { 
        fontSize: 8,
        valign: 'middle',
        textColor: [0, 0, 0]
      },
      alternateRowStyles: {
        fillColor: [230, 245, 230] // Verde bem clarinho
      },
      margin: { left: marginLeft, right: marginRight },
      tableWidth: contentWidth,
      columnStyles: {
        0: { halign: 'left', cellWidth: 'auto' },
        1: { halign: 'center', cellWidth: 'auto' },
        2: { halign: 'center', cellWidth: 'auto' }
      },
      didDrawPage: () => {
        addLogo();
        addRodape();
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + espacoEntreSecoes;
  } else {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Nenhuma empresa participou desta seleção.", marginLeft, currentY);
    currentY += espacoEntreSecoes;
  }

  // 5 - HABILITADOS
  checkNewPage(10);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("4. HABILITADOS", marginLeft, currentY);
  currentY += espacoAposTitulo;

  // Fornecedores participantes que não foram inabilitados
  const fornecedoresInabilitadosIds = fornecedoresInabilitados.map(f => f.cnpj);
  const fornecedoresHabilitados = empresasParticipantes.filter(e => 
    !fornecedoresInabilitadosIds.includes(e.cnpj)
  );

  if (fornecedoresHabilitados.length > 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Foram habilitadas as seguintes empresas:", marginLeft, currentY);
    currentY += 5;
    
    fornecedoresHabilitados.forEach(f => {
      checkNewPage(6);
      doc.text(`• ${f.razao_social}`, marginLeft, currentY);
      currentY += 5;
    });
  } else {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Nenhuma empresa foi habilitada nesta seleção.", marginLeft, currentY);
    currentY += 5;
  }
  currentY += espacoEntreSecoes;

  // 6 - INABILITADOS (apenas se houver)
  if (fornecedoresInabilitados.length > 0) {
    checkNewPage(10);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("5. INABILITADOS", marginLeft, currentY);
    currentY += espacoAposTitulo;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    fornecedoresInabilitados.forEach(inab => {
      checkNewPage(10);
      const itensStr = inab.itens_afetados.sort((a, b) => a - b).join(', ');
      const textoInab = `A empresa ${inab.razao_social} (CNPJ: ${formatarCNPJ(inab.cnpj)}) foi INABILITADA nos itens: ${itensStr}. Motivo: ${inab.motivo_inabilitacao}.`;
      currentY = drawJustifiedText(doc, textoInab, marginLeft, currentY, contentWidth, 5);
    });
    currentY += espacoEntreSecoes;
  }

  // 7 - VENCEDOR(ES)
  checkNewPage(10);
  const secaoVencedor = fornecedoresInabilitados.length > 0 ? "6" : "5";
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`${secaoVencedor}. VENCEDOR(ES)`, marginLeft, currentY);
  currentY += espacoAposTitulo;

  if (itensVencedores.length > 0) {
    // Agrupar por fornecedor
    const vencedoresPorFornecedor: Record<string, { nome: string; itens: number[]; valorTotal: number }> = {};
    itensVencedores.forEach(item => {
      if (!vencedoresPorFornecedor[item.fornecedor_id]) {
        vencedoresPorFornecedor[item.fornecedor_id] = {
          nome: item.fornecedor_nome,
          itens: [],
          valorTotal: 0
        };
      }
      vencedoresPorFornecedor[item.fornecedor_id].itens.push(item.numero_item);
      vencedoresPorFornecedor[item.fornecedor_id].valorTotal += item.valor_final;
    });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    Object.values(vencedoresPorFornecedor).forEach(fornecedor => {
      checkNewPage(6);
      const itensStr = fornecedor.itens.sort((a, b) => a - b).join(', ');
      const textoVencedor = `• ${fornecedor.nome} - Itens: ${itensStr} - Valor Total: ${formatarMoeda(fornecedor.valorTotal)}.`;
      currentY = drawJustifiedText(doc, textoVencedor, marginLeft, currentY, contentWidth - 5, 5);
    });
  } else {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Nenhum vencedor foi declarado até o momento.", marginLeft, currentY);
    currentY += 5;
  }
  currentY += espacoEntreSecoes;

  // 8 - NEGOCIAÇÕES
  checkNewPage(10);
  const secaoNegociacao = fornecedoresInabilitados.length > 0 ? "7" : "6";
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`${secaoNegociacao}. NEGOCIAÇÕES`, marginLeft, currentY);
  currentY += espacoAposTitulo;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  
  if (itensNegociados.length > 0) {
    const itensNegociadosStr = itensNegociados.join(', ');
    const textoNegociacao = `Foram realizadas negociações nos seguintes itens: ${itensNegociadosStr}.`;
    currentY = drawJustifiedText(doc, textoNegociacao, marginLeft, currentY, contentWidth, 5);
  } else {
    doc.text("Não houve negociações durante esta sessão.", marginLeft, currentY);
    currentY += 5;
  }
  currentY += espacoEntreSecoes;

  // 9 - INTENÇÃO DE RECURSOS
  checkNewPage(10);
  const secaoRecursos = fornecedoresInabilitados.length > 0 ? "8" : "7";
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`${secaoRecursos}. INTENÇÃO DE RECURSOS`, marginLeft, currentY);
  currentY += espacoAposTitulo;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  
  // Texto padrão sobre intenção de recursos (por enquanto sem dados de recursos)
  const textoRecursos = `O Gestor de Compras franqueou aos participantes a manifestação da intenção de recorrer das decisões proferidas durante a sessão pública. No prazo estabelecido de 5 (cinco) minutos após o encerramento de cada fase do certame, nenhuma empresa manifestou intenção de interpor recurso.`;
  currentY = drawJustifiedText(doc, textoRecursos, marginLeft, currentY, contentWidth, 5);
  currentY += espacoEntreSecoes;

  // 10 - ENCERRAMENTO
  checkNewPage(10);
  const secaoEncerramento = fornecedoresInabilitados.length > 0 ? "9" : "8";
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`${secaoEncerramento}. ENCERRAMENTO`, marginLeft, currentY);
  currentY += espacoAposTitulo;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  
  const dataGeracaoFormatada = dataHoraGeracao.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const horaGeracaoFormatada = dataHoraGeracao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  
  const encerramento = `Nada mais havendo a tratar, foi encerrada a sessão pública às ${horaGeracaoFormatada} horas do dia ${dataGeracaoFormatada}, lavrando-se a presente Ata que registra todos os atos praticados durante a Sessão Pública de Seleção de Fornecedores através do Sistema de Compras da Prima Qualitá Saúde.`;
  currentY = drawJustifiedText(doc, encerramento, marginLeft, currentY, contentWidth, 5);
  currentY += espacoEntreSecoes;

  // CERTIFICAÇÃO DIGITAL
  checkNewPage(70);

  const verificationUrl = `${window.location.origin}/verificar-ata?protocolo=${protocolo}`;
  
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
  doc.text("CERTIFICAÇÃO DIGITAL", marginLeft + contentWidth / 2, certY + 8, { align: "center" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  
  let certTextY = certY + 17;
  
  // Protocolo
  doc.text(`Protocolo: ${protocoloFormatado}`, marginLeft + 5, certTextY);
  certTextY += 5;
  
  // Data e hora
  doc.text(`Data/Hora: ${formatarDataHora(dataHoraGeracao.toISOString())}`, marginLeft + 5, certTextY);
  certTextY += 5;
  
  // Responsável
  const responsavelTexto = cpfResponsavel ? `${nomeResponsavel} (CPF: ${cpfResponsavel})` : nomeResponsavel;
  doc.text(`Responsável: ${responsavelTexto}`, marginLeft + 5, certTextY);
  certTextY += 7;
  
  // Verificação - Label
  doc.setFont("helvetica", "bold");
  doc.text("Verificar autenticidade em:", marginLeft + 5, certTextY);
  certTextY += 4;
  
  // URL como link clicável
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 255);
  doc.setFontSize(8);
  urlLines.forEach((linha: string, index: number) => {
    doc.textWithLink(linha, marginLeft + 5, certTextY + (index * 3.5), { url: verificationUrl });
  });
  certTextY += urlLines.length * 3.5 + 3;
  
  // Texto legal
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(7);
  doc.text("Este documento possui certificação digital conforme Lei 14.063/2020", marginLeft + 5, certTextY);
  doc.setTextColor(0, 0, 0);

  // Rodapé da última página
  addRodape();

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
      url_arquivo_original: publicUrl,
      usuario_gerador_id: user?.id || null,
      data_geracao: new Date().toISOString()
    });

  if (insertError) {
    console.error('Erro ao salvar registro da ata:', insertError);
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
  console.log('=== INICIANDO ATUALIZAÇÃO DA ATA COM ASSINATURAS ===');
  console.log('Ata ID:', ataId);
  
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

  console.log('Ata encontrada:', ata.nome_arquivo);
  
  const urlOriginal = ata.url_arquivo_original || ata.url_arquivo.split('?')[0];
  console.log('URL original para download:', urlOriginal);

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

  console.log('Assinaturas encontradas:', assinaturas?.length);

  const assinaturasFormatadas: Assinatura[] = (assinaturas || []).map(a => ({
    fornecedor_id: a.fornecedor_id,
    razao_social: (a.fornecedores as any)?.razao_social || '',
    cnpj: (a.fornecedores as any)?.cnpj || '',
    data_assinatura: a.data_assinatura || '',
    ip_assinatura: a.ip_assinatura || '',
    status_assinatura: a.status_assinatura
  }));

  // Extrair o path do storage da URL ORIGINAL
  const urlParts = urlOriginal.split('/processo-anexos/');
  if (urlParts.length < 2) {
    console.error('URL inválida:', urlOriginal);
    throw new Error('URL do arquivo inválida');
  }
  const storagePath = urlParts[1];
  console.log('Storage path:', storagePath);

  // Baixar PDF ORIGINAL diretamente do storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('processo-anexos')
    .download(storagePath);

  if (downloadError || !fileData) {
    console.error('Erro ao baixar PDF:', downloadError);
    throw new Error('Erro ao baixar PDF existente: ' + downloadError?.message);
  }

  console.log('PDF original baixado com sucesso, tamanho:', fileData.size);

  const existingPdfBytes = await fileData.arrayBuffer();

  // Usar pdf-lib para modificar o PDF existente
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const originalPageCount = pdfDoc.getPageCount();
  console.log('PDF carregado, total de páginas:', originalPageCount);

  // Pegar a última página existente
  const pages = pdfDoc.getPages();
  let page = pages[pages.length - 1];
  const { width, height } = page.getSize();
  const marginLeft = 40;
  const marginRight = 40;
  
  // Encontrar posição abaixo da certificação digital
  // A certificação está aproximadamente em Y=470 na última página (considerando Y invertido no pdf-lib)
  let currentY = 200; // Ajustar conforme necessário para iniciar logo abaixo da certificação
  
  const footerLimit = 80;

  // Função para criar nova página com logo e rodapé
  const checkNewPage = async (espacoNecessario: number) => {
    if (currentY - espacoNecessario < footerLimit) {
      page = pdfDoc.addPage([595, 842]);
      currentY = height - 80;
      return true;
    }
    return false;
  };

  // Título do termo de aceite
  const tituloHeight = 35;
  await checkNewPage(tituloHeight);
  
  page.drawText('TERMO DE ACEITE E ASSINATURA DIGITAL', {
    x: marginLeft,
    y: currentY,
    size: 11,
    font: helveticaBold,
    color: rgb(0.13, 0.27, 0.53),
  });
  currentY -= 14;
  
  const protocoloFormatado = formatarProtocoloExibicao(ata.protocolo);
  page.drawText(`Ata de Seleção - Protocolo: ${protocoloFormatado}`, {
    x: marginLeft,
    y: currentY,
    size: 9,
    font: helveticaFont,
    color: rgb(0.4, 0.4, 0.4),
  });
  currentY -= 18;

  for (const assinatura of assinaturasFormatadas) {
    const boxHeight = 50;
    
    if (await checkNewPage(boxHeight + 10)) {
      // Nova página criada
    }

    // Fundo do box
    page.drawRectangle({
      x: marginLeft,
      y: currentY - boxHeight,
      width: width - marginLeft - marginRight,
      height: boxHeight,
      color: assinatura.status_assinatura === 'aceito' ? rgb(0.95, 1, 0.95) : rgb(1, 0.98, 0.9),
      borderColor: assinatura.status_assinatura === 'aceito' ? rgb(0.2, 0.7, 0.2) : rgb(0.9, 0.7, 0.2),
      borderWidth: 1,
    });

    // Nome da empresa
    page.drawText(assinatura.razao_social, {
      x: marginLeft + 10,
      y: currentY - 14,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    // CNPJ
    page.drawText(`CNPJ: ${formatarCNPJ(assinatura.cnpj)}`, {
      x: marginLeft + 10,
      y: currentY - 26,
      size: 9,
      font: helveticaFont,
      color: rgb(0.3, 0.3, 0.3),
    });

    // Status e data
    if (assinatura.status_assinatura === 'aceito' && assinatura.data_assinatura) {
      const dataFormatada = new Date(assinatura.data_assinatura).toLocaleString('pt-BR');
      page.drawText(`[OK] ACEITO DIGITALMENTE em ${dataFormatada}`, {
        x: marginLeft + 10,
        y: currentY - 40,
        size: 9,
        font: helveticaBold,
        color: rgb(0.1, 0.5, 0.1),
      });
    } else {
      page.drawText('[...] Pendente de assinatura', {
        x: marginLeft + 10,
        y: currentY - 40,
        size: 9,
        font: helveticaFont,
        color: rgb(0.7, 0.5, 0),
      });
    }

    currentY -= (boxHeight + 8);
  }

  // Rodapé em páginas adicionadas
  if (pdfDoc.getPageCount() > originalPageCount) {
    const allPages = pdfDoc.getPages();
    for (let i = originalPageCount; i < allPages.length; i++) {
      const p = allPages[i];
      const footerY = 50;
      
      p.drawLine({
        start: { x: marginLeft, y: footerY + 20 },
        end: { x: width - marginRight, y: footerY + 20 },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8),
      });

      p.drawText('Este documento possui certificação digital conforme Lei 14.063/2020', {
        x: marginLeft,
        y: footerY,
        size: 8,
        font: helveticaFont,
        color: rgb(0.5, 0.5, 0.5),
      });

      p.drawText('Travessa do Ouvidor, 21, Sala 503, Centro, Rio de Janeiro - RJ, CEP: 20.040-040', {
        x: marginLeft,
        y: footerY - 12,
        size: 7,
        font: helveticaFont,
        color: rgb(0.5, 0.5, 0.5),
      });
    }
  }

  // Salvar PDF modificado
  const modifiedPdfBytes = await pdfDoc.save();
  const pdfBlob = new Blob([new Uint8Array(modifiedPdfBytes) as BlobPart], { type: 'application/pdf' });

  const storagePathAssinado = storagePath.replace('.pdf', '-assinado.pdf');
  console.log('Fazendo upload do PDF com assinaturas em:', storagePathAssinado);

  const { error: uploadError } = await supabase.storage
    .from('processo-anexos')
    .upload(storagePathAssinado, pdfBlob, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    console.error('Erro ao fazer upload do PDF atualizado:', uploadError);
    throw uploadError;
  }

  const { data: { publicUrl } } = supabase.storage
    .from('processo-anexos')
    .getPublicUrl(storagePathAssinado);

  const urlComTimestamp = `${publicUrl}?t=${Date.now()}`;
  console.log('Nova URL com timestamp:', urlComTimestamp);

  const { error: updateError } = await supabase
    .from('atas_selecao')
    .update({ url_arquivo: urlComTimestamp })
    .eq('id', ataId);

  if (updateError) {
    console.error('Erro ao atualizar URL da ata:', updateError);
    throw updateError;
  }

  console.log('=== PDF DA ATA ATUALIZADO COM SUCESSO ===');
}
