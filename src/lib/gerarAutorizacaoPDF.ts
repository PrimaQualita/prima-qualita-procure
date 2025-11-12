import { jsPDF } from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import logoHorizontal from '@/assets/prima-qualita-logo-horizontal.png';

// Função para extrair texto simples de HTML
const extractTextFromHTML = (html: string): string => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
};

interface AutorizacaoResult {
  url: string;
  fileName: string;
  protocolo: string;
  storagePath: string;
}

interface FornecedorVencedor {
  razaoSocial: string;
  cnpj: string;
  itensVencedores: Array<{ numero: number; valor: number }>;
  valorTotal: number;
}

interface DadosAutorizacao {
  numeroProcesso: string;
  objetoProcesso: string;
  usuarioNome: string;
  usuarioCpf: string;
  fornecedoresVencedores?: FornecedorVencedor[];
}

export const gerarAutorizacaoCompraDireta = async (
  numeroProcesso: string,
  objetoProcesso: string,
  usuarioNome: string,
  usuarioCpf: string,
  fornecedoresVencedores?: FornecedorVencedor[]
): Promise<AutorizacaoResult> => {
  console.log('[PDF] Iniciando geração - Compra Direta');
  console.log('[PDF] Fornecedores vencedores recebidos:', fornecedoresVencedores);
  console.log('[PDF] Quantidade de fornecedores:', fornecedoresVencedores?.length || 0);
  
  const agora = new Date();
  const dataHora = agora.toLocaleString('pt-BR', { 
    dateStyle: 'long', 
    timeStyle: 'medium' 
  });
  const protocolo = `AUT-CD-${numeroProcesso}-${Date.now()}`;
  
  // Criar PDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Função para adicionar logo e rodapé em todas as páginas
  const adicionarLogoERodape = async (paginaAtual: number) => {
    // Logo
    const base64Logo = await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } else {
          reject(new Error('Erro ao criar canvas'));
        }
      };
      img.onerror = () => reject(new Error('Erro ao carregar logo'));
      img.src = logoHorizontal;
    });
    
    doc.addImage(base64Logo, 'PNG', (pageWidth - 80) / 2, 10, 80, 20);
    
    // Rodapé
    const yRodape = pageHeight - 20;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text('PRIMA QUALITA SAUDE', pageWidth / 2, yRodape, { align: 'center' });
    doc.text('www.primaqualitasaude.org', pageWidth / 2, yRodape + 5, { align: 'center' });
    doc.text('Travessa do Ouvidor, 21, Sala 203, Centro, Rio de Janeiro - RJ, CEP: 20.040-040', pageWidth / 2, yRodape + 10, { align: 'center' });
    doc.text('CNPJ: 40.289.134/0001-99', pageWidth / 2, yRodape + 15, { align: 'center' });
  };
  
  // Adicionar logo e rodapé na primeira página
  await adicionarLogoERodape(1);
  
  // Título
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('AUTORIZAÇÃO', pageWidth / 2, 45, { align: 'center' });
  
  // Processo
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text(`Processo ${numeroProcesso}`, pageWidth / 2, 60, { align: 'center' });
  
  // Assunto - extrair texto limpo do HTML
  doc.setFontSize(12);
  const textoLimpo = extractTextFromHTML(objetoProcesso);
  const linhasAssunto = doc.splitTextToSize(`Assunto: ${textoLimpo}`, 170);
  doc.text(linhasAssunto, 20, 72, { align: 'justify', maxWidth: 170 });
  
  // Texto principal
  doc.setFontSize(11);
  let yPos = 90;
  
  const texto1 = 'Na qualidade de representante legal da PRIMA QUALITÁ SAÚDE, ratifico a realização da presente despesa, e a contratação por NÃO OBRIGATORIEDADE DE SELEÇÃO DE FORNECEDORES, conforme requisição, aferição da economicidade e justificativas anexas, nos termos do Art. 12, Inciso VI do Regulamento para Aquisição de Bens, Contratação de Obras, Serviços e Locações da Instituição, em favor da(s) empresa(s):';
  
  const linhas1 = doc.splitTextToSize(texto1, 170);
  doc.text(linhas1, 20, yPos, { align: 'justify', maxWidth: 170 });
  yPos += linhas1.length * 6 + 2; // Reduzido para aproximar da tabela
  
  // Tabela de fornecedores vencedores
  console.log('[PDF] Verificando fornecedores vencedores para tabela:', fornecedoresVencedores);
  if (fornecedoresVencedores && fornecedoresVencedores.length > 0) {
    console.log('[PDF] Gerando tabela com', fornecedoresVencedores.length, 'fornecedores');
    doc.setFontSize(10);
    
    // Cabeçalho da tabela
    doc.setFillColor(0, 51, 102);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.rect(20, yPos, 50, 8, 'FD'); // Empresa - Fill + Draw (borda)
    doc.rect(70, yPos, 40, 8, 'FD'); // CNPJ
    doc.rect(110, yPos, 30, 8, 'FD'); // Itens Vencidos
    doc.rect(140, yPos, 50, 8, 'FD'); // Valor Total
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('Empresa', 45, yPos + 5, { align: 'center' });
    doc.text('CNPJ', 90, yPos + 5, { align: 'center' });
    doc.text('Itens Vencidos', 125, yPos + 5, { align: 'center' });
    doc.text('Valor Total', 165, yPos + 5, { align: 'center' });
    yPos += 8;
    
    // Conteúdo da tabela - uma linha por fornecedor
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    
    let totalGeral = 0;
    
    // Função para formatar CNPJ
    const formatarCNPJ = (cnpj: string) => {
      const apenasNumeros = cnpj.replace(/\D/g, '');
      if (apenasNumeros.length === 14) {
        return apenasNumeros.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
      }
      return cnpj;
    };
    
    fornecedoresVencedores.forEach((fornecedor) => {
      // Calcular altura necessária baseada no texto da razão social
      const razaoSocialSplit = doc.splitTextToSize(fornecedor.razaoSocial, 45);
      const alturaLinha = Math.max(10, razaoSocialSplit.length * 4 + 4);
      
      // Desenhar bordas das células
      doc.rect(20, yPos, 50, alturaLinha); // Empresa
      doc.rect(70, yPos, 40, alturaLinha); // CNPJ
      doc.rect(110, yPos, 30, alturaLinha); // Itens Vencidos
      doc.rect(140, yPos, 50, alturaLinha); // Valor Total
      
      // Empresa - centralizada horizontalmente e verticalmente
      const offsetVerticalEmpresa = (alturaLinha - (razaoSocialSplit.length * 4)) / 2 + 4;
      razaoSocialSplit.forEach((linha: string, index: number) => {
        doc.text(linha, 45, yPos + offsetVerticalEmpresa + (index * 4), { align: 'center' });
      });
      
      // CNPJ - formatado e centralizado verticalmente
      const cnpjFormatado = formatarCNPJ(fornecedor.cnpj);
      const offsetVerticalCNPJ = (alturaLinha - 4) / 2 + 4;
      doc.text(cnpjFormatado, 72, yPos + offsetVerticalCNPJ);
      
      // Itens Vencidos - centralizado horizontal e verticalmente
      const itensText = fornecedor.itensVencedores.map(i => i.numero).join(', ');
      const offsetVerticalItens = (alturaLinha - 4) / 2 + 4;
      doc.text(itensText, 125, yPos + offsetVerticalItens, { align: 'center' });
      
      // Valor Total - centralizado verticalmente
      const offsetVerticalValor = (alturaLinha - 4) / 2 + 4;
      doc.text(`R$ ${fornecedor.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 142, yPos + offsetVerticalValor);
      
      totalGeral += fornecedor.valorTotal;
      yPos += alturaLinha;
    });
    
    // Linha de Total Geral - mesclada até terceira coluna
    doc.setFillColor(240, 240, 240);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.rect(20, yPos, 120, 8, 'FD'); // Mesclada: Empresa + CNPJ + Itens Vencidos
    doc.rect(140, yPos, 50, 8, 'FD'); // Valor Total
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('TOTAL GERAL', 22, yPos + 5);
    doc.text(`R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 142, yPos + 5);
    yPos += 16; // Aumentado para afastar do próximo texto
    
    console.log('[PDF] Tabela gerada com sucesso. Total geral:', totalGeral);
  } else {
    console.log('[PDF] AVISO: Nenhum fornecedor vencedor para gerar tabela!');
  }
  
  // Encaminhamento
  const texto2 = 'Encaminha-se ao Departamento Financeiro, para as providências cabíveis.';
  const linhas2 = doc.splitTextToSize(texto2, 170);
  doc.text(linhas2, 20, yPos, { align: 'justify', maxWidth: 170 });
  yPos += 10;
  
  // Certificação Digital - versão compacta
  doc.setFillColor(240, 249, 255);
  doc.setDrawColor(0, 51, 102);
  doc.setLineWidth(0.5);
  doc.rect(20, yPos, 170, 40, 'FD');
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 51, 102);
  doc.text('CERTIFICAÇÃO DIGITAL', 25, yPos + 6);
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(`Protocolo: ${protocolo}`, 25, yPos + 12);
  doc.text(`Data/Hora: ${dataHora}`, 25, yPos + 17);
  doc.text(`Responsável: ${usuarioNome} | CPF: ${usuarioCpf}`, 25, yPos + 22);
  
  // Hash e link de verificação
  const hash = protocolo.replace(/-/g, '').substring(0, 32).toUpperCase();
  doc.text(`Hash: ${hash}`, 25, yPos + 27);
  
  // Link quebrado em múltiplas linhas se necessário
  doc.setTextColor(0, 51, 102);
  const linkBase = typeof window !== 'undefined' ? window.location.origin : 'https://primaqualitasaude.org';
  const linkCompleto = `${linkBase}/verificar-autorizacao?protocolo=${protocolo}`;
  const linkQuebrado = doc.splitTextToSize(`Verificar em: ${linkCompleto}`, 165);
  doc.text(linkQuebrado, 25, yPos + 32);
  
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(0, 0, 0);
  doc.text('Documento com validade legal (Lei 14.063/2020)', 25, yPos + 37);
  
  // Gerar blob
  console.log('[PDF] Gerando blob...');
  const pdfBlob = doc.output('blob');
  console.log('[PDF] PDF gerado, tamanho:', pdfBlob.size);
  
  if (pdfBlob.size < 3000) {
    throw new Error('PDF muito pequeno, possível erro na geração');
  }
  
  // Upload
  const fileName = `autorizacoes/compra-direta-${numeroProcesso}-${Date.now()}.pdf`;
  const { error } = await supabase.storage
    .from('processo-anexos')
    .upload(fileName, pdfBlob, {
      contentType: 'application/pdf',
      upsert: false
    });

  if (error) throw error;

  const { data: urlData, error: signError } = await supabase.storage
    .from('processo-anexos')
    .createSignedUrl(fileName, 31536000);

  if (signError) throw signError;

  console.log('[PDF] Sucesso!');
  return {
    url: urlData.signedUrl,
    fileName: `autorizacao-compra-direta-${numeroProcesso}.pdf`,
    protocolo,
    storagePath: fileName
  };
};

