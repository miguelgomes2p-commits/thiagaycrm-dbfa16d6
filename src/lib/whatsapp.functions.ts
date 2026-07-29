import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listWhatsappNumbers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: member } = await context.supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!member) throw new Error("Workspace não encontrado");

    const isAdmin = member.role === "owner" || member.role === "admin";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("whatsapp_numbers")
      .select(
        "id, label, display_number, phone_number_id, waba_id, is_active, webhook_verify_token, auto_reply_enabled, last_webhook_at, created_at, provider, instance_name, connection_status, last_qr_at, default_owner_id, n8n_webhook_url, n8n_webhook_auth_header, wa_profile_name, wa_owner_jid",
      )
      .eq("workspace_id", data.workspaceId)
      .order("created_at");
    if (!isAdmin) query = query.eq("default_owner_id", context.userId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((row) => ({
      ...row,
      webhook_verify_token: isAdmin ? row.webhook_verify_token : null,
    }));

  });

export const connectWhatsappNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        label: z.string().min(1).max(80),
        displayNumber: z.string().min(6),
        phoneNumberId: z.string().min(5),
        wabaId: z.string().min(5),
        appId: z.string().optional().nullable(),
        accessToken: z.string().min(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { graphFetch } = await import("@/lib/whatsapp.server");
    // sanity check credentials
    await graphFetch<{ display_phone_number: string; verified_name: string }>(
      `/${data.phoneNumberId}?fields=display_phone_number,verified_name`,
      data.accessToken,
      { method: "GET" },
    );

    const { data: inserted, error } = await context.supabase
      .from("whatsapp_numbers")
      .insert({
        workspace_id: data.workspaceId,
        label: data.label,
        display_number: data.displayNumber,
        phone_number_id: data.phoneNumberId,
        waba_id: data.wabaId,
        app_id: data.appId ?? null,
        access_token: data.accessToken,
        default_owner_id: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return inserted;
  });

export const updateN8nForwarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        url: z.string().trim().url().or(z.literal("")).nullable().optional(),
        authHeader: z.string().trim().max(1000).or(z.literal("")).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("whatsapp_numbers")
      .select("workspace_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Número não encontrado");
    const { data: member } = await context.supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", row.workspace_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!member || (member.role !== "owner" && member.role !== "admin")) {
      throw new Error("Apenas administradores podem alterar o webhook do N8N");
    }
    const { error } = await supabaseAdmin
      .from("whatsapp_numbers")
      .update({
        n8n_webhook_url: data.url ? data.url : null,
        n8n_webhook_auth_header: data.authHeader ? data.authHeader : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteWhatsappNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Fetch provider details BEFORE delete so we can clean up the Evolution instance too.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: num } = await supabaseAdmin
      .from("whatsapp_numbers")
      .select("provider, provider_base_url, provider_api_key, instance_name")
      .eq("id", data.id)
      .maybeSingle();

    const { error } = await context.supabase.from("whatsapp_numbers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);

    // Best-effort cleanup on Evolution (logout + delete). Never blocks the CRM delete.
    let evolutionCleanup: { attempted: boolean; ok: boolean; error?: string } = { attempted: false, ok: false };
    if (num?.provider === "evolution" && num.provider_base_url && num.provider_api_key && num.instance_name) {
      evolutionCleanup.attempted = true;
      try {
        const { evolutionLogout, evolutionDeleteInstance } = await import("@/lib/evolution.server");
        await evolutionLogout(num.provider_base_url, num.provider_api_key, num.instance_name).catch(() => {});
        await evolutionDeleteInstance(num.provider_base_url, num.provider_api_key, num.instance_name);
        evolutionCleanup.ok = true;
      } catch (err) {
        evolutionCleanup.error = err instanceof Error ? err.message : String(err);
      }
    }
    return { ok: true, evolutionCleanup };
  });

