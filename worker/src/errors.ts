export class AppError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status = 500) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
  }
}
