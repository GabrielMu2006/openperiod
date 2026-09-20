import { z } from "zod";

const privacyLevel = z.union([z.literal(0), z.literal(1), z.literal(2), z.null()]);

export const createGroupSchema = z.object({
  name: z.string().trim().min(1, "请输入群组名称").max(80, "群组名称过长"),
  privacyLevel: privacyLevel.default(null),
});

export const joinGroupSchema = z.object({
  code: z.string().trim().min(6).max(12),
  privacyLevel: privacyLevel.default(null),
});

export const privacySchema = z.object({ privacyLevel });

export const groupUpdateSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("rename"),
    name: z.string().trim().min(1, "请输入群组名称").max(80, "群组名称过长"),
  }).strict(),
  z.object({
    action: z.literal("archive"),
    archived: z.boolean(),
  }).strict(),
]);

export const transferOwnershipSchema = z.object({ role: z.literal("OWNER") }).strict();
