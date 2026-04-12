from flyql import parse

result = parse("status = 200 and active")
print(result.root)
