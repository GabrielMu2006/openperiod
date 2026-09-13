import { getCurrentUser } from "@/src/server/auth/session";
import { errorResponse } from "@/src/server/http";
import { createCourse } from "@/src/server/schedule/data";
import { courseMutationSchema } from "@/src/server/schedule/validation";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });
    const parsed = courseMutationSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "课程内容无效", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    return Response.json({ course: await createCourse(user.id, parsed.data) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

