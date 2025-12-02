import { jsPDF } from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import logoHorizontal from '@/assets/prima-qualita-logo-horizontal.png';
import capaLogo from '@/assets/capa-processo-logo.png';
import logoMarcaDagua from '@/assets/prima-qualita-logo.png';
import capaRodape from '@/assets/capa-processo-rodape.png';

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
  itensVencedores: Array<{ numero: number; valor: number; marca?: string; valorUnitario?: number }>;
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
  
  // Gerar protocolo numérico no formato XXXX-XXXX-XXXX-XXXX
  const timestamp = agora.getTime();
  const protocoloNumerico = timestamp.toString().padStart(16, '0');
  const protocolo = protocoloNumerico.match(/.{1,4}/g)?.join('-') || protocoloNumerico;
  
  // Criar PDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Função para adicionar logo, marca d'água e rodapé em todas as páginas
  const adicionarLogoERodape = async (paginaAtual: number) => {
    // Logo da capa no topo
    const base64CapaLogo = await new Promise<string>((resolve, reject) => {
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
      img.onerror = () => reject(new Error('Erro ao carregar logo capa'));
      img.src = capaLogo;
    });
    
    // Marca d'água centralizada
    const base64MarcaDagua = await new Promise<string>((resolve, reject) => {
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
      img.onerror = () => reject(new Error('Erro ao carregar marca d\'água'));
      img.src = logoMarcaDagua;
    });
    
    // Rodapé
    const base64Rodape = await new Promise<string>((resolve, reject) => {
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
      img.onerror = () => reject(new Error('Erro ao carregar rodapé'));
      img.src = capaRodape;
    });
    
    // Adicionar marca d'água com opacidade baixa
    doc.saveGraphicsState();
    const gState = doc.GState({ opacity: 0.08 });
    doc.setGState(gState);
    const marcaDaguaWidth = 160;
    const marcaDaguaHeight = 80;
    doc.addImage(
      base64MarcaDagua, 
      'PNG', 
      (pageWidth - marcaDaguaWidth) / 2, 
      (pageHeight - marcaDaguaHeight) / 2, 
      marcaDaguaWidth, 
      marcaDaguaHeight
    );
    doc.restoreGraphicsState();
    
    // Logo da capa no topo - largura total da página
    const logoWidth = pageWidth;
    const logoHeight = 40;
    doc.addImage(base64CapaLogo, 'PNG', 0, 0, logoWidth, logoHeight);
    
    // Rodapé - imagem no fundo
    const rodapeHeight = 25;
    const yRodape = pageHeight - rodapeHeight;
    doc.addImage(base64Rodape, 'PNG', 0, yRodape, pageWidth, rodapeHeight);
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
  
  // Tabela de fornecedores vencedores com itens detalhados
  console.log('[PDF] Verificando fornecedores vencedores para tabela:', fornecedoresVencedores);
  if (fornecedoresVencedores && fornecedoresVencedores.length > 0) {
    console.log('[PDF] Gerando tabela com', fornecedoresVencedores.length, 'fornecedores');
    doc.setFontSize(8);
    
    // Cabeçalho da tabela (apenas Empresa, CNPJ e Valor Total)
    doc.setFillColor(0, 51, 102);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.rect(20, yPos, 80, 8, 'FD');
    doc.rect(100, yPos, 50, 8, 'FD');
    doc.rect(150, yPos, 40, 8, 'FD');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('Empresa', 60, yPos + 5, { align: 'center' });
    doc.text('CNPJ', 125, yPos + 5, { align: 'center' });
    doc.text('Valor Total', 170, yPos + 5, { align: 'center' });
    yPos += 8;
    
    // Conteúdo da tabela
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
    
    for (const fornecedor of fornecedoresVencedores) {
      const razaoSocialSplit = doc.splitTextToSize(fornecedor.razaoSocial, 75);
      const alturaLinha = Math.max(8, razaoSocialSplit.length * 4 + 2);
      
      // Verificar se precisa de nova página
      if (yPos + alturaLinha > pageHeight - 30) {
        doc.addPage();
        await adicionarLogoERodape(doc.getNumberOfPages());
        yPos = 50; // Posicionar abaixo do logo (40mm de altura + margem)
      }
      
      doc.rect(20, yPos, 80, alturaLinha);
      doc.rect(100, yPos, 50, alturaLinha);
      doc.rect(150, yPos, 40, alturaLinha);
      
      // Razão social
      const offsetVerticalEmpresa = (alturaLinha - (razaoSocialSplit.length * 4)) / 2 + 3;
      razaoSocialSplit.forEach((linha: string, index: number) => {
        doc.text(linha, 22, yPos + offsetVerticalEmpresa + (index * 4), { align: 'left', maxWidth: 76 });
      });
      
      // CNPJ (centralizado)
      const cnpjFormatado = formatarCNPJ(fornecedor.cnpj);
      const cnpjSplit = doc.splitTextToSize(cnpjFormatado, 48);
      const offsetVerticalCNPJ = (alturaLinha - (cnpjSplit.length * 4)) / 2 + 3;
      cnpjSplit.forEach((linha: string, index: number) => {
        doc.text(linha, 125, yPos + offsetVerticalCNPJ + (index * 4), { align: 'center', maxWidth: 48 });
      });
      
      // Valor total do fornecedor
      doc.text(`R$ ${fornecedor.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 187, yPos + (alturaLinha / 2) + 1, { align: 'right' });
      
      yPos += alturaLinha;
      totalGeral += fornecedor.valorTotal;
    }
    
    // Linha de Total Geral
    doc.setFillColor(240, 240, 240);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.rect(20, yPos, 130, 8, 'FD');
    doc.rect(150, yPos, 40, 8, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('TOTAL GERAL', 22, yPos + 5);
    doc.text(`R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 187, yPos + 5, { align: 'right' });
    yPos += 16;
    
    console.log('[PDF] Tabela gerada com sucesso. Total geral:', totalGeral);
  } else {
    console.log('[PDF] AVISO: Nenhum fornecedor vencedor para gerar tabela!');
  }
  
  // Encaminhamento
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  const texto2 = 'Encaminha-se ao Departamento Financeiro, para as providências cabíveis.';
  const linhas2 = doc.splitTextToSize(texto2, 170);
  doc.text(linhas2, 20, yPos, { align: 'justify', maxWidth: 170 });
  yPos += 10;
  
  // Verificar espaço para certificação (45mm de altura)
  if (yPos + 45 > pageHeight - 30) {
    doc.addPage();
    await adicionarLogoERodape(doc.getNumberOfPages());
    yPos = 50; // Posicionar abaixo do logo (40mm de altura + margem)
  }
  
  // Certificação Digital - versão compacta
  doc.setFillColor(240, 249, 255);
  doc.setDrawColor(0, 51, 102);
  doc.setLineWidth(0.5);
  doc.rect(20, yPos, 170, 45, 'FD');
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 51, 102);
  doc.text('CERTIFICAÇÃO DIGITAL', 25, yPos + 6);
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(`Protocolo: ${protocolo}`, 25, yPos + 12);
  doc.text(`Data/Hora: ${dataHora}`, 25, yPos + 18);
  doc.text(`Responsável: ${usuarioNome} | CPF: ${usuarioCpf}`, 25, yPos + 24);
  
  // Hash e link de verificação
  const hash = protocolo.replace(/-/g, '').substring(0, 32).toUpperCase();
  doc.text(`Hash: ${hash}`, 25, yPos + 30);
  
  // Link quebrado em múltiplas linhas se necessário
  doc.setTextColor(0, 51, 102);
  const linkBase = typeof window !== 'undefined' ? window.location.origin : 'https://primaqualitasaude.org';
  const linkCompleto = `${linkBase}/verificar-autorizacao?protocolo=${protocolo}`;
  const linkQuebrado = doc.splitTextToSize(`Verificar em: ${linkCompleto}`, 165);
  doc.text(linkQuebrado, 25, yPos + 35);
  
  // Calcular posição do texto legal baseado no número de linhas do link
  const numLinhasLink = linkQuebrado.length;
  const yTextoLegal = yPos + 35 + (numLinhasLink * 3.5) + 2;
  
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(0, 0, 0);
  doc.text('Documento com validade legal (Lei 14.063/2020)', 25, yTextoLegal);
  
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
  
  // Gerar protocolo numérico no formato XXXX-XXXX-XXXX-XXXX
  const timestamp = agora.getTime();
  const protocoloNumerico = timestamp.toString().padStart(16, '0');
  const protocolo = protocoloNumerico.match(/.{1,4}/g)?.join('-') || protocoloNumerico;
  
  // Criar PDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Função para adicionar logo, marca d'água e rodapé em todas as páginas
  const adicionarLogoERodape = async (paginaAtual: number) => {
    // Logo da capa no topo
    const base64CapaLogo = await new Promise<string>((resolve, reject) => {
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
      img.onerror = () => reject(new Error('Erro ao carregar logo capa'));
      img.src = capaLogo;
    });
    
    // Marca d'água centralizada
    const base64MarcaDagua = await new Promise<string>((resolve, reject) => {
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
      img.onerror = () => reject(new Error('Erro ao carregar marca d\'água'));
      img.src = logoMarcaDagua;
    });
    
    // Rodapé
    const base64Rodape = await new Promise<string>((resolve, reject) => {
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
      img.onerror = () => reject(new Error('Erro ao carregar rodapé'));
      img.src = capaRodape;
    });
    
    // Adicionar marca d'água com opacidade baixa
    doc.saveGraphicsState();
    const gState = doc.GState({ opacity: 0.08 });
    doc.setGState(gState);
    const marcaDaguaWidth = 160;
    const marcaDaguaHeight = 80;
    doc.addImage(
      base64MarcaDagua, 
      'PNG', 
      (pageWidth - marcaDaguaWidth) / 2, 
      (pageHeight - marcaDaguaHeight) / 2, 
      marcaDaguaWidth, 
      marcaDaguaHeight
    );
    doc.restoreGraphicsState();
    
    // Logo da capa no topo - largura total da página
    const logoWidth = pageWidth;
    const logoHeight = 40;
    doc.addImage(base64CapaLogo, 'PNG', 0, 0, logoWidth, logoHeight);
    
    // Rodapé - imagem no fundo
    const rodapeHeight = 25;
    const yRodape = pageHeight - rodapeHeight;
    doc.addImage(base64Rodape, 'PNG', 0, yRodape, pageWidth, rodapeHeight);
  };
  
  // Adicionar logo e rodapé na primeira página
  await adicionarLogoERodape(1);
  
  // Título
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('AUTORIZAÇÃO', pageWidth / 2, 50, { align: 'center' });
  
  // Processo
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text(`Processo ${numeroProcesso}`, pageWidth / 2, 70, { align: 'center' });
  
  // Assunto - extrair texto limpo do HTML
  doc.setFontSize(12);
  const textoLimpo = extractTextFromHTML(objetoProcesso);
  const linhasAssunto = doc.splitTextToSize(`Assunto: ${textoLimpo}`, 170);
  const yPosAssunto = 85;
  doc.text(linhasAssunto, 20, yPosAssunto, { align: 'justify', maxWidth: 170 });
  
  // Texto principal - calcular posição dinamicamente baseado no tamanho do assunto
  doc.setFontSize(11);
  const espacamentoAposAssunto = 15; // Espaçamento fixo após o assunto
  let yPos = yPosAssunto + (linhasAssunto.length * 6) + espacamentoAposAssunto;
  
  const texto1 = 'Na qualidade de representante legal da PRIMA QUALITÁ SAÚDE, autorizo a presente contratação por SELEÇÃO DE FORNECEDORES, conforme requisição e termo de referência anexos, nos termos do art.4° do Regulamento para Aquisição de Bens, Contratação de Obras, Serviços e Locações da Instituição.';
  
  const linhas1 = doc.splitTextToSize(texto1, 170);
  doc.text(linhas1, 20, yPos, { align: 'justify', maxWidth: 170 });
  yPos += linhas1.length * 6 + 18;
  
  // Encaminhamento
  doc.setFont('helvetica', 'normal');
  const texto2 = 'Encaminha-se ao Departamento de Compras, para as providências cabíveis.';
  const linhas2 = doc.splitTextToSize(texto2, 170);
  doc.text(linhas2, 20, yPos, { align: 'justify', maxWidth: 170 });
  yPos += 25;
  
  // Verificar espaço para certificação (45mm de altura)
  if (yPos + 45 > pageHeight - 30) {
    doc.addPage();
    await adicionarLogoERodape(doc.getNumberOfPages());
    yPos = 50; // Posicionar abaixo do logo (40mm de altura + margem)
  }
  
  // Certificação Digital - versão compacta
  doc.setFillColor(240, 249, 255);
  doc.setDrawColor(0, 51, 102);
  doc.setLineWidth(0.5);
  doc.rect(20, yPos, 170, 45, 'FD');
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 51, 102);
  doc.text('CERTIFICAÇÃO DIGITAL', 25, yPos + 6);
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(`Protocolo: ${protocolo}`, 25, yPos + 12);
  doc.text(`Data/Hora: ${dataHora}`, 25, yPos + 18);
  doc.text(`Responsável: ${usuarioNome} | CPF: ${usuarioCpf}`, 25, yPos + 24);
  
  // Hash e link de verificação
  const hashSelecao = protocolo.replace(/-/g, '').substring(0, 32).toUpperCase();
  doc.text(`Hash: ${hashSelecao}`, 25, yPos + 30);
  
  // Link quebrado em múltiplas linhas se necessário
  doc.setTextColor(0, 51, 102);
  const linkBaseSelecao = typeof window !== 'undefined' ? window.location.origin : 'https://primaqualitasaude.org';
  const linkCompletoSelecao = `${linkBaseSelecao}/verificar-autorizacao?protocolo=${protocolo}`;
  const linkQuebradoSelecao = doc.splitTextToSize(`Verificar em: ${linkCompletoSelecao}`, 165);
  doc.text(linkQuebradoSelecao, 25, yPos + 35);
  
  // Calcular posição do texto legal baseado no número de linhas do link
  const numLinhasLinkSelecao = linkQuebradoSelecao.length;
  const yTextoLegalSelecao = yPos + 35 + (numLinhasLinkSelecao * 3.5) + 2;
  
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(0, 0, 0);
  doc.text('Documento com validade legal (Lei 14.063/2020)', 25, yTextoLegalSelecao);
  
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