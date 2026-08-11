/**
 * Formatação de telefone APENAS para exibição.
 *
 * O valor canônico (5567999999999) continua sendo o único usado por
 * Evolution API, remoteJid, contacts.phone, N8N e webhooks. Nada aqui
 * altera persistência.
 */

/** Remove tudo que não for dígito. Uso interno / normalização de entrada. */
export function onlyDigits(value: string): string {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * Converte um número canônico em formato brasileiro legível.
 *
 * 5567999999999  -> (67) 99999-9999
 * 556733334444   -> (67) 3333-4444
 * 67999999999    -> (67) 99999-9999
 * +34600123456   -> +34 600123456 (não brasileiro: preserva)
 */
export function formatPhoneForDisplay(raw?: string | null): string {
  if (!raw) return "";
  const trimmed = String(raw).trim();
  // Grupos do WhatsApp e ids não numéricos: devolve como veio.
  if (/@g\.us$/i.test(trimmed)) return trimmed;
  const digits = onlyDigits(trimmed.split("@")[0] ?? trimmed);
  if (!digits) return trimmed;

  const isBr55 = digits.startsWith("55") && (digits.length === 12 || digits.length === 13);
  const local = isBr55 ? digits.slice(2) : digits;

  // Nacional sem DDI: 10 (fixo) ou 11 (celular) dígitos.
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }

  // Não identificado como brasileiro: nunca cortar dígitos arbitrariamente.
  if (trimmed.startsWith("+")) return trimmed;
  if (digits.length > 11) return `+${digits}`;
  return digits;
}

/** Título curto usado em headers quando não há nome do contato. */
export function phoneOrFallback(raw?: string | null, fallback = ""): string {
  const formatted = formatPhoneForDisplay(raw);
  return formatted || fallback;
}
