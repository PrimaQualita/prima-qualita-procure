import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';
import logoImg from '@/assets/capa-processo-logo.png';
import rodapeImg from '@/assets/capa-processo-rodape.png';
import logoExpandido from '@/assets/logo-recurso.png';
import rodapeExpandido from '@/assets/rodape-recurso.png';

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
  fornecedor_cnpj: string;
  valor_final: number;
}

interface MensagemChat {
  created_at: string;
  mensagem: string;
  tipo_usuario: string;
  fornecedor_nome: string | null;
  usuario_nome: string | null;
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

interface IntencaoRecurso {
  razao_social: string;
  cnpj: string;
  deseja_recorrer: boolean;
  motivo_intencao: string | null;
  data_intencao: string;
}

interface RecursoInabilitacao {
  razao_social: string;
  cnpj: string;
  motivo_recurso: string;
  status_recurso: string;
  resposta_gestor: string | null;
  tipo_provimento: string | null;
}

const formatarProtocoloExibicao = (uuid: string): string => {
  const limpo = uuid.replace(/-/g, '').toUpperCase().substring(0, 16);
  return `${limpo.substring(0, 4)}-${limpo.substring(4, 8)}-${limpo.substring(8, 12)}-${limpo.substring(12, 16)}`;
};

const formatarCNPJ = (cnpj: string): string => {
  const numeros = cnpj.replace(/\D/g, '');
  return numeros.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};

const formatarCPF = (cpf: string): string => {
  const numeros = cpf.replace(/\D/g, '');
  return numeros.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
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

const formatarDataHoraCurta = (dataStr: string): string => {
  const data = new Date(dataStr);
  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Função para desenhar texto justificado com espaçamento padrão
const drawJustifiedText = (doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight: number = 5.5): number => {
  const lines = doc.splitTextToSize(text, maxWidth);
  let currentY = y;
  
  lines.forEach((line: string, index: number) => {
    const isLastLine = index === lines.length - 1;
    const words = line.trim().split(/\s+/);
    
    if (isLastLine || words.length <= 1) {
      doc.text(line, x, currentY);
    } else {
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

  const criterioJulgamento = selecao?.criterios_julgamento || 'menor_preco_item';

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
    email: ((p.fornecedores as any)?.email || '').toLowerCase(),
    fornecedor_id: p.fornecedor_id
  }));

  // Buscar itens e identificar vencedores usando a MESMA lógica da sessão de lances
  // IMPORTANTE: Não usar indicativo_lance_vencedor, usar ordenação customizada
  const { data: todosLancesData, error: lancesError } = await supabase
    .from('lances_fornecedores')
    .select(`
      numero_item,
      valor_lance,
      fornecedor_id,
      tipo_lance,
      fornecedores (
        razao_social,
        cnpj
      )
    `)
    .eq('selecao_id', selecaoId);

  if (lancesError) {
    throw new Error('Erro ao buscar lances');
  }

  // Buscar inabilitações para filtrar
  const { data: inabilitacoesData } = await supabase
    .from('fornecedores_inabilitados_selecao')
    .select('fornecedor_id, itens_afetados, revertido')
    .eq('selecao_id', selecaoId);

  // Criar mapa de itens inabilitados por fornecedor
  const inabilitacoesPorFornecedor = new Map<string, number[]>();
  (inabilitacoesData || []).forEach((inab) => {
    if (!inab.revertido) {
      inabilitacoesPorFornecedor.set(inab.fornecedor_id, inab.itens_afetados || []);
    }
  });

  // Filtrar lances onde o fornecedor está inabilitado PARA AQUELE ITEM ESPECÍFICO
  const lancesFiltrados = (todosLancesData || []).filter((lance) => {
    const itensInabilitados = inabilitacoesPorFornecedor.get(lance.fornecedor_id);
    if (!itensInabilitados) return true; // Não está inabilitado
    return !itensInabilitados.includes(lance.numero_item || 0); // Verificar se o item específico está inabilitado
  });

  // ORDENAÇÃO CUSTOMIZADA: Priorizar lances de negociação
  const isDesconto = criterioJulgamento === 'desconto';
  
  const lancesOrdenados = lancesFiltrados.sort((a, b) => {
    // Primeiro ordenar por número do item
    if ((a.numero_item || 0) !== (b.numero_item || 0)) {
      return (a.numero_item || 0) - (b.numero_item || 0);
    }
    
    // Dentro do mesmo item, priorizar lances de negociação
    const aIsNegociacao = a.tipo_lance === 'negociacao';
    const bIsNegociacao = b.tipo_lance === 'negociacao';
    
    if (aIsNegociacao && !bIsNegociacao) return -1; // a vem antes
    if (!aIsNegociacao && bIsNegociacao) return 1;  // b vem antes
    
    // Se ambos são negociação ou ambos não são, ordenar por valor
    // Desconto: maior é melhor (ordem decrescente)
    // Preço: menor é melhor (ordem crescente)
    if (isDesconto) {
      return b.valor_lance - a.valor_lance; // Maior desconto primeiro
    } else {
      return a.valor_lance - b.valor_lance; // Menor preço primeiro
    }
  });

  // Identificar vencedores: primeiro lance de cada item
  const vencedoresPorItem = new Map<number, any>();
  lancesOrdenados.forEach(lance => {
    if (!vencedoresPorItem.has(lance.numero_item || 0)) {
      vencedoresPorItem.set(lance.numero_item || 0, lance);
    }
  });

  const lancesVencedores = Array.from(vencedoresPorItem.values());

  // Buscar TODOS os lances ordenados por valor para determinar segundo colocado
  const todosLances = lancesOrdenados;

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

  // Calcular valor final baseado no critério
  const itensVencedores: ItemVencedor[] = (lancesVencedores || []).map(lance => {
    const quantidade = itensQuantidades[lance.numero_item || 0] || 1;
    const valorUnitario = lance.valor_lance;
    
    // Para desconto, não multiplicar pela quantidade (desconto é percentual)
    // Para preço, multiplicar pela quantidade para obter valor total
    const valorTotal = criterioJulgamento === 'desconto' ? valorUnitario : valorUnitario * quantidade;
    
    return {
      numero_item: lance.numero_item || 0,
      descricao: itensDescricoes[lance.numero_item || 0] || `Item ${lance.numero_item}`,
      fornecedor_id: lance.fornecedor_id,
      fornecedor_nome: (lance.fornecedores as any)?.razao_social || '',
      fornecedor_cnpj: (lance.fornecedores as any)?.cnpj || '',
      valor_final: valorTotal
    };
  });

  // Agrupar todos os lances por item para encontrar segundo colocado quando necessário
  const lancesPorItem: Record<number, Array<{ fornecedor_id: string; fornecedor_nome: string; fornecedor_cnpj: string; valor_lance: number }>> = {};
  (todosLances || []).forEach(lance => {
    const item = lance.numero_item || 0;
    if (!lancesPorItem[item]) {
      lancesPorItem[item] = [];
    }
    lancesPorItem[item].push({
      fornecedor_id: lance.fornecedor_id,
      fornecedor_nome: (lance.fornecedores as any)?.razao_social || '',
      fornecedor_cnpj: (lance.fornecedores as any)?.cnpj || '',
      valor_lance: lance.valor_lance
    });
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

  // Buscar intenções de recurso
  const { data: intencoes } = await supabase
    .from('intencoes_recurso_selecao')
    .select(`
      deseja_recorrer,
      motivo_intencao,
      data_intencao,
      fornecedores (
        razao_social,
        cnpj
      )
    `)
    .eq('selecao_id', selecaoId)
    .order('data_intencao', { ascending: true });

  const intencoesRecurso: IntencaoRecurso[] = (intencoes || []).map((i: any) => ({
    razao_social: i.fornecedores?.razao_social || '',
    cnpj: i.fornecedores?.cnpj || '',
    deseja_recorrer: i.deseja_recorrer,
    motivo_intencao: i.motivo_intencao,
    data_intencao: i.data_intencao
  }));

  // Buscar recursos de inabilitação e seus resultados
  const { data: recursos } = await supabase
    .from('recursos_inabilitacao_selecao')
    .select(`
      motivo_recurso,
      status_recurso,
      resposta_gestor,
      tipo_provimento,
      fornecedores (
        razao_social,
        cnpj
      )
    `)
    .eq('selecao_id', selecaoId)
    .order('created_at', { ascending: true });

  const recursosInabilitacao: RecursoInabilitacao[] = (recursos || []).map((r: any) => ({
    razao_social: r.fornecedores?.razao_social || '',
    cnpj: r.fornecedores?.cnpj || '',
    motivo_recurso: r.motivo_recurso,
    status_recurso: r.status_recurso,
    resposta_gestor: r.resposta_gestor,
    tipo_provimento: r.tipo_provimento
  }));

  // Buscar mensagens do chat da seleção
  const { data: chatMensagens } = await supabase
    .from('mensagens_selecao')
    .select(`
      created_at,
      mensagem,
      tipo_usuario,
      fornecedor_id,
      usuario_id,
      fornecedores (
        razao_social
      )
    `)
    .eq('selecao_id', selecaoId)
    .order('created_at', { ascending: true });

  // Buscar nomes de usuários para o chat
  let usuariosMap: Record<string, string> = {};
  if (chatMensagens) {
    const usuarioIds = chatMensagens.filter(m => m.usuario_id).map(m => m.usuario_id!);
    if (usuarioIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, nome_completo')
        .in('id', usuarioIds);
      if (profiles) {
        profiles.forEach(p => {
          usuariosMap[p.id] = p.nome_completo;
        });
      }
    }
  }

  const mensagensChat: MensagemChat[] = (chatMensagens || []).map(m => ({
    created_at: m.created_at,
    mensagem: m.mensagem,
    tipo_usuario: m.tipo_usuario,
    fornecedor_nome: (m.fornecedores as any)?.razao_social || null,
    usuario_nome: m.usuario_id ? usuariosMap[m.usuario_id] || 'Gestor' : null
  }));

  // Buscar data/hora de início
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
  
  // Margens de 1.5mm convertido para pontos (1mm = 2.83465pt, então 1.5mm ≈ 4.25pt)
  const sideMargin = 1.5 * 2.83465; // ~4.25pt = 1.5mm
  const marginLeft = 15;
  const marginRight = 15;
  const contentWidth = pageWidth - marginLeft - marginRight;
  
  const protocolo = uuidv4();
  const protocoloFormatado = formatarProtocoloExibicao(protocolo);
  const dataHoraGeracao = new Date();

  // Dimensões do logo e rodapé - igual à planilha de lances
  const logoHeight = 40;
  const rodapeHeight = 25;
  const contentStartY = logoHeight + 10;
  const contentEndY = pageHeight - rodapeHeight - 8;
  
  let currentY = contentStartY;

  // Função para adicionar logo com margem de 1.5mm (igual planilha de lances)
  const addLogo = () => {
    doc.addImage(logoBase64, 'PNG', sideMargin, 0, pageWidth - (sideMargin * 2), logoHeight);
  };

  // Função para adicionar rodapé com margem de 1.5mm (igual planilha de lances)
  const addRodape = () => {
    doc.addImage(rodapeBase64, 'PNG', sideMargin, pageHeight - rodapeHeight, pageWidth - (sideMargin * 2), rodapeHeight);
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
  const espacoEntreSecoes = 8;
  const espacoAposTitulo = 8;
  const lineHeight = 5.5;
  let secaoNumero = 1;

  // ============= 1 - TÍTULO =============
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(`ATA DA SESSÃO PÚBLICA DA SELEÇÃO DE FORNECEDORES Nº ${selecao.numero_selecao || '---'}`, pageWidth / 2, currentY, { align: "center" });
  currentY += 10;

  // ============= 2 - OBJETO =============
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`${secaoNumero}. OBJETO`, marginLeft, currentY);
  secaoNumero++;
  currentY += espacoAposTitulo;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  // Limpar tags HTML do objeto
  let objetoTexto = (selecao.processos_compras as any)?.objeto_resumido || selecao.descricao || selecao.titulo_selecao;
  objetoTexto = objetoTexto.replace(/<[^>]*>/g, '').trim(); // Remove todas as tags HTML
  currentY = drawJustifiedText(doc, objetoTexto, marginLeft, currentY, contentWidth, lineHeight);
  currentY += espacoEntreSecoes;

  // ============= 3 - PREÂMBULO DE ABERTURA =============
  checkNewPage(15);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`${secaoNumero}. PREÂMBULO DE ABERTURA`, marginLeft, currentY);
  secaoNumero++;
  currentY += espacoAposTitulo;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  
  const preambulo = `Aos ${formatarDataExtenso(selecao.data_sessao_disputa)}, às ${formatarHora(selecao.hora_sessao_disputa)} horas, através do Sistema de Compras da Prima Qualitá Saúde, reuniu-se a Comissão do Departamento de Compras para conduzir a Sessão Pública de Seleção de Fornecedores nº ${selecao.numero_selecao || '---'}, referente ao Processo nº ${(selecao.processos_compras as any)?.numero_processo_interno || '---'}.`;
  
  currentY = drawJustifiedText(doc, preambulo, marginLeft, currentY, contentWidth, lineHeight);
  currentY += espacoEntreSecoes;

  // ============= 4 - EMPRESAS PARTICIPANTES =============
  checkNewPage(15);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`${secaoNumero}. EMPRESAS PARTICIPANTES`, marginLeft, currentY);
  secaoNumero++;
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
        fillColor: [0, 128, 128],
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
        fillColor: [224, 242, 241]
      },
      margin: { left: marginLeft, right: marginRight },
      tableWidth: contentWidth,
      columnStyles: {
        0: { halign: 'left', cellWidth: 'auto' },
        1: { halign: 'center', cellWidth: 50 },
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

  // ============= 5 - VENCEDORES NOS LANCES (antes da habilitação) =============
  checkNewPage(10);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`${secaoNumero}. VENCEDORES NOS LANCES`, marginLeft, currentY);
  secaoNumero++;
  currentY += espacoAposTitulo;

  if (itensVencedores.length > 0) {
    // Agrupar por fornecedor
    const vencedoresPorFornecedor: Record<string, { nome: string; itens: number[]; valorTotal: number; quantidadeItens: number }> = {};
    itensVencedores.forEach(item => {
      if (!vencedoresPorFornecedor[item.fornecedor_id]) {
        vencedoresPorFornecedor[item.fornecedor_id] = {
          nome: item.fornecedor_nome,
          itens: [],
          valorTotal: 0,
          quantidadeItens: 0
        };
      }
      vencedoresPorFornecedor[item.fornecedor_id].itens.push(item.numero_item);
      vencedoresPorFornecedor[item.fornecedor_id].valorTotal += item.valor_final;
      vencedoresPorFornecedor[item.fornecedor_id].quantidadeItens += 1;
    });

    const ehDesconto = criterioJulgamento === 'desconto';
    
    const tabelaVencedoresLances = Object.values(vencedoresPorFornecedor).map(f => {
      const valor = ehDesconto ? (f.valorTotal / f.quantidadeItens) : f.valorTotal;
      return [
        f.nome,
        f.itens.sort((a, b) => a - b).join(', '),
        ehDesconto ? `${valor.toFixed(2)}%` : formatarMoeda(valor)
      ];
    });

    const colunaValorHeader = ehDesconto ? 'DESCONTO VENCEDOR' : 'VALOR TOTAL';

    autoTable(doc, {
      startY: currentY,
      head: [['FORNECEDOR', 'ITENS', colunaValorHeader]],
      body: tabelaVencedoresLances,
      theme: 'grid',
      headStyles: { 
        fillColor: [0, 128, 128],
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
        fillColor: [224, 242, 241]
      },
      margin: { left: marginLeft, right: marginRight },
      tableWidth: contentWidth,
      columnStyles: {
        0: { halign: 'left', cellWidth: 'auto' },
        1: { halign: 'center', cellWidth: 50 },
        2: { halign: 'right', cellWidth: 40 }
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
    doc.text("Nenhum lance vencedor foi registrado até o momento.", marginLeft, currentY);
    currentY += lineHeight + espacoEntreSecoes;
  }

  // ============= 6 - HABILITAÇÃO =============
  checkNewPage(10);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`${secaoNumero}. HABILITAÇÃO`, marginLeft, currentY);
  secaoNumero++;
  currentY += espacoAposTitulo;

  // 6.1 - HABILITADOS
  const fornecedoresInabilitadosIds = fornecedoresInabilitados.map(f => f.cnpj);
  const fornecedoresHabilitados = empresasParticipantes.filter(e => 
    !fornecedoresInabilitadosIds.includes(e.cnpj)
  );

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`${secaoNumero - 1}.1 HABILITADOS`, marginLeft, currentY);
  currentY += espacoAposTitulo;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  if (fornecedoresHabilitados.length > 0) {
    currentY = drawJustifiedText(doc, "Foram habilitadas as seguintes empresas:", marginLeft, currentY, contentWidth, lineHeight);
    currentY += 2; // Pequeno espaço antes da lista
    
    fornecedoresHabilitados.forEach(f => {
      checkNewPage(lineHeight);
      currentY = drawJustifiedText(doc, `• ${f.razao_social}`, marginLeft + 5, currentY, contentWidth - 5, lineHeight);
    });
  } else {
    currentY = drawJustifiedText(doc, "Nenhuma empresa foi habilitada nesta seleção.", marginLeft, currentY, contentWidth, lineHeight);
  }
  currentY += espacoEntreSecoes;

  // 6.2 - INABILITADOS (apenas se houver)
  if (fornecedoresInabilitados.length > 0) {
    checkNewPage(10);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`${secaoNumero - 1}.2 INABILITADOS`, marginLeft, currentY);
    currentY += espacoAposTitulo;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    fornecedoresInabilitados.forEach(inab => {
      checkNewPage(10);
      const itensStr = inab.itens_afetados.sort((a, b) => a - b).join(', ');
      const qtdItens = inab.itens_afetados.length;
      const textoItem = qtdItens === 1 ? 'no item' : 'nos itens';
      const textoInab = `A empresa ${inab.razao_social} (CNPJ: ${formatarCNPJ(inab.cnpj)}) foi INABILITADA ${textoItem}: ${itensStr}. Motivo: ${inab.motivo_inabilitacao}.`;
      currentY = drawJustifiedText(doc, textoInab, marginLeft, currentY, contentWidth, lineHeight);
    });
  }
  currentY += espacoEntreSecoes;

  // ============= 7 - VENCEDOR(ES) APÓS HABILITAÇÃO =============
  checkNewPage(10);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`${secaoNumero}. VENCEDOR(ES)`, marginLeft, currentY);
  secaoNumero++;
  currentY += espacoAposTitulo;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Após a análise de habilitação, foram declarados vencedores:", marginLeft, currentY);
  currentY += espacoAposTitulo;

  if (itensVencedores.length > 0) {
    // Agrupar por fornecedor (considerando habilitados e substituindo por segundo colocado quando inabilitado)
    const vencedoresFinal: Record<string, { nome: string; itens: number[]; valorTotal: number; quantidadeItens: number }> = {};
    
    itensVencedores.forEach(item => {
      // Verificar se o fornecedor está inabilitado neste item
      const fornecedorInab = fornecedoresInabilitados.find(f => 
        f.cnpj === item.fornecedor_cnpj && f.itens_afetados.includes(item.numero_item)
      );
      
      if (fornecedorInab) {
        // Fornecedor inabilitado - buscar segundo colocado
        const lancesDoItem = lancesPorItem[item.numero_item] || [];
        // Encontrar o primeiro fornecedor não inabilitado neste item
        const segundoColocado = lancesDoItem.find(lance => {
          const estaInabilitado = fornecedoresInabilitados.some(f => 
            f.cnpj === lance.fornecedor_cnpj && f.itens_afetados.includes(item.numero_item)
          );
          return !estaInabilitado && lance.fornecedor_id !== item.fornecedor_id;
        });
        
        if (segundoColocado) {
          const quantidade = itensQuantidades[item.numero_item] || 1;
          // Para desconto, não multiplicar pela quantidade (desconto é percentual)
          const valorTotal = criterioJulgamento === 'desconto' 
            ? segundoColocado.valor_lance 
            : segundoColocado.valor_lance * quantidade;
          
          if (!vencedoresFinal[segundoColocado.fornecedor_id]) {
            vencedoresFinal[segundoColocado.fornecedor_id] = {
              nome: segundoColocado.fornecedor_nome,
              itens: [],
              valorTotal: 0,
              quantidadeItens: 0
            };
          }
          vencedoresFinal[segundoColocado.fornecedor_id].itens.push(item.numero_item);
          vencedoresFinal[segundoColocado.fornecedor_id].valorTotal += valorTotal;
          vencedoresFinal[segundoColocado.fornecedor_id].quantidadeItens += 1;
        }
      } else {
        // Fornecedor habilitado - manter como vencedor
        if (!vencedoresFinal[item.fornecedor_id]) {
          vencedoresFinal[item.fornecedor_id] = {
            nome: item.fornecedor_nome,
            itens: [],
            valorTotal: 0,
            quantidadeItens: 0
          };
        }
        vencedoresFinal[item.fornecedor_id].itens.push(item.numero_item);
        vencedoresFinal[item.fornecedor_id].valorTotal += item.valor_final;
        vencedoresFinal[item.fornecedor_id].quantidadeItens += 1;
      }
    });

    if (Object.keys(vencedoresFinal).length > 0) {
      const ehDesconto = criterioJulgamento === 'desconto';
      
      const tabelaVencedores = Object.values(vencedoresFinal).map(f => {
        const valor = ehDesconto ? (f.valorTotal / f.quantidadeItens) : f.valorTotal;
        return [
          f.nome,
          f.itens.sort((a, b) => a - b).join(', '),
          ehDesconto ? `${valor.toFixed(2)}%` : formatarMoeda(valor)
        ];
      });

      const colunaValorHeader = ehDesconto ? 'DESCONTO VENCEDOR' : 'VALOR TOTAL';

      autoTable(doc, {
        startY: currentY,
        head: [['FORNECEDOR', 'ITENS', colunaValorHeader]],
        body: tabelaVencedores,
        theme: 'grid',
        headStyles: { 
          fillColor: [0, 128, 128],
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
          fillColor: [224, 242, 241]
        },
        margin: { left: marginLeft, right: marginRight },
        tableWidth: contentWidth,
        columnStyles: {
          0: { halign: 'left', cellWidth: 'auto' },
          1: { halign: 'center', cellWidth: 50 },
          2: { halign: 'right', cellWidth: 40 }
        },
        didDrawPage: () => {
          addLogo();
          addRodape();
        }
      });

      currentY = (doc as any).lastAutoTable.finalY + espacoEntreSecoes;
    } else {
      doc.text("Nenhum vencedor foi declarado após análise de habilitação.", marginLeft, currentY);
      currentY += lineHeight + espacoEntreSecoes;
    }
  } else {
    doc.text("Nenhum vencedor foi declarado até o momento.", marginLeft, currentY);
    currentY += lineHeight + espacoEntreSecoes;
  }

  // ============= 8 - NEGOCIAÇÕES =============
  checkNewPage(10);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`${secaoNumero}. NEGOCIAÇÕES`, marginLeft, currentY);
  secaoNumero++;
  currentY += espacoAposTitulo;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  
  if (itensNegociados.length > 0) {
    const itensNegociadosStr = itensNegociados.join(', ');
    const textoNegociacao = `Foram realizadas negociações nos seguintes itens: ${itensNegociadosStr}.`;
    currentY = drawJustifiedText(doc, textoNegociacao, marginLeft, currentY, contentWidth, lineHeight);
  } else {
    currentY = drawJustifiedText(doc, "Não houve negociações durante esta sessão.", marginLeft, currentY, contentWidth, lineHeight);
  }
  currentY += espacoEntreSecoes;

