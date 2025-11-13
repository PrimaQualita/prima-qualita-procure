// @ts-nocheck - Tabelas podem não existir no schema atual
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
  console.log(`Iniciando geração do processo completo para cotação ${cotacaoId}...`);
  
  // Criar PDF final que irá conter todos os documentos mesclados
  const pdfFinal = await PDFDocument.create();

  try {
    // 1. Buscar anexos do processo (CAPA, REQUISIÇÃO, AUTORIZAÇÃO, TERMO DE REFERÊNCIA)
    const { data: cotacao, error: cotacaoError } = await supabase
      .from("cotacoes_precos")
      .select("processo_compra_id")
      .eq("id", cotacaoId)
      .single();

    if (cotacaoError) {
      console.error("Erro ao buscar cotação:", cotacaoError);
      throw cotacaoError;
    }

    console.log(`Cotação encontrada. Processo ID: ${cotacao?.processo_compra_id}`);

    if (cotacao?.processo_compra_id) {
      const { data: anexos, error: anexosError } = await supabase
        .from("anexos_processo_compra")
        .select("*")
        .eq("processo_compra_id", cotacao.processo_compra_id)
        .order("data_upload", { ascending: true });

      if (anexosError) {
        console.error("Erro ao buscar anexos:", anexosError);
      }

      console.log(`Anexos do processo encontrados: ${anexos?.length || 0}`);

      if (anexos && anexos.length > 0) {
        console.log(`📄 Mesclando ${anexos.length} documentos iniciais do processo...`);
        for (const anexo of anexos) {
          try {
            // Verificar se é PDF
            if (!anexo.nome_arquivo.toLowerCase().endsWith('.pdf')) {
              console.log(`  ⚠️ AVISO: ${anexo.nome_arquivo} não é PDF. Apenas PDFs podem ser mesclados.`);
              continue;
            }
            
            console.log(`  Buscando: ${anexo.tipo_anexo} - ${anexo.nome_arquivo}`);
            console.log(`  Storage path: ${anexo.url_arquivo}`);
            
            // url_arquivo já é o storage path, não precisa extrair
            const { data: signedUrlData, error: signedError } = await supabase.storage
              .from('processo-anexos')
              .createSignedUrl(anexo.url_arquivo, 60);
            
            if (signedError || !signedUrlData) {
              console.error(`  ✗ Erro ao gerar URL assinada: ${signedError?.message}`);
              continue;
            }
            
            const response = await fetch(signedUrlData.signedUrl);
            if (response.ok) {
              const arrayBuffer = await response.arrayBuffer();
              const pdfDoc = await PDFDocument.load(arrayBuffer);
              const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
              copiedPages.forEach((page) => pdfFinal.addPage(page));
              console.log(`  ✓ Mesclado: ${anexo.tipo_anexo} (${copiedPages.length} páginas)`);
            } else {
              console.error(`  ✗ Erro HTTP ${response.status} ao buscar ${anexo.nome_arquivo}`);
            }
          } catch (error) {
            console.error(`  ✗ Erro ao mesclar ${anexo.nome_arquivo}:`, error);
          }
        }
      } else {
        console.log("⚠️ Nenhum anexo do processo encontrado");
      }
    }

    // 2. Buscar e-mails enviados aos fornecedores
    const { data: emails, error: emailsError } = await supabase
      .from("emails_cotacao_anexados")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("data_upload", { ascending: true });

    if (emailsError) {
      console.error("Erro ao buscar emails:", emailsError);
    }

    console.log(`E-mails encontrados: ${emails?.length || 0}`);

    if (emails && emails.length > 0) {
      console.log(`📧 Mesclando ${emails.length} e-mails enviados aos fornecedores...`);
      for (const email of emails) {
        try {
          console.log(`  Buscando: ${email.nome_arquivo}`);
          const response = await fetch(email.url_arquivo);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
            copiedPages.forEach((page) => pdfFinal.addPage(page));
            console.log(`  ✓ Mesclado: ${email.nome_arquivo} (${copiedPages.length} páginas)`);
          } else {
            console.error(`  ✗ Erro HTTP ${response.status} ao buscar ${email.nome_arquivo}`);
          }
        } catch (error) {
          console.error(`  ✗ Erro ao mesclar ${email.nome_arquivo}:`, error);
        }
      }
    } else {
      console.log("⚠️ Nenhum e-mail encontrado");
    }

    // 3. Buscar propostas dos fornecedores com seus anexos
    const { data: respostas, error: respostasError } = await supabase
      .from("cotacao_respostas_fornecedor")
      .select("id, fornecedores(razao_social)")
      .eq("cotacao_id", cotacaoId)
      .order("data_envio_resposta", { ascending: true });

    if (respostasError) {
      console.error("Erro ao buscar respostas:", respostasError);
    }

    console.log(`Respostas de fornecedores encontradas: ${respostas?.length || 0}`);

    if (respostas && respostas.length > 0) {
      console.log(`📦 Mesclando propostas de ${respostas.length} fornecedores...`);
      for (const resposta of respostas) {
        const { data: anexosFornecedor, error: anexosFornError } = await supabase
          .from("anexos_cotacao_fornecedor")
          .select("*")
          .eq("cotacao_resposta_fornecedor_id", resposta.id);

        if (anexosFornError) {
          console.error(`  Erro ao buscar anexos do fornecedor:`, anexosFornError);
        }

        const razaoSocial = (resposta.fornecedores as any)?.razao_social || 'Fornecedor';
        console.log(`  Fornecedor: ${razaoSocial} - ${anexosFornecedor?.length || 0} documentos`);

        if (anexosFornecedor && anexosFornecedor.length > 0) {
          for (const anexo of anexosFornecedor) {
            try {
              // Verificar se é PDF
              if (!anexo.nome_arquivo.toLowerCase().endsWith('.pdf')) {
                console.log(`    ⚠️ AVISO: ${anexo.nome_arquivo} não é PDF. Apenas PDFs podem ser mesclados.`);
                continue;
              }
              
              console.log(`    Buscando: ${anexo.tipo_anexo} - ${anexo.nome_arquivo}`);
              console.log(`    Storage path: ${anexo.url_arquivo}`);
              
              // url_arquivo já é o storage path
              const { data: signedUrlData, error: signedError } = await supabase.storage
                .from('processo-anexos')
                .createSignedUrl(anexo.url_arquivo, 60);
              
              if (signedError || !signedUrlData) {
                console.error(`    ✗ Erro ao gerar URL assinada: ${signedError?.message}`);
                continue;
              }
              
              const response = await fetch(signedUrlData.signedUrl);
              if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                const pdfDoc = await PDFDocument.load(arrayBuffer);
                const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
                copiedPages.forEach((page) => pdfFinal.addPage(page));
                console.log(`    ✓ Mesclado: ${anexo.tipo_anexo} (${copiedPages.length} páginas)`);
              } else {
                console.error(`    ✗ Erro HTTP ${response.status} ao buscar ${anexo.nome_arquivo}`);
              }
            } catch (error) {
              console.error(`    ✗ Erro ao mesclar ${anexo.nome_arquivo}:`, error);
            }
          }
        }
      }
    } else {
      console.log("⚠️ Nenhuma proposta de fornecedor encontrada");
    }

    // 4. Buscar planilha consolidada
    const { data: planilha, error: planilhaError } = await supabase
      .from("planilhas_consolidadas")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("data_geracao", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (planilhaError) {
      console.error("Erro ao buscar planilha:", planilhaError);
    }

    console.log(`Planilha consolidada: ${planilha ? planilha.nome_arquivo : 'não encontrada'}`);

    if (planilha) {
      console.log("📊 Mesclando planilha consolidada...");
      try {
        console.log(`  Buscando: ${planilha.nome_arquivo}`);
        console.log(`  Storage path: ${planilha.url_arquivo}`);
        
        // Bucket documents é público, usar getPublicUrl
        const { data: publicUrlData } = supabase.storage
          .from('documents')
          .getPublicUrl(planilha.url_arquivo);
        
        console.log(`  Public URL: ${publicUrlData.publicUrl}`);
        
        const response = await fetch(publicUrlData.publicUrl);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const pdfDoc = await PDFDocument.load(arrayBuffer);
          const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
          copiedPages.forEach((page) => pdfFinal.addPage(page));
          console.log(`  ✓ Mesclado: ${planilha.nome_arquivo} (${copiedPages.length} páginas)`);
        } else {
          console.error(`  ✗ Erro HTTP ${response.status} ao buscar planilha`);
        }
      } catch (error) {
        console.error(`  ✗ Erro ao mesclar planilha consolidada:`, error);
      }
    } else {
      console.log("⚠️ Planilha consolidada não encontrada");
    }

    // 5. Buscar encaminhamento ao compliance
    const { data: encaminhamento, error: encaminhamentoError } = await supabase
      .from("encaminhamentos_processo")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (encaminhamentoError) {
      console.error("Erro ao buscar encaminhamento:", encaminhamentoError);
    }

    console.log(`Encaminhamento: ${encaminhamento ? encaminhamento.protocolo : 'não encontrado'}`);

    if (encaminhamento) {
      console.log("📋 Mesclando documento de encaminhamento ao compliance...");
      try {
        console.log(`  Buscando: ${encaminhamento.protocolo}`);
        
        // Usar o storage_path do encaminhamento
        const { data: signedUrlData, error: signedError } = await supabase.storage
          .from('processo-anexos')
          .createSignedUrl(encaminhamento.storage_path, 60);
        
        if (signedError || !signedUrlData) {
          console.error(`  ✗ Erro ao gerar URL assinada para encaminhamento: ${signedError?.message}`);
        } else {
          const response = await fetch(signedUrlData.signedUrl);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
            copiedPages.forEach((page) => pdfFinal.addPage(page));
            console.log(`  ✓ Mesclado: Encaminhamento ${encaminhamento.protocolo} (${copiedPages.length} páginas)`);
          } else {
            console.error(`  ✗ Erro HTTP ${response.status} ao buscar encaminhamento`);
          }
        }
      } catch (error) {
        console.error(`  ✗ Erro ao mesclar documento de encaminhamento:`, error);
      }
    } else {
      console.log("⚠️ Encaminhamento ao compliance não encontrado");
    }

    // Verificar se há páginas no PDF final
    const totalPaginas = pdfFinal.getPageCount();
    console.log(`\n📑 Total de páginas mescladas: ${totalPaginas}`);

    if (totalPaginas === 0) {
      throw new Error("Nenhum documento foi encontrado para mesclar. Verifique se há documentos anexados ao processo.");
    }

    // Salvar PDF mesclado
    console.log("\n💾 Salvando PDF mesclado...");
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
      console.error("❌ Erro ao fazer upload:", uploadError);
      throw new Error("Erro ao salvar processo completo");
    }

    const { data: urlData } = supabase.storage
      .from("documents")
      .getPublicUrl(storagePath);

    console.log("✅ Processo completo gerado com sucesso!");
    console.log(`   Arquivo: ${filename}`);
    console.log(`   Páginas: ${totalPaginas}`);
    
    return {
      url: urlData.publicUrl,
      filename,
    };
  } catch (error) {
    console.error("❌ Erro ao gerar processo completo:", error);
    throw error;
  }
};
