from flyql import parse
from flyql.matcher import Evaluator, Record

result = parse("status = 200 and active")

data = {
    "status": 200,
    "active": True,
    "host": "prod-api-01",
}

evaluator = Evaluator()
matches = evaluator.evaluate(result.root, Record(data))
print(f"Matches: {matches}")  # True