export const toggleAutoReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), enabled: z.boolean(), prompt: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("whatsapp_numbers")
      .update({ auto_reply_enabled: data.enabled, auto_reply_prompt: data.prompt ?? null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendWhatsappMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ conversationId: z.string().uuid(), body: z.string().min(1).max(4096) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: conv, error: cerr } = await context.supabase
      .from("conversations")
      .select("id, workspace_id, whatsapp_number_id, wa_contact_wa_id, contact_id")
      .eq("id", data.conversationId)
      .single();
    if (cerr || !conv) throw new Error("Conversa não encontrada");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Auto-heal: se a conversa perdeu o vínculo com o número, tenta resolver o
    // único número conectado do workspace.
    let whatsappNumberId = conv.whatsapp_number_id;
    let waContactId = conv.wa_contact_wa_id;
    if (!whatsappNumberId) {
      const { data: candidates } = await supabaseAdmin
        .from("whatsapp_numbers")
        .select("id")
        .eq("workspace_id", conv.workspace_id)
        .eq("connection_status", "connected");
      if (!candidates || candidates.length !== 1) {
        throw new Error("Conversa sem número WhatsApp vinculado. Conecte/selecione um número.");
      }
      whatsappNumberId = candidates[0].id;
    }
    if (!waContactId && conv.contact_id) {
      const { data: ct } = await supabaseAdmin
        .from("contacts")
        .select("phone")
        .eq("id", conv.contact_id)
        .maybeSingle();
      waContactId = ct?.phone ?? null;
    }
    if (!waContactId) throw new Error("Contato sem número de WhatsApp.");

    // Persiste o backfill para não repetir a resolução.
    if (whatsappNumberId !== conv.whatsapp_number_id || waContactId !== conv.wa_contact_wa_id) {
      await supabaseAdmin
        .from("conversations")
        .update({ whatsapp_number_id: whatsappNumberId, wa_contact_wa_id: waContactId })
        .eq("id", conv.id);
    }

    const { data: num, error: nerr } = await supabaseAdmin
      .from("whatsapp_numbers")
      .select("id, provider, phone_number_id, access_token, provider_base_url, provider_api_key, instance_name")
      .eq("id", whatsappNumberId)
      .eq("workspace_id", conv.workspace_id)
      .single();
    if (nerr || !num) throw new Error("Número WhatsApp não encontrado");
    conv.wa_contact_wa_id = waContactId;

    const nowIso = new Date().toISOString();
    const { data: pendingMsg, error: pendingErr } = await context.supabase
      .from("messages")
      .insert({
        workspace_id: conv.workspace_id,
        conversation_id: conv.id,
        direction: "outbound",
        sender_type: "user",
        sender_user_id: context.userId,
        content: data.body,
        delivery_status: "pending",
        created_at: nowIso,
      })
      .select()
      .single();
    if (pendingErr || !pendingMsg) throw new Error(pendingErr?.message ?? "Falha ao registrar mensagem");
    await context.supabase
      .from("conversations")
      .update({ last_message_preview: data.body.slice(0, 200), last_message_at: nowIso })
      .eq("id", conv.id);

    try {
      let waId: string | null = null;
      if (num.provider === "cloud_api") {
        if (!num.phone_number_id || !num.access_token) {
          throw new Error("Credenciais Cloud API ausentes neste número.");
        }
        const { sendWaText } = await import("@/lib/whatsapp.server");
        const resp = await sendWaText(num.phone_number_id, num.access_token, conv.wa_contact_wa_id, data.body);
        waId = resp.messages?.[0]?.id ?? null;
      } else if (num.provider === "evolution") {
        if (!num.provider_base_url || !num.provider_api_key || !num.instance_name) {
          throw new Error("Configuração da instância Evolution ausente.");
        }
        const { evolutionSendText } = await import("@/lib/evolution.server");
        const resp = await evolutionSendText(
          num.provider_base_url,
          num.provider_api_key,
          num.instance_name,
          conv.wa_contact_wa_id,
          data.body,
        );
        waId = resp.key?.id ?? null;
      } else {
        throw new Error(`Provedor ${num.provider} não implementado`);
      }
      const { data: msg, error: merr } = await context.supabase
        .from("messages")
        .update({
          wa_message_id: waId,
          delivery_status: "sent",
        })
        .eq("id", pendingMsg.id)
        .select()
        .single();
      if (merr) {
        if (waId && merr.code === "23505") {
          const { data: existing } = await context.supabase
            .from("messages")
            .select("*")
            .eq("workspace_id", conv.workspace_id)
            .eq("wa_message_id", waId)
            .maybeSingle();
          if (existing) {
            await supabaseAdmin.from("messages").delete().eq("id", pendingMsg.id);
            return existing;
          }
        }
        throw new Error(merr.message);
      }
      return msg;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      await context.supabase.from("messages").update({
        delivery_status: "failed",
        error_message: errorMessage,
      }).eq("id", pendingMsg.id);
      throw new Error(errorMessage);
    }
  });

