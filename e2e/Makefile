VERSION_FILE ?= versions/default.env
JSON_REPORT  := $(CURDIR)/output/report.json
LANGUAGES    ?= go,javascript,python
DATABASES    ?= clickhouse,postgresql,starrocks
PYTHON       ?= python3

.PHONY: up down test-go test-js test-python test run install clean viewer

up:
	env $$(cat $(VERSION_FILE) | xargs) docker compose up -d --wait || (bash wait-for-dbs.sh)

down:
	docker compose down -v

install: .venv
	.venv/bin/pip install -q -r requirements.txt

.venv:
	python3 -m venv .venv

test-go:
	cd ../golang/e2e && E2E_REPORT_PATH=$(JSON_REPORT) go test -v -count=1 -vet=off ./...

test-js:
	cd ../javascript && npx vitest run --config vitest.e2e.config.js e2e/

test-python:
	cd ../python && $(PYTHON) -m pytest -v e2e/

test: up
	$(MAKE) -k test-go test-js test-python; rc=$$?; $(MAKE) down; exit $$rc

run:
	.venv/bin/python3 runner.py --languages $(LANGUAGES) --databases $(DATABASES) --json $(JSON_REPORT) --version-file $(VERSION_FILE) --down

viewer:
	cd ../e2e-viewer && E2E_REPORT_FILE=$(JSON_REPORT) make dev

clean: down
	rm -f $(JSON_REPORT)
