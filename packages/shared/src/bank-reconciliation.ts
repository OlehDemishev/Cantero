import { z } from "zod";

export const matchBankTransactionSchema = z
  .object({
    invoiceId: z.string().uuid().optional(),
    expenseId: z.string().uuid().optional(),
  })
  .refine((v) => !!v.invoiceId !== !!v.expenseId, {
    message: "Provide exactly one of invoiceId or expenseId",
  });
export type MatchBankTransactionInput = z.infer<typeof matchBankTransactionSchema>;
