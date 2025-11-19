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
  itensVencedores: Array<{ numero: number; valor: number; descricao?: string; marca?: string; valorUnitario?: number }>;
  valorTotal: number;
}

interface FornecedorRejeitado {
  razaoSocial: string;
  motivoRejeicao: string;
}

interface DadosRelatorioFinal {
  numeroProcesso: string;
  objetoProcesso: string;
  usuarioNome: string;
  usuarioCpf: string;
  fornecedoresVencedores: FornecedorVencedor[];
  fornecedoresRejeitados?: FornecedorRejeitado[];
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
    doc.text('Travessa do Ouvidor, 21, Sala 503, Centro, Rio de Janeiro - RJ, CEP: 20.040-040', pageWidth / 2, yRodape + 5, { align: 'center' });
    doc.text('CNPJ: 40.289.134/0001-99', pageWidth / 2, yRodape + 10, { align: 'center' });
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
  
  // Assunto - sanitizar HTML
  doc.setFont('helvetica', 'bold');
  const textoLimpo = extractTextFromHTML(dados.objetoProcesso || '');
  const linhasAssunto = doc.splitTextToSize(`ASSUNTO: ${textoLimpo}`, 170);
  doc.text(linhasAssunto, 20, yPos, { align: 'justify', maxWidth: 170 });
  yPos += linhasAssunto.length * 3.5 + 5;
  
  // Parágrafo 1
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  const texto1 = 'O Pedido de Cotação foi divulgado no site da Prima Qualitá Saúde (www.primaqualitasaude.org), foi encaminhado e-mails conforme comprovantes.';
  const linhas1 = doc.splitTextToSize(texto1, 170);
  doc.text(linhas1, 20, yPos, { align: 'justify', maxWidth: 170 });
  yPos += linhas1.length * 3.5 + 5;
  
  // Parágrafo 2
  const texto2 = 'Assim, as propostas das empresas proponentes foram analisadas, sendo verificado que a(s) empresa(s) apresentou(aram) menor(res) valor(res), conforme tabela abaixo:';
  const linhas2 = doc.splitTextToSize(texto2, 170);
  doc.text(linhas2, 20, yPos, { align: 'justify', maxWidth: 170 });
  yPos += linhas2.length * 3.5 + 5;
  
  // Tabela de fornecedores vencedores com itens agrupados
  if (dados.fornecedoresVencedores && dados.fornecedoresVencedores.length > 0) {
    doc.setFontSize(8);
    
    // Cabeçalho da tabela (sem colunas Marca e Valor Unit.)
    doc.setFillColor(0, 51, 102);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.rect(20, yPos, 60, 8, 'FD');
    doc.rect(80, yPos, 45, 8, 'FD');
    doc.rect(125, yPos, 30, 8, 'FD');
    doc.rect(155, yPos, 35, 8, 'FD');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('Empresa', 50, yPos + 5, { align: 'center' });
    doc.text('CNPJ', 102.5, yPos + 5, { align: 'center' });
    doc.text('Item', 140, yPos + 5, { align: 'center' });
    doc.text('Valor Total', 172.5, yPos + 5, { align: 'center' });
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
      // Agrupar números de itens separados por vírgula
      const numerosItens = fornecedor.itensVencedores
        .map(item => item.numero)
        .sort((a, b) => a - b)
        .join(', ');
      
      const razaoSocialSplit = doc.splitTextToSize(fornecedor.razaoSocial, 55);
      const itensSplit = doc.splitTextToSize(numerosItens, 28);
      const alturaLinha = Math.max(8, Math.max(razaoSocialSplit.length, itensSplit.length) * 4 + 2);
      
      // Verificar se precisa de nova página
      if (yPos + alturaLinha > pageHeight - 30) {
        doc.addPage();
        yPos = 20;
        adicionarLogoERodape();
      }
      
      doc.rect(20, yPos, 60, alturaLinha);
      doc.rect(80, yPos, 45, alturaLinha);
      doc.rect(125, yPos, 30, alturaLinha);
      doc.rect(155, yPos, 35, alturaLinha);
      
      // Razão social
      const offsetVerticalEmpresa = (alturaLinha - (razaoSocialSplit.length * 4)) / 2 + 3;
      razaoSocialSplit.forEach((linha: string, index: number) => {
        doc.text(linha, 22, yPos + offsetVerticalEmpresa + (index * 4), { align: 'left', maxWidth: 56 });
      });
      
      // CNPJ
      const cnpjFormatado = formatarCNPJ(fornecedor.cnpj);
      const cnpjSplit = doc.splitTextToSize(cnpjFormatado, 43);
      const offsetVerticalCNPJ = (alturaLinha - (cnpjSplit.length * 4)) / 2 + 3;
      cnpjSplit.forEach((linha: string, index: number) => {
        doc.text(linha, 82, yPos + offsetVerticalCNPJ + (index * 4), { align: 'left', maxWidth: 41 });
      });
      
      // Itens agrupados (com quebra de linha automática)
      const offsetVerticalItens = (alturaLinha - (itensSplit.length * 4)) / 2 + 3;
      itensSplit.forEach((linha: string, index: number) => {
        doc.text(linha, 140, yPos + offsetVerticalItens + (index * 4), { align: 'center', maxWidth: 28 });
      });
      
      // Valor total do fornecedor
      doc.text(`R$ ${fornecedor.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 187, yPos + (alturaLinha / 2) + 1, { align: 'right' });
      
      yPos += alturaLinha;
      totalGeral += fornecedor.valorTotal;
    });
    
    // Linha de Total Geral
    doc.setFillColor(240, 240, 240);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.rect(20, yPos, 135, 8, 'FD');
    doc.rect(155, yPos, 35, 8, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('TOTAL GERAL', 22, yPos + 5);
    doc.text(`R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 187, yPos + 5, { align: 'right' });
    yPos += 16;
  }
  
