import { Router, type Request, type Response, type NextFunction } from "express";
import { validate } from "../middleware/validate.js";
import { partnerLandlordApplicationStore } from "../models/partnerLandlordApplicationStore.js";
import { createPartnerLandlordApplicationSchema } from "../schemas/partnerLandlordApplication.js";

export function createPartnerLandlordApplicationsRouter(): Router {
  const router = Router();

  router.post(
    "/",
    validate(createPartnerLandlordApplicationSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const application = await partnerLandlordApplicationStore.create(req.body);
        res.status(201).json({
          success: true,
          data: {
            applicationId: application.applicationId,
            status: application.status,
            createdAt: application.createdAt,
          },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
