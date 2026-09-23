import { rejectUnlessAdmin } from "@/src/server/admin";
import { errorResponse } from "@/src/server/http";
import { listSchoolSubmissions } from "@/src/server/school-submissions/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await rejectUnlessAdmin(request);
  if (denied) return denied;
  try {
    const items = await listSchoolSubmissions();
    return Response.json({
      total: items.length,
      pending: items.filter((item) => item.status === "pending").length,
      items,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
