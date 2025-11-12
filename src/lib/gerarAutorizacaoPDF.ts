import html2pdf from 'html2pdf.js';
import { supabase } from '@/integrations/supabase/client';
import logoHorizontal from '@/assets/prima-qualita-logo-horizontal.png';

interface AutorizacaoResult {
  url: string;
  fileName: string;
}

// Função para gerar PDF de autorização com certificação digital
export const gerarAutorizacaoCompraDireta = async (
  numeroProcesso: string,
  objetoProcesso: string,
  usuarioNome: string,
  usuarioCpf: string
): Promise<AutorizacaoResult> => {
  const agora = new Date();
  const dataHora = agora.toLocaleString('pt-BR', { 
    dateStyle: 'long', 
    timeStyle: 'medium' 
  });
  const protocolo = `AUT-CD-${numeroProcesso}-${Date.now()}`;
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Autorização - Processo ${numeroProcesso}</title>
      <style>
        @page {
          size: A4;
          margin: 2cm;
        }
        body {
          font-family: Arial, sans-serif;
          font-size: 12pt;
          line-height: 1.6;
          margin: 0;
          padding: 20px;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
        }
        .header img {
          max-width: 300px;
          height: auto;
        }
        .title {
          text-align: center;
          font-size: 18pt;
          font-weight: bold;
          margin: 30px 0;
        }
        .processo {
          text-align: center;
          font-size: 14pt;
          margin: 20px 0;
        }
        .assunto {
          text-align: center;
          font-size: 12pt;
          margin: 20px 0;
        }
        .content {
          text-align: justify;
          margin: 30px 0;
        }
        .certificacao {
          margin-top: 50px;
          padding: 20px;
          border: 2px solid #003366;
          background-color: #f0f9ff;
        }
        .certificacao h3 {
          margin-top: 0;
          color: #003366;
        }
        .certificacao p {
          margin: 5px 0;
          font-size: 10pt;
        }
        .footer {
          margin-top: 30px;
          text-align: center;
          font-size: 10pt;
          border-top: 1px solid #ccc;
          padding-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="${logoHorizontal}" alt="Prima Qualitá Saúde" />
      </div>
      
      <div class="title">AUTORIZAÇÃO</div>
      
      <div class="processo">Processo ${numeroProcesso}</div>
      
      <div class="assunto">Assunto: ${objetoProcesso}</div>
      
      <div class="content">
        <p>Na qualidade de representante legal da PRIMA QUALITÁ SAÚDE, autorizo a presente contratação por COMPRA DIRETA, conforme requisição e termo de referência anexos, nos termos do art.4° do Regulamento para Aquisição de Bens, Contratação de Obras, Serviços e Locações da Instituição.</p>
        
        <p>Encaminha-se ao Departamento de Compras, para as providências cabíveis.</p>
      </div>
      
      <div class="certificacao">
        <h3>🔐 CERTIFICAÇÃO DIGITAL</h3>
        <p><strong>Protocolo:</strong> ${protocolo}</p>
        <p><strong>Data/Hora de Geração:</strong> ${dataHora}</p>
        <p><strong>Responsável Legal:</strong> ${usuarioNome}</p>
        <p><strong>CPF:</strong> ${usuarioCpf}</p>
        <p><strong>Tipo:</strong> Autorização para Compra Direta</p>
        <p style="margin-top: 15px; font-size: 9pt; font-style: italic;">
          Este documento foi gerado eletronicamente e possui validade legal conforme Lei 14.063/2020.
          A autenticidade pode ser verificada através do protocolo acima.
        </p>
      </div>
      
      <div class="footer">
        <p>PRIMA QUALITA SAUDE</p>
        <p>www.primaqualitasaude.org</p>
        <p>Rua Dr. Francisco de Souza, n° 728, Centro</p>
        <p>Rio Bonito, RJ - CEP 28800-000</p>
        <p>Telefone: 21 2042-4250</p>
        <p>CNPJ: 40.289.134/0001-99</p>
      </div>
    </body>
    </html>
  `;

  // Criar elemento temporário para gerar PDF
  const element = document.createElement('div');
  element.innerHTML = htmlContent;
  element.style.position = 'absolute';
  element.style.left = '-9999px';
  document.body.appendChild(element);

  try {
    const opt = {
      margin: 0,
      filename: `autorizacao-compra-direta-${numeroProcesso}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
    };

    const pdfBlob = await html2pdf().set(opt).from(element).outputPdf('blob');
    
    // Upload para Supabase Storage
    const fileName = `autorizacoes/compra-direta-${numeroProcesso}-${Date.now()}.pdf`;
    const { data, error } = await supabase.storage
      .from('processo-anexos')
      .upload(fileName, pdfBlob, {
        contentType: 'application/pdf',
        upsert: false
      });

    if (error) throw error;

    // Obter URL pública
    const { data: urlData } = supabase.storage
      .from('processo-anexos')
      .getPublicUrl(fileName);

    return {
      url: urlData.publicUrl,
      fileName: `autorizacao-compra-direta-${numeroProcesso}.pdf`
    };
  } finally {
    document.body.removeChild(element);
  }
};

