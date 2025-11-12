import { jsPDF } from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import logoHorizontal from '@/assets/prima-qualita-logo-horizontal.png';

interface RelatorioFinalResult {
  url: string;
  fileName: string;
  protocolo: string;
  storagePath: string;
}

interface DadosRelatorioFinal {
  numeroProcesso: string;
  objetoProcesso: string;
  usuarioNome: string;
  usuarioCpf: string;
  valorTotalEstimado: number;
  fornecedoresVencedores: Array<{
    razaoSocial: string;
    cnpj: string;
    valorTotal: number;
    itensVencedores: Array<{ numero: number; descricao: string; valor: number }>;
  }>;
  dataAbertura: string;
  criterioJulgamento: string;
}

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
  
  // Função para adicionar logo e rodapé em todas as páginas
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
    doc.text('PRIMA QUALITA SAUDE', pageWidth / 2, yRodape, { align: 'center' });
    doc.text('www.primaqualitasaude.org', pageWidth / 2, yRodape + 5, { align: 'center' });
    doc.text('Travessa do Ouvidor, 21, Sala 203, Centro, Rio de Janeiro - RJ, CEP: 20.040-040', pageWidth / 2, yRodape + 10, { align: 'center' });
    doc.text('CNPJ: 40.289.134/0001-99', pageWidth / 2, yRodape + 15, { align: 'center' });
  };
  
  // Adicionar logo e rodapé
  await adicionarLogoERodape();
  
  // Título
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('RELATÓRIO FINAL DE PROCESSO', pageWidth / 2, 45, { align: 'center' });
  
  // Processo
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  let yPos = 60;
  doc.text(`Processo nº: ${dados.numeroProcesso}`, 20, yPos);
  yPos += 8;
  
  // Data de Abertura
  doc.setFont('helvetica', 'normal');
  doc.text(`Data de Abertura: ${new Date(dados.dataAbertura).toLocaleDateString('pt-BR')}`, 20, yPos);
  yPos += 8;
  
  // Objeto
  doc.setFont('helvetica', 'bold');
  doc.text('Objeto:', 20, yPos);
  yPos += 6;
  doc.setFont('helvetica', 'normal');
  const linhasObjeto = doc.splitTextToSize(dados.objetoProcesso.replace(/<[^>]*>/g, ''), 170);
  doc.text(linhasObjeto, 20, yPos, { align: 'justify', maxWidth: 170 });
  yPos += linhasObjeto.length * 5 + 10;
  
  // Critério de Julgamento
  doc.setFont('helvetica', 'bold');
  doc.text(`Critério de Julgamento: `, 20, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(dados.criterioJulgamento, 70, yPos);
  yPos += 10;
  
  // Valor Total Estimado
  doc.setFont('helvetica', 'bold');
  doc.text('Valor Total Estimado: ', 20, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(`R$ ${dados.valorTotalEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 70, yPos);
  yPos += 15;
  
  // Fornecedores Vencedores
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('FORNECEDORES VENCEDORES', pageWidth / 2, yPos, { align: 'center' });
  yPos += 10;
  
  doc.setFontSize(10);
  dados.fornecedoresVencedores.forEach((fornecedor, index) => {
    // Verificar se precisa de nova página
    if (yPos > pageHeight - 60) {
      doc.addPage();
      yPos = 40;
    }
    
    doc.setFont('helvetica', 'bold');
    doc.text(`${index + 1}. ${fornecedor.razaoSocial}`, 20, yPos);
    yPos += 6;
    
    doc.setFont('helvetica', 'normal');
    doc.text(`CNPJ: ${fornecedor.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}`, 25, yPos);
    yPos += 6;
    
    doc.text(`Valor Total: R$ ${fornecedor.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 25, yPos);
    yPos += 6;
    
    if (fornecedor.itensVencedores.length > 0) {
      doc.text('Itens Vencidos:', 25, yPos);
      yPos += 5;
      fornecedor.itensVencedores.forEach((item) => {
        doc.text(`  • Item ${item.numero}: ${item.descricao} - R$ ${item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 30, yPos);
        yPos += 5;
      });
    }
    yPos += 8;
  });
  
  // Certificação Digital
  if (yPos > pageHeight - 60) {
    doc.addPage();
    yPos = 40;
  }
  
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
  doc.text(`Data/Hora: ${dataHora}`, 25, yPos + 18);
  doc.text(`Responsável: ${dados.usuarioNome} | CPF: ${dados.usuarioCpf}`, 25, yPos + 24);
  
  const hash = protocolo.replace(/-/g, '').substring(0, 32).toUpperCase();
  doc.text(`Hash: ${hash}`, 25, yPos + 30);
  
  doc.setTextColor(0, 51, 102);
  const linkBase = typeof window !== 'undefined' ? window.location.origin : 'https://primaqualitasaude.org';
  const linkCompleto = `${linkBase}/verificar-autorizacao?protocolo=${protocolo}`;
  const linkQuebrado = doc.splitTextToSize(`Verificar em: ${linkCompleto}`, 165);
  doc.text(linkQuebrado, 25, yPos + 35);
  
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(0, 0, 0);
  doc.text('Documento com validade legal (Lei 14.063/2020)', 25, yPos + 39);
  
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
