class ParserError(Exception):
    def __init__(self, message: str, errno: int):
        self.message = message
        self.errno = errno
        super().__init__(self.message)

    def __str__(self) -> str:
        return self.message

    def __repr__(self) -> str:
        return str(self)
