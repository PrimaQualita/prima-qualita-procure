import { PDFDocument } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";

interface ProcessoCompletoResult {
  url: string;
  filename: string;
}

export const gerarProcessoCompletoPDF = async (
  cotacaoId: string,
  numeroProcesso: string
): Promise<ProcessoCompletoResult> => {
  // Criar PDF final que irá conter todos os documentos mesclados
  const pdfFinal = await PDFDocument.create();

  try {
    // 1. Buscar anexos do processo (CAPA, REQUISIÇÃO, AUTORIZAÇÃO, TERMO DE REFERÊNCIA)
    const { data: cotacao } = await supabase
      .from("cotacoes_precos")
      .select("processo_compra_id")
      .eq("id", cotacaoId)
      .single();

    if (cotacao) {
      const { data: anexos } = await supabase
        .from("anexos_processo_compra")
        .select("*")
        .eq("processo_compra_id", cotacao.processo_compra_id)
        .order("data_upload", { ascending: true });

      if (anexos && anexos.length > 0) {
        console.log(`Mesclando ${anexos.length} documentos iniciais...`);
        for (const anexo of anexos) {
          try {
            const response = await fetch(anexo.url_arquivo);
            if (response.ok) {
              const arrayBuffer = await response.arrayBuffer();
              const pdfDoc = await PDFDocument.load(arrayBuffer);
              const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
              copiedPages.forEach((page) => pdfFinal.addPage(page));
              console.log(`✓ Mesclado: ${anexo.nome_arquivo}`);
            }
          } catch (error) {
            console.error(`Erro ao mesclar ${anexo.nome_arquivo}:`, error);
          }
        }
      }
    }

    // 2. Buscar e-mails enviados aos fornecedores
    const { data: emails } = await supabase
      .from("emails_cotacao_anexados")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("data_upload", { ascending: true });

    if (emails && emails.length > 0) {
      console.log(`Mesclando ${emails.length} e-mails enviados...`);
      for (const email of emails) {
        try {
          const response = await fetch(email.url_arquivo);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
            copiedPages.forEach((page) => pdfFinal.addPage(page));
            console.log(`✓ Mesclado: ${email.nome_arquivo}`);
          }
        } catch (error) {
          console.error(`Erro ao mesclar ${email.nome_arquivo}:`, error);
        }
      }
    }

    // 3. Buscar propostas dos fornecedores com seus anexos
    const { data: respostas } = await supabase
      .from("cotacao_respostas_fornecedor")
      .select("id, fornecedores(razao_social)")
      .eq("cotacao_id", cotacaoId)
      .order("data_envio_resposta", { ascending: true });

    if (respostas && respostas.length > 0) {
      for (const resposta of respostas) {
        const { data: anexosFornecedor } = await supabase
          .from("anexos_cotacao_fornecedor")
          .select("*")
          .eq("cotacao_resposta_fornecedor_id", resposta.id);

        if (anexosFornecedor && anexosFornecedor.length > 0) {
          console.log(`Mesclando ${anexosFornecedor.length} documentos do fornecedor ${(resposta.fornecedores as any)?.razao_social}...`);
          for (const anexo of anexosFornecedor) {
            try {
              const response = await fetch(anexo.url_arquivo);
              if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                const pdfDoc = await PDFDocument.load(arrayBuffer);
                const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
                copiedPages.forEach((page) => pdfFinal.addPage(page));
                console.log(`✓ Mesclado: ${anexo.nome_arquivo}`);
              }
            } catch (error) {
              console.error(`Erro ao mesclar ${anexo.nome_arquivo}:`, error);
            }
          }
        }
      }
    }

    // 4. Buscar planilha consolidada
    const { data: planilha } = await supabase
      .from("planilhas_consolidadas")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("data_geracao", { ascending: false })
      .limit(1)
      .single();

    if (planilha) {
      console.log("Mesclando planilha consolidada...");
      try {
        const response = await fetch(planilha.url_arquivo);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const pdfDoc = await PDFDocument.load(arrayBuffer);
          const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
          copiedPages.forEach((page) => pdfFinal.addPage(page));
          console.log(`✓ Mesclado: ${planilha.nome_arquivo}`);
        }
      } catch (error) {
        console.error(`Erro ao mesclar planilha consolidada:`, error);
      }
    }

    // 5. Buscar encaminhamento ao compliance
    const { data: encaminhamento } = await supabase
      .from("encaminhamentos_processo")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (encaminhamento) {
      console.log("Mesclando documento de encaminhamento...");
      try {
        const response = await fetch(encaminhamento.documento_url);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const pdfDoc = await PDFDocument.load(arrayBuffer);
          const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
          copiedPages.forEach((page) => pdfFinal.addPage(page));
          console.log(`✓ Mesclado: ${encaminhamento.documento_nome}`);
        }
      } catch (error) {
        console.error(`Erro ao mesclar documento de encaminhamento:`, error);
      }
    }

    // Salvar PDF mesclado
    const pdfBytes = await pdfFinal.save();
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `processo_completo_${numeroProcesso.replace(/\//g, "-")}_${timestamp}.pdf`;
    const storagePath = `processos/${filename}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, blob, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      console.error("Erro ao fazer upload:", uploadError);
      throw new Error("Erro ao salvar processo completo");
    }

    const { data: urlData } = supabase.storage
      .from("documents")
      .getPublicUrl(storagePath);

    console.log("✅ Processo completo gerado com sucesso!");
    
    return {
      url: urlData.publicUrl,
      filename,
    };
  } catch (error) {
    console.error("Erro ao gerar processo completo:", error);
    throw error;
  }
};
