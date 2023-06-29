import { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 200,
    message: "success.",
  });
}
