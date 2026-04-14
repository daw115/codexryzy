import { redirect } from "next/navigation";

import { isAuthenticated } from "@/lib/auth";

export default function HomePage() {
  redirect(isAuthenticated() ? "/overview" : "/login");
}
