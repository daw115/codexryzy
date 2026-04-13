"use client";

import { useFormState, useFormStatus } from "react-dom";

import { loginAction, type LoginActionState } from "@/app/login/actions";

const INITIAL_STATE: LoginActionState = {};

export function LoginForm() {
  const [state, formAction] = useFormState(loginAction, INITIAL_STATE);

  return (
    <form action={formAction} className="loginForm">
      <label className="field">
        <span className="fieldLabel">Hasło właściciela</span>
        <input
          className="fieldInput"
          type="password"
          name="password"
          placeholder="Wpisz hasło"
          autoComplete="current-password"
          required
        />
      </label>

      {state.error ? <p className="formError">{state.error}</p> : null}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="primaryButton" type="submit" disabled={pending}>
      {pending ? "Logowanie..." : "Wejdź do dashboardu"}
    </button>
  );
}