  // ============= 9 - INTENÇÃO DE RECURSOS =============
  checkNewPage(10);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`${secaoNumero}. INTENÇÃO DE RECURSOS`, marginLeft, currentY);
  secaoNumero++;
  currentY += espacoAposTitulo;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  
  const empresasQueRecorreram = intencoesRecurso.filter(i => i.deseja_recorrer);
  const empresasQueNaoRecorreram = intencoesRecurso.filter(i => !i.deseja_recorrer);
  
  // Identificar empresas que NÃO se manifestaram (não têm registro em intencoesRecurso)
  const cnpjsComIntencao = new Set(intencoesRecurso.map(i => i.cnpj));
  const empresasQueNaoSeManifestaram = empresasParticipantes.filter(e => !cnpjsComIntencao.has(e.cnpj));

  const totalParticipantes = empresasParticipantes.length;

  if (intencoesRecurso.length === 0 && empresasQueNaoSeManifestaram.length === totalParticipantes) {
    const textoRecursos = `O Gestor de Compras franqueou aos participantes a manifestação da intenção de recorrer das decisões proferidas durante a sessão pública. No prazo estabelecido de 5 (cinco) minutos, nenhuma empresa manifestou intenção de interpor recurso.`;
    currentY = drawJustifiedText(doc, textoRecursos, marginLeft, currentY, contentWidth, lineHeight);
  } else {
    const textoAbertura = `O Gestor de Compras franqueou aos participantes a manifestação da intenção de recorrer das decisões proferidas durante a sessão pública. No prazo estabelecido de 5 (cinco) minutos, as empresas se manifestaram da seguinte forma:`;
    currentY = drawJustifiedText(doc, textoAbertura, marginLeft, currentY, contentWidth, lineHeight);

    // Empresas que não desejam recorrer (responderam NÃO)
    if (empresasQueNaoRecorreram.length > 0) {
      currentY += 4; // Espaço extra antes do subtítulo
      checkNewPage(15);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 128, 0); // Verde
      currentY = drawJustifiedText(doc, "Não Recorrerá:", marginLeft, currentY, contentWidth, lineHeight);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");

      empresasQueNaoRecorreram.forEach((e, index) => {
        checkNewPage(10);
        const textoCompleto = `${e.razao_social} (CNPJ: ${formatarCNPJ(e.cnpj)}) - Registrado em: ${formatarDataHoraCurta(e.data_intencao)}`;
        currentY = drawJustifiedText(doc, textoCompleto, marginLeft, currentY, contentWidth, lineHeight);
      });
    }

    // Empresas que NÃO se manifestaram no prazo (não têm registro em intencoesRecurso)
    if (empresasQueNaoSeManifestaram.length > 0) {
      currentY += 4; // Espaço extra antes do subtítulo
      checkNewPage(15);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(128, 128, 128); // Cinza
      currentY = drawJustifiedText(doc, "Não se Manifestou no Prazo:", marginLeft, currentY, contentWidth, lineHeight);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");

      empresasQueNaoSeManifestaram.forEach((e, index) => {
        checkNewPage(10);
        const textoCompleto = `${e.razao_social} (CNPJ: ${formatarCNPJ(e.cnpj)}) - Por não ter se manifestado no prazo estabelecido, foi considerado que não possui intenção de interpor recurso.`;
        currentY = drawJustifiedText(doc, textoCompleto, marginLeft, currentY, contentWidth, lineHeight);
      });
    }

    // Empresas que desejam recorrer (mostrar por último para destacar)
    if (empresasQueRecorreram.length > 0) {
      currentY += 4; // Espaço extra antes do subtítulo
      checkNewPage(15);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(220, 120, 0); // Laranja
      currentY = drawJustifiedText(doc, "Deseja Recorrer:", marginLeft, currentY, contentWidth, lineHeight);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");

      empresasQueRecorreram.forEach(e => {
        checkNewPage(15);
        let textoCompleto = `${e.razao_social} (CNPJ: ${formatarCNPJ(e.cnpj)}) - Registrado em: ${formatarDataHoraCurta(e.data_intencao)}`;
        if (e.motivo_intencao) {
          textoCompleto += ` - Motivo: ${e.motivo_intencao}`;
        }
        currentY = drawJustifiedText(doc, textoCompleto, marginLeft, currentY, contentWidth, lineHeight);
      });
    }
  }
  currentY += espacoEntreSecoes;

  // ============= 10 - RESULTADO DO RECURSO =============
  if (recursosInabilitacao.length > 0) {
    checkNewPage(10);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`${secaoNumero}. RESULTADO DO RECURSO`, marginLeft, currentY);
    secaoNumero++;
    currentY += espacoAposTitulo;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    recursosInabilitacao.forEach(r => {
      checkNewPage(15);
      
      // Status do recurso
      let statusTexto = '';
      if (r.status_recurso === 'deferido') {
        statusTexto = 'DEFERIDO';
      } else if (r.status_recurso === 'deferido_parcial') {
        statusTexto = 'DEFERIDO PARCIALMENTE';
      } else if (r.status_recurso === 'indeferido') {
        statusTexto = 'INDEFERIDO';
      } else {
        statusTexto = r.status_recurso?.toUpperCase() || 'PENDENTE';
      }
      
      const textoResultado = `O recurso apresentado pela empresa ${r.razao_social} (CNPJ: ${formatarCNPJ(r.cnpj)}) foi ${statusTexto}.`;
      currentY = drawJustifiedText(doc, textoResultado, marginLeft, currentY, contentWidth, lineHeight);
      currentY += 3;
    });
    currentY += espacoEntreSecoes;
  }

  // ============= 11 - REGISTROS DO CHAT =============
  if (mensagensChat.length > 0) {
    checkNewPage(15);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`${secaoNumero}. REGISTROS DO CHAT`, marginLeft, currentY);
    secaoNumero++;
    currentY += espacoAposTitulo;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    currentY = drawJustifiedText(doc, "Mensagens trocadas durante a sessão pública:", marginLeft, currentY, contentWidth, lineHeight);

    mensagensChat.forEach((msg, index) => {
      checkNewPage(20);
      
      // Determinar remetente
      let remetente = '';
      let corFundo: [number, number, number] = [255, 255, 255];
      
      if (msg.tipo_usuario === 'fornecedor') {
        remetente = msg.fornecedor_nome || 'Fornecedor';
        corFundo = [240, 248, 255]; // Azul claro
      } else {
        remetente = msg.usuario_nome || 'Gestor';
        corFundo = [240, 255, 240]; // Verde claro
      }

      const dataHora = formatarDataHoraCurta(msg.created_at);
      const mensagemLines = doc.splitTextToSize(msg.mensagem, contentWidth - 15);
      const alturaBox = 10 + (mensagemLines.length * 3.5);

      // Fundo da mensagem
      doc.setFillColor(corFundo[0], corFundo[1], corFundo[2]);
      doc.roundedRect(marginLeft, currentY - 2, contentWidth, alturaBox, 2, 2, 'F');
      
      // Borda
      doc.setDrawColor(200, 200, 200);
      doc.roundedRect(marginLeft, currentY - 2, contentWidth, alturaBox, 2, 2, 'S');

      // Remetente e hora
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(remetente, marginLeft + 4, currentY + 2);
      
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text(dataHora, marginLeft + contentWidth - 4 - doc.getTextWidth(dataHora), currentY + 2);
      doc.setTextColor(0, 0, 0);
      
      // Mensagem
      doc.setFontSize(8);
      let msgY = currentY + 6;
      mensagemLines.forEach((line: string) => {
        doc.text(line, marginLeft + 4, msgY);
        msgY += 3.5;
      });

      currentY += alturaBox + 2;
    });
    currentY += espacoEntreSecoes;
  }

  // ============= 12 - ENCERRAMENTO =============
  checkNewPage(10);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`${secaoNumero}. ENCERRAMENTO`, marginLeft, currentY);
  secaoNumero++;
  currentY += espacoAposTitulo;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  
  const dataGeracaoFormatada = dataHoraGeracao.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const horaGeracaoFormatada = dataHoraGeracao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  
  const encerramento = `Nada mais havendo a tratar, foi encerrada a sessão pública às ${horaGeracaoFormatada} horas do dia ${dataGeracaoFormatada}, lavrando-se a presente Ata que registra todos os atos praticados durante a Sessão Pública de Seleção de Fornecedores através do Sistema de Compras da Prima Qualitá Saúde.`;
  currentY = drawJustifiedText(doc, encerramento, marginLeft, currentY, contentWidth, lineHeight);
  currentY += espacoEntreSecoes;

  // CERTIFICAÇÃO DIGITAL
  checkNewPage(70);

  const verificationUrl = `${window.location.origin}/verificar-ata?protocolo=${protocolo}`;
  
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
  doc.text("CERTIFICAÇÃO DIGITAL", marginLeft + contentWidth / 2, certY + 6, { align: "center" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  
  let certTextY = certY + 13;
  
  // Protocolo
  doc.text(`Protocolo:  ${protocoloFormatado}`, marginLeft + 5, certTextY);
  certTextY += 4;
  
  // Responsável
  doc.text(`Responsável:  ${nomeResponsavel}`, marginLeft + 5, certTextY);
  certTextY += 5;
  
  // Verificação - Label
  doc.setFont("helvetica", "bold");
  doc.text("Verificar autenticidade em:", marginLeft + 5, certTextY);
  certTextY += 3.5;
  
  // URL como link clicável
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 255);
  doc.setFontSize(8);
  urlLines.forEach((linha: string, index: number) => {
    doc.textWithLink(linha, marginLeft + 5, certTextY + (index * 3.5), { url: verificationUrl });
  });
  certTextY += urlLines.length * 3.5 + 2.5;
  
  // Texto legal
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(7);
  doc.text("Este documento possui certificação digital conforme Lei 14.063/2020", marginLeft + 5, certTextY);
  doc.setTextColor(0, 0, 0);
  
  // Atualizar currentY para posicionar após a certificação
  currentY = certY + certHeight + espacoEntreSecoes;

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
  id: string;
  nome: string;
  identificacao: string;
  tipo: 'fornecedor' | 'usuario';
  data_assinatura: string;
  ip_assinatura: string;
  status_assinatura: string;
  cargo?: string;
  responsaveisLegais?: string[];
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

  // Buscar assinaturas de fornecedores com responsaveis_legais e responsaveis_assinantes
  const { data: assinaturasFornecedores, error: assinaturasFornError } = await supabase
    .from('atas_assinaturas_fornecedor')
    .select(`
      id,
      fornecedor_id,
      data_assinatura,
      ip_assinatura,
      status_assinatura,
      responsaveis_assinantes,
      fornecedores (
        razao_social,
        cnpj,
        responsaveis_legais
      )
    `)
    .eq('ata_id', ataId)
    .order('data_assinatura', { ascending: true });

  if (assinaturasFornError) {
    console.error('Erro ao buscar assinaturas de fornecedores:', assinaturasFornError);
    throw new Error('Erro ao buscar assinaturas de fornecedores');
  }

  // Buscar assinaturas de usuários internos
  const { data: assinaturasUsuarios, error: assinaturasUserError } = await supabase
    .from('atas_assinaturas_usuario')
    .select(`
      id,
      usuario_id,
      data_assinatura,
      ip_assinatura,
      status_assinatura
    `)
    .eq('ata_id', ataId)
    .order('data_assinatura', { ascending: true });

  // Buscar dados dos perfis separadamente para evitar problemas com join
  let profilesMap: Record<string, { nome_completo: string; cpf: string; cargo?: string }> = {};
  if (assinaturasUsuarios && assinaturasUsuarios.length > 0) {
    const usuarioIds = assinaturasUsuarios.map(a => a.usuario_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, nome_completo, cpf, cargo')
      .in('id', usuarioIds);
    
    if (profiles) {
      profilesMap = profiles.reduce((acc, p) => {
        acc[p.id] = { nome_completo: p.nome_completo, cpf: p.cpf, cargo: (p as any).cargo };
        return acc;
      }, {} as Record<string, { nome_completo: string; cpf: string; cargo?: string }>);
    }
  }

  if (assinaturasUserError) {
    console.error('Erro ao buscar assinaturas de usuários:', assinaturasUserError);
  }

  console.log('Assinaturas de fornecedores encontradas:', assinaturasFornecedores?.length || 0);
  console.log('Assinaturas de usuários encontradas:', assinaturasUsuarios?.length || 0);

  // Formatar assinaturas de fornecedores
  const assinaturasFormatadas: Assinatura[] = (assinaturasFornecedores || []).map(a => {
    const fornecedor = a.fornecedores as any;
    const responsaveisAssinantes = (a as any).responsaveis_assinantes as string[] || [];
    const responsaveisLegais = fornecedor?.responsaveis_legais as string[] || [];
    const responsaveisParaExibir = responsaveisAssinantes.length > 0 ? responsaveisAssinantes : responsaveisLegais;
    
    return {
      id: a.id,
      nome: fornecedor?.razao_social || '',
      identificacao: formatarCNPJ(fornecedor?.cnpj || ''),
      tipo: 'fornecedor' as const,
      data_assinatura: a.data_assinatura || '',
      ip_assinatura: a.ip_assinatura || '',
      status_assinatura: a.status_assinatura,
      responsaveisLegais: responsaveisParaExibir.length > 0 ? responsaveisParaExibir : undefined
    };
  });

  // Adicionar assinaturas de usuários usando o map de profiles
  const assinaturasUsuariosFormatadas: Assinatura[] = (assinaturasUsuarios || []).map(a => {
    const profile = profilesMap[a.usuario_id];
    return {
      id: a.id,
      nome: profile?.nome_completo || '',
      identificacao: `CPF: ${formatarCPF(profile?.cpf || '')}`,
      tipo: 'usuario' as const,
      data_assinatura: a.data_assinatura || '',
      ip_assinatura: a.ip_assinatura || '',
      status_assinatura: a.status_assinatura,
      cargo: profile?.cargo || undefined
    };
  });

  // Combinar todas as assinaturas
  const todasAssinaturas = [...assinaturasFormatadas, ...assinaturasUsuariosFormatadas];

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

  // CRIAR NOVA PÁGINA para o termo de aceite (certificação ocupa final da última página)
  console.log('>>> CRIANDO NOVA PÁGINA DEDICADA para termo de aceite');
  
  // Dimensões fixas A4
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const marginLeft = 40;
  const marginRight = 40;
  const footerLimit = 60;
  
  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  console.log('>>> Nova página criada. Total agora:', pdfDoc.getPageCount());
  console.log('>>> Dimensões da nova página - width:', pageWidth, 'height:', pageHeight);
  
  // Adicionar logo expandido no topo da nova página (1,5mm = 4.25 pontos)
  const lateralMargin = 4.25; // 1,5mm convertido para pontos
  const logoExpandidoBytes = await fetch(logoExpandido).then(res => res.arrayBuffer());
  const logoExpandidoImage = await pdfDoc.embedPng(logoExpandidoBytes);
  const logoExpandidoDims = logoExpandidoImage.scale(1);
  const logoExpandidoWidth = pageWidth - (lateralMargin * 2);
  const logoExpandidoHeight = (logoExpandidoWidth / logoExpandidoDims.width) * logoExpandidoDims.height;
  
  page.drawImage(logoExpandidoImage, {
    x: lateralMargin,
    y: pageHeight - logoExpandidoHeight - lateralMargin,
    width: logoExpandidoWidth,
    height: logoExpandidoHeight,
  });
  
  // Começar do TOPO da nova página abaixo do logo
  let currentY = pageHeight - logoExpandidoHeight - 20;
  console.log('>>> Posição inicial do termo de aceite (do topo):', currentY);

  // Função para criar nova página se necessário
  const checkNewPage = async (espacoNecessario: number) => {
    if (currentY - espacoNecessario < footerLimit) {
      console.log('>>> checkNewPage: Criando nova página adicional');
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      
      // Adicionar logo expandido no topo da nova página
      page.drawImage(logoExpandidoImage, {
        x: lateralMargin,
        y: pageHeight - logoExpandidoHeight - lateralMargin,
        width: logoExpandidoWidth,
        height: logoExpandidoHeight,
      });
      
      currentY = pageHeight - logoExpandidoHeight - 20;
      console.log('>>> checkNewPage: Nova página criada. Total:', pdfDoc.getPageCount());
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

  console.log('>>> Iniciando loop de assinaturas. Total:', todasAssinaturas.length);
  
  for (const assinatura of todasAssinaturas) {
    console.log('>>> Processando assinatura:', assinatura.nome);
    const temCargo = assinatura.tipo === 'usuario' && assinatura.cargo;
    const temResponsaveis = assinatura.tipo === 'fornecedor' && assinatura.responsaveisLegais && assinatura.responsaveisLegais.length > 0;
    const numResponsaveis = temResponsaveis ? assinatura.responsaveisLegais!.length : 0;
    
    let boxHeight = 50;
    if (temCargo) boxHeight += 12;
    if (temResponsaveis) boxHeight += 12 + (numResponsaveis * 11);
    
    console.log('>>> Verificando espaço. currentY:', currentY, 'boxHeight:', boxHeight);
    if (await checkNewPage(boxHeight + 10)) {
      console.log('>>> checkNewPage retornou true - nova página criada');
    }

    // Fundo do box
    page.drawRectangle({
      x: marginLeft,
      y: currentY - boxHeight,
      width: pageWidth - marginLeft - marginRight,
      height: boxHeight,
      color: assinatura.status_assinatura === 'aceito' ? rgb(0.95, 1, 0.95) : rgb(1, 0.98, 0.9),
      borderColor: assinatura.status_assinatura === 'aceito' ? rgb(0.2, 0.7, 0.2) : rgb(0.9, 0.7, 0.2),
      borderWidth: 1,
    });

    // Nome e tipo
    const tipoLabel = assinatura.tipo === 'fornecedor' ? '[FORNECEDOR]' : '[USUÁRIO INTERNO]';
    page.drawText(`${tipoLabel} ${assinatura.nome}`, {
      x: marginLeft + 10,
      y: currentY - 14,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    let nextY = currentY - 26;

    // Cargo (apenas para usuários internos)
    if (assinatura.tipo === 'usuario' && assinatura.cargo) {
      page.drawText(`Cargo: ${assinatura.cargo}`, {
        x: marginLeft + 10,
        y: nextY,
        size: 9,
        font: helveticaFont,
        color: rgb(0.3, 0.3, 0.3),
      });
      nextY -= 12;
    }

    // Responsáveis Legais (apenas para fornecedores)
    if (assinatura.tipo === 'fornecedor' && assinatura.responsaveisLegais && assinatura.responsaveisLegais.length > 0) {
      page.drawText('Responsável(is) Legal(is):', {
        x: marginLeft + 10,
        y: nextY,
        size: 9,
        font: helveticaBold,
        color: rgb(0.3, 0.3, 0.3),
      });
      nextY -= 11;
      
      assinatura.responsaveisLegais.forEach(resp => {
        page.drawText(`• ${resp}`, {
          x: marginLeft + 15,
          y: nextY,
          size: 9,
          font: helveticaFont,
          color: rgb(0.3, 0.3, 0.3),
        });
        nextY -= 11;
      });
    }

    // Identificação
    page.drawText(`Identificação: ${assinatura.identificacao}`, {
      x: marginLeft + 10,
      y: nextY,
      size: 9,
      font: helveticaFont,
      color: rgb(0.3, 0.3, 0.3),
    });

    // Status e Data
    const statusText = assinatura.status_assinatura === 'aceito' ? 'ASSINADO' : 'PENDENTE';
    const statusColor = assinatura.status_assinatura === 'aceito' ? rgb(0, 0.5, 0) : rgb(0.8, 0.5, 0);
    
    page.drawText(statusText, {
      x: pageWidth - marginRight - 80,
      y: currentY - 14,
      size: 9,
      font: helveticaBold,
      color: statusColor,
    });

    if (assinatura.data_assinatura) {
      const dataFormatada = new Date(assinatura.data_assinatura).toLocaleString('pt-BR');
      page.drawText(dataFormatada, {
        x: pageWidth - marginRight - 120,
        y: currentY - 26,
        size: 8,
        font: helveticaFont,
        color: rgb(0.4, 0.4, 0.4),
      });
    }

    currentY -= boxHeight + 8;
  }

  // Salvar PDF modificado
  console.log('>>> Salvando PDF final. Total de páginas:', pdfDoc.getPageCount());
  
  // Adicionar rodapé expandido no final de todas as páginas com termo de aceite (1,5mm = 4.25 pontos)
  const rodapeExpandidoBytes = await fetch(rodapeExpandido).then(res => res.arrayBuffer());
  const rodapeExpandidoImage = await pdfDoc.embedPng(rodapeExpandidoBytes);
  const rodapeExpandidoDims = rodapeExpandidoImage.scale(1);
  const rodapeExpandidoWidth = pageWidth - (lateralMargin * 2);
  const rodapeExpandidoHeight = (rodapeExpandidoWidth / rodapeExpandidoDims.width) * rodapeExpandidoDims.height;
  
  const totalPages = pdfDoc.getPageCount();
  // Adicionar rodapé apenas nas páginas do termo de aceite (a partir da página que criamos)
  for (let i = originalPageCount; i < totalPages; i++) {
    const pageToAddFooter = pdfDoc.getPage(i);
    pageToAddFooter.drawImage(rodapeExpandidoImage, {
      x: lateralMargin,
      y: lateralMargin,
      width: rodapeExpandidoWidth,
      height: rodapeExpandidoHeight,
    });
  }
  
  const modifiedPdfBytes = await pdfDoc.save();
  const modifiedBlob = new Blob([new Uint8Array(modifiedPdfBytes)], { type: 'application/pdf' });

  // Upload do PDF modificado (sobrescrevendo o atual)
  const newStoragePath = storagePath.replace('.pdf', '-assinado.pdf');
  
  console.log('>>> Fazendo upload do PDF modificado');
  console.log('>>> Path original:', storagePath);
  console.log('>>> Path novo (assinado):', newStoragePath);
  
  const { error: uploadError } = await supabase.storage
    .from('processo-anexos')
    .upload(newStoragePath, modifiedBlob, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    console.error('Erro ao fazer upload do PDF modificado:', uploadError);
    throw new Error('Erro ao salvar PDF com assinaturas');
  }

  console.log('>>> Upload concluído com sucesso');

  // Obter URL pública do novo PDF com cache bust
  const cacheBust = `?t=${Date.now()}`;
  const { data: { publicUrl } } = supabase.storage
    .from('processo-anexos')
    .getPublicUrl(newStoragePath);
  
  const finalUrl = publicUrl + cacheBust;
  console.log('>>> URL final com cache bust:', finalUrl);

  // Atualizar registro da ata com nova URL
  const { error: updateError } = await supabase
    .from('atas_selecao')
    .update({ url_arquivo: finalUrl })
    .eq('id', ataId);

  if (updateError) {
    console.error('Erro ao atualizar registro da ata:', updateError);
  }

  console.log('=== ATA ATUALIZADA COM ASSINATURAS ===');
  console.log('=== TOTAL DE PÁGINAS NO PDF FINAL:', pdfDoc.getPageCount(), '===');
}
