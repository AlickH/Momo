class AppError extends Error {
  constructor(message, { status = 500, code = 'internal', details } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function badRequest(message, details) {
  return new AppError(message, { status: 400, code: 'bad_request', details });
}

function notFound(message = '未找到') {
  return new AppError(message, { status: 404, code: 'not_found' });
}

function conflict(message) {
  return new AppError(message, { status: 409, code: 'conflict' });
}

function upstream(message, details) {
  return new AppError(message, { status: 502, code: 'upstream', details });
}

module.exports = { AppError, badRequest, notFound, conflict, upstream };
