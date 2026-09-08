import { Response } from "express";

interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  message: string;
}

export function sendSuccess<T>(res: Response, data: T, message = "Success", status = 200) {
  const response: ApiResponse<T> = {
    success: true,
    data,
    message,
  };
  return res.status(status).json(response);
}

export function sendError(res: Response, message: string, status = 400) {
  const response: ApiResponse<null> = {
    success: false,
    data: null,
    message,
  };
  return res.status(status).json(response);
}