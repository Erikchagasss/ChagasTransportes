import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/service";

const vapidConfigured =
  !!process.env.VAPID_PUBLIC_KEY &&
  !!process.env.VAPID_PRIVATE_KEY &&
  !!process.env.VAPID_SUBJECT;

if (vapidConfigured) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Envia a notificação para TODAS as inscrições salvas (só admin se
 * inscreve — ver RLS de push_subscriptions). Usa service role porque
 * quem dispara isso normalmente é o motorista, que não tem permissão
 * de ler a inscrição do admin.
 */
export async function sendPushToAdmins(payload: PushPayload): Promise<void> {
  if (!vapidConfigured) {
    console.warn(
      "VAPID não configurado — defina VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT. Notificação não enviada."
    );
    return;
  }

  const supabase = createServiceClient();
  const { data: subscriptions } = await supabase.from("push_subscriptions").select("*");

  if (!subscriptions || subscriptions.length === 0) return;

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload)
      )
    )
  );

  // Limpa inscrições mortas (usuário desinstalou o app, revogou permissão, etc)
  const deadEndpoints: string[] = [];
  results.forEach((result, i) => {
    if (
      result.status === "rejected" &&
      (result.reason?.statusCode === 404 || result.reason?.statusCode === 410)
    ) {
      deadEndpoints.push(subscriptions[i].endpoint);
    }
  });

  if (deadEndpoints.length > 0) {
    await supabase.from("push_subscriptions").delete().in("endpoint", deadEndpoints);
  }
}
