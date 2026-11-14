/**
 * Webhook da WhatsApp Business Cloud API.
 *  GET  — verificação do endpoint pela Meta (hub.challenge)
 *  POST — mensagens recebidas e status de entrega (assinatura validada)
 */
import { timingSafeEqual } from "node:crypto";
import { assinaturaValida, configWhatsApp } from "@/lib/whatsapp/client";
import { processarWebhook } from "@/lib/whatsapp/webhook";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function iguais(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const modo = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const desafio = url.searchParams.get("hub.challenge") ?? "";
  const { verifyToken } = configWhatsApp();

  if (modo === "subscribe" && verifyToken && iguais(token, verifyToken)) {
    return new Response(desafio, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const { appSecret } = configWhatsApp();
  if (!appSecret) {
    // sem o App Secret não há como validar a origem: recusa tudo
    return new Response("Webhook não configurado", { status: 503 });
  }

  const corpo = await req.text();
  if (!assinaturaValida(corpo, req.headers.get("x-hub-signature-256"), appSecret)) {
    return new Response("Assinatura inválida", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(corpo);
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }

  try {
    await processarWebhook(payload as never);
  } catch (err) {
    // Responde 200 mesmo assim: a mensagem já foi registrada e um reenvio da
    // Meta seria descartado como duplicado. O erro fica no log do servidor.
    console.error("[webhook] erro ao processar:", err);
  }
  return new Response("OK", { status: 200 });
}
