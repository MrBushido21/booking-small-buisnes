import { AuthEntity } from "../auth/entities/auth.entity"

declare global {
  namespace Express {
    interface Request {
      user?:AuthEntity
    }
  }
}
export {}