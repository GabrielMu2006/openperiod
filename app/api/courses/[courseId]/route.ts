import { z } from "zod";
import { getCurrentUser } from "@/src/server/auth/session";
import { errorResponse } from "@/src/server/http";
import { deleteCourse, updateCourse } from "@/src/server/schedule/data";
import { courseMutationSchema } from "@/src/server/schedule/validation";

export async function PUT(request: Request, context: { params: Promise<{ courseId: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });
    const { courseId } = await context.params;
    if (!z.uuid().safeParse(courseId).success) return Response.json({ error: "课程 ID 无效" }, { status: 400 });
    const parsed = courseMutationSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "课程内容无效", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    await updateCourse(user.id, courseId, parsed.data);
    return Response.json({ updated: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ courseId: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });
    const { courseId } = await context.params;
    if (!z.uuid().safeParse(courseId).success) return Response.json({ error: "课程 ID 无效" }, { status: 400 });
    await deleteCourse(user.id, courseId);
    return Response.json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
