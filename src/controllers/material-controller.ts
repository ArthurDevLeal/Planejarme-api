import { Request, Response } from "express";
import { BadRequestsException } from "../exceptions/bad-requests";
import { NotFoundException } from "../exceptions/not-found";
import { ErrorCode } from "../exceptions/root";
import {
  CreateMaterialSchema,
  DisciplineIdSchema,
  MaterialIdSchema,
  UpdateMaterialSchema,
} from "../schemas/material-schema";
import { UserIdSchema } from "../schemas/user-schema";
import {
  CreateMaterialService,
  DeleteMaterialService,
  FindMaterialByIdService,
  FindMaterialsByDisciplineService,
  FindMaterialsByUserService,
  UpdateMaterialService,
} from "../services/material-service";
import { sendSuccess } from "../utils/api-response";
import { ErrorHandler } from "../utils/error-handler";

export class MaterialController {
  GetMaterialsByUser = ErrorHandler(async (req: Request, res: Response) => {
    const result = UserIdSchema.safeParse(req.params);
    if (!result.success) throw new BadRequestsException("Invalid user id", ErrorCode.INVALID_DATA);
    return sendSuccess(res, await FindMaterialsByUserService(result.data.userId));
  });

  GetMaterialById = ErrorHandler(async (req: Request, res: Response) => {
    const result = MaterialIdSchema.safeParse(req.params);
    if (!result.success) throw new BadRequestsException("Invalid material id", ErrorCode.INVALID_DATA);
    const material = await FindMaterialByIdService(result.data.id);
    if (!material) throw new NotFoundException("Material not found", ErrorCode.INVALID_DATA);
    return sendSuccess(res, material);
  });

  GetMaterialsByDiscipline = ErrorHandler(async (req: Request, res: Response) => {
    const result = DisciplineIdSchema.safeParse(req.params);
    if (!result.success) throw new BadRequestsException("Invalid discipline id", ErrorCode.INVALID_DATA);
    return sendSuccess(res, await FindMaterialsByDisciplineService(result.data.disciplineId));
  });

  CreateMaterial = ErrorHandler(async (req: Request, res: Response) => {
    const result = CreateMaterialSchema.safeParse(req.body);
    if (!result.success) throw new BadRequestsException("Invalid data", ErrorCode.INVALID_DATA);
    return sendSuccess(res, await CreateMaterialService(result.data), "Material created", 201);
  });

  UpdateMaterial = ErrorHandler(async (req: Request, res: Response) => {
    const params = MaterialIdSchema.safeParse(req.params);
    const body = UpdateMaterialSchema.safeParse(req.body);
    if (!params.success || !body.success)
      throw new BadRequestsException("Invalid data", ErrorCode.INVALID_DATA);
    return sendSuccess(res, await UpdateMaterialService(params.data.id, body.data), "Material updated");
  });

  DeleteMaterial = ErrorHandler(async (req: Request, res: Response) => {
    const result = MaterialIdSchema.safeParse(req.params);
    if (!result.success) throw new BadRequestsException("Invalid material id", ErrorCode.INVALID_DATA);
    await DeleteMaterialService(result.data.id);
    return sendSuccess(res, null, "Material deleted");
  });
}