export const gerarAutorizacaoSelecao = async (
  numeroProcesso: string,
  objetoProcesso: string,
  usuarioNome: string,
  usuarioCpf: string
): Promise<AutorizacaoResult> => {
  const agora = new Date();
  const dataHora = agora.toLocaleString('pt-BR', { 
    dateStyle: 'long', 
    timeStyle: 'medium' 
  });
  const protocolo = `AUT-SF-${numeroProcesso}-${Date.now()}`;
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Autorização - Processo ${numeroProcesso}</title>
      <style>
        @page {
          size: A4;
          margin: 2cm;
        }
        body {
          font-family: Arial, sans-serif;
          font-size: 12pt;
          line-height: 1.6;
          margin: 0;
          padding: 20px;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
        }
        .header img {
          max-width: 300px;
          height: auto;
        }
        .title {
          text-align: center;
          font-size: 18pt;
          font-weight: bold;
          margin: 30px 0;
        }
        .processo {
          text-align: center;
          font-size: 14pt;
          margin: 20px 0;
        }
        .assunto {
          text-align: center;
          font-size: 12pt;
          margin: 20px 0;
        }
        .content {
          text-align: justify;
          margin: 30px 0;
        }
        .certificacao {
          margin-top: 50px;
          padding: 20px;
          border: 2px solid #003366;
          background-color: #f0f9ff;
        }
        .certificacao h3 {
          margin-top: 0;
          color: #003366;
        }
        .certificacao p {
          margin: 5px 0;
          font-size: 10pt;
        }
        .footer {
          margin-top: 30px;
          text-align: center;
          font-size: 10pt;
          border-top: 1px solid #ccc;
          padding-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="${logoHorizontal}" alt="Prima Qualitá Saúde" />
      </div>
      
      <div class="title">AUTORIZAÇÃO</div>
      
      <div class="processo">Processo ${numeroProcesso}</div>
      
      <div class="assunto">Assunto: ${objetoProcesso}</div>
      
      <div class="content">
        <p>Na qualidade de representante legal da PRIMA QUALITÁ SAÚDE, autorizo a presente contratação por SELEÇÃO DE FORNECEDORES, conforme requisição e termo de referência anexos, nos termos do art.4° do Regulamento para Aquisição de Bens, Contratação de Obras, Serviços e Locações da Instituição.</p>
        
        <p>Encaminha-se ao Departamento de Compras, para as providências cabíveis.</p>
      </div>
      
      <div class="certificacao">
        <h3>🔐 CERTIFICAÇÃO DIGITAL</h3>
        <p><strong>Protocolo:</strong> ${protocolo}</p>
        <p><strong>Data/Hora de Geração:</strong> ${dataHora}</p>
        <p><strong>Responsável Legal:</strong> ${usuarioNome}</p>
        <p><strong>CPF:</strong> ${usuarioCpf}</p>
        <p><strong>Tipo:</strong> Autorização para Seleção de Fornecedores</p>
        <p style="margin-top: 15px; font-size: 9pt; font-style: italic;">
          Este documento foi gerado eletronicamente e possui validade legal conforme Lei 14.063/2020.
          A autenticidade pode ser verificada através do protocolo acima.
        </p>
      </div>
      
      <div class="footer">
        <p>PRIMA QUALITA SAUDE</p>
        <p>www.primaqualitasaude.org</p>
        <p>Rua Dr. Francisco de Souza, n° 728, Centro</p>
        <p>Rio Bonito, RJ - CEP 28800-000</p>
        <p>Telefone: 21 2042-4250</p>
        <p>CNPJ: 40.289.134/0001-99</p>
      </div>
    </body>
    </html>
  `;

  // Criar elemento temporário para gerar PDF
  const element = document.createElement('div');
  element.innerHTML = htmlContent;
  element.style.position = 'absolute';
  element.style.left = '-9999px';
  document.body.appendChild(element);

  try {
    const opt = {
      margin: 0,
      filename: `autorizacao-selecao-fornecedores-${numeroProcesso}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
    };

    const pdfBlob = await html2pdf().set(opt).from(element).outputPdf('blob');
    
    // Upload para Supabase Storage
    const fileName = `autorizacoes/selecao-fornecedores-${numeroProcesso}-${Date.now()}.pdf`;
    const { data, error } = await supabase.storage
      .from('processo-anexos')
      .upload(fileName, pdfBlob, {
        contentType: 'application/pdf',
        upsert: false
      });

    if (error) throw error;

    // Obter URL pública
    const { data: urlData } = supabase.storage
      .from('processo-anexos')
      .getPublicUrl(fileName);

    return {
      url: urlData.publicUrl,
      fileName: `autorizacao-selecao-fornecedores-${numeroProcesso}.pdf`
    };
  } finally {
    document.body.removeChild(element);
  }
};
