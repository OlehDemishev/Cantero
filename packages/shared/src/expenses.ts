import { z } from "zod";

export const EXPENSE_CATEGORIES = ["materials", "fuel", "tools", "permits", "meals", "other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_STATUSES = ["pending", "approved", "rejected"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const createExpenseSchema = z.object({
  projectId: z.string().uuid(),
  workerId: z.string().uuid(),
  category: z.enum(EXPENSE_CATEGORIES).default("other"),
  amount: z.number().positive(),
  description: z.string().max(500).optional(),
  incurredAt: z.string().datetime(),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const rejectExpenseSchema = z.object({
  reason: z.string().min(1).max(300),
});
export type RejectExpenseInput = z.infer<typeof rejectExpenseSchema>;
