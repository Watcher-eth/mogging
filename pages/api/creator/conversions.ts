import type { NextApiRequest, NextApiResponse } from "next";
import {
  ApiError,
  handleApiError,
  json,
  methodNotAllowed,
} from "@/lib/api/http";
import { getAuthSession } from "@/lib/auth/session";
import { getCreatorConversionReport } from "@/lib/creator/conversion-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
    const session = await getAuthSession(req, res);
    if (!session?.user?.id) throw new ApiError(401, "Authentication required");
    return json(res, 200, await getCreatorConversionReport(session.user.id));
  } catch (error) {
    return handleApiError(error, res);
  }
}
