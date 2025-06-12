from typing import List


class Key:
    def __init__(
        self,
        value: str,
    ) -> None:
        t = value.split(":")
        self.value = t[0]
        self.path: List[str] = t[1:]
