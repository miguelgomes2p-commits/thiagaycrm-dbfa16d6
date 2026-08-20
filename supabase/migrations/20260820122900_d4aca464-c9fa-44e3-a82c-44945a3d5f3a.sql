CREATE OR REPLACE FUNCTION public.purge_old_webhook_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Eventos já finalizados não são lidos por nenhum consumidor: o drenador
  -- consulta apenas status 'pending' e 'processing'.
  DELETE FROM public.webhook_events
  WHERE status IN ('done', 'failed')
    AND created_at < now() - interval '12 hours';

  -- Eventos presos em 'processing' há muito tempo (worker morreu) já foram
  -- reprocessados pelo stale-lock recovery; após 24h são lixo.
  DELETE FROM public.webhook_events
  WHERE status = 'processing'
    AND created_at < now() - interval '24 hours';
END;
$function$;

CREATE OR REPLACE FUNCTION public.purge_old_operational_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Painel de saúde do n8n usa janela de 24h + últimas 50 linhas.
  DELETE FROM public.n8n_deliveries
  WHERE status = 'delivered'
    AND created_at < now() - interval '7 days';

  -- Dead letters são reprocessáveis manualmente: retenção maior.
  DELETE FROM public.n8n_deliveries
  WHERE status <> 'delivered'
    AND created_at < now() - interval '30 days';

  DELETE FROM public.evolution_error_logs
  WHERE created_at < now() - interval '14 days';
END;
$function$;

-- Histórico do pg_net cresce sozinho com os cron jobs de 5s/30s.
CREATE OR REPLACE FUNCTION public.purge_old_net_responses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'net', 'public'
AS $function$
BEGIN
  DELETE FROM net._http_response WHERE created < now() - interval '2 days';
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$function$;

SELECT cron.unschedule('purge-old-webhook-events');

SELECT cron.schedule(
  'purge-operational-data-hourly',
  '20 * * * *',
  $$
  SELECT public.purge_old_webhook_events();
  SELECT public.purge_old_operational_logs();
  SELECT public.purge_old_net_responses();
  $$
);