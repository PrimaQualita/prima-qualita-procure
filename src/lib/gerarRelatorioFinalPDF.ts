import { jsPDF } from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import logoHorizontal from '@/assets/prima-qualita-logo-horizontal.png';

interface RelatorioFinalResult {
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

interface DadosRelatorioFinal {
  numeroProcesso: string;
  objetoProcesso: string;
  usuarioNome: string;
  usuarioCpf: string;
  fornecedoresVencedores: FornecedorVencedor[];
}

// Função para extrair texto simples de HTML
const extractTextFromHTML = (html: string): string => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
};

export const gerarRelatorioFinal = async (dados: DadosRelatorioFinal): Promise<RelatorioFinalResult> => {
  console.log('[PDF] Iniciando geração - Relatório Final');
  
  const agora = new Date();
  const dataHora = agora.toLocaleString('pt-BR', { 
    dateStyle: 'long', 
    timeStyle: 'medium' 
  });
  const protocolo = `REL-FINAL-${dados.numeroProcesso}-${Date.now()}`;
  
  // Criar PDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Função para adicionar logo e rodapé
  const adicionarLogoERodape = async () => {
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
    doc.text('www.primaqualitasaude.org', pageWidth / 2, yRodape, { align: 'center' });
    doc.text('Rua Dr. Francisco de Souza, nº 728, Centro', pageWidth / 2, yRodape + 5, { align: 'center' });
    doc.text('Rio Bonito, RJ - CEP 28800-000', pageWidth / 2, yRodape + 10, { align: 'center' });
    doc.text('CNPJ: 40.289.134/0001-99', pageWidth / 2, yRodape + 15, { align: 'center' });
  };
  
  // Adicionar logo e rodapé
  await adicionarLogoERodape();
  
  // Título
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('RELATÓRIO FINAL', pageWidth / 2, 45, { align: 'center' });
  
  doc.setFontSize(14);
  doc.text('COTAÇÃO DE PREÇOS', pageWidth / 2, 52, { align: 'center' });
  
  // Processo
  doc.setFontSize(12);
  let yPos = 65;
  doc.text(`PROCESSO ${dados.numeroProcesso}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 10;
  
  // Assunto
  doc.setFont('helvetica', 'bold');
  const textoLimpo = extractTextFromHTML(dados.objetoProcesso);
  const linhasAssunto = doc.splitTextToSize(`ASSUNTO: ${textoLimpo}`, 170);
  doc.text(linhasAssunto, 20, yPos, { align: 'justify', maxWidth: 170 });
  yPos += linhasAssunto.length * 6 + 10;
  
  // Parágrafo 1
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  const texto1 = 'O Pedido de Cotação foi divulgado no site da Prima Qualitá Saúde (www.primaqualitasaude.org), foi encaminhado e-mails conforme comprovantes.';
  const linhas1 = doc.splitTextToSize(texto1, 170);
  doc.text(linhas1, 20, yPos, { align: 'justify', maxWidth: 170 });
  yPos += linhas1.length * 6 + 8;
  
  // Parágrafo 2
  const texto2 = 'Assim, as propostas das empresas proponentes foram analisadas, sendo verificado que a(s) empresa(s) apresentou(aram) menor(res) valor(res), conforme tabela abaixo:';
  const linhas2 = doc.splitTextToSize(texto2, 170);
  doc.text(linhas2, 20, yPos, { align: 'justify', maxWidth: 170 });
  yPos += linhas2.length * 6 + 5;
  
  // Tabela de fornecedores vencedores (igual à autorização)
  if (dados.fornecedoresVencedores && dados.fornecedoresVencedores.length > 0) {
    doc.setFontSize(10);
    
    // Cabeçalho da tabela
    doc.setFillColor(0, 51, 102);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.rect(20, yPos, 50, 8, 'FD');
    doc.rect(70, yPos, 40, 8, 'FD');
    doc.rect(110, yPos, 30, 8, 'FD');
    doc.rect(140, yPos, 50, 8, 'FD');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('Empresa', 45, yPos + 5, { align: 'center' });
    doc.text('CNPJ', 90, yPos + 5, { align: 'center' });
    doc.text('Itens Vencidos', 125, yPos + 5, { align: 'center' });
    doc.text('Valor Total', 165, yPos + 5, { align: 'center' });
    yPos += 8;
    
    // Conteúdo da tabela
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    
    let totalGeral = 0;
    
    const formatarCNPJ = (cnpj: string) => {
      const apenasNumeros = cnpj.replace(/\D/g, '');
      if (apenasNumeros.length === 14) {
        return apenasNumeros.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
      }
      return cnpj;
    };
    
    dados.fornecedoresVencedores.forEach((fornecedor) => {
      const razaoSocialSplit = doc.splitTextToSize(fornecedor.razaoSocial, 45);
      const alturaLinha = Math.max(10, razaoSocialSplit.length * 4 + 4);
      
      doc.rect(20, yPos, 50, alturaLinha);
      doc.rect(70, yPos, 40, alturaLinha);
      doc.rect(110, yPos, 30, alturaLinha);
      doc.rect(140, yPos, 50, alturaLinha);
      
      const offsetVerticalEmpresa = (alturaLinha - (razaoSocialSplit.length * 4)) / 2 + 4;
      razaoSocialSplit.forEach((linha: string, index: number) => {
        doc.text(linha, 22, yPos + offsetVerticalEmpresa + (index * 4), { align: 'left', maxWidth: 46 });
      });
      
      const cnpjFormatado = formatarCNPJ(fornecedor.cnpj);
      const offsetVerticalCNPJ = (alturaLinha - 4) / 2 + 4;
      doc.text(cnpjFormatado, 72, yPos + offsetVerticalCNPJ);
      
      const itensText = fornecedor.itensVencedores.map(i => i.numero).join(', ');
      const offsetVerticalItens = (alturaLinha - 4) / 2 + 4;
      doc.text(itensText, 125, yPos + offsetVerticalItens, { align: 'center' });
      
      const offsetVerticalValor = (alturaLinha - 4) / 2 + 4;
      doc.text(`R$ ${fornecedor.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 188, yPos + offsetVerticalValor, { align: 'right' });
      
      totalGeral += fornecedor.valorTotal;
      yPos += alturaLinha;
    });
    
    // Linha de Total Geral
    doc.setFillColor(240, 240, 240);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.rect(20, yPos, 120, 8, 'FD');
    doc.rect(140, yPos, 50, 8, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('TOTAL GERAL', 22, yPos + 5);
    doc.text(`R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 188, yPos + 5, { align: 'right' });
    yPos += 16;
  }
  
  // Parágrafo 3
  doc.setFont('helvetica', 'normal');
  const texto3 = 'A(s) empresa(s) encaminhou(aram) os documentos de habilitação que foram analisados, concluindo-se que ambas estavam habilitadas.';
  const linhas3 = doc.splitTextToSize(texto3, 170);
  doc.text(linhas3, 20, yPos, { align: 'justify', maxWidth: 170 });
  yPos += linhas3.length * 6 + 8;
  
  // Parágrafo 4
  const texto4 = 'Tendo em vista que o valor cotado está abaixo do estipulado no Art. 12, Inciso VI do Regulamento para Aquisição de Bens, Contratação de Obras, Serviços e Locações da Instituição, verifica-se possibilidade de contratação por NÃO OBRIGATORIEDADE DE SELEÇÃO DE FORNECEDORES.';
  const linhas4 = doc.splitTextToSize(texto4, 170);
  doc.text(linhas4, 20, yPos, { align: 'justify', maxWidth: 170 });
  yPos += linhas4.length * 6 + 8;
  
  // Parágrafo 5
  const texto5 = 'Sendo assim, encaminha-se ao Responsável Legal para autorização do procedimento.';
  const linhas5 = doc.splitTextToSize(texto5, 170);
  doc.text(linhas5, 20, yPos, { align: 'justify', maxWidth: 170 });
  
  // Gerar blob
  console.log('[PDF] Gerando blob...');
  const pdfBlob = doc.output('blob');
  console.log('[PDF] PDF gerado, tamanho:', pdfBlob.size);
  
  if (pdfBlob.size < 3000) {
    throw new Error('PDF muito pequeno, possível erro na geração');
  }
  
  // Upload
  const fileName = `relatorios-finais/processo-${dados.numeroProcesso}-${Date.now()}.pdf`;
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
    fileName: `relatorio-final-${dados.numeroProcesso}.pdf`,
    protocolo,
    storagePath: fileName
  };
};
