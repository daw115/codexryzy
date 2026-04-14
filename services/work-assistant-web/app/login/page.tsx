import { LoginForm } from "@/components/login-form";
import { requireGuest } from "@/lib/auth";
import { Bot } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function LoginPage() {
  requireGuest();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hero */}
        <div className="flex flex-col justify-center space-y-6 p-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
              <Bot className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">OjeAI</h1>
              <p className="text-sm text-muted-foreground">Work Assistant</p>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">Control Room</h2>
            <p className="text-muted-foreground">
              Prywatny dashboard do pracy na wiedzy z maili, dokumentów, zadań i kosztu modelu.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {[
              { title: "Knowledge Base", desc: "Mail + docs + web research — przeszukiwalne przez AI" },
              { title: "BFF Security", desc: "Zero API key w przeglądarce — wszystko po stronie serwera" },
              { title: "Ops Dashboard", desc: "Quota, taski, coverage — jeden punkt kontrolny" },
            ].map((item) => (
              <div key={item.title} className="p-3 rounded-lg border border-border bg-card">
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Login form */}
        <div className="flex items-center justify-center">
          <Card className="w-full max-w-sm bg-card border-border">
            <CardHeader>
              <CardTitle>Wejście właściciela</CardTitle>
              <CardDescription>
                Dashboard z osobnym logowaniem i podpisaną sesją w HttpOnly cookie.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LoginForm />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
