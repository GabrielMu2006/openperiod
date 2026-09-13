import { z } from "zod";
import { availabilityDetailQuerySchema, searchParamsToObject } from "@/src/server/availability/query";
import { getGroupAvailabilityDetails } from "@/src/server/availability/data";
import { getCurrentUser } from "@/src/server/auth/session";
import { errorResponse } from "@/src/server/http";

export const runtime = "nodejs";

const groupIdSchema = z.uuid();

export async function GET(
  request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const viewer = await getCurrentUser();
    if (!viewer) return Response.json({ error: "未登录" }, { status: 401 });

    const { groupId } = await context.params;
    if (!groupIdSchema.safeParse(groupId).success) {
      return Response.json({ error: "群组 ID 无效" }, { status: 400 });
    }

    const parsed = availabilityDetailQuerySchema.safeParse(
      searchParamsToObject(new URL(request.url).searchParams),
    );
    if (!parsed.success) {
      return Response.json({ error: "查询参数无效" }, { status: 400 });
    }

    const { week, weekday, period, users } = parsed.data;
    return Response.json(
      await getGroupAvailabilityDetails(viewer.id, groupId, week, weekday, period, users),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
