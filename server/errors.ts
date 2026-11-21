import type { CodigoError, ErrorRespuesta } from "./schemas.ts";

export class ApiError extends Error {
  status: number;
  code: CodigoError;
  constructor(status: number, code: CodigoError, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const cuerpoError = (code: CodigoError, message: string): ErrorRespuesta => ({
  error: { code, message },
});
