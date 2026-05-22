import { Router, Request, Response } from "express";
import { z } from "zod";

export const routeRouter = Router();

const routeRequestSchema = z.object({
    fromToken: z.string(),
    toToken: z.string(),
    amountIn: z.string(),
    slippageToleranceBps: z.number().optional(),
    venueFilter: z.array(z.enum(["pharos_spn", "layerzero", "chainlink_ccip", "circle_cctp"])).optional()
});

routeRouter.post("/", async (req: Request, res: Response) => {
    try {
        const input = routeRequestSchema.parse(req.body);
        // Returns mock route
        res.json({ success: true, routes: [] });
    } catch (e) {
        res.status(400).json({ error: "Invalid parameters" });
    }
});
