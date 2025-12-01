export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      analises_compliance: {
        Row: {
          conclusao: string | null
          consideracoes_finais: string | null
          cotacao_id: string
          created_at: string | null
          criterio_julgamento: string
          data_analise: string | null
          empresas: Json
          empresas_reprovadas: string[] | null
          id: string
          nome_arquivo: string | null
          objeto_descricao: string
          processo_numero: string
          protocolo: string | null
          status_aprovacao: string | null
          updated_at: string | null
          url_documento: string | null
          usuario_analista_id: string | null
        }
        Insert: {
          conclusao?: string | null
          consideracoes_finais?: string | null
          cotacao_id: string
          created_at?: string | null
          criterio_julgamento: string
          data_analise?: string | null
          empresas?: Json
          empresas_reprovadas?: string[] | null
          id?: string
          nome_arquivo?: string | null
          objeto_descricao: string
          processo_numero: string
          protocolo?: string | null
          status_aprovacao?: string | null
          updated_at?: string | null
          url_documento?: string | null
          usuario_analista_id?: string | null
        }
        Update: {
          conclusao?: string | null
          consideracoes_finais?: string | null
          cotacao_id?: string
          created_at?: string | null
          criterio_julgamento?: string
          data_analise?: string | null
          empresas?: Json
          empresas_reprovadas?: string[] | null
          id?: string
          nome_arquivo?: string | null
          objeto_descricao?: string
          processo_numero?: string
          protocolo?: string | null
          status_aprovacao?: string | null
          updated_at?: string | null
          url_documento?: string | null
          usuario_analista_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analises_compliance_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes_precos"
            referencedColumns: ["id"]
          },
        ]
      }
      anexos_cotacao_fornecedor: {
        Row: {
          cotacao_resposta_fornecedor_id: string
          data_upload: string | null
          id: string
          nome_arquivo: string
          tipo_anexo: string
          url_arquivo: string
        }
        Insert: {
          cotacao_resposta_fornecedor_id: string
          data_upload?: string | null
          id?: string
          nome_arquivo: string
          tipo_anexo: string
          url_arquivo: string
        }
        Update: {
          cotacao_resposta_fornecedor_id?: string
          data_upload?: string | null
          id?: string
          nome_arquivo?: string
          tipo_anexo?: string
          url_arquivo?: string
        }
        Relationships: [
          {
            foreignKeyName: "anexos_cotacao_fornecedor_cotacao_resposta_fornecedor_id_fkey"
            columns: ["cotacao_resposta_fornecedor_id"]
            isOneToOne: false
            referencedRelation: "cotacao_respostas_fornecedor"
            referencedColumns: ["id"]
          },
        ]
      }
      anexos_processo_compra: {
        Row: {
          data_upload: string | null
          id: string
          nome_arquivo: string
          processo_compra_id: string
          tipo_anexo: string
          url_arquivo: string
          usuario_upload_id: string | null
        }
        Insert: {
          data_upload?: string | null
          id?: string
          nome_arquivo: string
          processo_compra_id: string
          tipo_anexo: string
          url_arquivo: string
          usuario_upload_id?: string | null
        }
        Update: {
          data_upload?: string | null
          id?: string
          nome_arquivo?: string
          processo_compra_id?: string
          tipo_anexo?: string
          url_arquivo?: string
          usuario_upload_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anexos_processo_compra_processo_compra_id_fkey"
            columns: ["processo_compra_id"]
            isOneToOne: false
            referencedRelation: "processos_compras"
            referencedColumns: ["id"]
          },
        ]
      }
      anexos_selecao: {
        Row: {
          created_at: string
          data_upload: string
          id: string
          nome_arquivo: string
          selecao_id: string
          tipo_documento: string
          url_arquivo: string
          usuario_upload_id: string | null
        }
        Insert: {
          created_at?: string
          data_upload?: string
          id?: string
          nome_arquivo: string
          selecao_id: string
          tipo_documento: string
          url_arquivo: string
          usuario_upload_id?: string | null
        }
        Update: {
          created_at?: string
          data_upload?: string
          id?: string
          nome_arquivo?: string
          selecao_id?: string
          tipo_documento?: string
          url_arquivo?: string
          usuario_upload_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anexos_selecao_selecao_id_fkey"
            columns: ["selecao_id"]
            isOneToOne: false
            referencedRelation: "selecoes_fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      atas_assinaturas_fornecedor: {
        Row: {
          ata_id: string
          created_at: string
          data_assinatura: string | null
          data_notificacao: string | null
          fornecedor_id: string
          id: string
          ip_assinatura: string | null
          observacao: string | null
          responsaveis_assinantes: Json | null
          status_assinatura: string
        }
        Insert: {
          ata_id: string
          created_at?: string
          data_assinatura?: string | null
          data_notificacao?: string | null
          fornecedor_id: string
          id?: string
          ip_assinatura?: string | null
          observacao?: string | null
          responsaveis_assinantes?: Json | null
          status_assinatura?: string
        }
        Update: {
          ata_id?: string
          created_at?: string
          data_assinatura?: string | null
          data_notificacao?: string | null
          fornecedor_id?: string
          id?: string
          ip_assinatura?: string | null
          observacao?: string | null
          responsaveis_assinantes?: Json | null
          status_assinatura?: string
        }
        Relationships: [
          {
            foreignKeyName: "atas_assinaturas_fornecedor_ata_id_fkey"
            columns: ["ata_id"]
            isOneToOne: false
            referencedRelation: "atas_selecao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atas_assinaturas_fornecedor_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      atas_assinaturas_usuario: {
        Row: {
          ata_id: string
          created_at: string
          data_assinatura: string | null
          data_notificacao: string | null
          id: string
          ip_assinatura: string | null
          observacao: string | null
          status_assinatura: string
          usuario_id: string
        }
        Insert: {
          ata_id: string
          created_at?: string
          data_assinatura?: string | null
          data_notificacao?: string | null
          id?: string
          ip_assinatura?: string | null
          observacao?: string | null
          status_assinatura?: string
          usuario_id: string
        }
        Update: {
          ata_id?: string
          created_at?: string
          data_assinatura?: string | null
          data_notificacao?: string | null
          id?: string
          ip_assinatura?: string | null
          observacao?: string | null
          status_assinatura?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atas_assinaturas_usuario_ata_id_fkey"
            columns: ["ata_id"]
            isOneToOne: false
            referencedRelation: "atas_selecao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atas_assinaturas_usuario_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      atas_selecao: {
        Row: {
          created_at: string
          data_envio_fornecedores: string | null
          data_geracao: string
          enviada_fornecedores: boolean | null
          id: string
          nome_arquivo: string
          protocolo: string
          selecao_id: string
          url_arquivo: string
          url_arquivo_original: string | null
          usuario_gerador_id: string | null
        }
        Insert: {
          created_at?: string
          data_envio_fornecedores?: string | null
          data_geracao?: string
          enviada_fornecedores?: boolean | null
          id?: string
          nome_arquivo: string
          protocolo: string
          selecao_id: string
          url_arquivo: string
          url_arquivo_original?: string | null
          usuario_gerador_id?: string | null
        }
        Update: {
          created_at?: string
          data_envio_fornecedores?: string | null
          data_geracao?: string
          enviada_fornecedores?: boolean | null
          id?: string
          nome_arquivo?: string
          protocolo?: string
          selecao_id?: string
          url_arquivo?: string
          url_arquivo_original?: string | null
          usuario_gerador_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atas_selecao_selecao_id_fkey"
            columns: ["selecao_id"]
            isOneToOne: false
            referencedRelation: "selecoes_fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          acao: string
          created_at: string | null
          detalhes: Json | null
          entidade: string
          entidade_id: string | null
          id: string
          usuario_id: string | null
          usuario_nome: string | null
          usuario_tipo: string | null
        }
        Insert: {
          acao: string
          created_at?: string | null
          detalhes?: Json | null
          entidade: string
          entidade_id?: string | null
          id?: string
          usuario_id?: string | null
          usuario_nome?: string | null
          usuario_tipo?: string | null
        }
        Update: {
          acao?: string
          created_at?: string | null
          detalhes?: Json | null
          entidade?: string
          entidade_id?: string | null
          id?: string
          usuario_id?: string | null
          usuario_nome?: string | null
          usuario_tipo?: string | null
        }
        Relationships: []
      }
      autorizacoes_processo: {
        Row: {
          cotacao_id: string
          created_at: string | null
          data_geracao: string
          id: string
          nome_arquivo: string
          protocolo: string
          tipo_autorizacao: string
          url_arquivo: string
          usuario_gerador_id: string
        }
        Insert: {
          cotacao_id: string
          created_at?: string | null
          data_geracao?: string
          id?: string
          nome_arquivo: string
          protocolo: string
          tipo_autorizacao: string
          url_arquivo: string
          usuario_gerador_id: string
        }
        Update: {
          cotacao_id?: string
          created_at?: string | null
          data_geracao?: string
          id?: string
          nome_arquivo?: string
          protocolo?: string
          tipo_autorizacao?: string
          url_arquivo?: string
          usuario_gerador_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "autorizacoes_processo_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes_precos"
            referencedColumns: ["id"]
          },
        ]
      }
      avaliacoes_cadastro_fornecedor: {
        Row: {
          classificacao_risco: string | null
          created_at: string | null
          data_envio: string
          data_resposta: string | null
          enviado_por_id: string | null
          fornecedor_id: string
          id: string
          observacoes_compliance: string | null
          score_risco_total: number | null
          status_avaliacao: string
          updated_at: string | null
          usuario_compliance_id: string | null
        }
        Insert: {
          classificacao_risco?: string | null
          created_at?: string | null
          data_envio?: string
          data_resposta?: string | null
          enviado_por_id?: string | null
          fornecedor_id: string
          id?: string
          observacoes_compliance?: string | null
          score_risco_total?: number | null
          status_avaliacao?: string
          updated_at?: string | null
          usuario_compliance_id?: string | null
        }
        Update: {
          classificacao_risco?: string | null
          created_at?: string | null
          data_envio?: string
          data_resposta?: string | null
          enviado_por_id?: string | null
          fornecedor_id?: string
          id?: string
          observacoes_compliance?: string | null
          score_risco_total?: number | null
          status_avaliacao?: string
          updated_at?: string | null
          usuario_compliance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avaliacoes_cadastro_fornecedor_enviado_por_id_fkey"
            columns: ["enviado_por_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avaliacoes_cadastro_fornecedor_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avaliacoes_cadastro_fornecedor_usuario_compliance_id_fkey"
            columns: ["usuario_compliance_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campos_documentos_finalizacao: {
        Row: {
          cotacao_id: string | null
          created_at: string | null
          data_aprovacao: string | null
          data_conclusao: string | null
          data_solicitacao: string | null
          descricao: string | null
          fornecedor_id: string | null
          id: string
          nome_campo: string
          obrigatorio: boolean | null
          ordem: number
          selecao_id: string | null
          status_solicitacao: string | null
        }
        Insert: {
          cotacao_id?: string | null
          created_at?: string | null
          data_aprovacao?: string | null
          data_conclusao?: string | null
          data_solicitacao?: string | null
          descricao?: string | null
          fornecedor_id?: string | null
          id?: string
          nome_campo: string
          obrigatorio?: boolean | null
          ordem?: number
          selecao_id?: string | null
          status_solicitacao?: string | null
        }
        Update: {
          cotacao_id?: string | null
          created_at?: string | null
          data_aprovacao?: string | null
          data_conclusao?: string | null
          data_solicitacao?: string | null
          descricao?: string | null
          fornecedor_id?: string | null
          id?: string
          nome_campo?: string
          obrigatorio?: boolean | null
          ordem?: number
          selecao_id?: string | null
          status_solicitacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campos_documentos_finalizacao_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes_precos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campos_documentos_finalizacao_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campos_documentos_finalizacao_selecao_id_fkey"
            columns: ["selecao_id"]
            isOneToOne: false
            referencedRelation: "selecoes_fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      contatos: {
        Row: {
          assunto: string
          categoria: string
          created_at: string | null
          data_resposta: string | null
          fornecedor_id: string | null
          id: string
          mensagem: string
          resposta_interna: string | null
          status_atendimento:
            | Database["public"]["Enums"]["status_atendimento"]
            | null
          tipo_usuario: string
          usuario_interno_id: string | null
        }
        Insert: {
          assunto: string
          categoria: string
          created_at?: string | null
          data_resposta?: string | null
          fornecedor_id?: string | null
          id?: string
          mensagem: string
          resposta_interna?: string | null
          status_atendimento?:
            | Database["public"]["Enums"]["status_atendimento"]
            | null
          tipo_usuario: string
          usuario_interno_id?: string | null
        }
        Update: {
          assunto?: string
          categoria?: string
          created_at?: string | null
          data_resposta?: string | null
          fornecedor_id?: string | null
          id?: string
          mensagem?: string
          resposta_interna?: string | null
          status_atendimento?:
            | Database["public"]["Enums"]["status_atendimento"]
            | null
          tipo_usuario?: string
          usuario_interno_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contatos_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos_gestao: {
        Row: {
          created_at: string | null
          data_fim: string
          data_inicio: string
          ente_federativo: string
          id: string
          nome_contrato: string
          observacoes: string | null
          status: Database["public"]["Enums"]["status_contrato"] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          data_fim: string
          data_inicio: string
          ente_federativo: string
          id?: string
          nome_contrato: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["status_contrato"] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          data_fim?: string
          data_inicio?: string
          ente_federativo?: string
          id?: string
          nome_contrato?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["status_contrato"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cotacao_fornecedor_convites: {
        Row: {
          cotacao_id: string
          created_at: string | null
          data_hora_acesso_primeiro: string | null
          email_enviado_em: string | null
          fornecedor_id: string
          id: string
          link_acesso_unico: string | null
          status_convite: string | null
        }
        Insert: {
          cotacao_id: string
          created_at?: string | null
          data_hora_acesso_primeiro?: string | null
          email_enviado_em?: string | null
          fornecedor_id: string
          id?: string
          link_acesso_unico?: string | null
          status_convite?: string | null
        }
        Update: {
          cotacao_id?: string
          created_at?: string | null
          data_hora_acesso_primeiro?: string | null
          email_enviado_em?: string | null
          fornecedor_id?: string
          id?: string
          link_acesso_unico?: string | null
          status_convite?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_fornecedor_convites_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes_precos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_fornecedor_convites_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacao_respostas_fornecedor: {
        Row: {
          comprovantes_urls: string[] | null
          cotacao_id: string
          created_at: string | null
          data_envio_resposta: string | null
          data_rejeicao: string | null
          fornecedor_id: string
          hash_certificacao: string | null
          id: string
          motivo_rejeicao: string | null
          observacoes_fornecedor: string | null
          protocolo: string | null
          rejeitado: boolean | null
          usuario_gerador_id: string | null
          valor_total_anual_ofertado: number
        }
        Insert: {
          comprovantes_urls?: string[] | null
          cotacao_id: string
          created_at?: string | null
          data_envio_resposta?: string | null
          data_rejeicao?: string | null
          fornecedor_id: string
          hash_certificacao?: string | null
          id?: string
          motivo_rejeicao?: string | null
          observacoes_fornecedor?: string | null
          protocolo?: string | null
          rejeitado?: boolean | null
          usuario_gerador_id?: string | null
          valor_total_anual_ofertado: number
        }
        Update: {
          comprovantes_urls?: string[] | null
          cotacao_id?: string
          created_at?: string | null
          data_envio_resposta?: string | null
          data_rejeicao?: string | null
          fornecedor_id?: string
          hash_certificacao?: string | null
          id?: string
          motivo_rejeicao?: string | null
          observacoes_fornecedor?: string | null
          protocolo?: string | null
          rejeitado?: boolean | null
          usuario_gerador_id?: string | null
          valor_total_anual_ofertado?: number
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_respostas_fornecedor_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes_precos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_respostas_fornecedor_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_respostas_fornecedor_usuario_gerador_id_fkey"
            columns: ["usuario_gerador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacoes_precos: {
        Row: {
          created_at: string | null
          criterio_julgamento: string | null
          data_envio: string | null
          data_envio_compliance: string | null
          data_finalizacao: string | null
          data_limite_resposta: string
          data_resposta_compliance: string | null
          descricao_cotacao: string | null
          documentos_aprovados: Json | null
          enviado_compliance: boolean | null
          enviado_para_selecao: boolean | null
          fornecedor_vencedor_id: string | null
          id: string
          processo_compra_id: string
          processo_finalizado: boolean | null
          respondido_compliance: boolean | null
          status_cotacao: Database["public"]["Enums"]["status_cotacao"] | null
          titulo_cotacao: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          criterio_julgamento?: string | null
          data_envio?: string | null
          data_envio_compliance?: string | null
          data_finalizacao?: string | null
          data_limite_resposta: string
          data_resposta_compliance?: string | null
          descricao_cotacao?: string | null
          documentos_aprovados?: Json | null
          enviado_compliance?: boolean | null
          enviado_para_selecao?: boolean | null
          fornecedor_vencedor_id?: string | null
          id?: string
          processo_compra_id: string
          processo_finalizado?: boolean | null
          respondido_compliance?: boolean | null
          status_cotacao?: Database["public"]["Enums"]["status_cotacao"] | null
          titulo_cotacao: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          criterio_julgamento?: string | null
          data_envio?: string | null
          data_envio_compliance?: string | null
          data_finalizacao?: string | null
          data_limite_resposta?: string
          data_resposta_compliance?: string | null
          descricao_cotacao?: string | null
          documentos_aprovados?: Json | null
          enviado_compliance?: boolean | null
          enviado_para_selecao?: boolean | null
          fornecedor_vencedor_id?: string | null
          id?: string
          processo_compra_id?: string
          processo_finalizado?: boolean | null
          respondido_compliance?: boolean | null
          status_cotacao?: Database["public"]["Enums"]["status_cotacao"] | null
          titulo_cotacao?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cotacoes_precos_fornecedor_vencedor_id_fkey"
            columns: ["fornecedor_vencedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacoes_precos_processo_compra_id_fkey"
            columns: ["processo_compra_id"]
            isOneToOne: false
            referencedRelation: "processos_compras"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_finalizacao_fornecedor: {
        Row: {
          campo_documento_id: string
          created_at: string | null
          data_upload: string | null
          fornecedor_id: string
          id: string
          nome_arquivo: string
          url_arquivo: string
        }
        Insert: {
          campo_documento_id: string
          created_at?: string | null
          data_upload?: string | null
          fornecedor_id: string
          id?: string
          nome_arquivo: string
          url_arquivo: string
        }
        Update: {
          campo_documento_id?: string
          created_at?: string | null
          data_upload?: string | null
          fornecedor_id?: string
          id?: string
          nome_arquivo?: string
          url_arquivo?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_finalizacao_fornecedor_campo_documento_id_fkey"
            columns: ["campo_documento_id"]
            isOneToOne: false
            referencedRelation: "campos_documentos_finalizacao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_finalizacao_fornecedor_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_fornecedor: {
        Row: {
          atualizacao_solicitada: boolean | null
          created_at: string | null
          data_emissao: string | null
          data_solicitacao_atualizacao: string | null
          data_upload: string | null
          data_validade: string | null
          em_vigor: boolean | null
          fornecedor_id: string
          id: string
          motivo_solicitacao_atualizacao: string | null
          nome_arquivo: string
          tipo_documento: string
          url_arquivo: string
        }
        Insert: {
          atualizacao_solicitada?: boolean | null
          created_at?: string | null
          data_emissao?: string | null
          data_solicitacao_atualizacao?: string | null
          data_upload?: string | null
          data_validade?: string | null
          em_vigor?: boolean | null
          fornecedor_id: string
          id?: string
          motivo_solicitacao_atualizacao?: string | null
          nome_arquivo: string
          tipo_documento: string
          url_arquivo: string
        }
        Update: {
          atualizacao_solicitada?: boolean | null
          created_at?: string | null
          data_emissao?: string | null
          data_solicitacao_atualizacao?: string | null
          data_upload?: string | null
          data_validade?: string | null
          em_vigor?: boolean | null
          fornecedor_id?: string
          id?: string
          motivo_solicitacao_atualizacao?: string | null
          nome_arquivo?: string
          tipo_documento?: string
          url_arquivo?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_fornecedor_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_processo_finalizado: {
        Row: {
          cotacao_id: string
          created_at: string | null
          data_emissao: string | null
          data_snapshot: string
          data_validade: string | null
          em_vigor: boolean | null
          fornecedor_id: string
          id: string
          nome_arquivo: string
          tipo_documento: string
          url_arquivo: string
        }
        Insert: {
          cotacao_id: string
          created_at?: string | null
          data_emissao?: string | null
          data_snapshot?: string
          data_validade?: string | null
          em_vigor?: boolean | null
          fornecedor_id: string
          id?: string
          nome_arquivo: string
          tipo_documento: string
          url_arquivo: string
        }
        Update: {
          cotacao_id?: string
          created_at?: string | null
          data_emissao?: string | null
          data_snapshot?: string
          data_validade?: string | null
          em_vigor?: boolean | null
          fornecedor_id?: string
          id?: string
          nome_arquivo?: string
          tipo_documento?: string
          url_arquivo?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_processo_finalizado_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes_precos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_processo_finalizado_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      emails_cotacao_anexados: {
        Row: {
          cotacao_id: string
          created_at: string | null
          data_upload: string
          id: string
          nome_arquivo: string
          tamanho_arquivo: number
          tipo_arquivo: string
          url_arquivo: string
          usuario_upload_id: string
        }
        Insert: {
          cotacao_id: string
          created_at?: string | null
          data_upload?: string
          id?: string
          nome_arquivo: string
          tamanho_arquivo: number
          tipo_arquivo: string
          url_arquivo: string
          usuario_upload_id: string
        }
        Update: {
          cotacao_id?: string
          created_at?: string | null
          data_upload?: string
          id?: string
          nome_arquivo?: string
          tamanho_arquivo?: number
          tipo_arquivo?: string
          url_arquivo?: string
          usuario_upload_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "emails_cotacao_anexados_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes_precos"
            referencedColumns: ["id"]
          },
        ]
      }
      encaminhamentos_processo: {
        Row: {
          cotacao_id: string | null
          created_at: string
          gerado_por: string | null
          id: string
          nome_arquivo: string | null
          processo_numero: string
          protocolo: string
          storage_path: string
          url: string
        }
        Insert: {
          cotacao_id?: string | null
          created_at?: string
          gerado_por?: string | null
          id?: string
          nome_arquivo?: string | null
          processo_numero: string
          protocolo: string
          storage_path: string
          url: string
        }
        Update: {
          cotacao_id?: string | null
          created_at?: string
          gerado_por?: string | null
          id?: string
          nome_arquivo?: string | null
          processo_numero?: string
          protocolo?: string
          storage_path?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "encaminhamentos_processo_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes_precos"
            referencedColumns: ["id"]
          },
        ]
      }
      fornecedores: {
        Row: {
          ativo: boolean | null
          cnpj: string
          created_at: string | null
          data_aprovacao: string | null
          data_cadastro: string | null
          data_validade_certificado: string | null
          email: string
          endereco_comercial: string | null
          gestor_aprovador_id: string | null
          id: string
          nome_fantasia: string | null
          nome_socio_administrador: string | null
          nomes_socios_cotistas: string | null
          observacoes_gestor: string | null
          razao_social: string
          responsaveis_legais: Json | null
          segmento_atividade: string | null
          status_aprovacao: string | null
          telefone: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          ativo?: boolean | null
          cnpj: string
          created_at?: string | null
          data_aprovacao?: string | null
          data_cadastro?: string | null
          data_validade_certificado?: string | null
          email: string
          endereco_comercial?: string | null
          gestor_aprovador_id?: string | null
          id?: string
          nome_fantasia?: string | null
          nome_socio_administrador?: string | null
          nomes_socios_cotistas?: string | null
          observacoes_gestor?: string | null
          razao_social: string
          responsaveis_legais?: Json | null
          segmento_atividade?: string | null
          status_aprovacao?: string | null
          telefone: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          ativo?: boolean | null
          cnpj?: string
          created_at?: string | null
          data_aprovacao?: string | null
          data_cadastro?: string | null
          data_validade_certificado?: string | null
          email?: string
          endereco_comercial?: string | null
          gestor_aprovador_id?: string | null
          id?: string
          nome_fantasia?: string | null
          nome_socio_administrador?: string | null
          nomes_socios_cotistas?: string | null
          observacoes_gestor?: string | null
          razao_social?: string
          responsaveis_legais?: Json | null
          segmento_atividade?: string | null
          status_aprovacao?: string | null
          telefone?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fornecedores_gestor_aprovador_id_fkey"
            columns: ["gestor_aprovador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fornecedores_inabilitados_selecao: {
        Row: {
          created_at: string | null
          data_inabilitacao: string
          data_reversao: string | null
          fornecedor_id: string
          id: string
          itens_afetados: number[]
          motivo_inabilitacao: string
          motivo_reversao: string | null
          revertido: boolean | null
          selecao_id: string
          usuario_inabilitou_id: string
          usuario_reverteu_id: string | null
        }
        Insert: {
          created_at?: string | null
          data_inabilitacao?: string
          data_reversao?: string | null
          fornecedor_id: string
          id?: string
          itens_afetados?: number[]
          motivo_inabilitacao: string
          motivo_reversao?: string | null
          revertido?: boolean | null
          selecao_id: string
          usuario_inabilitou_id: string
          usuario_reverteu_id?: string | null
        }
        Update: {
          created_at?: string | null
          data_inabilitacao?: string
          data_reversao?: string | null
          fornecedor_id?: string
          id?: string
          itens_afetados?: number[]
          motivo_inabilitacao?: string
          motivo_reversao?: string | null
          revertido?: boolean | null
          selecao_id?: string
          usuario_inabilitou_id?: string
          usuario_reverteu_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fornecedores_inabilitados_selecao_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fornecedores_inabilitados_selecao_selecao_id_fkey"
            columns: ["selecao_id"]
            isOneToOne: false
            referencedRelation: "selecoes_fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      fornecedores_rejeitados_cotacao: {
        Row: {
          cotacao_id: string
          created_at: string | null
          data_rejeicao: string
          data_reversao: string | null
          fornecedor_id: string
          id: string
          motivo_rejeicao: string
          motivo_reversao: string | null
          revertido: boolean | null
          status_recurso: string | null
          usuario_rejeitou_id: string
          usuario_reverteu_id: string | null
        }
        Insert: {
          cotacao_id: string
          created_at?: string | null
          data_rejeicao?: string
          data_reversao?: string | null
          fornecedor_id: string
          id?: string
          motivo_rejeicao: string
          motivo_reversao?: string | null
          revertido?: boolean | null
          status_recurso?: string | null
          usuario_rejeitou_id: string
          usuario_reverteu_id?: string | null
        }
        Update: {
          cotacao_id?: string
          created_at?: string | null
          data_rejeicao?: string
          data_reversao?: string | null
          fornecedor_id?: string
          id?: string
          motivo_rejeicao?: string
          motivo_reversao?: string | null
          revertido?: boolean | null
          status_recurso?: string | null
          usuario_rejeitou_id?: string
          usuario_reverteu_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fornecedores_rejeitados_cotacao_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes_precos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fornecedores_rejeitados_cotacao_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fornecedores_rejeitados_cotacao_usuario_rejeitou_id_fkey"
            columns: ["usuario_rejeitou_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fornecedores_rejeitados_cotacao_usuario_reverteu_id_fkey"
            columns: ["usuario_reverteu_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      homologacoes_selecao: {
        Row: {
          created_at: string
          data_atendimento: string | null
          data_geracao: string
          data_solicitacao: string | null
          id: string
          nome_arquivo: string
          protocolo: string
          responsavel_legal_id: string | null
          selecao_id: string
          solicitacao_atendida: boolean | null
          solicitacao_enviada: boolean | null
          url_arquivo: string
          usuario_gerador_id: string | null
        }
        Insert: {
          created_at?: string
          data_atendimento?: string | null
          data_geracao?: string
          data_solicitacao?: string | null
          id?: string
          nome_arquivo: string
          protocolo: string
          responsavel_legal_id?: string | null
          selecao_id: string
          solicitacao_atendida?: boolean | null
          solicitacao_enviada?: boolean | null
          url_arquivo: string
          usuario_gerador_id?: string | null
        }
        Update: {
          created_at?: string
          data_atendimento?: string | null
          data_geracao?: string
          data_solicitacao?: string | null
          id?: string
          nome_arquivo?: string
          protocolo?: string
          responsavel_legal_id?: string | null
          selecao_id?: string
          solicitacao_atendida?: boolean | null
          solicitacao_enviada?: boolean | null
          url_arquivo?: string
          usuario_gerador_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "homologacoes_selecao_responsavel_legal_id_fkey"
            columns: ["responsavel_legal_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homologacoes_selecao_selecao_id_fkey"
            columns: ["selecao_id"]
            isOneToOne: false
            referencedRelation: "selecoes_fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      intencoes_recurso_selecao: {
        Row: {
          created_at: string | null
          data_intencao: string | null
          deseja_recorrer: boolean
          fornecedor_id: string
          id: string
          motivo_intencao: string | null
          selecao_id: string
        }
        Insert: {
          created_at?: string | null
          data_intencao?: string | null
          deseja_recorrer?: boolean
          fornecedor_id: string
          id?: string
          motivo_intencao?: string | null
          selecao_id: string
        }
        Update: {
          created_at?: string | null
          data_intencao?: string | null
          deseja_recorrer?: boolean
          fornecedor_id?: string
          id?: string
          motivo_intencao?: string | null
          selecao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intencoes_recurso_selecao_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intencoes_recurso_selecao_selecao_id_fkey"
            columns: ["selecao_id"]
            isOneToOne: false
            referencedRelation: "selecoes_fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_abertos_lances: {
        Row: {
          aberto: boolean
          created_at: string
          data_abertura: string
          data_fechamento: string | null
          data_inicio_fechamento: string | null
          em_negociacao: boolean | null
          fornecedor_negociacao_id: string | null
          id: string
          iniciando_fechamento: boolean | null
          nao_negociar: boolean | null
          negociacao_concluida: boolean | null
          numero_item: number
          segundos_para_fechar: number | null
          selecao_id: string
        }
        Insert: {
          aberto?: boolean
          created_at?: string
          data_abertura?: string
          data_fechamento?: string | null
          data_inicio_fechamento?: string | null
          em_negociacao?: boolean | null
          fornecedor_negociacao_id?: string | null
          id?: string
          iniciando_fechamento?: boolean | null
          nao_negociar?: boolean | null
          negociacao_concluida?: boolean | null
          numero_item: number
          segundos_para_fechar?: number | null
          selecao_id: string
        }
        Update: {
          aberto?: boolean
          created_at?: string
          data_abertura?: string
          data_fechamento?: string | null
          data_inicio_fechamento?: string | null
          em_negociacao?: boolean | null
          fornecedor_negociacao_id?: string | null
          id?: string
          iniciando_fechamento?: boolean | null
          nao_negociar?: boolean | null
          negociacao_concluida?: boolean | null
          numero_item?: number
          segundos_para_fechar?: number | null
          selecao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "itens_abertos_lances_fornecedor_negociacao_id_fkey"
            columns: ["fornecedor_negociacao_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_abertos_lances_selecao_id_fkey"
            columns: ["selecao_id"]
            isOneToOne: false
            referencedRelation: "selecoes_fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_cotacao: {
        Row: {
          cotacao_id: string
          created_at: string | null
          descricao: string
          id: string
          lote_id: string | null
          marca: string | null
          numero_item: number
          quantidade: number
          unidade: string
          updated_at: string | null
          valor_unitario_estimado: number | null
        }
        Insert: {
          cotacao_id: string
          created_at?: string | null
          descricao: string
          id?: string
          lote_id?: string | null
          marca?: string | null
          numero_item: number
          quantidade: number
          unidade: string
          updated_at?: string | null
          valor_unitario_estimado?: number | null
        }
        Update: {
          cotacao_id?: string
          created_at?: string | null
          descricao?: string
          id?: string
          lote_id?: string | null
          marca?: string | null
          numero_item?: number
          quantidade?: number
          unidade?: string
          updated_at?: string | null
          valor_unitario_estimado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "itens_cotacao_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes_precos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_cotacao_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_cotacao"
            referencedColumns: ["id"]
          },
        ]
      }
      lances_fornecedores: {
        Row: {
          created_at: string | null
          data_hora_lance: string | null
          fornecedor_id: string
          id: string
          indicativo_lance_vencedor: boolean | null
          numero_item: number | null
          numero_rodada: number | null
          observacao_lance: string | null
          selecao_id: string
          tipo_lance: string | null
          valor_lance: number
        }
        Insert: {
          created_at?: string | null
          data_hora_lance?: string | null
          fornecedor_id: string
          id?: string
          indicativo_lance_vencedor?: boolean | null
          numero_item?: number | null
          numero_rodada?: number | null
          observacao_lance?: string | null
          selecao_id: string
          tipo_lance?: string | null
          valor_lance: number
        }
        Update: {
          created_at?: string | null
          data_hora_lance?: string | null
          fornecedor_id?: string
          id?: string
          indicativo_lance_vencedor?: boolean | null
          numero_item?: number | null
          numero_rodada?: number | null
          observacao_lance?: string | null
          selecao_id?: string
          tipo_lance?: string | null
          valor_lance?: number
        }
        Relationships: [
          {
            foreignKeyName: "lances_fornecedores_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lances_fornecedores_selecao_id_fkey"
            columns: ["selecao_id"]
            isOneToOne: false
            referencedRelation: "selecoes_fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      lotes_cotacao: {
        Row: {
          cotacao_id: string
          created_at: string | null
          descricao_lote: string
          id: string
          numero_lote: number
          updated_at: string | null
        }
        Insert: {
          cotacao_id: string
          created_at?: string | null
          descricao_lote: string
          id?: string
          numero_lote: number
          updated_at?: string | null
        }
        Update: {
          cotacao_id?: string
          created_at?: string | null
          descricao_lote?: string
          id?: string
          numero_lote?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lotes_cotacao_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes_precos"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens_negociacao: {
        Row: {
          created_at: string
          fornecedor_id: string
          id: string
          mensagem: string
          numero_item: number
          selecao_id: string
          tipo_remetente: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          fornecedor_id: string
          id?: string
          mensagem: string
          numero_item: number
          selecao_id: string
          tipo_remetente: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          fornecedor_id?: string
          id?: string
          mensagem?: string
          numero_item?: number
          selecao_id?: string
          tipo_remetente?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_negociacao_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_negociacao_selecao_id_fkey"
            columns: ["selecao_id"]
            isOneToOne: false
            referencedRelation: "selecoes_fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens_selecao: {
        Row: {
          created_at: string
          fornecedor_id: string | null
          id: string
          mensagem: string
          selecao_id: string
          tipo_usuario: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          fornecedor_id?: string | null
          id?: string
          mensagem: string
          selecao_id: string
          tipo_usuario: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          fornecedor_id?: string | null
          id?: string
          mensagem?: string
          selecao_id?: string
          tipo_usuario?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_selecao_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_selecao_selecao_id_fkey"
            columns: ["selecao_id"]
            isOneToOne: false
            referencedRelation: "selecoes_fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes_fornecedor: {
        Row: {
          created_at: string | null
          data_envio: string | null
          documento_id: string | null
          fornecedor_id: string
          id: string
          status_envio: string | null
          tipo_notificacao: string
        }
        Insert: {
          created_at?: string | null
          data_envio?: string | null
          documento_id?: string | null
          fornecedor_id: string
          id?: string
          status_envio?: string | null
          tipo_notificacao: string
        }
        Update: {
          created_at?: string | null
          data_envio?: string | null
          documento_id?: string | null
          fornecedor_id?: string
          id?: string
          status_envio?: string | null
          tipo_notificacao?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_fornecedor_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos_fornecedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_fornecedor_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      perguntas_due_diligence: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          id: string
          ordem: number
          pontuacao_nao: number | null
          pontuacao_sim: number | null
          texto_pergunta: string
          tipo_resposta: string
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          id?: string
          ordem?: number
          pontuacao_nao?: number | null
          pontuacao_sim?: number | null
          texto_pergunta: string
          tipo_resposta?: string
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          id?: string
          ordem?: number
          pontuacao_nao?: number | null
          pontuacao_sim?: number | null
          texto_pergunta?: string
          tipo_resposta?: string
        }
        Relationships: []
      }
      planilhas_consolidadas: {
        Row: {
          cotacao_id: string
          created_at: string | null
          data_geracao: string
          estimativas_itens: Json | null
          fornecedores_incluidos: Json | null
          id: string
          nome_arquivo: string
          protocolo: string | null
          url_arquivo: string
          usuario_gerador_id: string
        }
        Insert: {
          cotacao_id: string
          created_at?: string | null
          data_geracao?: string
          estimativas_itens?: Json | null
          fornecedores_incluidos?: Json | null
          id?: string
          nome_arquivo: string
          protocolo?: string | null
          url_arquivo: string
          usuario_gerador_id: string
        }
        Update: {
          cotacao_id?: string
          created_at?: string | null
          data_geracao?: string
          estimativas_itens?: Json | null
          fornecedores_incluidos?: Json | null
          id?: string
          nome_arquivo?: string
          protocolo?: string | null
          url_arquivo?: string
          usuario_gerador_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planilhas_consolidadas_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes_precos"
            referencedColumns: ["id"]
          },
        ]
      }
      planilhas_lances_selecao: {
        Row: {
          created_at: string | null
          data_geracao: string
          id: string
          nome_arquivo: string
          protocolo: string | null
          selecao_id: string
          url_arquivo: string
          usuario_gerador_id: string | null
        }
        Insert: {
          created_at?: string | null
          data_geracao?: string
          id?: string
          nome_arquivo: string
          protocolo?: string | null
          selecao_id: string
          url_arquivo: string
          usuario_gerador_id?: string | null
        }
        Update: {
          created_at?: string | null
          data_geracao?: string
          id?: string
          nome_arquivo?: string
          protocolo?: string | null
          selecao_id?: string
          url_arquivo?: string
          usuario_gerador_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planilhas_lances_selecao_selecao_id_fkey"
            columns: ["selecao_id"]
            isOneToOne: false
            referencedRelation: "selecoes_fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      processos_compras: {
        Row: {
          ano_referencia: number
          centro_custo: string | null
          contratacao_especifica: boolean | null
          contrato_gestao_id: string
          created_at: string | null
          credenciamento: boolean | null
          criterio_julgamento: string
          data_abertura: string | null
          data_encerramento_prevista: string | null
          data_encerramento_real: string | null
          id: string
          numero_processo_interno: string
          objeto_resumido: string
          observacoes: string | null
          requer_cotacao: boolean | null
          requer_selecao: boolean | null
          status_processo: Database["public"]["Enums"]["status_processo"] | null
          tipo: Database["public"]["Enums"]["tipo_processo"]
          updated_at: string | null
          valor_estimado_anual: number
          valor_total_cotacao: number | null
        }
        Insert: {
          ano_referencia: number
          centro_custo?: string | null
          contratacao_especifica?: boolean | null
          contrato_gestao_id: string
          created_at?: string | null
          credenciamento?: boolean | null
          criterio_julgamento?: string
          data_abertura?: string | null
          data_encerramento_prevista?: string | null
          data_encerramento_real?: string | null
          id?: string
          numero_processo_interno: string
          objeto_resumido: string
          observacoes?: string | null
          requer_cotacao?: boolean | null
          requer_selecao?: boolean | null
          status_processo?:
            | Database["public"]["Enums"]["status_processo"]
            | null
          tipo: Database["public"]["Enums"]["tipo_processo"]
          updated_at?: string | null
          valor_estimado_anual?: number
          valor_total_cotacao?: number | null
        }
        Update: {
          ano_referencia?: number
          centro_custo?: string | null
          contratacao_especifica?: boolean | null
          contrato_gestao_id?: string
          created_at?: string | null
          credenciamento?: boolean | null
          criterio_julgamento?: string
          data_abertura?: string | null
          data_encerramento_prevista?: string | null
          data_encerramento_real?: string | null
          id?: string
          numero_processo_interno?: string
          objeto_resumido?: string
          observacoes?: string | null
          requer_cotacao?: boolean | null
          requer_selecao?: boolean | null
          status_processo?:
            | Database["public"]["Enums"]["status_processo"]
            | null
          tipo?: Database["public"]["Enums"]["tipo_processo"]
          updated_at?: string | null
          valor_estimado_anual?: number
          valor_total_cotacao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "processos_compras_contrato_gestao_id_fkey"
            columns: ["contrato_gestao_id"]
            isOneToOne: false
            referencedRelation: "contratos_gestao"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ativo: boolean | null
          avatar_url: string | null
          cargo: string | null
          compliance: boolean | null
          cpf: string
          created_at: string | null
          data_criacao: string | null
          data_nascimento: string | null
          data_ultimo_login: string | null
          email: string
          gestor: boolean | null
          id: string
          nome_completo: string
          primeiro_acesso: boolean | null
          responsavel_legal: boolean | null
          senha_temporaria: boolean | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          avatar_url?: string | null
          cargo?: string | null
          compliance?: boolean | null
          cpf: string
          created_at?: string | null
          data_criacao?: string | null
          data_nascimento?: string | null
          data_ultimo_login?: string | null
          email: string
          gestor?: boolean | null
          id: string
          nome_completo: string
          primeiro_acesso?: boolean | null
          responsavel_legal?: boolean | null
          senha_temporaria?: boolean | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          avatar_url?: string | null
          cargo?: string | null
          compliance?: boolean | null
          cpf?: string
          created_at?: string | null
          data_criacao?: string | null
          data_nascimento?: string | null
          data_ultimo_login?: string | null
          email?: string
          gestor?: boolean | null
          id?: string
          nome_completo?: string
          primeiro_acesso?: boolean | null
          responsavel_legal?: boolean | null
          senha_temporaria?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      recursos_fornecedor: {
        Row: {
          created_at: string | null
          data_envio: string
          fornecedor_id: string
          id: string
          mensagem_fornecedor: string | null
          nome_arquivo: string
          protocolo: string | null
          rejeicao_id: string
          url_arquivo: string
        }
        Insert: {
          created_at?: string | null
          data_envio?: string
          fornecedor_id: string
          id?: string
          mensagem_fornecedor?: string | null
          nome_arquivo: string
          protocolo?: string | null
          rejeicao_id: string
          url_arquivo: string
        }
        Update: {
          created_at?: string | null
          data_envio?: string
          fornecedor_id?: string
          id?: string
          mensagem_fornecedor?: string | null
          nome_arquivo?: string
          protocolo?: string | null
          rejeicao_id?: string
          url_arquivo?: string
        }
        Relationships: [
          {
            foreignKeyName: "recursos_fornecedor_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recursos_fornecedor_rejeicao_id_fkey"
            columns: ["rejeicao_id"]
            isOneToOne: false
            referencedRelation: "fornecedores_rejeitados_cotacao"
            referencedColumns: ["id"]
          },
        ]
      }
      recursos_inabilitacao_selecao: {
        Row: {
          created_at: string
          data_abertura_recurso: string
          data_envio_recurso: string | null
          data_limite_fornecedor: string
          data_limite_gestor: string | null
          data_resposta_gestor: string | null
          fornecedor_id: string
          id: string
          inabilitacao_id: string
          itens_reabilitados: number[] | null
          motivo_recurso: string
          nome_arquivo_recurso: string | null
          nome_arquivo_resposta: string | null
          protocolo_recurso: string | null
          protocolo_resposta: string | null
          resposta_gestor: string | null
          selecao_id: string
          status_recurso: string
          tipo_provimento: string | null
          updated_at: string
          url_pdf_recurso: string | null
          url_pdf_resposta: string | null
          usuario_gestor_id: string | null
        }
        Insert: {
          created_at?: string
          data_abertura_recurso?: string
          data_envio_recurso?: string | null
          data_limite_fornecedor: string
          data_limite_gestor?: string | null
          data_resposta_gestor?: string | null
          fornecedor_id: string
          id?: string
          inabilitacao_id: string
          itens_reabilitados?: number[] | null
          motivo_recurso: string
          nome_arquivo_recurso?: string | null
          nome_arquivo_resposta?: string | null
          protocolo_recurso?: string | null
          protocolo_resposta?: string | null
          resposta_gestor?: string | null
          selecao_id: string
          status_recurso?: string
          tipo_provimento?: string | null
          updated_at?: string
          url_pdf_recurso?: string | null
          url_pdf_resposta?: string | null
          usuario_gestor_id?: string | null
        }
        Update: {
          created_at?: string
          data_abertura_recurso?: string
          data_envio_recurso?: string | null
          data_limite_fornecedor?: string
          data_limite_gestor?: string | null
          data_resposta_gestor?: string | null
          fornecedor_id?: string
          id?: string
          inabilitacao_id?: string
          itens_reabilitados?: number[] | null
          motivo_recurso?: string
          nome_arquivo_recurso?: string | null
          nome_arquivo_resposta?: string | null
          protocolo_recurso?: string | null
          protocolo_resposta?: string | null
          resposta_gestor?: string | null
          selecao_id?: string
          status_recurso?: string
          tipo_provimento?: string | null
          updated_at?: string
          url_pdf_recurso?: string | null
          url_pdf_resposta?: string | null
          usuario_gestor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recursos_inabilitacao_selecao_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recursos_inabilitacao_selecao_inabilitacao_id_fkey"
            columns: ["inabilitacao_id"]
            isOneToOne: false
            referencedRelation: "fornecedores_inabilitados_selecao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recursos_inabilitacao_selecao_selecao_id_fkey"
            columns: ["selecao_id"]
            isOneToOne: false
            referencedRelation: "selecoes_fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recursos_inabilitacao_selecao_usuario_gestor_id_fkey"
            columns: ["usuario_gestor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      relatorios_finais: {
        Row: {
          cotacao_id: string
          created_at: string | null
          data_geracao: string
          id: string
          nome_arquivo: string
          protocolo: string
          url_arquivo: string
          usuario_gerador_id: string
        }
        Insert: {
          cotacao_id: string
          created_at?: string | null
          data_geracao?: string
          id?: string
          nome_arquivo: string
          protocolo: string
          url_arquivo: string
          usuario_gerador_id: string
        }
        Update: {
          cotacao_id?: string
          created_at?: string | null
          data_geracao?: string
          id?: string
          nome_arquivo?: string
          protocolo?: string
          url_arquivo?: string
          usuario_gerador_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "relatorios_finais_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes_precos"
            referencedColumns: ["id"]
          },
        ]
      }
      respostas_due_diligence_fornecedor: {
        Row: {
          created_at: string | null
          fornecedor_id: string
          id: string
          pergunta_id: string
          resposta_texto: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          fornecedor_id: string
          id?: string
          pergunta_id: string
          resposta_texto?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          fornecedor_id?: string
          id?: string
          pergunta_id?: string
          resposta_texto?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "respostas_due_diligence_fornecedor_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "respostas_due_diligence_fornecedor_pergunta_id_fkey"
            columns: ["pergunta_id"]
            isOneToOne: false
            referencedRelation: "perguntas_due_diligence"
            referencedColumns: ["id"]
          },
        ]
      }
      respostas_itens_fornecedor: {
        Row: {
          cotacao_resposta_fornecedor_id: string
          created_at: string | null
          id: string
          item_cotacao_id: string
          marca: string | null
          observacao: string | null
          percentual_desconto: number | null
          valor_unitario_ofertado: number
        }
        Insert: {
          cotacao_resposta_fornecedor_id: string
          created_at?: string | null
          id?: string
          item_cotacao_id: string
          marca?: string | null
          observacao?: string | null
          percentual_desconto?: number | null
          valor_unitario_ofertado: number
        }
        Update: {
          cotacao_resposta_fornecedor_id?: string
          created_at?: string | null
          id?: string
          item_cotacao_id?: string
          marca?: string | null
          observacao?: string | null
          percentual_desconto?: number | null
          valor_unitario_ofertado?: number
        }
        Relationships: [
          {
            foreignKeyName: "respostas_itens_fornecedor_cotacao_resposta_fornecedor_id_fkey"
            columns: ["cotacao_resposta_fornecedor_id"]
            isOneToOne: false
            referencedRelation: "cotacao_respostas_fornecedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "respostas_itens_fornecedor_item_cotacao_id_fkey"
            columns: ["item_cotacao_id"]
            isOneToOne: false
            referencedRelation: "itens_cotacao"
            referencedColumns: ["id"]
          },
        ]
      }
      respostas_recursos: {
        Row: {
          created_at: string
          data_resposta: string
          decisao: string
          id: string
          nome_arquivo: string
          protocolo: string
          recurso_id: string
          texto_resposta: string
          url_documento: string
          usuario_respondeu_id: string | null
        }
        Insert: {
          created_at?: string
          data_resposta?: string
          decisao: string
          id?: string
          nome_arquivo: string
          protocolo: string
          recurso_id: string
          texto_resposta: string
          url_documento: string
          usuario_respondeu_id?: string | null
        }
        Update: {
          created_at?: string
          data_resposta?: string
          decisao?: string
          id?: string
          nome_arquivo?: string
          protocolo?: string
          recurso_id?: string
          texto_resposta?: string
          url_documento?: string
          usuario_respondeu_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "respostas_recursos_recurso_id_fkey"
            columns: ["recurso_id"]
            isOneToOne: false
            referencedRelation: "recursos_fornecedor"
            referencedColumns: ["id"]
          },
        ]
      }
      selecao_fornecedor_convites: {
        Row: {
          created_at: string | null
          email_enviado_em: string | null
          fornecedor_id: string
          id: string
          link_acesso_unico: string | null
          selecao_id: string
          status_convite: string | null
        }
        Insert: {
          created_at?: string | null
          email_enviado_em?: string | null
          fornecedor_id: string
          id?: string
          link_acesso_unico?: string | null
          selecao_id: string
          status_convite?: string | null
        }
        Update: {
          created_at?: string | null
          email_enviado_em?: string | null
          fornecedor_id?: string
          id?: string
          link_acesso_unico?: string | null
          selecao_id?: string
          status_convite?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "selecao_fornecedor_convites_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selecao_fornecedor_convites_selecao_id_fkey"
            columns: ["selecao_id"]
            isOneToOne: false
            referencedRelation: "selecoes_fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      selecao_propostas_fornecedor: {
        Row: {
          aprovado_analise_documental: boolean | null
          codigo_acesso: string | null
          created_at: string | null
          data_aprovacao_documental: string | null
          data_envio_proposta: string | null
          desclassificado: boolean | null
          email: string | null
          fornecedor_id: string
          hash_certificacao: string | null
          id: string
          motivo_desclassificacao: string | null
          observacoes_fornecedor: string | null
          protocolo: string | null
          selecao_id: string
          url_pdf_proposta: string | null
          valor_total_proposta: number
        }
        Insert: {
          aprovado_analise_documental?: boolean | null
          codigo_acesso?: string | null
          created_at?: string | null
          data_aprovacao_documental?: string | null
          data_envio_proposta?: string | null
          desclassificado?: boolean | null
          email?: string | null
          fornecedor_id: string
          hash_certificacao?: string | null
          id?: string
          motivo_desclassificacao?: string | null
          observacoes_fornecedor?: string | null
          protocolo?: string | null
          selecao_id: string
          url_pdf_proposta?: string | null
          valor_total_proposta: number
        }
        Update: {
          aprovado_analise_documental?: boolean | null
          codigo_acesso?: string | null
          created_at?: string | null
          data_aprovacao_documental?: string | null
          data_envio_proposta?: string | null
          desclassificado?: boolean | null
          email?: string | null
          fornecedor_id?: string
          hash_certificacao?: string | null
          id?: string
          motivo_desclassificacao?: string | null
          observacoes_fornecedor?: string | null
          protocolo?: string | null
          selecao_id?: string
          url_pdf_proposta?: string | null
          valor_total_proposta?: number
        }
        Relationships: [
          {
            foreignKeyName: "selecao_propostas_fornecedor_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selecao_propostas_fornecedor_selecao_id_fkey"
            columns: ["selecao_id"]
            isOneToOne: false
            referencedRelation: "selecoes_fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      selecao_respostas_itens_fornecedor: {
        Row: {
          created_at: string | null
          desclassificado: boolean | null
          descricao: string
          id: string
          marca: string | null
          motivo_desclassificacao: string | null
          numero_item: number
          proposta_id: string
          quantidade: number
          unidade: string
          valor_total_item: number
          valor_unitario_ofertado: number
        }
        Insert: {
          created_at?: string | null
          desclassificado?: boolean | null
          descricao: string
          id?: string
          marca?: string | null
          motivo_desclassificacao?: string | null
          numero_item: number
          proposta_id: string
          quantidade: number
          unidade: string
          valor_total_item: number
          valor_unitario_ofertado: number
        }
        Update: {
          created_at?: string | null
          desclassificado?: boolean | null
          descricao?: string
          id?: string
          marca?: string | null
          motivo_desclassificacao?: string | null
          numero_item?: number
          proposta_id?: string
          quantidade?: number
          unidade?: string
          valor_total_item?: number
          valor_unitario_ofertado?: number
        }
        Relationships: [
          {
            foreignKeyName: "selecao_respostas_itens_fornecedor_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "selecao_propostas_fornecedor"
            referencedColumns: ["id"]
          },
        ]
      }
      selecoes_fornecedores: {
        Row: {
          cotacao_relacionada_id: string | null
          created_at: string | null
          criterios_julgamento: string | null
          data_encerramento_habilitacao: string | null
          data_sessao_disputa: string
          descricao: string | null
          habilitacao_encerrada: boolean | null
          hora_sessao_disputa: string
          id: string
          numero_selecao: string | null
          processo_compra_id: string
          sessao_finalizada: boolean | null
          status_selecao: Database["public"]["Enums"]["status_selecao"] | null
          titulo_selecao: string
          updated_at: string | null
          usuario_encerrou_habilitacao_id: string | null
          valor_estimado_anual: number
        }
        Insert: {
          cotacao_relacionada_id?: string | null
          created_at?: string | null
          criterios_julgamento?: string | null
          data_encerramento_habilitacao?: string | null
          data_sessao_disputa: string
          descricao?: string | null
          habilitacao_encerrada?: boolean | null
          hora_sessao_disputa: string
          id?: string
          numero_selecao?: string | null
          processo_compra_id: string
          sessao_finalizada?: boolean | null
          status_selecao?: Database["public"]["Enums"]["status_selecao"] | null
          titulo_selecao: string
          updated_at?: string | null
          usuario_encerrou_habilitacao_id?: string | null
          valor_estimado_anual: number
        }
        Update: {
          cotacao_relacionada_id?: string | null
          created_at?: string | null
          criterios_julgamento?: string | null
          data_encerramento_habilitacao?: string | null
          data_sessao_disputa?: string
          descricao?: string | null
          habilitacao_encerrada?: boolean | null
          hora_sessao_disputa?: string
          id?: string
          numero_selecao?: string | null
          processo_compra_id?: string
          sessao_finalizada?: boolean | null
          status_selecao?: Database["public"]["Enums"]["status_selecao"] | null
          titulo_selecao?: string
          updated_at?: string | null
          usuario_encerrou_habilitacao_id?: string | null
          valor_estimado_anual?: number
        }
        Relationships: [
          {
            foreignKeyName: "selecoes_fornecedores_cotacao_relacionada_id_fkey"
            columns: ["cotacao_relacionada_id"]
            isOneToOne: false
            referencedRelation: "cotacoes_precos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selecoes_fornecedores_processo_compra_id_fkey"
            columns: ["processo_compra_id"]
            isOneToOne: false
            referencedRelation: "processos_compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selecoes_fornecedores_usuario_encerrou_habilitacao_id_fkey"
            columns: ["usuario_encerrou_habilitacao_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_autorizacao: {
        Row: {
          cotacao_id: string
          created_at: string | null
          data_resposta: string | null
          data_solicitacao: string
          id: string
          observacoes: string | null
          processo_numero: string
          solicitante_id: string
          status: string
        }
        Insert: {
          cotacao_id: string
          created_at?: string | null
          data_resposta?: string | null
          data_solicitacao?: string
          id?: string
          observacoes?: string | null
          processo_numero: string
          solicitante_id: string
          status?: string
        }
        Update: {
          cotacao_id?: string
          created_at?: string | null
          data_resposta?: string | null
          data_solicitacao?: string
          id?: string
          observacoes?: string | null
          processo_numero?: string
          solicitante_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_autorizacao_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes_precos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_autorizacao_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_autorizacao_selecao: {
        Row: {
          cotacao_id: string
          created_at: string | null
          data_resposta: string | null
          data_solicitacao: string
          id: string
          processo_numero: string
          responsavel_legal_id: string | null
          solicitante_id: string | null
          status: string
        }
        Insert: {
          cotacao_id: string
          created_at?: string | null
          data_resposta?: string | null
          data_solicitacao?: string
          id?: string
          processo_numero: string
          responsavel_legal_id?: string | null
          solicitante_id?: string | null
          status?: string
        }
        Update: {
          cotacao_id?: string
          created_at?: string | null
          data_resposta?: string | null
          data_solicitacao?: string
          id?: string
          processo_numero?: string
          responsavel_legal_id?: string | null
          solicitante_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_autorizacao_selecao_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes_precos"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_homologacao_selecao: {
        Row: {
          atendida: boolean | null
          created_at: string | null
          data_atendimento: string | null
          data_solicitacao: string
          id: string
          responsavel_legal_id: string
          selecao_id: string
          solicitante_id: string | null
        }
        Insert: {
          atendida?: boolean | null
          created_at?: string | null
          data_atendimento?: string | null
          data_solicitacao?: string
          id?: string
          responsavel_legal_id: string
          selecao_id: string
          solicitante_id?: string | null
        }
        Update: {
          atendida?: boolean | null
          created_at?: string | null
          data_atendimento?: string | null
          data_solicitacao?: string
          id?: string
          responsavel_legal_id?: string
          selecao_id?: string
          solicitante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_homologacao_selecao_responsavel_legal_id_fkey"
            columns: ["responsavel_legal_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_homologacao_selecao_selecao_id_fkey"
            columns: ["selecao_id"]
            isOneToOne: false
            referencedRelation: "selecoes_fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_homologacao_selecao_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      atualizar_item_proposta_selecao: {
        Args: {
          p_item_id: string
          p_marca: string
          p_proposta_id: string
          p_valor_total: number
          p_valor_unitario: number
        }
        Returns: Json
      }
      delete_analise_compliance: {
        Args: { p_cotacao_id: string }
        Returns: undefined
      }
      executar_delete_sem_trigger: {
        Args: { p_coluna: string; p_path: string; p_tabela: string }
        Returns: number
      }
      fornecedor_has_proposta_cotacao: {
        Args: { _cotacao_id: string; _user_id: string }
        Returns: boolean
      }
      fornecedor_has_resposta_cotacao: {
        Args: { _cotacao_id: string; _user_id: string }
        Returns: boolean
      }
      get_all_file_references: {
        Args: never
        Returns: {
          url: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "gestor" | "colaborador" | "compliance"
      status_atendimento: "aberto" | "em_analise" | "respondido" | "fechado"
      status_contrato: "ativo" | "encerrado" | "suspenso"
      status_cotacao: "em_aberto" | "encerrada" | "cancelada"
      status_processo:
        | "planejado"
        | "em_cotacao"
        | "cotacao_concluida"
        | "em_selecao"
        | "contratado"
        | "concluido"
        | "cancelado"
        | "contratacao"
      status_selecao: "planejada" | "em_disputa" | "encerrada" | "cancelada"
      tipo_processo: "material" | "servico" | "mao_obra_exclusiva" | "outros"
      user_profile: "gestor" | "colaborador" | "fornecedor"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["gestor", "colaborador", "compliance"],
      status_atendimento: ["aberto", "em_analise", "respondido", "fechado"],
      status_contrato: ["ativo", "encerrado", "suspenso"],
      status_cotacao: ["em_aberto", "encerrada", "cancelada"],
      status_processo: [
        "planejado",
        "em_cotacao",
        "cotacao_concluida",
        "em_selecao",
        "contratado",
        "concluido",
        "cancelado",
        "contratacao",
      ],
      status_selecao: ["planejada", "em_disputa", "encerrada", "cancelada"],
      tipo_processo: ["material", "servico", "mao_obra_exclusiva", "outros"],
      user_profile: ["gestor", "colaborador", "fornecedor"],
    },
  },
} as const
