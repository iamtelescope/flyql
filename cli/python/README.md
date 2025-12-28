# FlyQL Python CLI

Command-line interface for FlyQL query language.

## Setup

### 1. Create virtual environment

```bash
cd cli/python
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

## Usage

```bash
python flyqlcli.py [options]
```

### Options

| Option | Short | Description |
|--------|-------|-------------|
| `--query` | `-q` | FlyQL query string (required) |
| `--fields` | `-f` | JSON object with field definitions |
| `--generate` | `-g` | Generate code for target (supported: `clickhouse`) |
| `--evaluate` | `-e` | Evaluate query against JSON lines from stdin |
| `--parse` | `-p` | Parse query and output AST as JSON |

## Examples

### Parse query

```bash
python flyqlcli.py --query 'status=200 and active' --parse
```

### Generate ClickHouse SQL

```bash
python flyqlcli.py \
  --query 'status=200 and method="GET"' \
  --fields '{"status": {"type": "Int32"}, "method": {"type": "String"}}' \
  --generate clickhouse
```

Using fields from file:

```bash
python flyqlcli.py \
  --query 'status>=400 and error' \
  --fields "$(cat ../examples/fields.json)" \
  --generate clickhouse
```

### Filter JSON lines from stdin

```bash
cat ../examples/logs.jsonl | python flyqlcli.py --query 'status=200' --evaluate
```

```bash
cat ../examples/logs.jsonl | python flyqlcli.py --query 'error' --evaluate
```

```bash
cat ../examples/logs.jsonl | python flyqlcli.py \
  --query 'status in [500, 502, 503]' --evaluate
```
