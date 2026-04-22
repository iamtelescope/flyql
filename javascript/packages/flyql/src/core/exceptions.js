export class FlyqlError extends Error {
    constructor(message) {
        super(message)
        this.name = 'FlyqlError'
    }
}

export class ParserError extends FlyqlError {
    constructor(message, errno, range = null, error = null) {
        super(message)
        this.errno = errno
        this.range = range
        this.error = error
    }

    toString() {
        return this.message
    }

    toRepresentation() {
        return this.toString()
    }
}

export class KeyParseError extends FlyqlError {
    constructor(message, range) {
        super(message)
        this.range = range
    }
}
