export class ParserError extends Error {
    constructor(message, errno) {
        super(message)
        this.name = 'ParserError'
        this.message = message
        this.errno = errno
    }

    toString() {
        return this.message
    }
}
