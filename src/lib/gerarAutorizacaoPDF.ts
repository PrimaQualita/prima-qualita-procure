// Função para gerar PDF de autorização usando apenas HTML/CSS e window.print()
export const gerarAutorizacaoCompraDireta = async (
  numeroProcesso: string,
  objetoProcesso: string
): Promise<void> => {
  // Criar um iframe invisível para impressão
  const printWindow = window.open('', '', 'height=842,width=595');
  
  if (!printWindow) {
    throw new Error('Não foi possível abrir janela de impressão');
  }

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
        .header h1 {
          font-size: 16pt;
          margin: 10px 0;
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
        .footer {
          margin-top: 50px;
          text-align: center;
          font-size: 10pt;
          border-top: 1px solid #ccc;
          padding-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>PRIMA QUALITA SAUDE</h1>
      </div>
      
      <div class="title">AUTORIZAÇÃO</div>
      
      <div class="processo">Processo ${numeroProcesso}</div>
      
      <div class="assunto">Assunto: ${objetoProcesso}</div>
      
      <div class="content">
        <p>Na qualidade de representante legal da PRIMA QUALITÁ SAÚDE, autorizo a presente contratação por COMPRA DIRETA, conforme requisição e termo de referência anexos, nos termos do art.4° do Regulamento para Aquisição de Bens, Contratação de Obras, Serviços e Locações da Instituição.</p>
        
        <p>Encaminha-se ao Departamento de Compras, para as providências cabíveis.</p>
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

  printWindow.document.write(htmlContent);
  printWindow.document.close();
  
  // Aguardar um pouco para garantir que o conteúdo foi carregado
  await new Promise(resolve => setTimeout(resolve, 500));
  
  printWindow.print();
  printWindow.close();
};

export const gerarAutorizacaoSelecao = async (
  numeroProcesso: string,
  objetoProcesso: string
): Promise<void> => {
  const printWindow = window.open('', '', 'height=842,width=595');
  
  if (!printWindow) {
    throw new Error('Não foi possível abrir janela de impressão');
  }

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
        .header h1 {
          font-size: 16pt;
          margin: 10px 0;
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
        .footer {
          margin-top: 50px;
          text-align: center;
          font-size: 10pt;
          border-top: 1px solid #ccc;
          padding-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>PRIMA QUALITA SAUDE</h1>
      </div>
      
      <div class="title">AUTORIZAÇÃO</div>
      
      <div class="processo">Processo ${numeroProcesso}</div>
      
      <div class="assunto">Assunto: ${objetoProcesso}</div>
      
      <div class="content">
        <p>Na qualidade de representante legal da PRIMA QUALITÁ SAÚDE, autorizo a presente contratação por SELEÇÃO DE FORNECEDORES, conforme requisição e termo de referência anexos, nos termos do art.4° do Regulamento para Aquisição de Bens, Contratação de Obras, Serviços e Locações da Instituição.</p>
        
        <p>Encaminha-se ao Departamento de Compras, para as providências cabíveis.</p>
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

  printWindow.document.write(htmlContent);
  printWindow.document.close();
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  printWindow.print();
  printWindow.close();
};
