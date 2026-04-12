from flyql.columns import parse, parse_to_json

# Parse basic columns (transformers disabled by default)
parsed = parse("message, status")
for col in parsed:
    print(f"{col.name} (display: {col.display_name!r}, segments: {col.segments})")

# Enable transformers via capabilities
with_transforms = parse(
    "message|chars(25) as msg, status", capabilities={"transformers": True}
)

# Or serialize directly to JSON for API responses
json_str = parse_to_json("message, status|upper", capabilities={"transformers": True})
print(json_str)
