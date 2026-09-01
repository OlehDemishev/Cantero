import { z } from "zod";
import { EXPENSE_CATEGORIES } from "./expenses";

export const createBankTransactionRuleSchema = z.object({
  pattern: z.string().min(1).max(100),
  category: z.enum(EXPENSE_CATEGORIES),
});
export type CreateBankTransactionRuleInput = z.infer<typeof createBankTransactionRuleSchema>;

export const setBankTransactionCategorySchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES).nullable(),
});
export type SetBankTransactionCategoryInput = z.infer<typeof setBankTransactionCategorySchema>;

export const matchBankTransactionSchema = z
  .object({
    invoiceId: z.string().uuid().optional(),
    expenseId: z.string().uuid().optional(),
  })
  .refine((v) => !!v.invoiceId !== !!v.expenseId, {
    message: "Provide exactly one of invoiceId or expenseId",
  });
export type MatchBankTransactionInput = z.infer<typeof matchBankTransactionSchema>;
