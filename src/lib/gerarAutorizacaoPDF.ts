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
  
  // Carregar logo
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
  
  // Logo
  doc.addImage(base64Logo, 'PNG', (pageWidth - 80) / 2, 20, 80, 20);
  
  // Título
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('AUTORIZAÇÃO', pageWidth / 2, 55, { align: 'center' });
  
  // Processo
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text(`Processo ${numeroProcesso}`, pageWidth / 2, 70, { align: 'center' });
  
  // Assunto - extrair texto limpo do HTML
  doc.setFontSize(12);
  const textoLimpo = extractTextFromHTML(objetoProcesso);
  const linhasAssunto = doc.splitTextToSize(`Assunto: ${textoLimpo}`, 170);
  doc.text(linhasAssunto, pageWidth / 2, 82, { align: 'center' });
  
  // Texto principal
  doc.setFontSize(11);
  let yPos = 100;
  
  const texto1 = 'Na qualidade de representante legal da PRIMA QUALITÁ SAÚDE, ratifico a realização da presente despesa, e a contratação por NÃO OBRIGATORIEDADE DE SELEÇÃO DE FORNECEDORES, conforme requisição, aferição da economicidade e justificativas anexas, nos termos do Art. 12, Inciso VI do Regulamento para Aquisição de Bens, Contratação de Obras, Serviços e Locações da Instituição, em favor da(s) empresa(s):';
  
  const linhas1 = doc.splitTextToSize(texto1, 170);
  doc.text(linhas1, 20, yPos);
  yPos += linhas1.length * 6 + 10;
  
  // Tabela de fornecedores vencedores
  if (fornecedoresVencedores && fornecedoresVencedores.length > 0) {
    doc.setFontSize(10);
    
    // Cabeçalho da tabela
    doc.setFillColor(0, 51, 102);
    doc.rect(20, yPos, 170, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('Empresa', 22, yPos + 5);
    doc.text('CNPJ', 70, yPos + 5);
    doc.text('Itens Vencidos', 110, yPos + 5);
    doc.text('Valor Total', 155, yPos + 5);
    yPos += 8;
    
    // Conteúdo da tabela - uma linha por fornecedor
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    
    let totalGeral = 0;
    
    fornecedoresVencedores.forEach((fornecedor) => {
      const alturaLinha = 10;
      doc.rect(20, yPos, 170, alturaLinha);
      
      // Empresa
      const razaoSocialSplit = doc.splitTextToSize(fornecedor.razaoSocial, 45);
      doc.text(razaoSocialSplit, 22, yPos + 4);
      
      // CNPJ
      doc.text(fornecedor.cnpj, 70, yPos + 6);
      
      // Itens Vencidos
      const itensText = fornecedor.itensVencedores.map(i => i.numero).join(', ');
      doc.text(itensText, 110, yPos + 6);
      
      // Valor Total
      doc.text(`R$ ${fornecedor.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 155, yPos + 6);
      
      totalGeral += fornecedor.valorTotal;
      yPos += alturaLinha;
    });
    
    // Linha de Total Geral
    doc.setFillColor(240, 240, 240);
    doc.rect(20, yPos, 170, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL GERAL', 22, yPos + 5);
    doc.text(`R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 155, yPos + 5);
    yPos += 15;
  }
  
  // Encaminhamento
  const texto2 = 'Encaminha-se ao Departamento Financeiro, para as providências cabíveis.';
  doc.text(texto2, 20, yPos);
  yPos += 20;
  
  // Certificação Digital
  doc.setFillColor(240, 249, 255);
  doc.setDrawColor(0, 51, 102);
  doc.setLineWidth(0.5);
  doc.rect(20, yPos, 170, 45, 'FD');
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 51, 102);
  doc.text('CERTIFICACAO DIGITAL', 25, yPos + 8);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(`Protocolo: ${protocolo}`, 25, yPos + 16);
  doc.text(`Data/Hora: ${dataHora}`, 25, yPos + 23);
  doc.text(`Responsavel: ${usuarioNome}`, 25, yPos + 30);
  doc.text(`CPF: ${usuarioCpf}`, 25, yPos + 37);
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  const textoValidade = doc.splitTextToSize('Documento gerado eletronicamente com validade legal (Lei 14.063/2020)', 165);
  doc.text(textoValidade, 25, yPos + 42);
  
  // Rodapé
  yPos = 270;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('PRIMA QUALITA SAUDE', pageWidth / 2, yPos, { align: 'center' });
  doc.text('www.primaqualitasaude.org', pageWidth / 2, yPos + 5, { align: 'center' });
  doc.text('Rua Dr. Francisco de Souza, n° 728, Centro', pageWidth / 2, yPos + 10, { align: 'center' });
  doc.text('Rio Bonito, RJ - CEP 28800-000', pageWidth / 2, yPos + 15, { align: 'center' });
  doc.text('Telefone: 21 2042-4250', pageWidth / 2, yPos + 20, { align: 'center' });
  doc.text('CNPJ: 40.289.134/0001-99', pageWidth / 2, yPos + 25, { align: 'center' });
  
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
  
  // Carregar logo
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
  
  // Logo
  doc.addImage(base64Logo, 'PNG', (pageWidth - 80) / 2, 20, 80, 20);
  
  // Título
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('AUTORIZAÇÃO', pageWidth / 2, 55, { align: 'center' });
  
  // Processo
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text(`Processo ${numeroProcesso}`, pageWidth / 2, 70, { align: 'center' });
  
  // Assunto - extrair texto limpo do HTML
  doc.setFontSize(12);
  const textoLimpo = extractTextFromHTML(objetoProcesso);
  const linhasAssunto = doc.splitTextToSize(`Assunto: ${textoLimpo}`, 170);
  doc.text(linhasAssunto, pageWidth / 2, 82, { align: 'center' });
  
  // Texto principal
  doc.setFontSize(11);
  let yPos = 100;
  
  const texto1 = 'Na qualidade de representante legal da PRIMA QUALITÁ SAÚDE, autorizo a presente contratação por SELEÇÃO DE FORNECEDORES, conforme requisição e termo de referência anexos, nos termos do art.4° do Regulamento para Aquisição de Bens, Contratação de Obras, Serviços e Locações da Instituição.';
  
  const linhas1 = doc.splitTextToSize(texto1, 170);
  doc.text(linhas1, 20, yPos);
  yPos += linhas1.length * 6 + 10;
  
  // Encaminhamento
  const texto2 = 'Encaminha-se ao Departamento de Compras, para as providências cabíveis.';
  doc.text(texto2, 20, yPos);
  yPos += 20;
  
  // Certificação Digital
  doc.setFillColor(240, 249, 255);
  doc.setDrawColor(0, 51, 102);
  doc.setLineWidth(0.5);
  doc.rect(20, yPos, 170, 45, 'FD');
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 51, 102);
  doc.text('CERTIFICACAO DIGITAL', 25, yPos + 8);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(`Protocolo: ${protocolo}`, 25, yPos + 16);
  doc.text(`Data/Hora: ${dataHora}`, 25, yPos + 23);
  doc.text(`Responsavel: ${usuarioNome}`, 25, yPos + 30);
  doc.text(`CPF: ${usuarioCpf}`, 25, yPos + 37);
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  const textoValidade = doc.splitTextToSize('Documento gerado eletronicamente com validade legal (Lei 14.063/2020)', 165);
  doc.text(textoValidade, 25, yPos + 42);
  
  // Rodapé
  yPos = 270;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('PRIMA QUALITA SAUDE', pageWidth / 2, yPos, { align: 'center' });
  doc.text('www.primaqualitasaude.org', pageWidth / 2, yPos + 5, { align: 'center' });
  doc.text('Rua Dr. Francisco de Souza, n° 728, Centro', pageWidth / 2, yPos + 10, { align: 'center' });
  doc.text('Rio Bonito, RJ - CEP 28800-000', pageWidth / 2, yPos + 15, { align: 'center' });
  doc.text('Telefone: 21 2042-4250', pageWidth / 2, yPos + 20, { align: 'center' });
  doc.text('CNPJ: 40.289.134/0001-99', pageWidth / 2, yPos + 25, { align: 'center' });
  
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