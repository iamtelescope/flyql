VERSION_FILE ?= versions/default.env
REPORT       := $(CURDIR)/report.html
LANGUAGES    ?= go

.PHONY: up down test-go test report run install clean

up:
	env $$(cat $(VERSION_FILE) | xargs) docker compose up -d --wait || (bash wait-for-dbs.sh)

down:
	docker compose down -v

install: .venv
	.venv/bin/pip install -q -r requirements.txt

.venv:
	python3 -m venv .venv

test-go:
	cd ../golang/e2e && E2E_REPORT_PATH=$(REPORT) go test -v -count=1 -vet=off ./...

test: up test-go down

run:
	.venv/bin/python3 runner.py --languages $(LANGUAGES) --output $(REPORT) --version-file $(VERSION_FILE) --down

report:
	open $(REPORT)

clean: down
	rm -f $(REPORT)