  // Parágrafo 3
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  const texto3 = 'A(s) empresa(s) encaminhou(aram) os documentos de habilitação que foram analisados, concluindo-se que ambas estavam habilitadas.';
  const linhas3 = doc.splitTextToSize(texto3, 170);
  doc.text(linhas3, 20, yPos, { align: 'justify', maxWidth: 170 });
  yPos += linhas3.length * 3.5 + 5;
  
  // Observações sobre fornecedores rejeitados
  if (dados.fornecedoresRejeitados && dados.fornecedoresRejeitados.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(139, 0, 0); // Vermelho escuro
    doc.text('OBSERVAÇÕES - FORNECEDORES INABILITADOS/REJEITADOS:', 20, yPos);
    yPos += 7;
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    
    dados.fornecedoresRejeitados.forEach((fornRej) => {
      const textoRejeicao = `A Empresa ${fornRej.razaoSocial} foi Inabilitada/Rejeitada por conta: ${fornRej.motivoRejeicao}`;
      const linhasRejeicao = doc.splitTextToSize(textoRejeicao, 170);
      doc.text(linhasRejeicao, 20, yPos, { align: 'justify', maxWidth: 170 });
      yPos += linhasRejeicao.length * 3.5 + 4;
    });
    
    yPos += 3; // Espaço extra após observações
  }
  
  // Parágrafo 4
  const texto4 = 'Tendo em vista que o valor cotado está abaixo do estipulado no Art. 12, Inciso VI do Regulamento para Aquisição de Bens, Contratação de Obras, Serviços e Locações da Instituição, verifica-se possibilidade de contratação por NÃO OBRIGATORIEDADE DE SELEÇÃO DE FORNECEDORES.';
  const linhas4 = doc.splitTextToSize(texto4, 170);
  doc.text(linhas4, 20, yPos, { align: 'justify', maxWidth: 170 });
  yPos += linhas4.length * 3.5 + 5;
  
  // Parágrafo 5
  const texto5 = 'Sendo assim, encaminha-se ao Responsável Legal para autorização do procedimento.';
  const linhas5 = doc.splitTextToSize(texto5, 170);
  doc.text(linhas5, 20, yPos, { align: 'justify', maxWidth: 170 });
  yPos += linhas5.length * 3.5 + 4; // Espaçamento de 1,15 (aproximadamente 4mm)
  
  // Certificação Digital (sempre na primeira página)
  doc.setFillColor(245, 245, 245);
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.rect(20, yPos, 170, 50, 'FD');
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 51, 102);
  doc.text('CERTIFICAÇÃO DIGITAL - AUTENTICIDADE DO DOCUMENTO', pageWidth / 2, yPos + 6, { align: 'center' });
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  
  const hash = protocolo.replace(/-/g, '').substring(0, 32).toUpperCase();
  
  doc.text(`Protocolo: ${protocolo}`, 25, yPos + 13);
  doc.text(`Data/Hora de Geração: ${dataHora}`, 25, yPos + 19);
  doc.text(`Responsável pela Geração: ${dados.usuarioNome} - CPF: ${dados.usuarioCpf}`, 25, yPos + 25);
  doc.text(`Hash de Verificação: ${hash}`, 25, yPos + 31);
  
  doc.setTextColor(0, 0, 255);
  const urlVerificacao = `${window.location.origin}/verificar-autorizacao?protocolo=${protocolo}`;
  const linkTexto = `Verificar autenticidade em: ${urlVerificacao}`;
  const linkQuebrado = doc.splitTextToSize(linkTexto, 160);
  
  linkQuebrado.forEach((linha: string, index: number) => {
    doc.textWithLink(
      linha,
      25,
      yPos + 38 + (index * 4),
      { url: urlVerificacao }
    );
  });
  
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  const linhasCertificacao = linkQuebrado.length;
  doc.text('Este documento possui certificação digital conforme Lei 14.063/2020', 25, yPos + 43 + (linhasCertificacao > 1 ? (linhasCertificacao - 1) * 4 : 0));
  
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
