import { getRequest } from "@tanstack/react-start/server";
import { createHash } from "crypto";

export type WorkspaceRole = "owner" | "admin" | "manager" | "agent";

export async function assertWorkspaceAdmin(supabase: any, workspaceId: string, userId: string) {
  const { data } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || (data.role !== "owner" && data.role !== "admin")) {
    throw new Error("Apenas owner/admin do workspace pode gerenciar membros.");
  }
}

export function normalizeInviteEmail(email: string) {
  const value = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error("Email inválido.");
  return value;
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getRequestOrigin() {
  const req = getRequest();
  const urlOrigin = req ? new URL(req.url).origin : "";
  const host = req?.headers.get("x-forwarded-host") ?? req?.headers.get("host");
  const proto = req?.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : urlOrigin;
}