import { z } from "zod";
import { rejectUnlessAdmin } from "@/src/server/admin";
import { errorResponse } from "@/src/server/http";
import { releaseSchoolSubmission, reviewSchoolSubmission } from "@/src/server/school-submissions/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), note: z.string().max(500).optional() }),
  z.object({ action: z.literal("reject"), note: z.string().max(500).optional() }),
  z.object({ action: z.literal("release"), presetId: z.string().trim().min(1).max(64) }),
]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await rejectUnlessAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) return Response.json({ error: "候选 ID 无效" }, { status: 400 });
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "操作内容无效" }, { status: 400 });
    if (parsed.data.action === "release") {
      return Response.json({ released: await releaseSchoolSubmission(id, parsed.data.presetId) });
    }
    return Response.json({ updated: await reviewSchoolSubmission(id, parsed.data.action, parsed.data.note) });
  } catch (error) {
    return errorResponse(error);
  }
}
