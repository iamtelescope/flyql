class Key:
    def __init__(
        self,
        value: str,
    ):
        t = value.split(":")
        self.value = t[0]
        self.path = t[1:]
