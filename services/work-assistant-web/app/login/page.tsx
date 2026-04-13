import { LoginForm } from "@/components/login-form";
import { requireGuest } from "@/lib/auth";

export default function LoginPage() {
  requireGuest();

  return (
    <main className="loginPage">
      <div className="loginCard">
        <section className="loginHero">
          <div>
            <span className="loginEyebrow">Private Ops Console</span>
            <h1 className="loginTitle">Work Assistant Control Room</h1>
            <p className="loginLead">
              Serwerowy pulpit do pracy na wiedzy z maili, dokumentow, zadan i kosztu modelu.
              Logika dzieje sie po stronie backendu, a przegladarka widzi tylko gotowy produkt.
            </p>
          </div>

          <div className="loginSignalStrip">
            <span className="signalChip">
              <strong>KB</strong> mail + docs + web research
            </span>
            <span className="signalChip">
              <strong>BFF</strong> zero API key w browserze
            </span>
            <span className="signalChip">
              <strong>Ops</strong> quota, taski, coverage
            </span>
          </div>

          <div className="loginHighlightGrid">
            <div className="loginHighlight">
              <strong>Knowledge runway</strong>
              Od razu widzisz od jakich dni archiwum jest juz realnie reprezentowane w bazie.
            </div>
            <div className="loginHighlight">
              <strong>Task awareness</strong>
              Otwarty stan Vikunja, zaleglosci, najblizsze terminy i jakość synchronizacji.
            </div>
            <div className="loginHighlight">
              <strong>Quota and guardrails</strong>
              Zuzycie Quatarly, jakość zrodel i techniczne punkty kontrolne w jednym miejscu.
            </div>
          </div>
        </section>

        <section className="loginPanel">
          <div>
            <h2>Wejscie wlasciciela</h2>
            <p>
              Dashboard ma osobne logowanie i podpisana sesje w `HttpOnly` cookie. Dostep do
              backendu pozostaje po stronie serwera.
            </p>
          </div>
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
