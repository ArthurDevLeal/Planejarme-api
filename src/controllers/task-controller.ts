import { Request, Response } from "express";
import { BadRequestsException } from "../exceptions/bad-requests";
import { NotFoundException } from "../exceptions/not-found";
import { ErrorCode } from "../exceptions/root";
import { CreateTaskSchema, TaskIdSchema, UpdateTaskSchema, UserIdSchema } from "../schemas/task-schema";
import {
  CompleteTaskService,
  CreateTaskService,
  DeleteTaskService,
  FindPendingTasksByUserService,
  FindTaskByIdService,
  FindTasksByUserService,
  UpdateTaskService,
} from "../services/task-service";
import { sendSuccess } from "../utils/api-response";
import { ErrorHandler } from "../utils/error-handler";

export class TaskController {
  GetPendingTasksByUser = ErrorHandler(async (req: Request, res: Response) => {
    const result = UserIdSchema.safeParse(req.params);
    if (!result.success) throw new BadRequestsException("Invalid user id", ErrorCode.INVALID_DATA);
    return sendSuccess(res, await FindPendingTasksByUserService(result.data.userId));
  });

  GetTaskById = ErrorHandler(async (req: Request, res: Response) => {
    const result = TaskIdSchema.safeParse(req.params);
    if (!result.success) throw new BadRequestsException("Invalid task id", ErrorCode.INVALID_DATA);
    const task = await FindTaskByIdService(result.data.id);
    if (!task) throw new NotFoundException("Task not found", ErrorCode.INVALID_DATA);
    return sendSuccess(res, task);
  });

  GetTasksByUser = ErrorHandler(async (req: Request, res: Response) => {
    const result = UserIdSchema.safeParse(req.params);
    if (!result.success) throw new BadRequestsException("Invalid user id", ErrorCode.INVALID_DATA);
    return sendSuccess(res, await FindTasksByUserService(result.data.userId));
  });

  CreateTask = ErrorHandler(async (req: Request, res: Response) => {
    const result = CreateTaskSchema.safeParse(req.body);
    if (!result.success) throw new BadRequestsException("Invalid data", ErrorCode.INVALID_DATA);
    return sendSuccess(res, await CreateTaskService(result.data), "Task created", 201);
  });

  UpdateTask = ErrorHandler(async (req: Request, res: Response) => {
    const params = TaskIdSchema.safeParse(req.params);
    const body = UpdateTaskSchema.safeParse(req.body);
    if (!params.success || !body.success)
      throw new BadRequestsException("Invalid data", ErrorCode.INVALID_DATA);
    return sendSuccess(res, await UpdateTaskService(params.data.id, body.data), "Task updated");
  });

  CompleteTask = ErrorHandler(async (req: Request, res: Response) => {
    const result = TaskIdSchema.safeParse(req.params);
    if (!result.success) throw new BadRequestsException("Invalid task id", ErrorCode.INVALID_DATA);
    return sendSuccess(res, await CompleteTaskService(result.data.id), "Task completed");
  });

  DeleteTask = ErrorHandler(async (req: Request, res: Response) => {
    const result = TaskIdSchema.safeParse(req.params);
    if (!result.success) throw new BadRequestsException("Invalid task id", ErrorCode.INVALID_DATA);
    await DeleteTaskService(result.data.id);
    return sendSuccess(res, null, "Task deleted");
  });
}
