export class FlyqlError extends Error {
  constructor(message) {
    super(message);
    this.name = "FlyqlError";
  }
}

export class ParserError extends FlyqlError {
  constructor(message, errno) {
    super(message);
    this.errno = errno;
  }

  toString() {
    return this.message;
  }

  toRepresentation() {
    return this.toString();
  }
}