export const gerarAutorizacaoSelecao = async (
  numeroProcesso: string,
  objetoProcesso: string,
  usuarioNome: string,
  usuarioCpf: string
): Promise<AutorizacaoResult> => {
  console.log('[PDF] Iniciando geração - Seleção');
  
  const agora = new Date();
  const dataHora = agora.toLocaleString('pt-BR', { 
    dateStyle: 'long', 
    timeStyle: 'medium' 
  });
  const protocolo = `AUT-SF-${numeroProcesso}-${Date.now()}`;
  
  // Criar PDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Função para adicionar logo e rodapé em todas as páginas
  const adicionarLogoERodape = async (paginaAtual: number) => {
    // Logo
    const base64Logo = await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } else {
          reject(new Error('Erro ao criar canvas'));
        }
      };
      img.onerror = () => reject(new Error('Erro ao carregar logo'));
      img.src = logoHorizontal;
    });
    
    doc.addImage(base64Logo, 'PNG', (pageWidth - 80) / 2, 10, 80, 20);
    
    // Rodapé
    const yRodape = pageHeight - 20;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text('PRIMA QUALITA SAUDE', pageWidth / 2, yRodape, { align: 'center' });
    doc.text('www.primaqualitasaude.org', pageWidth / 2, yRodape + 5, { align: 'center' });
    doc.text('Travessa do Ouvidor, 21, Sala 203, Centro, Rio de Janeiro - RJ, CEP: 20.040-040', pageWidth / 2, yRodape + 10, { align: 'center' });
    doc.text('CNPJ: 40.289.134/0001-99', pageWidth / 2, yRodape + 15, { align: 'center' });
  };
  
  // Adicionar logo e rodapé na primeira página
  await adicionarLogoERodape(1);
  
  // Título
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('AUTORIZAÇÃO', pageWidth / 2, 45, { align: 'center' });
  
  // Processo
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text(`Processo ${numeroProcesso}`, pageWidth / 2, 60, { align: 'center' });
  
  // Assunto - extrair texto limpo do HTML
  doc.setFontSize(12);
  const textoLimpo = extractTextFromHTML(objetoProcesso);
  const linhasAssunto = doc.splitTextToSize(`Assunto: ${textoLimpo}`, 170);
  doc.text(linhasAssunto, 20, 72, { align: 'justify', maxWidth: 170 });
  
  // Texto principal
  doc.setFontSize(11);
  let yPos = 90;
  
  const texto1 = 'Na qualidade de representante legal da PRIMA QUALITÁ SAÚDE, autorizo a presente contratação por SELEÇÃO DE FORNECEDORES, conforme requisição e termo de referência anexos, nos termos do art.4° do Regulamento para Aquisição de Bens, Contratação de Obras, Serviços e Locações da Instituição.';
  
  const linhas1 = doc.splitTextToSize(texto1, 170);
  doc.text(linhas1, 20, yPos, { align: 'justify', maxWidth: 170 });
  yPos += linhas1.length * 6 + 10;
  
  // Encaminhamento
  const texto2 = 'Encaminha-se ao Departamento de Compras, para as providências cabíveis.';
  const linhas2 = doc.splitTextToSize(texto2, 170);
  doc.text(linhas2, 20, yPos, { align: 'justify', maxWidth: 170 });
  yPos += 10;
  
  // Certificação Digital - versão compacta
  doc.setFillColor(240, 249, 255);
  doc.setDrawColor(0, 51, 102);
  doc.setLineWidth(0.5);
  doc.rect(20, yPos, 170, 40, 'FD');
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 51, 102);
  doc.text('CERTIFICAÇÃO DIGITAL', 25, yPos + 6);
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(`Protocolo: ${protocolo}`, 25, yPos + 12);
  doc.text(`Data/Hora: ${dataHora}`, 25, yPos + 17);
  doc.text(`Responsável: ${usuarioNome} | CPF: ${usuarioCpf}`, 25, yPos + 22);
  
  // Hash e link de verificação
  const hash = protocolo.replace(/-/g, '').substring(0, 32).toUpperCase();
  doc.text(`Hash: ${hash}`, 25, yPos + 27);
  
  // Link quebrado em múltiplas linhas se necessário
  doc.setTextColor(0, 51, 102);
  const linkBase = typeof window !== 'undefined' ? window.location.origin : 'https://primaqualitasaude.org';
  const linkCompleto = `${linkBase}/verificar-autorizacao?protocolo=${protocolo}`;
  const linkQuebrado = doc.splitTextToSize(`Verificar em: ${linkCompleto}`, 165);
  doc.text(linkQuebrado, 25, yPos + 32);
  
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(0, 0, 0);
  doc.text('Documento com validade legal (Lei 14.063/2020)', 25, yPos + 37);
  
  // Gerar blob
  console.log('[PDF] Gerando blob...');
  const pdfBlob = doc.output('blob');
  console.log('[PDF] PDF gerado, tamanho:', pdfBlob.size);
  
  if (pdfBlob.size < 3000) {
    throw new Error('PDF muito pequeno, possível erro na geração');
  }
  
  // Upload
  const fileName = `autorizacoes/selecao-fornecedores-${numeroProcesso}-${Date.now()}.pdf`;
  const { error } = await supabase.storage
    .from('processo-anexos')
    .upload(fileName, pdfBlob, {
      contentType: 'application/pdf',
      upsert: false
    });

  if (error) throw error;

  const { data: urlData, error: signError } = await supabase.storage
    .from('processo-anexos')
    .createSignedUrl(fileName, 31536000);

  if (signError) throw signError;

  console.log('[PDF] Sucesso!');
  return {
    url: urlData.signedUrl,
    fileName: `autorizacao-selecao-fornecedores-${numeroProcesso}.pdf`,
    protocolo,
    storagePath: fileName
  };
};