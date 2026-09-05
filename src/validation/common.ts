import { z } from "zod";

export const idSchema = z.string().trim().min(1);
export const currencySchema = z.string().trim().length(3).toUpperCase();
export const amountSubunitsSchema = z.number().int().nonnegative();
