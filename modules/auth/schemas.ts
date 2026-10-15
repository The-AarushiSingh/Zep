import { z } from "zod";

export const signInSchema = z.object({
  email: z.string(),
  password: z.string().min(8),
});

export const signUpSchema = z.object({
  name: z.string().min(1),
  email: z.string(),
  password: z.string().min(8),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
