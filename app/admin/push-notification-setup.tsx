"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

type Status = "unsupported" | "denied" | "off" | "on" | "loading";

export default function PushNotificationSetup() {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    setStatus(existing ? "on" : "off");
  }

  async function enable() {
    setStatus("loading");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setStatus("denied");
      return;
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      console.error("NEXT_PUBLIC_VAPID_PUBLIC_KEY não configurada");
      setStatus("off");
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription),
    });

    setStatus("on");
  }

  async function disable() {
    setStatus("loading");
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
    }
    setStatus("off");
  }

  if (status === "unsupported" || status === "loading") return null;

  if (status === "denied") {
    return (
      <p className="text-xs text-graphite-600">
        Notificações bloqueadas — ative nas permissões do navegador/app.
      </p>
    );
  }

  return status === "on" ? (
    <button onClick={disable} className="text-xs text-teal-500 hover:underline">
      🔔 Notificações ativadas
    </button>
  ) : (
    <button
      onClick={enable}
      className="rounded-card bg-amber-500 px-3 py-1.5 text-xs font-medium text-graphite-950"
    >
      Ativar notificações
    </button>
  );
}
