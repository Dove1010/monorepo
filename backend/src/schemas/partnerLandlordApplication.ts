import { z } from "zod";

export const createPartnerLandlordApplicationSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phoneNumber: z.string().trim().min(7).max(30),
  email: z.string().trim().email(),
  propertyCount: z.coerce.number().int().positive().max(10000),
  propertyLocations: z.string().trim().min(2).max(300),
});

export type CreatePartnerLandlordApplicationRequest = z.infer<
  typeof createPartnerLandlordApplicationSchema
>;
