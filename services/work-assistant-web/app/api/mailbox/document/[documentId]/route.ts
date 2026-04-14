import { NextRequest, NextResponse } from "next/server";

import { getDocumentDetail } from "@/lib/api";
import { isRequestAuthenticated } from "@/lib/auth";

type RouteContext = {
  params: {
    documentId: string;
  };
};

export async function GET(request: NextRequest, context: RouteContext) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const response = await getDocumentDetail(context.params.documentId);
  return NextResponse.json(response);
}
