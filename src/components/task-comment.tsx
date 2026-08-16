"use client";

import { useActionState, useRef, useEffect } from "react";
import { addTaskComment, type TaskState } from "@/lib/actions/tasks";

const initial: TaskState = {};

export function TaskComment({ taskId }: { taskId: string }) {
  const [state, formAction, pending] = useActionState(addTaskComment, initial);
  const formRef = useRef<HTMLFormElement>(null);

  // Na een geslaagde notitie het veld leegmaken, anders staat je vorige tekst
  // er nog als je iets nieuws wilt typen.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex gap-2">
      <input type="hidden" name="taskId" value={taskId} />
      <input name="body" className="input flex-1" placeholder="Notitie toevoegen…" />
      <button type="submit" className="btn btn-ghost" disabled={pending}>
        {pending ? "…" : "Plaatsen"}
      </button>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
    </form>
  );
}
