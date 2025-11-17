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

    // 4. Buscar TODOS os documentos gerados em ordem cronológica
    interface DocumentoOrdenado {
      tipo: string;
      data: string;
      nome: string;
      storagePath?: string;
      url?: string;
      bucket: string;
    }
    
    const documentosOrdenados: DocumentoOrdenado[] = [];

    // 4a. Buscar TODAS as planilhas consolidadas
    const { data: planilhas, error: planilhasError } = await supabase
      .from("planilhas_consolidadas")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("data_geracao", { ascending: true });

    if (planilhasError) {
      console.error("Erro ao buscar planilhas:", planilhasError);
    }

    console.log(`Planilhas consolidadas encontradas: ${planilhas?.length || 0}`);
    
    if (planilhas && planilhas.length > 0) {
      planilhas.forEach(planilha => {
        documentosOrdenados.push({
          tipo: "Planilha Consolidada",
          data: planilha.data_geracao,
          nome: planilha.nome_arquivo,
          storagePath: planilha.url_arquivo,
          bucket: "processo-anexos"
        });
      });
    }

    // 4b. Buscar TODOS os encaminhamentos ao compliance
    const { data: encaminhamentos, error: encaminhamentosError } = await supabase
      .from("encaminhamentos_processo")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("created_at", { ascending: true });

    if (encaminhamentosError) {
      console.error("Erro ao buscar encaminhamentos:", encaminhamentosError);
    }

    console.log(`Encaminhamentos encontrados: ${encaminhamentos?.length || 0}`);
    
    if (encaminhamentos && encaminhamentos.length > 0) {
      encaminhamentos.forEach(enc => {
        documentosOrdenados.push({
          tipo: "Encaminhamento ao Compliance",
          data: enc.created_at,
          nome: `Encaminhamento ${enc.protocolo}`,
          storagePath: enc.storage_path,
          bucket: "processo-anexos"
        });
      });
    }

    // 4c. Buscar TODAS as análises de compliance
    const { data: analises, error: analisesError } = await supabase
      .from("analises_compliance")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("data_analise", { ascending: true });

    if (analisesError) {
      console.error("Erro ao buscar análises:", analisesError);
    }

    console.log(`Análises de compliance encontradas: ${analises?.length || 0}`);
    
    if (analises && analises.length > 0) {
      analises.forEach(analise => {
        if (analise.url_documento) {
          documentosOrdenados.push({
            tipo: "Análise de Compliance",
            data: analise.data_analise || analise.created_at,
            nome: analise.nome_arquivo || `Análise ${analise.protocolo}`,
            url: analise.url_documento,
            bucket: "documents"
          });
        }
      });
    }

    // 4d. Buscar TODOS os relatórios finais
    const { data: relatorios, error: relatoriosError } = await supabase
      .from("relatorios_finais")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("data_geracao", { ascending: true });

    if (relatoriosError) {
      console.error("Erro ao buscar relatórios:", relatoriosError);
    }

    console.log(`Relatórios finais encontrados: ${relatorios?.length || 0}`);
    
    if (relatorios && relatorios.length > 0) {
      relatorios.forEach(relatorio => {
        documentosOrdenados.push({
          tipo: "Relatório Final",
          data: relatorio.data_geracao,
          nome: relatorio.nome_arquivo,
          storagePath: relatorio.url_arquivo,
          bucket: "processo-anexos"
        });
      });
    }

    // 4e. Buscar TODAS as autorizações
    const { data: autorizacoes, error: autorizacoesError } = await supabase
      .from("autorizacoes_processo")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("data_geracao", { ascending: true });

    if (autorizacoesError) {
      console.error("Erro ao buscar autorizações:", autorizacoesError);
    }

    console.log(`Autorizações encontradas: ${autorizacoes?.length || 0}`);
    
    if (autorizacoes && autorizacoes.length > 0) {
      autorizacoes.forEach(aut => {
        documentosOrdenados.push({
          tipo: `Autorização (${aut.tipo_autorizacao})`,
          data: aut.data_geracao,
          nome: aut.nome_arquivo,
          storagePath: aut.url_arquivo,
          bucket: "processo-anexos"
        });
      });
    }

    // 5. Ordenar TODOS os documentos por data cronológica
    documentosOrdenados.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

    console.log(`\n📅 Total de documentos a serem mesclados em ordem cronológica: ${documentosOrdenados.length}`);

    // 6. Mesclar todos os documentos na ordem cronológica
    if (documentosOrdenados.length > 0) {
      console.log("📋 Mesclando documentos em ordem cronológica...\n");
      
      for (const doc of documentosOrdenados) {
        try {
          console.log(`  [${new Date(doc.data).toLocaleString('pt-BR')}] ${doc.tipo}: ${doc.nome}`);
          
          let pdfUrl: string | null = null;

          // Se tem URL pública (análises), usar diretamente
          if (doc.url) {
            pdfUrl = doc.url;
          }
          // Se tem storage path, gerar signed URL
          else if (doc.storagePath) {
            const { data: signedUrlData, error: signedError } = await supabase.storage
              .from(doc.bucket)
              .createSignedUrl(doc.storagePath, 60);
            
            if (signedError || !signedUrlData) {
              console.error(`    ✗ Erro ao gerar URL assinada: ${signedError?.message}`);
              continue;
            }
            
            pdfUrl = signedUrlData.signedUrl;
          }

          if (pdfUrl) {
            const response = await fetch(pdfUrl);
            if (response.ok) {
              const arrayBuffer = await response.arrayBuffer();
              const pdfDoc = await PDFDocument.load(arrayBuffer);
              const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
              copiedPages.forEach((page) => pdfFinal.addPage(page));
              console.log(`    ✓ Mesclado (${copiedPages.length} páginas)`);
            } else {
              console.error(`    ✗ Erro HTTP ${response.status}`);
            }
          }
        } catch (error) {
          console.error(`    ✗ Erro ao mesclar documento:`, error);
        }
      }
    } else {
      console.log("⚠️ Nenhum documento adicional encontrado para mesclar");
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
