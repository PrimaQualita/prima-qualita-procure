-- Habilitar realtime para as tabelas de solicitações de autorização
ALTER PUBLICATION supabase_realtime ADD TABLE public.solicitacoes_autorizacao;
ALTER PUBLICATION supabase_realtime ADD TABLE public.solicitacoes_autorizacao_selecao;