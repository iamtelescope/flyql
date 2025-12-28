# FlyQL Go CLI

Command-line interface for FlyQL query language.

## Setup

### Build from source

```bash
cd cli/golang
go build -o flyqlcli .
```

## Usage

```bash
./flyqlcli [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--query` | FlyQL query string (required) |
| `--fields` | JSON object with field definitions |
| `--generate` | Generate code for target (supported: `clickhouse`) |
| `--evaluate` | Evaluate query against JSON lines from stdin |
| `--parse` | Parse query and output AST as JSON |

## Examples

### Parse query

```bash
./flyqlcli --query 'status=200 and active' --parse
```

### Generate ClickHouse SQL

```bash
./flyqlcli \
  --query 'status=200 and method="GET"' \
  --fields '{"status": {"type": "Int32"}, "method": {"type": "String"}}' \
  --generate clickhouse
```

Using fields from file:

```bash
./flyqlcli \
  --query 'status>=400 and error' \
  --fields "$(cat ../examples/fields.json)" \
  --generate clickhouse
```

### Filter JSON lines from stdin

```bash
cat ../examples/logs.jsonl | ./flyqlcli --query 'status=200' --evaluate
```

```bash
cat ../examples/logs.jsonl | ./flyqlcli --query 'error' --evaluate
```

```bash
cat ../examples/logs.jsonl | ./flyqlcli \
  --query 'status in [500, 502, 503]' --evaluate
```
