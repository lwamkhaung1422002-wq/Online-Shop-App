import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
): void {
  if (error instanceof Error && error.name === "NotFoundError") {
    response.status(404).json({ message: error.message });
    return;
  }

  if (error instanceof Error && error.name === "BadRequestError") {
    response.status(400).json({ message: error.message });
    return;
  }

  if (error instanceof ZodError) {
    response.status(400).json({
      message: "Validation error.",
      errors: error.flatten().fieldErrors,
    });
    return;
  }

  if (error instanceof Error) {
    response.status(500).json({ message: error.message });
    return;
  }

  response.status(500).json({ message: "Something went wrong." });
}
