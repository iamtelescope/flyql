all: test
test:
	cd python && make test
	cd javascript && make test
	cd golang && make test
test-ci:
	cd python && make install test
	cd javascript && make install test
	cd golang && make install test
e2e-ci:
	cd python && make install
	cd javascript && make install
	cd e2e && make test
fmt:
	cd python && make fmt
	cd javascript && make fmt
	cd golang && make fmt
	cd e2e-viewer && make fmt
lint:
	cd python && make lint
	cd golang && make lint
.PHONY: e2e e2e-run e2e-venv e2e-clean e2e-viewer
e2e:
	cd e2e && make run
e2e-run:
	cd e2e && make run
e2e-venv:
	cd e2e && make install
e2e-clean:
	cd e2e && make clean
e2e-viewer:
	cd e2e-viewer && E2E_REPORT_FILE=../e2e/output/report.json make dev
run-demo:
	cd demo && make dev
docs-install:
	cd docs && npm install
docs-build:
	cd docs && npm run build
docs-dev:
	cd docs && npm run dev
run-docs:
	cd docs && npm install && npm run dev

generate-errors:
	python3 errors/generate.py

.PHONY: generate-errors
