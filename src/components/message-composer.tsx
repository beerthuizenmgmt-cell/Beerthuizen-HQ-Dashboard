"use client";

import { useActionState, useEffect, useRef } from "react";
import { sendChannelMessage, type MessageState } from "@/lib/actions/messages";

const initial: MessageState = {};

export function MessageComposer({
  channelId,
  channelKey,
  agentNames,
  hint,
}: {
  channelId: string;
  channelKey: string;
  agentNames: string[];
  hint: string;
}) {
  const [state, formAction, pending] = useActionState(sendChannelMessage, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      inputRef.current?.focus();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="channelId" value={channelId} />

      <div className="flex gap-2">
        <textarea
          ref={inputRef}
          name="body"
          className="input max-h-40 min-h-11 flex-1 resize-y py-2.5"
          placeholder={hint}
          rows={1}
          onKeyDown={(event) => {
            // Enter verstuurt, shift+enter maakt een nieuwe regel — zoals in
            // elke chat die je gewend bent.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button type="submit" className="btn btn-primary self-end" disabled={pending}>
          {pending ? "…" : "Sturen"}
        </button>
      </div>

      {agentNames.length > 0 && (
        <p className="text-[11px] text-text-faint">
          Noem een agent met @{agentNames[0]} · Enter verstuurt, Shift+Enter is een nieuwe regel
          {channelKey ? "" : ""}
        </p>
      )}

      {state.error && (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
