"use client";

import { useFormState, useFormStatus } from "react-dom";
import { loginAction, type LoginActionState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL_STATE: LoginActionState = {};

export function LoginForm() {
  const [state, formAction] = useFormState(loginAction, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">Hasło właściciela</Label>
        <Input
          id="password"
          type="password"
          name="password"
          placeholder="Wpisz hasło"
          autoComplete="current-password"
          required
        />
      </div>

      {state.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Logowanie..." : "Wejdź do dashboardu"}
    </Button>
  );
}
