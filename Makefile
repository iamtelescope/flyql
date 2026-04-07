e2e-viewer:
	cd e2e && make viewer
all: test
test:
	cd python && make test
	cd javascript && make test
	cd golang && make test
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
run-demo:
	cd demo && make dev
docs-install:
	cd docs && npm install
docs-build:
	cd docs && npm run build
docs-dev:
	cd docs && npm run dev
