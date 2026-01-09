-- Habilitar REPLICA IDENTITY para capturar dados completos em updates
ALTER TABLE public.mensagens_contato_destinatarios REPLICA IDENTITY FULL;

-- Adicionar tabela ao realtime para atualizações em tempo real
ALTER PUBLICATION supabase_realtime ADD TABLE public.mensagens_contato_destinatarios;