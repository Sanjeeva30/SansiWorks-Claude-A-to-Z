"use client";
import { useEffect, useRef, useState } from "react";
import { useStore } from "./store";

export interface PresenceViewer {
  id: string;
  name: string;
  color: string;
  avatar_url: string | null;
}

/* Lightweight "who's here" — join a Realtime presence channel scoped to
   `scopeKey` (e.g. `task:${id}` or `list:${id}`) for as long as the caller is
   mounted, and return everyone else currently tracked on it.

   Deliberately not live collaborative editing: this shows avatars, nothing
   more. No polling and no heartbeat interval of our own — Supabase Realtime
   ties presence to the channel's own socket lifecycle, so closing the tab or
   navigating away drops you from every viewer list automatically. Reuses the
   one Realtime connection the app already holds for row-sync; this is a second
   channel topic on the same socket, not a second connection, and costs
   nothing against the free tier's concurrent-connection quota. */
export function usePresence(scopeKey: string | null): PresenceViewer[] {
  const { me, supabase } = useStore();
  const [viewers, setViewers] = useState<PresenceViewer[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const joinedRef = useRef(false);

  useEffect(() => {
    if (!scopeKey || !me) {
      setViewers([]);
      return;
    }
    joinedRef.current = false;
    const channel = supabase.channel(`presence:${scopeKey}`, { config: { presence: { key: me.id } } });
    channelRef.current = channel;

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<PresenceViewer>();
      const others = Object.entries(state)
        .filter(([key]) => key !== me.id)
        .map(([, entries]) => entries[0])
        .filter(Boolean);
      setViewers(others);
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        joinedRef.current = true;
        channel.track({ id: me.id, name: me.name, color: me.color, avatar_url: me.avatar_url });
      }
    });

    return () => {
      joinedRef.current = false;
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, me?.id, supabase]);

  // Re-broadcast if the viewer's own name/color/avatar changes mid-session
  // (e.g. an avatar upload while a task is open) without tearing down and
  // rejoining the channel — that would flicker every other viewer's list.
  useEffect(() => {
    if (joinedRef.current && channelRef.current && me) {
      channelRef.current.track({ id: me.id, name: me.name, color: me.color, avatar_url: me.avatar_url });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.name, me?.color, me?.avatar_url]);

  return viewers;
}