export const sendWhatsappAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      conversationId: z.string().uuid(),
      fileName: z.string().min(1).max(180),
      mimeType: z.string().min(3).max(120),
      base64: z.string().min(4).max(25_000_000),
      caption: z.string().max(1024).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    function extOf(mime: string, fileName: string) {
      const fromName = fileName.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase();
      if (fromName) return fromName;
      const clean = mime.split(";")[0]?.toLowerCase();
      const map: Record<string, string> = {
        "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
        "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/webm": "webm", "audio/wav": "wav",
        "video/mp4": "mp4", "video/webm": "webm", "application/pdf": "pdf", "text/plain": "txt",
      };
      return map[clean] ?? clean?.split("/")[1] ?? "bin";
    }

    function mediaTypeOf(mime: string): "image" | "audio" | "video" | "document" {
      if (mime.startsWith("image/")) return "image";
      if (mime.startsWith("audio/")) return "audio";
      if (mime.startsWith("video/")) return "video";
      return "document";
    }

    const { data: conv, error: cerr } = await context.supabase
      .from("conversations")
      .select("id, workspace_id, whatsapp_number_id, wa_contact_wa_id")
      .eq("id", data.conversationId)
      .single();
    if (cerr || !conv) throw new Error("Conversa não encontrada");
    if (!conv.whatsapp_number_id || !conv.wa_contact_wa_id) {
      throw new Error("Esta conversa não está vinculada a um número WhatsApp");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: num, error: nerr } = await supabaseAdmin
      .from("whatsapp_numbers")
      .select("id, provider, phone_number_id, access_token, provider_base_url, provider_api_key, instance_name")
      .eq("id", conv.whatsapp_number_id)
      .eq("workspace_id", conv.workspace_id)
      .single();
    if (nerr || !num) throw new Error("Número WhatsApp não encontrado");

    const cleanBase64 = data.base64.includes(",") ? data.base64.split(",").pop()! : data.base64;
    const bytes = Uint8Array.from(atob(cleanBase64), (c) => c.charCodeAt(0));
    if (bytes.byteLength > 16 * 1024 * 1024) throw new Error("Arquivo muito grande. Use até 16 MB.");
    const mediaType = mediaTypeOf(data.mimeType);
    const ext = extOf(data.mimeType, data.fileName);
    const safeName = data.fileName.replace(/[^\w.() -]/g, "_").slice(0, 140) || `arquivo.${ext}`;
    // Data URIs não aceitam o parâmetro `codecs=...` no mime — Evolution/ffmpeg
    // rejeita com 400 Bad Request. Usa apenas o mime base (ex.: `audio/webm`).
    const audioMimeForUri = (data.mimeType.split(";")[0] || "audio/ogg").trim();
    const evolutionAudioPayload = data.base64.includes(",") ? data.base64 : `data:${audioMimeForUri};base64,${cleanBase64}`;
    const path = `${conv.workspace_id}/${conv.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("wa-media")
      .upload(path, bytes, { contentType: data.mimeType, upsert: false });
    if (upErr) throw new Error(upErr.message);
    const { data: signed } = await supabaseAdmin.storage.from("wa-media").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    const mediaUrl = signed?.signedUrl ?? null;
    const preview = mediaType === "image" ? "📷 Imagem"
      : mediaType === "audio" ? "🎵 Áudio"
      : mediaType === "video" ? "🎬 Vídeo"
      : `📎 ${safeName}`;

    const nowIso = new Date().toISOString();
    const { data: pendingMsg, error: pendingErr } = await context.supabase
      .from("messages")
      .insert({
        workspace_id: conv.workspace_id,
        conversation_id: conv.id,
        direction: "outbound",
        sender_type: "user",
        sender_user_id: context.userId,
        content: data.caption || (mediaType === "document" ? `📎 ${safeName}` : preview),
        delivery_status: "pending",
        media_url: mediaUrl,
        media_type: mediaType,
        media_mime_type: data.mimeType,
        created_at: nowIso,
      })
      .select()
      .single();
    if (pendingErr || !pendingMsg) throw new Error(pendingErr?.message ?? "Falha ao registrar anexo");
    await context.supabase
      .from("conversations")
      .update({ last_message_preview: preview.slice(0, 200), last_message_at: nowIso })
      .eq("id", conv.id);

    try {
      let waId: string | null = null;
      if (num.provider === "cloud_api") {
        if (!num.phone_number_id || !num.access_token) throw new Error("Credenciais Cloud API ausentes neste número.");
        const { sendWaMedia } = await import("@/lib/whatsapp.server");
        const resp = await sendWaMedia(num.phone_number_id, num.access_token, conv.wa_contact_wa_id, bytes, data.mimeType, safeName, data.caption ?? undefined);
        waId = resp.messages?.[0]?.id ?? null;
      } else if (num.provider === "evolution") {
        if (!num.provider_base_url || !num.provider_api_key || !num.instance_name) throw new Error("Configuração da instância Evolution ausente.");
        const { evolutionSendMedia, evolutionSendWhatsAppAudio } = await import("@/lib/evolution.server");
        const resp = mediaType === "audio"
          ? await evolutionSendWhatsAppAudio(
              num.provider_base_url,
              num.provider_api_key,
              num.instance_name,
              conv.wa_contact_wa_id,
              evolutionAudioPayload,
            )
          : await evolutionSendMedia(
              num.provider_base_url,
              num.provider_api_key,
              num.instance_name,
              conv.wa_contact_wa_id,
              mediaType,
              cleanBase64,
              data.mimeType,
              safeName,
              data.caption ?? undefined,
            );
        waId = resp.key?.id ?? null;
      } else {
        throw new Error(`Provedor ${num.provider} não implementado`);
      }

      const { data: msg, error: merr } = await context.supabase
        .from("messages")
        .update({
          wa_message_id: waId,
          delivery_status: "sent",
        })
        .eq("id", pendingMsg.id)
        .select()
        .single();
      if (merr) {
        if (waId && merr.code === "23505") {
          const { data: existing } = await context.supabase
            .from("messages")
            .select("*")
            .eq("workspace_id", conv.workspace_id)
            .eq("wa_message_id", waId)
            .maybeSingle();
          if (existing) {
            await supabaseAdmin.from("messages").delete().eq("id", pendingMsg.id);
            return existing;
          }
        }
        throw new Error(merr.message);
      }
      return msg;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      await context.supabase.from("messages").update({
        delivery_status: "failed",
        error_message: errorMessage,
      }).eq("id", pendingMsg.id);
      throw new Error(errorMessage);
    }
  });

export const repairWhatsappAudioMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    function stripDataUrl(value?: string | null) {
      if (!value) return undefined;
      return value.includes(",") ? value.split(",").pop() : value;
    }

    function extOf(mime?: string | null) {
      const clean = mime?.split(";")[0]?.trim().toLowerCase();
      const map: Record<string, string> = {
        "audio/ogg": "ogg",
        "audio/opus": "opus",
        "audio/mpeg": "mp3",
        "audio/mp4": "m4a",
        "audio/aac": "aac",
        "audio/wav": "wav",
        "audio/webm": "webm",
      };
      return (clean && (map[clean] ?? clean.split("/")[1])) || "ogg";
    }

    const { data: conv, error: cerr } = await context.supabase
      .from("conversations")
      .select("id, workspace_id, whatsapp_number_id, wa_contact_wa_id")
      .eq("id", data.conversationId)
      .single();
    if (cerr || !conv) throw new Error("Conversa não encontrada");
    if (!conv.whatsapp_number_id) return { repaired: 0, attempted: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: num, error: nerr } = await supabaseAdmin
      .from("whatsapp_numbers")
      .select("id, provider, provider_base_url, provider_api_key, instance_name")
      .eq("id", conv.whatsapp_number_id)
      .eq("workspace_id", conv.workspace_id)
      .single();
    if (nerr || !num) throw new Error("Número WhatsApp não encontrado");
    if (num.provider !== "evolution" || !num.provider_base_url || !num.provider_api_key || !num.instance_name) {
      return { repaired: 0, attempted: 0 };
    }

    const { data: rows, error: merr } = await context.supabase
      .from("messages")
      .select("id, wa_message_id, direction, media_type, content")
      .eq("conversation_id", conv.id)
      .is("media_url", null)
      .not("wa_message_id", "is", null)
      .or("media_type.eq.audio,content.ilike.%Áudio%,content.ilike.%Audio%,content.ilike.%audio%")
      .order("created_at", { ascending: false })
      .limit(20);
    if (merr) throw new Error(merr.message);

    const { evolutionGetBase64FromMedia } = await import("@/lib/evolution.server");
    let repaired = 0;
    for (const msg of rows ?? []) {
      try {
        const resp = await evolutionGetBase64FromMedia(num.provider_base_url, num.provider_api_key, num.instance_name, {
          key: {
            id: msg.wa_message_id,
            remoteJid: conv.wa_contact_wa_id ? `${conv.wa_contact_wa_id}@s.whatsapp.net` : undefined,
            fromMe: msg.direction === "outbound",
          },
        });
        const base64 = stripDataUrl(resp.base64 ?? resp.buffer);
        if (!base64) continue;
        const mime = resp.mimetype || "audio/ogg";
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const path = `${conv.workspace_id}/${conv.id}/${msg.id}.${extOf(mime)}`;
        const { error: upErr } = await supabaseAdmin.storage
          .from("wa-media")
          .upload(path, bytes, { contentType: mime, upsert: true });
        if (upErr) continue;
        const { data: signed } = await supabaseAdmin.storage.from("wa-media").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
        if (!signed?.signedUrl) continue;
        const { error: uerr } = await context.supabase
          .from("messages")
          .update({ media_url: signed.signedUrl, media_type: "audio", media_mime_type: mime })
          .eq("id", msg.id);
        if (!uerr) repaired += 1;
      } catch {
        // Keep the chat usable even when Evolution can no longer return an old audio blob.
      }
    }
    return { repaired, attempted: rows?.length ?? 0 };
  });

export const sendWhatsappTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        whatsappNumberId: z.string().uuid(),
        to: z.string().min(6),
        contactId: z.string().uuid().optional().nullable(),
        templateName: z.string().min(1),
        language: z.string().default("pt_BR"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: member } = await context.supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!member) throw new Error("Workspace não encontrado");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: num, error: nerr } = await supabaseAdmin
      .from("whatsapp_numbers")
      .select("id, workspace_id, phone_number_id, access_token")
      .eq("id", data.whatsappNumberId)
      .single();
    if (nerr || !num || num.workspace_id !== data.workspaceId) throw new Error("Número não encontrado");
    if (!num.phone_number_id || !num.access_token) throw new Error("Este número não usa Cloud API.");

    const { sendWaTemplate } = await import("@/lib/whatsapp.server");
    const to = data.to.replace(/\D/g, "");
    const resp = await sendWaTemplate(num.phone_number_id, num.access_token, to, data.templateName, data.language);

    let contactId = data.contactId ?? undefined;
    if (!contactId) {
      const { data: existing } = await context.supabase
        .from("contacts")
        .select("id")
        .eq("workspace_id", data.workspaceId)
        .eq("phone", to)
        .maybeSingle();
      if (existing) {
        contactId = existing.id;
      } else {
        const { data: created } = await context.supabase
          .from("contacts")
          .insert({ workspace_id: data.workspaceId, type: "person", name: to, phone: to })
          .select("id")
          .single();
        contactId = created?.id;
      }
    }

    let convId: string | undefined;
    const { data: convExisting } = await context.supabase
      .from("conversations")
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .eq("whatsapp_number_id", num.id)
      .eq("wa_contact_wa_id", to)
      .maybeSingle();
    if (convExisting) {
      convId = convExisting.id;
    } else {
      const { data: convCreated } = await context.supabase
        .from("conversations")
        .insert({
          workspace_id: data.workspaceId,
          contact_id: contactId,
          channel: "whatsapp",
          status: "open",
          whatsapp_number_id: num.id,
          wa_contact_wa_id: to,
        })
        .select("id")
        .single();
      convId = convCreated?.id;
    }

    if (convId) {
      await context.supabase.from("messages").insert({
        workspace_id: data.workspaceId,
        conversation_id: convId,
        direction: "outbound",
        sender_type: "user",
        sender_user_id: context.userId,
        content: `[template: ${data.templateName}]`,
        template_name: data.templateName,
        wa_message_id: resp.messages?.[0]?.id ?? null,
        delivery_status: "sent",
      });
      await context.supabase
        .from("conversations")
        .update({ last_message_preview: `📄 ${data.templateName}`, last_message_at: new Date().toISOString() })
        .eq("id", convId);
    }
    return { ok: true, conversationId: convId };
  });

export const syncWhatsappTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ whatsappNumberId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: num, error: nerr } = await supabaseAdmin
      .from("whatsapp_numbers")
      .select("id, workspace_id, waba_id, access_token")
      .eq("id", data.whatsappNumberId)
      .single();
    if (nerr || !num) throw new Error("Número não encontrado");

    const { data: member } = await context.supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", num.workspace_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!member || (member.role !== "owner" && member.role !== "admin")) throw new Error("Apenas admins podem sincronizar templates.");
    if (!num.waba_id || !num.access_token) throw new Error("Este número não usa Cloud API.");

    const { listWaTemplates } = await import("@/lib/whatsapp.server");
    const resp = await listWaTemplates(num.waba_id, num.access_token);
    const rows = (resp.data ?? []).map((t) => {
      const s = (t.status ?? "").toLowerCase();
      const status: "approved" | "pending" | "rejected" | "paused" =
        s === "approved" ? "approved" : s === "rejected" ? "rejected" : s === "paused" ? "paused" : "pending";
      return {
        workspace_id: num.workspace_id,
        whatsapp_number_id: num.id,
        name: t.name,
        language: t.language,
        category: t.category ?? null,
        status,
        components: (t.components ?? []) as never,
        meta_id: t.id,
      };
    });
    if (rows.length > 0) {
      const { error } = await context.supabase
        .from("whatsapp_templates")
        .upsert(rows, { onConflict: "whatsapp_number_id,name,language" });
      if (error) throw new Error(error.message);
    }
    return { count: rows.length };
  });

export const subscribeWhatsappWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ whatsappNumberId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: num, error: nerr } = await supabaseAdmin
      .from("whatsapp_numbers")
      .select("id, workspace_id, waba_id, access_token")
      .eq("id", data.whatsappNumberId)
      .single();
    if (nerr || !num) throw new Error("Número não encontrado");
    const { data: member } = await context.supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", num.workspace_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!member || (member.role !== "owner" && member.role !== "admin")) throw new Error("Apenas admins podem assinar a WABA.");
    if (!num.waba_id || !num.access_token) throw new Error("Este número não usa Cloud API.");

    const { subscribeWabaToMessages, listWabaSubscriptions } = await import("@/lib/whatsapp.server");
    await subscribeWabaToMessages(num.waba_id, num.access_token);
    const subscriptions = await listWabaSubscriptions(num.waba_id, num.access_token);
    const fields = subscriptions.data?.flatMap((app) => app.subscribed_fields ?? []) ?? [];

    return { ok: true, messagesSubscribed: fields.includes("messages"), subscribedFields: [...new Set(fields)] };
  });

export const listWhatsappTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("whatsapp_templates")
      .select("id, name, language, category, status, whatsapp_number_id, updated_at")
      .eq("workspace_id", data.workspaceId)
      .order("name");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const takeConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("conversations")
      .update({ assigned_to: context.userId })
      .eq("id", data.conversationId);
    await context.supabase
      .from("queue_entries")
      .update({ assigned_to: context.userId, assigned_at: new Date().toISOString() })
      .eq("conversation_id", data.conversationId);
    return { ok: true };
  });

export const releaseConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("conversations")
      .update({ assigned_to: null })
      .eq("id", data.conversationId);
    await context.supabase
      .from("queue_entries")
      .update({ assigned_to: null, assigned_at: null })
      .eq("conversation_id", data.conversationId);
    return { ok: true };
  });

export const resolveConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("queue_entries")
      .update({ resolved_at: new Date().toISOString() })
      .eq("conversation_id", data.conversationId);
    await context.supabase.from("conversations").update({ status: "closed" }).eq("id", data.conversationId);
    return { ok: true };
  });
