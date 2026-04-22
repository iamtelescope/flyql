export class ParserError extends Error {
    constructor(message, errno, error = null) {
        super(message)
        this.name = 'ParserError'
        this.message = message
        this.errno = errno
        this.error = error
    }

    toString() {
        return this.message
    }
}
